import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'admin.html');
const runtimePath = path.join(root, 'assets', 'admin-command-center-live-fix.js');
await stat(runtimePath);
const runtime = await readFile(runtimePath, 'utf8');
for (const marker of ['SULANDRA_ADMIN_COMMAND_CENTER_LIVE_FIX_V1','X-Legal-Entity-Id','admin-navigation-overflow.js?v=20260815-admin-nav-overflow-3','sulandra:company-change']) {
  if (!runtime.includes(marker)) throw new Error(`Admin command-center live fix missing ${marker}`);
}
new Function(runtime);

let html = await readFile(adminPath, 'utf8');
const contextTag = '<script src="/assets/admin-company-context.js?v=20260809-admin-company-context-2"></script>';
if (!html.includes(contextTag)) throw new Error('Canonical Admin company-context marker changed');
html = html.replace(/\s*<script src="\/assets\/admin-command-center-live-fix\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
html = html.replace(contextTag, `${contextTag}\n  <script src="/assets/admin-command-center-live-fix.js?v=20260815-command-center-live-fix-1"></script>`);
if (!html.includes('/assets/admin-command-center-live-fix.js?v=20260815-command-center-live-fix-1')) throw new Error('Canonical Admin live fix was not injected');
await writeFile(adminPath, html, 'utf8');
console.log('Canonical Admin command center live fix prepared before static publication.');
