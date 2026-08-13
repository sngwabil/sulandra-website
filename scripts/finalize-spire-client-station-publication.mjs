import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// One publication owner for the live SPIRE browser surfaces. Source architecture
// is normalized before dist-web is created; this script only publishes the live
// runtimes once and verifies their structural contracts.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');

const sourceEntry = path.join(root, 'spire.html');
const entryPath = path.join(dist, 'spire.html');
const stationPath = path.join(dist, 'spire', 'client-station.html');
const legacyStationPath = path.join(dist, 'spire', 'patient-station.html');
const chatPath = path.join(dist, 'spire', 'secure-chat.html');
const masterPath = path.join(dist, 'spire', 'master.html');

const preferencePath = path.join(dist, 'assets', 'spire-user-preferences.js');
const navigationPath = path.join(dist, 'assets', 'spire-master-navigation.js');
const flowsheetPath = path.join(dist, 'assets', 'spire-master-flowsheet-grid.js');
const frozenPath = path.join(dist, 'assets', 'spire-flowsheet-frozen-pane.js');
const screenPath = path.join(dist, 'assets', 'spire-screen-controls.js');
const screenCssPath = path.join(dist, 'assets', 'spire-screen-controls.css');

const preferenceUrl = '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1';
const navigationUrl = '/assets/spire-master-navigation.js?v=20260813-client-station-2';
const flowsheetUrl = '/assets/spire-master-flowsheet-grid.js?v=20260813-inline-suggestions-2';
const frozenUrl = '/assets/spire-flowsheet-frozen-pane.js?v=20260813-frozen-pane-1';
const screenUrl = '/assets/spire-screen-controls.js?v=20260813-live-controls-2';
const screenCssUrl = '/assets/spire-screen-controls.css?v=20260813-live-controls-2';

for (const file of [
  sourceEntry, entryPath, stationPath, legacyStationPath, chatPath, masterPath,
  preferencePath, navigationPath, flowsheetPath, frozenPath, screenPath, screenCssPath,
]) await stat(file);

// Root SPIRE always reflects the canonical Client Station source even if another
// generic finalizer touched dist-web earlier in the same build.
await writeFile(entryPath, await readFile(sourceEntry, 'utf8'), 'utf8');

