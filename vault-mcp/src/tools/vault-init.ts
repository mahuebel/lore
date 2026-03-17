// src/tools/vault-init.ts
import { existsSync } from 'fs';
import { join } from 'path';
import { saveConfig, type VaultConfig } from '../vault/config.js';

export interface VaultInitParams {
  vault_path: string;
  author: string;
}

export function vaultInit(params: VaultInitParams): string {
  const { vault_path, author } = params;

  if (!existsSync(vault_path)) {
    throw new Error(`Path not found: ${vault_path}. Clone your vault repo first.`);
  }

  if (!existsSync(join(vault_path, '.git'))) {
    throw new Error(`Not a git repo: ${vault_path}. Clone your vault repo to this path.`);
  }

  if (!existsSync(join(vault_path, 'knowledge'))) {
    throw new Error(
      `Missing expected vault structure at ${vault_path}. Expected a "knowledge/" directory. Is this a vault-template repo?`
    );
  }

  const config: VaultConfig = {
    vault_path,
    author,
    projects: {},
  };

  saveConfig(vault_path, config);

  return `Vault configured at ${vault_path} for user ${author}.`;
}
