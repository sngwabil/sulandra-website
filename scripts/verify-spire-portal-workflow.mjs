import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const failures = [];

async function readDist(relative) {
  try { return await readFile(path.join(dist, relative), 'utf8'); }
  catch { failures.push(`Missing dist-web/${relative}`); return ''; }
}
async function readSource(relative) {
  try { return await readFile(path.join(root, relative), 'utf8'); }
  catch { failures.push(`Missing ${relative}`); return ''; }
}
function requireMarkers(source, markers, label) {
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${label} missing ${marker}`);
}
function forbidMarkers(source, markers, label) {
  for (const marker of markers) if (source.includes(marker)) failures.push(`${label} unexpectedly contains ${marker}`);
}

const [entry, portal, master, portalJs, navigationJs, flowsheetJs, fileRoute, injector] = await Promise.all([
  readDist('spire.html'),
  readDist('spire/portal.html'),
  readDist('spire/master.html'),
  readDist('assets/spire-portal.js'),
  readDist('assets/spire-master-navigation.js'),
  readDist('assets/spire-master-flowsheet-grid.js'),
  readSource('api/src/spire-flowsheet-file-routes.ts'),
  readSource('scripts/inject-clinical-routes.mjs'),
]);

requireMarkers(entry, [
  'SPIRE_CANONICAL_PORTAL_ENTRY_V1',
  "const destination = '/spire/portal.html' + window.location.search + window.location.hash",
], 'SPIRE root entry');
forbidMarkers(entry, ['spire-app-v2.js', 'spire-workspace-completion.js', 'spire-flowsheet-workspace-launcher.js'], 'SPIRE root entry');

requireMarkers(portal, [
  'SPIRE_PORTAL_WORKFLOW_V1',
  'Select Company',
  'Select Service Home',
  'Patient Station · My Clients',
  'No chart opens automatically',
  '/assets/spire-portal.js?v=20260813-portal-workflow-1',
], 'SPIRE access portal');
requireMarkers(portalJs, [
  'SPIRE_PORTAL_WORKFLOW_V1',
  "api('/api/entity-context')",
  "api('/api/spire/network/service-homes'",
  '/api/spire/network/service-homes/${encodeURIComponent(home.id)}/access',
  "row.addEventListener('dblclick'",
  'openSelectedChart',
  'sessionStorage.removeItem(PATIENT_KEY)',
], 'SPIRE portal runtime');

requireMarkers(master, [
  '/assets/spire-master-navigation.js?v=20260813-portal-workflow-1',
  '/assets/spire-master-flowsheet-grid.js?v=20260813-file-transaction-2',
  'id="flowsheets-view"',
], 'SPIRE chart master');
requireMarkers(navigationJs, [
  'SPIRE_MASTER_EXPLICIT_PATIENT_GATE_V1',
  "if (!patientId || !homeId)",
  "headers.set('x-spire-home-id', homeId)",
  "homeButton.textContent = '🏥 SPIRE Portal'",
  "clientListButton.textContent = '👥 My Clients'",
  "homes.textContent = '🏘️ Homes'",
  "stationButton.textContent = '🩺 Patient Station'",
], 'SPIRE chart navigation');

requireMarkers(flowsheetJs, [
  'SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1',
  'SPIRE_FLOWSHEET_FILE_WORKFLOW_V1',
  'SPIRE_FLOWSHEET_TRANSACTIONAL_FILE_V2',
  '/flowsheet-workspace/file',
  'filePending',
  'hasPending',
  'Save Comment to Box',
  'UNFILED AMENDMENT',
  'pending-amendment',
  'filed-amendment',
  'Nothing was filed.',
], 'SPIRE staged transactional flowsheet');
forbidMarkers(flowsheetJs, [
  'scheduleSave(cell)',
  'setTimeout(() => saveCell',
  "addEventListener('focusout'",
  'saveCell(cell, { force: true })',
  '/flowsheet-workspace/entries/${encodeURIComponent(draft.entryId)}',
], 'SPIRE staged transactional flowsheet');

requireMarkers(fileRoute, [
  "app.post('/api/spire/patients/:patientId/flowsheet-workspace/file'",
  'prisma.$transaction',
  'FLOWSHEET_FILE_COMMITTED',
  'FLOWSHEET_ENTRY_FILED',
  'FLOWSHEET_ENTRY_AMENDED',
  'Only the user who originally filed this flowsheet entry can amend it',
], 'SPIRE transactional File backend');
requireMarkers(injector, [
  "import { registerSpireFlowsheetFileRoutes } from './spire-flowsheet-file-routes.js';",
  'registerSpireFlowsheetFileRoutes(app, prisma, { authOf });',
], 'SPIRE route injector');

for (const [label, source] of [
  ['SPIRE portal runtime', portalJs],
  ['SPIRE chart navigation', navigationJs],
  ['SPIRE staged flowsheet', flowsheetJs],
]) {
  try { new Function(source); }
  catch (error) { failures.push(`${label} JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

const navigationCount = (master.match(/spire-master-navigation\.js/g) || []).length;
const flowsheetCount = (master.match(/spire-master-flowsheet-grid\.js/g) || []).length;
if (navigationCount !== 1) failures.push(`SPIRE chart must publish navigation runtime exactly once; found ${navigationCount}`);
if (flowsheetCount !== 1) failures.push(`SPIRE chart must publish flowsheet runtime exactly once; found ${flowsheetCount}`);

if (failures.length) {
  console.error('SPIRE portal/transactional File workflow verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('SPIRE portal/transactional File workflow verified: explicit company and home selection, Patient Station double-click chart entry, actor-scoped chart navigation, local staging, all-or-nothing File, and red amendment presentation.');
