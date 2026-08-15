import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'admin.html');
const overflowPath = path.join(root, 'assets', 'admin-navigation-overflow.js');
const scopePath = path.join(root, 'assets', 'admin-dashboard-entity-scope.js');

const [overflow, scope] = await Promise.all([
  readFile(overflowPath, 'utf8'),
  readFile(scopePath, 'utf8'),
]);
await Promise.all([stat(overflowPath), stat(scopePath)]);

for (const [source, markers, label] of [
  [overflow, ['adminTopNavigationMore', 'adminTopNavigationOverflowMenu', 'ResizeObserver'], 'Admin navigation overflow'],
  [scope, ['SULANDRA_ADMIN_DASHBOARD_ENTITY_SCOPE_V1', 'X-Legal-Entity-Id', 'sulandra:company-change'], 'Admin hiring entity scope'],
]) {
  for (const marker of markers) if (!source.includes(marker)) throw new Error(`${label} missing ${marker}`);
  new Function(source);
}

let html = await readFile(adminPath, 'utf8');
const contextTag = '<script src="/assets/admin-company-context.js?v=20260809-admin-company-context-2"></script>';
if (!html.includes(contextTag)) throw new Error('Canonical Admin company context tag changed');

html = html
  .replace(/\s*<script src="\/assets\/admin-dashboard-entity-scope\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/admin-navigation-overflow\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');

const injection = `${contextTag}\n  <script src="/assets/admin-dashboard-entity-scope.js?v=20260815-admin-hiring-scope-1"></script>\n  <script src="/assets/admin-navigation-overflow.js?v=20260815-admin-overflow-1"></script>`;
html = html.replace(contextTag, injection);

for (const marker of [
  '/assets/admin-dashboard-entity-scope.js?v=20260815-admin-hiring-scope-1',
  '/assets/admin-navigation-overflow.js?v=20260815-admin-overflow-1',
  'id="topModuleNav"',
]) if (!html.includes(marker)) throw new Error(`Canonical Admin publication missing ${marker}`);

await writeFile(adminPath, html, 'utf8');
console.log('Canonical Admin prepared with responsive More navigation and company-scoped hiring metrics.');
