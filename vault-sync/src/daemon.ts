import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { spawn as cpSpawn, execFileSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, statSync, renameSync, openSync, appendFileSync } from 'fs';
import { join } from 'path';
import {
  type QueuedObservation,
  type VaultSuggestion,
  type VaultKeyedSuggestions,
  type DaemonState,
  DAEMON_PORT,
  CLAUDE_MEM_PORT,
  LORE_DIR,
  PID_FILE,
  SUGGESTIONS_FILE,
  type SessionRecord,
  type HookHeartbeat,
  HOOK_STATUS_FILE,
  SESSION_HISTORY_FILE,
  type ClusterResult,
  type EvaluationOutput,
} from './types.js';
import { clusterObservations } from './clustering.js';
import { evaluateClusters, type EvaluationResult } from './evaluator.js';
import { createNote } from '../../vault-mcp/src/tools/vault-create-note.js';
import { updateNote } from '../../vault-mcp/src/tools/vault-update-note.js';
import { searchNotes } from '../../vault-mcp/src/vault/search.js';
import { gitPull, gitPush } from '../../vault-mcp/src/git/sync.js';
import { listVaultNotes, readVaultNote } from './vault-reader.js';
import { resolveVaultForProject, normalizePath } from './vault-resolver.js';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const state: DaemonState = {
  mode: 'standalone',
  observations: [],
  pendingSuggestions: [],
  startedAt: Date.now(),
};

declare const __PLUGIN_VERSION__: string;
const pluginVersion: string = typeof __PLUGIN_VERSION__ !== 'undefined' ? __PLUGIN_VERSION__ : 'unknown';

/** Resolved path to claude CLI, or null if not installed */
let claudeExecutablePath: string | null = null;

function resolveClaudeExecutable(): string | null {
  try {
    return execFileSync('which', ['claude'], { encoding: 'utf-8' }).trim() || null;
  } catch {
    return null;
  }
}

interface EvalStatus {
  state: 'idle' | 'evaluating' | 'error';
  observationCount: number;
  startedAt: number | null;
  completedAt: number | null;
  lastError: string | null;
  lastSuggestionCount: number | null;
}

const evalStatus: EvalStatus = {
  state: 'idle',
  observationCount: 0,
  startedAt: null,
  completedAt: null,
  lastError: null,
  lastSuggestionCount: null,
};

