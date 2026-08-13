// Standalone S.P.I.R.E. portal/chart publication finalizer.
// The public entry is the Clinical Access Portal. The master is chart-only and
// is reached only after explicit company, home and patient selection.
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const sourceEntryPath = path.join(root, 'spire.html');
const publishedEntryPath = path.join(dist, 'spire.html');
const publishedPortalPath = path.join(dist, 'spire', 'portal.html');
const publishedMasterPath = path.join(dist, 'spire', 'master.html');
const portalRuntimePath = path.join(dist, 'assets', 'spire-portal.js');
const navigationRuntimePath = path.join(dist, 'assets', 'spire-master-navigation.js');
const flowsheetRuntimePath = path.join(dist, 'assets', 'spire-master-flowsheet-grid.js');
const transactionalFileRoutePath = path.join(root, 'api', 'src', 'spire-flowsheet-file-routes.ts');
const navigationUrl = '/assets/spire-master-navigation.js?v=20260813-portal-workflow-1';
const flowsheetUrl = '/assets/spire-master-flowsheet-grid.js?v=20260813-file-transaction-2';

for (const file of [publishedPortalPath, publishedMasterPath, portalRuntimePath, navigationRuntimePath, flowsheetRuntimePath, transactionalFileRoutePath]) {
  await stat(file);
}

// Final publication always restores the root launcher from canonical source so
// no post-build legacy finalizer can turn /spire.html back into a chart shell.
await writeFile(publishedEntryPath, await readFile(sourceEntryPath, 'utf8'), 'utf8');

