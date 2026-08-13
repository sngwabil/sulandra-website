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

const [
  entry, station, legacyStation, master, stationJs, navigationJs, flowsheetJs,
  frozenPaneJs, screenJs, preferencesJs, fileRoute, injector,
] = await Promise.all([
  readDist('spire.html'),
  readDist('spire/client-station.html'),
  readDist('spire/patient-station.html'),
  readDist('spire/master.html'),
  readDist('assets/spire-client-station.js'),
  readDist('assets/spire-master-navigation.js'),
  readDist('assets/spire-master-flowsheet-grid.js'),
  readDist('assets/spire-flowsheet-frozen-pane.js'),
  readDist('assets/spire-screen-controls.js'),
  readDist('assets/spire-user-preferences.js'),
  readSource('api/src/spire-flowsheet-file-routes.ts'),
  readSource('scripts/inject-clinical-routes.mjs'),
]);

requireMarkers(entry, [
  'SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2',
  '/spire/client-station.html', 'window.location.search', 'window.location.hash',
], 'SPIRE root entry');
forbidMarkers(entry, ['/spire/portal.html', '/spire/master.html', 'spire-app-v2.js'], 'SPIRE root entry');

requireMarkers(station, [
  'SPIRE_CLIENT_STATION_LISTS_V2', 'Client Station', 'Client Lists', 'All My Clients',
  'Available Homes', 'stationClientBody', 'clientPreview',
  '/assets/spire-client-station.js?v=20260813-client-station-2',
  '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1',
], 'SPIRE Client Station');
forbidMarkers(station, ['Patient Lists', '>Patient Station<'], 'SPIRE Client Station');

requireMarkers(stationJs, [
  'SPIRE_CLIENT_STATION_LISTS_V2', "api('/api/spire/network/service-homes')",
  '/api/spire/network/service-homes/${encodeURIComponent(state.homeId)}/access',
  "row.addEventListener('dblclick'", 'openChart', 'openChat',
  'localStorage.setItem(HOME_ID_KEY', '/api/spire/inbasket-v2?status=OPEN',
], 'SPIRE Client Station runtime');
forbidMarkers(stationJs, [
  '/spire/portal.html', 'openChart(state.clients[0]', 'location.assign(chartUrl(state.clients[0]',
], 'SPIRE Client Station runtime');

requireMarkers(legacyStation, ['SPIRE_RETIRED_PATIENT_STATION_COMPAT_V1', '/spire/client-station.html'], 'Retired station compatibility entry');

requireMarkers(master, [
  '/assets/spire-master-navigation.js?v=20260813-client-station-2',
  '/assets/spire-master-flowsheet-grid.js?v=20260813-inline-suggestions-2',
  '/assets/spire-flowsheet-frozen-pane.js?v=20260813-frozen-pane-1',
  '/assets/spire-screen-controls.js?v=20260813-live-controls-2',
  '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1',
  'id="flowsheets-view"', 'class="flowsheet-sub-toolbar"', 'class="flowsheet-main-layout"',
  'id="flowsheetTreeMenu"', 'id="flowsheetGridContainer"', 'class="flowsheet-table"',
  'id="headerTimeRow"', 'id="headerDateRow"', 'id="flowsheetTbody"',
  '21. Full-Screen Workspace',
], 'SPIRE chart master/client flowsheet layout');
forbidMarkers(master, [
  "alert('Opening Staff Messaging Portal...')",
  "alert('Notifications: 3 unread reminders for current client.')",
], 'SPIRE chart master');

requireMarkers(navigationJs, [
  'SPIRE_MASTER_EXPLICIT_CLIENT_GATE_V2', "headers.set('x-spire-home-id', homeId)",
  '/spire/client-station.html', "clientListButton.textContent = '👥 My Clients'",
  "stationButton.textContent = '👥 Client Station'", "homes.textContent = '🏘️ Homes'",
], 'SPIRE chart navigation');
forbidMarkers(navigationJs, ['/spire/portal.html', '🩺 Patient Station'], 'SPIRE chart navigation');

