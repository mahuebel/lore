import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readStdin, daemonRequest, output } from './utils.js';
import { writeHookStatus } from '../hook-heartbeat.js';
import { resolveVaultForProject } from '../vault-resolver.js';

const RESOLVED_PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

declare const __PLUGIN_VERSION__: string;
function getPluginVersion(): string {
  return typeof __PLUGIN_VERSION__ !== 'undefined' ? __PLUGIN_VERSION__ : 'unknown';
}

interface Suggestion {
  title: string;
  confidence: number;
  tags: string[];
}

interface VaultNoteSummary {
  title: string;
  status: string;
  created: string;
  project: string;
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
    let health = await daemonRequest('GET', '/health');

    const expectedVersion = getPluginVersion();
    const needsRestart = !health || (health.version || 'unknown') !== expectedVersion;

    if (needsRestart) {
      // Stop old daemon if it's running with wrong version
      if (health) {
        try {
          const daemonScript = path.join(RESOLVED_PLUGIN_ROOT, 'dist', 'daemon.cjs');
          execFileSync('node', [daemonScript, 'stop'], {
            timeout: 5000,
            stdio: 'ignore',
          });
        } catch {}
      }

      // Start daemon
      try {
        const daemonScript = path.join(RESOLVED_PLUGIN_ROOT, 'dist', 'daemon.cjs');
        execFileSync('node', [daemonScript, 'start'], {
          timeout: 15000,
          stdio: 'ignore',
        });
        health = await daemonRequest('GET', '/health');
      } catch {
        process.stderr.write('vault-sync: failed to start daemon\n');
      }
    }

    // Resolve current vault for scoped queries
    const currentVault = resolveVaultForProject(process.cwd());
    const vaultQuery = currentVault ? `?vault=${encodeURIComponent(currentVault)}` : '';

    // Fetch suggestions and vault notes in parallel
    const [suggestionsResp, notesResp] = await Promise.all([
      daemonRequest('GET', `/suggestions${vaultQuery}`),
      daemonRequest('GET', `/vault/notes${vaultQuery}`),
    ]);
    const suggestions = suggestionsResp?.suggestions || (Array.isArray(suggestionsResp) ? suggestionsResp : []);
    const allNotes: VaultNoteSummary[] = notesResp?.notes || [];

    // Get recent knowledge notes (exclude index/template pages)
    const knowledgeNotes = allNotes
      .filter((n: VaultNoteSummary) => n.status && n.created)
      .sort((a: VaultNoteSummary, b: VaultNoteSummary) => b.created.localeCompare(a.created))
      .slice(0, 5);

    const contextLines: string[] = ['Lore dashboard: http://localhost:37778'];

    if (suggestions.length > 0) {
      contextLines.push('');
      contextLines.push(formatSuggestions(suggestions));
    }

    if (knowledgeNotes.length > 0) {
      contextLines.push('');
      contextLines.push('## Recent Vault Notes');
      for (const n of knowledgeNotes) {
        contextLines.push(`- **${n.title}** (${n.status}, ${n.created}) [${n.tags.join(', ')}]`);
      }
    }

    // Build user-visible terminal output
    const displayLines: string[] = [`Lore dashboard: http://localhost:37778 | ${allNotes.length} vault notes`];
    if (suggestions.length > 0) {
      displayLines.push(`${suggestions.length} pending suggestion${suggestions.length > 1 ? 's' : ''} — use /vault-note to capture`);
    }
    if (knowledgeNotes.length > 0) {
      displayLines.push('');
      displayLines.push('Recent:');
      for (const n of knowledgeNotes) {
        const tags = n.tags.length > 0 ? ` [${n.tags.join(', ')}]` : '';
        displayLines.push(`  ${n.status === 'promoted' ? '✓' : '○'} ${n.title}${tags}`);
      }
    }

    output({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: contextLines.join('\n'),
      },
      systemMessage: displayLines.join('\n'),
    });
  } catch (err) {
    writeHookStatus('SessionStart', { lastFiredAt: Date.now(), success: false, error: String(err) });
    output({});
  }
}

main();
