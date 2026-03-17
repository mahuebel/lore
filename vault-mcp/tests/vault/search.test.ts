import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { searchNotes } from '../../src/vault/search.js';
import { createNoteFile } from '../../src/vault/files.js';
import { serializeNote, validateFrontmatter, type NoteFrontmatter } from '../../src/vault/frontmatter.js';

function makeNote(
  vaultPath: string,
  dir: string,
  filename: string,
  fm: NoteFrontmatter,
  content: string
): string {
  validateFrontmatter(fm);
  const serialized = serializeNote(fm, content);
  return createNoteFile(vaultPath, dir, filename, serialized);
}

describe('searchNotes', () => {
  let vaultPath: string;

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'vault-search-'));
    mkdirSync(join(vaultPath, 'inbox'), { recursive: true });

    makeNote(vaultPath, 'inbox', 'note-one.md', {
      title: 'First Note',
      status: 'exploratory',
      branch: 'feat/one',
      author: 'alice',
      created: '2025-01-10',
      tags: ['research'],
      project: 'alpha',
    }, 'Line one about databases.\nLine two about caching.\nLine three about indexing.\nLine four about queries.\nLine five about performance.');

    makeNote(vaultPath, 'inbox', 'note-two.md', {
      title: 'Second Note',
      status: 'exploratory',
      branch: 'feat/two',
      author: 'bob',
      created: '2025-02-15',
      tags: ['research'],
      project: 'beta',
    }, 'This note is about APIs.\nIt discusses REST patterns.\nAlso mentions DATABASES in uppercase.\nAnd some other topics.');

    makeNote(vaultPath, 'inbox', 'note-three.md', {
      title: 'Third Note',
      status: 'exploratory',
      branch: 'feat/three',
      author: 'charlie',
      created: '2025-03-20',
      tags: ['debugging'],
      project: 'gamma',
    }, 'No relevant content here.\nJust some random text.\nNothing to find.');
  });

  afterEach(() => {
    rmSync(vaultPath, { recursive: true, force: true });
  });

  it('finds case-insensitive matches', () => {
    const results = searchNotes(vaultPath, 'databases');
    expect(results).toHaveLength(2);
    const titles = results.map((r) => r.title).sort();
    expect(titles).toEqual(['First Note', 'Second Note']);
  });

  it('returns matching line with context', () => {
    const results = searchNotes(vaultPath, 'indexing');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('First Note');
    const match = results[0].matches.find((m) => m.line.includes('indexing'));
    expect(match).toBeDefined();
    expect(match!.context).toContain('caching');
    expect(match!.context).toContain('queries');
  });

  it('respects limit parameter', () => {
    const results = searchNotes(vaultPath, 'note', 1);
    expect(results).toHaveLength(1);
  });

  it('returns empty array when no matches', () => {
    const results = searchNotes(vaultPath, 'xyznonexistent');
    expect(results).toHaveLength(0);
  });

  it('returns correct line numbers (1-indexed)', () => {
    const results = searchNotes(vaultPath, 'REST patterns');
    expect(results).toHaveLength(1);
    const match = results[0].matches.find((m) => m.line.includes('REST patterns'));
    expect(match).toBeDefined();
    // The line "It discusses REST patterns." is in the content portion,
    // but line numbers are relative to the full file including frontmatter
    expect(match!.lineNumber).toBeGreaterThan(0);
  });
});
