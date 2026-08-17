import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const prerequisite of [
  './optimize-spire-workspace-rendering.mjs',
  './harden-spire-patient-transition.mjs',
  './fix-spire-workspace-navigation.mjs',
  './fix-spire-stable-workspace-selectors.mjs',
  './fix-spire-workspace-performance.mjs',
  './fix-spire-workstation-v4.mjs',
  './fix-spire-mar-single-owner-v5.mjs',
  './fix-spire-orders-workspace-v6.mjs',
  './fix-spire-orders-medication-name-v7.mjs',
]) {
  await import(prerequisite);
}

const marker = 'SPIRE_EPIC_THEME_SUITE_V1';
const workstationMarker = 'SPIRE_WORKSTATION_RUNTIME_V4';
const darkroomMarker = 'SPIRE_DARKROOM_CONTRAST_V2';
const darkroomRepairMarker = 'SPIRE_DARKROOM_REPAIR_V3';
const darkroomClinicalSurfacesMarker = 'SPIRE_DARKROOM_CLINICAL_SURFACES_V4';
const darkroomChromaticDepthMarker = 'SPIRE_DARKROOM_CHROMATIC_DEPTH_V5';
const darkroomFlowsheetLabelsMarker = 'SPIRE_DARKROOM_FLOWSHEET_LABELS_V6';
const ordersMedicationNameMarker = 'SPIRE_ORDERS_MEDICATION_NAME_V7';

const masterPath = path.join(root, 'spire', 'master.html');
const targetFiles = [
  'spire/client-station.html',
  'spire/master.html',
  'spire/secure-chat.html',
  'spire/flowsheets.html',
];

