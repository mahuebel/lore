import { readStdin, daemonRequest, output } from './utils.js';
import { evaluateObservations } from '../evaluator.js';

async function main() {
  try {
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

    output({ ok: true });
  } catch (err) {
    process.stderr.write(`[vault-sync] stop hook error: ${err}\n`);
    output({ ok: true });
  }
}

main();
