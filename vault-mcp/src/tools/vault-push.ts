// src/tools/vault-push.ts
import { getConfig } from '../vault/config.js';
import { gitPush } from '../git/sync.js';

export async function vaultPush(
  commitMessage?: string
): Promise<{ success: boolean; message?: string; warning?: string }> {
  const config = getConfig();
  return gitPush(config.vault_path, config.author, commitMessage);
}
