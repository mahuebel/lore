import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { queryNotes } from '../../src/vault/query.js';
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

describe('queryNotes', () => {
  let vaultPath: string;

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'vault-query-'));
    mkdirSync(join(vaultPath, 'inbox'), { recursive: true });
    mkdirSync(join(vaultPath, 'knowledge', 'architecture'), { recursive: true });

    makeNote(vaultPath, 'inbox', 'note-a.md', {
      title: 'Note A',
      status: 'exploratory',
      branch: 'feat/a',
      author: 'alice',
      created: '2025-01-10',
      tags: ['research', 'api'],
      project: 'alpha',
    }, 'Content A');

    makeNote(vaultPath, 'inbox', 'note-b.md', {
      title: 'Note B',
      status: 'exploratory',
      branch: 'feat/b',
      author: 'bob',
      created: '2025-02-15',
      tags: ['research'],
      project: 'beta',
    }, 'Content B');

    makeNote(vaultPath, 'knowledge/architecture', 'note-c.md', {
      title: 'Note C',
      status: 'established',
      author: 'alice',
      created: '2025-03-20',
      established: '2025-03-25',
      tags: ['architecture'],
      project: 'alpha',
    }, 'Content C');

    makeNote(vaultPath, 'inbox', 'note-d.md', {
      title: 'Note D',
      status: 'exploratory',
      branch: 'feat/d',
      author: 'charlie',
      created: '2025-04-05',
      tags: ['research', 'api'],
      project: 'gamma',
    }, 'Content D');

    makeNote(vaultPath, 'inbox', 'note-e.md', {
      title: 'Note E',
      status: 'exploratory',
      branch: 'feat/a',
      author: 'alice',
      created: '2025-05-01',
      tags: ['debugging'],
      project: 'alpha',
    }, 'Content E');
  });

  afterEach(() => {
    rmSync(vaultPath, { recursive: true, force: true });
  });

  it('returns all notes when no filters provided', () => {
    const results = queryNotes(vaultPath, {});
    expect(results).toHaveLength(5);
  });

  it('filters by status', () => {
    const results = queryNotes(vaultPath, { status: 'established' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Note C');
  });

  it('filters by branch', () => {
    const results = queryNotes(vaultPath, { branch: 'feat/a' });
    expect(results).toHaveLength(2);
    const titles = results.map((r) => r.title).sort();
    expect(titles).toEqual(['Note A', 'Note E']);
  });

  it('filters by project', () => {
    const results = queryNotes(vaultPath, { project: 'alpha' });
    expect(results).toHaveLength(3);
  });

  it('filters by tags with AND logic', () => {
    const results = queryNotes(vaultPath, { tags: ['research', 'api'] });
    expect(results).toHaveLength(2);
    const titles = results.map((r) => r.title).sort();
    expect(titles).toEqual(['Note A', 'Note D']);
  });

  it('filters by single tag', () => {
    const results = queryNotes(vaultPath, { tags: ['architecture'] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Note C');
  });

  it('filters by author', () => {
    const results = queryNotes(vaultPath, { author: 'bob' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Note B');
  });

  it('filters by created_after', () => {
    const results = queryNotes(vaultPath, { created_after: '2025-03-01' });
    expect(results).toHaveLength(3);
  });

  it('filters by created_before', () => {
    const results = queryNotes(vaultPath, { created_before: '2025-02-28' });
    expect(results).toHaveLength(2);
  });

  it('combines multiple filters (AND logic)', () => {
    const results = queryNotes(vaultPath, { author: 'alice', project: 'alpha', status: 'exploratory' });
    expect(results).toHaveLength(2);
    const titles = results.map((r) => r.title).sort();
    expect(titles).toEqual(['Note A', 'Note E']);
  });

  it('returns empty array when nothing matches', () => {
    const results = queryNotes(vaultPath, { author: 'nobody' });
    expect(results).toHaveLength(0);
  });
});
