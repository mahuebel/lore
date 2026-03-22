# Vault Sync Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a web dashboard served by the vault-sync daemon that shows system status, vault contents, and diagnostics at `localhost:37778`.

**Architecture:** Single self-contained HTML file served by the existing Hono daemon. New API endpoints on the daemon proxy vault reads, git status, and hook/session history. Hooks write heartbeat and session records to `~/.lore/` JSON files.

**Tech Stack:** TypeScript (daemon/hooks), vanilla HTML/CSS/JS (dashboard), Hono (HTTP server), esbuild (build)

**Spec:** `docs/superpowers/specs/2026-03-21-vault-sync-dashboard-design.md`

---

### Task 1: Add new types

**Files:**
- Modify: `vault-sync/src/types.ts`

- [ ] **Step 1: Add SessionRecord and HookHeartbeat types**

```typescript
export interface SessionRecord {
  startedAt: number;
  endedAt: number;
  observationCount: number;
  suggestionCount: number;
  suggestions: Array<{ title: string; confidence: number }>;
}

export interface HookHeartbeat {
  lastFiredAt: number;
  success: boolean;
  error?: string;
}

export const HOOK_STATUS_FILE = `${LORE_DIR}/hook-status.json`;
export const SESSION_HISTORY_FILE = `${LORE_DIR}/session-history.json`;
```

Append these after the existing `SUGGESTIONS_FILE` export at the bottom of `vault-sync/src/types.ts`.

- [ ] **Step 2: Verify build**

Run: `cd vault-sync && node build.js`
Expected: `Built 7 entry points to dist/`

- [ ] **Step 3: Commit**

```bash
git add vault-sync/src/types.ts
git commit -m "feat(dashboard): add SessionRecord and HookHeartbeat types"
```

---

### Task 2: Create hook heartbeat utility

**Files:**
- Create: `vault-sync/src/hook-heartbeat.ts`

- [ ] **Step 1: Create writeHookStatus function**

Create `vault-sync/src/hook-heartbeat.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { type HookHeartbeat, LORE_DIR, HOOK_STATUS_FILE } from './types.js';

export function writeHookStatus(hookName: string, status: HookHeartbeat): void {
  try {
    mkdirSync(LORE_DIR, { recursive: true });

    let existing: Record<string, HookHeartbeat> = {};
    try {
      existing = JSON.parse(readFileSync(HOOK_STATUS_FILE, 'utf-8'));
    } catch {
      // missing or corrupt, start fresh
    }

    existing[hookName] = status;

    // Atomic write: write to temp, then rename
    const tmpFile = `${HOOK_STATUS_FILE}.tmp`;
    writeFileSync(tmpFile, JSON.stringify(existing, null, 2));
    renameSync(tmpFile, HOOK_STATUS_FILE);
  } catch {
    // Never let heartbeat writing break a hook
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd vault-sync && node build.js`
Expected: `Built 7 entry points to dist/`

- [ ] **Step 3: Commit**

```bash
git add vault-sync/src/hook-heartbeat.ts
git commit -m "feat(dashboard): add hook heartbeat utility"
```

---

### Task 3: Add heartbeat to all TypeScript hooks

**Files:**
- Modify: `vault-sync/src/hooks/session-start.ts`
- Modify: `vault-sync/src/hooks/post-tool-use.ts`
- Modify: `vault-sync/src/hooks/user-prompt-submit.ts`
- Modify: `vault-sync/src/hooks/stop.ts`
- Modify: `vault-sync/src/hooks/session-end.ts`

Each hook wraps its `main()` logic with heartbeat calls. The pattern is the same for all 5:

- [ ] **Step 1: Add heartbeat to session-start.ts**

Add import at top:
```typescript
import { writeHookStatus } from '../hook-heartbeat.js';
```

Wrap the existing `try` block inside `main()` so that on success the heartbeat writes `success: true`, and the catch writes `success: false`. Place the heartbeat write at the **start** of the try block (so we record that the hook fired even if it errors partway through):