// ---------------------------------------------------------------------------
// Background evaluation
// ---------------------------------------------------------------------------

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
  const cleaned: VaultKeyedSuggestions = {};
  for (const [key, suggestions] of Object.entries(data)) {
    if (suggestions.length > 0) cleaned[key] = suggestions;
  }
  if (Object.keys(cleaned).length === 0) {
    try { if (existsSync(SUGGESTIONS_FILE)) unlinkSync(SUGGESTIONS_FILE); } catch {}
    return;
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

const AUTO_PROMOTE_THRESHOLD = 0.75;

function makeVaultSearcher(vaultPath: string): (query: string) => Promise<string[]> {
  return async (query: string): Promise<string[]> => {
    try {
      const results = searchNotes(vaultPath, query, 10);
      return results.map(r => {
        const content = readFileSync(join(vaultPath, r.path), 'utf-8').slice(0, 2000);
        return `[${r.path}] ${r.title}\n${content}`;
      });
    } catch {
      return [];
    }
  };
}

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

function evaluateInBackground(observations: QueuedObservation[]) {
  evalStatus.state = 'evaluating';
  evalStatus.observationCount = observations.length;
  evalStatus.startedAt = Date.now();
  evalStatus.lastError = null;

  const primaryCwd = observations.find(o => o.cwd)?.cwd || process.cwd();
  const vaultPath = resolveVaultForProject(primaryCwd) || join(homedir(), '.lore', 'vault');

  if (!claudeExecutablePath) {
    evalStatus.state = 'error';
    evalStatus.completedAt = Date.now();
    evalStatus.lastError = 'Claude Code CLI not found — install Claude Code to enable evaluation';
    evalStatus.lastSuggestionCount = 0;
    const record: SessionRecord = {
      startedAt: state.startedAt,
      endedAt: Date.now(),
      observationCount: observations.length,
      suggestionCount: 0,
      suggestions: [],
      error: evalStatus.lastError,
    };
    writeSessionHistory(record);
    return;
  }

  // Derive metadata
  let branch = 'unknown';
  try {
    branch = execFileSync('git', ['branch', '--show-current'], { cwd: primaryCwd, encoding: 'utf-8', timeout: 5000 }).trim() || 'unknown';
  } catch {}

  let project = primaryCwd.split('/').pop() || 'unknown';
  try {
    const configPath = join(primaryCwd, '.lore', 'config.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.project) project = config.project;
    }
  } catch {}

  const author = resolveAuthor(primaryCwd);
  const metadata = { branch, project, cwd: primaryCwd };
  const searchVault = makeVaultSearcher(vaultPath);

  // Phase 1: Cluster observations
  const clusters = clusterObservations(observations);
  console.error(`[vault-sync] clustered ${observations.length} observations into ${clusters.length} clusters`);

  if (clusters.length === 0) {
    evalStatus.state = 'idle';
    evalStatus.completedAt = Date.now();
    evalStatus.lastSuggestionCount = 0;
    console.error(`[vault-sync] no clusters to evaluate`);
    const record: SessionRecord = {
      startedAt: state.startedAt,
      endedAt: Date.now(),
      observationCount: observations.length,
      suggestionCount: 0,
      suggestions: [],
    };
    writeSessionHistory(record);
    return;
  }

  // Phase 2 & 3: Evaluate clusters and write to vault
  (async () => {
    try {
      // Git pull once before any writes
      try {
        const pullResult = await gitPull(vaultPath);
        if (pullResult.error) {
          console.error(`[vault-sync] git pull warning: ${pullResult.error}`);
        }
      } catch (pullErr) {
        console.error(`[vault-sync] git pull failed (continuing): ${pullErr}`);
      }

      // Phase 2: Evaluate clusters
      const evalResult: EvaluationResult = await evaluateClusters(clusters, claudeExecutablePath!, searchVault, metadata);

      const clusterResults: ClusterResult[] = [];
      const pending: VaultSuggestion[] = [];
      let promotedCount = 0;

      // Phase 3: Process results
      for (const r of evalResult.results) {
        if (r.error || !r.output) {
          clusterResults.push({ action: 'error', error: r.error || 'no output' });
          continue;
        }

        const output: EvaluationOutput = r.output;

        if (output.action === 'skip') {
          console.error(`[vault-sync] skipped: ${output.skipReason || 'no reason'}`);
          clusterResults.push({ action: 'skip', title: output.title, confidence: output.confidence });
          continue;
        }

        if (output.confidence >= AUTO_PROMOTE_THRESHOLD) {
          if (output.action === 'create') {
            let created = false;
            let finalTitle = output.title;
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                const noteTitle = attempt === 0 ? output.title : `${output.title} (${attempt + 1})`;
                const result = createNote(vaultPath, author, {
                  title: noteTitle,
                  content: output.content,
                  tags: output.tags,
                  project: output.project,
                  branch: output.branch,
                });
                finalTitle = noteTitle;
                promotedCount++;
                console.error(`[vault-sync] created note (${output.confidence}): ${result.path}`);
                clusterResults.push({ action: 'create', title: finalTitle, path: result.path, confidence: output.confidence });
                created = true;
                break;
              } catch (err) {
                const errMsg = String(err);
                if (errMsg.includes('already exists') && attempt < 4) {
                  continue;
                }
                // Fall to pending on other errors or exhausted retries
                console.error(`[vault-sync] create failed, falling to pending: ${err}`);
                break;
              }
            }
            if (!created) {
              pending.push({
                title: output.title,
                content: output.content,
                tags: output.tags,
                confidence: output.confidence,
                evaluatedAt: Date.now(),
              });
              clusterResults.push({ action: 'create', title: output.title, confidence: output.confidence, error: 'fell to pending' });
            }
          } else if (output.action === 'update' && output.existingPath) {
            try {
              updateNote(vaultPath, { path: output.existingPath, content: output.content });
              promotedCount++;
              console.error(`[vault-sync] updated note (${output.confidence}): ${output.existingPath}`);
              clusterResults.push({ action: 'update', title: output.title, path: output.existingPath, confidence: output.confidence });
            } catch (err) {
              console.error(`[vault-sync] update failed, falling to pending: ${err}`);
              pending.push({
                title: output.title,
                content: output.content,
                tags: output.tags,
                confidence: output.confidence,
                evaluatedAt: Date.now(),
              });
              clusterResults.push({ action: 'update', title: output.title, confidence: output.confidence, error: 'fell to pending' });
            }
          }
        } else {
          // Below threshold — store as pending
          pending.push({
            title: output.title,
            content: output.content,
            tags: output.tags,
            confidence: output.confidence,
            evaluatedAt: Date.now(),
          });
          clusterResults.push({ action: output.action, title: output.title, confidence: output.confidence });
        }
      }

      // Store pending suggestions
      if (pending.length > 0) {
        const existing = readSuggestionsFile();
        const vaultSuggestions = existing[vaultPath] || [];
        existing[vaultPath] = [...vaultSuggestions, ...pending];
        writeSuggestionsFile(existing);
      }

      // Git push once after all writes
      if (promotedCount > 0) {
        try {
          const pushResult = await gitPush(vaultPath, author, `vault-sync: ${promotedCount} notes from session`);
          if (pushResult.warning) {
            console.error(`[vault-sync] git push warning: ${pushResult.warning}`);
          }
        } catch (pushErr) {
          console.error(`[vault-sync] git push failed: ${pushErr}`);
        }
      }

      evalStatus.state = 'idle';
      evalStatus.completedAt = Date.now();
      evalStatus.lastSuggestionCount = promotedCount + pending.length;

      console.error(`[vault-sync] ${promotedCount} auto-promoted, ${pending.length} pending for ${vaultPath}`);

      const record: SessionRecord = {
        startedAt: state.startedAt,
        endedAt: Date.now(),
        observationCount: observations.length,
        suggestionCount: promotedCount + pending.length,
        suggestions: clusterResults
          .filter(cr => cr.title && cr.confidence != null)
          .map(cr => ({ title: cr.title!, confidence: cr.confidence! })),
        clusters: clusterResults,
      };
      writeSessionHistory(record);
    } catch (err) {
      evalStatus.state = 'error';
      evalStatus.completedAt = Date.now();
      evalStatus.lastError = String(err);
      evalStatus.lastSuggestionCount = 0;
      console.error(`[vault-sync] background evaluation error: ${err}`);
      const record: SessionRecord = {
        startedAt: state.startedAt,
        endedAt: Date.now(),
        observationCount: observations.length,
        suggestionCount: 0,
        suggestions: [],
        error: String(err),
      };
      writeSessionHistory(record);
    }
  })();
}

