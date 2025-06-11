import { build } from 'esbuild';

build({
  entryPoints: ['back-end-cf/index.ts'], // 主入口
  outfile: 'back-end-cf/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2020',
  external: ['cloudflare:workers'],
}).catch(() => process.exit(1));
