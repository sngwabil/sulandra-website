import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'admin.html');
const assets = [
  ['assets/admin-adaptive-navigation.js', 'SULANDRA_ADMIN_ADAPTIVE_NAV_V1'],
  ['assets/admin-dashboard-entity-scope.js', 'SULANDRA_ADMIN_DASHBOARD_ENTITY_SCOPE_V1'],
];

for (const [relative, marker] of assets) {
  const file = path.join(root, relative);
  await stat(file);
  const source = await readFile(file, 'utf8');
  if (!source.includes(marker)) throw new Error(`Admin responsive dashboard asset missing ${marker}`);
  new Function(source);
}

let html = await readFile(adminPath, 'utf8');
const contextTag = '<script src="/assets/admin-company-context.js?v=20260809-admin-company-context-2"></script>';
if (!html.includes(contextTag)) throw new Error('Canonical Admin company-context script marker changed');

html = html
  .replace(/\s*<script src="\/assets\/admin-adaptive-navigation\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/admin-dashboard-entity-scope\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');

const injected = `${contextTag}\n  <script src="/assets/admin-dashboard-entity-scope.js?v=20260815-admin-entity-scope-1"></script>\n  <script src="/assets/admin-adaptive-navigation.js?v=20260815-admin-more-nav-1"></script>`;
html = html.replace(contextTag, injected);

for (const marker of [
  '/assets/admin-dashboard-entity-scope.js?v=20260815-admin-entity-scope-1',
  '/assets/admin-adaptive-navigation.js?v=20260815-admin-more-nav-1',
  'id="topModuleNav"',
]) {
  if (!html.includes(marker)) throw new Error(`Canonical Admin responsive publication missing ${marker}`);
}

await writeFile(adminPath, html, 'utf8');
console.log('Canonical Admin prepared with company-scoped hiring metrics and responsive More navigation.');
