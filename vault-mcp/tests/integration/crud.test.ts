import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { createNote } from '../../src/tools/vault-create-note.js';
import { readNote } from '../../src/tools/vault-read-note.js';
import { updateNote } from '../../src/tools/vault-update-note.js';
import { deleteNote } from '../../src/tools/vault-delete-note.js';

describe('Note CRUD integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vault-crud-'));
    // Safe: no user input, only static command for test setup
    execSync('git init', { cwd: tempDir });
    mkdirSync(join(tempDir, 'knowledge', 'architecture'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'conventions'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'research'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'debugging'), { recursive: true });
    mkdirSync(join(tempDir, 'inbox'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a note with architecture tag in knowledge/architecture/', () => {
    const result = createNote(tempDir, 'testuser', {
      title: 'API Design Patterns',
      content: 'Some content about API design.',
      tags: ['architecture'],
      project: 'my-project',
      branch: 'feat/api-design',
    });

    expect(result.path).toContain('knowledge/architecture/');
    expect(result.path.endsWith('.md')).toBe(true);
    expect(result.title).toBe('API Design Patterns');
    expect(result.frontmatter.status).toBe('exploratory');
    expect(result.frontmatter.author).toBe('testuser');
    expect(result.frontmatter.tags).toEqual(['architecture']);
  });

  it('reads a note by path with correct frontmatter and content', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Read Test Note',
      content: 'Body content here.',
      tags: ['architecture'],
      project: 'my-project',
      branch: 'feat/read-test',
    });

    const result = readNote(tempDir, { path: created.path });
    expect(result.frontmatter.title).toBe('Read Test Note');
    expect(result.content).toBe('Body content here.');
    expect(result.path).toBe(created.path);
  });

  it('reads a note by title substring (case-insensitive)', () => {
    createNote(tempDir, 'testuser', {
      title: 'My Special Architecture Note',
      content: 'Found by title search.',
      tags: ['architecture'],
      project: 'my-project',
      branch: 'feat/search',
    });

    const result = readNote(tempDir, { title: 'special architecture' });
    expect(result.frontmatter.title).toBe('My Special Architecture Note');
    expect(result.content).toBe('Found by title search.');
  });

  it('updates note content while preserving frontmatter', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Update Content Test',
      content: 'Original content.',
      tags: ['research'],
      project: 'my-project',
      branch: 'feat/update',
    });

    updateNote(tempDir, { path: created.path, content: 'Updated content.' });

    const result = readNote(tempDir, { path: created.path });
    expect(result.content).toBe('Updated content.');
    expect(result.frontmatter.title).toBe('Update Content Test');
    expect(result.frontmatter.tags).toEqual(['research']);
  });

  it('updates frontmatter (add tag) while preserving content', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Update FM Test',
      content: 'Content stays the same.',
      tags: ['research'],
      project: 'my-project',
      branch: 'feat/update-fm',
    });

    updateNote(tempDir, {
      path: created.path,
      frontmatter: { tags: ['research', 'architecture'] },
    });

    const result = readNote(tempDir, { path: created.path });
    expect(result.content).toBe('Content stays the same.');
    expect(result.frontmatter.tags).toEqual(['research', 'architecture']);
  });

  it('rejects status change via update', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Status Change Test',
      content: 'Cannot change status.',
      tags: ['research'],
      project: 'my-project',
      branch: 'feat/status',
    });

    expect(() =>
      updateNote(tempDir, {
        path: created.path,
        frontmatter: { status: 'established' } as any,
      })
    ).toThrow('Cannot change status directly');
  });

  it('deletes an exploratory note', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Delete Me',
      content: 'To be deleted.',
      tags: ['research'],
      project: 'my-project',
      branch: 'feat/delete',
    });

    const result = deleteNote(tempDir, { path: created.path });
    expect(result).toContain('Deleted');

    expect(() => readNote(tempDir, { path: created.path })).toThrow();
  });

  it('rejects duplicate creation', () => {
    const params = {
      title: 'Duplicate Note',
      content: 'First copy.',
      tags: ['research'],
      project: 'my-project',
      branch: 'feat/dup',
    };

    createNote(tempDir, 'testuser', params);

    expect(() => createNote(tempDir, 'testuser', { ...params, content: 'Second copy.' })).toThrow(
      'already exists'
    );
  });

  it('rejects deleting an established note', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Established Note',
      content: 'Important knowledge.',
      tags: ['architecture'],
      project: 'my-project',
      branch: 'feat/established',
    });

    // Manually set status to established in the file
    const fullPath = join(tempDir, created.path);
    let raw = readFileSync(fullPath, 'utf-8');
    raw = raw.replace('status: exploratory', 'status: established');
    raw = raw.replace(/branch: .*\n/, 'established: 2025-01-01\n');
    writeFileSync(fullPath, raw);

    expect(() => deleteNote(tempDir, { path: created.path })).toThrow(
      'Cannot delete established notes'
    );
  });
});
