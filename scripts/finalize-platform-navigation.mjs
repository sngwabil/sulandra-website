import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';

await import('./install-sulandra-sso-session.mjs');

const routeMap = new Map([
  ['/policies', '/policies.html'],
  ['/documents', '/policies.html'],
  ['/news', '/news.html'],
  ['/feedback', '/feedback.html'],
  ['/payroll', '/payroll.html'],
  ['/benefits', '/benefits.html'],
  ['/employee-directory', '/employee-directory.html'],
  ['/leadership', '/leadership.html'],
  ['/contact', '/employee-directory.html'],
  ['/support', '/support.html'],
  ['/it-request', '/support.html'],
  ['/time-attendance', '/time-attendance.html'],
  ['/scheduling', '/time-attendance.html#schedule'],
  ['/incident-reporting', '/health-safety.html'],
  ['/health-safety', '/health-safety.html'],
  ['/caregiver-resources', '/education-portal.html'],
  ['/about', '/index.html#about'],
  ['/services/community-living', '/services/community-living/index.html'],
  ['/services/waiver', '/services/community-living/index.html#services'],
  ['/logout', '/employee-login.html'],
]);

const cleanRoutePages = new Map([
  ['policies', 'policies.html'],
  ['documents', 'policies.html'],
  ['news', 'news.html'],
  ['feedback', 'feedback.html'],
  ['payroll', 'payroll.html'],
  ['benefits', 'benefits.html'],
  ['employee-directory', 'employee-directory.html'],
  ['leadership', 'leadership.html'],
  ['support', 'support.html'],
  ['it-request', 'support.html'],
  ['time-attendance', 'time-attendance.html'],
  ['scheduling', 'time-attendance.html'],
  ['incident-reporting', 'health-safety.html'],
  ['health-safety', 'health-safety.html'],
]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(target);
  }
  return files;
}

function replaceExactHref(html, from, to) {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(new RegExp(`href=(['"])${escaped}\\1`, 'g'), `href="${to}"`);
}

for (const file of await walk(dist)) {
  let html = await readFile(file, 'utf8');
  const original = html;
  for (const [from, to] of routeMap) html = replaceExactHref(html, from, to);
  if (html !== original) await writeFile(file, html, 'utf8');
}

for (const [route, source] of cleanRoutePages) {
  const sourcePath = path.join(dist, source);
  try { await stat(sourcePath); } catch { continue; }
  const routeDir = path.join(dist, route);
  await mkdir(routeDir, { recursive: true });
  await cp(sourcePath, path.join(routeDir, 'index.html'));
}

const timePath = path.join(dist, 'time-attendance.html');
try {
  let html = await readFile(timePath, 'utf8');
  const oldApi = "const API=(localStorage.getItem('sulandra_api_url')||window.SULANDRA_API_URL||'').replace(/\\/$/,'');";
  const oldToken = "const token=localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';";
  if (html.includes(oldApi)) html = html.replace(oldApi, `const API='${canonicalApi}';`);
  if (html.includes(oldToken)) html = html.replace(oldToken, "const token=sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';");
  html = html
    .replace(/\s*<script src="\/assets\/time-attendance-route-restore\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace('</body>', '  <script src="/assets/time-attendance-route-restore.js?v=20260808-platform-restore-1"></script>\n</body>');
  if (!html.includes(canonicalApi)) throw new Error('Time & Attendance is not connected to the canonical Railway API');
  await writeFile(timePath, html, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const employee360Path = path.join(dist, 'employee360.html');
try {
  let html = await readFile(employee360Path, 'utf8');
  html = html
    .replace(/\s*<script src="\/assets\/employee360-hash-routing\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace('</body>', '  <script src="/assets/employee360-hash-routing.js?v=20260808-platform-restore-1"></script>\n</body>');
  await writeFile(employee360Path, html, 'utf8');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

console.log('Static platform navigation normalized across public, intranet, employee and admin entry points; Time & Attendance and Employee 360 deep links are restored to their live applications.');
