// Build the separate aggregate-only analytics dashboard bundle. This does not
// write to ui/ or any Capacitor/mobile output directory.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = path.join(root, 'analytics_ui');
const output = path.join(root, 'src', 'medibridge', 'analytics_demo', 'static');
const fontSource = path.join(root, 'ui', 'fonts');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: [path.join(source, 'app.jsx')],
  outfile: path.join(output, 'dashboard.js'),
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  nodePaths: [path.join(root, 'mobile', 'node_modules')],
  logLevel: 'info',
});
await cp(path.join(source, 'styles.css'), path.join(output, 'dashboard.css'));
await cp(path.join(source, 'index.html'), path.join(output, 'index.html'));
for (const filename of [
  'cabinet-grotesk-700.woff2',
  'general-sans-400.woff2',
  'general-sans-600.woff2',
  'jetbrains-mono-500-latin.woff2',
]) {
  await cp(path.join(fontSource, filename), path.join(output, filename));
}
console.log(`build:analytics -> ${path.relative(root, output)}`);
