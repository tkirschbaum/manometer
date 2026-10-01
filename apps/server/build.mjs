// Bundles the server into dist/index.js. @pulse/shared (TypeScript source) is bundled in;
// every other dependency stays external and is loaded from node_modules at runtime.
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].filter(
  (name) => name !== '@pulse/shared',
);

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: deps.flatMap((name) => [name, `${name}/*`]),
  logLevel: 'info',
});
cpSync('src/db/migrations', 'dist/migrations', { recursive: true });
console.log('server built: dist/index.js (+ migrations)');
