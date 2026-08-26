import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');

async function mustRead(relative) {
  const file = path.join(root, relative);
  try { return await readFile(file, 'utf8'); }
  catch (error) { throw new Error(`Employee Work Center verification failed: cannot read ${relative}: ${error.message}`); }
}
async function mustExistInDist(relative) {
  try { await stat(path.join(dist, relative)); }
  catch { throw new Error(`Employee Work Center publication failed: dist-web/${relative} is missing`); }
}
function requireMarkers(label, source, markers) {
  for (const marker of markers) if (!source.includes(marker)) throw new Error(`${label} is missing required marker: ${marker}`);
}
function forbidMarkers(label, source, markers) {
  for (const marker of markers) if (source.includes(marker)) throw new Error(`${label} still contains forbidden marker: ${marker}`);
}
function requireRoutePair(label, source, from, to) {
  const compact = source.replace(/\s+/g, '');
  const single = `['${from}','${to}']`;
  const double = `["${from}","${to}"]`;
  if (!compact.includes(single) && !compact.includes(double)) throw new Error(`${label} is missing route ${from} -> ${to}`);
}

const [
  portal, controller, employeeLogin, employeeLoginRuntime, adminLogin, adminLoginRuntime,
  navGuard, adminCrossWorkspace, authBootstrap, hiringProvisioning,
  myWork, notifications, notificationRoutes, crosslinks, entityContext, platformNavigation, selfService,
] = await Promise.all([
  mustRead('employee-portal.html'), mustRead('employee-portal-railway.js'),
  mustRead('employee-login.html'), mustRead('employee-login-railway.js'),
  mustRead('admin-login.html'), mustRead('admin-login-railway.js'),
  mustRead('assets/employee-role-navigation-guard.js'), mustRead('assets/admin-cross-workspace-launcher.js'),
  mustRead('api/src/onboarding-bootstrap.ts'), mustRead('api/src/hiring-provisioning-routes.ts'),
  mustRead('my-work.html'), mustRead('notifications.html'),
  mustRead('api/src/enterprise-work-notification-routes.ts'), mustRead('assets/employee-work-crosslinks.js'),
  mustRead('assets/sulandra-entity-context.js'), mustRead('scripts/finalize-platform-navigation.mjs'),
  mustRead('api/src/employee-self-service-routes.ts'),
]);

requireMarkers('Employee Portal', portal, [
  'class="workspace-header"','Universal employee workspace','id="employeeAdminReturn"','id="peopleDirectory"',
  'id="employeeDirectorySearch"','id="directoryTabAll"','id="directoryTabDepartment"','id="directoryTabLeadership"',
  'id="employeeMyWorkNav"','id="employeeNotificationsNav"','id="employeeNotificationsHeader"','id="employeeMyWorkLauncher"',
  'id="employeeNotificationsLauncher"','id="employeeWorkCenterTitle"','id="employeeMyWorkCountText"','id="employeeNotificationCountText"',
  'id="employeeUrgentCountText"','id="employeeWorkBreakdown"','href="/my-work.html"','href="/notifications.html"',
]);
if (portal.includes('Sulandra Health Platform</strong><a href="/admin.html#dashboard"')) {
  throw new Error('Employee Portal must not publish the global application strip above its Scheduling-style heading.');
}

requireMarkers('Employee Portal controller', controller, [
  'installPrimaryWorkLaunchers','refreshWorkCenter','/api/work/notifications/summary','/api/spire/inbasket','/api/scls/tasks?mine=true',
  '/api/home-health/my-visits','/api/nmt/driver/my-trips','/api/workforce/time/corrections','x-legal-entity-id',
  'employeeNotificationHeaderCount','employeeMyWorkQuickCount','employeeUrgentCountText','60000',
  '/api/employee/directory','/api/employee/leadership','loadEmployeeDirectories','employeeAdminReturn','employeePortalUniversalAccess: true',
]);
forbidMarkers('Employee Portal controller', controller, ['window.location.replace("admin.html")']);