In `session-start.ts`, update `main()`:
```typescript
async function main() {
  try {
    writeHookStatus('SessionStart', { lastFiredAt: Date.now(), success: true });
    // ... existing logic unchanged ...
  } catch {
    writeHookStatus('SessionStart', { lastFiredAt: Date.now(), success: false, error: 'unknown' });
    output({});
  }
}
```

- [ ] **Step 2: Add heartbeat to post-tool-use.ts**

Same pattern. Add import, wrap `main()`:
```typescript
import { writeHookStatus } from '../hook-heartbeat.js';
```
In the try block at the top:
```typescript
writeHookStatus('PostToolUse', { lastFiredAt: Date.now(), success: true });
```
In the catch:
```typescript
writeHookStatus('PostToolUse', { lastFiredAt: Date.now(), success: false, error: 'unknown' });
```

- [ ] **Step 3: Add heartbeat to user-prompt-submit.ts**

Same pattern with `'UserPromptSubmit'` as the hook name.

- [ ] **Step 4: Add heartbeat to stop.ts**

Same pattern with `'Stop'` as the hook name. The existing catch block in `stop.ts` already has `err` available:
```typescript
writeHookStatus('Stop', { lastFiredAt: Date.now(), success: false, error: String(err) });
```

- [ ] **Step 5: Add heartbeat to session-end.ts**

`session-end.ts` is currently just `output({})`. Add heartbeat before it:
```typescript
import { writeHookStatus } from '../hook-heartbeat.js';
import { output } from './utils.js';

writeHookStatus('SessionEnd', { lastFiredAt: Date.now(), success: true });
output({});
```

- [ ] **Step 6: Add heartbeat to smart-install.js (Setup hook)**

In `vault-sync/scripts/smart-install.js`, add heartbeat writing directly (plain JS, no import of the TS utility). Add after the `pluginRoot` declaration:

```javascript
import { homedir } from 'os';

const LORE_DIR = join(homedir(), '.lore');
const HOOK_STATUS_FILE = join(LORE_DIR, 'hook-status.json');

function writeSetupHeartbeat(success, error) {
  try {
    mkdirSync(LORE_DIR, { recursive: true });
    let existing = {};
    try { existing = JSON.parse(readFileSync(HOOK_STATUS_FILE, 'utf-8')); } catch {}
    existing['Setup'] = { lastFiredAt: Date.now(), success, error };
    const tmp = HOOK_STATUS_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(existing, null, 2));
    renameSync(tmp, HOOK_STATUS_FILE);
  } catch {}
}
```

Note: The existing `fs` import in `smart-install.js` is `import { existsSync, statSync, readdirSync } from 'fs';` — add `readFileSync`, `writeFileSync`, `mkdirSync`, and `renameSync` to it. Add `homedir` from `os`. `join` from `path` is already imported.

Then call `writeSetupHeartbeat(true)` at the end of the try block (after the build check), and `writeSetupHeartbeat(false, err.message)` in the catch block.

- [ ] **Step 7: Verify build**

Run: `cd vault-sync && node build.js`
Expected: `Built 7 entry points to dist/`

- [ ] **Step 8: Commit**

```bash
git add vault-sync/src/hooks/ vault-sync/scripts/smart-install.js
git commit -m "feat(dashboard): add heartbeat to all hooks"
```

---

### Task 4: Add session history writing to Stop hook

**Files:**
- Modify: `vault-sync/src/hooks/stop.ts`

- [ ] **Step 1: Add session history writing**

Add imports at top of `stop.ts`:
```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { type SessionRecord, LORE_DIR, SESSION_HISTORY_FILE } from '../types.js';
```

After the suggestion-saving block (after `process.stderr.write(...vault suggestions saved...)`) and before `output({ ok: true })`, add:

