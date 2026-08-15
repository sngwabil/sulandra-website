import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'admin.html');
const overflowPath = path.join(root, 'assets', 'admin-navigation-overflow.js');
const scopePath = path.join(root, 'assets', 'admin-dashboard-entity-scope.js');

const [overflow, scope] = await Promise.all([readFile(overflowPath, 'utf8'), readFile(scopePath, 'utf8')]);
await Promise.all([stat(overflowPath), stat(scopePath)]);
for (const marker of ['adminTopNavigationMore','adminTopNavigationOverflowMenu','ResizeObserver']) if (!overflow.includes(marker)) throw new Error(`Admin overflow runtime missing ${marker}`);
for (const marker of ['SULANDRA_ADMIN_DASHBOARD_ENTITY_SCOPE_V1','X-Legal-Entity-Id','sulandra:company-change']) if (!scope.includes(marker)) throw new Error(`Admin hiring-scope runtime missing ${marker}`);
new Function(overflow);
new Function(scope);

let html = await readFile(adminPath, 'utf8');
const contextTag = '<script src="/assets/admin-company-context.js?v=20260809-admin-company-context-2"></script>';
if (!html.includes(contextTag)) throw new Error('Canonical Admin company context marker changed');
html = html
  .replace(/\s*<script src="\/assets\/admin-dashboard-entity-scope\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/admin-navigation-overflow\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
html = html.replace(contextTag, `${contextTag}\n  <script src="/assets/admin-dashboard-entity-scope.js?v=20260815-admin-hiring-scope-2"></script>\n  <script src="/assets/admin-navigation-overflow.js?v=20260815-admin-nav-overflow-2"></script>`);
for (const marker of ['/assets/admin-dashboard-entity-scope.js?v=20260815-admin-hiring-scope-2','/assets/admin-navigation-overflow.js?v=20260815-admin-nav-overflow-2']) if (!html.includes(marker)) throw new Error(`Canonical Admin publication missing ${marker}`);
await writeFile(adminPath, html, 'utf8');
console.log('Canonical Admin prepared with cache-busted mouse overflow navigation and company-scoped hiring metrics.');
