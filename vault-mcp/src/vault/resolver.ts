import { readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface LoreProjectConfig {
  vault_path: string;
  vault_remote?: string;
  author?: string;
}

export function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(1));
  }
  return p;
}

export function normalizePath(p: string): string {
  return resolve(expandTilde(p));
}

export function readProjectConfig(dir: string): LoreProjectConfig | null {
  try {
    const configPath = join(dir, '.lore', 'config.json');
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    if (config.vault_path && typeof config.vault_path === 'string') {
      return config as LoreProjectConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveVaultForProject(cwd: string): string | null {
  // 1. Walk up from cwd looking for .lore/config.json
  let dir = resolve(cwd);
  while (true) {
    const config = readProjectConfig(dir);
    if (config) {
      return normalizePath(config.vault_path);
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // 2. VAULT_PATH env var
  if (process.env.VAULT_PATH) {
    return normalizePath(process.env.VAULT_PATH);
  }

  // 3. Global default ~/.lore/vault
  const fallback = join(homedir(), '.lore', 'vault');
  try {
    statSync(fallback);
    return normalizePath(fallback);
  } catch {
    return null;
  }
}
