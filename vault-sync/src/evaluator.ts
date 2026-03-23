import { type QueuedObservation, type VaultSuggestion } from './types.js';

export interface EvaluationResult {
  suggestions: VaultSuggestion[];
  error?: string;
}

export async function evaluateObservations(
  observations: QueuedObservation[],
  claudeExecutablePath: string,
): Promise<EvaluationResult> {
  if (observations.length === 0) return { suggestions: [] };

  const observationsXml = observations
    .map(
      (obs, i) =>
        `  <observation index="${i}">
    <tool_name>${obs.tool_name}</tool_name>
    <tool_input>${obs.tool_input}</tool_input>
    <tool_response>${obs.tool_response}</tool_response>
  </observation>`
    )
    .join('\n');

  const prompt = `You are a knowledge vault curator. Review these tool use observations from a coding session and identify discoveries worth preserving as permanent team knowledge.

A vault note captures a reusable insight — something that saves time or prevents mistakes for any developer working on this codebase in the future. It is a claim-style assertion, NOT a session log.

<observations>
${observationsXml}
</observations>

For each vault-worthy discovery, assess:
- Reusability: Would another developer benefit from this in 3+ months?
- Non-obviousness: Did this require discovery, not just reading docs?
- Specificity: Can it be stated as a concrete, falsifiable claim?

Skip: routine file edits, simple configs, trivial bug fixes, tool noise.

Return a JSON array (no other text):
[
  {
    "title": "Claim-style title stating the insight",
    "content": "2-3 sentence explanation",
    "tags": ["architecture"],
    "confidence": 0.85
  }
]

If nothing is vault-worthy, return: []`;

  let queryFn: any = null;
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    process.stderr.write(`[vault-sync] SDK loaded, exports: ${Object.keys(sdk).join(', ')}\n`);
    queryFn = sdk.query;
    if (!queryFn) {
      const msg = `sdk.query is ${typeof queryFn} — SDK may have changed API`;
      process.stderr.write(`[vault-sync] ${msg}\n`);
      return { suggestions: [], error: msg };
    }
  } catch (err) {
    const msg = `Agent SDK not available: ${err}`;
    process.stderr.write(`[vault-sync] ${msg}\n`);
    return { suggestions: [], error: msg };
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

    process.stderr.write(`[vault-sync] calling sdk.query with ${observations.length} observations...\n`);
    let resultText = '';
    for await (const message of queryFn({ prompt, options })) {
      process.stderr.write(`[vault-sync] SDK message type: ${message.type}, subtype: ${(message as any).subtype ?? 'none'}\n`);
      if (message.type === 'result') {
        if ((message as any).subtype === 'success') {
          resultText = message.result;
        } else {
          // Error result from SDK (error_during_execution, error_max_turns, etc.)
          const errors = (message as any).errors ?? [];
          const subtype = (message as any).subtype ?? 'unknown';
          const msg = `SDK returned ${subtype}: ${errors.join('; ') || 'no details'}`;
          process.stderr.write(`[vault-sync] ${msg}\n`);
          return { suggestions: [], error: msg };
        }
      }
    }

    if (!resultText) {
      const msg = 'SDK returned no result text (generator yielded no result message)';
      process.stderr.write(`[vault-sync] ${msg}\n`);
      return { suggestions: [], error: msg };
    }

    process.stderr.write(`[vault-sync] SDK result (${resultText.length} chars): ${resultText.slice(0, 200)}\n`);

    // Strip markdown code fences if present
    const cleaned = resultText
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();

    const parsed: Array<{
      title: string;
      content: string;
      tags: string[];
      confidence: number;
    }> = JSON.parse(cleaned);

    return {
      suggestions: parsed.map((item) => ({
        title: item.title,
        content: item.content,
        tags: item.tags,
        confidence: item.confidence,
        evaluatedAt: Date.now(),
      })),
    };
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    const msg = `evaluation error: ${errObj.message}`;
    process.stderr.write(`[vault-sync] ${msg}\n`);
    if (errObj.stack) {
      process.stderr.write(`[vault-sync] stack: ${errObj.stack}\n`);
    }
    return { suggestions: [], error: msg };
  }
}
