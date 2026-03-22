import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { readStdin, daemonRequest, output } from './utils.js';
import { evaluateObservations } from '../evaluator.js';
import { writeHookStatus } from '../hook-heartbeat.js';
import { type SessionRecord, LORE_DIR, SESSION_HISTORY_FILE } from '../types.js';

async function main() {
  try {
    writeHookStatus('Stop', { lastFiredAt: Date.now(), success: true });
    const input = await readStdin();

    // Prevent infinite loops if this hook is re-entered
    if (input.stop_hook_active) {
      return output({ ok: true });
    }

    // Drain observations from daemon
    const observations = await daemonRequest('POST', '/observations/drain');

    if (!observations || !Array.isArray(observations) || observations.length === 0) {
      return output({ ok: true });
    }

    process.stderr.write(`[vault-sync] evaluating ${observations.length} observations...\n`);

    // Run evaluation here (inside Claude Code context where SDK is available)
    const suggestions = await evaluateObservations(observations);

    if (suggestions.length > 0) {
      // Post suggestions back to daemon for storage
      await daemonRequest('POST', '/suggestions', suggestions);
      process.stderr.write(`[vault-sync] ${suggestions.length} vault suggestions saved\n`);
    } else {
      process.stderr.write(`[vault-sync] no vault-worthy observations found\n`);
    }

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
      if (history.length > 50) history = history.slice(-50);

      const tmp = SESSION_HISTORY_FILE + '.tmp';
      writeFileSync(tmp, JSON.stringify(history, null, 2));
      renameSync(tmp, SESSION_HISTORY_FILE);
    } catch (histErr) {
      process.stderr.write(`[vault-sync] session history write error: ${histErr}\n`);
    }

    output({ ok: true });
  } catch (err) {
    writeHookStatus('Stop', { lastFiredAt: Date.now(), success: false, error: String(err) });
    process.stderr.write(`[vault-sync] stop hook error: ${err}\n`);
    output({ ok: true });
  }
}

main();
