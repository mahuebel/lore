import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { spawn as cpSpawn } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import {
  type QueuedObservation,
  type VaultSuggestion,
  type DaemonState,
  DAEMON_PORT,
  CLAUDE_MEM_PORT,
  LORE_DIR,
  PID_FILE,
  SUGGESTIONS_FILE,
} from './types.js';

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
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    mode: state.mode,
    uptime: Date.now() - state.startedAt,
    queueDepth: state.observations.length,
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

app.post('/evaluate', async (c) => {
  try {
    const count = state.observations.length;

    if (count === 0) {
      return c.json({ evaluated: 0, suggestions: 0 });
    }

    // TODO: Agent SDK evaluation goes here
    console.error(`[vault-sync] evaluate: would process ${count} observations`);

    // Clear the queue
    state.observations.length = 0;

    return c.json({ evaluated: count, suggestions: 0 });
  } catch (err) {
    return c.json({ error: 'Evaluation failed' }, 500);
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
