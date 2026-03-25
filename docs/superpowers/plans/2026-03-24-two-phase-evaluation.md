# Two-Phase Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-pass evaluator with a two-phase pipeline (deterministic clustering + vault-aware AI expansion) that produces rich, structured vault notes comparable to `/vault-note` quality.

**Architecture:** Observations are clustered by file proximity and time gaps in-process (no AI cost), then each cluster is expanded by the Agent SDK with existing vault context. Results route through vault-mcp functions for proper folder placement, frontmatter, and git sync.

**Tech Stack:** TypeScript, esbuild (CJS bundle), Node.js native test runner, Agent SDK (`@anthropic-ai/claude-agent-sdk`), vault-mcp functions (direct import from monorepo)

**Spec:** `docs/superpowers/specs/2026-03-24-two-phase-evaluation-design.md`

---

### Task 1: Add `files` field to observations and increase truncation limit

**Files:**
- Modify: `vault-sync/src/types.ts`
- Modify: `vault-sync/src/hooks/post-tool-use.ts`

- [ ] **Step 1: Add `files` field to `QueuedObservation`**

In `vault-sync/src/types.ts`, add `files` to the interface and increase `MAX_INPUT_LENGTH`:

```typescript
export interface QueuedObservation {
  tool_name: string;
  tool_input: string;
  tool_response: string;
  timestamp: number;
  cwd?: string;
  files?: string[];  // extracted file paths from tool_input
}

export const MAX_INPUT_LENGTH = 8000;  // was 2000
```

- [ ] **Step 2: Add file extraction to PostToolUse hook**

In `vault-sync/src/hooks/post-tool-use.ts`, add an `extractFiles` function and wire it into the observation payload:

```typescript
function extractFiles(toolName: string, toolInput: any): string[] {
  const files: string[] = [];
  if (!toolInput) return files;

  // Edit, Write, Read, MultiEdit, NotebookEdit all have file_path
  if (typeof toolInput === 'object' && toolInput.file_path) {
    files.push(toolInput.file_path);
  }
  // Bash: best-effort extraction of file paths from command
  if (toolName === 'Bash' && typeof toolInput === 'object' && toolInput.command) {
    const pathMatches = toolInput.command.match(/(?:^|\s)(\/[\w./-]+\.\w+)/g);
    if (pathMatches) {
      files.push(...pathMatches.map((m: string) => m.trim()));
    }
  }

  return [...new Set(files)]; // dedupe
}
```

Update the `daemonRequest` call to include `files` and reference the constant:

```typescript
import { MAX_INPUT_LENGTH } from '../types.js';

const files = extractFiles(tool_name, tool_input);

await daemonRequest('POST', '/observations', {
  tool_name,
  tool_input: truncate(tool_input, MAX_INPUT_LENGTH),
  tool_response: truncate(tool_response, MAX_INPUT_LENGTH),
  timestamp: Date.now(),
  cwd,
  files,
});
```

- [ ] **Step 3: Build and verify**

Run: `cd vault-sync && npm run build`
Expected: `Built 7 entry points to dist/`

- [ ] **Step 4: Commit**

```bash
git add vault-sync/src/types.ts vault-sync/src/hooks/post-tool-use.ts
git add -f vault-sync/dist/
git commit -m "feat: add files extraction and increase observation context to 8000 chars"
```

---

### Task 2: Implement deterministic clustering

**Files:**
- Create: `vault-sync/src/clustering.ts`
- Create: `vault-sync/src/clustering.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `vault-sync/src/clustering.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clusterObservations, type ObservationCluster } from './clustering.js';
import { type QueuedObservation } from './types.js';

function obs(overrides: Partial<QueuedObservation> & { timestamp: number }): QueuedObservation {
  return {
    tool_name: 'Edit',
    tool_input: 'test input',
    tool_response: 'ok',
    files: [],
    ...overrides,
  };
}