```typescript
// Write session history record
try {
  const healthResp = await daemonRequest('GET', '/health');
  const record: SessionRecord = {
    startedAt: healthResp?.startedAt || Date.now(),
    endedAt: Date.now(),
    observationCount: observations.length,
    suggestionCount: suggestions.length,
    suggestions: suggestions.map(s => ({ title: s.title, confidence: s.confidence })),
  };

  mkdirSync(LORE_DIR, { recursive: true });
  let history: SessionRecord[] = [];
  try {
    if (existsSync(SESSION_HISTORY_FILE)) {
      history = JSON.parse(readFileSync(SESSION_HISTORY_FILE, 'utf-8'));
    }
  } catch {}

  history.push(record);
  // Keep last 50 sessions
  if (history.length > 50) history = history.slice(-50);

  const tmp = SESSION_HISTORY_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(history, null, 2));
  renameSync(tmp, SESSION_HISTORY_FILE);
} catch (histErr) {
  process.stderr.write(`[vault-sync] session history write error: ${histErr}\n`);
}
```

Note: the `GET /health` endpoint will be updated in Task 6 to include `startedAt`. For now, fall back to `Date.now()` if not available.

- [ ] **Step 2: Verify build**

Run: `cd vault-sync && node build.js`
Expected: `Built 7 entry points to dist/`

- [ ] **Step 3: Commit**

```bash
git add vault-sync/src/hooks/stop.ts
git commit -m "feat(dashboard): write session history on stop"
```

---

### Task 5: Create vault-reader utility

**Files:**
- Create: `vault-sync/src/vault-reader.ts`

This extracts and expands the frontmatter parsing from `vault-context.ts` for reuse in the daemon. The daemon needs more metadata than `vault-context.ts` currently parses (tags, branch, created date).

- [ ] **Step 1: Create vault-reader.ts**

Create `vault-sync/src/vault-reader.ts`:

