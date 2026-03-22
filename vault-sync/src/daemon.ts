import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { spawn as cpSpawn, execFileSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, statSync, renameSync } from 'fs';
import { join } from 'path';
import {
  type QueuedObservation,
  type VaultSuggestion,
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
} from './types.js';
import { evaluateObservations } from './evaluator.js';
import { listVaultNotes, readVaultNote, resolveVaultPath } from './vault-reader.js';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const state: DaemonState = {
  mode: 'standalone',
  observations: [],
  pendingSuggestions: [],
  startedAt: Date.now(),
};

// ---------------------------------------------------------------------------
// Background evaluation
// ---------------------------------------------------------------------------

function evaluateInBackground(observations: QueuedObservation[]) {
  evaluateObservations(observations)
    .then((suggestions) => {
      // Write session history
      const record: SessionRecord = {
        startedAt: state.startedAt,
        endedAt: Date.now(),
        observationCount: observations.length,
        suggestionCount: suggestions.length,
        suggestions: suggestions.map(s => ({ title: s.title, confidence: s.confidence })),
      };
      writeSessionHistory(record);

      if (suggestions.length > 0) {
        // Merge with existing suggestions file
        let existing: VaultSuggestion[] = [];
        try {
          if (existsSync(SUGGESTIONS_FILE)) {
            existing = JSON.parse(readFileSync(SUGGESTIONS_FILE, 'utf-8'));
          }
        } catch { /* corrupted file, start fresh */ }

        const merged = [...existing, ...suggestions];
        mkdirSync(LORE_DIR, { recursive: true });
        writeFileSync(SUGGESTIONS_FILE, JSON.stringify(merged, null, 2));
        console.error(`[vault-sync] ${suggestions.length} new suggestions saved (${merged.length} total)`);
      } else {
        console.error(`[vault-sync] no vault-worthy observations found`);
      }
    })
    .catch((err) => {
      console.error(`[vault-sync] background evaluation error: ${err}`);
      // Still write session history on failure
      const record: SessionRecord = {
        startedAt: state.startedAt,
        endedAt: Date.now(),
        observationCount: observations.length,
        suggestionCount: 0,
        suggestions: [],
      };
      writeSessionHistory(record);
    });
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
  return c.json({
    status: 'ok',
    mode: state.mode,
    uptime: Date.now() - state.startedAt,
    startedAt: state.startedAt,
    queueDepth: state.observations.length,
    pid: process.pid,
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
    const incoming: VaultSuggestion[] = await c.req.json();
    let existing: VaultSuggestion[] = [];
    try {
      if (existsSync(SUGGESTIONS_FILE)) {
        existing = JSON.parse(readFileSync(SUGGESTIONS_FILE, 'utf-8'));
      }
    } catch {
      // corrupted, start fresh
    }
    const merged = [...existing, ...incoming];
    mkdirSync(LORE_DIR, { recursive: true });
    writeFileSync(SUGGESTIONS_FILE, JSON.stringify(merged, null, 2));
    return c.json({ saved: incoming.length, total: merged.length });
  } catch {
    return c.json({ error: 'Invalid suggestions payload' }, 400);
  }
});

app.post('/evaluate', async (c) => {
  try {
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
  try {
    if (existsSync(SUGGESTIONS_FILE)) {
      const raw = readFileSync(SUGGESTIONS_FILE, 'utf-8');
      const suggestions: VaultSuggestion[] = JSON.parse(raw);
      return c.json({ suggestions });
    }
    return c.json({ suggestions: [] });
  } catch (err) {
    return c.json({ suggestions: [] });
  }
});

app.post('/suggestions/dismiss', (c) => {
  try {
    if (existsSync(SUGGESTIONS_FILE)) {
      unlinkSync(SUGGESTIONS_FILE);
    }
    return c.json({ dismissed: true });
  } catch (err) {
    return c.json({ error: 'Failed to dismiss suggestions' }, 500);
  }
});

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

    const slug = suggestion.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    const filename = `${slug}.md`;
    const filePath = join(vaultPath, filename);
    const now = new Date().toISOString().split('T')[0];
    const tagsYaml = suggestion.tags.length > 0 ? `tags: [${suggestion.tags.join(', ')}]` : 'tags: []';
    const noteContent = `---\ntitle: "${suggestion.title}"\nstatus: exploratory\n${tagsYaml}\nbranch: main\ncreated: ${now}\n---\n\n${suggestion.content}\n`;

    writeFileSync(filePath, noteContent);

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

app.get('/vault/git-status', (c) => {
  try {
    const vaultPath = resolveVaultPath();
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

  // Spawn detached child running "serve"
  const child = cpSpawn(process.argv[0], [process.argv[1], 'serve'], {
    detached: true,
    stdio: 'ignore',
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
