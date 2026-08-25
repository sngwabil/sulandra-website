import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const dist = path.join(repositoryRoot, 'dist-web');
const launchpadPath = path.join(dist, 'enterprise-apps.html');
const ownerPath = path.join(dist, 'admin.html');
const operationsPath = path.join(dist, 'admin-operations.html');
const routerPath = path.join(dist, 'assets', 'admin-company-context.js');
const ownerContextPath = path.join(dist, 'assets', 'admin-owner-context.js');
const operationsContextPath = path.join(dist, 'assets', 'admin-operations-context.js');
await Promise.all([stat(launchpadPath),stat(ownerPath),stat(operationsPath),stat(routerPath),stat(ownerContextPath),stat(operationsContextPath)]);
const [launchpad,owner,operations,router,ownerContext,operationsContext] = await Promise.all([
  readFile(launchpadPath,'utf8'),readFile(ownerPath,'utf8'),readFile(operationsPath,'utf8'),readFile(routerPath,'utf8'),
  readFile(ownerContextPath,'utf8'),readFile(operationsContextPath,'utf8'),
]);

// Enterprise Apps remains useful in the parent-company owner command center,
// exactly as the established UI uses it today. Company Operations must not
// use Enterprise Apps as a second navigation owner: its eight-folder registry
// is authoritative for day-to-day administration.
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
if (!owner.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2') || !operations.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2')) throw new Error('Enterprise Apps regression: Admin desktops do not load the context router');
if (!router.includes('admin-owner-context.js') || !router.includes('admin-operations-context.js')) throw new Error('Enterprise Apps regression: owner/Operations context routing is incomplete');
if (!ownerContext.includes('admin-enterprise-apps-launcher.js')) throw new Error('Enterprise Apps regression: established owner command center lost its Enterprise Apps launcher');
if (!operationsContext.includes('One authoritative Admin information-architecture registry.') || !operationsContext.includes('folders: Object.freeze([')) throw new Error('Enterprise Apps regression: Operations canonical folder registry is missing');
if (operationsContext.includes('admin-enterprise-apps-launcher.js')) throw new Error('Enterprise Apps regression: Enterprise Apps is being re-injected into company Operations navigation');
if (operations.includes('admin-enterprise-apps-launcher.js')) throw new Error('Enterprise Apps regression: Operations HTML directly loads the Enterprise Apps launcher');
if (operations.includes('admin-role-workspaces-link.js')) throw new Error('Enterprise Apps regression: Operations HTML directly loads a retired Role Workspaces navigation injector');

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
console.log(`Enterprise Apps verified: ${requiredAppIds.length} apps remain available to the parent owner command center while the company Operations desktop keeps one authoritative eight-folder navigation system.`);
