import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const stationPath = path.join(dist, 'spire', 'client-station.html');
const ownerProfileSyncPath = path.join(dist, 'assets', 'spire-owner-clinical-profile.js');
const operationalContextPath = path.join(dist, 'assets', 'sulandra-operational-context.js');
const ownerProfileSyncUrl = '/assets/spire-owner-clinical-profile.js?v=20260814-owner-clinical-profile-2';
const operationalContextUrl = '/assets/sulandra-operational-context.js?v=20260815-approved-operations-1';
const contract = 'SPIRE_STANDALONE_PUBLIC_LAUNCH_V1';

let master = await readFile(masterPath, 'utf8');
let station = await readFile(stationPath, 'utf8');
for (const marker of [
  'S.P.I.R.E. STANDALONE MASTER',
  'function requireSession()',
  '/employee-login.html?return=',
  'sulandra-entity-context.js',
]) {
  if (!master.includes(marker)) throw new Error(`Standalone SPIRE launch aborted: master chart missing ${marker}`);
}
for (const marker of ['SPIRE_CLIENT_STATION_LISTS_V2', 'stationUser', 'stationAvatar', '</body>', 'sulandra-entity-context.js']) {
  if (!station.includes(marker)) throw new Error(`Standalone SPIRE launch aborted: Client Station missing ${marker}`);
}

await Promise.all([stat(ownerProfileSyncPath), stat(operationalContextPath)]);
const [ownerProfileSync, operationalContext] = await Promise.all([
  readFile(ownerProfileSyncPath, 'utf8'),
  readFile(operationalContextPath, 'utf8'),
]);
for (const marker of [
  'SPIRE_OWNER_CLINICAL_PROFILE_SYNC_V2',
  '/api/owner/profile',
  'professionalTitle',
  'securityRole',
  'stationUser',
  'stationAvatar',
]) {
  if (!ownerProfileSync.includes(marker)) throw new Error(`SPIRE owner clinical profile runtime missing ${marker}`);
}
for (const marker of [
  'SULANDRA_OPERATIONAL_COMPANY_CONTEXT_V2',
  'SULANDRA_HEALTH',
  'HOME_HEALTH',
  'NMT',
  'reloadForEntity',
]) {
  if (!operationalContext.includes(marker)) throw new Error(`SPIRE operational company runtime missing ${marker}`);
}
try { new Function(ownerProfileSync); }
catch (error) { throw new Error(`SPIRE owner clinical profile runtime syntax error: ${error instanceof Error ? error.message : String(error)}`); }
try { new Function(operationalContext); }
catch (error) { throw new Error(`SPIRE operational company runtime syntax error: ${error instanceof Error ? error.message : String(error)}`); }

function publishRuntime(source, label) {
  const next = source
    .replace(/\s*<script src="\/assets\/spire-owner-clinical-profile\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/sulandra-operational-context\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace('</body>', `  <script src="${ownerProfileSyncUrl}"></script>\n  <script src="${operationalContextUrl}"></script>\n</body>`);
  const ownerCount = (next.match(/src="\/assets\/spire-owner-clinical-profile\.js(?:\?[^"']*)?"/g) || []).length;
  const operationalCount = (next.match(/src="\/assets\/sulandra-operational-context\.js(?:\?[^"']*)?"/g) || []).length;
  if (ownerCount !== 1) throw new Error(`${label} must publish the owner clinical profile sync exactly once; found ${ownerCount}`);
  if (operationalCount !== 1) throw new Error(`${label} must publish the operational company context exactly once; found ${operationalCount}`);
  return next;
}

master = publishRuntime(master, 'SPIRE master');
station = publishRuntime(station, 'SPIRE Client Station');
await Promise.all([
  writeFile(masterPath, master, 'utf8'),
  writeFile(stationPath, station, 'utf8'),
]);

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

const [publishedMaster, publishedStation] = await Promise.all([
  readFile(masterPath, 'utf8'),
  readFile(stationPath, 'utf8'),
]);
if (!publishedMaster.includes(ownerProfileSyncUrl)) throw new Error('Standalone SPIRE master is missing canonical owner clinical profile sync');
if (!publishedStation.includes(ownerProfileSyncUrl)) throw new Error('SPIRE Client Station is missing canonical owner clinical profile sync');
if (!publishedMaster.includes(operationalContextUrl)) throw new Error('Standalone SPIRE master is missing operational company context');
if (!publishedStation.includes(operationalContextUrl)) throw new Error('SPIRE Client Station is missing operational company context');

console.log('Standalone live SPIRE publication unlocked: authorized launchers open /spire/master.html directly; master and Client Station sync owner professional identity and automatically resolve holding-company context to an approved operating provider.');
