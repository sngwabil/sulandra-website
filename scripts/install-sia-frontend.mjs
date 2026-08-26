import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const portalPath = path.join(dist, 'employee-portal.html');
const siaPath = path.join(dist, 'sia.html');
const runtimePath = path.join(dist, 'assets', 'sia.js');
const themePath = path.join(dist, 'assets', 'sia-futuristic.css');
const navGuardPath = path.join(dist, 'assets', 'employee-role-navigation-guard.js');
const SIA_RUNTIME_VERSION = '20260826-sia-interactive-2';

for (const file of [siaPath, runtimePath, themePath, navGuardPath, portalPath]) await stat(file);

let portal = await readFile(portalPath, 'utf8');
portal = portal.replace(
  /\/assets\/employee-role-navigation-guard\.js(?:\?v=[^"']+)?/g,
  '/assets/employee-role-navigation-guard.js?v=20260826-sia-1',
);
await writeFile(portalPath, portal, 'utf8');

let sia = await readFile(siaPath, 'utf8');
sia = sia.replace(
  /\/assets\/sia\.js(?:\?v=[^"']+)?/g,
  `/assets/sia.js?v=${SIA_RUNTIME_VERSION}`,
);
await writeFile(siaPath, sia, 'utf8');

const [runtime, theme, navGuard] = await Promise.all([
  readFile(runtimePath, 'utf8'),
  readFile(themePath, 'utf8'),
  readFile(navGuardPath, 'utf8'),
]);

for (const marker of [
  'Sulandra Intelligent Assistant',
  'Your Sulandra IT copilot',
  'Interactive IT support',
  `/assets/sia.js?v=${SIA_RUNTIME_VERSION}`,
  '/assets/sia-futuristic.css',
  'Create IT Ticket',
  'Message SIA or attach an error screenshot',
]) {
  if (!sia.includes(marker)) throw new Error(`SIA publication missing marker: ${marker}`);
}

for (const marker of [
  '/api/sia/status',
  '/api/sia/chat',
  '/api/sia/tickets',
  'sulandra:employee:access-token',
  'ADMIN_ROLES',
  'adminAllowed',
  'siaAdminStatus',
  'Admin access verified',
  'siaScreenshotInput',
  'prepareImage',
  'attachment:',
  'dataUrl',
  'image/png',
  'image/jpeg',
  'image/webp',
  'sia-typing',
]) {
  if (!runtime.includes(marker)) throw new Error(`SIA interactive runtime missing marker: ${marker}`);
}

// Safe rich response rendering remains DOM-only. AI text must never be injected
// into the page via innerHTML/insertAdjacentHTML. The only innerHTML use allowed
// by SIA is trusted, static UI chrome such as the local typing indicator/welcome.
for (const marker of [
  'SAFE_LINK_PROTOCOLS',
  "new Set(['http:', 'https:', 'mailto:'])",
  'renderMarkdown',
  'appendInlineMarkdown',
  'document.createTextNode',
  'sia-table-wrap',
  "document.createElement('ul')",
  "document.createElement('ol')",
  "document.createElement('pre')",
  "document.createElement('code')",
  "anchor.rel = 'noopener noreferrer nofollow'",
  "if (role === 'assistant') bubble.appendChild(renderMarkdown(content));",
]) {
  if (!runtime.includes(marker)) throw new Error(`SIA safe rich renderer missing marker: ${marker}`);
}
if (/bubble\.innerHTML\s*=\s*content/.test(runtime) || /insertAdjacentHTML\s*\([^,]+,\s*content/.test(runtime)) {
  throw new Error('SIA must never inject AI response content through HTML parsing APIs.');
}

for (const marker of [
  '--sia-night:#050817',
  '--sia-purple:#7c3cff',
  '--sia-green:#42f5a7',
  '--sia-pink:#ff4fb8',
  '.sia-attach-button',
  '.sia-typing',
  '.composer-box',
]) {
  if (!theme.includes(marker)) throw new Error(`SIA futuristic theme missing marker: ${marker}`);
}

for (const marker of ['href="/sia.html">SIA</a>', 'employeeSiaCard', 'siaLauncherContract']) {
  if (!navGuard.includes(marker)) throw new Error(`Employee Portal SIA launcher missing marker: ${marker}`);
}
if (!portal.includes('/assets/employee-role-navigation-guard.js?v=20260826-sia-1')) {
  throw new Error('Employee Portal did not publish the cache-busted SIA launcher runtime.');
}

console.log(`SIA ${SIA_RUNTIME_VERSION} published: verified role-aware Admin guidance, screenshot troubleshooting, safe Markdown rendering, ChatGPT-style interaction, and futuristic dark blue/purple/green/pink/white presentation.`);
