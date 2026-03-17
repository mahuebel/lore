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

describe('git sync integration', () => {
  let remoteRepo: string;
  let cloneA: string;
  let cloneB: string;

  beforeEach(() => {
    remoteRepo = mkdtempSync(join(tmpdir(), 'vault-int-remote-'));
    exec('git init --bare', remoteRepo);

    cloneA = mkdtempSync(join(tmpdir(), 'vault-int-a-'));
    exec(`git clone ${remoteRepo} .`, cloneA);
    exec('git config user.email "test@test.com"', cloneA);
    exec('git config user.name "Test"', cloneA);
    mkdirSync(join(cloneA, 'knowledge'));
    writeFileSync(join(cloneA, 'knowledge', '.gitkeep'), '');
    exec('git add -A', cloneA);
    exec('git commit -m "init"', cloneA);
    exec('git push', cloneA);

    cloneB = mkdtempSync(join(tmpdir(), 'vault-int-b-'));
    exec(`git clone ${remoteRepo} .`, cloneB);
    exec('git config user.email "test@test.com"', cloneB);
    exec('git config user.name "Test"', cloneB);
  });

  afterEach(() => {
    rmSync(remoteRepo, { recursive: true, force: true });
    rmSync(cloneA, { recursive: true, force: true });
    rmSync(cloneB, { recursive: true, force: true });
  });

  it('full flow: push from A, pull from B, status is clean', async () => {
    // Clone A: write a file and push
    writeFileSync(join(cloneA, 'knowledge', 'sync-test.md'), '---\ntitle: Sync Test\n---\n# Hello\n');
    const pushResult = await gitPush(cloneA, 'userA');
    expect(pushResult.success).toBe(true);
    expect(pushResult.message).toBe('Changes pushed.');

    // Clone B: pull and verify file exists
    const pullResult = await gitPull(cloneB);
    expect(pullResult.success).toBe(true);
    const content = readFileSync(join(cloneB, 'knowledge', 'sync-test.md'), 'utf-8');
    expect(content).toContain('Sync Test');

    // Both clones should show clean status
    const statusA = await gitStatus(cloneA);
    expect(statusA.uncommitted_changes).toEqual([]);
    expect(statusA.ahead).toBe(0);

    const statusB = await gitStatus(cloneB);
    expect(statusB.uncommitted_changes).toEqual([]);
    expect(statusB.ahead).toBe(0);
  });
});
