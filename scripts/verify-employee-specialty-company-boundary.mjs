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

const [migration, scope, learning, safety, packageJson] = await Promise.all([
  read('prisma/migrations/20260809220000_employee_learning_safety_entity_scope/migration.sql'),
  read('api/src/employee360-scope-enforcement.ts'),
  read('api/src/employee-learning-development-routes.ts'),
  read('api/src/employee-health-safety-wellness-routes.ts'),
  read('package.json'),
]);

for (const table of [
  'EmployeeLearningAssignment',
  'EmployeeDevelopmentGoal',
  'EmployeeLearningEvent',
  'EmployeeSafetyIncident',
  'EmployeeSafetyAction',
  'EmployeeWellnessProgram',
  'EmployeeHealthSafetyEvent',
]) {
  expect(
    migration.includes(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "legalEntityId" text`),
    `${table} is missing its selected-company migration`,
  );
  expect(migration.includes(`'${table}'`), `${table} is missing from the strict company backfill`);
}

includesAll(migration, [
  'entity."code"=\'\'SCLS\'\'',
  'ALTER COLUMN "legalEntityId" SET NOT NULL',
  'EmployeeLearningAssignment_unique',
  '"organizationId","legalEntityId","employeeId","courseId"',
  'EmployeeSafetyIncident_entity_id_key',
  'EmployeeSafetyAction_entity_incident_fkey',
  "constraint_name := table_name || '_entity_fkey'",
], 'Learning and safety entity migration');
expect(!migration.includes('ALTER TABLE "EmployeeLearningCourse" ADD COLUMN'), 'Enterprise-shared learning courses must not be assigned to one employer company');
expect(!migration.includes("'enabledModules'"), 'Learning and safety migration must not enable operating modules');
expect(!migration.includes('UPDATE "LegalEntity"'), 'Learning and safety migration must not change company lifecycle or provider status');

includesAll(scope, [
  'legalEntityId?:string',
  'actorHasSelectedEmployment',
  'FROM "TimeAttendanceLocationAssignment"',
  'assignment."legalEntityId"=$2',
  'JOIN "Employment" employment',
  'legalEntityId,locationIds,employeeIds',
], 'Employee 360 route-scope middleware');
expect(!scope.includes('FROM "EmployeeWorkAssignment"'), 'Employee 360 scope still uses legacy organization-wide assignments');

includesAll(learning, [
  'legalEntityId?:string',
  'const selectedEntityId=(auth:AuthContext)',
  'employment."legalEntityId"=$2',
  '("id","organizationId","legalEntityId","employeeId","courseId"',
  'ON CONFLICT ("organizationId","legalEntityId","employeeId","courseId")',
  '"organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3',
  '("id","organizationId","legalEntityId","employeeId","actorUserId"',
  'EmployeeLearningAssignment_entity_employee_idx',
], 'Learning and development API');
expect(learning.includes('SELECT * FROM "EmployeeLearningCourse" WHERE "organizationId"=$1'), 'Enterprise learning catalog is not preserved as shared');

includesAll(safety, [
  'legalEntityId?:string',
  'const selectedEntityId=(auth:AuthContext)',
  'employment."legalEntityId"=$2',
  '("id","organizationId","legalEntityId","employeeId","incidentType"',
  '("id","organizationId","legalEntityId","incidentId","title"',
  '("id","organizationId","legalEntityId","title","description","programType"',
  'i."legalEntityId"=a."legalEntityId"',
  '"organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3',
  'EmployeeHealthSafetyEvent_entity_idx',
], 'Health, safety, and wellness API');

for (const [source, label] of [[scope, 'scope middleware'], [learning, 'learning API'], [safety, 'health and safety API']]) {
  expect(!source.includes('UserRole.COO'), `${label} still grants a retired COO role`);
}

expect(
  packageJson.includes('node scripts/verify-employee-specialty-company-boundary.mjs'),
  'Production web build does not run the Employee 360 specialty boundary verifier',
);

if (failures.length) {
  console.error('Employee 360 specialty selected-company boundary verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Employee 360 manager scope, learning assignments, development goals, safety incidents, corrective actions, and wellness programs are selected-company scoped.');
