import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const portalPath = path.join(dist, 'employee-portal.html');
const siaPath = path.join(dist, 'sia.html');
const runtimePath = path.join(dist, 'assets', 'sia.js');
const navGuardPath = path.join(dist, 'assets', 'employee-role-navigation-guard.js');

for (const file of [siaPath, runtimePath, navGuardPath, portalPath]) await stat(file);

let portal = await readFile(portalPath, 'utf8');
portal = portal.replace(
  /\/assets\/employee-role-navigation-guard\.js(?:\?v=[^"']+)?/g,
  '/assets/employee-role-navigation-guard.js?v=20260826-sia-1',
);
await writeFile(portalPath, portal, 'utf8');

const [sia, runtime, navGuard] = await Promise.all([
  readFile(siaPath, 'utf8'),
  readFile(runtimePath, 'utf8'),
  readFile(navGuardPath, 'utf8'),
]);

for (const marker of ['Sulandra Intelligent Assistant', 'Sulandra Networks', '/assets/sia.js?v=20260826-sia-1', 'Create IT Ticket']) {
  if (!sia.includes(marker)) throw new Error(`SIA publication missing marker: ${marker}`);
}
for (const marker of ['/api/sia/status', '/api/sia/chat', '/api/sia/tickets', 'sulandra:employee:access-token']) {
  if (!runtime.includes(marker)) throw new Error(`SIA runtime missing marker: ${marker}`);
}
for (const marker of ['href="/sia.html">SIA</a>', 'employeeSiaCard', 'siaLauncherContract']) {
  if (!navGuard.includes(marker)) throw new Error(`Employee Portal SIA launcher missing marker: ${marker}`);
}
if (!portal.includes('/assets/employee-role-navigation-guard.js?v=20260826-sia-1')) {
  throw new Error('Employee Portal did not publish the cache-busted SIA launcher runtime.');
}

console.log('SIA workspace and Employee Portal launchers published with a fresh navigation cache key.');
