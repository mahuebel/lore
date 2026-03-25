# Two-Phase Evaluation with Vault-Aware Note Creation

**Date:** 2026-03-24
**Status:** Draft
**Scope:** vault-sync evaluation pipeline refactor

## Problem

The current evaluation pipeline produces thin, poorly structured vault notes because:

1. **Flat observation list** — The evaluator sees 50 truncated tool calls with no narrative thread. It can't distinguish a coherent debugging session from noise.
2. **Thin output schema** — The prompt asks for "2-3 sentence explanation," producing notes far below the quality of manually created `/vault-note` output.
3. **Bypasses vault-mcp** — Auto-promoted notes are written directly to the vault root via `writeFileSync`, skipping folder placement (`getPlacementDir`), frontmatter validation, and git sync.
4. **No vault awareness** — The evaluator doesn't know what's already in the vault, creating overlapping notes about the same topic across sessions.
5. **Truncated context** — PostToolUse truncates tool inputs/outputs to 2000 chars, losing the detail needed for rich notes.

## Design

### Phase 1: Deterministic Clustering (in-process, no AI cost)

When the Stop hook triggers evaluation, cluster observations before any SDK call:

1. **Sort observations by timestamp**
2. **Cluster by file proximity + time gaps:**
   - Observations touching the same file(s) within 2 minutes → same cluster
   - Gap > 5 minutes between consecutive observations → new cluster
   - Merge clusters sharing 2+ files
3. **Filter noise:** Drop clusters with only 1 observation that is a Write of a config/lock file (e.g., `package-lock.json`, `.gitignore`, `tsconfig.json`). Note: Read observations are already filtered at capture time by PostToolUse's `SKIP_TOOLS` set, so Read-only clusters cannot occur.
4. **Cap at 8 clusters** — rank by `score = uniqueFiles * 2 + observationCount`, take the top 8

**File extraction:** To cluster by file proximity, observations need structured file information. Add a `files: string[]` field to `QueuedObservation`, populated at capture time in the PostToolUse hook by parsing `tool_input`:
- **Edit/Write:** Extract `file_path` parameter
- **Bash:** Extract file paths from the command string (best-effort regex for common patterns)
- **MultiEdit/NotebookEdit:** Extract file path parameter
- If no files can be extracted, the observation is assigned to a "misc" bucket and clustered only by time proximity.

**Output type:**

```typescript
interface ObservationCluster {
  observations: QueuedObservation[];
  primaryFiles: string[];      // most-touched files
  timeRange: { start: number; end: number };
  toolBreakdown: Record<string, number>; // e.g. { Edit: 3, Bash: 2 }
}
```

### Phase 2: AI Expansion (one SDK call per cluster)

For each surviving cluster:

#### Step 2a: Search existing vault

Extract search terms from the cluster's `primaryFiles` (filename stems, parent directory names, deduplicated). Run multiple `vault-search` calls if needed — the current implementation does case-insensitive substring matching, so each search should use a single meaningful term (e.g., `evaluator`, `daemon`, `discharge-instruction`) rather than a compound query.

Example: A cluster touching `src/evaluator.ts` and `src/daemon.ts` would search for `evaluator` and `daemon` separately, deduplicating results.

#### Step 2b: Expansion prompt

Build a rich prompt containing:

- **Full observations** from the cluster (captured at 8000 chars per field, no further truncation at evaluation time)
- **Matching vault notes** (titles + content snippets from 2a)
- **Session metadata:** branch name, project name (derived from `.lore/config.json` `project` field, or the cwd directory name as fallback), working directory
- **Structured output instructions** — produce a note with sections (Problem Context, Key Insight, Technical Details, etc.), not a 2-3 sentence blurb

#### Step 2c: Output schema

```typescript
interface EvaluationOutput {
  action: 'create' | 'update' | 'skip';
  existingPath?: string;        // required for 'update' action
  title: string;
  content: string;              // markdown with sections
  tags: string[];
  project: string;
  branch: string;
  confidence: number;
  skipReason?: string;          // for 'skip' action
}
```

**Validation:** If the model returns `action: 'update'` but `existingPath` is missing or empty, fall back to `action: 'create'`.

The expansion prompt instructs the model to:

- **Create** when the cluster reveals a genuinely new insight not in the vault
- **Update** when the cluster adds meaningful new context to an existing note
- **Skip** when the insight is already well-captured, trivial, or not vault-worthy

### Phase 3: Route through vault-mcp

Instead of `promoteToVault()` writing files directly, import vault-mcp functions directly (same monorepo). All write operations use the `withGitSync` wrapper from `vault-mcp/src/index.ts` to ensure git pull before write and commit/push after.

