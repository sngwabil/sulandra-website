import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// DEVELOPMENT_WORKFLOW: resolve from this script, never process.cwd().
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const entryPath = path.join(dist, 'spire.html');
const portalPath = path.join(dist, 'spire', 'portal.html');
const legacyStationPath = path.join(dist, 'spire', 'patient-station.html');
const stationPath = path.join(dist, 'spire', 'client-station.html');
const chatPath = path.join(dist, 'spire', 'secure-chat.html');
const stationJsPath = path.join(dist, 'assets', 'spire-client-station.js');
const chatJsPath = path.join(dist, 'assets', 'spire-secure-chat.js');
const prefsJsPath = path.join(dist, 'assets', 'spire-user-preferences.js');
const screenJsPath = path.join(dist, 'assets', 'spire-screen-controls.js');
const flowJsPath = path.join(dist, 'assets', 'spire-master-flowsheet-grid.js');
const handoffJsPath = path.join(dist, 'assets', 'spire-portal-patient-station-handoff.js');
const handoffUrl = '/assets/spire-portal-patient-station-handoff.js?v=20260813-client-station-2';

for (const file of [
  entryPath, portalPath, legacyStationPath, stationPath, chatPath,
  stationJsPath, chatJsPath, prefsJsPath, screenJsPath, flowJsPath, handoffJsPath,
]) await stat(file);

