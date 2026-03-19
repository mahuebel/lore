#!/usr/bin/env node
/**
 * Runtime wrapper — finds Node.js and executes scripts with buffered stdin.
 * Adapted from claude-mem's bun-runner.js pattern.
 *
 * Unlike claude-mem, we use Node.js directly (not Bun) since our dependencies
 * are all Node-compatible and we want to minimize runtime requirements.
 *
 * Handles:
 * - Empty CLAUDE_PLUGIN_ROOT env var (Stop hooks, Linux)
 * - stdin buffering (Claude Code pipes hook input via stdin)
 * - Plugin disabled check
 */
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __runner_dirname = dirname(fileURLToPath(import.meta.url));
const RESOLVED_PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || resolve(__runner_dirname, '..');

function fixBrokenScriptPath(argPath) {
  if ((argPath.startsWith('/scripts/') || argPath.startsWith('/dist/')) && !existsSync(argPath)) {
    const fixedPath = join(RESOLVED_PLUGIN_ROOT, argPath);
    if (existsSync(fixedPath)) return fixedPath;
  }
  return argPath;
}

function isPluginDisabled() {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    const settingsPath = join(configDir, 'settings.json');
    if (!existsSync(settingsPath)) return false;
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    return settings?.enabledPlugins?.['vault-sync@lore'] === false;
  } catch {
    return false;
  }
}

if (isPluginDisabled()) process.exit(0);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node bun-runner.js <script> [args...]');
  process.exit(1);
}

args[0] = fixBrokenScriptPath(args[0]);

function collectStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(null); return; }
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : null));
    process.stdin.on('error', () => resolve(null));
    setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : null);
    }, 5000);
  });
}

const stdinData = await collectStdin();

const child = spawn('node', args, {
  stdio: [stdinData ? 'pipe' : 'ignore', 'inherit', 'inherit'],
  windowsHide: true,
});

if (stdinData) {
  child.stdin.write(stdinData);
  child.stdin.end();
}

child.on('close', (code) => process.exit(code ?? 0));
child.on('error', () => process.exit(0));
