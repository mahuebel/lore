import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readStdin, daemonRequest, output } from './utils.js';
import { writeHookStatus } from '../hook-heartbeat.js';

const RESOLVED_PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

interface Suggestion {
  title: string;
  confidence: number;
  tags: string[];
}

function formatSuggestions(suggestions: Suggestion[]): string {
  const lines: string[] = [
    '## Vault Suggestions',
    '',
    'Based on your last session, these discoveries may be worth capturing as vault notes:',
    '',
  ];

  suggestions.forEach((s, i) => {
    lines.push(`${i + 1}. **${s.title}** (confidence: ${s.confidence.toFixed(2)})`);
    lines.push(`   Tags: ${s.tags.join(', ')}`);
    lines.push(`   Run: \`/vault-note ${s.title}\``);
    lines.push('');
  });

  lines.push('Use /vault-note to capture any of these.');
  return lines.join('\n');
}

async function main() {
  try {
    writeHookStatus('SessionStart', { lastFiredAt: Date.now(), success: true });
    await readStdin();

    // Check daemon health
    const health = await daemonRequest('GET', '/health');

    // If daemon not running, try to start it
    if (!health) {
      try {
        const daemonScript = path.join(RESOLVED_PLUGIN_ROOT, 'dist', 'daemon.cjs');
        execFileSync('node', [daemonScript, 'start'], {
          timeout: 15000,
          stdio: 'ignore',
        });
      } catch {
        // Failed to start daemon, continue silently
        process.stderr.write('vault-sync: failed to start daemon\n');
      }
    }

    // Fetch suggestions
    const suggestionsResp = await daemonRequest('GET', '/suggestions');
    const suggestions = suggestionsResp?.suggestions || (Array.isArray(suggestionsResp) ? suggestionsResp : []);

    const contextLines: string[] = ['Lore dashboard: http://localhost:37778'];

    if (suggestions.length > 0) {
      contextLines.push('');
      contextLines.push(formatSuggestions(suggestions));

      // Dismiss shown suggestions
      await daemonRequest('POST', '/suggestions/dismiss');
    }

    output({
      hookSpecificOutput: {
        additionalContext: contextLines.join('\n'),
      },
    });
  } catch (err) {
    writeHookStatus('SessionStart', { lastFiredAt: Date.now(), success: false, error: String(err) });
    output({});
  }
}

main();
