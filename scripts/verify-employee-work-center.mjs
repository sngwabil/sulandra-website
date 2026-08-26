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
function requireRoutePair(label, source, from, to) {
  const compact = source.replace(/\s+/g, '');
  const single = `['${from}','${to}']`;
  const double = `["${from}","${to}"]`;
  if (!compact.includes(single) && !compact.includes(double)) throw new Error(`${label} is missing route ${from} -> ${to}`);
}

const [portal, controller, myWork, notifications, notificationRoutes, crosslinks, entityContext, platformNavigation, selfService] = await Promise.all([
  mustRead('employee-portal.html'), mustRead('employee-portal-railway.js'), mustRead('my-work.html'), mustRead('notifications.html'),
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
if (controller.includes('window.location.replace("admin.html")')) {
  throw new Error('Employee Portal still forces privileged employees back to Admin.');
}

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
  'employee-portal.html','employee-portal-railway.js','employee-directory.html','leadership.html','my-work.html','notifications.html','assets/sulandra-entity-context.js',
  'assets/employee-work-crosslinks.js','my-work/index.html','notifications/index.html',
]) await mustExistInDist(relative);

const publishedPortal = await readFile(path.join(dist, 'employee-portal.html'), 'utf8');
requireMarkers('Published Employee Portal', publishedPortal, [
  'workspace-header','peopleDirectory','employeeMyWorkLauncher','employeeNotificationsLauncher','employeeWorkCenterTitle','employeeNotificationHeaderCount','/my-work.html','/notifications.html',
]);
if (publishedPortal.includes('Sulandra Health Platform</strong><a href="/admin.html#dashboard"')) {
  throw new Error('Published Employee Portal unexpectedly gained the global application strip.');
}

console.log('Employee Portal verified: universal authenticated employee access, Scheduling-style heading without the global app strip, live company-scoped employee and leadership directories, shared employee services, role-scoped applications, My Work and Notifications.');
