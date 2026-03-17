// tests/vault/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, getConfig, type VaultConfig } from '../../src/vault/config.js';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vault-config-'));
    mkdirSync(join(tempDir, 'knowledge'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('saveConfig', () => {
    it('writes .vault-mcp.json to vault path', () => {
      const config: VaultConfig = {
        vault_path: tempDir,
        author: 'testuser',
        projects: {},
      };
      saveConfig(tempDir, config);
      expect(existsSync(join(tempDir, '.vault-mcp.json'))).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('loads config from .vault-mcp.json', () => {
      const config: VaultConfig = {
        vault_path: tempDir,
        author: 'testuser',
        projects: { myproject: '/path/to/project' },
      };
      saveConfig(tempDir, config);
      const loaded = loadConfig(tempDir);
      expect(loaded.author).toBe('testuser');
      expect(loaded.projects.myproject).toBe('/path/to/project');
    });

    it('throws when config file does not exist', () => {
      expect(() => loadConfig(tempDir)).toThrow('Vault not configured');
    });
  });

  describe('getConfig', () => {
    it('loads from env vars when set', () => {
      process.env.VAULT_PATH = tempDir;
      process.env.VAULT_AUTHOR = 'envuser';
      saveConfig(tempDir, { vault_path: tempDir, author: 'envuser', projects: {} });
      const config = getConfig();
      expect(config.vault_path).toBe(tempDir);
      expect(config.author).toBe('envuser');
      delete process.env.VAULT_PATH;
      delete process.env.VAULT_AUTHOR;
    });

    it('throws when no env vars and no config', () => {
      delete process.env.VAULT_PATH;
      delete process.env.VAULT_AUTHOR;
      expect(() => getConfig()).toThrow();
    });
  });
});
