// src/tools/vault-status.ts
import { getConfig } from '../vault/config.js';
import { gitStatus } from '../git/sync.js';

export async function vaultStatus(): Promise<string> {
  const config = getConfig();
  const status = await gitStatus(config.vault_path);
  return JSON.stringify(status, null, 2);
}
