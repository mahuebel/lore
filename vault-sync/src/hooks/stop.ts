import { readStdin, daemonRequest, output } from './utils.js';

async function main() {
  try {
    const input = await readStdin();

    // Prevent infinite loops if this hook is re-entered
    if (input.stop_hook_active) {
      output({ ok: true });
    }

    await daemonRequest('POST', '/evaluate', undefined, 30000);

    output({ ok: true });
  } catch {
    output({ ok: true });
  }
}

main();
