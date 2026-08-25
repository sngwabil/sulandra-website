import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const failures = [];
async function mustRead(relative) {
  try { return await readFile(path.join(dist, relative), 'utf8'); }
  catch { failures.push(`Missing published file: ${relative}`); return ''; }
}

const [
  adminHtml,adminJs,contextJs,registryJs,iaJs,onboardingJs,shellJs,shellCss,liveJs,
  enterpriseAppsJs,companySettingsJs,analogClockJs,homesJs,cleanupJs,
  schedulingHtml,schedulingJs,timeAttendanceHtml,
] = await Promise.all([
  mustRead('admin.html'),mustRead('admin-railway.js'),mustRead('assets/admin-company-context.js'),
  mustRead('assets/admin-navigation-registry.js'),mustRead('assets/admin-information-architecture.js'),
  mustRead('assets/admin-onboarding-workflow.js'),mustRead('assets/admin-shell.js'),
  mustRead('assets/admin-shell.css'),mustRead('assets/admin-live-dashboard.js'),
  mustRead('assets/admin-enterprise-apps-launcher.js'),mustRead('assets/admin-company-settings.js'),
  mustRead('assets/admin-analog-clock.js'),mustRead('assets/admin-service-home-management-v2.js'),
  mustRead('assets/admin-dashboard-cleanup.js'),mustRead('scheduling.html'),
  mustRead('assets/time-attendance-location-scheduler.js'),mustRead('time-attendance.html'),
]);

let registry = {};
try {
  const sandbox = { window:{},document:{documentElement:{dataset:{}}},console };
  vm.runInNewContext(registryJs,sandbox,{filename:'admin-navigation-registry.js'});
  registry = sandbox.window.SulandraAdminRouteRegistry || {};
} catch (error) {
  failures.push(`Canonical Admin route registry cannot be evaluated: ${error instanceof Error ? error.message : String(error)}`);
}

for (const marker of [
  '/assets/admin-navigation-registry.js?v=20260825-admin-ia-1',
  '/assets/admin-information-architecture.js?v=20260825-admin-ia-1',
  '/assets/admin-onboarding-workflow.js?v=20260825-admin-ia-1',
  '/assets/admin-company-context.js?v=20260809-admin-company-context-2',
]) if (!adminHtml.includes(marker)) failures.push(`Admin page is not loading ${marker}`);

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
  'admin-ia-v2','admin-tool-search','admin-nav-folder','data-canonical-navigation',
  'moveServiceRequests','data-company-module','window.SulandraAdminIA',
]) if (!iaJs.includes(marker)) failures.push(`Admin information architecture is missing ${marker}`);
for (const marker of [
  'Hiring & Onboarding Overview','Review and screening','Activation and orientation',
  'onboardingStageGuidance','window.SulandraOnboardingLifecycle',
]) if (!onboardingJs.includes(marker)) failures.push(`Hiring and Onboarding workflow is missing ${marker}`);

for (const marker of [
  'html,body{width:100%!important','max-width:none!important','min-width:0!important','overflow-x:hidden!important',
  '.sulandra-platform-bar','@keyframes sulandraNewsTicker','@keyframes sulandraLiveBlink',
  'body .edge-toggle{width:24px!important;height:104px!important',
]) if (!shellCss.includes(marker)) failures.push(`Canonical Admin shell CSS is missing ${marker}`);
for (const marker of [
  'NEWS_REFRESH_MS = 10 * 60 * 1000','Dayton%20Ohio%20when%3A1d','sulandraNewsTrack',
  'weather-mini-clock',"timeZone:'America/New_York'",'ensureModuleHosts()',"employee.id = 'module-employees'",
]) if (!shellJs.includes(marker)) failures.push(`Canonical Admin shell runtime is missing ${marker}`);

if (!adminJs.includes('sulandra:admin:active-module')) failures.push('Admin module persistence key is missing');
if (!adminJs.includes('history.replaceState')) failures.push('Admin module URL/hash persistence is missing');
if (!adminJs.includes('https://sulandra-website-production-5fc4.up.railway.app')) failures.push('Admin runtime is not using canonical Railway API');
if (adminJs.includes('https://sulandra-website-production.up.railway.app')) failures.push('Admin runtime still contains the retired Railway API hostname');

for (const marker of [
  "'/api/admin/company-settings'","method: 'PATCH'","'X-Legal-Entity-Id'",'localStorage.removeItem(LEGACY_SETTINGS_KEY)',
  'adminCompanySettingsBackendStatus','adminCompanySettingsReload','settingEmploymentDisclaimer','settingTimezone',
  'settingSupportEmail','settingSupportPhone','settingWebsite','sulandra:company-change','sulandra:entity-context-changed','beforeunload',
]) if (!companySettingsJs.includes(marker)) failures.push(`Backend Company Settings runtime is missing ${marker}`);

