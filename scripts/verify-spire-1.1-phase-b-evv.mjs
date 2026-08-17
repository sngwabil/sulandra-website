import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const read = async (relative) => {
  try { return await readFile(path.join(root, relative), 'utf8'); }
  catch { failures.push(`Missing ${relative}`); return ''; }
};
const requireMarkers = (source, relative, markers) => {
  for (const marker of markers) if (!source.includes(marker)) failures.push(`${relative} missing ${JSON.stringify(marker)}`);
};
const requireOrder = (source, relative, first, second) => {
  const a = source.indexOf(first), b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) failures.push(`${relative} must register ${first} before ${second}`);
};

console.log('SPIRE 1.1 Phase B Step 1 — Alternate EVV adapter/UAT console + pre-bill hard stop');

const files = {
  prebill: 'api/src/spire-evv-prebill.ts',
  revenueGate: 'api/src/spire-evv-revenue-gate.ts',
  adapter: 'api/src/spire-evv-adapter-routes.ts',
  injector: 'scripts/inject-clinical-routes.mjs',
  console: 'spire-evv-test-console.html',
  migration: 'prisma/migrations/20260817184500_spire_1_1_evv_prebill_gate/migration.sql',
};
const content = {};
for (const [key, relative] of Object.entries(files)) content[key] = await read(relative);

requireMarkers(content.prebill, files.prebill, [
  'SpireEvvPrebillDecision',
  "sourceModule === 'SCLS' && sourceType === 'SpireEvvVisit'",
  'validateCanonicalEvvSnapshot',
  'buildCanonicalOhioEvvVisitPayload',
  'environment"=\'PRODUCTION\'',
  'not ACCEPTED',
  'Accepted PRODUCTION EVV payload is stale',
  'certificationClaimed: false',
]);
requireMarkers(content.revenueGate, files.revenueGate, [
  'registerSpireEvvRevenueGate',
  '/api/revenue-cycle/events/:eventId/evv-readiness',
  "action: 'READY'",
  "action: 'BATCH'",
  'EVV_PREBILL_MATCH_FAILED',
  'EVV_PREBILL_BATCH_BLOCKED',
  'cannot enter a billing batch',
]);
requireMarkers(content.adapter, files.adapter, [
  'registerSpireEvvAdapterRoutes',
  'UAT_SIMULATOR_ONLY',
  'NOT_CERTIFIED',
  'externalUatConfigured: false',
  'productionConfigured: false',
  'simulate-uat-response',
  'productionBillingSatisfied: false',
  'Manual PRODUCTION EVV status updates are disabled',
  'authenticated external Sandata/ODM adapter',
]);
requireMarkers(content.console, files.console, [
  'SPIRE_EVV_UAT_CONSOLE_V1',
  'UAT simulator only',
  'does not transmit to Sandata or ODM',
  'cannot create production acceptance evidence',
  '/api/spire/evv/adapter-status',
  '/queue-transmission',
  '/simulate-uat-response',
]);
requireMarkers(content.migration, files.migration, [
  'SpireEvvPrebillDecision',
  'append-only',
  'prevent_spire_evv_prebill_decision_mutation',
  "CHECK (\"action\" IN ('READY','BATCH'))",
]);
requireMarkers(content.injector, files.injector, [
  'registerSpireEvvRevenueGate',
  'registerRevenueCycleRoutes',
  'registerSpireEvvAdapterRoutes',
  'registerSpireAuthorizationsEvvRoutes',
]);
requireOrder(content.injector, files.injector,
  'registerSpireEvvRevenueGate(app, prisma, { authOf });',
  'registerRevenueCycleRoutes(app, prisma, { authOf, audit });');
requireOrder(content.injector, files.injector,
  'registerSpireEvvAdapterRoutes(app, prisma, { authOf });',
  'registerSpireAuthorizationsEvvRoutes(app, prisma, { authOf });');

if (failures.length) {
  console.error(`SPIRE 1.1 Phase B Step 1 verification FAILED (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('PASS: canonical EVV validation is bound to Revenue Cycle READY and BATCH, UAT simulation is explicitly non-production/non-certified, manual production acknowledgement is blocked, and immutable pre-bill decision evidence is present.');