const assets = [
  {
    label: 'Epic theme suite',
    file: 'assets/spire-epic-theme-suite.js',
    src: '/assets/spire-epic-theme-suite.js',
    version: '20260815-epic-theme-suite-1',
    attr: 'data-spire-epic-theme-suite',
    marker,
    required: [marker, 'Altitude', 'Lavender', 'Verdant', 'Deep Blue', 'Amethyst', 'Carbon', 'Dark Room', 'High Contrast', 'spire:epic-theme-suite:preset'],
  },
  {
    label: 'workstation runtime',
    file: 'assets/spire-workstation-runtime-v4.js',
    src: '/assets/spire-workstation-runtime-v4.js',
    version: '20260816-workstation-v4-1',
    attr: 'data-spire-workstation-runtime',
    marker: workstationMarker,
    required: [workstationMarker, 'data-spire-app-fullscreen', 'SpireUserPreferences', 'applyWorkstationViewport', '.flowsheet-table tbody td:first-child'],
    forbidden: ['stopImmediatePropagation', 'ROOT.requestFullscreen'],
  },
  {
    label: 'Dark Room contrast V2',
    file: 'assets/spire-darkroom-surface-coverage.js',
    src: '/assets/spire-darkroom-surface-coverage.js',
    version: '20260816-darkroom-surfaces-2',
    attr: 'data-spire-darkroom-surfaces',
    marker: darkroomMarker,
    required: [darkroomMarker, 'SPIRE_DARKROOM_SURFACE_COVERAGE_V1', 'data-spire-epic-theme="darkRoom"', '.workspace-view:not(#mar-view)', '#hpAdmissionModal', 'SpireDarkRoomSurfaceCoverage'],
  },
  {
    label: 'Dark Room repair V3',
    file: 'assets/spire-darkroom-repair-v3.js',
    src: '/assets/spire-darkroom-repair-v3.js',
    version: '20260816-darkroom-repair-v3-2',
    attr: 'data-spire-darkroom-repair',
    marker: darkroomRepairMarker,
    required: [darkroomRepairMarker, '#mar-view .spire-mar-v4', '#summary-view', 'SpireDarkRoomRepairV3', 'hasBrightBackground', 'backgroundImage', 'spire-darkroom-v3-summary-surface'],
    visualOnly: true,
  },
  {
    label: 'Dark Room clinical surfaces V4',
    file: 'assets/spire-darkroom-clinical-surfaces-v4.js',
    src: '/assets/spire-darkroom-clinical-surfaces-v4.js',
    version: '20260816-darkroom-clinical-surfaces-v4-1',
    attr: 'data-spire-darkroom-clinical-surfaces',
    marker: darkroomClinicalSurfacesMarker,
    required: [darkroomClinicalSurfacesMarker, '#flowsheets-view', 'body[data-spire-client-station]', '.master-dialog', 'brightBackground', 'SpireDarkRoomClinicalSurfacesV4'],
    visualOnly: true,
  },
  {
    label: 'Dark Room chromatic depth V5',
    file: 'assets/spire-darkroom-chromatic-depth-v5.js',
    src: '/assets/spire-darkroom-chromatic-depth-v5.js',
    version: '20260816-darkroom-chromatic-depth-v5-1',
    attr: 'data-spire-darkroom-chromatic-depth',
    marker: darkroomChromaticDepthMarker,
    required: [darkroomChromaticDepthMarker, '--spire-v5-teal', '#flowsheets-view', '#notes-view', 'body[data-spire-client-station]', 'clinicalClass', 'SpireDarkRoomChromaticDepthV5'],
    visualOnly: true,
  },
  {
    label: 'Dark Room Flowsheet labels V6',
    file: 'assets/spire-darkroom-flowsheet-labels-v6.js',
    src: '/assets/spire-darkroom-flowsheet-labels-v6.js',
    version: '20260816-darkroom-flowsheet-labels-v6-1',
    attr: 'data-spire-darkroom-flowsheet-labels',
    marker: darkroomFlowsheetLabelsMarker,
    required: [darkroomFlowsheetLabelsMarker, '#flowsheetTable', 'style.setProperty', 'SpireDarkRoomFlowsheetLabelsV6', 'restoreAll'],
    visualOnly: true,
  },
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tagFor(asset) {
  return `<script src="${asset.src}?v=${asset.version}" ${asset.attr}="${asset.marker}"></script>`;
}

for (const asset of assets) {
  const assetPath = path.join(root, asset.file);
  await access(assetPath);
  const runtime = await readFile(assetPath, 'utf8');
  for (const required of asset.required) {
    if (!runtime.includes(required)) throw new Error(`SPIRE ${asset.label} runtime missing ${required}`);
  }
  for (const forbidden of asset.forbidden || []) {
    if (runtime.includes(forbidden)) throw new Error(`SPIRE ${asset.label} runtime contains forbidden ${forbidden}`);
  }
  if (asset.visualOnly && /SpireMarTimelineContract|wakeCanonicalMarTimeline|loadCanonicalMarView/.test(runtime)) {
    throw new Error(`SPIRE ${asset.label} must remain visual-only and cannot own MAR rendering`);
  }
  const syntax = spawnSync(process.execPath, ['--check', assetPath], { encoding: 'utf8' });
  if (syntax.status !== 0) {
    throw new Error(`SPIRE ${asset.label} syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);
  }
}

const transformedMaster = await readFile(masterPath, 'utf8');
for (const required of [
  'SPIRE_MAR_SINGLE_OWNER_V5',
  'SPIRE_ORDERS_WORKSPACE_RECOVERY_V6',
  ordersMedicationNameMarker,
  'data-spire-orders-loading="true"',
  'data-spire-orders-live="true"',
  "m?.medicationName || m?.name || m?.displayName || m?.order?.medicationName || m?.order?.name || 'Medication'",
  "['flowsheets-view','notes-view','manage-orders-view']",
]) {
  if (!transformedMaster.includes(required)) throw new Error(`SPIRE transformed chart missing ${required}`);
}
if (transformedMaster.includes('esc(medicationName(m))')) {
  throw new Error('SPIRE transformed chart still contains the removed MAR medicationName dependency in Orders');
}

for (const relative of targetFiles) {
  const filePath = path.join(root, relative);
  let html = await readFile(filePath, 'utf8');
  if (!html.includes('</body>')) throw new Error(`${relative} does not contain </body> for SPIRE theme publication`);

  for (const asset of assets) {
    const tag = tagFor(asset);
    if (html.includes(asset.src)) {
      const pattern = new RegExp(`<script src="${escapeRegExp(asset.src)}\\?v=[^"]+" ${escapeRegExp(asset.attr)}="[^"]+"><\\/script>`, 'g');
      html = html.replace(pattern, tag);
    } else {
      html = html.replace('</body>', `  ${tag}\n</body>`);
    }
  }

  await writeFile(filePath, html, 'utf8');

  const verified = await readFile(filePath, 'utf8');
  for (const asset of assets) {
    const expected = `${asset.src}?v=${asset.version}`;
    if (!verified.includes(expected) || !verified.includes(asset.marker)) {
      throw new Error(`SPIRE ${asset.label} was not published to ${relative}`);
    }
  }
}

console.log('SPIRE Epic theme suite, workstation runtime, Dark Room contrast V2 + repair V3 + clinical surfaces V4 + chromatic depth V5 + Flowsheet labels V6, Orders V7 medication-name recovery, and canonical single-owner MAR installed across Client Station, chart, Secure Chat, and Flowsheets.');