// Keep old bookmarked portal routes functional, but they are not the default SPIRE route.
let portal = await readFile(portalPath, 'utf8');
portal = portal.replace(/\s*<script src="\/assets\/spire-portal-patient-station-handoff\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
if (!portal.includes('</body>')) throw new Error('SPIRE compatibility portal has no closing body tag');
portal = portal.replace('</body>', `  <script src="${handoffUrl}"></script>\n</body>`);
await writeFile(portalPath, portal, 'utf8');

const [entry, finalPortal, legacyStation, station, chat, stationJs, chatJs, prefsJs, screenJs, flowJs, handoffJs] = await Promise.all([
  readFile(entryPath, 'utf8'),
  readFile(portalPath, 'utf8'),
  readFile(legacyStationPath, 'utf8'),
  readFile(stationPath, 'utf8'),
  readFile(chatPath, 'utf8'),
  readFile(stationJsPath, 'utf8'),
  readFile(chatJsPath, 'utf8'),
  readFile(prefsJsPath, 'utf8'),
  readFile(screenJsPath, 'utf8'),
  readFile(flowJsPath, 'utf8'),
  readFile(handoffJsPath, 'utf8'),
]);

for (const marker of ['SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2', '/spire/client-station.html', 'window.location.search', 'window.location.hash']) {
  if (!entry.includes(marker)) throw new Error(`SPIRE canonical entry missing ${marker}`);
}
if (entry.includes('/spire/portal.html') || entry.includes('/spire/master.html')) {
  throw new Error('SPIRE canonical entry must not launch the retired company/home portal or a chart directly.');
}

for (const marker of [handoffUrl, 'SPIRE_PORTAL_WORKFLOW_V1']) {
  if (!finalPortal.includes(marker)) throw new Error(`SPIRE compatibility portal handoff missing ${marker}`);
}
if ((finalPortal.match(/spire-portal-patient-station-handoff\.js/g) || []).length !== 1) {
  throw new Error('SPIRE compatibility portal must publish its Client Station handoff exactly once');
}

for (const marker of [
  'SPIRE_CLIENT_STATION_LISTS_V2', 'Client Lists', 'My Lists', 'Available Homes',
  'stationClientBody', 'clientPreview', '/assets/spire-client-station.js?v=20260813-client-station-2',
  '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1', 'data-spire-fullscreen-control',
]) {
  if (!station.includes(marker)) throw new Error(`SPIRE Client Station page missing ${marker}`);
}
for (const forbidden of ['Patient Lists', 'Patient Station']) {
  if (station.includes(forbidden)) throw new Error(`SPIRE Client Station still exposes retired terminology: ${forbidden}`);
}

for (const marker of [
  'SPIRE_CLIENT_STATION_LISTS_V2', '/api/spire/network/service-homes', '/access',
  "row.addEventListener('dblclick'", 'openChart', 'openChat', '/spire/secure-chat.html',
  '/api/spire/inbasket-v2?status=OPEN', 'localStorage.setItem(HOME_ID_KEY',
  'No active clients are assigned to this service home.',
]) {
  if (!stationJs.includes(marker)) throw new Error(`SPIRE Client Station runtime missing ${marker}`);
}
for (const forbidden of [
  'openChart(state.clients[0]', 'location.assign(chartUrl(state.clients[0]',
  '/spire/portal.html', 'Patient Station',
]) {
  if (stationJs.includes(forbidden)) throw new Error(`SPIRE Client Station contains retired/unsafe behavior: ${forbidden}`);
}

for (const marker of [
  'SPIRE_RETIRED_PATIENT_STATION_COMPAT_V1', '/spire/client-station.html',
]) {
  if (!legacyStation.includes(marker)) throw new Error(`Retired Patient Station compatibility page missing ${marker}`);
}

for (const marker of [
  'SPIRE_SECURE_CHAT_V2', 'Secure Chat', 'Conversations', 'Participants',
  'Conversation Details', '← Client Station', 'Client-scoped',
  '/assets/spire-secure-chat.js?v=20260813-secure-chat-2',
  '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1', 'data-spire-fullscreen-control',
]) {
  if (!chat.includes(marker)) throw new Error(`SPIRE Secure Chat page missing ${marker}`);
}
for (const marker of [
  'SPIRE_SECURE_CHAT_V2', '/communications/overview', '/communications/threads/',
  '/api/spire/routing-pools', "method: 'POST'", 'recipientPoolId',
  'Messages are client-scoped', 'setInterval', '/spire/client-station.html',
]) {
  if (!chatJs.includes(marker)) throw new Error(`SPIRE Secure Chat runtime missing ${marker}`);
}
for (const forbidden of ['Demo Conversation', 'Demo Message', 'mockMessages', "localStorage.setItem('chat", '/spire/portal.html', 'Patient-scoped']) {
  if (chatJs.includes(forbidden)) throw new Error(`SPIRE Secure Chat contains demo/retired behavior: ${forbidden}`);
}

for (const marker of [
  'SPIRE_USER_WORKSPACE_PREFERENCES_V1', 'spire:accessibility:fullscreen',
  'requestFullscreen', 'fullscreenPreferred', 'pointerdown', 'data-spire-fullscreen-control',
]) {
  if (!prefsJs.includes(marker)) throw new Error(`SPIRE shared preferences runtime missing ${marker}`);
}

for (const marker of [
  'SPIRE_SCREEN_CONTROLS_LIVE_V2', 'Secure Chat', '/api/spire/inbasket-v2?status=OPEN',
  '/spire/secure-chat.html', 'notification-badge',
]) {
  if (!screenJs.includes(marker)) throw new Error(`SPIRE chart live-control runtime missing ${marker}`);
}
for (const forbidden of [
  'Opening Staff Messaging Portal', 'Notifications: 3 unread reminders for current client.',
]) {
  if (screenJs.includes(forbidden)) throw new Error(`SPIRE chart screen controls contain fake alert behavior: ${forbidden}`);
}

for (const marker of ['SPIRE_FLOWSHEET_FRIENDLY_ACTOR_V1', 'SPIRE Client Station before using Flowsheets']) {
  if (!flowJs.includes(marker)) throw new Error(`SPIRE flowsheet friendly-actor runtime missing ${marker}`);
}
for (const forbidden of [
  "entry?.recordedByDisplayName || entry?.recordedById",
  "entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedById",
  'SPIRE Patient Station before using Flowsheets',
]) {
  if (flowJs.includes(forbidden)) throw new Error(`SPIRE flowsheet still exposes retired/internal filing metadata: ${forbidden}`);
}

for (const [label, source] of [
  ['Client Station runtime', stationJs],
  ['Secure Chat runtime', chatJs],
  ['SPIRE shared preferences runtime', prefsJs],
  ['SPIRE chart live controls runtime', screenJs],
  ['SPIRE Flowsheet runtime', flowJs],
  ['Compatibility portal Client Station handoff', handoffJs],
]) {
  try { new Function(source); }
  catch (error) { throw new Error(`${label} JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

for (const marker of ['SPIRE_PORTAL_CLIENT_STATION_HANDOFF_V2', '/spire/client-station.html', "context.step === 'clients'", 'patientPanel']) {
  if (!handoffJs.includes(marker)) throw new Error(`SPIRE compatibility portal Client Station handoff missing ${marker}`);
}

console.log('SPIRE Client Station, Secure Chat, shared accessibility/full-screen preferences, live In Basket notifications, and friendly Flowsheet filing metadata verified in dist-web.');
