import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const expect = (condition, message) => { if (!condition) failures.push(message); };
const includesAll = (source, markers, label) => {
  for (const marker of markers) expect(source.includes(marker), `${label} is missing ${marker}`);
};

const [migration, homes, scheduler, attendance, geofence, exceptions, dayBoard, collaboration, frontend, packageJson] = await Promise.all([
  read('prisma/migrations/20260809183000_service_home_entity_ownership/migration.sql'),
  read('api/src/service-home-management-routes.ts'),
  read('api/src/time-attendance-location-scheduler-routes.ts'),
  read('api/src/time-attendance-routes.ts'),
  read('api/src/time-attendance-geofence-routes.ts'),
  read('api/src/time-attendance-exception-routes.ts'),
  read('api/src/time-attendance-day-board-routes.ts'),
  read('api/src/employee-collaboration-routes.ts'),
  read('assets/admin-service-home-management-v2.js'),
  read('package.json'),
]);

includesAll(migration, [
  'CREATE TABLE IF NOT EXISTS "TimeAttendanceLocation"',
  'CREATE TABLE IF NOT EXISTS "TimeAttendanceShift"',
  'CREATE TABLE IF NOT EXISTS "TimeAttendanceClockEntry"',
  'CREATE TABLE IF NOT EXISTS "TimeAttendanceRequest"',
  'CREATE TABLE IF NOT EXISTS "TimeAttendanceAudit"',
  'CREATE TABLE IF NOT EXISTS "TimeAttendanceManualPunchRequest"',
  'ALTER COLUMN "legalEntityId" SET NOT NULL',
  'TA_location_entity_name_uq',
  'TimeAttendanceClockEntry_entity_one_open',
  'TA_location_assignment_entity_location_fkey',
  'TimeAttendanceShift_entity_location_fkey',
], 'Service-home ownership migration');
expect(!migration.includes("'enabledModules'"), 'Service-home ownership migration must not enable operating modules');
expect(!migration.includes('UPDATE "LegalEntity"'), 'Service-home ownership migration must not change company lifecycle or provider status');

includesAll(homes, [
  'entityAccessOf(res)',
  'requireEntityManageAccess(access)',
  "access.accessLevel === 'MANAGE'",
  '"organizationId"=$1 AND "legalEntityId"=$2',
  '"id","organizationId","legalEntityId","name"',
  'FROM "Employment"',
  'FROM "ClientEnrollment"',
  '"legalEntityId"=EXCLUDED."legalEntityId"',
], 'Service-home API');

includesAll(scheduler, [
  'entityAccessOf(res)',
  'requireEntityManageAccess(access)',
  'requireAssignedEmployee',
  '"id","organizationId","legalEntityId","employeeId","locationId"',
  '"organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3',
  "access.legalEntityCode === 'SCLS'",
], 'Location scheduler API');

includesAll(attendance, [
  'entityAccessOf(res)',
  'requireEntityManageAccess(access)',
  '"id","organizationId","legalEntityId","employeeId","type","startAt","endAt","reason"',
  '"organizationId"=$1 AND "legalEntityId"=$2',
  'FROM "Employment"',
  'FROM "ClientEnrollment"',
  "code: 'GEOFENCE_REQUIRED'",
], 'Time and Attendance API');

includesAll(geofence, [
  'entityAccessOf(res)',
  'requireEntityManageAccess(access)',
  `"status"='PUBLISHED'`,
  '"id","organizationId","legalEntityId","employeeId","shiftId","clockIn","source"',
  'request_row."organizationId"=$1 AND request_row."legalEntityId"=$2',
], 'Geofence API');
includesAll(exceptions, [
  'entityAccessOf(res)',
  `"status"='PUBLISHED'`,
  '"id","organizationId","legalEntityId","employeeId","shiftId","punchType"',
  'request_row."organizationId"=$1 AND request_row."legalEntityId"=$2',
], 'Blocked-attempt API');
includesAll(dayBoard, [
  'entityAccessOf(res)',
  'location_row."organizationId"=$1 AND location_row."legalEntityId"=$2',
  'shift_row."organizationId"=$1 AND shift_row."legalEntityId"=$2',
  'clock_entry."organizationId"=$1 AND clock_entry."legalEntityId"=$2',
], 'Day-board API');
includesAll(collaboration, [
  '("id","organizationId","legalEntityId","employeeId","type","startAt","endAt","reason"',
  '("id","organizationId","legalEntityId","employeeId","requestType","title"',
  'if (!request.legalEntityId)',
  'if (!auth.legalEntityId)',
], 'Employee workflow time-request handoff');

includesAll(frontend, [
  'SulandraCompanyContext?.initialize?.()',
  'SulandraCompanyContext?.headers?.()',
  'sulandra:company-change',
  'loadingSequence += 1',
  'homes = []; employees = []; clients = []; current = null',
  'companyId()!==selectedCompanyId',
], 'Service-home Admin frontend');
expect(packageJson.includes('node scripts/verify-service-home-entity-scope.mjs'), 'Production web build does not run the service-home entity verifier');

const dist = path.join(root, 'dist-web');
try {
  await access(dist);
  const [adminHtml, publishedFrontend] = await Promise.all([
    read('dist-web/admin.html'),
    read('dist-web/assets/admin-service-home-management-v2.js'),
  ]);
  expect(adminHtml.includes('/assets/admin-service-home-management-v2.js?v=20260809-service-home-entity-5'), 'Published Admin does not load the company-scoped service-home asset version');
  expect(publishedFrontend.includes('SulandraCompanyContext?.headers?.()'), 'Published service-home frontend does not send selected-company headers');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

if (failures.length) {
  console.error('Service-home and workforce entity scope verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Service homes and shared workforce records are selected-company scoped; provider modules remain capability-gated.');