for (const marker of [
  'Sulandra Health Command Center','api.open-meteo.com','/api/admin/dashboard','edge-toggle','edge-drawer left','edge-drawer right',
  "id:'weather'","id:'people'","type:'clock'","type:'appointments'","type:'reminders'","type:'alarms'",
  'card-drag-handle','pointerdown','contextmenu','Edit Dashboard Widget','dashboard-slide','dashboardPageDots','ACTIVE_MODULE_KEY','hashchange',
]) if (!liveJs.includes(marker)) failures.push(`Live command center is missing required capability: ${marker}`);
for (const marker of ['wall-clock-face','wall-clock-hour','wall-clock-minute','wall-clock-second','data-sulandra-analog-clock','setInterval(tick, 1000)',"const TIME_ZONE = 'America/New_York'"]) {
  if (!analogClockJs.includes(marker)) failures.push(`Analog wall clock runtime is missing ${marker}`);
}
for (const marker of ["const HREF='/enterprise-apps.html'","window.SulandraAdminRouteRegistry?.version === '2.0.0'"]) {
  if (!enterpriseAppsJs.includes(marker)) failures.push(`Enterprise Apps compatibility launcher is missing ${marker}`);
}
for (const marker of ['/api/admin/service-homes','/api/admin/service-homes/directory/employees','/api/admin/service-homes/directory/clients','Create Service Home','Open Schedule']) {
  if (!homesJs.includes(marker)) failures.push(`Service Homes live manager is missing capability: ${marker}`);
}
for (const marker of ['sulandraOwnerConsoleButton','/^[123]\\s*\\/\\s*3$/']) if (!cleanupJs.includes(marker)) failures.push(`Admin cleanup is missing ${marker}`);

const folders = Array.from(registry.folders || []);
const items = Array.from(registry.allItems || []);
const lifecycle = Array.from(registry.onboardingLifecycle || []);
const folderIds = folders.map(folder => folder.id);
const expectedFolders = [
  'company-management','people-hr','clients-spire','service-operations',
  'billing-revenue','compliance-quality','communications-learning','system-administration',
];
if (folderIds.join('|') !== expectedFolders.join('|')) failures.push(`Canonical Admin folder order changed: ${folderIds.join(', ')}`);
if (items.length < 50) failures.push(`Canonical Admin registry unexpectedly publishes only ${items.length} tools`);
if (lifecycle.length !== 9) failures.push(`Hiring and Onboarding must publish nine ordered stages, found ${lifecycle.length}`);
const itemById = new Map(items.map(item => [item.id,item]));
for (const [id,href] of Object.entries({
  scheduling:'/scheduling.html',time:'/time-attendance.html#admin',reports:'/employee360.html#audit',
  'spire-admin':'/spire-admin.html','client-intake':'/client-intake.html','company-documents':'/company-documents.html',
  training:'/spire-training.html','workforce-admin':'/workforce-admin.html','intranet-control':'/intranet-control.html',
  'service-requests':'/admin.html#service-requests','enterprise-apps':'/enterprise-apps.html',
})) {
  if (itemById.get(id)?.href !== href) failures.push(`Canonical Admin registry missing ${id} -> ${href}`);
}
for (const id of ['scls-residential','hh-referrals','hh-soc','hh-visits','hh-sources','nmt-facilities','nmt-invitations','nmt-orders','nmt-dispatch']) {
  if (!(itemById.get(id)?.companyCodes || []).length) failures.push(`Company-specific Admin tool is not scoped: ${id}`);
}
if (!contextJs.includes('window.SulandraAdminNavigation')) failures.push('Compatibility Admin navigation registry is not exposed for shared runtime use');
if (!contextJs.includes('renderRightDrawer')) failures.push('Platform portal drawer compatibility runtime is missing');

for (const marker of [
  '<title>Sulandra Health | Scheduling</title>','Workforce Schedule Control','id="schedulerHost"',
  '/assets/time-attendance-location-scheduler.js','Scheduling is separate from Time & Attendance',
]) if (!schedulingHtml.includes(marker)) failures.push(`Dedicated Scheduling page is missing ${marker}`);
for (const marker of [
  "if (!/\\/scheduling(?:\\.html|\\/)?$/i.test(location.pathname)) return;","document.getElementById('schedulerHost')",
  '/api/admin/time-attendance/locations','/api/admin/time-attendance/location-grid','/api/admin/time-attendance/copy-schedule',
  'Save & Publish','Search employee','Next 12 months',
]) if (!schedulingJs.includes(marker)) failures.push(`Dedicated Scheduling runtime is missing ${marker}`);
if (timeAttendanceHtml.includes('/assets/time-attendance-location-scheduler.js')) failures.push('Time & Attendance still loads the workforce Scheduling runtime');

if (failures.length) {
  console.error('Admin command-center verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`Admin command center verified: ${folders.length} ordered folders, ${items.length} registered tools, ${lifecycle.length} Hiring and Onboarding stages, company-scoped workspaces, full-viewport shell, live dashboard, backend Company Settings, Enterprise Apps, dedicated Scheduling and separate SPIRE clinical workspaces are published.`);
