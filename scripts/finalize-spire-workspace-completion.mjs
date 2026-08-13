// Standalone S.P.I.R.E. publication finalizer.
//
// Historical versions of this script injected the legacy spire-app-v2/workspace
// completion stack back into dist-web/spire.html after build-static-site.mjs had
// already published the canonical redirect. That recreated a second SPIRE
// frontend and allowed the retired continuous flowsheet renderer to compete with
// /spire/master.html. The standalone master is now the only frontend authority.

import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const sourceEntryPath = path.join(root, 'spire.html');
const publishedEntryPath = path.join(dist, 'spire.html');
const publishedMasterPath = path.join(dist, 'spire', 'master.html');
const masterGridAssetPath = path.join(dist, 'assets', 'spire-master-flowsheet-grid.js');
const masterGridVersion = '20260813-dsp-daily-grid-3';
const masterGridUrl = `/assets/spire-master-flowsheet-grid.js?v=${masterGridVersion}`;

// Restore the root entry from its canonical source at the final publication
// stage. No later SPIRE finalizer is allowed to turn /spire.html into an app.
const sourceEntry = await readFile(sourceEntryPath, 'utf8');
await writeFile(publishedEntryPath, sourceEntry, 'utf8');

let master = await readFile(publishedMasterPath, 'utf8');
await stat(masterGridAssetPath);

// Force a fresh browser/CDN generation of the authoritative DSP grid runtime.
master = master.replace(
  /\/assets\/spire-master-flowsheet-grid\.js\?v=[^"']+/g,
  masterGridUrl,
);
await writeFile(publishedMasterPath, master, 'utf8');

const entry = await readFile(publishedEntryPath, 'utf8');
const finalMaster = await readFile(publishedMasterPath, 'utf8');

for (const marker of [
  '/spire/master.html',
  'window.location.search',
  'window.location.hash',
]) {
  if (!entry.includes(marker)) {
    throw new Error(`Canonical /spire.html entry is missing ${marker}`);
  }
}

for (const legacyAsset of [
  'spire-app-v2.js',
  'spire-canonical-bootstrap.js',
  'spire-shell-resilience.js',
  'spire-chart-ready.js',
  'spire-deep-link.js',
  'spire-flowsheet-workspace-launcher.js',
  'spire-workspace-completion.js',
  'spire-workspace-stability.js',
  'spire-workspace-polish.js',
  'spire-note-cosigner-polish.js',
  'spire-workspace-loop-guard.js',
  'spire-workspace-loop-restore.js',
]) {
  if (entry.includes(legacyAsset)) {
    throw new Error(`Legacy SPIRE runtime re-entered canonical /spire.html: ${legacyAsset}`);
  }
}

for (const marker of [
  'id="flowsheets-view"',
  'SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1',
  'window.SpireMasterFlowsheetGrid',
  masterGridUrl,
]) {
  if (!finalMaster.includes(marker)) {
    throw new Error(`Standalone SPIRE master flowsheet authority is missing ${marker}`);
  }
}

// The compatibility loader may remain because existing master actions call it,
// but it must delegate to the new grid and must never rebuild the retired UI.
const loaderStart = finalMaster.indexOf('  async function loadFlowsheetsView(groupOverride) {');
const rendererStart = finalMaster.indexOf('  function renderFlowsheet(host) {', loaderStart);
if (loaderStart < 0 || rendererStart < 0) {
  throw new Error('Standalone SPIRE flowsheet compatibility loader could not be verified.');
}
const loaderSource = finalMaster.slice(loaderStart, rendererStart);
for (const forbidden of [
  'Loading continuous flowsheet',
  'renderFlowsheet(host);',
  'state.flowColumns = keys.slice(-8)',
]) {
  if (loaderSource.includes(forbidden)) {
    throw new Error(`Retired continuous flowsheet behavior is still reachable: ${forbidden}`);
  }
}
if (!loaderSource.includes('window.SpireMasterFlowsheetGrid')) {
  throw new Error('Flowsheets compatibility loader does not delegate to SpireMasterFlowsheetGrid.');
}

console.log(
  'Final SPIRE publication verified: /spire.html is a redirect only, /spire/master.html is authoritative, and the server-backed DSP Daily Documentation grid is the sole master Flowsheets renderer.'
);
