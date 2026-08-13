import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// DEVELOPMENT_WORKFLOW: all paths resolve from this script, never process.cwd().
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

async function read(relative) {
  try { return await readFile(path.join(root, relative), 'utf8'); }
  catch { failures.push(`Missing ${relative}`); return ''; }
}

async function requireFile(relative) {
  try { await access(path.join(root, relative)); }
  catch { failures.push(`Missing ${relative}`); }
}

function has(source, markers, label) {
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${label} missing ${marker}`);
}

function forbids(source, markers, label) {
  for (const marker of markers) if (source.includes(marker)) failures.push(`${label} still contains forbidden ${marker}`);
}

function syntax(relative, label) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${label} syntax failed: ${(result.stderr || result.stdout || '').trim()}`);
}

const files = {
  entry: 'dist-web/spire.html',
  master: 'dist-web/spire/master.html',
  station: 'dist-web/spire/client-station.html',
  legacyStation: 'dist-web/spire/patient-station.html',
  chat: 'dist-web/spire/secure-chat.html',
  stationJs: 'dist-web/assets/spire-client-station.js',
  chatJs: 'dist-web/assets/spire-secure-chat.js',
  prefsJs: 'dist-web/assets/spire-user-preferences.js',
  screenJs: 'dist-web/assets/spire-screen-controls.js',
  masterNavJs: 'dist-web/assets/spire-master-navigation.js',
  flowJs: 'dist-web/assets/spire-master-flowsheet-grid.js',
  commJs: 'dist-web/assets/spire-communications-inbasket.js',
  commCss: 'dist-web/assets/spire-communications-inbasket.css',
  workflowJs: 'dist-web/assets/spire-workflow.js',
  cpoeJs: 'dist-web/assets/spire-order-composer.js',
  emarJs: 'dist-web/assets/spire-emar.js',
  careJs: 'dist-web/assets/spire-care-plan.js',
  incidentJs: 'dist-web/assets/spire-incidents.js',
  assessmentJs: 'dist-web/assets/spire-assessments-flowsheets.js',
  schedulingJs: 'dist-web/assets/spire-scheduling.js',
  authJs: 'dist-web/assets/spire-authorizations-evv.js',
  docsJs: 'dist-web/assets/spire-documents-external-records.js',
  referenceJs: 'dist-web/assets/spire-epic-reference-parity.js',
  smartPhraseJs: 'dist-web/assets/spire-smartphrase-parity.js',
  homeRoutes: 'api/src/spire-network-home-access-routes.ts',
  commRoutes: 'api/src/spire-communications-inbasket-routes.ts',
  flowRoutes: 'api/src/spire-flowsheet-workspace-routes.ts',
  chartRoutes: 'api/src/spire-chart-routes.ts',
  injector: 'scripts/inject-clinical-routes.mjs',
};

const data = {};
for (const [key, relative] of Object.entries(files)) data[key] = await read(relative);

// Canonical entry: authenticated SPIRE work begins in Client Station, not a
// duplicate company/home gateway and never directly in a chart.
has(data.entry, [
  'SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2', '/spire/client-station.html',
  'window.location.search', 'window.location.hash',
], 'SPIRE canonical entry');
forbids(data.entry, ['/spire/portal.html', '/spire/master.html', 'spire-app-v2.js'], 'SPIRE canonical entry');

// Client Station restores only an authorized home, loads that home's clients,
// and requires explicit client action before opening a chart.
has(data.station, [
  'SPIRE_CLIENT_STATION_LISTS_V2', 'Client Station', 'Client Lists', 'All My Clients',
  'Available Homes', 'stationClientBody', 'clientPreview', 'data-spire-fullscreen-control',
  '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1',
], 'SPIRE Client Station');
forbids(data.station, ['Patient Lists', '>Patient Station<'], 'SPIRE Client Station');
has(data.stationJs, [
  'SPIRE_CLIENT_STATION_LISTS_V2', '/api/spire/network/service-homes', '/access',
  'localStorage.setItem(HOME_ID_KEY', "row.addEventListener('dblclick'", 'openChart',
  '/spire/secure-chat.html', '/api/spire/inbasket-v2?status=OPEN',
], 'SPIRE Client Station runtime');
forbids(data.stationJs, [
  '/spire/portal.html', 'openChart(state.clients[0]', 'location.assign(chartUrl(state.clients[0]',
], 'SPIRE Client Station runtime');

// Old bookmarks continue to work but cannot reintroduce the old station.
has(data.legacyStation, ['SPIRE_RETIRED_PATIENT_STATION_COMPAT_V1', '/spire/client-station.html'], 'Retired Patient Station compatibility entry');

// Secure Chat is live, client-scoped and uses the existing SPIRE communications backend.
has(data.chat, [
  'SPIRE_SECURE_CHAT_V2', 'Secure Chat', '← Client Station', 'Client-scoped',
  'data-spire-fullscreen-control', '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1',
], 'SPIRE Secure Chat');
has(data.chatJs, [
  'SPIRE_SECURE_CHAT_V2', '/communications/overview', '/communications/threads/',
  '/api/spire/routing-pools', 'recipientPoolId', '/spire/client-station.html', 'Messages are client-scoped',
], 'SPIRE Secure Chat runtime');
forbids(data.chatJs, ['Demo Conversation', 'Demo Message', 'mockMessages', '/spire/portal.html', 'Patient-scoped'], 'SPIRE Secure Chat runtime');

