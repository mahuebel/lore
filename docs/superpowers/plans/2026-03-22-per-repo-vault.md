# Per-Repo Vault Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable per-repository vault configuration so each project can have its own knowledge vault, with the global vault as the easy default.

**Architecture:** A `.lore/config.json` file at a project root declares which vault that project uses. A new `resolveVaultForProject(cwd)` function replaces the legacy `resolveVaultPath()`, walking up from `cwd` to find the config. The daemon stays global but stores suggestions keyed by vault path. The MCP server resolves vaults per-tool-call.

**Tech Stack:** TypeScript, Hono (daemon HTTP), esbuild (bundling), MCP SDK

**Spec:** `docs/superpowers/specs/2026-03-22-per-repo-vault-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `vault-sync/src/vault-resolver.ts` | New. `resolveVaultForProject(cwd)`, `expandTilde()`, `normalizePath()` | Create |
| `vault-sync/src/vault-resolver.test.ts` | Tests for vault resolution logic | Create |
| `vault-sync/src/vault-reader.ts` | Remove `resolveVaultPath()`, import from vault-resolver | Modify |
| `vault-sync/src/types.ts` | Add `VaultKeyedSuggestions` type, update `DaemonState` | Modify |
| `vault-sync/src/daemon.ts` | Vault-keyed suggestions, vault-aware API endpoints, migration | Modify |
| `vault-sync/src/hooks/session-start.ts` | Pass `?vault=` when fetching suggestions | Modify |
| `vault-sync/src/hooks/user-prompt-submit.ts` | Use `resolveVaultForProject` instead of raw `VAULT_PATH` | Modify |
| `vault-mcp/src/vault/config.ts` | Add `resolveVaultForProject` import, update `getConfig()` | Modify |
| `vault-sync/skills/setup/SKILL.md` | Add `--project` flow | Modify |
| `vault-sync/ui/dashboard.html` | Vault selector, grouped suggestions/notes | Modify |
| `vault-sync/.claude-plugin/plugin.json` | Version bump to 3.3.0 | Modify |
| `vault-sync/.cursor-plugin/plugin.json` | Version bump to 3.3.0 | Modify |
| `vault-sync/package.json` | Version bump to 3.3.0 | Modify |
| `README.md` | Document per-repo vaults | Modify |
| `vault-mcp/README.md` | Document dynamic resolution | Modify |

---

### Task 1: Create `resolveVaultForProject` with tests

**Files:**
- Create: `vault-sync/src/vault-resolver.ts`
- Create: `vault-sync/src/vault-resolver.test.ts`

This is the foundational unit — everything else depends on it.

- [ ] **Step 1: Write the test file**

Create `vault-sync/src/vault-resolver.test.ts`. Since the project has no test runner configured, use Node's built-in `node:test` and `node:assert`:

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveVaultForProject, expandTilde, normalizePath } from './vault-resolver.js';

const TEST_DIR = join(tmpdir(), 'vault-resolver-test-' + Date.now());

function setup() {
  mkdirSync(TEST_DIR, { recursive: true });
}

function teardown() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe('expandTilde', () => {
  it('expands ~ to homedir', () => {
    const result = expandTilde('~/foo/bar');
    assert.ok(!result.startsWith('~'));
    assert.ok(result.endsWith('/foo/bar'));
  });

  it('leaves absolute paths unchanged', () => {
    assert.equal(expandTilde('/usr/local'), '/usr/local');
  });
});

describe('normalizePath', () => {
  it('resolves to absolute path', () => {
    const result = normalizePath('/foo/bar/../baz');
    assert.equal(result, '/foo/baz');
  });
});

describe('resolveVaultForProject', () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it('returns null when no config, no env, no global vault', () => {
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(TEST_DIR);
    // Restore
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, null);
  });

  it('reads .lore/config.json from cwd', () => {
    const loreDir = join(TEST_DIR, '.lore');
    mkdirSync(loreDir, { recursive: true });
    writeFileSync(join(loreDir, 'config.json'), JSON.stringify({
      vault_path: '/tmp/test-vault'
    }));
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(TEST_DIR);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, '/tmp/test-vault');
  });

  it('walks up to find .lore/config.json in parent', () => {
    const parentDir = join(TEST_DIR, 'parent');
    const childDir = join(parentDir, 'child', 'deep');
    mkdirSync(childDir, { recursive: true });
    const loreDir = join(parentDir, '.lore');
    mkdirSync(loreDir, { recursive: true });
    writeFileSync(join(loreDir, 'config.json'), JSON.stringify({
      vault_path: '/tmp/parent-vault'
    }));
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(childDir);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, '/tmp/parent-vault');
  });

  it('nearest config wins over parent config', () => {
    const parentDir = join(TEST_DIR, 'parent2');
    const childDir = join(parentDir, 'child');
    mkdirSync(join(parentDir, '.lore'), { recursive: true });
    mkdirSync(join(childDir, '.lore'), { recursive: true });
    writeFileSync(join(parentDir, '.lore', 'config.json'), JSON.stringify({
      vault_path: '/tmp/parent-vault'
    }));
    writeFileSync(join(childDir, '.lore', 'config.json'), JSON.stringify({
      vault_path: '/tmp/child-vault'
    }));
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(childDir);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, '/tmp/child-vault');
  });

  it('falls back to VAULT_PATH env var', () => {
    const saved = process.env.VAULT_PATH;
    process.env.VAULT_PATH = '/tmp/env-vault';
    const result = resolveVaultForProject(TEST_DIR);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, '/tmp/env-vault');
  });

  it('expands tilde in vault_path', () => {
    const loreDir = join(TEST_DIR, '.lore');
    mkdirSync(loreDir, { recursive: true });
    writeFileSync(join(loreDir, 'config.json'), JSON.stringify({
      vault_path: '~/.lore/vaults/test'
    }));
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(TEST_DIR);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.ok(result !== null);
    assert.ok(!result!.startsWith('~'));
    assert.ok(result!.endsWith('.lore/vaults/test'));
  });
});
```

