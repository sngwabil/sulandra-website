import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const migrationPath = 'prisma/migrations/20260808220000_multi_company_entity_foundation/migration.sql';
const [migration, routes, bootstrap] = await Promise.all([
  read(migrationPath),
  read('api/src/multi-company-routes.ts'),
  read('api/src/onboarding-bootstrap.ts'),
]);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const table of ['LegalEntity', 'Department', 'Employment', 'UserEntityAccessGrant', 'ClientEnrollment']) {
  expect(migration.includes(`CREATE TABLE IF NOT EXISTS "${table}"`), `Migration does not create ${table}`);
}
for (const entityCode of ['SULANDRA_HEALTH', 'SCLS', 'HOME_HEALTH', 'NMT']) {
  expect(migration.includes(`'${entityCode}'`), `Migration does not seed ${entityCode}`);
}
expect(migration.includes("'SCLS','Sulandra Community Living Services LLC'"), 'SCLS is not seeded as the established operating company');
expect(migration.includes("'SULANDRA_HEALTH','Sulandra Health LLC','Sulandra Health','HOLDING','PLANNED'"), 'Sulandra Health is not safely seeded as planned');
expect(migration.includes("'EXISTING_SCLS_BACKFILL'"), 'Existing users and clients are not backfilled to SCLS');
expect(migration.includes('legalOwnershipPending'), 'Planned legal ownership is not explicitly distinguished from completed ownership');

for (const route of [
  '/api/entity-context',
  '/api/admin/legal-entities',
  '/api/admin/departments',
  '/api/admin/employments',
  '/api/admin/entity-access-grants',
  '/api/admin/client-enrollments',
]) {
  expect(routes.includes(`'${route}`), `Backend does not register ${route}`);
}
expect(routes.includes('actualIdentity(prisma, auth)'), 'Owner access does not resolve identity from the database');
expect(routes.includes('sharedAccess'), 'Entity context does not preserve shared intranet and education access');
expect(bootstrap.includes("from './multi-company-routes.js'"), 'Multi-company routes are not imported by the backend bootstrap');
expect(bootstrap.includes('registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });'), 'Multi-company routes are not registered');
expect(
  /const entityContext = await getUserEntityContext\(prisma, (account|auth)\);/.test(bootstrap)
    && bootstrap.includes('entityContext,'),
  'Authenticated session does not expose authorized entity memberships',
);
expect(bootstrap.includes("app.use('/api', scopedAccess);"), 'Authenticated API requests do not enforce canonical entity access middleware');

if (failures.length) {
  console.error(`Multi-company foundation verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Multi-company foundation verified: legal entities, departments, employments, entity-scoped grants, client enrollments, SCLS compatibility backfill, session memberships, and request-scoped entity access are wired into the backend.');