```typescript
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';

export interface VaultNote {
  path: string;       // relative path within vault
  title: string;
  status: string;     // 'established' | 'exploratory'
  tags: string[];
  project: string;
  branch: string;
  created: string;    // ISO date or raw string from frontmatter
  excerpt: string;    // first 200 chars of body
  body: string;       // full markdown body (only populated for detail reads)
}

const SKIP_PATTERNS = ['.obsidian', '.git', 'README.md', '.vault-mcp.json', '.gitkeep', 'sessions'];

function shouldSkip(name: string): boolean {
  return SKIP_PATTERNS.includes(name);
}

export function parseFrontmatter(content: string): {
  title: string;
  status: string;
  tags: string[];
  project: string;
  branch: string;
  created: string;
  body: string;
} {
  const result = { title: '', status: '', tags: [] as string[], project: '', branch: '', created: '', body: content };

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) return result;

  const fm = fmMatch[1];
  result.body = fmMatch[2];

  const titleMatch = fm.match(/^title:\s*(.+)$/m);
  if (titleMatch) result.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');

  const statusMatch = fm.match(/^status:\s*(.+)$/m);
  if (statusMatch) result.status = statusMatch[1].trim();

  const projectMatch = fm.match(/^project:\s*(.+)$/m);
  if (projectMatch) result.project = projectMatch[1].trim();

  const branchMatch = fm.match(/^branch:\s*(.+)$/m);
  if (branchMatch) result.branch = branchMatch[1].trim();

  const createdMatch = fm.match(/^created:\s*(.+)$/m);
  if (createdMatch) result.created = createdMatch[1].trim();

  // Tags: handle both `tags: [a, b]` and `tags:\n  - a\n  - b`
  const tagsInline = fm.match(/^tags:\s*\[([^\]]*)\]/m);
  if (tagsInline) {
    result.tags = tagsInline[1].split(',').map(t => t.trim()).filter(Boolean);
  } else {
    const tagsBlock = fm.match(/^tags:\s*\n((?:\s+-\s+.+\n?)*)/m);
    if (tagsBlock) {
      result.tags = tagsBlock[1].match(/-\s+(.+)/g)?.map(m => m.replace(/^-\s+/, '').trim()) || [];
    }
  }

  return result;
}

function collectMdFiles(dir: string, relBase: string = '', depth: number = 0): Array<{ fullPath: string; relPath: string }> {
  if (depth > 5) return [];
  const results: Array<{ fullPath: string; relPath: string }> = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkip(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        results.push(...collectMdFiles(fullPath, relPath, depth + 1));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push({ fullPath, relPath });
      }
    }
  } catch {
    // permission error or missing, skip
  }

  return results;
}

export function listVaultNotes(vaultPath: string, filters?: {
  status?: string;
  tag?: string;
  project?: string;
  branch?: string;
  q?: string;
}): Omit<VaultNote, 'body'>[] {
  const files = collectMdFiles(vaultPath);
  const notes: Omit<VaultNote, 'body'>[] = [];

  for (const { fullPath, relPath } of files) {
    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = parseFrontmatter(content);
    const title = parsed.title || basename(relPath, '.md');

    // Apply filters
    if (filters?.status && parsed.status !== filters.status) continue;
    if (filters?.tag && !parsed.tags.includes(filters.tag)) continue;
    if (filters?.project && parsed.project !== filters.project) continue;
    if (filters?.branch && parsed.branch !== filters.branch) continue;
    if (filters?.q) {
      const q = filters.q.toLowerCase();
      const searchable = `${title} ${parsed.body}`.toLowerCase();
      if (!searchable.includes(q)) continue;
    }

    notes.push({
      path: relPath,
      title,
      status: parsed.status,
      tags: parsed.tags,
      project: parsed.project,
      branch: parsed.branch,
      created: parsed.created,
      excerpt: parsed.body.trim().slice(0, 200),
    });
  }

  return notes;
}

export function readVaultNote(vaultPath: string, notePath: string): VaultNote | null {
  try {
    const fullPath = join(vaultPath, notePath);
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = parseFrontmatter(content);

    return {
      path: notePath,
      title: parsed.title || basename(notePath, '.md'),
      status: parsed.status,
      tags: parsed.tags,
      project: parsed.project,
      branch: parsed.branch,
      created: parsed.created,
      excerpt: parsed.body.trim().slice(0, 200),
      body: parsed.body,
    };
  } catch {
    return null;
  }
}

export function resolveVaultPath(): string | null {
  // 1. Environment variable
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;

  // 2. Common locations for .vault-mcp.json
  const homeDir = process.env.HOME || '/tmp';
  const candidates = [
    join(homeDir, '.lore', 'vault'),
    join(homeDir, 'vault'),
  ];

  for (const candidate of candidates) {
    try {
      const configPath = join(candidate, '.vault-mcp.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.vault_path) return config.vault_path;
    } catch {
      // try next
    }
  }

  // 3. Fallback
  const fallback = join(homeDir, '.lore', 'vault');
  try {
    statSync(fallback);
    return fallback;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd vault-sync && node build.js`
Expected: `Built 7 entry points to dist/`

- [ ] **Step 3: Commit**

```bash
git add vault-sync/src/vault-reader.ts
git commit -m "feat(dashboard): add vault filesystem reader"
```

---

### Task 6: Add new daemon endpoints

**Files:**
- Modify: `vault-sync/src/daemon.ts`

This is the largest task. Add all new API endpoints to the daemon.

- [ ] **Step 1: Add imports**

At the top of `daemon.ts`, add to the existing imports:

```typescript
import { statSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';
import {
  type SessionRecord,
  type HookHeartbeat,
  HOOK_STATUS_FILE,
  SESSION_HISTORY_FILE,
} from './types.js';
import { listVaultNotes, readVaultNote, resolveVaultPath } from './vault-reader.js';
```

Note: `daemon.ts` already imports `spawn as cpSpawn` from `child_process` — add `execFileSync` to that import. It already imports several things from `fs` — add `statSync`. It does NOT currently import `join` from `path` — add it.

- [ ] **Step 2: Add `pid` and `startedAt` to health endpoint**

Modify the existing `/health` handler (line 34-41 of `daemon.ts`):

```typescript
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    mode: state.mode,
    uptime: Date.now() - state.startedAt,
    startedAt: state.startedAt,
    queueDepth: state.observations.length,
    pid: process.pid,
  });
});
```

- [ ] **Step 3: Add GET / to serve dashboard HTML**

Add before the other routes (after `const app = new Hono();`):

