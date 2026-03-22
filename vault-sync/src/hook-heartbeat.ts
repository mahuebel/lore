import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { type HookHeartbeat, LORE_DIR, HOOK_STATUS_FILE } from './types.js';

export function writeHookStatus(hookName: string, status: HookHeartbeat): void {
  try {
    mkdirSync(LORE_DIR, { recursive: true });

    let existing: Record<string, HookHeartbeat> = {};
    try {
      existing = JSON.parse(readFileSync(HOOK_STATUS_FILE, 'utf-8'));
    } catch {
      // missing or corrupt, start fresh
    }

    existing[hookName] = status;

    // Atomic write: write to temp, then rename
    const tmpFile = `${HOOK_STATUS_FILE}.tmp`;
    writeFileSync(tmpFile, JSON.stringify(existing, null, 2));
    renameSync(tmpFile, HOOK_STATUS_FILE);
  } catch {
    // Never let heartbeat writing break a hook
  }
}
