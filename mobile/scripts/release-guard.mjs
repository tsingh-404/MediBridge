// Fails the build if a dev-only setting would ship in a release.
//
// `server.url` points the app at a live-reload server instead of its own bundle;
// if it survives into a store build the app breaks the moment that machine goes
// away. The cleartext exemption must likewise stay inside src/debug/.
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const problems = [];

const cfg = JSON.parse(await readFile(path.join(mobile, 'capacitor.config.json'), 'utf8'));
if (cfg.server?.url) problems.push(`capacitor.config.json has server.url = ${cfg.server.url}`);
if (cfg.server?.cleartext) problems.push('capacitor.config.json has server.cleartext = true');
if (cfg.android?.allowMixedContent) {
  problems.push(
    'capacitor.config.json has android.allowMixedContent = true — dev-only. ' +
      'Point MB_API_BASE at an https:// origin and remove it.'
  );
}

const releaseManifest = path.join(mobile, 'android/app/src/release/AndroidManifest.xml');
try {
  await access(releaseManifest);
  const m = await readFile(releaseManifest, 'utf8');
  if (/cleartextTrafficPermitted|usesCleartextTraffic/.test(m)) {
    problems.push('android release manifest permits cleartext traffic');
  }
} catch {
  /* no release overlay — fine */
}

const mainManifest = path.join(mobile, 'android/app/src/main/AndroidManifest.xml');
const main = await readFile(mainManifest, 'utf8');
if (/usesCleartextTraffic="true"|networkSecurityConfig/.test(main)) {
  problems.push('android MAIN manifest carries a cleartext/network-security override (debug-only setting leaked)');
}

if (problems.length) {
  console.error('release-guard failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('release-guard: ok');
