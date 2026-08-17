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
await import('./fix-spire-mar-single-owner-v5.mjs');
await import('./fix-spire-orders-workspace-v6.mjs');
await import('./fix-spire-orders-medication-name-v7.mjs');

const marker = 'SPIRE_EPIC_THEME_SUITE_V1';
const workstationMarker = 'SPIRE_WORKSTATION_RUNTIME_V4';
const darkroomMarker = 'SPIRE_DARKROOM_CONTRAST_V2';
const darkroomRepairMarker = 'SPIRE_DARKROOM_REPAIR_V3';
const ordersMedicationNameMarker = 'SPIRE_ORDERS_MEDICATION_NAME_V7';
const assetPath = path.join(root, 'assets', 'spire-epic-theme-suite.js');
const workstationAssetPath = path.join(root, 'assets', 'spire-workstation-runtime-v4.js');
const darkroomAssetPath = path.join(root, 'assets', 'spire-darkroom-surface-coverage.js');
const darkroomRepairAssetPath = path.join(root, 'assets', 'spire-darkroom-repair-v3.js');
const masterPath = path.join(root, 'spire', 'master.html');
const targetFiles = [
  'spire/client-station.html',
  'spire/master.html',
  'spire/secure-chat.html',
  'spire/flowsheets.html',
];
const scriptTag = `<script src="/assets/spire-epic-theme-suite.js?v=20260815-epic-theme-suite-1" data-spire-epic-theme-suite="${marker}"></script>`;
const workstationScriptTag = `<script src="/assets/spire-workstation-runtime-v4.js?v=20260816-workstation-v4-1" data-spire-workstation-runtime="${workstationMarker}"></script>`;
const darkroomScriptTag = `<script src="/assets/spire-darkroom-surface-coverage.js?v=20260816-darkroom-surfaces-2" data-spire-darkroom-surfaces="${darkroomMarker}"></script>`;
const darkroomRepairScriptTag = `<script src="/assets/spire-darkroom-repair-v3.js?v=20260816-darkroom-repair-v3-2" data-spire-darkroom-repair="${darkroomRepairMarker}"></script>`;

await access(assetPath);
await access(workstationAssetPath);
await access(darkroomAssetPath);
await access(darkroomRepairAssetPath);
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

const darkroomRuntime = await readFile(darkroomAssetPath, 'utf8');
for (const required of [darkroomMarker, 'SPIRE_DARKROOM_SURFACE_COVERAGE_V1', 'data-spire-epic-theme="darkRoom"', '.workspace-view:not(#mar-view)', '#hpAdmissionModal', 'SpireDarkRoomSurfaceCoverage']) {
  if (!darkroomRuntime.includes(required)) throw new Error(`SPIRE Dark Room contrast runtime missing ${required}`);
}
const darkroomSyntax = spawnSync(process.execPath, ['--check', darkroomAssetPath], { encoding: 'utf8' });
if (darkroomSyntax.status !== 0) throw new Error(`SPIRE Dark Room contrast syntax failed: ${(darkroomSyntax.stderr || darkroomSyntax.stdout || '').trim()}`);

const darkroomRepairRuntime = await readFile(darkroomRepairAssetPath, 'utf8');
for (const required of [darkroomRepairMarker, '#mar-view .spire-mar-v4', '#summary-view', 'SpireDarkRoomRepairV3', 'hasBrightBackground', 'backgroundImage', 'spire-darkroom-v3-summary-surface']) {
  if (!darkroomRepairRuntime.includes(required)) throw new Error(`SPIRE Dark Room repair V3 runtime missing ${required}`);
}
if (/SpireMarTimelineContract|wakeCanonicalMarTimeline|loadCanonicalMarView/.test(darkroomRepairRuntime)) {
  throw new Error('SPIRE Dark Room repair V3 must remain visual-only and cannot own MAR rendering');
}
const darkroomRepairSyntax = spawnSync(process.execPath, ['--check', darkroomRepairAssetPath], { encoding: 'utf8' });
if (darkroomRepairSyntax.status !== 0) throw new Error(`SPIRE Dark Room repair V3 syntax failed: ${(darkroomRepairSyntax.stderr || darkroomRepairSyntax.stdout || '').trim()}`);

const transformedMaster = await readFile(masterPath, 'utf8');
for (const required of ['SPIRE_MAR_SINGLE_OWNER_V5', 'SPIRE_ORDERS_WORKSPACE_RECOVERY_V6', ordersMedicationNameMarker, 'data-spire-orders-loading="true"', 'data-spire-orders-live="true"', "m?.medicationName || m?.name || m?.displayName || m?.order?.medicationName || m?.order?.name || 'Medication'", "['flowsheets-view','notes-view','manage-orders-view']"]) {
  if (!transformedMaster.includes(required)) throw new Error(`SPIRE transformed chart missing ${required}`);
}
if (transformedMaster.includes('esc(medicationName(m))')) {
  throw new Error('SPIRE transformed chart still contains the removed MAR medicationName dependency in Orders');
}

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
  if (html.includes('/assets/spire-darkroom-surface-coverage.js')) {
    html = html.replace(/<script src="\/assets\/spire-darkroom-surface-coverage\.js\?v=[^"]+" data-spire-darkroom-surfaces="[^"]+"><\/script>/g, darkroomScriptTag);
  } else {
    if (!html.includes('</body>')) throw new Error(`${relative} does not contain </body> for Dark Room contrast publication`);
    html = html.replace('</body>', `  ${darkroomScriptTag}\n</body>`);
  }
  if (html.includes('/assets/spire-darkroom-repair-v3.js')) {
    html = html.replace(/<script src="\/assets\/spire-darkroom-repair-v3\.js\?v=[^"]+" data-spire-darkroom-repair="[^"]+"><\/script>/g, darkroomRepairScriptTag);
  } else {
    if (!html.includes('</body>')) throw new Error(`${relative} does not contain </body> for Dark Room repair V3 publication`);
    html = html.replace('</body>', `  ${darkroomRepairScriptTag}\n</body>`);
  }
  await writeFile(filePath, html, 'utf8');

  const verified = await readFile(filePath, 'utf8');
  if (!verified.includes('/assets/spire-epic-theme-suite.js') || !verified.includes(marker)) {
    throw new Error(`SPIRE Epic theme suite was not published to ${relative}`);
  }
  if (!verified.includes('/assets/spire-workstation-runtime-v4.js') || !verified.includes(workstationMarker)) {
    throw new Error(`SPIRE workstation runtime was not published to ${relative}`);
  }
  if (!verified.includes('/assets/spire-darkroom-surface-coverage.js?v=20260816-darkroom-surfaces-2') || !verified.includes(darkroomMarker)) {
    throw new Error(`SPIRE Dark Room contrast V2 was not published to ${relative}`);
  }
  if (!verified.includes('/assets/spire-darkroom-repair-v3.js?v=20260816-darkroom-repair-v3-2') || !verified.includes(darkroomRepairMarker)) {
    throw new Error(`SPIRE Dark Room repair V3 gradient patch was not published to ${relative}`);
  }
}

console.log('SPIRE Epic theme suite, workstation runtime, Dark Room contrast V2 + repair V3 gradient patch, Orders V7 medication-name recovery, and canonical single-owner MAR installed across Client Station, chart, Secure Chat, and Flowsheets.');