requireMarkers('Employee Portal navigation guard', navGuard, [
  "adminControl.href = '/admin-login.html?returnTo=/admin.html'",
  "adminControl.target = '_blank'", 'crossWorkspaceNewTab: true', 'loadingWatchdogMs: 8000',
  "document.body.dataset.employeePortalWatchdog = 'settled'",
]);

requireMarkers('Employee username login', employeeLogin, [
  'class="auth-card"','id="username"','placeholder="Example: sngwabil"',
  'Sulpitius Ndeh Gwabil → sngwabil','Administrator Sign In ↗','href="/admin-login.html"','target="_blank"',
]);
forbidMarkers('Employee username login', employeeLogin, [
  'Employee email or username','id="email" name="username"','Your employee workspace has its own sign-in',
  'One employee home','Role-aware access','Protected session','class="welcome"',
]);
requireMarkers('Employee login runtime', employeeLoginRuntime, [
  'portal: "EMPLOYEE"','username.includes("@")','/employee-portal.html','portalContext: "EMPLOYEE"',
  'Employee Portal uses your assigned employee username','window.sessionStorage.setItem(TOKEN_KEY, token)',
]);
forbidMarkers('Employee login runtime', employeeLoginRuntime, ['ADMIN_LANDING_ROLES','? "admin.html" : "employee-portal.html"']);

requireMarkers('Administrator login', adminLogin, [
  'Administrator Access','id="adminEmail"','name="email"','name@sulandrahealth.com',
  'id="adminPassword"','Employee Sign In ↗','target="_blank"','/admin-login-railway.js',
]);
requireMarkers('Administrator login runtime', adminLoginRuntime, [
  'portal: "ADMIN"','@sulandrahealth.com','ADMIN_ROLES','adminAllowed(session)',
  'sulandra:admin:access-token','sulandra:admin:session','portalContext: "ADMIN"','/admin.html','/admin-operations.html',
  'LEGACY_TOKEN_KEY','window.sessionStorage.setItem(LEGACY_TOKEN_KEY, token)',
]);

requireMarkers('Backend portal-mode login boundary', authBootstrap, [
  "portal: z.enum(['EMPLOYEE','ADMIN']).optional()",
  "requestedPortal === 'EMPLOYEE' && identifier.includes('@')",
  "requestedPortal === 'ADMIN' && (!identifier.includes('@') || !identifier.endsWith('@sulandrahealth.com'))",
  "requestedPortal === 'ADMIN' && !administrationRoles.has(account.role)",
  "reason: 'Admin portal entitlement required'",
]);

requireMarkers('Canonical employee username provisioning', hiringProvisioning, [
  'SULANDRA_CANONICAL_EMPLOYEE_USERNAME_V1','export function canonicalEmployeeUsername',
  "application.middleName ? String(application.middleName) : null",'sequence === 1 ? base : `${base}${sequence}`',
]);
const canonicalFormula = /const initials = \[first, \.\.\.middle\][\s\S]*?return `\$\{initials\}\$\{surname\}`/;
if (!canonicalFormula.test(hiringProvisioning)) throw new Error('Canonical employee username formula no longer uses first/middle initials followed by surname.');

requireMarkers('Admin cross-workspace launcher', adminCrossWorkspace, [
  "link.href = '/employee-login.html?returnTo=/employee-portal.html'","link.target = '_blank'",
  "link.rel = 'noopener noreferrer'",'Employee Portal ↗','window.SulandraAdminCrossWorkspace','opensNewTab: true',
]);

requireMarkers('Employee self-service directory backend', selfService, [
  'const employeeGate = requireRoles(...allRoles);',
  "app.get('/api/employee/directory'",
  "app.get('/api/employee/leadership'",
  'VIEW_EMPLOYEE_DIRECTORY','VIEW_EMPLOYEE_LEADERSHIP','legalEntityId',
]);