```typescript
app.get('/', (c) => {
  try {
    // __dirname is available because esbuild outputs CJS format
    const dashboardPath = join(__dirname, 'ui', 'dashboard.html');
    const html = readFileSync(dashboardPath, 'utf-8');
    return c.html(html);
  } catch {
    return c.text('Dashboard not found. Run the build script to generate it.', 404);
  }
});
```

- [ ] **Step 4: Add DELETE /suggestions/:index endpoint**

Add after the existing `POST /suggestions/dismiss` handler (after line 141):

```typescript
app.delete('/suggestions/:index', (c) => {
  try {
    const index = parseInt(c.req.param('index'), 10);
    if (isNaN(index)) return c.json({ error: 'Invalid index' }, 400);

    if (!existsSync(SUGGESTIONS_FILE)) return c.json({ error: 'No suggestions' }, 404);

    const suggestions: VaultSuggestion[] = JSON.parse(readFileSync(SUGGESTIONS_FILE, 'utf-8'));
    if (index < 0 || index >= suggestions.length) return c.json({ error: 'Index out of range' }, 404);

    suggestions.splice(index, 1);

    if (suggestions.length === 0) {
      unlinkSync(SUGGESTIONS_FILE);
    } else {
      writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
    }

    return c.json({ dismissed: true, remaining: suggestions.length });
  } catch {
    return c.json({ error: 'Failed to dismiss suggestion' }, 500);
  }
});
```

- [ ] **Step 5: Add POST /suggestions/promote/:index endpoint**

```typescript
app.post('/suggestions/promote/:index', (c) => {
  try {
    const index = parseInt(c.req.param('index'), 10);
    if (isNaN(index)) return c.json({ error: 'Invalid index' }, 400);

    if (!existsSync(SUGGESTIONS_FILE)) return c.json({ error: 'No suggestions' }, 404);

    const suggestions: VaultSuggestion[] = JSON.parse(readFileSync(SUGGESTIONS_FILE, 'utf-8'));
    if (index < 0 || index >= suggestions.length) return c.json({ error: 'Index out of range' }, 404);

    const suggestion = suggestions[index];
    const vaultPath = resolveVaultPath();
    if (!vaultPath) return c.json({ error: 'Vault path not configured' }, 500);

    // Create vault note file
    const slug = suggestion.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    const filename = `${slug}.md`;
    const filePath = join(vaultPath, filename);

    const now = new Date().toISOString().split('T')[0];
    const tagsYaml = suggestion.tags.length > 0
      ? `tags: [${suggestion.tags.join(', ')}]`
      : 'tags: []';

    const noteContent = `---\ntitle: "${suggestion.title}"\nstatus: exploratory\n${tagsYaml}\nbranch: main\ncreated: ${now}\n---\n\n${suggestion.content}\n`;

    writeFileSync(filePath, noteContent);

    // Remove from suggestions
    suggestions.splice(index, 1);
    if (suggestions.length === 0) {
      unlinkSync(SUGGESTIONS_FILE);
    } else {
      writeFileSync(SUGGESTIONS_FILE, JSON.stringify(suggestions, null, 2));
    }

    return c.json({ promoted: true, path: filename, remaining: suggestions.length });
  } catch {
    return c.json({ error: 'Failed to promote suggestion' }, 500);
  }
});
```

- [ ] **Step 6: Add GET /vault/notes endpoint**

```typescript
app.get('/vault/notes', (c) => {
  try {
    const vaultPath = resolveVaultPath();
    if (!vaultPath) return c.json({ notes: [], error: 'Vault not configured' });

    const filters = {
      status: c.req.query('status') || undefined,
      tag: c.req.query('tag') || undefined,
      project: c.req.query('project') || undefined,
      branch: c.req.query('branch') || undefined,
      q: c.req.query('q') || undefined,
    };

    const notes = listVaultNotes(vaultPath, filters);
    return c.json({ notes });
  } catch {
    return c.json({ notes: [], error: 'Failed to read vault' });
  }
});
```

- [ ] **Step 7: Add GET /vault/notes/:path endpoint**

