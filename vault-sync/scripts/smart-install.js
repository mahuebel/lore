#!/usr/bin/env node
/**
 * Dependency installer & builder — runs during Setup hook.
 * Ensures node_modules and dist/ are present and up-to-date.
 * Always outputs {} to stdout and exits 0.
 *
 * Uses __dirname for path resolution so it works regardless of
 * whether CLAUDE_PLUGIN_ROOT is set (it's unreliable in some hook contexts).
 */
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '..');

const LORE_DIR = join(homedir(), '.lore');
const HOOK_STATUS_FILE = join(LORE_DIR, 'hook-status.json');

function writeSetupHeartbeat(success, error) {
  try {
    mkdirSync(LORE_DIR, { recursive: true });
    let existing = {};
    try { existing = JSON.parse(readFileSync(HOOK_STATUS_FILE, 'utf-8')); } catch {}
    existing['Setup'] = { lastFiredAt: Date.now(), success, error };
    const tmp = HOOK_STATUS_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(existing, null, 2));
    renameSync(tmp, HOOK_STATUS_FILE);
  } catch {}
}

function needsRebuild() {
  const distDir = join(pluginRoot, 'dist');
  if (!existsSync(distDir)) return true;

  // Rebuild if any src/ file is newer than the oldest dist/ file
  try {
    const distFiles = readdirSync(join(distDir, 'hooks')).map(f => join(distDir, 'hooks', f));
    if (distFiles.length === 0) return true;
    const oldestDist = Math.min(...distFiles.map(f => statSync(f).mtimeMs));

    const srcDir = join(pluginRoot, 'src');
    if (!existsSync(srcDir)) return false;
    const srcFiles = readdirSync(srcDir, { recursive: true })
      .filter(f => f.endsWith('.ts'))
      .map(f => join(srcDir, f));
    const newestSrc = Math.max(...srcFiles.map(f => statSync(f).mtimeMs));

    return newestSrc > oldestDist;
  } catch {
    return true;
  }
}

try {
  const nodeModules = join(pluginRoot, 'node_modules');
  if (!existsSync(nodeModules)) {
    process.stderr.write('[vault-sync] Installing dependencies...\n');
    execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
      cwd: pluginRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    process.stderr.write('[vault-sync] Dependencies installed.\n');
  }

  if (needsRebuild()) {
    process.stderr.write('[vault-sync] Building hook scripts...\n');
    execFileSync('node', ['build.js'], {
      cwd: pluginRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    process.stderr.write('[vault-sync] Build complete.\n');
  }
  writeSetupHeartbeat(true);
} catch (err) {
  process.stderr.write(`[vault-sync] Install/build error: ${err.message}\n`);
  writeSetupHeartbeat(false, err.message);
}

// Always succeed — never block session start
console.log('{}');
process.exit(0);
