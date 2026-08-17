import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./optimize-spire-workspace-rendering.mjs');
await import('./harden-spire-patient-transition.mjs');
await import('./fix-spire-workspace-navigation.mjs');
await import('./fix-spire-stable-workspace-selectors.mjs');
await import('./fix-spire-workspace-performance.mjs');
await import('./fix-spire-workstation-v4.mjs');

const marker = 'SPIRE_EPIC_THEME_SUITE_V1';
const workstationMarker = 'SPIRE_WORKSTATION_RUNTIME_V4';
const assetPath = path.join(root, 'assets', 'spire-epic-theme-suite.js');
const workstationAssetPath = path.join(root, 'assets', 'spire-workstation-runtime-v4.js');
const targetFiles = [
  'spire/client-station.html',
  'spire/master.html',
  'spire/secure-chat.html',
  'spire/flowsheets.html',
];
const scriptTag = `<script src="/assets/spire-epic-theme-suite.js?v=20260815-epic-theme-suite-1" data-spire-epic-theme-suite="${marker}"></script>`;
const workstationScriptTag = `<script src="/assets/spire-workstation-runtime-v4.js?v=20260816-workstation-v4-1" data-spire-workstation-runtime="${workstationMarker}"></script>`;

await access(assetPath);
await access(workstationAssetPath);
const themeRuntime = await readFile(assetPath, 'utf8');
for (const required of [marker, 'Altitude', 'Lavender', 'Verdant', 'Deep Blue', 'Amethyst', 'Carbon', 'Dark Room', 'High Contrast', 'spire:epic-theme-suite:preset']) {
  if (!themeRuntime.includes(required)) throw new Error(`SPIRE Epic theme suite runtime missing ${required}`);
}
const syntax = spawnSync(process.execPath, ['--check', assetPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`SPIRE Epic theme suite syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

const workstationRuntime = await readFile(workstationAssetPath, 'utf8');
for (const required of [workstationMarker, 'data-spire-app-fullscreen', 'SpireUserPreferences', 'applyWorkstationViewport', '.flowsheet-table tbody td:first-child']) {
  if (!workstationRuntime.includes(required)) throw new Error(`SPIRE workstation runtime missing ${required}`);
}
if (workstationRuntime.includes('stopImmediatePropagation') || workstationRuntime.includes('ROOT.requestFullscreen')) {
  throw new Error('SPIRE workstation runtime must delegate browser-native fullscreen to the authenticated shell/preferences owner');
}
const workstationSyntax = spawnSync(process.execPath, ['--check', workstationAssetPath], { encoding: 'utf8' });
if (workstationSyntax.status !== 0) throw new Error(`SPIRE workstation runtime syntax failed: ${(workstationSyntax.stderr || workstationSyntax.stdout || '').trim()}`);

for (const relative of targetFiles) {
  const filePath = path.join(root, relative);
  let html = await readFile(filePath, 'utf8');
  if (!html.includes('/assets/spire-epic-theme-suite.js')) {
    if (!html.includes('</body>')) throw new Error(`${relative} does not contain </body> for Epic theme suite publication`);
    html = html.replace('</body>', `  ${scriptTag}\n</body>`);
  }
  if (!html.includes('/assets/spire-workstation-runtime-v4.js')) {
    if (!html.includes('</body>')) throw new Error(`${relative} does not contain </body> for workstation runtime publication`);
    html = html.replace('</body>', `  ${workstationScriptTag}\n</body>`);
  }
  await writeFile(filePath, html, 'utf8');

  const verified = await readFile(filePath, 'utf8');
  if (!verified.includes('/assets/spire-epic-theme-suite.js') || !verified.includes(marker)) {
    throw new Error(`SPIRE Epic theme suite was not published to ${relative}`);
  }
  if (!verified.includes('/assets/spire-workstation-runtime-v4.js') || !verified.includes(workstationMarker)) {
    throw new Error(`SPIRE workstation runtime was not published to ${relative}`);
  }
}

console.log('SPIRE Epic theme suite and workstation runtime installed across Client Station, chart, Secure Chat, and Flowsheets.');