function writeSessionHistory(record: SessionRecord) {
  try {
    mkdirSync(LORE_DIR, { recursive: true });
    let history: SessionRecord[] = [];
    try {
      if (existsSync(SESSION_HISTORY_FILE)) {
        history = JSON.parse(readFileSync(SESSION_HISTORY_FILE, 'utf-8'));
      }
    } catch { /* start fresh */ }
    history.push(record);
    if (history.length > 50) history = history.slice(-50);
    const tmp = SESSION_HISTORY_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(history, null, 2));
    renameSync(tmp, SESSION_HISTORY_FILE);
  } catch (err) {
    console.error(`[vault-sync] session history write error: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

app.get('/', (c) => {
  try {
    const dashboardPath = join(__dirname, 'ui', 'dashboard.html');
    const html = readFileSync(dashboardPath, 'utf-8');
    return c.html(html);
  } catch {
    return c.text('Dashboard not found. Run the build script to generate it.', 404);
  }
});

app.get('/health', (c) => {
  const defaultVault = join(homedir(), '.lore', 'vault');
  const resolvedVault = resolveVaultForProject(process.cwd());
  return c.json({
    status: 'ok',
    version: pluginVersion,
    mode: state.mode,
    uptime: Date.now() - state.startedAt,
    startedAt: state.startedAt,
    queueDepth: state.observations.length,
    pid: process.pid,
    evaluator: evalStatus,
    claudeCli: claudeExecutablePath ? 'available' : 'not found',
    vault: resolvedVault ? {
      path: resolvedVault,
      isDefault: normalizePath(defaultVault) === resolvedVault,
    } : null,
  });
});

app.post('/observations', async (c) => {
  try {
    const obs: QueuedObservation = await c.req.json();
    state.observations.push(obs);
    return c.json({ queued: true, depth: state.observations.length });
  } catch (err) {
    return c.json({ error: 'Invalid observation payload' }, 400);
  }
});

app.post('/observations/drain', (c) => {
  const batch = state.observations.splice(0);
  return c.json(batch);
});

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

app.post('/evaluate', async (c) => {
  try {
    // Concurrency guard: if already evaluating, queue new observations
    if (evalStatus.state === 'evaluating') {
      const body = await c.req.json().catch(() => null);
      const newObs: QueuedObservation[] = body?.observations || [];
      state.observations.push(...newObs);
      return c.json({ queued: true, reason: 'evaluation in progress', depth: state.observations.length });
    }

    const body = await c.req.json().catch(() => null);
    const observations: QueuedObservation[] = body?.observations || [];

    // Also drain any queued observations
    const queued = state.observations.splice(0);
    const allObservations = [...queued, ...observations];

    if (allObservations.length === 0) {
      return c.json({ accepted: 0 });
    }

    console.error(`[vault-sync] accepted ${allObservations.length} observations for background evaluation`);

    // Respond immediately, evaluate in background
    evaluateInBackground(allObservations);

    return c.json({ accepted: allObservations.length });
  } catch (err) {
    console.error(`[vault-sync] evaluate endpoint error: ${err}`);
    return c.json({ error: 'Failed to accept observations' }, 500);
  }
});

app.get('/suggestions', (c) => {
  const all = readSuggestionsFile();
  const vaultParam = c.req.query('vault');
  if (vaultParam) {
    const key = normalizePath(vaultParam);
    return c.json({ suggestions: all[key] || [] });
  }
  const flat = Object.entries(all).flatMap(([vault, items]) =>
    items.map(s => ({ ...s, vault }))
  );
  return c.json({ suggestions: flat, vaults: all });
});

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
      if (existsSync(SUGGESTIONS_FILE)) unlinkSync(SUGGESTIONS_FILE);
    }
    return c.json({ dismissed: true });
  } catch {
    return c.json({ error: 'Failed to dismiss suggestions' }, 500);
  }
});

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
  } catch {
    return c.json({ error: 'Failed to promote suggestion' }, 500);
  }
});

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
    return c.json({ notes });
  } catch {
    return c.json({ notes: [], error: 'Failed to read vault' });
  }
});

app.get('/vault/notes/*', (c) => {
  try {
    const notePath = c.req.path.replace('/vault/notes/', '');
    if (!notePath) return c.json({ error: 'Path required' }, 400);
    const vaultPath = resolveVaultFromQuery(c);
    if (!vaultPath) return c.json({ error: 'Vault not configured' }, 500);
    const note = readVaultNote(vaultPath, decodeURIComponent(notePath));
    if (!note) return c.json({ error: 'Note not found' }, 404);
    return c.json(note);
  } catch {
    return c.json({ error: 'Failed to read note' }, 500);
  }
});

app.get('/vault/info', (c) => {
  const cwd = process.cwd();
  const repoName = cwd.split('/').pop() || 'project';
  const defaultVaultPath = join(homedir(), '.lore', 'vaults', repoName);
  const globalVaultPath = join(homedir(), '.lore', 'vault');
  return c.json({
    cwd,
    repoName,
    defaultProjectVaultPath: defaultVaultPath,
    globalVaultPath,
    templateRepo: 'https://github.com/mahuebel/vault-template',
  });
});

app.post('/vault/init', async (c) => {
  try {
    const body = await c.req.json();
    const { vaultPath, vaultRemote, author, scope } = body as {
      vaultPath?: string;
      vaultRemote?: string;
      author?: string;
      scope: 'project' | 'global';
    };

    if (!vaultPath) return c.json({ error: 'vault_path is required' }, 400);

    const resolvedPath = normalizePath(vaultPath);

    // Create the vault directory
    mkdirSync(resolvedPath, { recursive: true });

    if (scope === 'project') {
      // Write .lore/config.json in cwd
      const configDir = join(process.cwd(), '.lore');
      mkdirSync(configDir, { recursive: true });
      const config: Record<string, string> = { vault_path: vaultPath };
      if (vaultRemote) config.vault_remote = vaultRemote;
      if (author) config.author = author;
      writeFileSync(join(configDir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
      return c.json({ ok: true, scope: 'project', configPath: join(configDir, 'config.json'), vaultPath: resolvedPath });
    } else {
      // Global: just ensure ~/.lore/vault exists
      return c.json({ ok: true, scope: 'global', vaultPath: resolvedPath });
    }
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

app.get('/vault/git-status', (c) => {
  try {
    const vaultPath = resolveVaultFromQuery(c);
    if (!vaultPath) return c.json({ error: 'Vault not configured' }, 500);
    const run = (cmd: string, args: string[]) => {
      try {
        return execFileSync(cmd, args, { cwd: vaultPath, timeout: 5000, encoding: 'utf-8' }).trim();
      } catch { return ''; }
    };
    const status = run('git', ['status', '--porcelain']);
    const uncommittedCount = status ? status.split('\n').filter(Boolean).length : 0;
    let lastPull: number | null = null;
    try {
      const fetchHead = join(vaultPath, '.git', 'FETCH_HEAD');
      lastPull = statSync(fetchHead).mtimeMs;
    } catch {}
    const behindAhead = run('git', ['rev-list', '--count', '--left-right', '@{upstream}...HEAD']);
    let behind = 0, ahead = 0;
    if (behindAhead) {
      const parts = behindAhead.split('\t');
      behind = parseInt(parts[0], 10) || 0;
      ahead = parseInt(parts[1], 10) || 0;
    }
    let syncStatus = 'synced';
    if (uncommittedCount > 0) syncStatus = 'uncommitted';
    else if (behind > 0) syncStatus = 'behind';
    else if (ahead > 0) syncStatus = 'ahead';
    return c.json({ syncStatus, uncommittedCount, behind, ahead, lastPull });
  } catch {
    return c.json({ error: 'Failed to get git status' }, 500);
  }
});

app.get('/hook-status', (c) => {
  try {
    if (existsSync(HOOK_STATUS_FILE)) {
      const data: Record<string, HookHeartbeat> = JSON.parse(readFileSync(HOOK_STATUS_FILE, 'utf-8'));
      return c.json(data);
    }
    return c.json({});
  } catch { return c.json({}); }
});

app.get('/session-history', (c) => {
  try {
    if (existsSync(SESSION_HISTORY_FILE)) {
      const data: SessionRecord[] = JSON.parse(readFileSync(SESSION_HISTORY_FILE, 'utf-8'));
      return c.json({ sessions: data.reverse() });
    }
    return c.json({ sessions: [] });
  } catch { return c.json({ sessions: [] }); }
});

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function healthCheck(retries = 20, interval = 500): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://localhost:${DAEMON_PORT}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

async function detectClaudeMem(): Promise<'standalone' | 'supercharged'> {
  try {
    const res = await fetch(`http://localhost:${CLAUDE_MEM_PORT}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) return 'supercharged';
  } catch {
    // claude-mem not available
  }
  return 'standalone';
}

