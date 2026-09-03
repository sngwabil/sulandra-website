import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api/src/onboarding-bootstrap.ts');
const careersImport = "import { registerCareersRoutes } from './careers-routes.js';";
const ownerImport = "import { registerOwnerAuthorityRoutes } from './owner-authority-routes.js';";
const serviceHomesImport = "import { registerServiceHomeManagementRoutes } from './service-home-management-routes.js';";
const ohioIspClockOutImport = "import { registerSpireOhioIspClockOutGuard } from './spire-ohio-isp-clockout-guard.js';";
const geofenceImport = "import { registerTimeAttendanceGeofenceRoutes } from './time-attendance-geofence-routes.js';";
const exceptionImport = "import { registerTimeAttendanceExceptionRoutes } from './time-attendance-exception-routes.js';";
const locationImport = "import { registerTimeAttendanceLocationSchedulerRoutes } from './time-attendance-location-scheduler-routes.js';";
const dayBoardImport = "import { registerTimeAttendanceDayBoardRoutes } from './time-attendance-day-board-routes.js';";
const attendanceImport = "import { registerTimeAttendanceRoutes } from './time-attendance-routes.js';";
const ownerRegister = 'registerOwnerAuthorityRoutes({ app, prisma, authOf });';
const serviceHomesRegister = 'registerServiceHomeManagementRoutes({ app, prisma, authOf, requireRoles });';
const ohioIspClockOutRegister = 'registerSpireOhioIspClockOutGuard({ app, prisma, authOf });';
const geofenceRegister = 'registerTimeAttendanceGeofenceRoutes({ app, prisma, authOf, requireRoles });';
const exceptionRegister = 'registerTimeAttendanceExceptionRoutes({ app, prisma, authOf, requireRoles });';
const locationRegister = 'registerTimeAttendanceLocationSchedulerRoutes({ app, prisma, authOf, requireRoles });';
const dayBoardRegister = 'registerTimeAttendanceDayBoardRoutes({ app, prisma, authOf, requireRoles });';
const attendanceRegister = 'registerTimeAttendanceRoutes({ app, prisma, authOf, requireRoles });';
const careersRegister = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';

let bootstrap = await readFile(bootstrapPath, 'utf8');
if (!bootstrap.includes(careersImport)) throw new Error('Unable to locate careers route import anchor');
if (!bootstrap.includes(ownerImport)) bootstrap = bootstrap.replace(careersImport, `${careersImport}\n${ownerImport}`);
if (!bootstrap.includes(serviceHomesImport)) bootstrap = bootstrap.replace(ownerImport, `${ownerImport}\n${serviceHomesImport}`);
if (!bootstrap.includes(geofenceImport)) bootstrap = bootstrap.replace(serviceHomesImport, `${serviceHomesImport}\n${geofenceImport}`);
if (!bootstrap.includes(ohioIspClockOutImport)) bootstrap = bootstrap.replace(geofenceImport, `${ohioIspClockOutImport}\n${geofenceImport}`);
if (!bootstrap.includes(exceptionImport)) bootstrap = bootstrap.replace(geofenceImport, `${geofenceImport}\n${exceptionImport}`);
if (!bootstrap.includes(locationImport)) bootstrap = bootstrap.replace(exceptionImport, `${exceptionImport}\n${locationImport}`);
if (!bootstrap.includes(dayBoardImport)) bootstrap = bootstrap.replace(locationImport, `${locationImport}\n${dayBoardImport}`);
if (!bootstrap.includes(attendanceImport)) bootstrap = bootstrap.replace(dayBoardImport, `${dayBoardImport}\n${attendanceImport}`);
if (!bootstrap.includes(careersRegister)) throw new Error('Unable to locate careers route registration anchor');
for (const line of [ownerRegister, serviceHomesRegister, ohioIspClockOutRegister, geofenceRegister, exceptionRegister, locationRegister, dayBoardRegister, attendanceRegister]) {
  bootstrap = bootstrap.replace(new RegExp(`\\n?${line.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`, 'g'), '\n');
}
bootstrap = bootstrap.replace(careersRegister, `${ownerRegister}\n${serviceHomesRegister}\n${ohioIspClockOutRegister}\n${geofenceRegister}\n${exceptionRegister}\n${locationRegister}\n${dayBoardRegister}\n${attendanceRegister}\n\n${careersRegister}`);
await writeFile(bootstrapPath, bootstrap, 'utf8');

