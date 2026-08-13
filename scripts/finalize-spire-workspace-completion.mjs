// Standalone S.P.I.R.E. Client Station/chart publication finalizer.
// /spire.html opens Client Station. The chart master remains chart-only and is
// reached only after explicit client selection from an authorized service home.
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const sourceEntryPath = path.join(root, 'spire.html');
const publishedEntryPath = path.join(dist, 'spire.html');
const publishedStationPath = path.join(dist, 'spire', 'client-station.html');
const publishedMasterPath = path.join(dist, 'spire', 'master.html');
const navigationRuntimePath = path.join(dist, 'assets', 'spire-master-navigation.js');
const flowsheetRuntimePath = path.join(dist, 'assets', 'spire-master-flowsheet-grid.js');
const frozenPaneRuntimePath = path.join(dist, 'assets', 'spire-flowsheet-frozen-pane.js');
const screenRuntimePath = path.join(dist, 'assets', 'spire-screen-controls.js');
const preferencesRuntimePath = path.join(dist, 'assets', 'spire-user-preferences.js');
const screenCssPath = path.join(dist, 'assets', 'spire-screen-controls.css');
const transactionalFileRoutePath = path.join(root, 'api', 'src', 'spire-flowsheet-file-routes.ts');

const navigationUrl = '/assets/spire-master-navigation.js?v=20260813-client-station-2';
const flowsheetUrl = '/assets/spire-master-flowsheet-grid.js?v=20260813-inline-suggestions-2';
const frozenPaneUrl = '/assets/spire-flowsheet-frozen-pane.js?v=20260813-frozen-pane-1';
const screenUrl = '/assets/spire-screen-controls.js?v=20260813-live-controls-2';
const preferencesUrl = '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1';
const screenCssUrl = '/assets/spire-screen-controls.css?v=20260813-live-controls-2';

for (const file of [
  publishedStationPath, publishedMasterPath, navigationRuntimePath, flowsheetRuntimePath,
  frozenPaneRuntimePath, screenRuntimePath, preferencesRuntimePath, screenCssPath,
  transactionalFileRoutePath,
]) await stat(file);

// Root publication is always copied from the canonical source after all source
// repair scripts have run.
await writeFile(publishedEntryPath, await readFile(sourceEntryPath, 'utf8'), 'utf8');

let master = await readFile(publishedMasterPath, 'utf8');

