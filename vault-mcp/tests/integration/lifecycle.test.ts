import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { createNote } from '../../src/tools/vault-create-note.js';
import { promoteNote } from '../../src/tools/vault-promote.js';
import { discardNote } from '../../src/tools/vault-discard.js';
import { readNote } from '../../src/tools/vault-read-note.js';
import { saveConfig } from '../../src/vault/config.js';

// Test-only helper: execSync is safe here because all inputs are hardcoded test fixtures.
function git(cmd: string, cwd: string) {
  return execSync(cmd, { cwd, stdio: 'pipe' });
}

describe('Lifecycle tools integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vault-lifecycle-'));
    git('git init', tempDir);
    mkdirSync(join(tempDir, 'knowledge', 'architecture'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'conventions'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'research'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'debugging'), { recursive: true });
    mkdirSync(join(tempDir, 'inbox'), { recursive: true });

    saveConfig(tempDir, {
      vault_path: tempDir,
      author: 'testuser',
      projects: {},
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('promotes exploratory note to established', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Promote Me',
      content: 'Initial content.',
      tags: ['architecture'],
      project: 'my-project',
      branch: 'feat/promote',
    });

    promoteNote(tempDir, { path: created.path });

    const result = readNote(tempDir, { path: created.path });
    expect(result.frontmatter.status).toBe('established');
    expect(result.frontmatter.established).toBeDefined();
    expect(result.frontmatter.branch).toBeUndefined();
  });

  it('promotes with updated content', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Promote With Content',
      content: 'Original content.',
      tags: ['research'],
      project: 'my-project',
      branch: 'feat/content-promote',
    });

    promoteNote(tempDir, { path: created.path, content: 'Updated content after promotion.' });

    const result = readNote(tempDir, { path: created.path });
    expect(result.frontmatter.status).toBe('established');
    expect(result.content).toBe('Updated content after promotion.');
  });

  it('rejects promoting an already established note', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Already Established',
      content: 'Some content.',
      tags: ['architecture'],
      project: 'my-project',
      branch: 'feat/already-established',
    });

    promoteNote(tempDir, { path: created.path });

    expect(() => promoteNote(tempDir, { path: created.path })).toThrow('already');
  });

  it('discards an exploratory note', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Discard Me',
      content: 'To be discarded.',
      tags: ['research'],
      project: 'my-project',
      branch: 'feat/discard',
    });

    const result = discardNote(tempDir, 'testuser', {
      path: created.path,
      reason: 'branch abandoned',
    });

    expect(existsSync(join(tempDir, created.path))).toBe(false);
    expect(result.commitMessage).toContain('Discard Me');
    expect(result.commitMessage).toContain('branch abandoned');
  });

  it('rejects discarding an established note', () => {
    const created = createNote(tempDir, 'testuser', {
      title: 'Established Do Not Discard',
      content: 'Important knowledge.',
      tags: ['architecture'],
      project: 'my-project',
      branch: 'feat/no-discard',
    });

    promoteNote(tempDir, { path: created.path });

    expect(() =>
      discardNote(tempDir, 'testuser', { path: created.path, reason: 'trying anyway' })
    ).toThrow('exploratory');
  });
});
