// Compiles ../ui/*.jsx -> ../ui/js/*.js and vendors React locally.
//
// IMPORTANT: this is a TRANSFORM, not a bundle. The SPA in ../ui is a set of
// classic scripts that share globals (shell.jsx destructures React into the
// global lexical scope; every file ends with `window.X = X`). There is no
// import graph, so --bundle would emit a single entry and drop everything else.
// For the same reason identifier minification is disabled: top-level names
// cross file boundaries.
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const ui = path.join(root, 'ui');

// Load order matters and must match the <script> tags in ui/index.html.
const ENTRIES = [
  'tokens.js',
  'api.js',
  'native.js',
  'shell.jsx',
  'screens/onboarding.jsx',
  'screens/chat.jsx',
  'screens/calc.jsx',
  'screens/clinics-profile.jsx',
  'app.jsx',
  'boot.jsx',
];

await rm(path.join(ui, 'js'), { recursive: true, force: true });

await build({
  entryPoints: ENTRIES.map((f) => path.join(ui, f)),
  outdir: path.join(ui, 'js'),
  outbase: ui,
  bundle: false,
  jsx: 'transform',            // classic runtime -> React.createElement (UMD global)
  target: 'es2020',
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,    // must stay false: cross-file globals
  logLevel: 'info',
});

// Vendor React so the app has no runtime CDN dependency.
const vendor = path.join(ui, 'vendor');
await mkdir(vendor, { recursive: true });
await cp(
  path.join(here, '..', 'node_modules', 'react', 'umd', 'react.production.min.js'),
  path.join(vendor, 'react.production.min.js')
);
await cp(
  path.join(here, '..', 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'),
  path.join(vendor, 'react-dom.production.min.js')
);

console.log('build:web -> ui/js/ + ui/vendor/');