| Action | Function | Behavior |
|--------|----------|----------|
| Create | `createNote` wrapped with `withGitSync` | Folder placement via `getPlacementDir`, frontmatter validation, git sync |
| Update | `updateNote` wrapped with `withGitSync` | Revises existing note content, git sync |
| Skip | Log only | No file written, reason recorded in session history |

**Duplicate filename handling:** If `createNoteFile` throws "Note already exists," catch the error and retry with a `-2` suffix appended to the filename. If that also exists, increment to `-3`, up to `-5`, then fall back to storing as a pending suggestion.

Auto-promote threshold (>= 0.75 confidence) still applies. Below-threshold results are stored as pending suggestions with the richer content for manual review on the dashboard.

### Concurrency guard

The daemon must reject concurrent evaluations. If `evalStatus.state === 'evaluating'` when `/evaluate` is called, queue the new observations back into `state.observations` and return `{ queued: true, reason: 'evaluation in progress' }` instead of starting a second evaluation. The queued observations will be picked up on the next session's evaluation.

### Changes to observation capture

- Increase truncation limit in PostToolUse from 2000 to 8000 chars per field
- Add `files: string[]` field to `QueuedObservation`, populated by parsing `tool_input` at capture time

### Partial failure handling

Each cluster is evaluated independently. If cluster 1 succeeds (note created) and cluster 2 fails (SDK error), the note from cluster 1 stands. Session history records per-cluster outcomes:

```typescript
interface ClusterResult {
  action: 'create' | 'update' | 'skip' | 'error';
  title?: string;
  path?: string;
  error?: string;
  confidence?: number;
}

// SessionRecord gains:
clusters?: ClusterResult[];
```

### Dashboard updates

Minor updates needed to render richer content:
- Pending suggestions card: render markdown content (sections, headers) instead of plain text
- Session history: show cluster breakdown (e.g., "3 clusters → 1 created, 1 updated, 1 skipped")

### Unchanged components

- `/vault-note` skill (already the quality gold standard)
- Promote/dismiss flow for sub-threshold suggestions
- Daemon health endpoint and version management

## Architecture

```
PostToolUse hook
  → parse files from tool_input
  → daemon /observations (8000 char limit, files[] field)
  → in-memory queue

Stop hook
  → daemon /evaluate
  → Concurrency check (reject if already evaluating)
  → Phase 1: clusterObservations() — deterministic, in-process
  → Phase 2: for each cluster (independent, partial failures OK):
      → vault-search (per-term, deduplicated results)
      → SDK query() with cluster + vault context + session metadata
      → validate output (fix missing existingPath, etc.)
  → Phase 3: for each result with confidence >= 0.75:
      → action=create: createNote + withGitSync (retry on duplicate filename)
      → action=update: updateNote + withGitSync
      → action=skip: log reason
  → Below-threshold results → pending suggestions
  → Write session history with per-cluster breakdown
```

## Files to modify

| File | Change |
|------|--------|
| `src/evaluator.ts` | Replace single-pass evaluation with two-phase (cluster + expand). New `clusterObservations()` and `extractFiles()` functions. New expansion prompt. New output schema with validation. |
| `src/daemon.ts` | Update `evaluateInBackground` to handle new return types and per-cluster results. Replace `promoteToVault()` with direct vault-mcp function imports using `withGitSync`. Add concurrency guard. |
| `src/hooks/post-tool-use.ts` | Increase truncation limit from 2000 to 8000 chars. Add `files` extraction from `tool_input`. |
| `src/types.ts` | Add `ObservationCluster`, `EvaluationOutput`, `ClusterResult` types. Add `files: string[]` to `QueuedObservation`. Update `SessionRecord` with `clusters` field. |
| `ui/dashboard.html` | Render markdown in suggestion content. Show cluster breakdown in session history. |

## Token cost estimate

Current: 1 SDK call per session (cheap, bad output)
New: 1-8 SDK calls per session (one per cluster) + 1-8 vault-search calls (local, no API cost)

For a typical session producing 3 clusters, this is ~3x the current token cost but produces dramatically better output. Clusters with no vault-worthy content are identified quickly (the model returns `action: skip`), so wasted expansion calls should be rare.

## Success criteria

- Auto-promoted notes should be structurally comparable to `/vault-note` output (sections, context, technical detail)
- Notes placed in appropriate vault subdirectories (knowledge/architecture, knowledge/debugging, etc.)
- Existing vault notes are updated rather than duplicated when the same topic recurs
- Session history records cluster count, create/update/skip breakdown per cluster
- No duplicate notes created from filename collisions
- Concurrent evaluations handled gracefully (queued, not lost)
