import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const retiredRuntime = '/assets/admin-global-ui-restructure.js?v=20260822-global-admin-ui-1';
const folderKeys = [
  'company-management','people-hr','clients-spire','service-operations',
  'billing-revenue','compliance-quality','communications-learning','system-administration',
];
const operationsLandingFiles = [
  'company-documents.html','employee360.html','spire-admin.html','scls-residential.html',
  'home-health-referral-inbox.html','nmt-dispatch.html','revenue-cycle.html','company-compliance.html',
  'intranet-control.html','admin-users.html','admin-operations.html',
];

async function requirePublished(relative) {
  await stat(path.join(root, relative));
  await stat(path.join(dist, relative));
}

for (const relative of [
  'admin.html','admin-login.html','admin-operations.html',
  'assets/admin-company-context.js','assets/admin-owner-context.js','assets/admin-operations-context.js',
  'assets/admin-owner-console.js','assets/admin-operations-shell.js','assets/admin-operations-desktop.js',
  ...operationsLandingFiles,
]) await requirePublished(relative);

const [router, ownerContext, operationsContext, ownerConsole, operationsShell, operationsDesktop, adminLogin] = await Promise.all([
  readFile(path.join(dist, 'assets/admin-company-context.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-owner-context.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-operations-context.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-owner-console.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-operations-shell.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-operations-desktop.js'), 'utf8'),
  readFile(path.join(dist, 'admin-login.html'), 'utf8'),
]);

const registryRouteFiles = [...new Set(
  [...operationsContext.matchAll(/href:'(\/[^']+\.html(?:[?#][^']*)?)'/g)]
    .map((match) => match[1].split(/[?#]/, 1)[0].replace(/^\//, ''))
    .filter(Boolean),
)].sort();
if (!registryRouteFiles.length) throw new Error('Operations registry route audit found no HTML destinations');
for (const relative of registryRouteFiles) await requirePublished(relative);

for (const key of folderKeys) {
  if (!operationsContext.includes(`key:'${key}'`)) throw new Error(`Operations desktop registry missing ${key}`);
}
if (!router.includes('admin-owner-context.js') || !router.includes('admin-operations-context.js')) throw new Error('Admin context router does not separate owner and Operations desktops');
if (!router.includes('company-operations-ui-5')) throw new Error('Operations routing/session repair is not cache-busted in the Admin context router');
if (!ownerConsole.includes('/api/owner/authority') || !ownerConsole.includes('ownerOperationsLauncher')) throw new Error('Owner console boundary/Operations launcher is incomplete');
// The route guard is expressed as a regular expression in the runtime, so test
// its stable path token instead of requiring the unescaped literal filename.
if (!operationsDesktop.includes('admin-operations') || !operationsDesktop.includes('allowedOperatingEntities')) throw new Error('Company Operations desktop boundary is incomplete');
if (!operationsDesktop.includes("classList.remove('taskbar-open', 'taskbar-closed')")) throw new Error('Company Operations does not clear legacy taskbar state');
if (!operationsDesktop.includes('.sidebar{transform:none!important;opacity:1!important;pointer-events:auto!important;visibility:visible!important}')) throw new Error('Company Operations sidebar can remain translated off-screen while its grid column is reserved');
if (operationsDesktop.includes('window.setTimeout(() => { constrainSelector(context); renderDashboard')) throw new Error('Company Operations still performs delayed duplicate dashboard renders');
if (!operationsShell.includes('operationsSidebarToggle') || !operationsShell.includes('OPERATIONS_SIDEBAR_KEY')) throw new Error('Company Operations sidebar toggle is not published');
if (!operationsShell.includes('body.operations-sidebar-collapsed .grid{grid-template-columns:minmax(0,1fr)!important;gap:0!important}')) throw new Error('Collapsed Operations sidebar does not return its grid width to the workspace');
if (!operationsShell.includes("localStorage.setItem(OPERATIONS_SIDEBAR_KEY, String(open))")) throw new Error('Operations sidebar open/closed preference is not persisted');
if (!operationsShell.includes("setAttribute('aria-expanded', String(open))")) throw new Error('Operations sidebar toggle does not publish accessible expanded state');
if (!operationsShell.includes('FOLDER_LANDINGS') || !operationsShell.includes('serviceOperationsLanding')) throw new Error('Operations folder cards do not resolve to real company-aware HTML destinations');
if (!operationsShell.includes('folderIcon') || !operationsShell.includes('<svg ${common}>')) throw new Error('Operations folder cards still lack real SVG icons');
if (!operationsShell.includes("window.open('about:blank', '_blank')") || !operationsShell.includes('child.sessionStorage.setItem(key, value)') || !operationsShell.includes('child.location.replace(destination.href)')) throw new Error('Operations new-tab navigation does not securely hand off the tab-only authenticated session before routing');
if (operationsShell.includes("window.open(href, '_blank', 'noopener,noreferrer')")) throw new Error('Operations still launches same-origin tools without tab-only session handoff');
if (!operationsShell.includes('NEW_TAB_SELECTOR') || !operationsShell.includes('.ops-folder-card') || !operationsShell.includes('.ops-quick-link')) throw new Error('Operations new-tab guard does not cover every visible workspace launcher');
if (!operationsShell.includes('upgradeModuleButtons') || !operationsShell.includes("removeAttribute('data-sulandra-route')")) throw new Error('Legacy same-tab module/route controls are not normalized to new-tab navigation');
if (!operationsShell.includes('.ops-folder-card h3{font-size:17px!important') || !operationsShell.includes('#sideModuleNav .admin-folder-link{font-size:13.5px!important')) throw new Error('Operations typography upgrade is missing or inconsistent');
if (!operationsShell.includes('data.opsFolderRoute') && !operationsShell.includes('dataset.opsFolderRoute')) throw new Error('Operations folder cards are not upgraded into routed workspace links');
if (!operationsShell.includes('installIndependentWorkspaceScroll') || !operationsShell.includes('operations-independent-scroll') || !operationsShell.includes("overflow-y:auto!important") || !operationsShell.includes("grid.style.height = `${height}px`")) throw new Error('Operations workspace and left rail are not independently scrollable on desktop');
if (router.includes(retiredRuntime) || ownerContext.includes(retiredRuntime) || operationsContext.includes(retiredRuntime)) throw new Error('Retired five-folder Admin global UI runtime is still injected');

if (!adminLogin.includes('/employee-login.html?returnTo=') || !adminLogin.includes("target.origin === location.origin")) throw new Error('admin-login.html does not safely redirect legacy Admin login requests to unified authentication');

const sourceAdmin = await readFile(path.join(root, 'admin.html'), 'utf8');
const publishedAdmin = await readFile(path.join(dist, 'admin.html'), 'utf8');
if (sourceAdmin !== publishedAdmin) throw new Error('Owner admin.html must publish unchanged from canonical source');

console.log(`Sulandra Admin split verified: admin.html remains the owner command center; admin-operations.html owns the eight-folder company Operations desktop; all ${registryRouteFiles.length} registered HTML destinations plus ${operationsLandingFiles.length} dashboard workspace landings exist in source and published output; same-origin new tabs inherit the secure tab-only session before navigation; legacy /admin-login.html routes to unified authentication; the left folder rail and right workspace scroll independently; and the Operations cards retain real SVG icons with larger consistent typography.`);