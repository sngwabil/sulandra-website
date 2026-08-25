import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const runtimeSrc = '/assets/sulandra-company-chronicles.js?v=20260825-company-chronicles-root-safe-1';
const adminSrc = '/assets/admin-company-chronicles.js?v=20260822-company-chronicles-1';
const canonicalSettingsMarker = "{key:'settings',label:'Company Profile & Settings',sub:'Identity, address and preferences',kind:'module'}";
const shellAnchor = "      ['/assets/admin-company-settings.js?v=20260810-company-settings-backend-1','canonical-admin-company-settings'],";
const shellAddition = `${shellAnchor}\n      ['${runtimeSrc}','canonical-company-chronicles-runtime'],\n      ['${adminSrc}','canonical-admin-company-chronicles'],`;

async function walkHtml(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkHtml(target));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(target);
  }
  return files;
}

async function patchOperationsContext(target) {
  let source = await readFile(target, 'utf8');
  if (!source.includes(canonicalSettingsMarker)) throw new Error(`Canonical Company Profile & Settings registry marker missing in ${path.relative(root, target)}`);

  // Normalize any previously published Company Chronicles entries before adding
  // the current cache-busted runtime. This keeps repeated local/CI builds
  // idempotent and guarantees Operations cannot retain an older unsafe URL.
  source = source
    .replace(/^\s*\['\/assets\/sulandra-company-chronicles\.js\?v=[^']+','canonical-company-chronicles-runtime'\],\s*$/gm, '')
    .replace(/^\s*\['\/assets\/admin-company-chronicles\.js\?v=[^']+','canonical-admin-company-chronicles'\],\s*$/gm, '');
  if (!source.includes(shellAnchor)) throw new Error(`Operations Company Settings asset anchor missing in ${path.relative(root, target)}`);
  source = source.replace(shellAnchor, shellAddition);
  if (!source.includes(runtimeSrc) || !source.includes(adminSrc)) throw new Error(`Company Chronicles assets not registered in ${path.relative(root, target)}`);
  await writeFile(target, source, 'utf8');
}

for (const target of [path.join(root, 'assets', 'admin-operations-context.js'), path.join(dist, 'assets', 'admin-operations-context.js')]) {
  try { await patchOperationsContext(target); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

for (const file of await walkHtml(dist)) {
  const name = path.basename(file).toLowerCase();
  if (name === 'admin.html' || name === 'admin-operations.html') continue;
  let html = await readFile(file, 'utf8');
  html = html.replace(/\s*<script defer src="\/assets\/sulandra-company-chronicles\.js\?v=[^"]+"><\/script>\s*/g, '\n');
  const tag = `<script defer src="${runtimeSrc}"></script>`;
  if (html.includes('</head>')) html = html.replace('</head>', `  ${tag}\n</head>`);
  else if (html.includes('</body>')) html = html.replace('</body>', `  ${tag}\n</body>`);
  else html = `${html}\n${tag}\n`;
  await writeFile(file, html, 'utf8');
}

await stat(path.join(dist, 'assets', 'sulandra-company-chronicles.js'));
await stat(path.join(dist, 'assets', 'admin-company-chronicles.js'));
const publishedRuntime = await readFile(path.join(dist, 'assets', 'sulandra-company-chronicles.js'), 'utf8');
if (!publishedRuntime.includes('node === document.documentElement || node === document.body')) {
  throw new Error('Company Chronicles runtime can target the document root/body and destroy the application DOM');
}
const publishedOperations = await readFile(path.join(dist, 'assets', 'admin-operations-context.js'), 'utf8');
for (const marker of [canonicalSettingsMarker, runtimeSrc, adminSrc]) {
  if (!publishedOperations.includes(marker)) throw new Error(`Company Chronicles publication missing ${marker}`);
}
if (publishedOperations.includes("label:'Company Chronicles'")) throw new Error('Company Chronicles must not duplicate Company Profile & Settings');
const publishedIndex = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!publishedIndex.includes(runtimeSrc)) throw new Error('Company Chronicles runtime is not published to the public website');
const publishedOwner = await readFile(path.join(dist, 'admin.html'), 'utf8');
const publishedOperationsPage = await readFile(path.join(dist, 'admin-operations.html'), 'utf8');
if (publishedOwner.includes(runtimeSrc) || publishedOwner.includes(adminSrc) || publishedOperationsPage.includes(adminSrc)) throw new Error('Company Chronicles must be owned by the Operations bootstrap, not injected directly into Admin HTML');

console.log('Company Chronicles published with root-safe company-name substitution: Brand & Global Identity stays inside Operations > Company Profile & Settings while the parent owner command center remains unchanged.');
