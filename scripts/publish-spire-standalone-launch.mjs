import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const stationPath = path.join(dist, 'spire', 'client-station.html');
const schedulingPath = path.join(dist, 'scheduling.html');
const ownerProfileSyncPath = path.join(dist, 'assets', 'spire-owner-clinical-profile.js');
const operationalContextPath = path.join(dist, 'assets', 'sulandra-operational-context.js');
const ownerProfileSyncUrl = '/assets/spire-owner-clinical-profile.js?v=20260814-owner-clinical-profile-2';
const operationalContextUrl = '/assets/sulandra-operational-context.js?v=20260814-operational-context-1';
const entityContextUrl = '/assets/sulandra-entity-context.js?v=20260814-operational-context-1';
const contract = 'SPIRE_STANDALONE_PUBLIC_LAUNCH_V1';

let master = await readFile(masterPath, 'utf8');
let station = await readFile(stationPath, 'utf8');
let scheduling = await readFile(schedulingPath, 'utf8');
for (const marker of [
  'S.P.I.R.E. STANDALONE MASTER',
  'function requireSession()',
  '/employee-login.html?return=',
  'sulandra-entity-context.js',
]) {
  if (!master.includes(marker)) throw new Error(`Standalone SPIRE launch aborted: master chart missing ${marker}`);
}
for (const marker of ['SPIRE_CLIENT_STATION_LISTS_V2', 'stationUser', 'stationAvatar', 'sulandra-entity-context.js', '</body>']) {
  if (!station.includes(marker)) throw new Error(`Standalone SPIRE launch aborted: Client Station missing ${marker}`);
}
for (const marker of ['Scheduling', 'schedulerHost', 'time-attendance-location-scheduler.js', '</body>']) {
  if (!scheduling.includes(marker)) throw new Error(`Operational Scheduling publication missing ${marker}`);
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
  'SULANDRA_OPERATIONAL_COMPANY_CONTEXT_V1',
  'sulandra:last-operational-legal-entity-id',
  'SCLS',
  'reloadForEntity',
]) {
  if (!operationalContext.includes(marker)) throw new Error(`Operational company context runtime missing ${marker}`);
}
try { new Function(ownerProfileSync); }
catch (error) { throw new Error(`SPIRE owner clinical profile runtime syntax error: ${error instanceof Error ? error.message : String(error)}`); }
try { new Function(operationalContext); }
catch (error) { throw new Error(`Operational company context runtime syntax error: ${error instanceof Error ? error.message : String(error)}`); }

function publishOwnerIdentity(source, label) {
  const next = source
    .replace(/\s*<script src="\/assets\/spire-owner-clinical-profile\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace('</body>', `  <script src="${ownerProfileSyncUrl}"></script>\n</body>`);
  const count = (next.match(/src="\/assets\/spire-owner-clinical-profile\.js(?:\?[^"']*)?"/g) || []).length;
  if (count !== 1) throw new Error(`${label} must publish the owner clinical profile sync exactly once; found ${count}`);
  return next;
}

function publishStationOperationalContext(source) {
  let next = source.replace(/\s*<script src="\/assets\/sulandra-operational-context\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  const entityPattern = /<script src="\/assets\/sulandra-entity-context\.js(?:\?v=[^"']+)?"><\/script>/;
  const match = next.match(entityPattern)?.[0];
  if (!match) throw new Error('SPIRE Client Station is missing the shared entity-context runtime');
  next = next.replace(entityPattern, `${match}\n  <script src="${operationalContextUrl}"></script>`);
  const count = (next.match(/src="\/assets\/sulandra-operational-context\.js(?:\?[^"']*)?"/g) || []).length;
  if (count !== 1) throw new Error(`SPIRE Client Station must publish operational company context exactly once; found ${count}`);
  return next;
}

function publishSchedulingOperationalContext(source) {
  let next = source
    .replace(/\s*<script src="\/assets\/sulandra-operational-context\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/sulandra-entity-context\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  const schedulerPattern = /<script src="\/assets\/time-attendance-location-scheduler\.js(?:\?v=[^"']+)?"><\/script>/;
  const scheduler = next.match(schedulerPattern)?.[0];
  if (!scheduler) throw new Error('Scheduling is missing the location scheduler runtime');
  next = next.replace(
    schedulerPattern,
    `<script src="${entityContextUrl}"></script>\n<script src="${operationalContextUrl}"></script>\n${scheduler}`,
  );
  const entityCount = (next.match(/src="\/assets\/sulandra-entity-context\.js(?:\?[^"']*)?"/g) || []).length;
  const operationalCount = (next.match(/src="\/assets\/sulandra-operational-context\.js(?:\?[^"']*)?"/g) || []).length;
  if (entityCount !== 1) throw new Error(`Scheduling must publish shared entity context exactly once; found ${entityCount}`);
  if (operationalCount !== 1) throw new Error(`Scheduling must publish operational company context exactly once; found ${operationalCount}`);
  return next;
}

master = publishOwnerIdentity(master, 'SPIRE master');
station = publishOwnerIdentity(station, 'SPIRE Client Station');
station = publishStationOperationalContext(station);
scheduling = publishSchedulingOperationalContext(scheduling);
await Promise.all([
  writeFile(masterPath, master, 'utf8'),
  writeFile(stationPath, station, 'utf8'),
  writeFile(schedulingPath, scheduling, 'utf8'),
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

const [publishedMaster, publishedStation, publishedScheduling] = await Promise.all([
  readFile(masterPath, 'utf8'),
  readFile(stationPath, 'utf8'),
  readFile(schedulingPath, 'utf8'),
]);
if (!publishedMaster.includes(ownerProfileSyncUrl)) throw new Error('Standalone SPIRE master is missing canonical owner clinical profile sync');
if (!publishedStation.includes(ownerProfileSyncUrl)) throw new Error('SPIRE Client Station is missing canonical owner clinical profile sync');
if (!publishedStation.includes(operationalContextUrl)) throw new Error('SPIRE Client Station is missing operational company context');
if (!publishedScheduling.includes(entityContextUrl) || !publishedScheduling.includes(operationalContextUrl)) {
  throw new Error('Scheduling is missing shared/operational company context');
}

console.log('Standalone live SPIRE publication unlocked: owner professional identity remains separate from RBAC, while Scheduling and Client Station automatically recover from holding-company context into the remembered operating company.');
