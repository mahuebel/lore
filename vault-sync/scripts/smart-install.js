#!/usr/bin/env node
/**
 * Dependency installer & builder — runs during Setup hook.
 * Ensures node_modules and dist/ are present and up-to-date.
 * Always outputs {} to stdout and exits 0.
 *
 * Uses __dirname for path resolution so it works regardless of
 * whether CLAUDE_PLUGIN_ROOT is set (it's unreliable in some hook contexts).
 */
import { existsSync, statSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, '..');

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
} catch (err) {
  process.stderr.write(`[vault-sync] Install/build error: ${err.message}\n`);
}

// Always succeed — never block session start
console.log('{}');
process.exit(0);
