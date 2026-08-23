import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const runtimeSrc = '/assets/admin-operations-registry.js?v=20260822-admin-operations-map-1';
const runtime = await readFile(path.join(root, 'assets', 'admin-operations-registry.js'), 'utf8');
const globalUi = await readFile(path.join(root, 'assets', 'admin-global-ui-restructure.js'), 'utf8');
const context = await readFile(path.join(dist, 'assets', 'admin-company-context.js'), 'utf8');
const admin = await readFile(path.join(dist, 'admin.html'), 'utf8');

const must = (condition, message) => { if (!condition) throw new Error(`Admin operations mapping verification failed: ${message}`); };

for (const area of ['Company Chronicles','Clinical Operations','Compliance & Audit','Workforce & Dispatch','Financial & Billing']) {
  must(runtime.includes(`area:'${area}'`), `${area} is not represented in the canonical registry`);
  must(globalUi.includes(`label: '${area}'`), `${area} is not rendered by the global Admin UI`);
}
for (const label of ['Active Dispatch Tracking','Immediate Ride Booking','Pending EVV Exceptions','Quick Add Client']) {
  must(runtime.includes(`label:'${label}'`), `${label} is missing from the registry`);
  must(globalUi.includes(label), `${label} is missing from the rendered day-operations drawer`);
}
for (const label of ['System Health','Security & Monitoring','Universal search','Profile']) {
  must(runtime.includes(`label:'${label}'`), `${label} is missing from the global operations registry`);
  must(globalUi.includes(label), `${label} is missing from the global Admin controls`);
}

must(runtime.includes("id:'global.health'"), 'System Health does not have a stable operation id');
must(runtime.includes("kind:'api'"), 'System Health is not represented as an API operation');
must(runtime.includes("endpoint:'/health'"), 'System Health does not resolve to /health');
must(!runtime.includes("kind:'route', href:'#'"), 'a route operation still points to a placeholder # target');
must(runtime.includes("companyCodes:['NMT']"), 'NMT operations are not company-scoped');
must(runtime.includes("companyCodes:['HOME_HEALTH']"), 'Home Health operations are not company-scoped');
must(runtime.includes("control.dataset.operationMapped = 'true'"), 'rendered controls are not annotated with canonical operation identity');
must(runtime.includes('MutationObserver'), 'operations mapping does not follow dynamic Admin rerenders');
must(runtime.includes('sulandra:company-context-changed'), 'operations mapping does not remap after company changes');
must(runtime.includes('SulandraAdminOperations'), 'operations registry is not exposed for diagnostics and controlled execution');

must(context.includes(runtimeSrc), 'canonical Admin bootstrap does not load the operations registry');
const globalUiIndex = context.indexOf('/assets/admin-global-ui-restructure.js');
const operationsIndex = context.indexOf(runtimeSrc);
must(globalUiIndex >= 0 && operationsIndex > globalUiIndex, 'operations registry must load after the global Admin UI runtime');
must(!admin.includes(runtimeSrc), 'operations registry was injected directly into admin.html instead of the canonical bootstrap');

const routeFiles = [
  'company-documents.html','client-intake.html','spire-admin.html','spire-medication-qualifications.html',
  'home-health.html','home-health-referrals.html','employee360.html','security-audit.html','platform-readiness.html',
  'spire-training.html','intranet-control.html','workforce-admin.html','scheduling.html','nmt-dispatch.html',
  'spire-evv-test-console.html','nmt-orders.html','time-attendance.html','payroll.html','revenue-cycle.html','admin-profile.html',
];
for (const file of routeFiles) {
  try { await stat(path.join(dist, file)); }
  catch { throw new Error(`Admin operations mapping verification failed: published target /${file} does not exist`); }
}

const operationIds = [...runtime.matchAll(/\{ id:'([^']+)'/g)].map((match) => match[1]);
must(operationIds.length >= 30, `registry is unexpectedly small (${operationIds.length} operations)`);
must(new Set(operationIds).size === operationIds.length, 'operation ids are not unique');

console.log(`Admin operations mapping verified: ${operationIds.length} canonical operations resolve across five core folders, global controls and day operations with entity-aware routing and no placeholder route targets.`);
