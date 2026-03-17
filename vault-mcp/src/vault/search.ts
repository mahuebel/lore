import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseFrontmatter } from '../vault/frontmatter.js';

export interface SearchMatch {
  line: string;
  lineNumber: number;
  context: string;
}

export interface SearchResult {
  path: string;
  title: string;
  matches: SearchMatch[];
}

export function searchNotes(vaultPath: string, query: string, limit: number = 20): SearchResult[] {
  const entries = readdirSync(vaultPath, { recursive: true }) as string[];
  const mdFiles = entries.filter(
    (e) =>
      e.endsWith('.md') &&
      !e.startsWith('.obsidian/') &&
      !e.startsWith('.obsidian\\') &&
      e !== 'README.md'
  );

  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  for (const relativePath of mdFiles) {
    if (results.length >= limit) break;

    const fullPath = join(vaultPath, relativePath);
    let raw: string;
    try {
      raw = readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = raw.split('\n');
    const matches: SearchMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length - 1, i + 2);
        const context = lines.slice(start, end + 1).join('\n');
        matches.push({
          line: lines[i],
          lineNumber: i + 1,
          context,
        });
      }
    }

    if (matches.length > 0) {
      let title = relativePath;
      try {
        const parsed = parseFrontmatter(raw);
        title = parsed.frontmatter.title;
      } catch {
        // use relativePath as title fallback
      }
      results.push({ path: relativePath, title, matches });
    }
  }

  return results;
}