Use wildcard route because note paths may contain slashes (subdirectories). Place this AFTER the `/vault/notes` list route so Hono matches the list route first.

```typescript
app.get('/vault/notes/*', (c) => {
  try {
    const notePath = c.req.path.replace('/vault/notes/', '');
    if (!notePath) return c.json({ error: 'Path required' }, 400);

    const vaultPath = resolveVaultPath();
    if (!vaultPath) return c.json({ error: 'Vault not configured' }, 500);

    const note = readVaultNote(vaultPath, decodeURIComponent(notePath));
    if (!note) return c.json({ error: 'Note not found' }, 404);

    return c.json(note);
  } catch {
    return c.json({ error: 'Failed to read note' }, 500);
  }
});
```

- [ ] **Step 8: Add GET /vault/git-status endpoint**

Uses `execFileSync` (not `exec`) to avoid shell injection. All arguments are static strings.

```typescript
app.get('/vault/git-status', (c) => {
  try {
    const vaultPath = resolveVaultPath();
    if (!vaultPath) return c.json({ error: 'Vault not configured' }, 500);

    const run = (cmd: string, args: string[]) => {
      try {
        return execFileSync(cmd, args, { cwd: vaultPath, timeout: 5000, encoding: 'utf-8' }).trim();
      } catch {
        return '';
      }
    };

    const status = run('git', ['status', '--porcelain']);
    const uncommittedCount = status ? status.split('\n').filter(Boolean).length : 0;

    // Last pull: check FETCH_HEAD mtime
    let lastPull: number | null = null;
    try {
      const fetchHead = join(vaultPath, '.git', 'FETCH_HEAD');
      lastPull = statSync(fetchHead).mtimeMs;
    } catch {}

    // Behind/ahead of remote
    const behindAhead = run('git', ['rev-list', '--count', '--left-right', '@{upstream}...HEAD']);
    let behind = 0;
    let ahead = 0;
    if (behindAhead) {
      const parts = behindAhead.split('\t');
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    }

    let syncStatus = 'synced';
    if (uncommittedCount > 0) syncStatus = 'uncommitted';
    else if (behind > 0) syncStatus = 'behind';
    else if (ahead > 0) syncStatus = 'ahead';

    return c.json({
      syncStatus,
      uncommittedCount,
      behind,
      ahead,
      lastPull,
    });
  } catch {
    return c.json({ error: 'Failed to get git status' }, 500);
  }
});
```

- [ ] **Step 9: Add GET /hook-status endpoint**

```typescript
app.get('/hook-status', (c) => {
  try {
    if (existsSync(HOOK_STATUS_FILE)) {
      const data: Record<string, HookHeartbeat> = JSON.parse(readFileSync(HOOK_STATUS_FILE, 'utf-8'));
      return c.json(data);
    }
    return c.json({});
  } catch {
    return c.json({});
  }
});
```

- [ ] **Step 10: Add GET /session-history endpoint**

```typescript
app.get('/session-history', (c) => {
  try {
    if (existsSync(SESSION_HISTORY_FILE)) {
      const data: SessionRecord[] = JSON.parse(readFileSync(SESSION_HISTORY_FILE, 'utf-8'));
      return c.json({ sessions: data.reverse() }); // newest first
    }
    return c.json({ sessions: [] });
  } catch {
    return c.json({ sessions: [] });
  }
});
```

- [ ] **Step 11: Verify build**

Run: `cd vault-sync && node build.js`
Expected: `Built 7 entry points to dist/`

- [ ] **Step 12: Commit**

```bash
git add vault-sync/src/daemon.ts
git commit -m "feat(dashboard): add all new API endpoints to daemon"
```

---

### Task 7: Update build script to copy dashboard HTML

**Files:**
- Modify: `vault-sync/build.js`

- [ ] **Step 1: Add HTML copy step to build.js**

Add imports at top (merge with existing):
```javascript
import { cpSync, mkdirSync } from 'fs';
```

Add after the `await build(...)` call and before the `console.log`:

