import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const includesAll = (source, markers, label) => {
  for (const marker of markers) expect(source.includes(marker), `${label} is missing ${marker}`);
};

const [migration, management, permissions, selfService, scopeEnforcement, packageJson] = await Promise.all([
  read('prisma/migrations/20260809203000_employee360_entity_authorization/migration.sql'),
  read('api/src/employee-management-routes.ts'),
  read('api/src/employee-360-permissions.ts'),
  read('api/src/employee-self-service-routes.ts'),
  read('api/src/employee360-scope-enforcement.ts'),
  read('package.json'),
]);

includesAll(migration, [
  'ALTER TABLE "Employee360AccessGrant"',
  'ALTER TABLE "Employee360AccessEvent"',
  'entity."code"=\'SCLS\'',
  'ALTER COLUMN "legalEntityId" SET NOT NULL',
  '"organizationId","legalEntityId","actorUserId","profile","scopeType"',
  'Employee360AccessGrant_entity_fkey',
  'Employee360AccessEvent_entity_fkey',
  'ADD COLUMN IF NOT EXISTS "supervisorId" text',
  'Employment_entity_supervisor_idx',
], 'Employee 360 authorization migration');
expect(!migration.includes("'enabledModules'"), 'Employee 360 authorization migration must not enable operating modules');
expect(!migration.includes('UPDATE "LegalEntity"'), 'Employee 360 authorization migration must not change company lifecycle or provider status');

includesAll(management, [
  'const selectedEntityId = (auth: AuthContext)',
  'FROM "Employment" employment',
  'WHERE "organizationId"=$1 AND "legalEntityId"=$2',
  'employment."legalEntityId"=$3',
  '"organizationId","legalEntityId","departmentId","employeeId","courseCode"',
  'organizationEmploymentProfile',
  'organizationEmploymentStatus: legacyEmployment.status',
  '"departmentId"=$6,"supervisorId"=$7',
], 'Employee management API');
for (const table of ['EducationAssignment', 'TimeAttendanceShift', 'TimeAttendanceClockEntry', 'TimeAttendanceRequest']) {
  expect(management.includes(`FROM "${table}" WHERE "organizationId"=$1 AND "legalEntityId"=$2`), `${table} reads are not selected-company scoped`);
}

includesAll(permissions, [
  '"legalEntityId" TEXT NOT NULL',
  'Employee360AccessGrant_entity_actor_idx',
  'Employee360AccessEvent_entity_target_idx',
  'FROM "Employment" employment',
  'employment."legalEntityId"=$3',
  '"organizationId"=$1 AND "legalEntityId"=$2 AND "actorUserId"=$3',
  '("id","organizationId","legalEntityId","actorUserId","targetEmployeeId"',
  'g."organizationId"=$1 AND g."legalEntityId"=$2',
  'e."organizationId"=$1 AND e."legalEntityId"=$2',
  'WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3',
  'profileSnapshot',
  'employment."supervisorId"',
  'actorHasSelectedEmployment',
  'Preserve fields outside the actor',
], 'Employee 360 permission enforcement');

includesAll(selfService, [
  'legalEntityId?: string',
  'WITH selected_employment AS',
  'WHERE "organizationId"=$1 AND "legalEntityId"=$2',
  '("id","organizationId","legalEntityId","actorUserId","targetEmployeeId"',
  'legalEntityId: selectedEntityId(auth)',
], 'Employee self-service API');

includesAll(scopeEnforcement, [
  'legalEntityId?:string',
  'const selectedEntityId=(auth:AuthContext)',
  'const actorHasSelectedEmployment=async(auth:AuthContext)',
  'FROM "TimeAttendanceLocationAssignment"',
  '"organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3',
  'JOIN "Employment" employment',
  'assignment."legalEntityId"=$2',
  'legalEntityId,locationIds,employeeIds',
  'UserRole.DOO',
], 'Employee 360 route-scope middleware');
expect(!scopeEnforcement.includes('FROM "EmployeeWorkAssignment"'), 'Employee 360 scope middleware still uses legacy organization-wide work assignments');
expect(!scopeEnforcement.includes('UserRole.COO'), 'Employee 360 scope middleware still grants a retired COO role');

expect(packageJson.includes('node scripts/verify-employee360-company-boundary.mjs'), 'Production web build does not run the Employee 360 company-boundary verifier');

if (failures.length) {
  console.error('Employee 360 selected-company boundary verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Employee 360 directory, workforce panels, grants, events, and self-service are selected-company scoped; shared personnel records remain enterprise-managed.');
