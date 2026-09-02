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

const [ownerHtml,operationsHtml,adminJs,routerJs,ownerContext,operationsContext,ownerBoundary,operationsDesktop,operationsShellJs,shellJs,shellCss,liveJs,companySettingsJs,analogClockJs,homesJs,cleanupJs,schedulingHtml,schedulingJs,timeAttendanceHtml] = await Promise.all([
  mustRead('admin.html'),mustRead('admin-operations.html'),mustRead('admin-railway.js'),mustRead('assets/admin-company-context.js'),
  mustRead('assets/admin-owner-context.js'),mustRead('assets/admin-operations-context.js'),mustRead('assets/admin-owner-console.js'),mustRead('assets/admin-operations-desktop.js'),
  mustRead('assets/admin-operations-shell.js'),mustRead('assets/admin-shell.js'),mustRead('assets/admin-shell.css'),mustRead('assets/admin-live-dashboard.js'),
  mustRead('assets/admin-company-settings.js'),mustRead('assets/admin-analog-clock.js'),mustRead('assets/admin-service-home-management-v2.js'),mustRead('assets/admin-dashboard-cleanup.js'),
  mustRead('scheduling.html'),mustRead('assets/time-attendance-location-scheduler.js'),mustRead('time-attendance.html'),
]);

for (const [label,html] of [['Owner Admin',ownerHtml],['Operations Admin',operationsHtml]]) {
  if (!html.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2')) failures.push(`${label} is not loading the Admin context router`);
}
for (const marker of ['admin-owner-context.js','admin-owner-console.js','admin-operations-shell.js','admin-operations-context.js','admin-operations-desktop.js']) {
  if (!routerJs.includes(marker)) failures.push(`Admin context router is missing ${marker}`);
}

// admin.html is intentionally the established parent-company owner command
// center. Preserve its live dashboard, local news, existing navigation and
// controls while hiding the company selector and adding only Operations.
for (const marker of [
  'NAVIGATION = Object.freeze({','primary: Object.freeze([',
  "'/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v5'",
  "'/assets/admin-enterprise-apps-launcher.js?v=20260810-enterprise-apps-1'",
  "'/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5'",
]) if (!ownerContext.includes(marker)) failures.push(`Owner command center is missing preserved capability: ${marker}`);
for (const marker of ['/api/owner/authority','ownerOperationsLauncher','/admin-operations.html','#adminCompanyContext']) {
  if (!ownerBoundary.includes(marker)) failures.push(`Owner command-center boundary is missing ${marker}`);
}
for (const marker of ['ensureCanonicalSso()','ensureNavigationOverflow','ensurePlatformBar','NEWS_REFRESH_MS','sulandraNewsTrack','weather-mini-clock',"timeZone:'America/New_York'"]) {
  if (!shellJs.includes(marker)) failures.push(`Preserved owner command-center shell is missing ${marker}`);
}

// The new company Operations desktop owns the eight-folder information
// architecture. Its dedicated shell must not create the owner news/overflow
// layers; it only provides SSO and module hosts required by company workspaces.
for (const marker of [
  "'/assets/admin-shell.js?v=20260825-admin-ia-1'",
  "'/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v5'",
  "'/assets/admin-company-settings.js?v=20260810-company-settings-backend-1'",
  "'/assets/admin-analog-clock.js?v=20260808-analog-wall-clock-v1'",
  "'/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5'",
  "'/assets/admin-dashboard-cleanup.js?v=20260808-dashboard-cleanup-v1'",
  "'/assets/admin-client-service-requests.js?v=20260809-company-intake-3'",
]) if (!operationsContext.includes(marker)) failures.push(`Operations bootstrap is not loading ${marker}`);
for (const forbidden of ['admin-enterprise-apps-launcher.js','admin-navigation-overflow.js','NAVIGATION.primary','NAVIGATION.leftOnly']) {
  if (operationsContext.includes(forbidden)) failures.push(`Operations bootstrap still contains overlapping navigation layer: ${forbidden}`);
}
for (const marker of [
  'topActions: Object.freeze([','folders: Object.freeze([',
  "label:'Company Management'","label:'People & HR'","label:'Clients & SPIRE'","label:'Service Operations'",
  "label:'Billing & Revenue'","label:'Compliance & Quality'","label:'Communications & Learning'","label:'System Administration'",
  'adminGlobalToolSearch','admin-nav-folder','data-company-modules',
  "key:'onboarding',label:'Hiring & Onboarding'","key:'service-requests',label:'Service Requests'",
  "key:'admin-users',label:'Admin Users'","key:'role-workspaces',label:'Roles, Permissions & Workspaces'",
  "serviceModule.id = 'module-service-requests'",'onboardingLifecycle:Object.freeze([',
]) if (!operationsContext.includes(marker)) failures.push(`Operations information architecture is missing ${marker}`);
for (const stage of ['Overview','Job Openings','Applicants','Screening','Interviews','Offers','Pre-employment','New-hire Paperwork','Orientation','Employee Activation','Archive']) {
  if (!operationsContext.includes(`label:'${stage}'`)) failures.push(`Hiring & Onboarding lifecycle is missing ${stage}`);
}
const lifecycleStart = operationsContext.indexOf('onboardingLifecycle:Object.freeze([');
const lifecycleEnd = operationsContext.indexOf('contextual:Object.freeze([');
const lifecycle = lifecycleStart >= 0 && lifecycleEnd > lifecycleStart ? operationsContext.slice(lifecycleStart,lifecycleEnd) : '';
if (lifecycle.includes('Service Requests')) failures.push('Service Requests is still nested inside Hiring & Onboarding');
for (const marker of ['allowedOperatingEntities','hasActiveEmployment',"entity?.entityType === 'HOLDING'",'Company Operations','data-open-ops-folder']) {
  if (!operationsDesktop.includes(marker)) failures.push(`Operations desktop company boundary is missing ${marker}`);
}
for (const forbidden of ['ensureNavigationOverflow','ensurePlatformBar','NEWS_REFRESH_MS','sulandraNewsTrack']) {
  if (operationsShellJs.includes(forbidden)) failures.push(`Company Operations shell creates an owner-only top/overflow layer: ${forbidden}`);
}
for (const marker of ['ensureCanonicalSso()','ensureModuleHosts()','module-employees',"adminInformationArchitecture = 'company-operations-v1'"]) {
  if (!operationsShellJs.includes(marker)) failures.push(`Company Operations shell runtime is missing ${marker}`);
}

for (const marker of ['html,body{width:100%!important','max-width:none!important','min-width:0!important','overflow-x:hidden!important']) {
  if (!shellCss.includes(marker)) failures.push(`Canonical Admin shell CSS is missing ${marker}`);
}

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
]) if (!liveJs.includes(marker)) failures.push(`Preserved live command center is missing required capability: ${marker}`);
for (const marker of ['wall-clock-face','wall-clock-hour','wall-clock-minute','wall-clock-second','data-sulandra-analog-clock','setInterval(tick, 1000)',"const TIME_ZONE = 'America/New_York'"]) {
  if (!analogClockJs.includes(marker)) failures.push(`Analog wall clock runtime is missing ${marker}`);
}
for (const marker of ['/api/admin/service-homes','/api/admin/service-homes/directory/employees','/api/admin/service-homes/directory/clients','Create Service Home','Open Schedule']) {
  if (!homesJs.includes(marker)) failures.push(`Service Homes live manager is missing capability: ${marker}`);
}
for (const marker of ['sulandraOwnerConsoleButton','/^[123]\\s*\\/\\s*3$/']) if (!cleanupJs.includes(marker)) failures.push(`Admin cleanup is missing ${marker}`);

for (const marker of ['<title>Sulandra Health | Scheduling</title>','Workforce Schedule Control','id="schedulerHost"','/assets/time-attendance-location-scheduler.js','Scheduling is separate from Time & Attendance']) {
  if (!schedulingHtml.includes(marker)) failures.push(`Dedicated Scheduling page is missing ${marker}`);
}
for (const marker of ["if (!/\\/scheduling(?:\\.html|\\/)?$/i.test(location.pathname)) return;","document.getElementById('schedulerHost')",'/api/admin/time-attendance/locations','/api/admin/time-attendance/location-grid','/api/admin/time-attendance/copy-schedule','Save & Publish','Search employee','Next 12 months']) {
  if (!schedulingJs.includes(marker)) failures.push(`Dedicated Scheduling runtime is missing ${marker}`);
}
if (timeAttendanceHtml.includes('/assets/time-attendance-location-scheduler.js')) failures.push('Time & Attendance still loads the workforce Scheduling runtime');

if (failures.length) {
  console.error('Admin command-center verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Admin command center verified: the existing Sulandra Health owner dashboard and shell are preserved and owner-gated, while the separate Operations desktop owns the eight-folder company administration shell.');
