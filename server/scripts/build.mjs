import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// @synccall/shared no tiene su propio paso de compilación (se consume como TS fuente
// directamente en desarrollo, vía tsx/Vite). Por eso NO va en la lista de externals: esbuild
// lo empaqueta dentro de dist/server.js. Todo lo demás (dependencias npm reales) se deja
// externo y se resuelve desde node_modules en runtime, como en cualquier build de Node normal.
const external = Object.keys(pkg.dependencies).filter((name) => name !== '@synccall/shared');

await build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/server.js',
  sourcemap: true,
  external,
});