```javascript
// Copy dashboard HTML to dist
mkdirSync(join('dist', 'ui'), { recursive: true });
try {
  cpSync(join('ui', 'dashboard.html'), join('dist', 'ui', 'dashboard.html'));
  console.log('Copied dashboard.html to dist/ui/');
} catch {
  console.log('Note: ui/dashboard.html not found, skipping copy');
}
```

Note: `cpSync` requires Node 16.7+. The build target is Node 18.

- [ ] **Step 2: Create the ui directory and placeholder**

```bash
mkdir -p vault-sync/ui
echo "<html><body>placeholder</body></html>" > vault-sync/ui/dashboard.html
```

- [ ] **Step 3: Verify build**

Run: `cd vault-sync && node build.js`
Expected: Build succeeds, prints `Copied dashboard.html to dist/ui/`

- [ ] **Step 4: Commit**

```bash
git add vault-sync/build.js
git commit -m "feat(dashboard): update build script to copy dashboard HTML"
```

---

### Task 8: Create the dashboard HTML — structure and styles

**Files:**
- Create: `vault-sync/ui/dashboard.html` (replace placeholder)

This is a large file, so we build it in two tasks: structure/styles first (this task), then JavaScript (Task 9).

- [ ] **Step 1: Write dashboard.html with full HTML structure and CSS**

