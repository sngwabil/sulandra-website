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

const [adminHtml,adminJs,contextJs,shellJs,shellCss,liveJs,companySettingsJs,analogClockJs,homesJs,cleanupJs,schedulingHtml,schedulingJs,timeAttendanceHtml] = await Promise.all([
  mustRead('admin.html'), mustRead('admin-railway.js'), mustRead('assets/admin-company-context.js'),
  mustRead('assets/admin-shell.js'), mustRead('assets/admin-shell.css'), mustRead('assets/admin-live-dashboard.js'),
  mustRead('assets/admin-company-settings.js'), mustRead('assets/admin-analog-clock.js'),
  mustRead('assets/admin-service-home-management-v2.js'), mustRead('assets/admin-dashboard-cleanup.js'),
  mustRead('scheduling.html'), mustRead('assets/time-attendance-location-scheduler.js'), mustRead('time-attendance.html'),
]);

if (!adminHtml.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2')) failures.push('Admin page is not loading the canonical company/navigation bootstrap');
for (const marker of [
  "'/assets/admin-shell.js?v=20260825-admin-ia-1'",
  "'/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v5'",
  "'/assets/admin-company-settings.js?v=20260810-company-settings-backend-1'",
  "'/assets/admin-analog-clock.js?v=20260808-analog-wall-clock-v1'",
  "'/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5'",
  "'/assets/admin-dashboard-cleanup.js?v=20260808-dashboard-cleanup-v1'",
  "'/assets/admin-client-service-requests.js?v=20260809-company-intake-3'",
]) if (!contextJs.includes(marker)) failures.push(`Canonical Admin bootstrap is not loading ${marker}`);

for (const forbidden of ['admin-enterprise-apps-launcher.js','admin-navigation-overflow.js','NAVIGATION.primary','NAVIGATION.leftOnly']) {
  if (contextJs.includes(forbidden)) failures.push(`Canonical Admin bootstrap still contains overlapping navigation layer: ${forbidden}`);
}
for (const forbidden of ['ensureNavigationOverflow','ensurePlatformBar','NEWS_REFRESH_MS','sulandraNewsTrack']) {
  if (shellJs.includes(forbidden)) failures.push(`Canonical Admin shell still creates a second top/overflow navigation layer: ${forbidden}`);
}

for (const marker of [
  'topActions: Object.freeze([','folders: Object.freeze([',
  "label:'Company Management'","label:'People & HR'","label:'Clients & SPIRE'","label:'Service Operations'",
  "label:'Billing & Revenue'","label:'Compliance & Quality'","label:'Communications & Learning'","label:'System Administration'",
  'adminGlobalToolSearch','admin-nav-folder','data-company-modules',
  "key:'onboarding',label:'Hiring & Onboarding'","key:'service-requests',label:'Service Requests'",
  "key:'admin-users',label:'Admin Users'","key:'role-workspaces',label:'Roles, Permissions & Workspaces'",
  "serviceModule.id = 'module-service-requests'",'onboardingLifecycle:Object.freeze([',
]) if (!contextJs.includes(marker)) failures.push(`Admin information architecture is missing ${marker}`);

for (const stage of ['Overview','Job Openings','Applicants','Screening','Interviews','Offers','Pre-employment','New-hire Paperwork','Orientation','Employee Activation','Archive']) {
  if (!contextJs.includes(`label:'${stage}'`)) failures.push(`Hiring & Onboarding lifecycle is missing ${stage}`);
}
const lifecycleStart = contextJs.indexOf('onboardingLifecycle:Object.freeze([');
const lifecycleEnd = contextJs.indexOf('contextual:Object.freeze([');
const lifecycle = lifecycleStart >= 0 && lifecycleEnd > lifecycleStart ? contextJs.slice(lifecycleStart,lifecycleEnd) : '';
if (lifecycle.includes('Service Requests')) failures.push('Service Requests is still nested inside Hiring & Onboarding');

for (const marker of [
  'html,body{width:100%!important','max-width:none!important','min-width:0!important','overflow-x:hidden!important',
]) if (!shellCss.includes(marker)) failures.push(`Canonical Admin shell CSS is missing ${marker}`);
for (const marker of [
  'ensureCanonicalSso()','removeLegacyNavigationArtifacts()','weather-mini-clock',"timeZone:'America/New_York'",
  "adminInformationArchitecture = 'canonical-folders-v1'",
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
  "id:'weather'", "id:'people'", "type:'clock'", "type:'appointments'", "type:'reminders'", "type:'alarms'",
  'card-drag-handle', 'pointerdown', 'contextmenu', 'Edit Dashboard Widget', 'dashboard-slide', 'dashboardPageDots',
  'ACTIVE_MODULE_KEY', 'hashchange',
]) if (!liveJs.includes(marker)) failures.push(`Live command center is missing required capability: ${marker}`);
for (const marker of ['wall-clock-face','wall-clock-hour','wall-clock-minute','wall-clock-second','data-sulandra-analog-clock','setInterval(tick, 1000)',"const TIME_ZONE = 'America/New_York'"]) {
  if (!analogClockJs.includes(marker)) failures.push(`Analog wall clock runtime is missing ${marker}`);
}
for (const marker of ['/api/admin/service-homes','/api/admin/service-homes/directory/employees','/api/admin/service-homes/directory/clients','Create Service Home','Open Schedule']) {
  if (!homesJs.includes(marker)) failures.push(`Service Homes live manager is missing capability: ${marker}`);
}
for (const marker of ['sulandraOwnerConsoleButton','/^[123]\\s*\\/\\s*3$/']) if (!cleanupJs.includes(marker)) failures.push(`Admin cleanup is missing ${marker}`);

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
console.log('Admin command center verified: one eight-folder Admin shell preserves the live dashboard and company settings while overflow, drawer and Enterprise Apps navigation injection remain disabled.');