let master = await readFile(publishedMasterPath, 'utf8');
master = master
  .replace(/\s*<script src="\/assets\/spire-master-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-master-flowsheet-grid\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
if (!master.includes('</body>')) throw new Error('Standalone SPIRE master has no closing body tag');
master = master.replace('</body>', `  <script src="${navigationUrl}"></script>\n  <script src="${flowsheetUrl}"></script>\n</body>`);
await writeFile(publishedMasterPath, master, 'utf8');

const [entry, portal, finalMaster, portalRuntime, navigationRuntime, flowsheetRuntime, transactionalFileRoute] = await Promise.all([
  readFile(publishedEntryPath, 'utf8'),
  readFile(publishedPortalPath, 'utf8'),
  readFile(publishedMasterPath, 'utf8'),
  readFile(portalRuntimePath, 'utf8'),
  readFile(navigationRuntimePath, 'utf8'),
  readFile(flowsheetRuntimePath, 'utf8'),
  readFile(transactionalFileRoutePath, 'utf8'),
]);

for (const marker of ['/spire/portal.html', 'window.location.search', 'window.location.hash', 'SPIRE_CANONICAL_PORTAL_ENTRY_V1']) {
  if (!entry.includes(marker)) throw new Error(`Canonical /spire.html portal entry is missing ${marker}`);
}
for (const legacyAsset of [
  'spire-app-v2.js', 'spire-canonical-bootstrap.js', 'spire-shell-resilience.js',
  'spire-chart-ready.js', 'spire-deep-link.js', 'spire-flowsheet-workspace-launcher.js',
  'spire-workspace-completion.js', 'spire-workspace-stability.js', 'spire-workspace-polish.js',
  'spire-note-cosigner-polish.js', 'spire-workspace-loop-guard.js', 'spire-workspace-loop-restore.js',
]) {
  if (entry.includes(legacyAsset)) throw new Error(`Legacy SPIRE runtime re-entered /spire.html: ${legacyAsset}`);
}

for (const marker of ['SPIRE_PORTAL_WORKFLOW_V1', 'Select Company', 'Select Service Home', 'Patient Station', '/assets/spire-portal.js?v=20260813-portal-workflow-1']) {
  if (!portal.includes(marker)) throw new Error(`SPIRE portal is missing ${marker}`);
}
for (const marker of ['/api/entity-context', '/api/spire/network/service-homes', '/access', 'dblclick', 'Open Selected Chart']) {
  if (!portalRuntime.includes(marker)) throw new Error(`SPIRE portal runtime is missing ${marker}`);
}
if (portalRuntime.includes('openSelectedChart();\n      }\n    }\n    setStep(\'patient\')')) {
  throw new Error('SPIRE portal may not automatically open a patient after service-home selection');
}

for (const marker of ['id="flowsheets-view"', navigationUrl, flowsheetUrl, 'window.SpireMasterFlowsheetGrid']) {
  if (!finalMaster.includes(marker)) throw new Error(`Standalone SPIRE chart is missing ${marker}`);
}
if ((finalMaster.match(/spire-master-navigation\.js/g) || []).length !== 1) throw new Error('SPIRE master navigation runtime must be published exactly once');
if ((finalMaster.match(/spire-master-flowsheet-grid\.js/g) || []).length !== 1) throw new Error('SPIRE master flowsheet runtime must be published exactly once');

for (const marker of ['SPIRE_MASTER_EXPLICIT_PATIENT_GATE_V1', "if (!patientId || !homeId)", "headers.set('x-spire-home-id', homeId)", 'My Clients', 'Homes', 'Patient Station']) {
  if (!navigationRuntime.includes(marker)) throw new Error(`SPIRE master explicit-patient navigation is missing ${marker}`);
}
for (const marker of [
  'SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1',
  'SPIRE_FLOWSHEET_FILE_WORKFLOW_V1',
  'SPIRE_FLOWSHEET_TRANSACTIONAL_FILE_V2',
  '/flowsheet-workspace/file',
  'filePending',
  'hasPending',
  'Save Comment to Box',
  'UNFILED AMENDMENT',
  'Filed by',
  'Nothing was filed.',
]) {
  if (!flowsheetRuntime.includes(marker)) throw new Error(`SPIRE transactional File runtime is missing ${marker}`);
}
for (const forbidden of ['setTimeout(() => saveCell', 'scheduleSave(cell)', "addEventListener('focusout',", "saveCell(cell, { force: true })", '/flowsheet-workspace/entries/${encodeURIComponent(draft.entryId)}']) {
  if (flowsheetRuntime.includes(forbidden)) throw new Error(`SPIRE flowsheet direct/autosave behavior returned: ${forbidden}`);
}

for (const marker of [
  "app.post('/api/spire/patients/:patientId/flowsheet-workspace/file'",
  'prisma.$transaction',
  'FLOWSHEET_FILE_COMMITTED',
  'FLOWSHEET_ENTRY_AMENDED',
  'Only the user who originally filed this flowsheet entry can amend it',
]) {
  if (!transactionalFileRoute.includes(marker)) throw new Error(`SPIRE transactional File backend is missing ${marker}`);
}

// Existing master actions still call loadFlowsheetsView(). It must delegate to
// the authoritative runtime and must never rebuild the retired continuous UI.
const loaderStart = finalMaster.indexOf('  async function loadFlowsheetsView(groupOverride) {');
const rendererStart = finalMaster.indexOf('  function renderFlowsheet(host) {', loaderStart);
if (loaderStart < 0 || rendererStart < 0) throw new Error('Standalone SPIRE flowsheet compatibility loader could not be verified');
const loaderSource = finalMaster.slice(loaderStart, rendererStart);
if (!loaderSource.includes('window.SpireMasterFlowsheetGrid')) throw new Error('Master flowsheet loader does not delegate to SpireMasterFlowsheetGrid');
for (const forbidden of ['Loading continuous flowsheet', 'renderFlowsheet(host);', 'state.flowColumns = keys.slice(-8)']) {
  if (loaderSource.includes(forbidden)) throw new Error(`Retired continuous flowsheet behavior is still reachable: ${forbidden}`);
}

await import('./verify-spire-portal-workflow.mjs');
console.log('Final SPIRE publication verified: login/session -> company -> service home -> Patient Station -> explicit chart; Flowsheets stage locally and commit atomically only when File is pressed.');
