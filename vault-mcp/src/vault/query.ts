import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseFrontmatter, type NoteFrontmatter } from '../vault/frontmatter.js';

export interface QueryFilters {
  status?: string;
  branch?: string;
  project?: string;
  tags?: string[];
  author?: string;
  created_after?: string;
  created_before?: string;
}

export interface QueryResult {
  path: string;
  title: string;
  frontmatter: NoteFrontmatter;
}

export function queryNotes(vaultPath: string, filters: QueryFilters): QueryResult[] {
  const entries = readdirSync(vaultPath, { recursive: true }) as string[];
  const mdFiles = entries.filter(
    (e) =>
      e.endsWith('.md') &&
      !e.startsWith('.obsidian/') &&
      !e.startsWith('.obsidian\\') &&
      e !== 'README.md'
  );

  const results: QueryResult[] = [];

  for (const relativePath of mdFiles) {
    const fullPath = join(vaultPath, relativePath);
    let raw: string;
    try {
      raw = readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    let fm: NoteFrontmatter;
    try {
      const parsed = parseFrontmatter(raw);
      fm = parsed.frontmatter;
    } catch {
      continue;
    }

    if (filters.status !== undefined && fm.status !== filters.status) continue;
    if (filters.branch !== undefined && fm.branch !== filters.branch) continue;
    if (filters.project !== undefined && fm.project !== filters.project) continue;
    if (filters.tags !== undefined) {
      if (!filters.tags.every((t) => fm.tags?.includes(t))) continue;
    }
    if (filters.author !== undefined && fm.author !== filters.author) continue;
    const rawCreated = fm.created as unknown;
    const createdStr = rawCreated instanceof Date
      ? rawCreated.toISOString().split('T')[0]
      : String(fm.created);
    if (filters.created_after !== undefined && createdStr < filters.created_after) continue;
    if (filters.created_before !== undefined && createdStr > filters.created_before) continue;

    results.push({ path: relativePath, title: fm.title, frontmatter: fm });
  }

  return results;
}
