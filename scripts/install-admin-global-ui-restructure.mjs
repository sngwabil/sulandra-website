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
  'assets/admin-owner-console.js','assets/admin-operations-desktop.js',
]) {
  await stat(path.join(root, relative));
  await stat(path.join(dist, relative));
}

const [router, ownerContext, operationsContext, ownerConsole, operationsDesktop] = await Promise.all([
  readFile(path.join(dist, 'assets/admin-company-context.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-owner-context.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-operations-context.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-owner-console.js'), 'utf8'),
  readFile(path.join(dist, 'assets/admin-operations-desktop.js'), 'utf8'),
]);

for (const key of folderKeys) {
  if (!operationsContext.includes(`key:'${key}'`)) throw new Error(`Operations desktop registry missing ${key}`);
}
if (!router.includes('admin-owner-context.js') || !router.includes('admin-operations-context.js')) throw new Error('Admin context router does not separate owner and Operations desktops');
if (!ownerConsole.includes('/api/owner/authority') || !ownerConsole.includes('ownerOperationsLauncher')) throw new Error('Owner console boundary/Operations launcher is incomplete');
if (!operationsDesktop.includes('admin-operations.html') || !operationsDesktop.includes('allowedOperatingEntities')) throw new Error('Company Operations desktop boundary is incomplete');
if (router.includes(retiredRuntime) || ownerContext.includes(retiredRuntime) || operationsContext.includes(retiredRuntime)) throw new Error('Retired five-folder Admin global UI runtime is still injected');

const sourceAdmin = await readFile(path.join(root, 'admin.html'), 'utf8');
const publishedAdmin = await readFile(path.join(dist, 'admin.html'), 'utf8');
if (sourceAdmin !== publishedAdmin) throw new Error('Owner admin.html must publish unchanged from canonical source');

console.log('Sulandra Admin split verified: admin.html remains the owner command center, admin-operations.html owns the eight-folder company Operations desktop, and the retired five-folder/right-drawer injector is disabled.');
