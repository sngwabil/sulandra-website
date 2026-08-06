import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const bootstrapPath = path.join(root, 'api/src/onboarding-bootstrap.ts');
const importLine = "import { registerTimeAttendanceRoutes } from './time-attendance-routes.js';";
const registerLine = 'registerTimeAttendanceRoutes({ app, prisma, authOf, requireRoles });';

let bootstrap = await readFile(bootstrapPath, 'utf8');
if (!bootstrap.includes(importLine)) {
  const anchor = "import { registerCareersRoutes } from './careers-routes.js';";
  if (!bootstrap.includes(anchor)) throw new Error('Unable to locate careers route import anchor');
  bootstrap = bootstrap.replace(anchor, `${anchor}\n${importLine}`);
}
if (!bootstrap.includes(registerLine)) {
  const anchor = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
  if (!bootstrap.includes(anchor)) throw new Error('Unable to locate careers route registration anchor');
  bootstrap = bootstrap.replace(anchor, `${registerLine}\n\n${anchor}`);
}
await writeFile(bootstrapPath, bootstrap);

const portalFiles = ['employee-portal.html', 'admin.html', 'desktop.html', 'employee-desktop.html'];
const navigationScript = `\n<script id="sulandra-time-attendance-navigation">\n(() => {\n  const target = 'https://www.sulandrahealth.com/time-attendance.html';\n  const adminRoles = new Set(['ADMINISTRATOR','PROGRAM_MANAGER','HR_MANAGER','SCHEDULER','CEO','COO']);\n  const readSession = () => {\n    for (const key of ['sulandraSession','employeeSession','session','authSession']) {\n      try { const value = JSON.parse(localStorage.getItem(key) || 'null'); if (value) return value; } catch {}\n    }\n    return {};\n  };\n  const role = String(readSession()?.user?.role || readSession()?.role || '').toUpperCase();\n  document.addEventListener('click', (event) => {\n    const control = event.target.closest('a,button,[role="button"]');\n    if (!control) return;\n    const label = [control.textContent, control.getAttribute('aria-label'), control.getAttribute('title'), control.id].filter(Boolean).join(' ').toLowerCase();\n    if (!/(time\\s*(and|&)\\s*attendance|timecard|time card|timesheet|clock\\s*in|clock\\s*out|scheduler|scheduling)/i.test(label)) return;\n    event.preventDefault();\n    const adminIntent = /(admin|manage|scheduler|scheduling|all employees)/i.test(label);\n    const suffix = adminIntent && adminRoles.has(role) ? '#admin' : '';\n    window.location.assign(target + suffix);\n  }, true);\n})();\n</script>\n`;

for (const name of portalFiles) {
  const filePath = path.join(root, name);
  try { await access(filePath); } catch { continue; }
  let html = await readFile(filePath, 'utf8');
  html = html.replace(/\n?<script id="sulandra-time-attendance-navigation">[\s\S]*?<\/script>\n?/g, '\n');
  if (!html.includes('</body>')) continue;
  html = html.replace('</body>', `${navigationScript}</body>`);
  await writeFile(filePath, html);
}

console.log('Time and Attendance routes and static-frontend portal navigation are installed.');