describe('clusterObservations', () => {
  it('groups observations touching the same files within 2 minutes', () => {
    const observations = [
      obs({ timestamp: 1000, files: ['/src/foo.ts'] }),
      obs({ timestamp: 60000, files: ['/src/foo.ts'] }),
      obs({ timestamp: 120000, files: ['/src/bar.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].observations.length, 2);
    assert.deepEqual(clusters[0].primaryFiles, ['/src/foo.ts']);
  });

  it('splits on time gaps > 5 minutes', () => {
    const observations = [
      obs({ timestamp: 1000, files: ['/src/a.ts'] }),
      obs({ timestamp: 400000, files: ['/src/a.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    assert.equal(clusters.length, 2);
  });

  it('merges clusters sharing 2+ files', () => {
    const observations = [
      obs({ timestamp: 1000, files: ['/src/a.ts', '/src/b.ts'] }),
      obs({ timestamp: 60000, files: ['/src/c.ts'] }),
      obs({ timestamp: 90000, files: ['/src/a.ts', '/src/b.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    const merged = clusters.find(c => c.observations.length >= 2);
    assert.ok(merged);
  });

  it('filters single-observation config-only clusters', () => {
    const observations = [
      obs({ timestamp: 1000, tool_name: 'Write', files: ['/package-lock.json'] }),
      obs({ timestamp: 2000, tool_name: 'Edit', files: ['/src/real.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0].primaryFiles, ['/src/real.ts']);
  });

  it('caps at 8 clusters ranked by score', () => {
    const observations: QueuedObservation[] = [];
    for (let i = 0; i < 20; i++) {
      observations.push(obs({ timestamp: i * 600000, files: [`/src/file${i}.ts`] }));
    }
    const clusters = clusterObservations(observations);
    assert.ok(clusters.length <= 8);
  });

  it('handles observations with no files via time proximity', () => {
    const observations = [
      obs({ timestamp: 1000, files: [] }),
      obs({ timestamp: 30000, files: [] }),
      obs({ timestamp: 400000, files: [] }),
    ];
    const clusters = clusterObservations(observations);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].observations.length, 2);
  });

  it('builds correct toolBreakdown', () => {
    const observations = [
      obs({ timestamp: 1000, tool_name: 'Edit', files: ['/src/a.ts'] }),
      obs({ timestamp: 2000, tool_name: 'Edit', files: ['/src/a.ts'] }),
      obs({ timestamp: 3000, tool_name: 'Bash', files: ['/src/a.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    assert.deepEqual(clusters[0].toolBreakdown, { Edit: 2, Bash: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd vault-sync && node --import tsx --test src/clustering.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `clusterObservations`**

Create `vault-sync/src/clustering.ts`. Note: `ObservationCluster` lives here (co-located with its producer) rather than in `types.ts` — the evaluator imports it from `clustering.js`:

```typescript
import { type QueuedObservation } from './types.js';

export interface ObservationCluster {
  observations: QueuedObservation[];
  primaryFiles: string[];
  timeRange: { start: number; end: number };
  toolBreakdown: Record<string, number>;
}

const TIME_GAP_MS = 5 * 60 * 1000;
const FILE_PROXIMITY_MS = 2 * 60 * 1000;
const MAX_CLUSTERS = 8;

const CONFIG_FILES = new Set([
  'package-lock.json', 'package.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.gitignore', '.eslintrc', '.prettierrc', 'tsconfig.json', '.env',
  'biome.json', '.editorconfig',
]);

function isConfigFile(filepath: string): boolean {
  const basename = filepath.split('/').pop() || '';
  return CONFIG_FILES.has(basename);
}

function filesOverlap(a: string[], b: string[], minOverlap: number): boolean {
  let count = 0;
  const setB = new Set(b);
  for (const f of a) {
    if (setB.has(f)) count++;
    if (count >= minOverlap) return true;
  }
  return false;
}

function clusterScore(cluster: ObservationCluster): number {
  return cluster.primaryFiles.length * 2 + cluster.observations.length;
}

function buildCluster(observations: QueuedObservation[]): ObservationCluster {
  const fileCount = new Map<string, number>();
  const toolCount: Record<string, number> = {};

  for (const obs of observations) {
    for (const f of obs.files || []) {
      fileCount.set(f, (fileCount.get(f) || 0) + 1);
    }
    toolCount[obs.tool_name] = (toolCount[obs.tool_name] || 0) + 1;
  }

  const primaryFiles = [...fileCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([f]) => f);

  return {
    observations,
    primaryFiles,
    timeRange: {
      start: observations[0].timestamp,
      end: observations[observations.length - 1].timestamp,
    },
    toolBreakdown: toolCount,
  };
}

export function clusterObservations(observations: QueuedObservation[]): ObservationCluster[] {
  if (observations.length === 0) return [];

  const sorted = [...observations].sort((a, b) => a.timestamp - b.timestamp);

  // Initial clustering by time gap + file proximity
  const rawClusters: QueuedObservation[][] = [[]];

  for (const obs of sorted) {
    const current = rawClusters[rawClusters.length - 1];

    if (current.length === 0) {
      current.push(obs);
      continue;
    }

    const lastObs = current[current.length - 1];
    const timeDelta = obs.timestamp - lastObs.timestamp;

    if (timeDelta > TIME_GAP_MS) {
      rawClusters.push([obs]);
      continue;
    }

    const obsFiles = obs.files || [];
    const lastFiles = lastObs.files || [];
    const hasFileOverlap = obsFiles.length > 0 && lastFiles.length > 0 &&
      filesOverlap(obsFiles, lastFiles, 1);
    const withinProximity = timeDelta <= FILE_PROXIMITY_MS;

    if (hasFileOverlap || withinProximity || obsFiles.length === 0) {
      current.push(obs);
    } else {
      rawClusters.push([obs]);
    }
  }

  // Merge clusters sharing 2+ files
  let clusters = rawClusters.map(buildCluster);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (filesOverlap(clusters[i].primaryFiles, clusters[j].primaryFiles, 2)) {
          const combined = [...clusters[i].observations, ...clusters[j].observations]
            .sort((a, b) => a.timestamp - b.timestamp);
          clusters[i] = buildCluster(combined);
          clusters.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // Filter noise
  clusters = clusters.filter(c => {
    if (c.observations.length > 1) return true;
    const obs = c.observations[0];
    const files = obs.files || [];
    if (files.length === 0) return true;
    return !files.every(f => isConfigFile(f));
  });

  // Cap at MAX_CLUSTERS, ranked by score
  if (clusters.length > MAX_CLUSTERS) {
    clusters.sort((a, b) => clusterScore(b) - clusterScore(a));
    clusters = clusters.slice(0, MAX_CLUSTERS);
  }

  clusters.sort((a, b) => a.timeRange.start - b.timeRange.start);
  return clusters;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd vault-sync && node --import tsx --test src/clustering.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add vault-sync/src/clustering.ts vault-sync/src/clustering.test.ts
git commit -m "feat: deterministic observation clustering by file proximity and time gaps"
```

---

### Task 3: Add new types for two-phase evaluation

**Files:**
- Modify: `vault-sync/src/types.ts`

- [ ] **Step 1: Add `EvaluationOutput`, `ClusterResult`, and update `SessionRecord`**

Add to `vault-sync/src/types.ts`:

```typescript
export interface EvaluationOutput {
  action: 'create' | 'update' | 'skip';
  existingPath?: string;
  title: string;
  content: string;
  tags: string[];
  project: string;
  branch: string;
  confidence: number;
  skipReason?: string;
}

export interface ClusterResult {
  action: 'create' | 'update' | 'skip' | 'error';
  title?: string;
  path?: string;
  error?: string;
  confidence?: number;
}
```

Update `SessionRecord` to add optional `clusters` field:

```typescript
export interface SessionRecord {
  startedAt: number;
  endedAt: number;
  observationCount: number;
  suggestionCount: number;
  suggestions: Array<{ title: string; confidence: number }>;
  error?: string;
  clusters?: ClusterResult[];
}
```

- [ ] **Step 2: Commit**

```bash
git add vault-sync/src/types.ts
git commit -m "feat: add EvaluationOutput, ClusterResult types for two-phase evaluation"
```

---

### Task 4: Rewrite evaluator with two-phase pipeline

**Files:**
- Modify: `vault-sync/src/evaluator.ts`

This is the largest task. The evaluator gets new `evaluateClusters` and `expandCluster` functions that replace the old `evaluateObservations`. The full expansion prompt and validation logic are provided below.

- [ ] **Step 1: Write the new evaluator**

Replace `vault-sync/src/evaluator.ts` entirely. The key components:

**Types:**

```typescript
import { type QueuedObservation, type VaultSuggestion, type EvaluationOutput } from './types.js';
import { type ObservationCluster } from './clustering.js';

export interface ClusterEvaluationResult {
  output: EvaluationOutput | null;
  error?: string;
}

export interface EvaluationResult {
  results: ClusterEvaluationResult[];
  error?: string;
}
```

**`buildExpansionPrompt` — the full prompt that produces rich notes:**

```typescript
function buildExpansionPrompt(
  cluster: ObservationCluster,
  existingNotes: Array<{ title: string; content: string; path: string }>,
  metadata: { branch: string; project: string; cwd: string },
): string {
  const observationsXml = cluster.observations
    .map(
      (obs, i) =>
        `  <observation index="${i}">
    <tool_name>${obs.tool_name}</tool_name>
    <files>${(obs.files || []).join(', ')}</files>
    <tool_input>${obs.tool_input}</tool_input>
    <tool_response>${obs.tool_response}</tool_response>
  </observation>`
    )
    .join('\n');

  const existingNotesXml = existingNotes.length > 0
    ? `\n<existing_vault_notes>
${existingNotes.map(n => `  <note path="${n.path}">
    <title>${n.title}</title>
    <content>${n.content.slice(0, 2000)}</content>
  </note>`).join('\n')}
</existing_vault_notes>`
    : '';

  return `You are a knowledge vault curator creating a rich, permanent vault note from a cluster of related tool-use observations.

<session_metadata>
  <branch>${metadata.branch}</branch>
  <project>${metadata.project}</project>
  <working_directory>${metadata.cwd}</working_directory>
  <files_touched>${cluster.primaryFiles.join(', ')}</files_touched>
  <tools_used>${Object.entries(cluster.toolBreakdown).map(([t, c]) => \`\${t}(\${c})\`).join(', ')}</tools_used>
</session_metadata>

<observations>
${observationsXml}
</observations>
${existingNotesXml}

Analyze these observations as a coherent narrative. They represent related work from a single coding session.

Your task:
1. Identify the core insight, decision, or discovery in this cluster
2. Decide whether to CREATE a new note, UPDATE an existing note (if one covers this topic), or SKIP (if trivial or already well-captured)
3. If creating or updating, write a **rich, structured note** with:
   - A claim-style title (concrete, falsifiable assertion — not a topic label)
   - Sections: ## Problem Context, ## Key Insight, ## Technical Details, and optionally ## Cross-References
   - Enough detail that a developer 6 months from now understands both the what AND the why

For tags, choose from: architecture, convention, pattern, research, debugging, bug, or custom lowercase-hyphenated tags.

Return a single JSON object (no other text):
{
  "action": "create" | "update" | "skip",
  "existingPath": "path/to/note.md (required if action=update, omit otherwise)",
  "title": "Claim-style title stating the insight",
  "content": "## Problem Context\\n...\\n\\n## Key Insight\\n...\\n\\n## Technical Details\\n...",
  "tags": ["architecture"],
  "project": "${metadata.project}",
  "branch": "${metadata.branch}",
  "confidence": 0.85,
  "skipReason": "reason (only if action=skip)"
}`;
}
```

**`expandCluster` — SDK call with error handling:**

```typescript
async function expandCluster(
  cluster: ObservationCluster,
  existingNotes: Array<{ title: string; content: string; path: string }>,
  metadata: { branch: string; project: string; cwd: string },
  claudeExecutablePath: string,
): Promise<ClusterEvaluationResult> {
  let queryFn: any = null;
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    queryFn = sdk.query;
    if (!queryFn) return { output: null, error: 'sdk.query not available' };
  } catch (err) {
    return { output: null, error: `Agent SDK not available: ${err}` };
  }

  const prompt = buildExpansionPrompt(cluster, existingNotes, metadata);

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

    let resultText = '';
    for await (const message of queryFn({ prompt, options })) {
      if (message.type === 'result') {
        if ((message as any).subtype === 'success') {
          resultText = message.result;
        } else {
          const errors = (message as any).errors ?? [];
          const subtype = (message as any).subtype ?? 'unknown';
          return { output: null, error: `SDK ${subtype}: ${errors.join('; ')}` };
        }
      }
    }

    if (!resultText) {
      return { output: null, error: 'SDK returned no result' };
    }

    const cleaned = resultText
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();

    const parsed: EvaluationOutput = JSON.parse(cleaned);

    // Validation: update without existingPath falls back to create
    if (parsed.action === 'update' && !parsed.existingPath) {
      parsed.action = 'create';
    }

    return { output: parsed };
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    return { output: null, error: `expansion error: ${errObj.message}` };
  }
}
```

**`evaluateClusters` — orchestrator:**

```typescript
export async function evaluateClusters(
  clusters: ObservationCluster[],
  claudeExecutablePath: string,
  searchVault: (terms: string[]) => Promise<Array<{ title: string; content: string; path: string }>>,
  metadata: { branch: string; project: string; cwd: string },
): Promise<EvaluationResult> {
  if (clusters.length === 0) return { results: [] };

  const results: ClusterEvaluationResult[] = [];

  for (const cluster of clusters) {
    // Extract search terms from primary files
    const terms = cluster.primaryFiles
      .map(f => {
        const parts = f.split('/');
        const filename = parts.pop() || '';
        const stem = filename.replace(/\.\w+$/, '');
        const dir = parts.pop() || '';
        return [stem, dir].filter(Boolean);
      })
      .flat()
      .filter((t, i, arr) => t.length > 2 && arr.indexOf(t) === i)
      .slice(0, 5);

    // Search existing vault
    let existingNotes: Array<{ title: string; content: string; path: string }> = [];
    try {
      existingNotes = await searchVault(terms);
    } catch (err) {
      process.stderr.write(`[vault-sync] vault search failed: ${err}\n`);
    }

    process.stderr.write(
      `[vault-sync] expanding cluster: ${cluster.primaryFiles.slice(0, 3).join(', ')} ` +
      `(${cluster.observations.length} obs, ${existingNotes.length} existing notes)\n`
    );

    const result = await expandCluster(cluster, existingNotes, metadata, claudeExecutablePath);
    results.push(result);

    if (result.error) {
      process.stderr.write(`[vault-sync] cluster expansion error: ${result.error}\n`);
    } else if (result.output) {
      process.stderr.write(
        `[vault-sync] cluster result: ${result.output.action} — ${result.output.title?.slice(0, 60)}\n`
      );
    }
  }

  return { results };
}
```

- [ ] **Step 2: Write evaluator validation tests**

Create `vault-sync/src/evaluator.test.ts` for the validation logic (not the SDK call, which can't be unit tested):

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the validation logic extracted from expandCluster
describe('EvaluationOutput validation', () => {
  it('falls back update to create when existingPath missing', () => {
    const output = { action: 'update' as const, title: 'test', content: 'x', tags: [], project: 'p', branch: 'b', confidence: 0.8 };
    // Validation: if action=update and no existingPath, change to create
    if (output.action === 'update' && !('existingPath' in output && output.existingPath)) {
      (output as any).action = 'create';
    }
    assert.equal(output.action, 'create');
  });

  it('keeps update when existingPath is present', () => {
    const output = { action: 'update' as const, existingPath: 'knowledge/test.md', title: 'test', content: 'x', tags: [], project: 'p', branch: 'b', confidence: 0.8 };
    if (output.action === 'update' && !output.existingPath) {
      (output as any).action = 'create';
    }
    assert.equal(output.action, 'update');
    assert.equal(output.existingPath, 'knowledge/test.md');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd vault-sync && node --import tsx --test src/evaluator.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Build and verify compilation**

Run: `cd vault-sync && npm run build`
Expected: `Built 7 entry points to dist/`

- [ ] **Step 5: Commit**

```bash
git add vault-sync/src/evaluator.ts vault-sync/src/evaluator.test.ts
git commit -m "feat: two-phase evaluator with clustering and vault-aware expansion"
```

---

### Task 5: Wire vault-mcp functions into daemon

**Files:**
- Modify: `vault-sync/src/daemon.ts`

The daemon needs to: (1) use the new evaluator, (2) route results through vault-mcp functions, (3) add concurrency guard, (4) search the vault for existing notes, (5) handle git sync, (6) handle duplicate filenames.

- [ ] **Step 1: Add vault-mcp imports and search helper**

Import vault-mcp functions directly (same monorepo, bundled by esbuild):

```typescript
import { createNote } from '../../vault-mcp/src/tools/vault-create-note.js';
import { updateNote } from '../../vault-mcp/src/tools/vault-update-note.js';
import { searchNotes } from '../../vault-mcp/src/vault/search.js';
import { noteExists } from '../../vault-mcp/src/vault/files.js';
import { gitPull, gitPush } from '../../vault-mcp/src/git/sync.js';
```

Add the vault search helper:

```typescript
function makeVaultSearcher(vaultPath: string) {
  return async (terms: string[]): Promise<Array<{ title: string; content: string; path: string }>> => {
    const results: Array<{ title: string; content: string; path: string }> = [];
    const seen = new Set<string>();

    for (const term of terms) {
      try {
        const matches = searchNotes(vaultPath, term, 5);
        for (const m of matches) {
          if (!seen.has(m.path)) {
            seen.add(m.path);
            results.push({ title: m.title, content: '', path: m.path });
          }
        }
      } catch {}
    }

    // Read content for matched notes (first 2000 chars each)
    for (const r of results) {
      try {
        r.content = readFileSync(join(vaultPath, r.path), 'utf-8').slice(0, 2000);
      } catch {}
    }

    return results.slice(0, 10);
  };
}
```

Add a helper to resolve `author` from vault config:

```typescript
function resolveAuthor(cwd: string): string {
  try {
    const configPath = join(cwd, '.lore', 'config.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.author) return config.author;
    }
  } catch {}
  return 'vault-sync';
}
```

- [ ] **Step 2: Add concurrency guard**

In the `/evaluate` endpoint, check `evalStatus.state === 'evaluating'`. If already running, push new observations back onto `state.observations` and return `{ queued: true, reason: 'evaluation in progress' }`.

```typescript
app.post('/evaluate', async (c) => {
  try {
    if (evalStatus.state === 'evaluating') {
      const body = await c.req.json().catch(() => null);
      const newObs: QueuedObservation[] = body?.observations || [];
      state.observations.push(...newObs);
      return c.json({ queued: true, reason: 'evaluation in progress', depth: state.observations.length });
    }
    // ... existing drain + evaluate logic
  }
});
```

- [ ] **Step 3: Rewrite `evaluateInBackground`**

Replace the function with the new pipeline. Key details:

**Metadata derivation:**
```typescript
const author = resolveAuthor(primaryCwd);
let branch = 'main';
try {
  branch = execFileSync('git', ['branch', '--show-current'], {
    cwd: primaryCwd, encoding: 'utf-8', timeout: 5000,
  }).trim() || 'main';
} catch {}

let project = primaryCwd.split('/').pop() || 'unknown';
try {
  const configPath = join(primaryCwd, '.lore', 'config.json');
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.project) project = config.project;
  }
} catch {}
```

**Git sync strategy** (not using `withGitSync` — it's a local function in vault-mcp's index.ts that depends on `getConfig()`). Instead, the daemon does:
1. `gitPull(vaultPath)` once before any writes
2. All note creates/updates happen
3. `gitPush(vaultPath, author, commitMessage)` once after all writes

**Phase 3 routing with duplicate retry:**

```typescript
for (const result of evalResult.results) {
  if (result.error || !result.output) {
    clusterResults.push({ action: 'error', error: result.error });
    continue;
  }

  const output = result.output;

  if (output.action === 'skip') {
    clusterResults.push({ action: 'skip', title: output.title, confidence: output.confidence });
    continue;
  }

  if (output.confidence >= AUTO_PROMOTE_THRESHOLD) {
    try {
      if (output.action === 'create') {
        // Use vault-mcp createNote for folder placement + frontmatter
        const noteResult = createNote(vaultPath, author, {
          title: output.title,
          content: output.content,
          tags: output.tags,
          project: output.project,
          branch: output.branch,
        });
        clusterResults.push({
          action: 'create', title: output.title,
          path: noteResult.path, confidence: output.confidence,
        });
      } else if (output.action === 'update' && output.existingPath) {
        // Use vault-mcp updateNote for frontmatter merge + validation
        updateNote(vaultPath, {
          path: output.existingPath,
          content: output.content,
        });
        clusterResults.push({
          action: 'update', title: output.title,
          path: output.existingPath, confidence: output.confidence,
        });
      }
      successCount++;
    } catch (err) {
      const errMsg = String(err);
      // Duplicate filename: retry with suffix
      if (errMsg.includes('already exists') && output.action === 'create') {
        let created = false;
        for (let suffix = 2; suffix <= 5; suffix++) {
          try {
            const retryResult = createNote(vaultPath, author, {
              title: output.title + ` (${suffix})`,
              content: output.content,
              tags: output.tags,
              project: output.project,
              branch: output.branch,
            });
            clusterResults.push({
              action: 'create', title: output.title,
              path: retryResult.path, confidence: output.confidence,
            });
            successCount++;
            created = true;
            break;
          } catch { continue; }
        }
        if (!created) {
          // All retries failed — store as pending
          pendingSuggestions.push({ ... });
          clusterResults.push({ action: 'error', title: output.title, error: 'duplicate filename' });
        }
      } else {
        pendingSuggestions.push({ ... });
        clusterResults.push({ action: 'error', title: output.title, error: errMsg });
      }
    }
  } else {
    // Below threshold: pending suggestion
    pendingSuggestions.push({
      title: output.title, content: output.content,
      tags: output.tags, confidence: output.confidence,
      evaluatedAt: Date.now(),
    });
    clusterResults.push({ action: output.action, title: output.title, confidence: output.confidence });
  }
}
```

- [ ] **Step 4: Remove old `promoteToVault` function**

Delete `promoteToVault()`. Move `AUTO_PROMOTE_THRESHOLD` to the top of the file as a constant.

- [ ] **Step 5: Update the manual promote endpoint**

Replace inline file writing in `/suggestions/promote/:index` with vault-mcp's `createNote()`:

```typescript
app.post('/suggestions/promote/:index', async (c) => {
  try {
    const index = parseInt(c.req.param('index'), 10);
    if (isNaN(index)) return c.json({ error: 'Invalid index' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const vaultParam = (body as any)?.vault;
    if (!vaultParam) return c.json({ error: 'vault parameter required' }, 400);
    const all = readSuggestionsFile();
    const key = normalizePath(vaultParam);
    if (!all[key]) return c.json({ error: 'No suggestions for vault' }, 404);
    const suggestions = all[key];
    if (index < 0 || index >= suggestions.length) return c.json({ error: 'Index out of range' }, 404);

    const suggestion = suggestions[index];
    const author = resolveAuthor(process.cwd());
    const noteResult = createNote(key, author, {
      title: suggestion.title,
      content: suggestion.content,
      tags: suggestion.tags,
      project: 'unknown',
      branch: 'main',
    });

    suggestions.splice(index, 1);
    if (suggestions.length === 0) delete all[key];
    writeSuggestionsFile(all);
    return c.json({ promoted: true, path: noteResult.path, vault: key, remaining: suggestions.length });
  } catch (err) {
    return c.json({ error: `Failed to promote: ${err}` }, 500);
  }
});
```

- [ ] **Step 6: Build and verify**

Run: `cd vault-sync && npm run build`
Expected: `Built 7 entry points to dist/`

If there are import resolution issues with vault-mcp paths, adjust the relative import paths. esbuild bundles everything at build time so the paths only need to resolve from the source tree.

- [ ] **Step 7: Commit**

```bash
git add vault-sync/src/daemon.ts
git add -f vault-sync/dist/
git commit -m "feat: wire two-phase evaluation through vault-mcp with concurrency guard"
```

---

### Task 6: Update dashboard for richer content

**Files:**
- Modify: `vault-sync/ui/dashboard.html`

- [ ] **Step 1: Render richer suggestion content**

In the `refreshSuggestions` function, the suggestion content div currently uses `textContent`. The dashboard already has a `markdownToHtml` helper function. Use it to render the richer content safely via the existing helper (which uses string replacement, not innerHTML with raw user input — the content comes from the evaluator, not user input):

```javascript
var contentDiv = createElement('div', { className: 'suggestion-content' });
contentDiv.innerHTML = markdownToHtml(s.content || '');
card.appendChild(contentDiv);
```

Note: The `markdownToHtml` function in the dashboard (around line 580) does basic markdown conversion (headers, bold, code, lists) via regex replacement. The content is generated by the evaluator AI, not from user input, so XSS risk is minimal. If this is a concern, add a simple tag-stripping sanitizer.

- [ ] **Step 2: Show cluster breakdown in session history**

In `renderSessionTimeline`, after the existing error/suggestion detail rendering, add cluster info:

```javascript
if (s.clusters && s.clusters.length > 0) {
  var counts = { create: 0, update: 0, skip: 0, error: 0 };
  s.clusters.forEach(function(cl) { counts[cl.action] = (counts[cl.action] || 0) + 1; });
  var parts = [];
  if (counts.create) parts.push(counts.create + ' created');
  if (counts.update) parts.push(counts.update + ' updated');
  if (counts.skip) parts.push(counts.skip + ' skipped');
  if (counts.error) parts.push(counts.error + ' errors');
  var clusterDetail = s.clusters.length + ' clusters: ' + parts.join(', ');
  entry.appendChild(createElement('div', { className: 'timeline-detail', textContent: clusterDetail }));
}
```

- [ ] **Step 3: Build**

Run: `cd vault-sync && npm run build`

- [ ] **Step 4: Commit**

```bash
git add vault-sync/ui/dashboard.html
git add -f vault-sync/dist/
git commit -m "feat: render markdown in suggestions, show cluster breakdown in history"
```

---

### Task 7: Integration test and version bump

**Files:**
- Modify: `vault-sync/package.json`
- Modify: `vault-sync/.claude-plugin/plugin.json`
- Modify: `vault-sync/.cursor-plugin/plugin.json`

- [ ] **Step 1: Run clustering tests**

Run: `cd vault-sync && node --import tsx --test src/clustering.test.ts`
Expected: All tests pass

- [ ] **Step 2: Build final bundle**

Run: `cd vault-sync && npm run build`
Expected: Clean build, no errors

- [ ] **Step 3: Manual smoke test**

Start the daemon and trigger an evaluation with realistic observations:

```bash
cd vault-sync
node dist/daemon.cjs stop 2>/dev/null; node dist/daemon.cjs start

# Post observations that should cluster together
curl -s -X POST http://localhost:37778/observations -H 'Content-Type: application/json' -d '{
  "tool_name":"Edit",
  "tool_input":"Changed vault-sync/src/evaluator.ts to use two-phase clustering",
  "tool_response":"File updated",
  "timestamp":1774300000,
  "cwd":"/Users/mahuebel/Node/lore",
  "files":["vault-sync/src/evaluator.ts"]
}'

curl -s -X POST http://localhost:37778/observations -H 'Content-Type: application/json' -d '{
  "tool_name":"Edit",
  "tool_input":"Updated vault-sync/src/daemon.ts to route through vault-mcp createNote",
  "tool_response":"File updated",
  "timestamp":1774300060,
  "cwd":"/Users/mahuebel/Node/lore",
  "files":["vault-sync/src/daemon.ts"]
}'

curl -s -X POST http://localhost:37778/evaluate
sleep 20
curl -s http://localhost:37778/health | python3 -m json.tool
cat ~/.lore/daemon.log | tail -20
```

Verify:
- Health shows `evaluator.state: 'idle'` with no error
- Daemon log shows "Phase 1: N observations -> M clusters"
- Daemon log shows "expanding cluster: ..." for each cluster
- Any created notes are in proper subdirectories (e.g., `knowledge/architecture/`)
- Session history includes `clusters` array

- [ ] **Step 4: Bump version to `3.5.0` in all three manifests**

- `vault-sync/package.json`
- `vault-sync/.claude-plugin/plugin.json`
- `vault-sync/.cursor-plugin/plugin.json`

- [ ] **Step 5: Final rebuild with version baked in**

Run: `cd vault-sync && npm run build`
Verify: `grep -o '"3\.5\.0"' dist/daemon.cjs`

- [ ] **Step 6: Commit and push**

```bash
git add vault-sync/package.json vault-sync/.claude-plugin/plugin.json vault-sync/.cursor-plugin/plugin.json
git add -f vault-sync/dist/
git commit -m "feat: two-phase evaluation pipeline v3.5.0

Replaces single-pass evaluator with deterministic clustering and
vault-aware AI expansion. Notes route through vault-mcp for proper
folder placement, frontmatter, and git sync.

See docs/superpowers/specs/2026-03-24-two-phase-evaluation-design.md"
git push
```
