// Renders the app icon and splash from the SPA's own design language — the
// bridge mark used by the loading screen (ui/app.jsx) and the brand palette
// from ui/tokens.js. The repo ships no image assets, so these are generated
// rather than sourced.
//
// Uses headless Chrome as the rasteriser (already required for verification);
// override with CHROME=/path/to/chrome.
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const srcDir = path.join(mobile, 'assets-src');
const outDir = path.join(mobile, 'assets');

const CHROME =
  process.env.CHROME ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Kept in step with Icon.mark in ui/shell.jsx: a deck on two piers over an arch.
const MARK = `<path d="M2.5 9h19"/><path d="M6.5 9v11"/><path d="M17.5 9v11"/>
  <path d="M6.5 17a5.5 5.5 0 0 1 11 0"/>`;

// The token values from the :root block in ui/index.html. Hardcoded because
// headless Chrome rasterises these pages standalone, with no stylesheet.
const CREAM = '#F5F6F0';
const ACCENT_SOFT = '#dbf3ff';
const ACCENT_INK = '#004264';
const INK = '#131714';

// `tile` reproduces the app's own loading lockup: the mark on a rounded
// accent-soft square. Foreground is drawn inside the middle ~60% so Android's
// adaptive-icon mask never clips the mark.
const page = ({ size, bg, color, scale, tile, svg }) => `<!doctype html><html><head><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
  body{background:${bg};display:flex;align-items:center;justify-content:center}
  .mark{width:${Math.round(size * scale)}px;height:${Math.round(size * scale)}px;color:${color};
        display:flex;align-items:center;justify-content:center;
        ${tile ? `background:${tile};
                  border-radius:${Math.round(size * scale * 0.22)}px;` : ''}}
  svg{width:${svg ?? 66}%;height:${svg ?? 66}%}
</style></head><body>
  <div class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${MARK}</svg></div>
</body></html>`;

const TARGETS = [
  // Full-bleed store/legacy icon.
  { file: 'icon.png', size: 1024, html: page({ size: 1024, bg: CREAM, color: ACCENT_INK, scale: 0.78, tile: ACCENT_SOFT, svg: 62 }) },
  // Adaptive-icon layers (Android).
  { file: 'icon-foreground.png', size: 1024, html: page({ size: 1024, bg: 'transparent', color: ACCENT_INK, scale: 0.60, svg: 100 }) },
  { file: 'icon-background.png', size: 1024, html: page({ size: 1024, bg: CREAM, color: 'transparent', scale: 0.01 }) },
  // Splash: mark on the app's own background, so the handover to the in-app
  // loading state is seamless.
  { file: 'splash.png', size: 2732, html: page({ size: 2732, bg: CREAM, color: ACCENT_INK, scale: 0.16, tile: ACCENT_SOFT, svg: 62 }) },
  { file: 'splash-dark.png', size: 2732, html: page({ size: 2732, bg: INK, color: ACCENT_SOFT, scale: 0.16, svg: 62 }) },
];

await mkdir(srcDir, { recursive: true });
await mkdir(outDir, { recursive: true });

for (const t of TARGETS) {
  const htmlPath = path.join(srcDir, t.file.replace('.png', '.html'));
  await writeFile(htmlPath, t.html, 'utf8');
  const outPath = path.join(outDir, t.file);
  await rm(outPath, { force: true });
  await run(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    ...(t.html.includes('background:transparent') ? ['--default-background-color=00000000'] : []),
    `--window-size=${t.size},${t.size}`,
    `--screenshot=${outPath}`,
    pathToFileURL(htmlPath).href,
  ]);
  console.log(`  ${t.file}  ${t.size}x${t.size}`);
}
console.log('make-art -> mobile/assets/');
