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

for (const relative of [
  'admin.html','admin-operations.html',
  'assets/admin-company-context.js','assets/admin-owner-context.js','assets/admin-operations-context.js',
  'assets/admin-owner-console.js','assets/admin-operations-shell.js','assets/admin-operations-desktop.js',
]) {
  await stat(path.join(root, relative));
  await stat(path.join(dist, relative));
}

const [router, ownerContext, operationsContext, ownerConsole, operationsShell, operationsDesktop] = await Promise.all([
  readFile(path.join(dist, 'assets/admin-company-context.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-owner-context.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-operations-context.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-owner-console.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-operations-shell.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-operations-desktop.js'), 'utf8'),
]);

for (const key of folderKeys) {
  if (!operationsContext.includes(`key:'${key}'`)) throw new Error(`Operations desktop registry missing ${key}`);
}
if (!router.includes('admin-owner-context.js') || !router.includes('admin-operations-context.js')) throw new Error('Admin context router does not separate owner and Operations desktops');
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
if (router.includes(retiredRuntime) || ownerContext.includes(retiredRuntime) || operationsContext.includes(retiredRuntime)) throw new Error('Retired five-folder Admin global UI runtime is still injected');

const sourceAdmin = await readFile(path.join(root, 'admin.html'), 'utf8');
const publishedAdmin = await readFile(path.join(dist, 'admin.html'), 'utf8');
if (sourceAdmin !== publishedAdmin) throw new Error('Owner admin.html must publish unchanged from canonical source');

console.log('Sulandra Admin split verified: admin.html remains the owner command center, admin-operations.html owns the eight-folder company Operations desktop, the left folder rail is visible and collapsible with a persistent edge toggle, duplicate timed dashboard renders are disabled, and the retired five-folder/right-drawer injector is disabled.');