// Publish each chart runtime exactly once. The shared preference runtime executes
// in <head> so theme/full-screen preference is ready before the chart controls.
master = master
  .replace(/\s*<script src="\/assets\/spire-master-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-master-flowsheet-grid\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-flowsheet-frozen-pane\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-screen-controls\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/spire-user-preferences\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<link[^>]+href="\/assets\/spire-screen-controls\.css(?:\?v=[^"']+)?"[^>]*>\s*/g, '\n');

if (!master.includes('</head>') || !master.includes('</body>')) {
  throw new Error('Standalone SPIRE master must contain head and body closing tags');
}
master = master.replace('</head>', `  <link rel="stylesheet" href="${screenCssUrl}">\n  <script src="${preferencesUrl}"></script>\n</head>`);
master = master.replace('</body>', `  <script src="${navigationUrl}"></script>\n  <script src="${flowsheetUrl}"></script>\n  <script src="${frozenPaneUrl}"></script>\n  <script src="${screenUrl}"></script>\n</body>`);
await writeFile(publishedMasterPath, master, 'utf8');

const [entry, station, finalMaster, navigationRuntime, flowsheetRuntime, frozenPaneRuntime, screenRuntime, preferencesRuntime, transactionalFileRoute] = await Promise.all([
  readFile(publishedEntryPath, 'utf8'),
  readFile(publishedStationPath, 'utf8'),
  readFile(publishedMasterPath, 'utf8'),
  readFile(navigationRuntimePath, 'utf8'),
  readFile(flowsheetRuntimePath, 'utf8'),
  readFile(frozenPaneRuntimePath, 'utf8'),
  readFile(screenRuntimePath, 'utf8'),
  readFile(preferencesRuntimePath, 'utf8'),
  readFile(transactionalFileRoutePath, 'utf8'),
]);

for (const marker of [
  'SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2', '/spire/client-station.html',
  'window.location.search', 'window.location.hash',
]) {
  if (!entry.includes(marker)) throw new Error(`Canonical /spire.html Client Station entry is missing ${marker}`);
}
for (const forbidden of ['/spire/portal.html', '/spire/master.html', 'spire-app-v2.js']) {
  if (entry.includes(forbidden)) throw new Error(`Retired SPIRE entry behavior returned to /spire.html: ${forbidden}`);
}

for (const marker of [
  'SPIRE_CLIENT_STATION_LISTS_V2', 'Client Station', 'Client Lists',
  'Available Homes', 'data-spire-fullscreen-control', preferencesUrl,
]) {
  if (!station.includes(marker)) throw new Error(`Canonical SPIRE Client Station is missing ${marker}`);
}

for (const marker of [
  'id="flowsheets-view"', 'class="flowsheet-sub-toolbar"', 'class="flowsheet-main-layout"',
  'id="flowsheetTreeMenu"', 'id="flowsheetGridContainer"', 'class="flowsheet-table"',
  'id="headerTimeRow"', 'id="headerDateRow"', navigationUrl, flowsheetUrl,
  frozenPaneUrl, screenUrl, preferencesUrl, screenCssUrl, '21. Full-Screen Workspace',
]) {
  if (!finalMaster.includes(marker)) throw new Error(`Standalone SPIRE chart/master is missing ${marker}`);
}
for (const [pattern, label] of [
  [/spire-master-navigation\.js/g, 'navigation'],
  [/spire-master-flowsheet-grid\.js/g, 'flowsheet'],
  [/spire-flowsheet-frozen-pane\.js/g, 'frozen pane'],
  [/spire-screen-controls\.js/g, 'live screen controls'],
  [/spire-user-preferences\.js/g, 'shared preferences'],
]) {
  const count = (finalMaster.match(pattern) || []).length;
  if (count !== 1) throw new Error(`SPIRE master ${label} runtime must be published exactly once; found ${count}`);
}
for (const forbidden of [
  "alert('Opening Staff Messaging Portal...')",
  "alert('Notifications: 3 unread reminders for current client.')",
]) {
  if (finalMaster.includes(forbidden)) throw new Error(`SPIRE master still publishes fake clinical alert behavior: ${forbidden}`);
}

for (const marker of [
  'SPIRE_MASTER_EXPLICIT_CLIENT_GATE_V2', "headers.set('x-spire-home-id', homeId)",
  '/spire/client-station.html', 'My Clients', 'Client Station',
]) {
  if (!navigationRuntime.includes(marker)) throw new Error(`SPIRE master explicit-client navigation is missing ${marker}`);
}
for (const forbidden of ['/spire/portal.html', '🩺 Patient Station']) {
  if (navigationRuntime.includes(forbidden)) throw new Error(`SPIRE chart navigation still exposes retired route/terminology: ${forbidden}`);
}

for (const marker of [
  'SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1', 'SPIRE_FLOWSHEET_FILE_WORKFLOW_V1',
  'SPIRE_FLOWSHEET_TRANSACTIONAL_FILE_V2', 'SPIRE_USER_MASTER_FLOWSHEET_LAYOUT_V1',
  'SPIRE_FLOWSHEET_INLINE_ENTRY_V3', 'SPIRE_FLOWSHEET_FRIENDLY_ACTOR_V1',
  'restoreAuthoritativeToolbar', '#flowsheetTbody', '.flowsheet-table', 'data-flow-editor',
  'suggestionsForRow', 'isNumericRow', 'positionPopoverBesideCell', 'Suggestions only',
  '/flowsheet-workspace/file', 'filePending', 'hasPending', 'Save Comment to Box',
  'is-draft-amendment', 'filed-amendment', 'Nothing was filed:',
]) {
  if (!flowsheetRuntime.includes(marker)) throw new Error(`SPIRE inline user-master transactional flowsheet runtime is missing ${marker}`);
}
for (const forbidden of [
  'host.innerHTML = `\n      <div class="flow-file-toolbar"', 'flow-layout', 'flow-tree',
  'setTimeout(() => saveCell', 'scheduleSave(cell)', "addEventListener('focusout',",
  "entry?.recordedByDisplayName || entry?.recordedById",
  "entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedById",
  'SPIRE Patient Station before using Flowsheets',
]) {
  if (flowsheetRuntime.includes(forbidden)) throw new Error(`SPIRE retired/replacement/raw-ID flowsheet behavior returned: ${forbidden}`);
}

for (const marker of [
  'SPIRE_FLOWSHEET_FROZEN_PANE_V1', 'grid-template-columns:245px minmax(0,1fr)',
  'position:sticky', 'flow-section-label', 'flow-section-scroll-fill', 'splitSectionRow', 'MutationObserver',
]) {
  if (!frozenPaneRuntime.includes(marker)) throw new Error(`SPIRE frozen-pane runtime is missing ${marker}`);
}

for (const marker of [
  'SPIRE_SCREEN_CONTROLS_LIVE_V2', '/api/spire/inbasket-v2?status=OPEN',
  '/spire/secure-chat.html', 'Secure Chat', 'Alerts & Reminders',
]) {
  if (!screenRuntime.includes(marker)) throw new Error(`SPIRE live chart control runtime is missing ${marker}`);
}
for (const forbidden of ['Opening Staff Messaging Portal', 'Notifications: 3 unread reminders for current client.']) {
  if (screenRuntime.includes(forbidden)) throw new Error(`SPIRE live chart controls contain fake alert behavior: ${forbidden}`);
}

for (const marker of [
  'SPIRE_USER_WORKSPACE_PREFERENCES_V1', 'spire:accessibility:fullscreen',
  'fullscreenPreferred', 'requestFullscreen', 'pointerdown',
]) {
  if (!preferencesRuntime.includes(marker)) throw new Error(`SPIRE shared preference runtime is missing ${marker}`);
}

for (const marker of [
  "app.post('/api/spire/patients/:patientId/flowsheet-workspace/file'", 'prisma.$transaction',
  'FLOWSHEET_FILE_COMMITTED', 'FLOWSHEET_ENTRY_AMENDED',
  'Only the user who originally filed this flowsheet entry can amend it', 'SELECT/options are advisory suggestions',
]) {
  if (!transactionalFileRoute.includes(marker)) throw new Error(`SPIRE transactional File backend is missing ${marker}`);
}
for (const forbidden of ['Choose an allowed value for', 'options.includes(value)']) {
  if (transactionalFileRoute.includes(forbidden)) throw new Error(`SPIRE backend restored a hard suggestion restriction: ${forbidden}`);
}

const loaderStart = finalMaster.indexOf('  async function loadFlowsheetsView(groupOverride) {');
const rendererStart = finalMaster.indexOf('  function renderFlowsheet(host) {', loaderStart);
if (loaderStart < 0 || rendererStart < 0) throw new Error('Standalone SPIRE flowsheet compatibility loader could not be verified');
const loaderSource = finalMaster.slice(loaderStart, rendererStart);
if (!loaderSource.includes('window.SpireMasterFlowsheetGrid')) throw new Error('Master flowsheet loader does not delegate to SpireMasterFlowsheetGrid');
for (const forbidden of ['Loading continuous flowsheet', 'renderFlowsheet(host);', 'state.flowColumns = keys.slice(-8)']) {
  if (loaderSource.includes(forbidden)) throw new Error(`Retired continuous flowsheet behavior is still reachable: ${forbidden}`);
}

for (const [label, source] of [
  ['navigation', navigationRuntime], ['flowsheet', flowsheetRuntime],
  ['frozen pane', frozenPaneRuntime], ['live controls', screenRuntime],
  ['shared preferences', preferencesRuntime],
]) {
  try { new Function(source); }
  catch (error) { throw new Error(`SPIRE ${label} runtime syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

await import('./verify-spire-portal-workflow.mjs');
console.log('Final SPIRE publication verified: Client Station is canonical; chart selection is explicit; Secure Chat/In Basket controls are live; shared display/full-screen preferences are published; and Flowsheet filing never exposes raw actor IDs.');