requireMarkers('My Work', myWork, [
  'SPIRE In Basket','SCLS Assigned Tasks','Home Health Visits','NMT Trips','Workforce Corrections','Learning & Training',
  '/api/spire/inbasket','/api/scls/tasks?mine=true','/api/home-health/my-visits','/api/nmt/driver/my-trips','/api/workforce/time/corrections',
]);
requireMarkers('Notifications', notifications, [
  'Urgent / Critical','Open Work','Mark Read','Mark Unread','Complete','Dismiss','/api/work/notifications','/api/work/notifications/summary','data-open=',
]);
requireMarkers('Notification backend', notificationRoutes, [
  "app.get('/api/work/notifications'","app.get('/api/work/notifications/summary'","app.post('/api/work/notifications/:notificationId/action'",
  "z.enum(['READ','UNREAD','COMPLETE','DISMISS'])",'legalEntityId','assignedUserId','audienceRoles',
]);
requireMarkers('Employee Work crosslinks', crosslinks, [
  '/api/work/notifications/summary','/notifications.html','/my-work.html','employee-work-cross-strip','urgent/critical','60000',
]);
requireMarkers('Entity context Work Center loader', entityContext, [
  'loadEmployeeWorkCrosslinks','/assets/employee-work-crosslinks.js?v=20260810-work-center-1','/my-work.html','/notifications.html',
]);

requireRoutePair('Clean Work Center routes', platformNavigation, '/my-work', '/my-work.html');
requireRoutePair('Clean Work Center routes', platformNavigation, '/notifications', '/notifications.html');
requireRoutePair('Clean Work Center route pages', platformNavigation, 'my-work', 'my-work.html');
requireRoutePair('Clean Work Center route pages', platformNavigation, 'notifications', 'notifications.html');

for (const relative of [
  'employee-login.html','employee-portal.html','employee-portal-railway.js','admin-login.html','admin-login-railway.js',
  'employee-directory.html','leadership.html','my-work.html','notifications.html','assets/sulandra-entity-context.js',
  'assets/employee-work-crosslinks.js','assets/employee-role-navigation-guard.js','assets/admin-cross-workspace-launcher.js',
  'my-work/index.html','notifications/index.html',
]) await mustExistInDist(relative);

const [publishedPortal, publishedEmployeeLogin, publishedAdminLogin] = await Promise.all([
  readFile(path.join(dist, 'employee-portal.html'), 'utf8'),
  readFile(path.join(dist, 'employee-login.html'), 'utf8'),
  readFile(path.join(dist, 'admin-login.html'), 'utf8'),
]);
requireMarkers('Published Employee Portal', publishedPortal, [
  'workspace-header','peopleDirectory','employeeMyWorkLauncher','employeeNotificationsLauncher','employeeWorkCenterTitle','employeeNotificationHeaderCount','/my-work.html','/notifications.html',
]);
requireMarkers('Published employee login', publishedEmployeeLogin, ['class="auth-card"','id="username"','placeholder="Example: sngwabil"','Administrator Sign In ↗']);
forbidMarkers('Published employee login', publishedEmployeeLogin, ['Your employee workspace has its own sign-in','One employee home','Role-aware access','Protected session','class="welcome"']);
requireMarkers('Published admin login', publishedAdminLogin, ['Administrator Access','id="adminEmail"','/admin-login-railway.js']);
if (publishedPortal.includes('Sulandra Health Platform</strong><a href="/admin.html#dashboard"')) {
  throw new Error('Published Employee Portal unexpectedly gained the global application strip.');
}

console.log('Employee Portal verified: universal employee workspace, non-blocking live panels, company-scoped people directories, centered username-only employee sign-in, Sulandra-email admin sign-in with backend entitlement enforcement, independent cross-workspace tabs, and canonical hire usernames such as sngwabil.');