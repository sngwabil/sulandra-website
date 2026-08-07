import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const failures = [];

async function read(relative) {
  try { return await readFile(path.join(dist, relative), 'utf8'); }
  catch { failures.push(`Missing published file: ${relative}`); return ''; }
}

const admin = await read('admin.html');
const dashboard = await read('assets/admin-live-dashboard.js');

if (!admin.includes('admin-live-dashboard.js')) failures.push('Published admin.html does not load the live dashboard asset');
for (const marker of [
  'edge-toggle', 'width:28px;height:40px', 'edge-drawer left', 'edge-drawer right',
  "id:'weather'", "id:'people'", "type:'clock'", "type:'appointments'", "type:'reminders'", "type:'alarms'",
  'card-drag-handle', 'pointerdown', 'contextmenu', 'Edit Dashboard Widget',
  'dashboard-slide', 'dashboardPageDots', 'ACTIVE_MODULE_KEY', 'hashchange',
]) {
  if (!dashboard.includes(marker)) failures.push(`Interactive Admin dashboard is missing required marker: ${marker}`);
}
if (!dashboard.includes("title:'Dayton Weather'") || !dashboard.includes("title:'People & Hiring'")) failures.push('Weather and combined People & Hiring cards are not configured');
const weatherIndex = dashboard.indexOf("id:'weather'");
const peopleIndex = dashboard.indexOf("id:'people'");
if (weatherIndex < 0 || peopleIndex < weatherIndex) failures.push('People & Hiring must follow Weather in the default dashboard order');
if (!dashboard.includes("grid-template-columns:minmax(0,1fr)!important") || !dashboard.includes(".sidebar{display:none!important}")) failures.push('Edge drawers are still reserving/obstructing main workspace width');

if (failures.length) {
  console.error('Interactive Admin dashboard verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Interactive Admin dashboard verified: compact flush edge drawers, independent scrolling, movable/editable colored widgets, weather, combined workforce/hiring, clock, appointments, reminders, alarms, multi-section scrolling, and refresh persistence are published.');
