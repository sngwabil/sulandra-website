import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const sourceEntry = path.join(root, 'spire.html');
const entryPath = path.join(dist, 'spire.html');
const loginPath = path.join(dist, 'spire', 'login.html');
const stationPath = path.join(dist, 'spire', 'client-station.html');
const legacyStationPath = path.join(dist, 'spire', 'patient-station.html');
const chatPath = path.join(dist, 'spire', 'secure-chat.html');
const masterPath = path.join(dist, 'spire', 'master.html');

const loginRuntimePath = path.join(dist, 'assets', 'spire-login.js');
const preferencePath = path.join(dist, 'assets', 'spire-user-preferences.js');
const navigationPath = path.join(dist, 'assets', 'spire-master-navigation.js');
const flowsheetPath = path.join(dist, 'assets', 'spire-master-flowsheet-grid.js');
const frozenPath = path.join(dist, 'assets', 'spire-flowsheet-frozen-pane.js');
const screenPath = path.join(dist, 'assets', 'spire-screen-controls.js');
const medicationPath = path.join(dist, 'assets', 'spire-medication-order-entry.js');
const medicationV2Path = path.join(dist, 'assets', 'spire-medication-order-entry-v2.js');
const medicationPolicyPath = path.join(dist, 'assets', 'spire-medication-management-policy.js');
const medicationRowControlsPath = path.join(dist, 'assets', 'spire-medication-row-controls.js');
const marTimelinePath = path.join(dist, 'assets', 'spire-mar-timeline.js');
const screenCssPath = path.join(dist, 'assets', 'spire-screen-controls.css');

const preferenceUrl = '/assets/spire-user-preferences.js?v=20260813-exact-workflow-1';
const navigationUrl = '/assets/spire-master-navigation.js?v=20260813-client-station-2';
const flowsheetUrl = '/assets/spire-master-flowsheet-grid.js?v=20260813-inline-suggestions-2';
const frozenUrl = '/assets/spire-flowsheet-frozen-pane.js?v=20260813-frozen-pane-1';
const screenUrl = '/assets/spire-screen-controls.js?v=20260813-live-controls-2';
const medicationUrl = '/assets/spire-medication-order-entry.js?v=20260816-med-order-canonical-loader-3';
const marTimelineUrl = '/assets/spire-mar-timeline.js?v=20260813-mar-timeline-2';
const screenCssUrl = '/assets/spire-screen-controls.css?v=20260813-live-controls-2';

for (const file of [
  sourceEntry, entryPath, loginPath, stationPath, legacyStationPath, chatPath, masterPath,
  loginRuntimePath, preferencePath, navigationPath, flowsheetPath, frozenPath, screenPath,
  medicationPath, medicationV2Path, medicationPolicyPath, medicationRowControlsPath,
  marTimelinePath, screenCssPath,
]) await stat(file);

await writeFile(entryPath, await readFile(sourceEntry, 'utf8'), 'utf8');

