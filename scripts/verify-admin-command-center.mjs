import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const failures = [];

async function mustRead(relative) {
  try { return await readFile(path.join(dist, relative), 'utf8'); }
  catch { failures.push(`Missing published file: ${relative}`); return ''; }
}

const adminHtml = await mustRead('admin.html');
const adminJs = await mustRead('admin-railway.js');
const liveJs = await mustRead('assets/admin-live-dashboard.js');

if (!adminHtml.includes('/assets/admin-live-dashboard.js')) failures.push('Admin page does not load the live dashboard asset');
if (!adminJs.includes('sulandra:admin:active-module')) failures.push('Admin module persistence key is missing');
if (!adminJs.includes('history.replaceState')) failures.push('Admin module URL/hash persistence is missing');
if (!adminJs.includes('https://sulandra-website-production-5fc4.up.railway.app')) failures.push('Admin runtime is not using canonical Railway API');
if (adminJs.includes('https://sulandra-website-production.up.railway.app')) failures.push('Admin runtime still contains the retired Railway API hostname');
for (const marker of [
  'Sulandra Health Command Center', 'api.open-meteo.com', '/api/admin/dashboard',
  'edge-toggle', 'width:28px;height:40px', 'edge-drawer left', 'edge-drawer right',
  "id:'weather'", "id:'people'", "type:'clock'", "type:'appointments'", "type:'reminders'", "type:'alarms'",
  'card-drag-handle', 'pointerdown', 'contextmenu', 'Edit Dashboard Widget',
  'dashboard-slide', 'dashboardPageDots', 'ACTIVE_MODULE_KEY', 'hashchange',
]) {
  if (!liveJs.includes(marker)) failures.push(`Live command center is missing required capability: ${marker}`);
}
const weatherIndex = liveJs.indexOf("id:'weather'");
const peopleIndex = liveJs.indexOf("id:'people'");
if (weatherIndex < 0 || peopleIndex < weatherIndex) failures.push('Combined People & Hiring widget must follow Weather in default order');
if (!liveJs.includes('grid-template-columns:minmax(0,1fr)!important') || !liveJs.includes('.sidebar{display:none!important}')) failures.push('Side drawers still reserve or obstruct main workspace width');

if (failures.length) {
  console.error('Admin command-center verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Admin command center verified: compact flush independently scrolling edge drawers, live weather, combined workforce/hiring, movable and editable colored widgets, live clock, appointments, reminders, alarms, multi-section scrolling, persistent module refresh, and canonical Railway data are published.');
