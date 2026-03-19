import { build } from 'esbuild';
import { readdirSync } from 'fs';
import { join } from 'path';

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
  external: ['@anthropic-ai/claude-agent-sdk'],
});

console.log(`Built ${entryPoints.length} entry points to dist/`);
