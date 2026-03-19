#!/usr/bin/env node
/**
 * Dependency installer — runs during Setup hook.
 * Checks for node_modules, installs if missing.
 * Always outputs {} to stdout and exits 0.
 */
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || resolve(__dirname, '..');
const nodeModules = join(pluginRoot, 'node_modules');

try {
  if (!existsSync(nodeModules)) {
    process.stderr.write('[vault-sync] Installing dependencies...\n');
    execFileSync('npm', ['install', '--production', '--no-audit', '--no-fund'], {
      cwd: pluginRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
    });
    process.stderr.write('[vault-sync] Dependencies installed.\n');
  }

  // Build dist/ if missing
  const distDir = join(pluginRoot, 'dist');
  if (!existsSync(distDir)) {
    process.stderr.write('[vault-sync] Building hook scripts...\n');
    execFileSync('node', ['build.js'], {
      cwd: pluginRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    process.stderr.write('[vault-sync] Build complete.\n');
  }
} catch (err) {
  process.stderr.write(`[vault-sync] Install/build error: ${err.message}\n`);
}

// Always succeed — never block session start
console.log('{}');
process.exit(0);
