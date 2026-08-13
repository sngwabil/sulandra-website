import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// DEVELOPMENT_WORKFLOW: resolve from this script, never process.cwd().
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const portalPath = path.join(dist, 'spire', 'portal.html');
const stationPath = path.join(dist, 'spire', 'patient-station.html');
const chatPath = path.join(dist, 'spire', 'secure-chat.html');
const stationJsPath = path.join(dist, 'assets', 'spire-patient-station.js');
const chatJsPath = path.join(dist, 'assets', 'spire-secure-chat.js');
const handoffJsPath = path.join(dist, 'assets', 'spire-portal-patient-station-handoff.js');
const handoffUrl = '/assets/spire-portal-patient-station-handoff.js?v=20260813-patient-lists-1';

for (const file of [portalPath, stationPath, chatPath, stationJsPath, chatJsPath, handoffJsPath]) await stat(file);

let portal = await readFile(portalPath, 'utf8');
portal = portal.replace(/\s*<script src="\/assets\/spire-portal-patient-station-handoff\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
if (!portal.includes('</body>')) throw new Error('SPIRE portal has no closing body tag');
portal = portal.replace('</body>', `  <script src="${handoffUrl}"></script>\n</body>`);
await writeFile(portalPath, portal, 'utf8');

const [finalPortal, station, chat, stationJs, chatJs, handoffJs] = await Promise.all([
  readFile(portalPath, 'utf8'),
  readFile(stationPath, 'utf8'),
  readFile(chatPath, 'utf8'),
  readFile(stationJsPath, 'utf8'),
  readFile(chatJsPath, 'utf8'),
  readFile(handoffJsPath, 'utf8'),
]);

for (const marker of [handoffUrl, 'SPIRE_PORTAL_WORKFLOW_V1']) {
  if (!finalPortal.includes(marker)) throw new Error(`SPIRE portal Patient Station handoff missing ${marker}`);
}
if ((finalPortal.match(/spire-portal-patient-station-handoff\.js/g) || []).length !== 1) {
  throw new Error('SPIRE portal must publish the Patient Station handoff exactly once');
}

for (const marker of [
  'SPIRE_PATIENT_STATION_LISTS_V1', 'Patient Lists', 'My Lists', 'Available Homes',
  'stationPatientBody', 'patientPreview', '/assets/spire-patient-station.js?v=20260813-patient-lists-1',
]) {
  if (!station.includes(marker)) throw new Error(`SPIRE Patient Station page missing ${marker}`);
}
for (const marker of [
  'SPIRE_PATIENT_STATION_LISTS_V1', '/api/spire/network/service-homes', '/access',
  "row.addEventListener('dblclick'", 'openChart', 'openChat', '/spire/secure-chat.html',
  'No active clients are assigned to this service home.',
]) {
  if (!stationJs.includes(marker)) throw new Error(`SPIRE Patient Station runtime missing ${marker}`);
}
for (const forbidden of ['openChart(state.patients[0]', 'location.assign(chartUrl(state.patients[0]']) {
  if (stationJs.includes(forbidden)) throw new Error(`SPIRE Patient Station may not auto-open a client: ${forbidden}`);
}

for (const marker of [
  'SPIRE_SECURE_CHAT_V1', 'Secure Chat', 'Conversations', 'Participants',
  'Conversation Details', '/assets/spire-secure-chat.js?v=20260813-secure-chat-1',
]) {
  if (!chat.includes(marker)) throw new Error(`SPIRE Secure Chat page missing ${marker}`);
}
for (const marker of [
  'SPIRE_SECURE_CHAT_V1', '/communications/overview', '/communications/threads/',
  '/api/spire/routing-pools', "method: 'POST'", 'recipientPoolId',
  'Messages are patient-scoped', 'setInterval',
]) {
  if (!chatJs.includes(marker)) throw new Error(`SPIRE Secure Chat runtime missing ${marker}`);
}
for (const forbidden of ['Demo Conversation', 'Demo Message', 'mockMessages', 'localStorage.setItem(\'chat']) {
  if (chatJs.includes(forbidden)) throw new Error(`SPIRE Secure Chat contains demo/local-only messaging behavior: ${forbidden}`);
}

for (const [label, source] of [
  ['Patient Station runtime', stationJs],
  ['Secure Chat runtime', chatJs],
  ['Patient Station handoff runtime', handoffJs],
]) {
  try { new Function(source); }
  catch (error) { throw new Error(`${label} JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`); }
}

for (const marker of ['SPIRE_PORTAL_PATIENT_STATION_HANDOFF_V1', '/spire/patient-station.html', "context.step === 'clients'", 'patientPanel']) {
  if (!handoffJs.includes(marker)) throw new Error(`SPIRE Patient Station portal handoff missing ${marker}`);
}

console.log('SPIRE Patient Station and Secure Chat published: company/home gateway hands off to a dense authorized patient-list workstation; explicit double-click opens charts; patient-scoped Secure Chat uses live SPIRE messaging and routing pools.');