Also add a test for the migration helper that Task 3 will implement:

```typescript
describe('readSuggestionsFile migration', () => {
  // This test validates the concept — the actual function lives in daemon.ts.
  // Include here as a design contract test.
  it('wraps a flat array under the global vault key', () => {
    const raw = [{ title: 'test', content: 'c', tags: [], confidence: 0.5, evaluatedAt: 1 }];
    // Migration logic: if Array.isArray(raw), wrap under global key
    assert.ok(Array.isArray(raw));
    const globalVault = join(homedir(), '.lore', 'vault');
    const migrated = { [globalVault]: raw };
    assert.deepEqual(Object.keys(migrated), [globalVault]);
    assert.equal(migrated[globalVault].length, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd vault-sync && npx tsx --test src/vault-resolver.test.ts`
Expected: FAIL — module `./vault-resolver.js` not found

- [ ] **Step 3: Write the implementation**

Create `vault-sync/src/vault-resolver.ts`:

```typescript
import { readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface LoreProjectConfig {
  vault_path: string;
  vault_remote?: string;
  author?: string;
}

export function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(1));
  }
  return p;
}

export function normalizePath(p: string): string {
  return resolve(expandTilde(p));
}

export function readProjectConfig(dir: string): LoreProjectConfig | null {
  try {
    const configPath = join(dir, '.lore', 'config.json');
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    if (config.vault_path && typeof config.vault_path === 'string') {
      return config as LoreProjectConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveVaultForProject(cwd: string): string | null {
  // 1. Walk up from cwd looking for .lore/config.json
  let dir = resolve(cwd);
  while (true) {
    const config = readProjectConfig(dir);
    if (config) {
      return normalizePath(config.vault_path);
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // 2. VAULT_PATH env var
  if (process.env.VAULT_PATH) {
    return normalizePath(process.env.VAULT_PATH);
  }

  // 3. Global default ~/.lore/vault
  const fallback = join(homedir(), '.lore', 'vault');
  try {
    statSync(fallback);
    return fallback;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd vault-sync && npx tsx --test src/vault-resolver.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add vault-sync/src/vault-resolver.ts vault-sync/src/vault-resolver.test.ts
git commit -m "feat(vault-sync): add resolveVaultForProject with tests"
```

