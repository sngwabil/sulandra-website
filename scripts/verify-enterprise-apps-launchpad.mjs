import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const dist = path.join(repositoryRoot, 'dist-web');
const launchpadPath = path.join(dist, 'enterprise-apps.html');
const adminPath = path.join(dist, 'admin.html');
const contextPath = path.join(dist, 'assets', 'admin-company-context.js');
await Promise.all([stat(launchpadPath),stat(adminPath),stat(contextPath)]);
const [launchpad,admin,context] = await Promise.all([
  readFile(launchpadPath,'utf8'),readFile(adminPath,'utf8'),readFile(contextPath,'utf8'),
]);

// Enterprise Apps remains a useful standalone catalog. It is no longer an
// Admin navigation owner: the canonical eight-folder registry owns Admin IA.
const requiredAppIds = [
  'spire-admin','spire-live','client-intake','med-quals','training','notifications','my-work','scheduling','time','workforce-admin',
  'employee360','onboarding','learning','directory','readiness','analytics','data-quality','revenue','security','company-compliance',
  'compliance-evidence','company-documents','intranet-control','intranet','settings','admin','scls-residential','scls-tasks','scls-shift',
  'hh-referrals','hh-soc','hh-operations','hh-visits','hh-sources','nmt-facilities','nmt-invitations','nmt-orders','nmt-dispatch',
];
for (const id of requiredAppIds) if (!launchpad.includes(`id:'${id}'`)) throw new Error(`Enterprise Apps regression: missing app id ${id}`);
for (const code of ["entity:'SCLS'","entity:'HOME_HEALTH'","entity:'NMT'"]) if (!launchpad.includes(code)) throw new Error(`Enterprise Apps regression: missing company scope ${code}`);
if (!launchpad.includes('/api/platform-readiness') || !launchpad.includes('/api/work/notifications/summary') || !launchpad.includes('/api/data-quality/summary') || !launchpad.includes('/api/enterprise-analytics/overview')) throw new Error('Enterprise Apps regression: live operating snapshot is incomplete');
if (!launchpad.includes('/assets/sulandra-entity-context.js')) throw new Error('Enterprise Apps regression: company context runtime is missing');
if (!admin.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2')) throw new Error('Enterprise Apps regression: Admin does not load the canonical bootstrap');
if (!context.includes('One authoritative Admin information-architecture registry.')) throw new Error('Enterprise Apps regression: canonical Admin registry marker is missing');
if (!context.includes('folders: Object.freeze([')) throw new Error('Enterprise Apps regression: canonical Admin folder registry is missing');
if (context.includes('admin-enterprise-apps-launcher.js')) throw new Error('Enterprise Apps regression: standalone catalog is being re-injected into canonical Admin navigation');
if (admin.includes('admin-enterprise-apps-launcher.js')) throw new Error('Enterprise Apps regression: Admin directly loads the retired Enterprise Apps launcher');
if (admin.includes('admin-role-workspaces-link.js')) throw new Error('Enterprise Apps regression: Admin directly loads a retired Role Workspaces navigation injector');

const ids = [...launchpad.matchAll(/\bid:'([^']+)'/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id,index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) throw new Error(`Enterprise Apps regression: duplicate app ids: ${duplicateIds.join(', ')}`);
const routes = [...launchpad.matchAll(/\bhref:'([^']+)'/g)].map(match => match[1]);
const checked = new Set();
for (const route of routes) {
  if (!route.startsWith('/')) continue;
  const pathname = route.split(/[?#]/,1)[0].replace(/^\//,'');
  if (!pathname || checked.has(pathname)) continue;
  checked.add(pathname);
  if (!pathname.endsWith('.html')) continue;
  try { await stat(path.join(dist,pathname)); }
  catch { throw new Error(`Enterprise Apps regression: target page is not published: /${pathname}`); }
}
console.log(`Enterprise Apps verified as a standalone catalog: ${requiredAppIds.length} required apps, ${checked.size} internal targets, company-aware live status, and no runtime ownership of canonical Admin navigation.`);
