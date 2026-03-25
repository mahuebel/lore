import { type ObservationCluster } from './clustering.js';
import { type QueuedObservation, type VaultSuggestion, type EvaluationOutput } from './types.js';
import { clusterObservations } from './clustering.js';

export interface ClusterEvaluationResult {
  output: EvaluationOutput | null;
  error?: string;
}

export interface EvaluationResult {
  results: ClusterEvaluationResult[];
  error?: string;
}

export interface SessionMetadata {
  branch: string;
  project: string;
  cwd: string;
}

export function buildExpansionPrompt(
  cluster: ObservationCluster,
  existingNotes: string[],
  metadata: SessionMetadata,
): string {
  const observationsXml = cluster.observations
    .map(
      (obs, i) =>
        `  <observation index="${i}">
    <tool_name>${obs.tool_name}</tool_name>
    <tool_input>${obs.tool_input}</tool_input>
    <tool_response>${obs.tool_response}</tool_response>
    <timestamp>${obs.timestamp}</timestamp>${obs.files?.length ? `\n    <files>${obs.files.join(', ')}</files>` : ''}
  </observation>`,
    )
    .join('\n');

  const toolsSummary = Object.entries(cluster.toolBreakdown)
    .map(([tool, count]) => `${tool} (${count})`)
    .join(', ');

  const existingNotesSection =
    existingNotes.length > 0
      ? `\n<existing_vault_notes>
${existingNotes.map((note, i) => `  <note index="${i}">\n${note}\n  </note>`).join('\n')}
</existing_vault_notes>

If any existing note already covers the same insight, return action "update" with the existingPath set to the note's file path (found in the note's frontmatter or first line). If the new observations add nothing beyond what an existing note says, return action "skip" with a skipReason.`
      : '';

  return `You are a knowledge vault curator producing structured, permanent notes from tool-use observations captured during a coding session.

<session_metadata>
  <project>${metadata.project}</project>
  <branch>${metadata.branch}</branch>
  <cwd>${metadata.cwd}</cwd>
  <files_touched>${cluster.primaryFiles.join(', ') || 'none'}</files_touched>
  <tools_used>${toolsSummary}</tools_used>
  <time_range>${new Date(cluster.timeRange.start).toISOString()} to ${new Date(cluster.timeRange.end).toISOString()}</time_range>
</session_metadata>

<observations>
${observationsXml}
</observations>
${existingNotesSection}

Analyze these observations and determine whether they contain a vault-worthy insight. A vault note captures a reusable insight — something that saves time or prevents mistakes for any developer working on this codebase in the future. It is a claim-style assertion, NOT a session log.

Assessment criteria:
- Reusability: Would another developer benefit from this in 3+ months?
- Non-obviousness: Did this require discovery, not just reading docs?
- Specificity: Can it be stated as a concrete, falsifiable claim?

Skip: routine file edits, simple configs, trivial bug fixes, tool noise, standard library usage.

If the observations contain a vault-worthy insight, produce a structured note with these sections:

## Problem Context
1-2 sentences describing the situation or need that led to this discovery.

## Key Insight
1-2 sentences capturing the core non-obvious finding. This should be a claim, not a description.

## Technical Details
Bullet points with specific implementation details, gotchas, or constraints. Reference actual file paths, function names, or config keys where applicable.

Return ONLY a JSON object (no other text, no markdown fences):
{
  "action": "create" | "update" | "skip",
  "title": "Claim-style title stating the insight",
  "content": "The full structured markdown note with ## sections as described above",
  "tags": ["relevant", "tags"],
  "project": "${metadata.project}",
  "branch": "${metadata.branch}",
  "confidence": 0.0 to 1.0,
  "existingPath": "path/to/note.md (only if action is update)",
  "skipReason": "reason (only if action is skip)"
}`;
}