// ---------------------------------------------------------------------------
// CLI commands
// ---------------------------------------------------------------------------

async function cmdStart(): Promise<void> {
  mkdirSync(LORE_DIR, { recursive: true });

  // Check if already running
  if (existsSync(PID_FILE)) {
    try {
      const pidData = JSON.parse(readFileSync(PID_FILE, 'utf-8'));
      if (pidData.pid && isProcessAlive(pidData.pid)) {
        console.error('[vault-sync] daemon already running');
        process.exit(0);
      }
    } catch {
      // Stale PID file, continue
    }
  }

  // Spawn detached child running "serve", logging stderr to file
  const logFile = join(LORE_DIR, 'daemon.log');
  const logFd = openSync(logFile, 'a');
  const child = cpSpawn(process.argv[0], [process.argv[1], 'serve'], {
    detached: true,
    stdio: ['ignore', 'ignore', logFd],
  });
  child.unref();

  if (!child.pid) {
    console.error('[vault-sync] failed to spawn daemon');
    process.exit(1);
  }

  // Write PID file
  writeFileSync(
    PID_FILE,
    JSON.stringify({ pid: child.pid, port: DAEMON_PORT, startedAt: Date.now() }),
  );

  // Wait for health check (poll up to 10s)
  const ok = await healthCheck(20, 500);
  if (ok) {
    console.error(`[vault-sync] daemon started on port ${DAEMON_PORT}`);
  } else {
    console.error('[vault-sync] daemon may not have started — health check timed out');
  }

  process.exit(0);
}

