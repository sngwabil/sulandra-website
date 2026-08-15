import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'admin.html');
const runtimePath = path.join(root, 'assets', 'admin-command-center-live-fix.js');
const securityPath = path.join(root, 'assets', 'admin-session-security.js');
await Promise.all([stat(runtimePath), stat(securityPath)]);
const runtime = await readFile(runtimePath, 'utf8');
const securityRuntime = await readFile(securityPath, 'utf8');
for (const marker of ['SULANDRA_ADMIN_COMMAND_CENTER_LIVE_FIX_V1','X-Legal-Entity-Id','admin-navigation-overflow.js?v=20260815-admin-nav-overflow-3','sulandra:company-change']) {
  if (!runtime.includes(marker)) throw new Error(`Admin command-center live fix missing ${marker}`);
}
for (const marker of ['IDLE_TIMEOUT_MS = 30 * 60 * 1000','/api/auth/privileged/reauthenticate','STEP_UP_WINDOW_MS = 5 * 60 * 1000','persistentAuthDisabled: true']) {
  if (!securityRuntime.includes(marker)) throw new Error(`Privileged Admin security runtime missing ${marker}`);
}
new Function(runtime);
new Function(securityRuntime);

let html = await readFile(adminPath, 'utf8');
const contextTag = '<script src="/assets/admin-company-context.js?v=20260809-admin-company-context-2"></script>';
const securityTag = '<script src="/assets/admin-session-security.js?v=20260815-privileged-session-1" data-sulandra-admin-session-security="true"></script>';
if (!html.includes(contextTag)) throw new Error('Canonical Admin company-context marker changed');
html = html.replace(/\s*<script[^>]+src="\/assets\/admin-session-security\.js(?:\?v=[^"']+)?"[^>]*><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/admin-command-center-live-fix\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
html = html.replace(contextTag, `${securityTag}\n  ${contextTag}\n  <script src="/assets/admin-command-center-live-fix.js?v=20260815-command-center-live-fix-1"></script>`);
if (!html.includes('/assets/admin-session-security.js?v=20260815-privileged-session-1')) throw new Error('Privileged Admin session security was not injected');
if (!html.includes('/assets/admin-command-center-live-fix.js?v=20260815-command-center-live-fix-1')) throw new Error('Canonical Admin live fix was not injected');
await writeFile(adminPath, html, 'utf8');
console.log('Privileged Admin session security and canonical command-center live fix prepared before static publication.');