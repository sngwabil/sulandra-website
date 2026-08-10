import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const dist = path.join(repositoryRoot, 'dist-web');

const launchpadPath = path.join(dist, 'enterprise-apps.html');
const launcherPath = path.join(dist, 'assets', 'admin-enterprise-apps-launcher.js');
const adminPath = path.join(dist, 'admin.html');

await Promise.all([stat(launchpadPath), stat(launcherPath), stat(adminPath)]);
const [launchpad, launcher, admin] = await Promise.all([
  readFile(launchpadPath, 'utf8'),
  readFile(launcherPath, 'utf8'),
  readFile(adminPath, 'utf8'),
]);

const requiredAppIds = [
  'spire-admin', 'spire-live', 'client-intake', 'med-quals', 'training',
  'notifications', 'my-work', 'scheduling', 'time', 'workforce-admin',
  'employee360', 'onboarding', 'learning', 'directory',
  'readiness', 'analytics', 'data-quality', 'revenue', 'security',
  'company-compliance', 'compliance-evidence', 'company-documents',
  'intranet-control', 'intranet', 'settings', 'admin',
  'scls-residential', 'scls-tasks', 'scls-shift',
  'hh-referrals', 'hh-soc', 'hh-operations', 'hh-visits', 'hh-sources',
  'nmt-facilities', 'nmt-invitations', 'nmt-orders', 'nmt-dispatch',
];
for (const id of requiredAppIds) {
  if (!launchpad.includes(`id:'${id}'`)) throw new Error(`Enterprise Apps regression: missing app id ${id}`);
}

for (const code of ["entity:'SCLS'", "entity:'HOME_HEALTH'", "entity:'NMT'"]) {
  if (!launchpad.includes(code)) throw new Error(`Enterprise Apps regression: missing company scope ${code}`);
}

if (!launchpad.includes('/api/platform-readiness') || !launchpad.includes('/api/work/notifications/summary') || !launchpad.includes('/api/data-quality/summary') || !launchpad.includes('/api/enterprise-analytics/overview')) {
  throw new Error('Enterprise Apps regression: live operating snapshot is incomplete');
}
if (!launchpad.includes('/assets/sulandra-entity-context.js')) throw new Error('Enterprise Apps regression: company context runtime is missing');
if (!launcher.includes("const HREF='/enterprise-apps.html'")) throw new Error('Enterprise Apps regression: Admin launcher target is missing');
if (!admin.includes('/assets/admin-enterprise-apps-launcher.js?v=20260810-enterprise-apps-1')) throw new Error('Enterprise Apps regression: published Admin does not load the launcher');

const ids = [...launchpad.matchAll(/\bid:'([^']+)'/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) throw new Error(`Enterprise Apps regression: duplicate app ids: ${duplicateIds.join(', ')}`);

const routes = [...launchpad.matchAll(/\bhref:'([^']+)'/g)].map((match) => match[1]);
const checked = new Set();
for (const route of routes) {
  if (!route.startsWith('/')) continue;
  const pathname = route.split(/[?#]/, 1)[0].replace(/^\//, '');
  if (!pathname || checked.has(pathname)) continue;
  checked.add(pathname);
  if (!pathname.endsWith('.html')) continue;
  try { await stat(path.join(dist, pathname)); }
  catch { throw new Error(`Enterprise Apps regression: target page is not published: /${pathname}`); }
}

console.log(`Enterprise Apps verified: ${requiredAppIds.length} required apps, ${checked.size} internal targets, company-aware live status, Admin launcher and published target pages.`);