let master = await readFile(masterPath, 'utf8');
master = master
  .replace(/\s*<script src="\/assets\/spire-user-preferences\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-master-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-master-flowsheet-grid\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-flowsheet-frozen-pane\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-screen-controls\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<link[^>]+href="\/assets\/spire-screen-controls\.css(?:\?v=[^"']+)?"[^>]*>\s*/g, '\n');

if (!master.includes('</head>') || !master.includes('</body>')) {
  throw new Error('SPIRE master publication requires closing head and body tags');
}
master = master.replace('</head>', `  <link rel="stylesheet" href="${screenCssUrl}">\n  <script src="${preferenceUrl}"></script>\n</head>`);
master = master.replace('</body>', `  <script src="${navigationUrl}"></script>\n  <script src="${flowsheetUrl}"></script>\n  <script src="${frozenUrl}"></script>\n  <script src="${screenUrl}"></script>\n</body>`);
await writeFile(masterPath, master, 'utf8');

const [entry, station, legacyStation, chat, publishedMaster, preference, navigation, flowsheet, frozen, screen] = await Promise.all([
  readFile(entryPath, 'utf8'),
  readFile(stationPath, 'utf8'),
  readFile(legacyStationPath, 'utf8'),
  readFile(chatPath, 'utf8'),
  readFile(masterPath, 'utf8'),
  readFile(preferencePath, 'utf8'),
  readFile(navigationPath, 'utf8'),
  readFile(flowsheetPath, 'utf8'),
  readFile(frozenPath, 'utf8'),
  readFile(screenPath, 'utf8'),
]);

for (const marker of ['SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2', '/spire/client-station.html', 'window.location.search', 'window.location.hash']) {
  if (!entry.includes(marker)) throw new Error(`SPIRE root publication missing ${marker}`);
}
for (const marker of ['SPIRE_CLIENT_STATION_LISTS_V2', 'Client Station', 'Client Lists', 'Available Homes', 'stationClientBody']) {
  if (!station.includes(marker)) throw new Error(`SPIRE Client Station publication missing ${marker}`);
}
if (station.includes('Patient Lists') || station.includes('>Patient Station<')) {
  throw new Error('SPIRE Client Station still exposes retired Patient Station terminology');
}
for (const marker of ['SPIRE_RETIRED_PATIENT_STATION_COMPAT_V1', '/spire/client-station.html']) {
  if (!legacyStation.includes(marker)) throw new Error(`Retired Patient Station compatibility route missing ${marker}`);
}
for (const marker of ['SPIRE_SECURE_CHAT_V2', 'Secure Chat', '← Client Station', 'Client-scoped']) {
  if (!chat.includes(marker)) throw new Error(`SPIRE Secure Chat publication missing ${marker}`);
}

for (const [pattern, label] of [
  [/spire-user-preferences\.js/g, 'shared preferences'],
  [/spire-master-navigation\.js/g, 'Client Station chart navigation'],
  [/spire-master-flowsheet-grid\.js/g, 'Flowsheet'],
  [/spire-flowsheet-frozen-pane\.js/g, 'frozen pane'],
  [/spire-screen-controls\.js/g, 'live controls'],
]) {
  const count = (publishedMaster.match(pattern) || []).length;
  if (count !== 1) throw new Error(`SPIRE master must publish ${label} exactly once; found ${count}`);
}

for (const marker of ['SPIRE_USER_WORKSPACE_PREFERENCES_V1', 'spire:accessibility:fullscreen', 'fullscreenPreferred', 'requestFullscreen']) {
  if (!preference.includes(marker)) throw new Error(`SPIRE shared preference runtime missing ${marker}`);
}
for (const marker of ['SPIRE_MASTER_EXPLICIT_CLIENT_GATE_V2', '/spire/client-station.html', "headers.set('x-spire-home-id', homeId)"]) {
  if (!navigation.includes(marker)) throw new Error(`SPIRE chart navigation runtime missing ${marker}`);
}
for (const marker of ['SPIRE_FLOWSHEET_FRIENDLY_ACTOR_V1', '/flowsheet-workspace/file', 'hasPending']) {
  if (!flowsheet.includes(marker)) throw new Error(`SPIRE Flowsheet runtime missing ${marker}`);
}
for (const marker of ['SPIRE_FLOWSHEET_FROZEN_PANE_V1', 'MutationObserver']) {
  if (!frozen.includes(marker)) throw new Error(`SPIRE frozen-pane runtime missing ${marker}`);
}
for (const marker of ['SPIRE_SCREEN_CONTROLS_LIVE_V2', '/api/spire/inbasket-v2?status=OPEN', '/spire/secure-chat.html', 'Secure Chat']) {
  if (!screen.includes(marker)) throw new Error(`SPIRE live chart controls missing ${marker}`);
}
for (const forbidden of ['Opening Staff Messaging Portal', 'Notifications: 3 unread reminders for current client.']) {
  if (screen.includes(forbidden)) throw new Error(`SPIRE live chart controls contain fake alert behavior: ${forbidden}`);
}

for (const [label, source] of [
  ['shared preferences', preference], ['chart navigation', navigation], ['Flowsheet', flowsheet],
  ['frozen pane', frozen], ['live controls', screen],
]) {
  try { new Function(source); }
  catch (error) { throw new Error(`SPIRE ${label} syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

console.log('SPIRE publication finalized once: Client Station entry, explicit client chart, Secure Chat/live In Basket, shared display/full-screen preferences, and friendly Flowsheet filing metadata.');
