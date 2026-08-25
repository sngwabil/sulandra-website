import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const runtimeSrc = '/assets/sulandra-company-chronicles.js?v=20260822-company-chronicles-1';
const adminSrc = '/assets/admin-company-chronicles.js?v=20260822-company-chronicles-1';
const settingsMarker = "      {key:'settings',label:'Settings',sub:'Company Settings',kind:'module'},";
const chroniclesMarker = "      {key:'settings',label:'Company Chronicles',sub:'Global Brand & Entity Configuration',kind:'module'},";
const shellAnchor = "      ['/assets/admin-company-settings.js?v=20260810-company-settings-backend-1','canonical-admin-company-settings'],";
const shellAddition = `${shellAnchor}\n      ['${runtimeSrc}','canonical-company-chronicles-runtime'],\n      ['${adminSrc}','canonical-admin-company-chronicles'],`;

const registrySource = await readFile(path.join(root, 'assets', 'admin-navigation-registry.js'), 'utf8');
const registryOwnedNavigation = registrySource.includes('window.SulandraAdminRouteRegistry');
if (registryOwnedNavigation && (!registrySource.includes('"id": "company-settings"') || !registrySource.includes('"label": "Company Chronicles"'))) {
  throw new Error('Canonical Admin registry is missing Company Chronicles');
}

async function walkHtml(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkHtml(target));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(target);
  }
  return files;
}

async function patchAdminContext(target) {
  let source = await readFile(target, 'utf8');
  const registryContext = source.includes('const REGISTRY = window.SulandraAdminRouteRegistry');
  if (!registryContext && source.includes(settingsMarker)) source = source.replace(settingsMarker, chroniclesMarker);
  if (!registryContext && !source.includes(chroniclesMarker)) throw new Error(`Company Chronicles navigation marker missing in ${path.relative(root, target)}`);
  if (!source.includes(adminSrc)) {
    if (!source.includes(shellAnchor)) throw new Error(`Canonical Admin Company Settings asset anchor missing in ${path.relative(root, target)}`);
    source = source.replace(shellAnchor, shellAddition);
  }
  if (!source.includes(runtimeSrc) || !source.includes(adminSrc)) throw new Error(`Company Chronicles Admin assets not registered in ${path.relative(root, target)}`);
  await writeFile(target, source, 'utf8');
}

for (const target of [path.join(root, 'assets', 'admin-company-context.js'), path.join(dist, 'assets', 'admin-company-context.js')]) {
  try { await patchAdminContext(target); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

for (const file of await walkHtml(dist)) {
  if (path.basename(file).toLowerCase() === 'admin.html') continue;
  let html = await readFile(file, 'utf8');
  if (html.includes(runtimeSrc)) continue;
  const tag = `<script defer src="${runtimeSrc}"></script>`;
  if (html.includes('</head>')) html = html.replace('</head>', `  ${tag}\n</head>`);
  else if (html.includes('</body>')) html = html.replace('</body>', `  ${tag}\n</body>`);
  else html = `${html}\n${tag}\n`;
  await writeFile(file, html, 'utf8');
}

await stat(path.join(dist, 'assets', 'sulandra-company-chronicles.js'));
await stat(path.join(dist, 'assets', 'admin-company-chronicles.js'));
const publishedContext = await readFile(path.join(dist, 'assets', 'admin-company-context.js'), 'utf8');
const publishedMarkers = [runtimeSrc, adminSrc];
if (!registryOwnedNavigation) publishedMarkers.unshift(chroniclesMarker);
for (const marker of publishedMarkers) {
  if (!publishedContext.includes(marker)) throw new Error(`Company Chronicles publication missing ${marker}`);
}
if (registryOwnedNavigation) {
  const publishedRegistry = await readFile(path.join(dist, 'assets', 'admin-navigation-registry.js'), 'utf8');
  if (!publishedRegistry.includes('"label": "Company Chronicles"')) throw new Error('Published Admin registry is missing Company Chronicles');
}
const publishedIndex = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!publishedIndex.includes(runtimeSrc)) throw new Error('Company Chronicles runtime is not published to the public website');
const publishedAdmin = await readFile(path.join(dist, 'admin.html'), 'utf8');
if (publishedAdmin.includes(runtimeSrc) || publishedAdmin.includes(adminSrc)) throw new Error('Company Chronicles must be owned by the canonical Admin bootstrap, not injected directly into admin.html');

console.log('Company Chronicles published: global white-label runtime is present on non-Admin HTML, the canonical Admin registry exposes Company Chronicles, and branding assets are loaded by the Admin shell.');

