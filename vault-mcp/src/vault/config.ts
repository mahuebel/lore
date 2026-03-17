// src/vault/config.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

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

export function getConfig(): VaultConfig {
  const vaultPath = process.env.VAULT_PATH;
  if (!vaultPath) {
    throw new Error(
      'VAULT_PATH environment variable not set. Configure vault-mcp with VAULT_PATH and VAULT_AUTHOR.'
    );
  }
  return loadConfig(vaultPath);
}
