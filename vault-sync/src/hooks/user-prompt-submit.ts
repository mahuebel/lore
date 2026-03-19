import * as fs from 'node:fs';
import * as path from 'node:path';
import { readStdin, output } from './utils.js';

const STOP_WORDS = new Set([
  'the', 'is', 'a', 'an', 'to', 'in', 'for', 'of', 'and', 'or', 'but',
  'with', 'this', 'that', 'it', 'my', 'be', 'are', 'was', 'were', 'has',
  'have', 'had', 'do', 'does', 'did', 'not', 'no', 'can', 'will', 'would',
  'should', 'could', 'may', 'might', 'shall', 'how', 'what', 'when', 'where',
  'who', 'why', 'which', 'there', 'here', 'all', 'each', 'any', 'some',
  'one', 'two', 'from', 'about', 'into', 'over', 'after', 'before', 'just',
  'than', 'then', 'also', 'very', 'too', 'only', 'own', 'same', 'so',
  'up', 'out', 'on', 'off', 'if', 'its', 'our', 'your', 'his', 'her',
  'we', 'he', 'she', 'they', 'me', 'him', 'them', 'you', 'been', 'being',
]);

const SKIP_NAMES = new Set(['README.md', '.vault-mcp.json']);
const SKIP_DIRS = new Set(['.obsidian']);

interface VaultMatch {
  title: string;
  status: string;
  project: string;
  excerpt: string;
}

function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Deduplicate and sort by length descending, take top 5
  const unique = [...new Set(words)];
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 5);
}

function parseFrontmatter(content: string): { title: string; status: string; project: string; body: string } {
  const result = { title: '', status: '', project: '', body: content };

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) return result;

  const fm = fmMatch[1];
  result.body = fmMatch[2];

  const titleMatch = fm.match(/^title:\s*(.+)$/m);
  if (titleMatch) result.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');

  const statusMatch = fm.match(/^status:\s*(.+)$/m);
  if (statusMatch) result.status = statusMatch[1].trim();

  const projectMatch = fm.match(/^project:\s*(.+)$/m);
  if (projectMatch) result.project = projectMatch[1].trim();

  return result;
}

function collectMdFiles(dir: string, files: string[] = [], depth = 0): string[] {
  if (depth > 5) return files; // limit recursion
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectMdFiles(fullPath, files, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.md') && !SKIP_NAMES.has(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {
    // permission error or missing dir, skip
  }
  return files;
}

function formatMatches(matches: VaultMatch[]): string {
  const lines: string[] = [
    '## Relevant Vault Knowledge',
    '',
    'The following established team knowledge may be relevant to your task:',
    '',
  ];

  for (const m of matches) {
    lines.push(`### [[${m.title}]]`);
    lines.push(`Status: ${m.status}${m.project ? ` | Project: ${m.project}` : ''}`);
    lines.push(`> ${m.excerpt}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const deadline = Date.now() + 2000;

  try {
    const input = await readStdin();
    const promptText = input.input || input.prompt || '';

    if (!promptText || typeof promptText !== 'string') {
      output({});
    }

    const vaultPath = process.env.VAULT_PATH;
    if (!vaultPath) {
      output({});
    }

    const keywords = extractKeywords(promptText);
    if (keywords.length === 0) {
      output({});
    }

    const mdFiles = collectMdFiles(vaultPath!);
    const matches: VaultMatch[] = [];

    for (const filePath of mdFiles) {
      if (Date.now() > deadline) break; // bail if running out of time
      if (matches.length >= 3) break;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const contentLower = content.toLowerCase();

        const hasMatch = keywords.some((kw) => contentLower.includes(kw));
        if (!hasMatch) continue;

        const parsed = parseFrontmatter(content);

        // Only include established notes
        if (parsed.status !== 'established') continue;

        const title = parsed.title || path.basename(filePath, '.md');
        const excerpt = parsed.body.trim().slice(0, 200);

        matches.push({
          title,
          status: parsed.status,
          project: parsed.project,
          excerpt,
        });
      } catch {
        // skip unreadable files
      }
    }

    if (matches.length > 0) {
      output({
        hookSpecificOutput: {
          additionalContext: formatMatches(matches),
        },
      });
    }

    output({});
  } catch {
    output({});
  }
}

main();
