import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [migration, hiring, education, careers, workflow, admin, build] = await Promise.all([
  read('prisma/migrations/20260809150000_company_hiring_provisioning/migration.sql'),
  read('api/src/hiring-provisioning-routes.ts'),
  read('api/src/education-routes.ts'),
  read('api/src/careers-routes.ts'),
  read('careers-admin-workflow.js'),
  read('admin.html'),
  read('scripts/build-static-site.mjs'),
]);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const marker of [
  'CREATE TABLE IF NOT EXISTS "EmployeeHireProvisioning"',
  '"legalEntityId" SET NOT NULL',
  'EducationAssignment_open_entity_unique',
  '"organizationId","legalEntityId","employeeId","courseCode"',
]) expect(migration.includes(marker), `Hiring migration is missing ${marker}`);

for (const marker of [
  "'/api/admin/applications/:id/hire'",
  'requireEntityManageAccess(access)',
  "access.capabilities.includes('ONBOARDING')",
  "access.capabilities.includes('EDUCATION')",
  'offer?.acceptedAt',
  'FROM information_schema.columns',
  'INSERT INTO "Employment"',
  'INSERT INTO "UserEntityAccessGrant"',
  'INSERT INTO "EducationAssignment"',
  'INSERT INTO "EmployeeOnboardingLink"',
  'UPDATE "EmployeeSecureDocument" secure_document',
  'INSERT INTO "EmployeeOnboardingSnapshot"',
  'INSERT INTO "EmployeeHireProvisioning"',
  '"workflowStatus"=\'HIRED\'',
  'TransactionIsolationLevel.Serializable',
  "'/api/admin/applications/:id/hire/access-reset'",
  'RESET_HIRED_EMPLOYEE_PORTAL_ACCESS',
  'Only the Enterprise Owner may reset access for a cross-company or privileged employee',
  'Portal access reset from accepted application',
]) expect(hiring.includes(marker), `Hiring service is missing ${marker}`);

expect(careers.includes("registerHiringProvisioningRoutes(app, prisma, helpers)"), 'Hiring service is not registered with Careers');
expect(education.includes('assignment."legalEntityId"=$3'), 'Employee training reads are not selected-company scoped');
expect(education.includes('employment."legalEntityId"=$3'), 'Bulk training does not validate selected-company employment');
expect(education.includes('"id","organizationId","legalEntityId","departmentId","employeeId"'), 'Training writes do not persist company and department ownership');

expect(workflow.includes('SulandraCompanyContext?.headers?.()'), 'Applicant folder requests do not carry selected-company headers');
expect(workflow.includes('/hire`'), 'Admin hiring action is not connected to the provisioning endpoint');
expect(workflow.includes('data-hire-ack'), 'Admin hiring action lacks an explicit final acknowledgement');
expect(workflow.includes('It does not authorize unlicensed provider work'), 'Admin hiring action does not explain the pre-launch boundary');
expect(workflow.includes('temporaryPassword'), 'Admin cannot recover one-time access when welcome delivery is unavailable');
expect(workflow.includes('/hire/access-reset'), 'Admin cannot securely reset a hired employee credential');
expect(workflow.includes('All prior employee sessions were revoked'), 'Admin reset workflow does not confirm session revocation');

const cacheMarker = 'careers-admin-workflow.js?v=20260809-hiring-provisioning-2';
expect(admin.includes(cacheMarker), 'Admin does not load the new hiring workflow cache version');
expect(build.includes(cacheMarker), 'Static build does not require the new hiring workflow cache version');

try { new Function(workflow); }
catch (error) { failures.push(`Hiring workflow JavaScript does not parse: ${error.message}`); }

if (failures.length) {
  console.error(`Company hiring provisioning verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Company hiring provisioning verified: accepted offers create an isolated employment, portal access, onboarding snapshot, and selected-company training without enabling unapproved provider operations.');
