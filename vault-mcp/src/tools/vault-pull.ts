// src/tools/vault-pull.ts
import { getConfig } from '../vault/config.js';
import { gitPull } from '../git/sync.js';

export async function vaultPull(): Promise<{ success: boolean; message?: string; error?: string }> {
  const config = getConfig();
  return gitPull(config.vault_path);
}
