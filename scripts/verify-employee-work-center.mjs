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
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${label} is missing required marker: ${marker}`);
  }
}

const [portal, controller, myWork, notifications, notificationRoutes] = await Promise.all([
  mustRead('employee-portal.html'),
  mustRead('employee-portal-railway.js'),
  mustRead('my-work.html'),
  mustRead('notifications.html'),
  mustRead('api/src/enterprise-work-notification-routes.ts'),
]);

requireMarkers('Employee Portal', portal, [
  'id="employeeMyWorkNav"',
  'id="employeeNotificationsNav"',
  'id="employeeNotificationsHeader"',
  'id="employeeMyWorkLauncher"',
  'id="employeeNotificationsLauncher"',
  'id="employeeWorkCenterTitle"',
  'id="employeeMyWorkCountText"',
  'id="employeeNotificationCountText"',
  'id="employeeUrgentCountText"',
  'href="/my-work.html"',
  'href="/notifications.html"',
]);

requireMarkers('Employee Portal controller', controller, [
  'installPrimaryWorkLaunchers',
  'refreshWorkCenter',
  '/api/work/notifications/summary',
  '/api/spire/inbasket',
  '/api/scls/tasks?mine=true',
  '/api/home-health/my-visits',
  '/api/nmt/driver/my-trips',
  '/api/workforce/time/corrections',
  'x-legal-entity-id',
  'employeeNotificationHeaderCount',
  'employeeMyWorkQuickCount',
  '60000',
]);

requireMarkers('My Work', myWork, [
  'SPIRE In Basket',
  'SCLS Assigned Tasks',
  'Home Health Visits',
  'NMT Trips',
  'Workforce Corrections',
  'Learning & Training',
  '/api/spire/inbasket',
  '/api/scls/tasks?mine=true',
  '/api/home-health/my-visits',
  '/api/nmt/driver/my-trips',
  '/api/workforce/time/corrections',
]);

requireMarkers('Notifications', notifications, [
  'Urgent / Critical',
  'Open Work',
  'Mark Read',
  'Mark Unread',
  'Complete',
  'Dismiss',
  '/api/work/notifications',
  '/api/work/notifications/summary',
  'data-open=',
]);

requireMarkers('Notification backend', notificationRoutes, [
  "app.get('/api/work/notifications'",
  "app.get('/api/work/notifications/summary'",
  "app.post('/api/work/notifications/:notificationId/action'",
  "z.enum(['READ','UNREAD','COMPLETE','DISMISS'])",
  'legalEntityId',
  'assignedUserId',
  'audienceRoles',
]);

for (const relative of [
  'employee-portal.html',
  'employee-portal-railway.js',
  'my-work.html',
  'notifications.html',
  'assets/sulandra-entity-context.js',
]) await mustExistInDist(relative);

const publishedPortal = await readFile(path.join(dist, 'employee-portal.html'), 'utf8');
requireMarkers('Published Employee Portal', publishedPortal, [
  'employeeMyWorkLauncher',
  'employeeNotificationsLauncher',
  'employeeWorkCenterTitle',
  '/my-work.html',
  '/notifications.html',
]);

console.log('Employee Work Center verified: My Work and Notifications are first-class employee navigation with live company-scoped counts, source queues, operational actions, and published static routes.');
