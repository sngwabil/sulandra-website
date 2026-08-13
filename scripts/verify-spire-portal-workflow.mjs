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

requireMarkers(entry, ['SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2', '/spire/client-station.html', 'window.location.search', 'window.location.hash'], 'SPIRE root entry');
forbidMarkers(entry, ['/spire/portal.html', '/spire/master.html', 'spire-app-v2.js'], 'SPIRE root entry');

requireMarkers(station, [
  'SPIRE_CLIENT_STATION_LISTS_V2', 'Client Station', 'Client Lists', 'All My Clients',
  'Available Homes', 'stationClientBody', 'clientPreview',
  '/assets/spire-client-station.js?v=20260813-client-station-2',
  '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1',
], 'SPIRE Client Station');
forbidMarkers(station, ['Patient Lists', '>Patient Station<'], 'SPIRE Client Station');

requireMarkers(stationJs, [
  'SPIRE_CLIENT_STATION_LISTS_V2', '/api/spire/network/service-homes', '/access',
  "row.addEventListener('dblclick'", 'openChart', 'openChat',
  'localStorage.setItem(HOME_ID_KEY', '/api/spire/inbasket-v2?status=OPEN',
], 'SPIRE Client Station runtime');
forbidMarkers(stationJs, ['/spire/portal.html', 'openChart(state.clients[0]'], 'SPIRE Client Station runtime');

requireMarkers(legacyStation, ['SPIRE_RETIRED_PATIENT_STATION_COMPAT_V1', '/spire/client-station.html'], 'Retired station compatibility entry');

// The chart must publish its live runtimes once. Runtime-owned features (#21,
// Secure Chat and live notifications) are verified below in those runtimes.
requireMarkers(master, [
  '/assets/spire-master-navigation.js?v=20260813-client-station-2',
  '/assets/spire-master-flowsheet-grid.js?v=20260813-inline-suggestions-2',
  '/assets/spire-flowsheet-frozen-pane.js?v=20260813-frozen-pane-1',
  '/assets/spire-screen-controls.js?v=20260813-live-controls-2',
  '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1',
  'id="flowsheets-view"', 'id="flowsheetGridContainer"', 'id="flowsheetTbody"',
], 'SPIRE chart master');

requireMarkers(navigationJs, ['SPIRE_MASTER_EXPLICIT_CLIENT_GATE_V2', "headers.set('x-spire-home-id', homeId)", '/spire/client-station.html', 'My Clients', 'Client Station'], 'SPIRE chart navigation');
forbidMarkers(navigationJs, ['/spire/portal.html'], 'SPIRE chart navigation');

requireMarkers(flowsheetJs, [
  'SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1', 'SPIRE_FLOWSHEET_TRANSACTIONAL_FILE_V2',
  'SPIRE_FLOWSHEET_INLINE_ENTRY_V3', 'SPIRE_FLOWSHEET_FRIENDLY_ACTOR_V1',
  '#flowsheetTbody', '.flowsheet-table', '/flowsheet-workspace/file', 'filePending', 'hasPending',
], 'SPIRE transactional Flowsheet');
forbidMarkers(flowsheetJs, [
  "entry?.recordedByDisplayName || entry?.recordedById",
  "entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedById",
  'SPIRE Patient Station before using Flowsheets',
], 'SPIRE transactional Flowsheet');

requireMarkers(frozenPaneJs, ['SPIRE_FLOWSHEET_FROZEN_PANE_V1', 'position:sticky', 'MutationObserver'], 'SPIRE frozen Flowsheet pane');

requireMarkers(screenJs, [
  'SPIRE_SCREEN_CONTROLS_LIVE_V2', '/api/spire/inbasket-v2?status=OPEN',
  '/spire/secure-chat.html', 'Secure Chat', 'Alerts & Reminders',
], 'SPIRE live chart controls');
forbidMarkers(screenJs, ['Opening Staff Messaging Portal', 'Notifications: 3 unread reminders for current client.'], 'SPIRE live chart controls');

requireMarkers(preferencesJs, [
  'SPIRE_USER_WORKSPACE_PREFERENCES_V2', '21. Full-Screen Workspace',
  'spire:accessibility:fullscreen', 'spire:accessibility:preset',
  'fullscreenPreferred', 'requestFullscreen', 'pointerdown',
], 'SPIRE shared preferences');

requireMarkers(fileRoute, [
  "app.post('/api/spire/patients/:patientId/flowsheet-workspace/file'", 'prisma.$transaction',
  'FLOWSHEET_FILE_COMMITTED', 'FLOWSHEET_ENTRY_AMENDED',
  'Only the user who originally filed this flowsheet entry can amend it',
], 'SPIRE transactional File backend');
requireMarkers(injector, [
  'registerSpireFlowsheetFileRoutes(app, prisma, { authOf });',
  'registerSpireNetworkHomeAccessRoutes(app, prisma, { authOf });',
  'registerSpireCommunicationsInBasketRoutes(app, prisma, { authOf });',
], 'SPIRE route injector');

for (const [label, source] of [
  ['Client Station', stationJs], ['chart navigation', navigationJs], ['Flowsheet', flowsheetJs],
  ['frozen pane', frozenPaneJs], ['live controls', screenJs], ['shared preferences', preferencesJs],
]) {
  try { new Function(source); }
  catch (error) { failures.push(`SPIRE ${label} JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`); }
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
  console.error('SPIRE Client Station workflow verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('SPIRE Client Station workflow verified: remembered authorized home, explicit client chart entry, live Secure Chat/In Basket, shared display/full-screen preferences, and friendly Flowsheet filing metadata.');