const staticBase = 'https://www.sulandrahealth.com';
// Canonical Admin owns its own navigation and authenticated request lifecycle.
// Do not inject Time & Attendance's global blocked-punch fetch wrapper into it.
const portalFiles = ['employee-portal.html', 'desktop.html', 'employee-desktop.html'];
const attendanceAssets = `<script src="/assets/time-attendance-blocked-attempts.js?v=20260806-location-1"></script>\n<script src="/assets/time-attendance-geofence.js?v=20260806-location-1"></script>\n<script src="/assets/time-attendance-location-scheduler.js?v=20260806-location-1"></script>`;
const navigationScript = `\n<script id="sulandra-time-attendance-navigation">\n(() => {\n  const staticBase = '${staticBase}';\n  const adminRoles = new Set(['ADMINISTRATOR','PROGRAM_MANAGER','HR_MANAGER','SCHEDULER','CEO','DOO','HOUSE_MANAGER']);\n  const readSession = () => {\n    for (const key of ['sulandra:employee:session','sulandraSession','employeeSession','session','authSession']) {\n      for (const store of [sessionStorage,localStorage]) {\n        try { const value = JSON.parse(store.getItem(key) || 'null'); if (value) return value; } catch {}\n      }\n    }\n    return {};\n  };\n  const session = readSession();\n  const role = String(session?.user?.role || session?.role || '').toUpperCase();\n  const wire = () => document.querySelectorAll('a,button,[role="button"]').forEach(control => {\n    const label = [control.textContent, control.getAttribute('aria-label'), control.getAttribute('title'), control.id].filter(Boolean).join(' ').toLowerCase();\n    if (control.id === 'employeeStaticScheduling') {\n      const target = staticBase + '/scheduling.html';\n      control.dataset.sulandraTimeAttendanceTarget = target;\n      if (control.tagName === 'A') control.setAttribute('href', target);\n      return;\n    }\n    if (/\\bscheduling\\b|admin scheduler|manage all schedules/i.test(label) && adminRoles.has(role)) {\n      control.dataset.sulandraTimeAttendanceTarget = staticBase + '/scheduling.html';\n      if (control.tagName === 'A') control.setAttribute('href', staticBase + '/scheduling.html');\n      return;\n    }\n    if (!/(time\\s*(and|&)\\s*attendance|timecard|time card|timesheet|clock\\s*in|clock\\s*out)/i.test(label)) return;\n    const adminIntent = /(admin|manage|all employees)/i.test(label);\n    const target = staticBase + '/time-attendance.html' + (adminIntent && adminRoles.has(role) ? '#admin' : '');\n    control.dataset.sulandraTimeAttendanceTarget = target;\n    if (control.tagName === 'A') control.setAttribute('href', target);\n  });\n  wire();\n  new MutationObserver(wire).observe(document.documentElement,{subtree:true,childList:true});\n  document.addEventListener('click', event => {\n    const control = event.target.closest('[data-sulandra-time-attendance-target]');\n    if (!control) return;\n    event.preventDefault(); event.stopImmediatePropagation();\n    window.location.assign(control.dataset.sulandraTimeAttendanceTarget);\n  }, true);\n})();\n</script>\n${attendanceAssets}\n`;

const removeAttendanceAssets = html => html
  .replace(/\s*<script src="\/assets\/time-attendance-geofence\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/time-attendance-blocked-attempts\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/time-attendance-location-scheduler\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');

for (const name of portalFiles) {
  const filePath = path.join(root, name);
  try { await access(filePath); } catch { continue; }
  let html = await readFile(filePath, 'utf8');
  html = html.replace(/\s*<script id="sulandra-time-attendance-navigation">[\s\S]*?<\/script>\s*/g, '\n');
  html = removeAttendanceAssets(html);
  if (!html.includes('</body>')) continue;
  html = html.replace('</body>', `${navigationScript}</body>`);
  await writeFile(filePath, html, 'utf8');
}

const attendancePage = path.join(root, 'time-attendance.html');
try {
  let html = await readFile(attendancePage, 'utf8');
  html = removeAttendanceAssets(html);
  html = html.replace('</body>', `  ${attendanceAssets}\n</body>`);
  await writeFile(attendancePage, html, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

console.log('Enterprise owner authority, unified service home management, OhioISP shift-completion guard, Time and Attendance routes, dedicated daily Scheduling board, location-based workforce scheduler, GPS geofencing, blocked-attempt flags, manual punch review, and static portal navigation are installed without wrapping canonical Admin fetch requests.');
