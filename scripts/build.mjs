import { build as buildServer } from 'esbuild';
import { build as buildFrontend } from 'vite';

await buildFrontend();

await buildServer({
  entryPoints: ['server.ts'],
  outfile: 'server.js',
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node22',
});
