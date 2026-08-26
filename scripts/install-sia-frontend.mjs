import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const portalPath = path.join(dist, 'employee-portal.html');
const siaPath = path.join(dist, 'sia.html');
const runtimePath = path.join(dist, 'assets', 'sia.js');
const navGuardPath = path.join(dist, 'assets', 'employee-role-navigation-guard.js');
const SIA_RENDERER_VERSION = '20260826-sia-safe-rich-1';

for (const file of [siaPath, runtimePath, navGuardPath, portalPath]) await stat(file);

let portal = await readFile(portalPath, 'utf8');
portal = portal.replace(
  /\/assets\/employee-role-navigation-guard\.js(?:\?v=[^"']+)?/g,
  '/assets/employee-role-navigation-guard.js?v=20260826-sia-1',
);
await writeFile(portalPath, portal, 'utf8');

let sia = await readFile(siaPath, 'utf8');
sia = sia.replace(
  /\/assets\/sia\.js(?:\?v=[^"']+)?/g,
  `/assets/sia.js?v=${SIA_RENDERER_VERSION}`,
);
await writeFile(siaPath, sia, 'utf8');

const [runtime, navGuard] = await Promise.all([
  readFile(runtimePath, 'utf8'),
  readFile(navGuardPath, 'utf8'),
]);

for (const marker of ['Sulandra Intelligent Assistant', 'Sulandra Networks', `/assets/sia.js?v=${SIA_RENDERER_VERSION}`, 'Create IT Ticket']) {
  if (!sia.includes(marker)) throw new Error(`SIA publication missing marker: ${marker}`);
}
for (const marker of ['/api/sia/status', '/api/sia/chat', '/api/sia/tickets', 'sulandra:employee:access-token']) {
  if (!runtime.includes(marker)) throw new Error(`SIA runtime missing marker: ${marker}`);
}
for (const marker of [
  'SulandraSiaSafeRenderer',
  "rawHtmlExecution: false",
  'document.createTextNode',
  'SAFE_LINK_PROTOCOLS',
  "new Set(['http:', 'https:', 'mailto:'])",
  'renderMarkdown',
  'appendInlineMarkdown',
  'sia-table-wrap',
  'document.createElement(`h${headingMatch[1].length}`)',
  "document.createElement('ul')",
  "document.createElement('ol')",
  "document.createElement('pre')",
  "document.createElement('code')",
  "anchor.rel = 'noopener noreferrer nofollow'",
]) {
  if (!runtime.includes(marker)) throw new Error(`SIA safe rich renderer missing marker: ${marker}`);
}
if (/bubble\.innerHTML\s*=\s*content/.test(runtime) || /insertAdjacentHTML\s*\([^,]+,\s*content/.test(runtime)) {
  throw new Error('SIA must never inject AI response content through HTML parsing APIs.');
}
if (!runtime.includes("if (role === 'assistant') bubble.appendChild(renderMarkdown(content));")) {
  throw new Error('SIA assistant messages are not routed through the safe renderer.');
}
for (const marker of ['href="/sia.html">SIA</a>', 'employeeSiaCard', 'siaLauncherContract']) {
  if (!navGuard.includes(marker)) throw new Error(`Employee Portal SIA launcher missing marker: ${marker}`);
}
if (!portal.includes('/assets/employee-role-navigation-guard.js?v=20260826-sia-1')) {
  throw new Error('Employee Portal did not publish the cache-busted SIA launcher runtime.');
}

console.log(`SIA safe Markdown renderer ${SIA_RENDERER_VERSION} published: headings, bold, lists, inline/code blocks, safe links, and tables use DOM-only rendering with no AI HTML execution.`);
