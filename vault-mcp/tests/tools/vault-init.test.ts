import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vaultInit } from '../../src/tools/vault-init.js';
import { loadConfig } from '../../src/vault/config.js';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('vault-init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vault-init-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates config for valid vault path', () => {
    execSync('git init', { cwd: tempDir });
    mkdirSync(join(tempDir, 'knowledge'));
    const result = vaultInit({ vault_path: tempDir, author: 'testuser' });
    expect(result).toContain('configured');
    const config = loadConfig(tempDir);
    expect(config.author).toBe('testuser');
  });

  it('throws when path does not exist', () => {
    expect(() => vaultInit({ vault_path: '/nonexistent/path', author: 'testuser' }))
      .toThrow('Path not found');
  });

  it('throws when path is not a git repo', () => {
    mkdirSync(join(tempDir, 'knowledge'));
    expect(() => vaultInit({ vault_path: tempDir, author: 'testuser' }))
      .toThrow('Not a git repo');
  });

  it('throws when vault structure is missing', () => {
    execSync('git init', { cwd: tempDir });
    expect(() => vaultInit({ vault_path: tempDir, author: 'testuser' }))
      .toThrow('knowledge');
  });
});
