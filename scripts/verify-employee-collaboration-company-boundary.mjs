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

const [migration, collaboration, packageJson] = await Promise.all([
  read('prisma/migrations/20260809210000_employee_collaboration_entity_scope/migration.sql'),
  read('api/src/employee-collaboration-routes.ts'),
  read('package.json'),
]);

for (const table of [
  'EmployeeWorkflowDefinition',
  'EmployeeWorkflowRequest',
  'EmployeeWorkflowApproval',
  'EmployeeWorkflowComment',
  'EmployeeWorkflowEvent',
  'EmployeeTeamFeedback',
  'EmployeeRecognition',
  'EmployeeNotification',
]) {
  expect(
    migration.includes(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "legalEntityId" text`),
    `${table} is missing its legal-entity migration`,
  );
}

for (const table of ['EmployeeWorkflowRequest', 'EmployeeWorkflowApproval', 'EmployeeWorkflowComment', 'EmployeeTeamFeedback']) {
  expect(
    migration.includes(`ALTER TABLE "${table}" ALTER COLUMN "legalEntityId" SET NOT NULL`),
    `${table} does not require company ownership`,
  );
}

includesAll(migration, [
  'entity."code"=\'SCLS\'',
  'EmployeeWorkflowRequest_entity_id_key',
  'EmployeeWorkflowApproval_entity_request_fkey',
  'EmployeeWorkflowComment_entity_request_fkey',
  "constraint_name := table_name || '_entity_fkey'",
  'FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id")',
  'EmployeeWorkflowDefinition_type_unique',
  '"organizationId","legalEntityId","requestType"',
  'ALTER COLUMN "requestType" DROP NOT NULL',
  'ALTER COLUMN "requestId" DROP NOT NULL',
], 'Employee collaboration entity migration');
expect(!migration.includes("'enabledModules'"), 'Employee collaboration migration must not enable operating modules');
expect(!migration.includes('UPDATE "LegalEntity"'), 'Employee collaboration migration must not change company lifecycle or provider status');

includesAll(collaboration, [
  "const selectedEntityId = (auth: Pick<AuthContext, 'legalEntityId'>)",
  'const actorHasSelectedEmployment = async (auth: AuthContext)',
  'FROM "Employment" employment',
  'employment."legalEntityId"=$2',
  'const requestById = async (organizationId: string, legalEntityId: string, requestId: string)',
  'WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3',
  '("id","organizationId","legalEntityId","employeeId","requestType","title"',
  '("id","organizationId","legalEntityId","requestId","sequence"',
  '("id","organizationId","legalEntityId","requestId","authorUserId","visibility","body")',
  '("id","organizationId","legalEntityId","employeeId","authorUserId","kind"',
  '("id","organizationId","legalEntityId","employeeId","nominatorUserId","category"',
  '("id","organizationId","legalEntityId","userId","notificationType"',
  'ON CONFLICT ("organizationId","legalEntityId","requestType")',
  'EmployeeWorkflowRequest_entity_status_idx',
  'EmployeeWorkflowApproval_entity_actor_idx',
  'EmployeeNotification_entity_user_idx',
  'entity."code"=\'SCLS\'',
  'await ensureDefaults(auth)',
  'await allEmployees(auth)',
  'await employeeById(auth,',
], 'Employee collaboration API');

for (const unsafeCall of [
  'requestById(auth.organizationId, req.params.requestId)',
  'advanceRequest(auth.organizationId, request.id',
  'employeeById(auth.organizationId,',
  'allEmployees(auth.organizationId)',
  'ensureDefaults(auth.organizationId,',
  'logEvent(auth.organizationId, request.id',
]) {
  expect(!collaboration.includes(unsafeCall), `Legacy organization-wide call remains: ${unsafeCall}`);
}

expect(
  packageJson.includes('node scripts/verify-employee-collaboration-company-boundary.mjs'),
  'Production web build does not run the employee collaboration company-boundary verifier',
);

if (failures.length) {
  console.error('Employee collaboration selected-company boundary verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Employee requests, approvals, comments, feedback, recognition, and collaboration notifications are selected-company scoped.');
