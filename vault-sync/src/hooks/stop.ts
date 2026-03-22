import { readStdin, daemonRequest, output } from './utils.js';
import { writeHookStatus } from '../hook-heartbeat.js';

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

    process.stderr.write(`[vault-sync] sending ${observations.length} observations for background evaluation\n`);

    // POST observations to daemon for async evaluation — don't wait for result
    await daemonRequest('POST', '/evaluate', { observations });

    output({ ok: true });
  } catch (err) {
    writeHookStatus('Stop', { lastFiredAt: Date.now(), success: false, error: String(err) });
    process.stderr.write(`[vault-sync] stop hook error: ${err}\n`);
    output({ ok: true });
  }
}

main();
