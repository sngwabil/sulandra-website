import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const runtimeSrc = '/assets/admin-operations-registry.js?v=20260822-admin-operations-map-1';
const globalUiEntry = "      ['/assets/admin-global-ui-restructure.js?v=20260822-global-admin-ui-1','canonical-admin-global-ui'],";
const runtimeEntry = `      ['${runtimeSrc}','canonical-admin-operations-registry'],`;

async function patchContext(target) {
  let source = await readFile(target, 'utf8');
  if (source.includes(runtimeSrc)) return;
  if (!source.includes(globalUiEntry)) throw new Error(`Admin operations mapping requires the global UI runtime anchor in ${path.relative(root, target)}`);
  source = source.replace(globalUiEntry, `${globalUiEntry}\n${runtimeEntry}`);
  await writeFile(target, source, 'utf8');
}

const runtimePath = path.join(root, 'assets', 'admin-operations-registry.js');
const runtime = await readFile(runtimePath, 'utf8');
try { new Function(runtime); } catch (error) {
  throw new Error(`Admin operations registry has JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`);
}

for (const marker of [
  'Company Chronicles','Clinical Operations','Compliance & Audit','Workforce & Dispatch','Financial & Billing',
  'Active Dispatch Tracking','Immediate Ride Booking','Pending EVV Exceptions','Quick Add Client',
  "id:'global.health'","kind:'api'","endpoint:'/health'",'System Health','Security & Monitoring','Universal search','Profile',
  'mapRenderedControls','data-operation-mapped','sulandra:admin-operations-mapped','SulandraAdminOperations',
]) {
  if (!runtime.includes(marker)) throw new Error(`Admin operations registry missing ${marker}`);
}

for (const target of [path.join(root, 'assets', 'admin-company-context.js'), path.join(dist, 'assets', 'admin-company-context.js')]) {
  try { await patchContext(target); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

await stat(path.join(dist, 'assets', 'admin-operations-registry.js'));
const publishedContext = await readFile(path.join(dist, 'assets', 'admin-company-context.js'), 'utf8');
if (!publishedContext.includes(runtimeSrc)) throw new Error('Canonical Admin bootstrap does not load the operations registry');
if (publishedContext.indexOf(runtimeSrc) < publishedContext.indexOf('/assets/admin-global-ui-restructure.js')) {
  throw new Error('Admin operations registry must load after the global UI runtime');
}

const routeTargets = [
  'company-documents.html','client-intake.html','spire-admin.html','spire-medication-qualifications.html',
  'home-health.html','home-health-referrals.html','employee360.html','security-audit.html','platform-readiness.html',
  'spire-training.html','intranet-control.html','workforce-admin.html','scheduling.html','nmt-dispatch.html',
  'spire-evv-test-console.html','nmt-orders.html','time-attendance.html','payroll.html','revenue-cycle.html','admin-profile.html',
];
for (const file of routeTargets) {
  try { await stat(path.join(dist, file)); }
  catch { throw new Error(`Admin operations mapping points to missing published route /${file}`); }
}

const sourceAdmin = await readFile(path.join(root, 'admin.html'), 'utf8');
const publishedAdmin = await readFile(path.join(dist, 'admin.html'), 'utf8');
if (sourceAdmin !== publishedAdmin) throw new Error('Admin operations mapping must not mutate canonical admin.html');
if (publishedAdmin.includes(runtimeSrc)) throw new Error('Admin operations registry must load through the canonical bootstrap, not direct admin.html injection');

console.log('Sulandra Admin operations mapping published: every core folder, day-operation control and global operation resolves through the canonical entity-aware operations registry.');