// One preference contract serves chart, Client Station and Secure Chat.
has(data.prefsJs, [
  'SPIRE_USER_WORKSPACE_PREFERENCES_V1', 'spire:accessibility:preset',
  'spire:accessibility:font-size', 'spire:accessibility:fullscreen',
  'fullscreenPreferred', 'requestFullscreen', 'pointerdown',
], 'SPIRE shared user preferences');

// Master chart controls must use real Secure Chat/In Basket behavior, never fake alerts.
has(data.screenJs, [
  'SPIRE_SCREEN_CONTROLS_LIVE_V2', '/api/spire/inbasket-v2?status=OPEN',
  '/spire/secure-chat.html', 'Alerts & Reminders', 'Secure Chat',
], 'SPIRE chart controls');
forbids(data.screenJs, [
  'Opening Staff Messaging Portal', 'Notifications: 3 unread reminders for current client.',
], 'SPIRE chart controls');

has(data.masterNavJs, ['SPIRE_MASTER_EXPLICIT_CLIENT_GATE_V2', '/spire/client-station.html', 'Client Station'], 'SPIRE chart navigation');
forbids(data.masterNavJs, ['/spire/portal.html', '🩺 Patient Station'], 'SPIRE chart navigation');

// Flowsheet filing metadata may display a friendly name/email, but never a raw internal actor ID.
has(data.flowJs, ['SPIRE_FLOWSHEET_FRIENDLY_ACTOR_V1', 'SPIRE Client Station before using Flowsheets'], 'SPIRE Flowsheet');
forbids(data.flowJs, [
  "entry?.recordedByDisplayName || entry?.recordedById",
  "entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedById",
  'SPIRE Patient Station before using Flowsheets',
], 'SPIRE Flowsheet');

// Master remains the standalone chart application, with the user's established
// accessibility suite extended by preference 21 and live controls.
has(data.master, [
  '<html', '<body', 'S.P.I.R.E.', '21. Full-Screen Workspace',
  'title="Secure Chat"', '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1',
], 'SPIRE master chart');
forbids(data.master, [
  "alert('Opening Staff Messaging Portal...')",
  "alert('Notifications: 3 unread reminders for current client.')",
], 'SPIRE master chart');

// Preserve the established clinical modules while changing only navigation/presentation.
has(data.workflowJs, ['Start Encounter', 'New Clinical Note', 'Save & Sign'], 'SPIRE workflow');
has(data.cpoeJs, ['Order Composer', 'Sign & Place Order'], 'SPIRE CPOE');
has(data.emarJs, ['Electronic Medication Administration Record', 'PRN Effect'], 'SPIRE eMAR');
has(data.careJs, ['Care Plan / ISP', 'Goals & Outcomes'], 'SPIRE Care Plan');
has(data.incidentJs, ['Incident Management', 'New Incident', 'Corrective Action'], 'SPIRE incidents');
has(data.assessmentJs, ['Clinical Assessments', 'Vitals & Flowsheets'], 'SPIRE assessments');
has(data.schedulingJs, ['New Appointment', 'Open Chart', '/api/spire/scheduling/day'], 'SPIRE scheduling');
has(data.authJs, ['Authorizations & EVV', 'Start EVV Visit'], 'SPIRE authorizations/EVV');
has(data.docsJs, ['Documents / Media', 'External Records'], 'SPIRE documents');
has(data.commJs, ['In Basket 2.0', 'Clinical Message', 'communications/overview', 'inbasket-v2'], 'SPIRE communications');
has(data.commCss, ['thread-list', 'ib-metrics'], 'SPIRE communications styling');
has(data.referenceJs, ['Schedule Glance', 'In Basket Glance', 'SPIRE Workspace Settings'], 'SPIRE reference parity');
has(data.smartPhraseJs, ['SmartPhrase Manager', 'Progress-note Speed Buttons'], 'SPIRE SmartPhrase parity');

// Backend contracts remain the authority for access and communication data.
has(data.homeRoutes, [
  "app.get('/api/spire/network/service-homes'", "app.post('/api/spire/network/service-homes/:homeId/access'",
  'SpireEmployeeHomeAssignment', 'SpirePatientHomeAssignment',
], 'SPIRE service-home access routes');
has(data.commRoutes, [
  "app.get('/api/spire/inbasket-v2'", '/communications/overview', '/communications/threads',
  'SpireClinicalAuditEvent',
], 'SPIRE communications backend');
has(data.flowRoutes, ['flowsheet', 'recordedBy'], 'SPIRE flowsheet backend');
has(data.chartRoutes, ['/api/spire/patients/', 'chart'], 'SPIRE chart backend');
has(data.injector, ['registerSpireNetworkHomeAccessRoutes', 'registerSpireCommunicationsInBasketRoutes'], 'SPIRE route injector');

// Syntax gate all new/changed browser runtimes from the published artifact.
for (const [relative, label] of [
  ['dist-web/assets/spire-client-station.js', 'Client Station'],
  ['dist-web/assets/spire-secure-chat.js', 'Secure Chat'],
  ['dist-web/assets/spire-user-preferences.js', 'Shared preferences'],
  ['dist-web/assets/spire-screen-controls.js', 'Chart controls'],
  ['dist-web/assets/spire-master-navigation.js', 'Chart navigation'],
  ['dist-web/assets/spire-master-flowsheet-grid.js', 'Flowsheet'],
]) {
  await requireFile(relative);
  syntax(relative, label);
}

if (failures.length) {
  console.error('SPIRE Client Station foundation verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('SPIRE foundation verified: Client Station is canonical, last authorized home is restorable, chart selection is explicit, Secure Chat and In Basket are live, user display/full-screen preferences are shared, and clinical modules/backends remain present.');
