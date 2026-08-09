import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const failures = [];
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const file of [
  'service-request.html', 'service-request/index.html', 'resources.html', 'resources/index.html',
  'services/home-health/index.html', 'services/transportation/index.html', 'services/respite-care/index.html',
  'services/rehab/index.html', 'services/behavioral-health/index.html', 'services/companion-care/index.html',
  'assets/client-service-request-app.js', 'assets/admin-client-service-requests.js',
  'assets/public-consultation-service-request-bridge.js', 'assets/public-services-navigation.js',
]) {
  try { await stat(path.join(dist, file)); } catch { failures.push(`Missing published client intake/service file: ${file}`); }
}

const [route, clinical, migration, adminSource, publicFormSource, publicBridgeSource, installer, publicPage] = await Promise.all([
  read('api/src/client-service-request-routes.ts'),
  read('api/src/clinical-routes.ts'),
  read('prisma/migrations/20260809180000_company_client_intake_boundaries/migration.sql'),
  read('assets/admin-client-service-requests.js'),
  read('assets/client-service-request-app.js'),
  read('assets/public-consultation-service-request-bridge.js'),
  read('scripts/install-client-service-request-frontend.mjs'),
  read('service-request.html'),
]);

for (const marker of [
  '/public/client-service-requests', '/api/admin/client-service-requests', '/start-intake',
  'route-to-requested-company', 'UPDATE_CLIENT_SERVICE_REQUEST', 'START_CLIENT_INTAKE',
  'ROUTE_PRELAUNCH_INTEREST_TO_APPROVED_PROVIDER', 'ClientServiceRequestRoutingEvent',
  'requestedLegalEntityId', 'intakeMode', 'sourcePath', 'OPERATIONAL', 'PRELAUNCH_INTEREST',
  'ENTERPRISE_CONSULTATION', 'formalProviderIntakeEnabled', 'requireEntityManageAccess',
  'requireEnterpriseOwner', 'SpireIntakeImport', '"legalEntityId"=$2',
]) expect(route.includes(marker), `Missing company client-intake backend marker: ${marker}`);

for (const marker of [
  'ClientServiceRequest_requested_entity_fkey', 'ClientServiceRequest_intake_mode_check',
  'ClientServiceRequest_routing_shape_check', 'ClientServiceRequestRoutingEvent',
  'SpireIntakeImport_entity_status_created_idx', 'ALTER COLUMN "legalEntityId" SET NOT NULL',
  "WHERE \"code\"='SULANDRA_HEALTH'", "'formalProviderIntakeEnabled',false",
]) expect(migration.includes(marker), `Missing company intake migration control: ${marker}`);
expect(!migration.includes(`WHERE "code" IN ('HOME_HEALTH','NMT')`), 'The intake migration must not enable unapproved Home Health or NMT provider queues');

for (const marker of [
  'entityAccessOf(res)', 'requireEntityManageAccess(access)',
  '"SpireIntakeImport" ("id","organizationId","legalEntityId"',
  'WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3',
  '"SpireClinicalAuditEvent" WHERE "organizationId"=$1 AND "legalEntityId"=$2',
]) expect(clinical.includes(marker), `Missing entity-scoped SPIRE intake control: ${marker}`);

for (const marker of [
  'SulandraCompanyContext?.headers?.()', 'SulandraCompanyContext?.initialize?.()',
  'sulandra:company-change', 'PRELAUNCH_INTEREST', 'ENTERPRISE_CONSULTATION',
  'requestedCompanyReadinessReason', 'formalIntakeAvailable', 'route-to-requested-company',
  'cannot be treated as accepted provider service',
]) expect(adminSource.includes(marker), `Missing Admin company-intake behavior: ${marker}`);

for (const source of [publicFormSource, publicBridgeSource]) {
  for (const marker of ['companyCode', 'sourcePath', 'PRELAUNCH_INTEREST']) {
    expect(source.includes(marker), `Public intake submission is missing routing marker: ${marker}`);
  }
}
expect(publicFormSource.includes("TRANSPORTATION:'NMT'"), 'Transportation interest is not directed to the NMT request target');
expect(publicFormSource.includes("HOME_HEALTH:'HOME_HEALTH'"), 'Home Health interest is not directed to the Home Health request target');
expect(publicPage.includes('does not guarantee admission, approval, referral acceptance'), 'Public request page does not disclose prelaunch and availability boundaries');
expect(publicPage.includes('Only an approved, operational company'), 'Public request page does not explain the formal-intake gate');
expect(installer.includes('20260809-company-intake-3'), 'Published Admin and consultation assets do not use the company-intake cache version');

for (const [name, source] of [
  ['Admin client intake', adminSource],
  ['Public service request', publicFormSource],
  ['Homepage consultation bridge', publicBridgeSource],
]) {
  try { new Function(source); } catch (error) { failures.push(`${name} JavaScript does not parse: ${error.message}`); }
}

const originalMigration = await read('prisma/migrations/20260807023000_client_service_requests/migration.sql');
const linkMigration = await read('prisma/migrations/20260807030000_client_service_request_intake_links/migration.sql');
expect(originalMigration.includes('ClientServiceRequest'), 'Controlled ClientServiceRequest migration is missing');
for (const marker of ['intakeImportId', 'clientId']) expect(linkMigration.includes(marker), `Missing permanent client intake link column: ${marker}`);

try {
  const admin = await readFile(path.join(dist, 'admin.html'), 'utf8');
  expect(admin.includes('/assets/admin-client-service-requests.js?v=20260809-company-intake-3'), 'Admin does not load the versioned company Client Service Requests workspace');
} catch {}
try {
  const index = await readFile(path.join(dist, 'index.html'), 'utf8');
  expect(index.includes('/assets/public-consultation-service-request-bridge.js?v=20260809-company-intake-3'), 'Homepage consultation does not load the versioned company request bridge');
} catch {}
try {
  const services = await readFile(path.join(dist, 'services.html'), 'utf8');
  expect(services.includes('/assets/public-services-navigation.js'), 'Public Services page does not load live navigation integration');
} catch {}
for (const relative of [
  'services/home-health/index.html', 'services/transportation/index.html', 'services/respite-care/index.html',
  'services/rehab/index.html', 'services/behavioral-health/index.html', 'services/companion-care/index.html',
]) {
  try {
    const html = await readFile(path.join(dist, relative), 'utf8');
    expect(html.includes('/service-request.html?service='), `${relative} is not connected to Client Service Requests`);
  } catch {}
}

if (failures.length) {
  console.error(`Company Client Service Request verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Company Client Service Requests verified: public routing, holding-company prelaunch interest, selected-company Admin scope, approval-gated transfer, and legal-entity SPIRE intake linkage are connected.');