---

### Task 2: Update `vault-reader.ts` to use new resolver

**Files:**
- Modify: `vault-sync/src/vault-reader.ts:159-186`

- [ ] **Step 1: Write the failing test**

Add a test to `vault-sync/src/vault-resolver.test.ts` that imports from `vault-reader.ts` to verify the old `resolveVaultPath` is gone:

```typescript
describe('vault-reader migration', () => {
  it('no longer exports resolveVaultPath', async () => {
    const mod = await import('./vault-reader.js');
    assert.equal('resolveVaultPath' in mod, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd vault-sync && npx tsx --test src/vault-resolver.test.ts`
Expected: FAIL — `resolveVaultPath` still exists in vault-reader

- [ ] **Step 3: Remove `resolveVaultPath` from vault-reader.ts**

In `vault-sync/src/vault-reader.ts`, delete lines 159-186 (the entire `resolveVaultPath` function). Remove the `statSync` import if it's no longer used by other functions in the file.

- [ ] **Step 4: Update daemon.ts imports**

In `vault-sync/src/daemon.ts` line 21, change:
```typescript
import { listVaultNotes, readVaultNote, resolveVaultPath } from './vault-reader.js';
```
to:
```typescript
import { listVaultNotes, readVaultNote } from './vault-reader.js';
import { resolveVaultForProject } from './vault-resolver.js';
```

Replace all calls to `resolveVaultPath()` in daemon.ts with `resolveVaultForProject(process.cwd())` as a temporary measure (Task 3 will add proper vault-aware routing).

Locations to update in `daemon.ts`:
- Line 271: `const vaultPath = resolveVaultPath();` → `const vaultPath = resolveVaultForProject(process.cwd());`
- Line 297: same pattern
- Line 317: same pattern
- Line 329: same pattern

- [ ] **Step 5: Run tests and verify build**

Run: `cd vault-sync && npx tsx --test src/vault-resolver.test.ts && npm run build`
Expected: Tests pass, build succeeds

- [ ] **Step 6: Commit**

```bash
git add vault-sync/src/vault-reader.ts vault-sync/src/daemon.ts vault-sync/src/vault-resolver.test.ts
git commit -m "refactor(vault-sync): replace resolveVaultPath with resolveVaultForProject"
```

---

### Task 3: Update types and daemon for vault-keyed suggestions

**Files:**
- Modify: `vault-sync/src/types.ts`
- Modify: `vault-sync/src/daemon.ts`

- [ ] **Step 1: Add `VaultKeyedSuggestions` type**

In `vault-sync/src/types.ts`, add after the `VaultSuggestion` interface:

```typescript
/** Suggestions keyed by normalized vault path */
export type VaultKeyedSuggestions = Record<string, VaultSuggestion[]>;
```

- [ ] **Step 2: Add suggestions file helper functions to daemon**

In `vault-sync/src/daemon.ts`, add helper functions for reading/writing the vault-keyed suggestions file. These replace the inline file reads scattered across endpoints:

```typescript
import { resolveVaultForProject, normalizePath } from './vault-resolver.js';
import { homedir } from 'node:os';
import type { VaultKeyedSuggestions } from './types.js';

function readSuggestionsFile(): VaultKeyedSuggestions {
  try {
    if (!existsSync(SUGGESTIONS_FILE)) return {};
    const raw = JSON.parse(readFileSync(SUGGESTIONS_FILE, 'utf-8'));
    // Migration: flat array → keyed object
    if (Array.isArray(raw)) {
      const globalVault = join(homedir(), '.lore', 'vault');
      return { [globalVault]: raw };
    }
    return raw as VaultKeyedSuggestions;
  } catch {
    return {};
  }
}

function writeSuggestionsFile(data: VaultKeyedSuggestions): void {
  mkdirSync(LORE_DIR, { recursive: true });
  // Remove empty vault keys
  const cleaned: VaultKeyedSuggestions = {};
  for (const [key, suggestions] of Object.entries(data)) {
    if (suggestions.length > 0) cleaned[key] = suggestions;
  }
  const tmp = SUGGESTIONS_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(cleaned, null, 2));
  renameSync(tmp, SUGGESTIONS_FILE);
}

function resolveVaultFromQuery(c: any): string | null {
  const vaultParam = c.req.query('vault');
  if (vaultParam) return normalizePath(vaultParam);
  return resolveVaultForProject(process.cwd());
}
```

