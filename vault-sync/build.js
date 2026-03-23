import { build } from 'esbuild';
import { readdirSync, readFileSync, cpSync, mkdirSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

const hookFiles = readdirSync(join('src', 'hooks'))
  .filter(f => f.endsWith('.ts'))
  .map(f => `src/hooks/${f}`);

const entryPoints = [
  'src/daemon.ts',
  ...hookFiles,
];

await build({
  entryPoints,
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outExtension: { '.js': '.cjs' },
  banner: { js: '#!/usr/bin/env node' },
  define: {
    '__PLUGIN_VERSION__': JSON.stringify(pkg.version),
  },
  // Agent SDK is bundled so it's available in hook child processes
});

// Copy dashboard HTML to dist
mkdirSync(join('dist', 'ui'), { recursive: true });
try {
  cpSync(join('ui', 'dashboard.html'), join('dist', 'ui', 'dashboard.html'));
  console.log('Copied dashboard.html to dist/ui/');
} catch {
  console.log('Note: ui/dashboard.html not found, skipping copy');
}

console.log(`Built ${entryPoints.length} entry points to dist/`);
