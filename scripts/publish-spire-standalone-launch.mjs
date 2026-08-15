import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const ownerProfileSyncPath = path.join(dist, 'assets', 'spire-owner-clinical-profile.js');
const ownerProfileSyncUrl = '/assets/spire-owner-clinical-profile.js?v=20260814-owner-clinical-profile-1';
const contract = 'SPIRE_STANDALONE_PUBLIC_LAUNCH_V1';

let master = await readFile(masterPath, 'utf8');
for (const marker of [
  'S.P.I.R.E. STANDALONE MASTER',
  'function requireSession()',
  '/employee-login.html?return=',
  'sulandra-entity-context.js',
]) {
  if (!master.includes(marker)) throw new Error(`Standalone SPIRE launch aborted: master chart missing ${marker}`);
}

await stat(ownerProfileSyncPath);
const ownerProfileSync = await readFile(ownerProfileSyncPath, 'utf8');
for (const marker of [
  'SPIRE_OWNER_CLINICAL_PROFILE_SYNC_V1',
  '/api/owner/profile',
  'professionalTitle',
  'securityRole',
]) {
  if (!ownerProfileSync.includes(marker)) throw new Error(`SPIRE owner clinical profile runtime missing ${marker}`);
}
try { new Function(ownerProfileSync); }
catch (error) { throw new Error(`SPIRE owner clinical profile runtime syntax error: ${error instanceof Error ? error.message : String(error)}`); }

master = master
  .replace(/\s*<script src="\/assets\/spire-owner-clinical-profile\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace('</body>', `  <script src="${ownerProfileSyncUrl}"></script>\n</body>`);
if ((master.match(/src="\/assets\/spire-owner-clinical-profile\.js(?:\?[^"']*)?"/g) || []).length !== 1) {
  throw new Error('SPIRE master must publish the owner clinical profile sync exactly once');
}
await writeFile(masterPath, master, 'utf8');

async function patch(relative, transform) {
  const filePath = path.join(dist, relative);
  const source = await readFile(filePath, 'utf8');
  const next = transform(source);
  if (next === source && !source.includes(contract)) {
    throw new Error(`Standalone SPIRE launch publication did not find an expected launcher in ${relative}`);
  }
  await writeFile(filePath, next, 'utf8');
}

await patch('employee-portal.html', source => {
  let next = source.replace(/(<a[^>]+id="employeeStaticSpire"[^>]+href=")\/spire\.html("[^>]*>)/, `$1/spire/master.html$2`);
  if (!next.includes(`${contract}:employee`)) {
    next = next.replace(/(<a[^>]+id="employeeStaticSpire"[^>]+href="\/spire\/master\.html"[^>]*)(>)/, `$1 data-spire-standalone-launch="${contract}:employee"$2`);
  }
  return next;
});

await patch('employee-portal-railway.js', source => {
  let next = source.replaceAll("'/spire.html'", "'/spire/master.html'").replaceAll('"/spire.html"', '"/spire/master.html"');
  if (!next.includes(contract)) next += `\n/* ${contract}:employee-runtime */\n`;
  return next;
});

await patch('enterprise-apps.html', source => {
  let next = source.replace(/(id:'spire-live'[^\n]*?href:)'\/spire\.html'/, `$1'/spire/master.html'`);
  if (!next.includes(`${contract}:enterprise`)) next = next.replace("{id:'spire-live'", `{id:'spire-live',launchContract:'${contract}:enterprise'`);
  return next;
});

await patch('spire-admin.html', source => {
  let next = source.replace(/(<a class="btn primary" id="openSpire" href=")\/spire\.html("[^>]*>Open Live SPIRE)/, `$1/spire/master.html$2`);
  if (!next.includes(`${contract}:spire-admin`)) next = next.replace(/(<a class="btn primary" id="openSpire" href="\/spire\/master\.html"[^>]*)(>Open Live SPIRE)/, `$1 data-spire-standalone-launch="${contract}:spire-admin"$2`);
  return next;
});

for (const [relative, marker] of [
  ['employee-portal.html', `${contract}:employee`],
  ['employee-portal-railway.js', `${contract}:employee-runtime`],
  ['enterprise-apps.html', `${contract}:enterprise`],
  ['spire-admin.html', `${contract}:spire-admin`],
]) {
  const published = await readFile(path.join(dist, relative), 'utf8');
  if (!published.includes(marker)) throw new Error(`Standalone SPIRE launch marker missing from ${relative}`);
}

const publishedMaster = await readFile(masterPath, 'utf8');
if (!publishedMaster.includes(ownerProfileSyncUrl)) throw new Error('Standalone SPIRE master is missing canonical owner clinical profile sync');

console.log('Standalone live SPIRE publication unlocked: authorized launchers open /spire/master.html directly; the master enforces Sulandra session authentication and clinical scope, and owner professional identity is synced separately from RBAC permissions.');
