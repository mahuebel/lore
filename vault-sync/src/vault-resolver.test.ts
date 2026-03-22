import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { resolveVaultForProject, expandTilde, normalizePath } from './vault-resolver.js';

const TEST_DIR = join(tmpdir(), 'vault-resolver-test-' + Date.now());

function setup() {
  mkdirSync(TEST_DIR, { recursive: true });
}

function teardown() {
  rmSync(TEST_DIR, { recursive: true, force: true });
}

describe('expandTilde', () => {
  it('expands ~ to homedir', () => {
    const result = expandTilde('~/foo/bar');
    assert.ok(!result.startsWith('~'));
    assert.ok(result.endsWith('/foo/bar'));
  });

  it('leaves absolute paths unchanged', () => {
    assert.equal(expandTilde('/usr/local'), '/usr/local');
  });
});

describe('normalizePath', () => {
  it('resolves to absolute path', () => {
    const result = normalizePath('/foo/bar/../baz');
    assert.equal(result, '/foo/baz');
  });
});

describe('resolveVaultForProject', () => {
  beforeEach(() => setup());
  afterEach(() => teardown());

  it('returns null when no config, no env, no global vault', () => {
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(TEST_DIR);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, null);
  });

  it('reads .lore/config.json from cwd', () => {
    const loreDir = join(TEST_DIR, '.lore');
    mkdirSync(loreDir, { recursive: true });
    writeFileSync(join(loreDir, 'config.json'), JSON.stringify({
      vault_path: '/tmp/test-vault'
    }));
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(TEST_DIR);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, '/tmp/test-vault');
  });

  it('walks up to find .lore/config.json in parent', () => {
    const parentDir = join(TEST_DIR, 'parent');
    const childDir = join(parentDir, 'child', 'deep');
    mkdirSync(childDir, { recursive: true });
    const loreDir = join(parentDir, '.lore');
    mkdirSync(loreDir, { recursive: true });
    writeFileSync(join(loreDir, 'config.json'), JSON.stringify({
      vault_path: '/tmp/parent-vault'
    }));
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(childDir);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, '/tmp/parent-vault');
  });

  it('nearest config wins over parent config', () => {
    const parentDir = join(TEST_DIR, 'parent2');
    const childDir = join(parentDir, 'child');
    mkdirSync(join(parentDir, '.lore'), { recursive: true });
    mkdirSync(join(childDir, '.lore'), { recursive: true });
    writeFileSync(join(parentDir, '.lore', 'config.json'), JSON.stringify({
      vault_path: '/tmp/parent-vault'
    }));
    writeFileSync(join(childDir, '.lore', 'config.json'), JSON.stringify({
      vault_path: '/tmp/child-vault'
    }));
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(childDir);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, '/tmp/child-vault');
  });

  it('falls back to VAULT_PATH env var', () => {
    const saved = process.env.VAULT_PATH;
    process.env.VAULT_PATH = '/tmp/env-vault';
    const result = resolveVaultForProject(TEST_DIR);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.equal(result, '/tmp/env-vault');
  });

  it('expands tilde in vault_path', () => {
    const loreDir = join(TEST_DIR, '.lore');
    mkdirSync(loreDir, { recursive: true });
    writeFileSync(join(loreDir, 'config.json'), JSON.stringify({
      vault_path: '~/.lore/vaults/test'
    }));
    const saved = process.env.VAULT_PATH;
    delete process.env.VAULT_PATH;
    const result = resolveVaultForProject(TEST_DIR);
    if (saved) process.env.VAULT_PATH = saved;
    else delete process.env.VAULT_PATH;
    assert.ok(result !== null);
    assert.ok(!result!.startsWith('~'));
    assert.ok(result!.endsWith('.lore/vaults/test'));
  });
});

describe('readSuggestionsFile migration', () => {
  it('wraps a flat array under the global vault key', () => {
    const raw = [{ title: 'test', content: 'c', tags: [], confidence: 0.5, evaluatedAt: 1 }];
    assert.ok(Array.isArray(raw));
    const globalVault = join(homedir(), '.lore', 'vault');
    const migrated = { [globalVault]: raw };
    assert.deepEqual(Object.keys(migrated), [globalVault]);
    assert.equal(migrated[globalVault].length, 1);
  });
});