async function cmdServe(): Promise<void> {
  mkdirSync(LORE_DIR, { recursive: true });

  state.mode = await detectClaudeMem();
  state.startedAt = Date.now();

  claudeExecutablePath = resolveClaudeExecutable();
  if (claudeExecutablePath) {
    console.error(`[vault-sync] claude CLI found at ${claudeExecutablePath}`);
  } else {
    console.error(`[vault-sync] claude CLI not found — evaluation disabled`);
  }

  console.error(`[vault-sync] serving on port ${DAEMON_PORT} (mode: ${state.mode})`);

  const server = serve({
    fetch: app.fetch,
    port: DAEMON_PORT,
  });

  // Graceful shutdown
  const shutdown = () => {
    console.error('[vault-sync] shutting down');
    try {
      if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
    } catch {
      // best effort
    }
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function cmdStop(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.error('[vault-sync] no PID file found — daemon not running');
    process.exit(0);
  }

  try {
    const pidData = JSON.parse(readFileSync(PID_FILE, 'utf-8'));
    if (pidData.pid) {
      try {
        process.kill(pidData.pid, 'SIGTERM');
        console.error('[vault-sync] sent SIGTERM to daemon');
      } catch {
        console.error('[vault-sync] process not found — cleaning up');
      }
    }
  } catch {
    console.error('[vault-sync] could not read PID file');
  }

  try {
    unlinkSync(PID_FILE);
  } catch {
    // already gone
  }

  process.exit(0);
}

async function cmdStatus(): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${DAEMON_PORT}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      console.error(`[vault-sync] ${JSON.stringify(data)}`);
    } else {
      console.error('[vault-sync] not running');
    }
  } catch {
    console.error('[vault-sync] not running');
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const command = process.argv[2];

switch (command) {
  case 'start':
    cmdStart();
    break;
  case 'serve':
    cmdServe();
    break;
  case 'stop':
    cmdStop();
    break;
  case 'status':
    cmdStatus();
    break;
  default:
    console.error('Usage: daemon <start|serve|stop|status>');
    process.exit(1);
}
