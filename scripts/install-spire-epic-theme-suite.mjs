import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'SPIRE_EPIC_THEME_SUITE_V1';
const assetPath = path.join(root, 'assets', 'spire-epic-theme-suite.js');
const targetFiles = [
  'spire/client-station.html',
  'spire/master.html',
  'spire/secure-chat.html',
  'spire/flowsheets.html',
];
const scriptTag = `<script src="/assets/spire-epic-theme-suite.js?v=20260815-epic-theme-suite-1" data-spire-epic-theme-suite="${marker}"></script>`;

await access(assetPath);
const themeRuntime = await readFile(assetPath, 'utf8');
for (const required of [marker, 'Altitude', 'Lavender', 'Verdant', 'Deep Blue', 'Amethyst', 'Carbon', 'Dark Room', 'High Contrast', 'spire:epic-theme-suite:preset']) {
  if (!themeRuntime.includes(required)) throw new Error(`SPIRE Epic theme suite runtime missing ${required}`);
}
const syntax = spawnSync(process.execPath, ['--check', assetPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`SPIRE Epic theme suite syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

for (const relative of targetFiles) {
  const filePath = path.join(root, relative);
  let html = await readFile(filePath, 'utf8');
  if (!html.includes('/assets/spire-epic-theme-suite.js')) {
    if (!html.includes('</body>')) throw new Error(`${relative} does not contain </body> for Epic theme suite publication`);
    html = html.replace('</body>', `  ${scriptTag}\n</body>`);
    await writeFile(filePath, html, 'utf8');
  }
  const verified = await readFile(filePath, 'utf8');
  if (!verified.includes('/assets/spire-epic-theme-suite.js') || !verified.includes(marker)) {
    throw new Error(`SPIRE Epic theme suite was not published to ${relative}`);
  }
}

// Run after the earlier MAR publication normalizer. This intentionally restores the
// proven single-renderer MAR architecture and cache-busts the browser away from the
// invasive duplicate timeline runtime that can lock the chart.
await import('./stabilize-spire-mar-runtime.mjs');

console.log('SPIRE Epic theme suite installed: Altitude, Lavender, Verdant, Deep Blue, Amethyst, Carbon, Dark Room, and High Contrast are published across Client Station, chart, Secure Chat, and Flowsheets; canonical MAR stability guard applied.');
