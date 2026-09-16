// Renders the app icon and splash from the SPA's own design language — the
// "spark" mark used by the loading screen (ui/app.jsx) and the brand palette
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

const SPARK = `<path d="M12 3l1.8 5.5L19 10l-5.2 1.5L12 17l-1.8-5.5L5 10l5.2-1.5L12 3z"
  stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>`;

// Foreground is drawn inside the middle ~60% so Android's adaptive-icon mask
// never clips the mark.
const page = ({ size, bg, color, scale, ring, svg }) => `<!doctype html><html><head><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
  body{background:${bg};display:flex;align-items:center;justify-content:center}
  .mark{width:${Math.round(size * scale)}px;height:${Math.round(size * scale)}px;color:${color};
        display:flex;align-items:center;justify-content:center;
        ${ring ? `background:linear-gradient(140deg,#e8f8ff 0%,#d8f5f6 45%,#ffedd6 100%);
                  border-radius:${Math.round(size * 0.13)}px;` : ''}}
  svg{width:${svg ?? 66}%;height:${svg ?? 66}%}
</style></head><body>
  <div class="mark"><svg viewBox="0 0 24 24">${SPARK}</svg></div>
</body></html>`;

const TARGETS = [
  // Full-bleed store/legacy icon.
  { file: 'icon.png', size: 1024, html: page({ size: 1024, bg: '#F5F6F0', color: '#004264', scale: 0.94, ring: true, svg: 60 }) },
  // Adaptive-icon layers (Android).
  { file: 'icon-foreground.png', size: 1024, html: page({ size: 1024, bg: 'transparent', color: '#004264', scale: 0.60, ring: false, svg: 100 }) },
  { file: 'icon-background.png', size: 1024, html: page({ size: 1024, bg: '#F5F6F0', color: 'transparent', scale: 0.01, ring: false }) },
  // Splash: mark on the app's own background, so the handover to the in-app
  // loading state is seamless.
  { file: 'splash.png', size: 2732, html: page({ size: 2732, bg: '#F5F6F0', color: '#004264', scale: 0.22, ring: true }) },
  { file: 'splash-dark.png', size: 2732, html: page({ size: 2732, bg: '#131714', color: '#dbf3ff', scale: 0.22, ring: false }) },
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