- [ ] **Step 3: Update `evaluateInBackground` to group by vault**

Replace the suggestion-saving logic in `evaluateInBackground` (lines 77-89 of `daemon.ts`). After evaluation, group observations by vault and store under the resolved vault key:

```typescript
function evaluateInBackground(observations: QueuedObservation[]) {
  evalStatus.state = 'evaluating';
  evalStatus.observationCount = observations.length;
  evalStatus.startedAt = Date.now();
  evalStatus.lastError = null;

  // Resolve vault from first observation's cwd (common case: single project)
  const primaryCwd = observations.find(o => o.cwd)?.cwd || process.cwd();
  const vaultPath = resolveVaultForProject(primaryCwd) || join(homedir(), '.lore', 'vault');

  evaluateObservations(observations)
    .then((suggestions) => {
      evalStatus.state = 'idle';
      evalStatus.completedAt = Date.now();
      evalStatus.lastSuggestionCount = suggestions.length;

      const record: SessionRecord = {
        startedAt: state.startedAt,
        endedAt: Date.now(),
        observationCount: observations.length,
        suggestionCount: suggestions.length,
        suggestions: suggestions.map(s => ({ title: s.title, confidence: s.confidence })),
      };
      writeSessionHistory(record);

      if (suggestions.length > 0) {
        const existing = readSuggestionsFile();
        const vaultSuggestions = existing[vaultPath] || [];
        existing[vaultPath] = [...vaultSuggestions, ...suggestions];
        writeSuggestionsFile(existing);
        console.error(`[vault-sync] ${suggestions.length} new suggestions saved for ${vaultPath}`);
      } else {
        console.error(`[vault-sync] no vault-worthy observations found`);
      }
    })
    .catch((err) => {
      // ... existing error handling unchanged ...
    });
}
```

- [ ] **Step 4: Update `GET /suggestions` endpoint**

Replace the `GET /suggestions` handler (daemon.ts lines 219-230):

```typescript
app.get('/suggestions', (c) => {
  const all = readSuggestionsFile();
  const vaultParam = c.req.query('vault');
  if (vaultParam) {
    const key = normalizePath(vaultParam);
    return c.json({ suggestions: all[key] || [] });
  }
  // No vault specified: flatten all vaults into a single array for backward compatibility.
  // Also include the keyed structure under a separate key for vault-aware callers (dashboard).
  const flat = Object.values(all).flat();
  return c.json({ suggestions: flat, vaults: all });
});
```

This ensures backward compatibility: callers that read `suggestions` as an array (existing hooks, dashboard before Task 7) continue to work. The `vaults` key provides the keyed structure for vault-aware callers like the updated dashboard.

- [ ] **Step 5: Update `POST /suggestions/dismiss` endpoint**

Replace the `POST /suggestions/dismiss` handler (daemon.ts lines 232-241):

```typescript
app.post('/suggestions/dismiss', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const vaultParam = (body as any)?.vault;
    if (vaultParam) {
      const key = normalizePath(vaultParam);
      const all = readSuggestionsFile();
      delete all[key];
      writeSuggestionsFile(all);
    } else {
      // Dismiss all — delete the file
      if (existsSync(SUGGESTIONS_FILE)) unlinkSync(SUGGESTIONS_FILE);
    }
    return c.json({ dismissed: true });
  } catch {
    return c.json({ error: 'Failed to dismiss suggestions' }, 500);
  }
});
```

- [ ] **Step 6: Update `DELETE /suggestions/:index` endpoint**

Replace the `DELETE /suggestions/:index` handler (daemon.ts lines 243-260):

