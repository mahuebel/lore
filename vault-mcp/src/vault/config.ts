// src/vault/config.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { resolveVaultForProject } from './resolver.js';

export interface VaultConfig {
  vault_path: string;
  author: string;
  projects: Record<string, string>;
}

const CONFIG_FILENAME = '.vault-mcp.json';

export function saveConfig(vaultPath: string, config: VaultConfig): void {
  const configPath = join(vaultPath, CONFIG_FILENAME);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function loadConfig(vaultPath: string): VaultConfig {
  const configPath = join(vaultPath, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    throw new Error(
      'Vault not configured. Run vault-init with your vault path and username.'
    );
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

export function getVaultPath(cwd?: string): string {
  // 1. Explicit VAULT_PATH env var always wins
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;
  // 2. Resolve from cwd (or process.cwd() as fallback)
  const resolved = resolveVaultForProject(cwd || process.cwd());
  if (resolved) return resolved;
  throw new Error(
    'Vault not configured. Set VAULT_PATH or create .lore/config.json in your project.'
  );
}

export function getConfig(cwd?: string): VaultConfig {
  return loadConfig(getVaultPath(cwd));
}