let master = await readFile(masterPath, 'utf8');
master = master
  .replace(/\s*<script src="\/assets\/spire-user-preferences\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-master-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-master-flowsheet-grid\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-flowsheet-frozen-pane\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-screen-controls\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-medication-order-entry\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-mar-timeline\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<link[^>]+href="\/assets\/spire-screen-controls\.css(?:\?v=[^"']+)?"[^>]*>\s*/g, '\n');
if (!master.includes('</head>') || !master.includes('</body>')) throw new Error('SPIRE master publication requires closing head/body tags');
master = master.replace('</head>', `  <link rel="stylesheet" href="${screenCssUrl}">\n  <script src="${preferenceUrl}"></script>\n</head>`);
master = master.replace('</body>', `  <script src="${navigationUrl}"></script>\n  <script src="${flowsheetUrl}"></script>\n  <script src="${frozenUrl}"></script>\n  <script src="${screenUrl}"></script>\n  <script src="${medicationUrl}"></script>\n  <script src="${marTimelineUrl}"></script>\n</body>`);
await writeFile(masterPath, master, 'utf8');

const [
  entry, login, station, legacyStation, chat, publishedMaster, loginRuntime, preference,
  navigation, flowsheet, frozen, screen, medication, medicationV2, medicationPolicy,
  medicationRowControls, marTimeline,
] = await Promise.all([
  readFile(entryPath, 'utf8'), readFile(loginPath, 'utf8'), readFile(stationPath, 'utf8'),
  readFile(legacyStationPath, 'utf8'), readFile(chatPath, 'utf8'), readFile(masterPath, 'utf8'),
  readFile(loginRuntimePath, 'utf8'), readFile(preferencePath, 'utf8'), readFile(navigationPath, 'utf8'),
  readFile(flowsheetPath, 'utf8'), readFile(frozenPath, 'utf8'), readFile(screenPath, 'utf8'),
  readFile(medicationPath, 'utf8'), readFile(medicationV2Path, 'utf8'), readFile(medicationPolicyPath, 'utf8'),
  readFile(medicationRowControlsPath, 'utf8'), readFile(marTimelinePath, 'utf8'),
]);

for (const marker of ['SPIRE_CANONICAL_LOGIN_ENTRY_V3', '/spire/login.html', 'window.location.search', 'window.location.hash']) {
  if (!entry.includes(marker)) throw new Error(`SPIRE root login entry missing ${marker}`);
}
for (const marker of ['SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1', 'spireWorkspaceFrame', '/assets/spire-login.js?v=20260813-exact-workflow-1']) {
  if (!login.includes(marker)) throw new Error(`SPIRE authentication shell missing ${marker}`);
}
for (const marker of ['SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1', '/api/auth/me', '/employee-login.html?returnTo=', '/spire/client-station.html', 'restoreRememberedHome']) {
  if (!loginRuntime.includes(marker)) throw new Error(`SPIRE authentication runtime missing ${marker}`);
}
for (const marker of ['SPIRE_CLIENT_STATION_LISTS_V2', 'Client Station', 'Client Lists', 'Available Homes', 'stationClientBody', 'data-spire-fullscreen-control']) {
  if (!station.includes(marker)) throw new Error(`SPIRE Client Station publication missing ${marker}`);
}
if (station.includes('Patient Lists') || station.includes('>Patient Station<')) throw new Error('Client Station still exposes retired Patient Station terminology');
for (const marker of ['SPIRE_RETIRED_PATIENT_STATION_COMPAT_V1', '/spire/client-station.html']) {
  if (!legacyStation.includes(marker)) throw new Error(`Retired Patient Station compatibility route missing ${marker}`);
}
for (const marker of ['SPIRE_SECURE_CHAT_V2', 'Secure Chat', '← Client Station', 'Client-scoped']) {
  if (!chat.includes(marker)) throw new Error(`SPIRE Secure Chat publication missing ${marker}`);
}

for (const [pattern, label] of [
  [/src="\/assets\/spire-user-preferences\.js(?:\?[^"']*)?"/g, 'shared preferences'],
  [/src="\/assets\/spire-master-navigation\.js(?:\?[^"']*)?"/g, 'Client Station navigation'],
  [/src="\/assets\/spire-master-flowsheet-grid\.js(?:\?[^"']*)?"/g, 'Flowsheet'],
  [/src="\/assets\/spire-flowsheet-frozen-pane\.js(?:\?[^"']*)?"/g, 'frozen pane'],
  [/src="\/assets\/spire-screen-controls\.js(?:\?[^"']*)?"/g, 'live controls'],
  [/src="\/assets\/spire-medication-order-entry\.js(?:\?[^"']*)?"/g, 'canonical medication order loader'],
  [/src="\/assets\/spire-mar-timeline\.js(?:\?[^"']*)?"/g, 'MAR timeline'],
]) {
  const count = (publishedMaster.match(pattern) || []).length;
  if (count !== 1) throw new Error(`SPIRE master must publish ${label} exactly once; found ${count}`);
}
if (!publishedMaster.includes(medicationUrl)) throw new Error('SPIRE master is not cache-pinned to the canonical medication order loader');

for (const marker of [
  'SPIRE_USER_WORKSPACE_PREFERENCES_V4', 'clientStation:', 'spire:accessibility:preset',
  'spire:accessibility:fullscreen', 'fullscreenPreferred', 'requestFullscreen', 'userScope'
]) {
  if (!preference.includes(marker)) throw new Error(`SPIRE authenticated-user preference runtime missing ${marker}`);
}
for (const marker of ["title:'#0f172a'", "toolbar:'#f4510b'", "background:'#eaf7fb'", "cyan:'#5bd0e7'", "nav:'#082f49'"]) {
  if (!preference.includes(marker)) throw new Error(`SPIRE theme #21 Client Station palette missing ${marker}`);
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
for (const marker of ['SPIRE_SCREEN_CONTROLS_LIVE_V2', '/api/spire/inbasket-v2?status=OPEN', '/spire/secure-chat.html', 'Secure Chat', 'Alerts & Reminders']) {
  if (!screen.includes(marker)) throw new Error(`SPIRE live chart controls missing ${marker}`);
}

// Medication Orders has exactly one current owner. The published loader waits for
// the Orders workspace and loads V2 once. The old per-row Manage runtime remains
// as a disabled compatibility shim only.
for (const marker of [
  'SPIRE_MEDICATION_ORDER_CANONICAL_LOADER_V3',
  'spire-medication-order-entry-v2.js?v=20260816-med-order-v2-canonical-2',
  "window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true",
  "document.getElementById('manage-orders-view')",
]) {
  if (!medication.includes(marker)) throw new Error(`SPIRE canonical medication loader missing ${marker}`);
}
if (medication.includes('observe(document.documentElement')) throw new Error('SPIRE canonical medication loader must not observe the whole document');
for (const marker of [
  'SPIRE_MEDICATION_ORDER_ENTRY_V2',
  '+ Add Medication Order',
  'Manage Orders',
  'data-spire-med-order-actions',
  '/api/spire/medication-orders-v2/',
]) {
  if (!medicationV2.includes(marker)) throw new Error(`SPIRE medication Orders V2 runtime missing ${marker}`);
}
for (const marker of ['SPIRE_MEDICATION_TOP_MANAGE_ONLY_V1', 'window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true', '[data-spire-manage-medication-orders]']) {
  if (!medicationPolicy.includes(marker)) throw new Error(`SPIRE medication management policy missing ${marker}`);
}
for (const marker of ['SPIRE_MEDICATION_ROW_CONTROLS_DISABLED_V2', 'window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true']) {
  if (!medicationRowControls.includes(marker)) throw new Error(`SPIRE retired row-control shim missing ${marker}`);
}
if (medicationRowControls.includes('spire-med-row-manage\';') || medicationRowControls.includes('openManageFor(')) {
  throw new Error('SPIRE retired row-control shim must not create per-medication Manage buttons');
}

for (const marker of ['SPIRE_MAR_TIMELINE_V3', 'Go to Now', 'Medication / Order', 'Completed / Inactive Medications']) {
  if (!marTimeline.includes(marker)) throw new Error(`SPIRE MAR timeline runtime missing ${marker}`);
}
for (const forbidden of ['Opening Staff Messaging Portal', 'Notifications: 3 unread reminders for current client.']) {
  if (screen.includes(forbidden) || publishedMaster.includes(forbidden)) throw new Error(`SPIRE still contains fake messaging/notification behavior: ${forbidden}`);
}

for (const [label, source] of [
  ['login shell', loginRuntime], ['shared preferences', preference], ['chart navigation', navigation],
  ['Flowsheet', flowsheet], ['frozen pane', frozen], ['live controls', screen],
  ['canonical medication loader', medication], ['medication Orders V2', medicationV2],
  ['medication management policy', medicationPolicy], ['retired medication row controls', medicationRowControls],
  ['MAR timeline', marTimeline],
]) {
  try { new Function(source); }
  catch (error) { throw new Error(`SPIRE ${label} syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

console.log('SPIRE publication verified: authentication shell → Client Station → explicit client chart; medication Orders has one canonical V2 owner with one styled top Add Medication Order + Manage Orders toolbar; per-medication Manage controls are retired; MAR remains independently published.');
