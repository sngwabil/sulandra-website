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
const routingJs = await mustRead('assets/admin-platform-routing.js');
const homesJs = await mustRead('assets/admin-service-home-management-v2.js');
const cleanupJs = await mustRead('assets/admin-dashboard-cleanup.js');
const schedulingHtml = await mustRead('scheduling.html');
const schedulingJs = await mustRead('assets/time-attendance-location-scheduler.js');
const timeAttendanceHtml = await mustRead('time-attendance.html');

for (const marker of [
  '/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v4',
  '/assets/sulandra-enterprise-owner.js?v=20260808-admin-profile-owner-v1',
  '/assets/admin-service-home-management-v2.js?v=20260808-admin-command-center-v4',
  '/assets/admin-platform-routing.js?v=20260808-daily-scheduling-v2',
  '/assets/admin-dashboard-cleanup.js?v=20260808-dashboard-cleanup-v1',
]) if (!adminHtml.includes(marker)) failures.push(`Admin page is not loading ${marker}`);

if (!adminHtml.includes('http-equiv="Cache-Control"') || !adminHtml.includes('no-cache, no-store, must-revalidate')) failures.push('Admin HTML does not disable stale browser caching');
if (!adminHtml.includes('id="admin-fullscreen-layout"')) failures.push('Admin full-viewport layout override is missing');
if (!adminHtml.includes('.top-nav,.nav-links,.container{width:100%!important;max-width:none!important')) failures.push('Admin shell still contains a fixed-width viewport wrapper');
if (!adminHtml.includes('html,body{width:100%!important;max-width:none;margin:0;padding:0;overflow-x:hidden')) failures.push('Admin document root is not forced to full viewport width');

// The former platform button row is intentionally replaced by a continuously updating
// Dayton/Miami Valley local-news ticker. The Live status pulses and the weather card
// carries a local America/New_York clock beside the weather icon.
for (const marker of [
  'class="sulandra-news-label">Local News',
  'id="sulandraNewsTrack"',
  'Dayton%20Ohio%20when%3A1d',
  'NEWS_REFRESH_MS=10*60*1000',
  '@keyframes sulandraNewsTicker',
  '@keyframes sulandraLiveBlink',
  '.pulse-dot{animation:sulandraLiveBlink',
  'weather-mini-clock',
  "timeZone:'America/New_York'",
]) if (!adminHtml.includes(marker)) failures.push(`Admin live header enhancement is missing ${marker}`);
if (adminHtml.includes('class="sulandra-platform-link"')) failures.push('Top platform bar still contains the retired portal buttons instead of the local-news ticker');

if (!adminJs.includes('sulandra:admin:active-module')) failures.push('Admin module persistence key is missing');
if (!adminJs.includes('history.replaceState')) failures.push('Admin module URL/hash persistence is missing');
if (!adminJs.includes('https://sulandra-website-production-5fc4.up.railway.app')) failures.push('Admin runtime is not using canonical Railway API');
if (adminJs.includes('https://sulandra-website-production.up.railway.app')) failures.push('Admin runtime still contains the retired Railway API hostname');

for (const marker of [
  'Sulandra Health Command Center', 'api.open-meteo.com', '/api/admin/dashboard',
  'edge-toggle', 'width:24px;height:104px', '.edge-toggle.left{left:-18px', '.edge-toggle.right{right:-18px', 'edge-drawer left', 'edge-drawer right',
  "id:'weather'", "id:'people'", "type:'clock'", "type:'appointments'", "type:'reminders'", "type:'alarms'",
  'card-drag-handle', 'pointerdown', 'contextmenu', 'Edit Dashboard Widget',
  'dashboard-slide', 'dashboardPageDots', 'ACTIVE_MODULE_KEY', 'hashchange',
]) if (!liveJs.includes(marker)) failures.push(`Live command center is missing required capability: ${marker}`);

const weatherIndex = liveJs.indexOf("id:'weather'");
const peopleIndex = liveJs.indexOf("id:'people'");
if (weatherIndex < 0 || peopleIndex < weatherIndex) failures.push('Combined People & Hiring widget must follow Weather in default order');
if (!liveJs.includes('grid-template-columns:minmax(0,1fr)!important') || !liveJs.includes('.sidebar{display:none!important}')) failures.push('Side drawers still reserve or obstruct main workspace width');

for (const [key, target] of Object.entries({
  scheduling: '/scheduling.html',
  time: '/time-attendance.html#admin',
  documents: '/employee360.html#files',
  reports: '/employee360.html#audit',
})) {
  if (!routingJs.includes(`${key}: '${target}'`)) failures.push(`Admin live route missing: ${key} -> ${target}`);
}
if (!routingJs.includes("'/spire-admin.html'")) failures.push('Admin Spire entry is not normalized to /spire-admin.html');
for (const marker of ['/api/admin/service-homes','/api/admin/service-homes/directory/employees','/api/admin/service-homes/directory/clients','Create Service Home','Open Schedule']) {
  if (!homesJs.includes(marker)) failures.push(`Service Homes live manager is missing capability: ${marker}`);
}
for (const marker of ['sulandraOwnerConsoleButton','/^[123]\\s*\\/\\s*3$/']) if (!cleanupJs.includes(marker)) failures.push(`Admin cleanup is missing ${marker}`);

// Scheduling is intentionally separate from Time & Attendance. The Scheduling page
// hosts the administrator workforce scheduler; Time & Attendance remains the punch,
// timecard, GPS and exception-management application.
for (const marker of [
  '<title>Sulandra Health | Scheduling</title>',
  'Workforce Schedule Control',
  'id="schedulerHost"',
  '/assets/time-attendance-location-scheduler.js',
  'Scheduling is separate from Time & Attendance',
]) if (!schedulingHtml.includes(marker)) failures.push(`Dedicated Scheduling page is missing ${marker}`);

for (const marker of [
  "if (!/\\/scheduling(?:\\.html|\\/)?$/i.test(location.pathname)) return;",
  "document.getElementById('schedulerHost')",
  '/api/admin/time-attendance/locations',
  '/api/admin/time-attendance/location-grid',
  '/api/admin/time-attendance/copy-schedule',
  'Save & Publish',
  'Search employee',
  'Next 12 months',
]) if (!schedulingJs.includes(marker)) failures.push(`Dedicated Scheduling runtime is missing ${marker}`);

if (timeAttendanceHtml.includes('/assets/time-attendance-location-scheduler.js')) {
  failures.push('Time & Attendance still loads the workforce Scheduling runtime');
}
if (!routingJs.includes("scheduling: '/scheduling.html'")) failures.push('Scheduling is not hard-routed to its dedicated application');
if (!routingJs.includes("time: '/time-attendance.html#admin'")) failures.push('Time & Attendance is not preserved as a separate application');

if (failures.length) {
  console.error('Admin command-center verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Admin command center verified: full-viewport dashboard, blinking Live status, continuously updating Dayton local-news ticker, weather-card local clock, live Service Homes, dedicated workforce Scheduling, separate Time & Attendance, Employee 360 routing, Spire launcher and canonical Railway data are published.');
