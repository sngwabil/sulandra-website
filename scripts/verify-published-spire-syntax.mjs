import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This verifier operates on repository source so it is safe to run directly as
// part of verify:business-uat as well as after a static build.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

async function read(relative) {
  try { return await readFile(path.join(root, relative), 'utf8'); }
  catch { failures.push(`${relative}: missing`); return ''; }
}

function requireMarkers(source, markers, label) {
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${label} missing ${marker}`);
}

function forbidMarkers(source, markers, label) {
  for (const marker of markers) if (source.includes(marker)) failures.push(`${label} contains retired ${marker}`);
}

async function checkJs(relative, label = relative) {
  try { await access(path.join(root, relative)); }
  catch { failures.push(`${relative}: referenced SPIRE script is missing`); return; }
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${label}: ${(result.stderr || result.stdout || 'syntax check failed').trim()}`);
}

const entry = await read('spire.html');
requireMarkers(entry, [
  'SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2', '/spire/client-station.html',
  'window.location.search', 'window.location.hash',
], 'SPIRE canonical source entry');
forbidMarkers(entry, ['/spire/portal.html', '/spire/master.html', 'spire-app-v2.js'], 'SPIRE canonical source entry');

const station = await read('spire/client-station.html');
requireMarkers(station, [
  'SPIRE_CLIENT_STATION_LISTS_V2', 'Client Station', 'Client Lists', 'Available Homes',
  '/assets/spire-client-station.js?v=20260813-client-station-2',
  '/assets/spire-user-preferences.js?v=20260813-workspace-prefs-1',
], 'SPIRE Client Station source');

const secureChat = await read('spire/secure-chat.html');
requireMarkers(secureChat, [
  'SPIRE_SECURE_CHAT_V2', 'Secure Chat', '← Client Station', 'Client-scoped',
  '/assets/spire-secure-chat.js?v=20260813-secure-chat-2',
], 'SPIRE Secure Chat source');

const browserAssets = [
  ['assets/spire-client-station.js', 'Client Station runtime'],
  ['assets/spire-secure-chat.js', 'Secure Chat runtime'],
  ['assets/spire-user-preferences.js', 'Shared SPIRE preferences'],
  ['assets/spire-screen-controls.js', 'SPIRE live screen controls'],
  ['assets/spire-master-navigation.js', 'SPIRE chart navigation'],
  ['assets/spire-master-flowsheet-grid.js', 'SPIRE master Flowsheet'],
  ['assets/spire-communications-inbasket.js', 'SPIRE communications/In Basket'],
  ['assets/spire-chart-review-ownership.js', 'SPIRE Chart Review ownership'],
  ['assets/spire-intake-isp-sleep-wiring.js', 'SPIRE intake/ISP/sleep wiring'],
  ['assets/spire-admission-history.js', 'SPIRE admission history'],
  ['assets/spire-user-template-integration.js', 'SPIRE master-template integration'],
];
for (const [relative, label] of browserAssets) await checkJs(relative, label);

const stationJs = await read('assets/spire-client-station.js');
requireMarkers(stationJs, [
  'SPIRE_CLIENT_STATION_LISTS_V2', '/api/spire/network/service-homes', '/access',
  '/api/spire/inbasket-v2?status=OPEN', '/spire/secure-chat.html', 'localStorage.setItem(HOME_ID_KEY',
], 'SPIRE Client Station runtime');
forbidMarkers(stationJs, ['/spire/portal.html', 'openChart(state.clients[0]'], 'SPIRE Client Station runtime');

const chatJs = await read('assets/spire-secure-chat.js');
requireMarkers(chatJs, [
  'SPIRE_SECURE_CHAT_V2', '/communications/overview', '/api/spire/routing-pools',
  '/spire/client-station.html', 'Messages are client-scoped',
], 'SPIRE Secure Chat runtime');
forbidMarkers(chatJs, ['Demo Conversation', 'Demo Message', 'mockMessages', '/spire/portal.html'], 'SPIRE Secure Chat runtime');

const preferences = await read('assets/spire-user-preferences.js');
requireMarkers(preferences, [
  'SPIRE_USER_WORKSPACE_PREFERENCES_V1', 'spire:accessibility:fullscreen',
  'requestFullscreen', 'fullscreenPreferred', 'pointerdown',
], 'SPIRE shared preferences');

const controls = await read('assets/spire-screen-controls.js');
requireMarkers(controls, [
  'SPIRE_SCREEN_CONTROLS_LIVE_V2', '/api/spire/inbasket-v2?status=OPEN',
  '/spire/secure-chat.html', 'Secure Chat',
], 'SPIRE live screen controls');
forbidMarkers(controls, [
  'Opening Staff Messaging Portal', 'Notifications: 3 unread reminders for current client.',
], 'SPIRE live screen controls');

const chartOwner = await read('assets/spire-chart-review-ownership.js');
requireMarkers(chartOwner, [
  '20260812-spire-chart-review-ownership-1', 'SpireChartReviewV2',
  'stopImmediatePropagation', 'spire:chart-tab-selected', 'SpireChartReviewOwnership',
], 'SPIRE Chart Review ownership');

const wiring = await read('assets/spire-intake-isp-sleep-wiring.js');
requireMarkers(wiring, [
  '20260812-spire-intake-isp-sleep-2', 'spireAdmissionHistoryTab',
  'ISP Outcomes / Progress', 'Sleep / Wake', 'spire:flowsheet:preferred-group',
  'SpireIntakeIspSleepWiring', 'button.hidden=true',
], 'SPIRE intake/ISP/sleep wiring');

const style = await read('assets/spire-intake-isp-sleep-wiring.css');
requireMarkers(style, ['#spireAdmissionHistoryTab', 'admission-history-wrap', '.spmt-summary-card.intake'], 'SPIRE intake master styling');

const promotion = await read('api/src/client-intake-promotion.ts');
requireMarkers(promotion, [
  'CLIENT INTAKE → SPIRE ADMISSION SUMMARY', 'ensureMedications', 'ensureDocuments',
  'ensureServiceAuthorization', 'PROMOTE_CLIENT_INTAKE',
], 'Client Intake promotion contract');

const admission = await read('assets/spire-admission-history.js');
requireMarkers(admission, ['/admission-history', 'Completed Intake Sections', 'Attached Admission Documents', 'Recorded Acknowledgments'], 'SPIRE admission-history wiring');

if (failures.length) {
  console.error('Published SPIRE JavaScript/integration verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`Published SPIRE syntax verified across ${browserAssets.length} browser runtimes: Client Station is canonical, Secure Chat/In Basket are live, preferences are shared, and intake/chart integrations remain present.`);
