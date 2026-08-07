import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');

// Install the shared authenticated-session cache after dist-web exists and before
// final route verification. This gives every internal module the same login
// session without an extra /api/session round trip on each page transition.
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
  ['/scheduling', '/time-attendance.html'],
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

console.log('Static platform navigation normalized across public, intranet, employee, and admin entry points.');
