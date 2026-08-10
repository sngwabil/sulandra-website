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

const [adminHtml,adminJs,contextJs,shellJs,shellCss,liveJs,enterpriseAppsJs,companySettingsJs,analogClockJs,homesJs,cleanupJs,schedulingHtml,schedulingJs,timeAttendanceHtml] = await Promise.all([
  mustRead('admin.html'), mustRead('admin-railway.js'), mustRead('assets/admin-company-context.js'),
  mustRead('assets/admin-shell.js'), mustRead('assets/admin-shell.css'), mustRead('assets/admin-live-dashboard.js'),
  mustRead('assets/admin-enterprise-apps-launcher.js'), mustRead('assets/admin-company-settings.js'),
  mustRead('assets/admin-analog-clock.js'), mustRead('assets/admin-service-home-management-v2.js'),
  mustRead('assets/admin-dashboard-cleanup.js'), mustRead('scheduling.html'),
  mustRead('assets/time-attendance-location-scheduler.js'), mustRead('time-attendance.html'),
]);

if (!adminHtml.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2')) failures.push('Admin page is not loading the canonical company/navigation bootstrap');
for (const marker of [
  "'/assets/admin-shell.js?v=20260810-canonical-admin-1'",
  "'/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v5'",
  "'/assets/admin-enterprise-apps-launcher.js?v=20260810-enterprise-apps-1'",
  "'/assets/admin-company-settings.js?v=20260810-company-settings-backend-1'",
  "'/assets/admin-analog-clock.js?v=20260808-analog-wall-clock-v1'",
  "'/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5'",
  "'/assets/admin-dashboard-cleanup.js?v=20260808-dashboard-cleanup-v1'",
]) if (!contextJs.includes(marker)) failures.push(`Canonical Admin bootstrap is not loading ${marker}`);
if (contextJs.includes('admin-platform-routing.js')) failures.push('Legacy Admin route patcher is still part of the canonical runtime');

for (const marker of [
  'html,body{width:100%!important', 'max-width:none!important', 'min-width:0!important', 'overflow-x:hidden!important',
  '.sulandra-platform-bar', '@keyframes sulandraNewsTicker', '@keyframes sulandraLiveBlink',
  'body .edge-toggle{width:24px!important;height:104px!important',
]) if (!shellCss.includes(marker)) failures.push(`Canonical Admin shell CSS is missing ${marker}`);
for (const marker of [
  'NEWS_REFRESH_MS = 10 * 60 * 1000', 'Dayton%20Ohio%20when%3A1d', 'sulandraNewsTrack',
  'weather-mini-clock', "timeZone:'America/New_York'", 'ensureModuleHosts()', "employee.id = 'module-employees'",
]) if (!shellJs.includes(marker)) failures.push(`Canonical Admin shell runtime is missing ${marker}`);

if (!adminJs.includes('sulandra:admin:active-module')) failures.push('Admin module persistence key is missing');
if (!adminJs.includes('history.replaceState')) failures.push('Admin module URL/hash persistence is missing');
if (!adminJs.includes('https://sulandra-website-production-5fc4.up.railway.app')) failures.push('Admin runtime is not using canonical Railway API');
if (adminJs.includes('https://sulandra-website-production.up.railway.app')) failures.push('Admin runtime still contains the retired Railway API hostname');

for (const marker of [
  "'/api/admin/company-settings'", "method: 'PATCH'", "'X-Legal-Entity-Id'", 'localStorage.removeItem(LEGACY_SETTINGS_KEY)',
  'adminCompanySettingsBackendStatus', 'adminCompanySettingsReload', 'settingEmploymentDisclaimer', 'settingTimezone',
  'settingSupportEmail', 'settingSupportPhone', 'settingWebsite', 'sulandra:company-change', 'sulandra:entity-context-changed', 'beforeunload',
]) if (!companySettingsJs.includes(marker)) failures.push(`Backend Company Settings runtime is missing ${marker}`);

for (const marker of [
  'Sulandra Health Command Center', 'api.open-meteo.com', '/api/admin/dashboard',
  'edge-toggle', 'edge-drawer left', 'edge-drawer right', "id:'weather'", "id:'people'", "type:'clock'",
  "type:'appointments'", "type:'reminders'", "type:'alarms'", 'card-drag-handle', 'pointerdown', 'contextmenu',
  'Edit Dashboard Widget', 'dashboard-slide', 'dashboardPageDots', 'ACTIVE_MODULE_KEY', 'hashchange',
]) if (!liveJs.includes(marker)) failures.push(`Live command center is missing required capability: ${marker}`);
for (const marker of ['wall-clock-face','wall-clock-hour','wall-clock-minute','wall-clock-second','data-sulandra-analog-clock','setInterval(tick, 1000)',"const TIME_ZONE = 'America/New_York'"]) {
  if (!analogClockJs.includes(marker)) failures.push(`Analog wall clock runtime is missing ${marker}`);
}
for (const marker of ['Enterprise Apps','enterprise-apps.html']) if (!enterpriseAppsJs.includes(marker)) failures.push(`Enterprise Apps launcher is missing ${marker}`);
for (const marker of ['/api/admin/service-homes','/api/admin/service-homes/directory/employees','/api/admin/service-homes/directory/clients','Create Service Home','Open Schedule']) {
  if (!homesJs.includes(marker)) failures.push(`Service Homes live manager is missing capability: ${marker}`);
}
for (const marker of ['sulandraOwnerConsoleButton','/^[123]\\s*\\/\\s*3$/']) if (!cleanupJs.includes(marker)) failures.push(`Admin cleanup is missing ${marker}`);

for (const [key,target] of Object.entries({
  scheduling:'/scheduling.html', time:'/time-attendance.html#admin', documents:'/employee360.html#files', reports:'/employee360.html#audit', spire:'/spire-admin.html',
})) {
  if (!contextJs.includes(`key:'${key}'`) || !contextJs.includes(`href:'${target}'`)) failures.push(`Canonical Admin navigation missing ${key} -> ${target}`);
}
for (const marker of ["href:'/client-intake.html'","href:'/company-documents.html'","href:'/spire-training.html'","href:'/workforce-admin.html'","href:'/intranet-control.html'"]) {
  if (!contextJs.includes(marker)) failures.push(`Canonical Admin extended navigation is missing ${marker}`);
}
if (!contextJs.includes('window.SulandraAdminNavigation')) failures.push('Canonical Admin navigation registry is not exposed for shared drawer/runtime use');
if (!contextJs.includes('renderRightDrawer')) failures.push('Platform portal drawer is not rendered from the canonical navigation registry');

for (const marker of [
  '<title>Sulandra Health | Scheduling</title>', 'Workforce Schedule Control', 'id="schedulerHost"',
  '/assets/time-attendance-location-scheduler.js', 'Scheduling is separate from Time & Attendance',
]) if (!schedulingHtml.includes(marker)) failures.push(`Dedicated Scheduling page is missing ${marker}`);
for (const marker of [
  "if (!/\\/scheduling(?:\\.html|\\/)?$/i.test(location.pathname)) return;", "document.getElementById('schedulerHost')",
  '/api/admin/time-attendance/locations', '/api/admin/time-attendance/location-grid', '/api/admin/time-attendance/copy-schedule',
  'Save & Publish', 'Search employee', 'Next 12 months',
]) if (!schedulingJs.includes(marker)) failures.push(`Dedicated Scheduling runtime is missing ${marker}`);
if (timeAttendanceHtml.includes('/assets/time-attendance-location-scheduler.js')) failures.push('Time & Attendance still loads the workforce Scheduling runtime');

if (failures.length) {
  console.error('Admin command-center verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Admin command center verified from canonical sources: one navigation registry, full-viewport shell, live dashboard, backend Company Settings, Enterprise Apps, analog clock, live Service Homes, dedicated Scheduling, separate Time & Attendance, Employee 360, SPIRE and company-scoped workspaces are published.');