export async function expandCluster(
  cluster: ObservationCluster,
  existingNotes: string[],
  metadata: SessionMetadata,
  claudeExecutablePath: string,
): Promise<ClusterEvaluationResult> {
  const prompt = buildExpansionPrompt(cluster, existingNotes, metadata);

  let queryFn: any = null;
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    queryFn = sdk.query;
    if (!queryFn) {
      const msg = `sdk.query is ${typeof queryFn} — SDK may have changed API`;
      process.stderr.write(`[vault-sync] ${msg}\n`);
      return { output: null, error: msg };
    }
  } catch (err) {
    const msg = `Agent SDK not available: ${err}`;
    process.stderr.write(`[vault-sync] ${msg}\n`);
    return { output: null, error: msg };
  }

  try {
    const options = {
      pathToClaudeCodeExecutable: claudeExecutablePath,
      persistSession: false,
      disallowedTools: [
        'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebFetch', 'WebSearch', 'Agent', 'TodoWrite',
        'NotebookEdit', 'AskUserQuestion',
      ],
    };

    process.stderr.write(
      `[vault-sync] expanding cluster: ${cluster.primaryFiles.slice(0, 3).join(', ')} (${cluster.observations.length} obs)\n`,
    );

    let resultText = '';
    for await (const message of queryFn({ prompt, options })) {
      if (message.type === 'result') {
        if ((message as any).subtype === 'success') {
          resultText = message.result;
        } else {
          const errors = (message as any).errors ?? [];
          const subtype = (message as any).subtype ?? 'unknown';
          const msg = `SDK returned ${subtype}: ${errors.join('; ') || 'no details'}`;
          process.stderr.write(`[vault-sync] ${msg}\n`);
          return { output: null, error: msg };
        }
      }
    }

    if (!resultText) {
      const msg = 'SDK returned no result text';
      process.stderr.write(`[vault-sync] ${msg}\n`);
      return { output: null, error: msg };
    }

    process.stderr.write(
      `[vault-sync] cluster result (${resultText.length} chars): ${resultText.slice(0, 200)}\n`,
    );

    // Strip markdown code fences if present
    const cleaned = resultText
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();

    const parsed: EvaluationOutput = JSON.parse(cleaned);

    // Validate: if action=update but no existingPath, fall back to create
    if (parsed.action === 'update' && !parsed.existingPath) {
      process.stderr.write(
        `[vault-sync] update action missing existingPath, falling back to create\n`,
      );
      parsed.action = 'create';
    }

    if (parsed.action === 'skip') {
      process.stderr.write(
        `[vault-sync] cluster skipped: ${parsed.skipReason || 'no reason given'}\n`,
      );
    }

    return { output: parsed };
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    const msg = `expansion error: ${errObj.message}`;
    process.stderr.write(`[vault-sync] ${msg}\n`);
    if (errObj.stack) {
      process.stderr.write(`[vault-sync] stack: ${errObj.stack}\n`);
    }
    return { output: null, error: msg };
  }
}

function extractSearchTerms(primaryFiles: string[]): string[] {
  const terms = new Set<string>();
  for (const filepath of primaryFiles) {
    const parts = filepath.split('/');
    const filename = parts.pop() || '';
    // Add filename stem (without extension)
    const stem = filename.replace(/\.[^.]+$/, '');
    if (stem && stem.length > 2) {
      terms.add(stem);
    }
    // Add parent directory name
    const dir = parts.pop();
    if (dir && dir.length > 2) {
      terms.add(dir);
    }
  }
  return [...terms];
}

export async function evaluateClusters(
  clusters: ObservationCluster[],
  claudeExecutablePath: string,
  searchVault: (query: string) => Promise<string[]>,
  metadata: SessionMetadata,
): Promise<EvaluationResult> {
  const results: ClusterEvaluationResult[] = [];

  for (const cluster of clusters) {
    try {
      // Extract search terms from primary files
      const searchTerms = extractSearchTerms(cluster.primaryFiles);
      let existingNotes: string[] = [];

      if (searchTerms.length > 0) {
        const query = searchTerms.join(' ');
        process.stderr.write(`[vault-sync] searching vault for: ${query}\n`);
        try {
          existingNotes = await searchVault(query);
        } catch (err) {
          process.stderr.write(
            `[vault-sync] vault search failed (continuing without): ${err}\n`,
          );
        }
      }

      const result = await expandCluster(
        cluster,
        existingNotes,
        metadata,
        claudeExecutablePath,
      );
      results.push(result);
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      process.stderr.write(
        `[vault-sync] cluster evaluation failed: ${errObj.message}\n`,
      );
      results.push({ output: null, error: errObj.message });
    }
  }

  return { results };
}

/**
 * Legacy wrapper — bridges the old daemon API to the new cluster pipeline.
 * Will be removed once the daemon is updated (Task 5).
 * @deprecated Use evaluateClusters() instead.
 */
export async function evaluateObservations(
  observations: QueuedObservation[],
  claudeExecutablePath: string,
): Promise<{ suggestions: VaultSuggestion[]; error?: string }> {
  if (observations.length === 0) return { suggestions: [] };

  const clusters = clusterObservations(observations);
  if (clusters.length === 0) return { suggestions: [] };

  const metadata: SessionMetadata = {
    branch: 'unknown',
    project: 'unknown',
    cwd: observations[0].cwd || process.cwd(),
  };

  // No vault search in legacy mode
  const noopSearch = async (_q: string): Promise<string[]> => [];
  const { results, error } = await evaluateClusters(clusters, claudeExecutablePath, noopSearch, metadata);

  const suggestions: VaultSuggestion[] = [];
  const errors: string[] = error ? [error] : [];

  for (const r of results) {
    if (r.error) errors.push(r.error);
    if (r.output && r.output.action !== 'skip') {
      suggestions.push({
        title: r.output.title,
        content: r.output.content,
        tags: r.output.tags,
        confidence: r.output.confidence,
        evaluatedAt: Date.now(),
      });
    }
  }

  return {
    suggestions,
    ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
  };
}
