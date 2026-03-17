import { readdirSync } from 'fs';
import { join } from 'path';
import { parseFrontmatter, type NoteFrontmatter } from '../vault/frontmatter.js';
import { readNoteFile } from '../vault/files.js';

export interface ReadNoteParams {
  path?: string;
  title?: string;
}

export interface ReadNoteResult {
  path: string;
  frontmatter: NoteFrontmatter;
  content: string;
}

export function readNote(vaultPath: string, params: ReadNoteParams): ReadNoteResult {
  const { path, title } = params;

  if (!path && !title) {
    throw new Error('Either path or title must be provided.');
  }

  if (path) {
    const raw = readNoteFile(vaultPath, path);
    const parsed = parseFrontmatter(raw);
    return { path, frontmatter: parsed.frontmatter, content: parsed.content };
  }

  // Search by title
  const searchTerm = title!.toLowerCase();
  const entries = readdirSync(vaultPath, { recursive: true }) as string[];

  for (const entry of entries) {
    const entryStr = typeof entry === 'string' ? entry : String(entry);
    if (!entryStr.endsWith('.md')) continue;
    if (entryStr.startsWith('.obsidian/') || entryStr === 'README.md') continue;

    try {
      const raw = readNoteFile(vaultPath, entryStr);
      const parsed = parseFrontmatter(raw);
      if (parsed.frontmatter.title && parsed.frontmatter.title.toLowerCase().includes(searchTerm)) {
        return { path: entryStr, frontmatter: parsed.frontmatter, content: parsed.content };
      }
    } catch {
      // Skip files without valid frontmatter
      continue;
    }
  }

  throw new Error(`No note found with title containing "${title}"`);
}
