import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface VaultMatch {
  path: string;
  title: string;
  status: string;
  project: string;
  excerpt: string; // first 200 chars of content
}

const SKIP_PATTERNS = ['.obsidian/', 'README.md', '.vault-mcp.json', '.gitkeep', 'sessions/'];

const STOP_WORDS = new Set([
  'the', 'is', 'a', 'an', 'to', 'in', 'for', 'of', 'and', 'or', 'but',
  'with', 'this', 'that', 'it', 'my', 'we', 'our', 'you', 'your',
  'can', 'do', 'does', 'how', 'what', 'when', 'where', 'why', 'which',
  'not', 'no', 'yes', 'be', 'been', 'being', 'have', 'has', 'had',
  'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'am', 'are', 'was', 'were', 'if', 'then', 'else', 'so', 'as',
  'at', 'by', 'on', 'up', 'about', 'into', 'from', 'out', 'all',
  'some', 'any', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'new', 'old', 'just', 'also', 'than', 'too', 'very',
  'like', 'make', 'use', 'add', 'get', 'set', 'put', 'run',
  'need', 'want', 'try', 'let', 'help', 'show', 'think', 'know',
  'take', 'come', 'see', 'look', 'find', 'give', 'tell', 'say',
  'please', 'thanks', 'sure', 'okay', 'right', 'well', 'now', 'here',
  'there', 'still', 'already', 'only', 'even', 'back', 'after', 'before',
]);

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 8);
}

interface ParsedFrontmatter {
  title: string;
  status: string;
  project: string;
}

function parseFrontmatter(content: string): { meta: ParsedFrontmatter; body: string } | null {
  const firstDash = content.indexOf('---');
  if (firstDash !== 0) return null;

  const secondDash = content.indexOf('---', 3);
  if (secondDash === -1) return null;

  const frontmatterText = content.slice(3, secondDash);
  const body = content.slice(secondDash + 3).trim();

  const titleMatch = frontmatterText.match(/title:\s*["']?(.+?)["']?\s*$/m);
  const statusMatch = frontmatterText.match(/status:\s*["']?(.+?)["']?\s*$/m);
  const projectMatch = frontmatterText.match(/project:\s*["']?(.+?)["']?\s*$/m);

  return {
    meta: {
      title: titleMatch ? titleMatch[1].trim() : '',
      status: statusMatch ? statusMatch[1].trim() : '',
      project: projectMatch ? projectMatch[1].trim() : '',
    },
    body,
  };
}

function shouldSkip(relativePath: string): boolean {
  return SKIP_PATTERNS.some(pattern => relativePath.includes(pattern));
}

export function searchVaultForContext(
  vaultPath: string,
  keywords: string[]
): VaultMatch[] {
  if (keywords.length === 0) return [];

  let files: string[];
  try {
    files = readdirSync(vaultPath, { recursive: true }) as unknown as string[];
  } catch {
    return [];
  }

  const mdFiles = files
    .map(f => String(f))
    .filter(f => f.endsWith('.md') && !shouldSkip(f));

  const scored: Array<{ match: VaultMatch; score: number }> = [];

  for (const relPath of mdFiles) {
    const fullPath = join(vaultPath, relPath);

    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = parseFrontmatter(content);
    if (!parsed) continue;

    const { meta, body } = parsed;

    // Only include established notes
    if (!meta.status.includes('established')) continue;

    const titleLower = meta.title.toLowerCase();
    const bodyLower = body.toLowerCase();

    let score = 0;
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (titleLower.includes(kwLower)) {
        score += 2; // title match weighted higher
      } else if (bodyLower.includes(kwLower)) {
        score += 1; // body match
      }
    }

    if (score === 0) continue;

    const excerpt = body.slice(0, 200);

    scored.push({
      match: {
        path: fullPath,
        title: meta.title,
        status: meta.status,
        project: meta.project,
        excerpt,
      },
      score,
    });
  }

  // Sort by score descending, return top 3
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(s => s.match);
}