Create `vault-sync/ui/dashboard.html` with:
- The full `<!DOCTYPE html>` document
- All CSS styles (dark theme, GitHub dark palette: `#0d1117` bg, `#161b22` cards, `#30363d` borders, `#c9d1d9` text, `#e6edf3` headings)
- The complete DOM structure for all 7 sections in this order:
  1. **Pending Suggestions** (full width) — card with `id="suggestions-container"`, each suggestion has Promote/Dismiss buttons
  2. **Vault Explorer** (full width) — split panel layout: left has search bar (`id="vault-search-input"`), filter chips (`id="vault-filters"`), note list (`id="vault-note-list"`); right has detail panel (`id="vault-note-detail"`)
  3. **Session History** (half width) — timeline container `id="session-timeline"`
  4. **Vault Sync Status** (half width) — stat grid `id="git-status-grid"` (Status, Last Pull, Uncommitted; no Last Push — git doesn't reliably track push time)
  5. **Hook Status** (half width) — list `id="hook-status-list"`
  6. **Daemon Health** (half width) — stats: `id="health-status"`, `id="health-uptime"`, `id="health-port"`, `id="health-pid"`
  7. **Observation Pipeline** (full width) — flow: `id="pipeline-queued"`, `id="pipeline-suggestions"`, `id="pipeline-vault"`
- Page header with health dot (`id="health-dot"`), title, mode badge (`id="mode-badge"`), auto-refresh text
- Use the CSS from the brainstorming mockup at `.superpowers/brainstorm/1302-1774149868/layout-overview.html` as the style reference
- Implement the **side-panel layout (Option B)** for the Vault Explorer: `display: grid; grid-template-columns: 1fr 1fr;` with a left list panel and right detail panel
- Empty state text in each container as placeholder
- No JavaScript yet — just the static shell

- [ ] **Step 2: Verify build copies the file**

Run: `cd vault-sync && node build.js`
Expected: Build succeeds, `Copied dashboard.html to dist/ui/`

- [ ] **Step 3: Commit**

```bash
git add vault-sync/ui/dashboard.html
git commit -m "feat(dashboard): add HTML structure and CSS"
```

---

### Task 9: Create the dashboard HTML — JavaScript

**Files:**
- Modify: `vault-sync/ui/dashboard.html`

- [ ] **Step 1: Add JavaScript to dashboard.html**

Add a `<script>` block at the bottom of the `<body>` with these components:

**API helpers:**
```javascript
const API = '';  // same origin
async function api(path) {
  const res = await fetch(API + path);
  return res.json();
}
async function apiPost(path) {
  const res = await fetch(API + path, { method: 'POST' });
  return res.json();
}
async function apiDelete(path) {
  const res = await fetch(API + path, { method: 'DELETE' });
  return res.json();
}
```

**Utility functions:**
- `relativeTime(ts)` — converts timestamp to "Just now", "5m ago", "3h ago", "2d ago"
- `renderMarkdown(md)` — simple regex renderer for headings, bold, italic, code, lists, paragraphs (under 30 lines)

**State:**
```javascript
let currentFilters = {};
let debounceTimer = null;
```

**Section refresh functions** (one per section, each wrapped in try/catch):
- `refreshHealth()` — `GET /health` — updates health dot color, mode badge text/class, health stat values, pipeline queued count
- `refreshSuggestions()` — `GET /suggestions` — renders suggestion cards with Promote (`onclick` calls `apiPost('/suggestions/promote/${i}')`) and Dismiss (`onclick` calls `apiDelete('/suggestions/${i}')`) buttons; updates pipeline suggestion count; shows empty state when none
- `refreshVaultNotes()` — `GET /vault/notes` with current filter query params — renders note list items with `onclick` to fetch `GET /vault/notes/${path}` and render detail; updates pipeline vault count; populates tag filter chips dynamically
- `refreshSessionHistory()` — `GET /session-history` — renders timeline entries with color-coded dots
- `refreshGitStatus()` — `GET /vault/git-status` — updates 2x2 stat grid values and colors
- `refreshHookStatus()` — `GET /hook-status` — renders hook list with green/red/gray indicators
- `refreshAll()` — calls all above with `Promise.all([...])`

**Event handlers:**
- Search input: `oninput` with 300ms debounce calling `refreshVaultNotes()`
- Filter chips: `onclick` toggles `.active` class on chip, updates `currentFilters`, calls `refreshVaultNotes()`
- Note list items: `onclick` fetches full note and renders markdown in detail panel
- Promote/Dismiss buttons: `onclick` with respective API calls then `refreshSuggestions()` and `refreshVaultNotes()`

**Error handling:**
- Each section refresh catches errors and shows inline error text in its container
- If `refreshHealth()` fetch fails entirely, show full-page overlay: "Daemon not running. Start it with: `node dist/daemon.cjs start`"

**Auto-refresh:**
```javascript
refreshAll();
setInterval(refreshAll, 5000);
```

- [ ] **Step 2: Rebuild and test**

Run: `cd vault-sync && node build.js`

Verify dashboard is served:
```bash
curl -s http://localhost:37778/ | head -5
```
Expected: Returns HTML content.

Open `http://localhost:37778` in browser to verify it loads and shows live data.

- [ ] **Step 3: Commit**

```bash
git add vault-sync/ui/dashboard.html
git commit -m "feat(dashboard): add JavaScript for live data and interactivity"
```

---

### Task 10: Manual integration test and version bump

**Files:** Version files only

- [ ] **Step 1: Restart the daemon**

```bash
cd vault-sync
node dist/daemon.cjs stop
node dist/daemon.cjs start
```

- [ ] **Step 2: Verify dashboard loads**

Open `http://localhost:37778` in browser. Verify:
- Page loads with dark theme
- Health dot is green
- Mode badge shows correct mode
- Daemon Health section shows uptime, port, PID
- Observation Pipeline shows counts

- [ ] **Step 3: Verify vault explorer**

- Notes appear if vault is configured
- Search filters results
- Clicking a note shows content in detail panel
- Filter chips toggle and filter the list

- [ ] **Step 4: Verify suggestions actions**

- If suggestions exist, click Promote — should create a vault note and remove the suggestion
- Click Dismiss — should remove without creating a note

- [ ] **Step 5: Verify hook status**

- Hook Status card should show recently fired hooks with timestamps

- [ ] **Step 6: Bump version in all manifests**

Update version to next minor in:
- `vault-sync/package.json`
- `vault-sync/.claude-plugin/plugin.json`
- `vault-sync/.cursor-plugin/plugin.json`

- [ ] **Step 7: Final commit**

```bash
git add vault-sync/package.json vault-sync/.claude-plugin/plugin.json vault-sync/.cursor-plugin/plugin.json
git commit -m "chore: bump vault-sync to vX.Y.Z"
```
