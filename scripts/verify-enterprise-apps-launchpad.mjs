import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repositoryRoot, 'dist-web');
const paths = {
  launchpad:path.join(dist,'enterprise-apps.html'),
  launcher:path.join(dist,'assets','admin-enterprise-apps-launcher.js'),
  registry:path.join(dist,'assets','admin-navigation-registry.js'),
  admin:path.join(dist,'admin.html'),
  context:path.join(dist,'assets','admin-company-context.js'),
};
await Promise.all(Object.values(paths).map(entry => stat(entry)));
const [launchpad,launcher,registrySource,admin,context] = await Promise.all([
  readFile(paths.launchpad,'utf8'),readFile(paths.launcher,'utf8'),readFile(paths.registry,'utf8'),
  readFile(paths.admin,'utf8'),readFile(paths.context,'utf8'),
]);

const sandbox = { window:{},document:{documentElement:{dataset:{}}},console };
vm.runInNewContext(registrySource,sandbox,{filename:'admin-navigation-registry.js'});
const registry = sandbox.window.SulandraAdminRouteRegistry;
if (!registry) throw new Error('Enterprise Apps regression: canonical Admin registry cannot be evaluated');
const apps = Array.from(registry.enterpriseApps || []);
const items = Array.from(registry.allItems || []);
if (apps.length !== items.length || apps.length < 50) throw new Error(`Enterprise Apps regression: expected the complete Admin catalog, found ${apps.length} apps for ${items.length} tools`);

const requiredAppIds = [
  'service-homes','company-settings','company-documents','onboarding','employees','employee-directory',
  'scheduling','time','payroll','benefits','client-intake','spire-admin','spire-live','med-quals',
  'admission-history','incident-compliance','service-requests','scls-residential','hh-referrals','hh-soc',
  'hh-visits','hh-sources','nmt-facilities','nmt-invitations','nmt-orders','nmt-dispatch','revenue',
  'claim-exchange','dodd-billing','readiness','analytics','data-quality','security','ohio-screening',
  'evv-operations','intranet-control','learning','enterprise-apps','admin-users','role-workspaces',
];
const ids = apps.map(app => app.id);
for (const id of requiredAppIds) if (!ids.includes(id)) throw new Error(`Enterprise Apps regression: missing registry app id ${id}`);
for (const code of ['SCLS','HOME_HEALTH','NMT']) if (!apps.some(app => app.entity === code)) throw new Error(`Enterprise Apps regression: missing company scope ${code}`);
const duplicateIds = [...new Set(ids.filter((id,index) => ids.indexOf(id) !== index))];
if (duplicateIds.length) throw new Error(`Enterprise Apps regression: duplicate app ids: ${duplicateIds.join(', ')}`);

if (!launchpad.includes('window.SulandraAdminRouteRegistry?.enterpriseApps')) throw new Error('Enterprise Apps regression: launchpad does not consume the canonical registry');
if (launchpad.includes('const apps=[')) throw new Error('Enterprise Apps regression: launchpad still hard-codes a duplicate application catalog');
if (!launchpad.includes('/api/platform-readiness') || !launchpad.includes('/api/work/notifications/summary') || !launchpad.includes('/api/data-quality/summary') || !launchpad.includes('/api/enterprise-analytics/overview')) throw new Error('Enterprise Apps regression: live operating snapshot is incomplete');
if (!launchpad.includes('/assets/admin-navigation-registry.js?v=20260825-admin-ia-1')) throw new Error('Enterprise Apps regression: canonical route registry runtime is missing');
if (!launchpad.includes('/assets/sulandra-entity-context.js')) throw new Error('Enterprise Apps regression: company context runtime is missing');
if (!launcher.includes("const HREF='/enterprise-apps.html'")) throw new Error('Enterprise Apps regression: Admin compatibility launcher target is missing');
if (!launcher.includes("window.SulandraAdminRouteRegistry?.version === '2.0.0'")) throw new Error('Enterprise Apps regression: compatibility launcher is not gated behind IA v2');
if (!admin.includes('/assets/admin-navigation-registry.js?v=20260825-admin-ia-1')) throw new Error('Enterprise Apps regression: Admin does not load the canonical registry');
if (!admin.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2')) throw new Error('Enterprise Apps regression: Admin does not load the canonical bootstrap');
if (!context.includes("'/assets/admin-enterprise-apps-launcher.js?v=20260810-enterprise-apps-1'")) throw new Error('Enterprise Apps regression: canonical Admin bootstrap does not load the compatibility launcher');
if (admin.includes('/assets/admin-enterprise-apps-launcher.js?v=20260810-enterprise-apps-1')) throw new Error('Enterprise Apps regression: compatibility launcher is duplicated by direct post-build Admin injection');

const checked = new Set();
for (const app of apps) {
  const route = String(app.href || '');
  if (!route.startsWith('/')) continue;
  const pathname = route.split(/[?#]/,1)[0].replace(/^\//,'');
  if (!pathname || checked.has(pathname)) continue;
  checked.add(pathname);
  if (!pathname.endsWith('.html')) continue;
  try { await stat(path.join(dist,pathname)); }
  catch { throw new Error(`Enterprise Apps regression: registry target page is not published: /${pathname}`); }
}
console.log(`Enterprise Apps verified: ${apps.length} registry-owned apps, ${checked.size} internal targets, company-aware live status, compatibility launcher gating and published target pages.`);