```typescript
app.delete('/suggestions/:index', async (c) => {
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
    suggestions.splice(index, 1);
    if (suggestions.length === 0) delete all[key];
    writeSuggestionsFile(all);
    return c.json({ dismissed: true, remaining: suggestions.length });
  } catch {
    return c.json({ error: 'Failed to dismiss suggestion' }, 500);
  }
});
```

- [ ] **Step 7: Update `POST /suggestions/promote/:index` endpoint**

Replace the promote handler (daemon.ts lines 262-293). Key change: use vault from suggestion storage key instead of `resolveVaultPath()`:

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
    const vaultPath = key; // The vault key IS the resolved path

    const slug = suggestion.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    const filename = `${slug}.md`;
    const filePath = join(vaultPath, filename);
    const now = new Date().toISOString().split('T')[0];
    const tagsYaml = suggestion.tags.length > 0 ? `tags: [${suggestion.tags.join(', ')}]` : 'tags: []';
    const noteContent = `---\ntitle: "${suggestion.title}"\nstatus: exploratory\n${tagsYaml}\nbranch: main\ncreated: ${now}\n---\n\n${suggestion.content}\n`;

    writeFileSync(filePath, noteContent);

    suggestions.splice(index, 1);
    if (suggestions.length === 0) delete all[key];
    writeSuggestionsFile(all);
    return c.json({ promoted: true, path: filename, vault: vaultPath, remaining: suggestions.length });
  } catch {
    return c.json({ error: 'Failed to promote suggestion' }, 500);
  }
});
```

- [ ] **Step 8: Update vault endpoints with `?vault=` support**

Update the three vault endpoints to accept an optional `?vault=` query param:

`GET /vault/notes` (daemon.ts lines 295-311):
```typescript
app.get('/vault/notes', (c) => {
  try {
    const vaultPath = resolveVaultFromQuery(c);
    if (!vaultPath) return c.json({ notes: [], error: 'Vault not configured' });
    const filters = {
      status: c.req.query('status') || undefined,
      tag: c.req.query('tag') || undefined,
      project: c.req.query('project') || undefined,
      branch: c.req.query('branch') || undefined,
      q: c.req.query('q') || undefined,
    };
    const notes = listVaultNotes(vaultPath, filters);
    return c.json({ notes, vault: vaultPath });
  } catch {
    return c.json({ notes: [], error: 'Failed to read vault' });
  }
});
```

`GET /vault/notes/*` (daemon.ts lines 313-325):
```typescript
app.get('/vault/notes/*', (c) => {
  try {
    const notePath = c.req.path.replace('/vault/notes/', '');
    if (!notePath) return c.json({ error: 'Path required' }, 400);
    const vaultPath = resolveVaultFromQuery(c);
    if (!vaultPath) return c.json({ error: 'Vault not configured' }, 500);
    const note = readVaultNote(vaultPath, decodeURIComponent(notePath));
    if (!note) return c.json({ error: 'Note not found' }, 404);
    return c.json({ ...note, vault: vaultPath });
  } catch {
    return c.json({ error: 'Failed to read note' }, 500);
  }
});
```

`GET /vault/git-status` (daemon.ts lines 327-358):
```typescript
app.get('/vault/git-status', (c) => {
  try {
    const vaultPath = resolveVaultFromQuery(c);
    if (!vaultPath) return c.json({ error: 'Vault not configured' }, 500);
    // ... rest of git-status logic unchanged, using vaultPath ...
  }
});
```

- [ ] **Step 9: Update `POST /suggestions` endpoint**

Replace the `POST /suggestions` handler (daemon.ts lines 174-192) to accept vault-keyed format:

```typescript
app.post('/suggestions', async (c) => {
  try {
    const body = await c.req.json();
    const vaultParam = (body as any)?.vault;
    const incoming: VaultSuggestion[] = (body as any)?.suggestions || (Array.isArray(body) ? body : []);
    const all = readSuggestionsFile();
    const key = vaultParam ? normalizePath(vaultParam) : join(homedir(), '.lore', 'vault');
    all[key] = [...(all[key] || []), ...incoming];
    writeSuggestionsFile(all);
    return c.json({ saved: incoming.length, total: all[key].length });
  } catch {
    return c.json({ error: 'Invalid suggestions payload' }, 400);
  }
});
```

- [ ] **Step 10: Update `POST /evaluate` to pass vault info**

In the `/evaluate` endpoint (daemon.ts lines 194-217), pass observations to `evaluateInBackground` unchanged — it already reads `cwd` from observations.

No code change needed here — verify the existing code works with the updated `evaluateInBackground`.

- [ ] **Step 11: Build and verify**

Run: `cd vault-sync && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 12: Commit**

```bash
git add vault-sync/src/types.ts vault-sync/src/daemon.ts
git commit -m "feat(vault-sync): vault-keyed suggestion storage and vault-aware API"
```

---

### Task 4: Update hooks for vault-aware behavior

**Files:**
- Modify: `vault-sync/src/hooks/session-start.ts`
- Modify: `vault-sync/src/hooks/user-prompt-submit.ts`

- [ ] **Step 1: Update session-start hook to filter by vault**

In `vault-sync/src/hooks/session-start.ts`, add vault resolution and pass it when fetching suggestions. After the imports at the top, add:

```typescript
import { resolveVaultForProject } from '../vault-resolver.js';
```

In the `main()` function, before the parallel fetch (around line 63), resolve the vault:

```typescript
const currentVault = resolveVaultForProject(process.cwd());
const vaultQuery = currentVault ? `?vault=${encodeURIComponent(currentVault)}` : '';
```

Update the parallel fetch to use the vault query:

```typescript
const [suggestionsResp, notesResp] = await Promise.all([
  daemonRequest('GET', `/suggestions${vaultQuery}`),
  daemonRequest('GET', `/vault/notes${vaultQuery}`),
]);
```

Update the dismiss call to scope to the current vault:

```typescript
// Dismiss shown suggestions (scoped to this vault)
await daemonRequest('POST', '/suggestions/dismiss',
  currentVault ? { vault: currentVault } : undefined
);
```

- [ ] **Step 2: Update user-prompt-submit hook to use resolver**

In `vault-sync/src/hooks/user-prompt-submit.ts`, replace the `VAULT_PATH` env var check (line 113-116) with the resolver:

Add import at top:
```typescript
import { resolveVaultForProject } from '../vault-resolver.js';
```

Replace lines 113-116:
```typescript
const vaultPath = resolveVaultForProject(process.cwd());
if (!vaultPath) {
  output({});
}
```

- [ ] **Step 3: Build and verify**

Run: `cd vault-sync && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add vault-sync/src/hooks/session-start.ts vault-sync/src/hooks/user-prompt-submit.ts
git commit -m "feat(vault-sync): hooks use vault-aware resolution"
```

---

### Task 5: Update MCP server for dynamic vault resolution

**Files:**
- Modify: `vault-mcp/src/vault/config.ts`

- [ ] **Step 1: Copy resolver to vault-mcp**

The MCP server is a separate package. Rather than creating a shared dependency, copy the resolver logic into vault-mcp. Create `vault-mcp/src/vault/resolver.ts` with the same `resolveVaultForProject`, `expandTilde`, and `normalizePath` functions from `vault-sync/src/vault-resolver.ts`.

- [ ] **Step 2: Update `getConfig()` in vault-mcp**

In `vault-mcp/src/vault/config.ts`, update `getConfig()` to accept an optional `cwd` parameter for per-call resolution. Also add a `getVaultPath()` export for use in tool handlers:

```typescript
import { resolveVaultForProject } from './resolver.js';

export function getVaultPath(cwd?: string): string {
  // 1. Explicit VAULT_PATH env var always wins
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;
  // 2. Resolve from cwd (or process.cwd() as fallback)
  const resolved = resolveVaultForProject(cwd || process.cwd());
  if (resolved) return resolved;
  throw new Error(
    'Vault not configured. Set VAULT_PATH or create .lore/config.json in your project.'
  );
}

export function getConfig(cwd?: string): VaultConfig {
  return loadConfig(getVaultPath(cwd));
}
```

**Note on cwd reliability:** For user-scoped MCP registrations, `process.cwd()` reflects where the server was spawned, which may not be the active project. This is an acceptable v1 limitation — the most common setup (project-scoped MCP or `VAULT_PATH` env var) works correctly. A future enhancement can add MCP `roots` support for true per-call resolution. Document this in `vault-mcp/README.md`.

- [ ] **Step 3: Build and verify**

Run: `cd vault-mcp && npm run build` (or the equivalent build command for vault-mcp)
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add vault-mcp/src/vault/resolver.ts vault-mcp/src/vault/config.ts
git commit -m "feat(vault-mcp): dynamic vault resolution via .lore/config.json"
```

---

### Task 6: Update setup skill for `--project` flow

**Files:**
- Modify: `vault-sync/skills/setup/SKILL.md`

- [ ] **Step 1: Add project setup flow to SKILL.md**

Add a new section after the existing Step 1. The skill should detect the `--project` argument and branch into a different flow. Add the following content after the existing frontmatter and before the current Step 1:

```markdown
## Mode Detection

Check the arguments passed to this skill:
- If `--project` is present → follow the **Per-Project Setup** flow below
- Otherwise → follow the existing **Global Setup** flow (Steps 1-6 below)

## Per-Project Setup

### Step P1: Gather Project Vault Configuration

Ask the developer for the following, one at a time:

1. **Remote URL** — git remote for the project vault, or "local" for a local-only vault. Default: local.
2. **Vault path** — where to store the vault on disk. Default: `~/.lore/vaults/<current-repo-name>/`.
3. **Author** — GitHub username. Default: use git config user.name if available.

Confirm all values before proceeding.

### Step P2: Initialize the Vault

If a remote URL was provided:
```bash
git clone <remote-url> <vault-path>
```

If local-only:
```bash
mkdir -p <vault-path> && cd <vault-path> && git init
```

### Step P3: Create `.lore/config.json`

Write `.lore/config.json` in the current project root:

```json
{
  "vault_path": "<vault-path>",
  "vault_remote": "<remote-url-or-omit>",
  "author": "<author>"
}
```

### Step P4: Ask About MCP Configuration

Ask: "Configure project-scoped MCP for Claude Code, Cursor, both, or neither? (If you have a global vault-mcp registration, 'neither' is fine — dynamic resolution will handle it.)"

If Claude Code: create/update `.mcp.json` with vault-mcp pointing to the project vault.
If Cursor: create/update `.cursor/mcp.json` similarly.
If both: create both files.

### Step P5: Ask About .gitignore

Ask: "Should `.lore/` be gitignored? (Yes for solo projects, No for team repos where everyone shares the vault pointer.)"

If yes, add `.lore/` to `.gitignore`.

### Step P6: Verify

Run `vault-query` to confirm the vault is accessible, then print:

```
Per-project vault configured:
  Vault: <vault-path>
  Config: .lore/config.json

Available commands:
  /vault-note         Create a new note
  /promote-to-vault   Promote notes after branch merge
  /vault-cleanup      Discard notes from abandoned branches
```
```

- [ ] **Step 2: Commit**

```bash
git add vault-sync/skills/setup/SKILL.md
git commit -m "feat(vault-sync): add --project flow to /setup skill"
```

---

### Task 7: Update dashboard for vault awareness

**Files:**
- Modify: `vault-sync/ui/dashboard.html`

- [ ] **Step 1: Add vault selector to dashboard header**

In `vault-sync/ui/dashboard.html`, add a vault selector dropdown in the page header (after the mode badge). The selector populates from the keys in the suggestions response and allows filtering.

Add to the header HTML:
```html
<select id="vaultSelector" class="vault-selector" onchange="onVaultChange()">
  <option value="">All Vaults</option>
</select>
```

Add CSS for the selector:
```css
.vault-selector {
  background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
  border-radius: 6px; padding: 4px 8px; font-size: 12px;
}
```

- [ ] **Step 2: Update JavaScript to handle vault-keyed suggestions**

Update the `refreshSuggestions()` function to handle both the old format (array) and the new format (object keyed by vault path). When a vault is selected in the dropdown, pass `?vault=` to the API. Add vault labels to each suggestion card.

```javascript
let currentVault = '';

function onVaultChange() {
  currentVault = document.getElementById('vaultSelector').value;
  refreshSuggestions();
  refreshVaultNotes();
}

function populateVaultSelector(vaults) {
  const sel = document.getElementById('vaultSelector');
  const existing = new Set([...sel.options].map(o => o.value));
  for (const v of vaults) {
    if (!existing.has(v)) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v.split('/').pop(); // show just the vault folder name
      sel.appendChild(opt);
    }
  }
}
```

Update `refreshSuggestions` to parse the vault-keyed response and populate the vault selector. Update `refreshVaultNotes` to pass `?vault=` when a vault is selected.

- [ ] **Step 3: Build and verify**

Run: `cd vault-sync && npm run build`
Expected: Build succeeds, dashboard.html copied to dist/ui/

- [ ] **Step 4: Commit**

```bash
git add vault-sync/ui/dashboard.html
git commit -m "feat(vault-sync): dashboard vault selector and vault-aware views"
```

---

### Task 8: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `vault-mcp/README.md`

- [ ] **Step 1: Add Per-Repo Vaults section to root README**

In the root `README.md`, add a new section "Per-Repo Vaults" after the existing setup instructions. Include:
- When to use per-repo vaults vs global vault
- `.lore/config.json` format and fields
- The resolution chain (project config → `VAULT_PATH` env → global default)
- Quick-start: `/vault-setup --project`
- Examples for both Claude Code and Cursor

- [ ] **Step 2: Update vault-mcp README**

In `vault-mcp/README.md`, add a section explaining that when `VAULT_PATH` is not set, the server dynamically resolves the vault using `.lore/config.json` from the project's working directory. Reference the resolution chain.

- [ ] **Step 3: Commit**

```bash
git add README.md vault-mcp/README.md
git commit -m "docs: document per-repo vault support"
```

---

### Task 9: Version bump and final build

**Files:**
- Modify: `vault-sync/.claude-plugin/plugin.json`
- Modify: `vault-sync/.cursor-plugin/plugin.json`
- Modify: `vault-sync/package.json`

- [ ] **Step 1: Bump version in all manifests**

In `vault-sync/.claude-plugin/plugin.json`, change `"version": "3.2.1"` to `"version": "3.3.0"`.
In `vault-sync/.cursor-plugin/plugin.json`, change `"version": "3.2.1"` to `"version": "3.3.0"`.
In `vault-sync/package.json`, change `"version": "3.2.1"` to `"version": "3.3.0"`.

- [ ] **Step 2: Final build**

Run: `cd vault-sync && npm run build`
Expected: Clean build

- [ ] **Step 3: Run all tests**

Run: `cd vault-sync && npx tsx --test src/vault-resolver.test.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add vault-sync/.claude-plugin/plugin.json vault-sync/.cursor-plugin/plugin.json vault-sync/package.json
git commit -m "chore: bump vault-sync to v3.3.0"
```

---

### Task 10: Deploy to plugin cache

**Files:**
- No file changes — operational step

- [ ] **Step 1: Copy built artifacts to plugin cache**

Run the smart-install script or manually copy dist/ and plugin files to the Claude plugins cache directory.

- [ ] **Step 2: Restart daemon**

```bash
# Stop old daemon
curl -s http://localhost:37778/health > /dev/null 2>&1 && node ~/.claude/plugins/cache/*/vault-sync/*/dist/daemon.cjs stop

# Start new daemon
node ~/.claude/plugins/cache/*/vault-sync/*/dist/daemon.cjs start
```

- [ ] **Step 3: Verify**

```bash
curl -s http://localhost:37778/health | jq .
```

Expected: Health response with updated daemon. Verify suggestions endpoint returns `{}` (empty vault-keyed object) instead of `[]`.

- [ ] **Step 4: End-to-end test**

Create a `.lore/config.json` in a test project pointing to a temp vault. Open a Claude Code session in that project. Verify:
- Session-start shows vault from the per-project config
- Dashboard shows the vault selector
- Observations are tagged with the correct cwd
