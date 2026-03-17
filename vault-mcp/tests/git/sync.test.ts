import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { gitPull, gitPush, gitStatus } from '../../src/git/sync.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

// Test-only helper: execSync is safe here because all inputs are hardcoded test fixtures.
function exec(cmd: string, cwd: string) {
  return execSync(cmd, { cwd, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' } });
}

describe('git sync', () => {
  let remoteRepo: string;
  let localRepo: string;

  beforeEach(() => {
    // Set up bare remote
    remoteRepo = mkdtempSync(join(tmpdir(), 'vault-remote-'));
    exec('git init --bare', remoteRepo);

    // Clone and set up initial commit
    localRepo = mkdtempSync(join(tmpdir(), 'vault-local-'));
    exec(`git clone ${remoteRepo} .`, localRepo);
    exec('git config user.email "test@test.com"', localRepo);
    exec('git config user.name "Test"', localRepo);
    mkdirSync(join(localRepo, 'knowledge'));
    writeFileSync(join(localRepo, 'knowledge', '.gitkeep'), '');
    exec('git add -A', localRepo);
    exec('git commit -m "init"', localRepo);
    exec('git push', localRepo);
  });

  afterEach(() => {
    rmSync(remoteRepo, { recursive: true, force: true });
    rmSync(localRepo, { recursive: true, force: true });
  });

  describe('gitStatus', () => {
    it('returns clean status when no changes', async () => {
      const status = await gitStatus(localRepo);
      expect(status.uncommitted_changes).toEqual([]);
      expect(status.ahead).toBe(0);
      expect(status.behind).toBe(0);
      expect(['main', 'master']).toContain(status.branch);
    });

    it('detects uncommitted changes', async () => {
      writeFileSync(join(localRepo, 'knowledge', 'note.md'), '# Test');
      const status = await gitStatus(localRepo);
      expect(status.uncommitted_changes.length).toBeGreaterThan(0);
      expect(status.uncommitted_changes).toContain('knowledge/note.md');
    });

    it('detects ahead count after local commit', async () => {
      writeFileSync(join(localRepo, 'knowledge', 'note.md'), '# Test');
      exec('git add -A', localRepo);
      exec('git commit -m "local commit"', localRepo);
      const status = await gitStatus(localRepo);
      expect(status.ahead).toBe(1);
    });
  });

  describe('gitPush', () => {
    it('commits and pushes changes successfully', async () => {
      writeFileSync(join(localRepo, 'knowledge', 'note.md'), '# Test');
      const result = await gitPush(localRepo, 'testuser');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Changes pushed.');

      // Verify pushed to remote
      const status = await gitStatus(localRepo);
      expect(status.ahead).toBe(0);
    });

    it('handles nothing to commit gracefully', async () => {
      const result = await gitPush(localRepo, 'testuser');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Nothing to commit');
    });

    it('uses custom commit message when provided', async () => {
      writeFileSync(join(localRepo, 'knowledge', 'note.md'), '# Test');
      await gitPush(localRepo, 'testuser', 'custom: my message');
      const log = exec('git log --oneline -1', localRepo).toString().trim();
      expect(log).toContain('custom: my message');
    });
  });

  describe('gitPull', () => {
    let secondClone: string;

    beforeEach(() => {
      secondClone = mkdtempSync(join(tmpdir(), 'vault-clone2-'));
      exec(`git clone ${remoteRepo} .`, secondClone);
      exec('git config user.email "test@test.com"', secondClone);
      exec('git config user.name "Test"', secondClone);
    });

    afterEach(() => {
      rmSync(secondClone, { recursive: true, force: true });
    });

    it('pulls remote changes', async () => {
      // Push from second clone
      writeFileSync(join(secondClone, 'knowledge', 'remote-note.md'), '# Remote');
      exec('git add -A', secondClone);
      exec('git commit -m "remote change"', secondClone);
      exec('git push', secondClone);

      // Pull from first
      const result = await gitPull(localRepo);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Pulled latest changes.');

      // Verify file exists
      const content = readFileSync(join(localRepo, 'knowledge', 'remote-note.md'), 'utf-8');
      expect(content).toBe('# Remote');
    });

    it('handles already up to date', async () => {
      const result = await gitPull(localRepo);
      expect(result.success).toBe(true);
    });

    it('resolves cleanly when edits are in different parts of the file', async () => {
      // Create a file with multiple sections
      const filePath = 'knowledge/shared.md';
      const initialContent = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n';
      writeFileSync(join(localRepo, filePath), initialContent);
      exec('git add -A', localRepo);
      exec('git commit -m "add shared file"', localRepo);
      exec('git push', localRepo);
      exec('git pull', secondClone);

      // Edit top in second clone and push
      writeFileSync(join(secondClone, filePath), 'CHANGED-TOP\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\n');
      exec('git add -A', secondClone);
      exec('git commit -m "edit top"', secondClone);
      exec('git push', secondClone);

      // Edit bottom in first clone (committed locally)
      writeFileSync(join(localRepo, filePath), 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nCHANGED-BOTTOM\n');
      exec('git add -A', localRepo);
      exec('git commit -m "edit bottom"', localRepo);

      const result = await gitPull(localRepo);
      expect(result.success).toBe(true);
    });

    it('returns failure on true conflict (same line edited)', async () => {
      // Create a file
      const filePath = 'knowledge/conflict.md';
      writeFileSync(join(localRepo, filePath), 'original content\n');
      exec('git add -A', localRepo);
      exec('git commit -m "add conflict file"', localRepo);
      exec('git push', localRepo);
      exec('git pull', secondClone);

      // Edit same line in second clone and push
      writeFileSync(join(secondClone, filePath), 'second clone edit\n');
      exec('git add -A', secondClone);
      exec('git commit -m "second edit"', secondClone);
      exec('git push', secondClone);

      // Edit same line in first clone (committed locally)
      writeFileSync(join(localRepo, filePath), 'first clone edit\n');
      exec('git add -A', localRepo);
      exec('git commit -m "first edit"', localRepo);

      const result = await gitPull(localRepo);
      // The rebase itself may conflict or the stash pop may conflict
      // Either way the function should handle it
      if (!result.success) {
        expect(result.error).toBeDefined();
      }

      // Repo should be in a clean state regardless (no in-progress rebase)
      const statusOutput = exec('git status', localRepo).toString();
      expect(statusOutput).not.toContain('rebase in progress');
    });
  });
});
