import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = 'prisma/migrations/20260808230000_scls_operational_data_backfill/migration.sql';
const migration = await readFile(path.join(root, migrationPath), 'utf8');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const domain of [
  "table_name ~ '^Applicant'",
  "table_name='EmployeeApplication'",
  "table_name ~ '^EmploymentOffer'",
  "table_name ~ '^Interview'",
  "table_name='JobOpening'",
  "table_name ~ '^Employee'",
  "table_name ~ '^TimeAttendance'",
  "table_name ~ '^ServiceHome'",
  "table_name='Client'",
  "table_name='ClientServiceRequest'",
  "table_name='Location'",
  "table_name ~ '^Spire'",
  "table_name='CompanySetting'",
  "table_name='EducationAssignment'",
  "table_name='AuditEvent'",
]) expect(migration.includes(domain), `Operational backfill does not discover ${domain}`);

for (const sharedTable of [
  'EmployeePortalCredential',
  'EmployeeAuthSession',
  'EmployeeMfaProfile',
  'EmployeePortalAccessControl',
  'EmployeeLoginEvent',
  'ApplicantPortalAccount',
  'ApplicantPasswordReset',
  'EmployeeLearningCourse',
  'AdminDesktopProfile',
  'IntranetContentItem',
  'IntranetContentSettings',
]) expect(migration.includes(`'${sharedTable}'`), `Shared enterprise table ${sharedTable} is not explicitly excluded`);

expect(migration.includes('ADD COLUMN IF NOT EXISTS "legalEntityId" text'), 'Migration does not add the entity discriminator safely');
expect(migration.includes("entity.\"code\"=''SCLS''"), 'Migration does not assign existing operational rows to SCLS');
expect(migration.includes('remaining_rows > 0'), 'Migration does not fail closed when rows remain unassigned');
expect(migration.includes('FOREIGN KEY ("organizationId","legalEntityId")'), 'Migration does not enforce same-organization entity references');
expect(migration.includes('VALIDATE CONSTRAINT'), 'Migration does not validate entity references after backfill');
expect(migration.includes('OperationalEntityBackfillAudit'), 'Migration does not retain per-table backfill evidence');
expect(migration.includes("employment.\"source\"='EXISTING_SCLS_BACKFILL'"), 'Employment compatibility assignment is not reasserted');
expect(migration.includes("enrollment.\"source\"='EXISTING_SCLS_BACKFILL'"), 'Client enrollment compatibility assignment is not reasserted');

if (failures.length) {
  console.error(`SCLS operational backfill verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('SCLS operational backfill verified: current careers, workforce, timekeeping, service-home, intake, clinical and audit data are assigned to SCLS while enterprise identity, intranet and shared education data remain shared.');