requireMarkers(flowsheetJs, [
  'SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1', 'SPIRE_FLOWSHEET_FILE_WORKFLOW_V1',
  'SPIRE_FLOWSHEET_TRANSACTIONAL_FILE_V2', 'SPIRE_USER_MASTER_FLOWSHEET_LAYOUT_V1',
  'SPIRE_FLOWSHEET_INLINE_ENTRY_V3', 'SPIRE_FLOWSHEET_FRIENDLY_ACTOR_V1',
  'restoreAuthoritativeToolbar', '#flowsheetTbody', '.flowsheet-table',
  'Residential HPC Flowsheet', 'data-flow-editor', 'suggestionsForRow', 'isNumericRow',
  'positionPopoverBesideCell', 'Suggestions only', '/flowsheet-workspace/file',
  'filePending', 'hasPending', 'Save Comment to Box', 'is-draft-amendment',
  'filed-amendment', 'Nothing was filed:', 'SPIRE Client Station before using Flowsheets',
], 'SPIRE inline client-master staged transactional flowsheet');
forbidMarkers(flowsheetJs, [
  'flow-file-toolbar', 'flow-layout', 'flow-tree', 'scheduleSave(cell)',
  'setTimeout(() => saveCell', "addEventListener('focusout'", 'saveCell(cell, { force: true })',
  "entry?.recordedByDisplayName || entry?.recordedById",
  "entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedById",
  'SPIRE Patient Station before using Flowsheets',
], 'SPIRE inline client-master staged transactional flowsheet');

requireMarkers(frozenPaneJs, [
  'SPIRE_FLOWSHEET_FROZEN_PANE_V1', 'grid-template-columns:245px minmax(0,1fr)',
  '.flowsheet-grid-container', 'position:sticky', 'flow-section-label',
  'flow-section-scroll-fill', 'splitSectionRow', 'MutationObserver',
], 'SPIRE frozen flowsheet pane');

requireMarkers(screenJs, [
  'SPIRE_SCREEN_CONTROLS_LIVE_V2', '/api/spire/inbasket-v2?status=OPEN',
  '/spire/secure-chat.html', 'Secure Chat', 'Alerts & Reminders',
], 'SPIRE live chart controls');
forbidMarkers(screenJs, ['Opening Staff Messaging Portal', 'Notifications: 3 unread reminders for current client.'], 'SPIRE live chart controls');

requireMarkers(preferencesJs, [
  'SPIRE_USER_WORKSPACE_PREFERENCES_V1', 'spire:accessibility:fullscreen',
  'fullscreenPreferred', 'requestFullscreen', 'pointerdown',
], 'SPIRE shared display/full-screen preferences');

requireMarkers(fileRoute, [
  "app.post('/api/spire/patients/:patientId/flowsheet-workspace/file'", 'prisma.$transaction',
  'FLOWSHEET_FILE_COMMITTED', 'FLOWSHEET_ENTRY_FILED', 'FLOWSHEET_ENTRY_AMENDED',
  'Only the user who originally filed this flowsheet entry can amend it', 'SELECT/options are advisory suggestions',
], 'SPIRE transactional File backend');
forbidMarkers(fileRoute, ['Choose an allowed value for', 'options.includes(value)'], 'SPIRE transactional File backend');
requireMarkers(injector, [
  "import { registerSpireFlowsheetFileRoutes } from './spire-flowsheet-file-routes.js';",
  'registerSpireFlowsheetFileRoutes(app, prisma, { authOf });',
  'registerSpireNetworkHomeAccessRoutes(app, prisma, { authOf });',
  'registerSpireCommunicationsInBasketRoutes(app, prisma, { authOf });',
], 'SPIRE route injector');

for (const [label, source] of [
  ['SPIRE Client Station runtime', stationJs], ['SPIRE chart navigation', navigationJs],
  ['SPIRE inline client-master flowsheet', flowsheetJs], ['SPIRE frozen flowsheet pane', frozenPaneJs],
  ['SPIRE live chart controls', screenJs], ['SPIRE shared preferences', preferencesJs],
]) {
  try { new Function(source); }
  catch (error) { failures.push(`${label} JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

for (const [pattern, label] of [
  [/spire-master-navigation\.js/g, 'navigation'],
  [/spire-master-flowsheet-grid\.js/g, 'flowsheet'],
  [/spire-flowsheet-frozen-pane\.js/g, 'frozen-pane'],
  [/spire-screen-controls\.js/g, 'live-controls'],
  [/spire-user-preferences\.js/g, 'shared-preferences'],
]) {
  const count = (master.match(pattern) || []).length;
  if (count !== 1) failures.push(`SPIRE chart must publish ${label} exactly once; found ${count}`);
}

if (failures.length) {
  console.error('SPIRE Client Station/inline flowsheet verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('SPIRE Client Station workflow verified: remembered authorized home, explicit client chart entry, frozen user-master flowsheet, friendly filed-by metadata, live Secure Chat/In Basket controls, and shared display/full-screen preferences.');
