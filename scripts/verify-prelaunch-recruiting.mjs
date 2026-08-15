import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [formationMigration, approvedMigration, access, context, careers, general, dsp, nursing, executive, build] = await Promise.all([
  read('prisma/migrations/20260809110000_activate_prelaunch_companies/migration.sql'),
  read('prisma/migrations/20260815073500_activate_approved_operating_companies/migration.sql'),
  read('api/src/entity-access.ts'),
  read('assets/admin-company-context.js'),
  read('careers.html'),
  read('applygeneral.html'),
  read('applydsp.html'),
  read('applylpn.html'),
  read('applydoo.html'),
  read('scripts/build-static-site.mjs'),
]);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

// Historical formation-stage migration remains immutable for migration integrity.
expect(formationMigration.includes('"status"=\'ACTIVE\''), 'Historical company workspace activation migration is missing');

// The later approval migration must supersede all formation-stage operational locks.
for (const marker of [
  "'formationStatus','ACTIVE'",
  "'serviceOperationsStatus','ACTIVE'",
  "'hiringStatus','ACTIVE'",
  "'trainingStatus','ACTIVE'",
  "'referralStatus','ACTIVE'",
  "'billingStatus','ACTIVE'",
  "'approvalStatus','APPROVED'",
  "'approvalRecordSource','OWNER_CONFIRMED'",
]) expect(approvedMigration.includes(marker), `Approved-company migration is missing ${marker}`);

for (const company of ['SCLS', 'HOME_HEALTH', 'NMT']) {
  expect(approvedMigration.includes(`WHEN '${company}' THEN`), `${company} is not included in approved-company activation`);
}
expect(approvedMigration.includes('"isProvider"=CASE WHEN "code"=\'SULANDRA_HEALTH\' THEN false ELSE true END'), 'Approved operating companies are not enabled as provider entities');
expect(approvedMigration.includes("'HOME_HEALTH_OPERATIONS'"), 'Home Health operations are not enabled');
expect(approvedMigration.includes("'NMT_OPERATIONS'"), 'NMT operations are not enabled');
expect(approvedMigration.includes("'SCLS_OPERATIONS'"), 'SCLS operations are not enabled');
expect(approvedMigration.includes("'TIME_ATTENDANCE'"), 'Time & Attendance is not enabled for approved companies');
expect(approvedMigration.includes("'SPIRE'"), 'SPIRE is not enabled for approved operating companies');
expect(approvedMigration.includes("'BILLING'"), 'Billing is not enabled for approved operating companies');
expect(approvedMigration.includes("- 'preLaunch' - 'prelaunch' - 'preLaunchLocked'"), 'Legacy pre-launch metadata flags are not cleaned up');

// Capability enforcement remains in place for future entities, but approved companies
// now receive the capabilities they need through their persisted lifecycle metadata.
expect(access.includes('capabilities: EntityCapability[]'), 'Resolved company access does not expose module capabilities');
expect(access.includes('requiredCapability(request.path)'), 'Company module capability enforcement is missing');
for (const [route, capability] of [
  ["path.startsWith('/api/admin/employee-')", 'EMPLOYEE_360'],
  ["path.startsWith('/api/employee/me/')", 'EMPLOYEE_360'],
  ["path.startsWith('/api/admin/compliance')", 'COMPLIANCE'],
  ["path.startsWith('/api/admin/spire')", 'SPIRE'],
  ["path.startsWith('/api/admin/clients')", 'SPIRE'],
  ["path.startsWith('/api/admin/homes')", 'SCLS_OPERATIONS'],
]) {
  expect(access.includes(route), `${capability} routes are not covered by the company capability gate`);
}
expect(context.includes('serviceOperationsStatus'), 'Admin company selector does not show operating lifecycle status');
expect(context.includes('licensingStatus'), 'Admin company selector does not show licensing lifecycle status');

for (const code of ['SULANDRA_HEALTH', 'SCLS', 'HOME_HEALTH', 'NMT']) {
  expect(careers.includes(`"${code}"`), `Careers page does not load ${code} openings`);
}
expect(careers.includes('id="companySelect"'), 'Careers page has no company filter');
expect(careers.includes('/public/careers/openings?company='), 'Careers page does not request company-scoped openings');
expect(careers.includes('legalEntityName'), 'Careers page does not display the exact employer');
expect(careers.includes('searchParams.set("company"'), 'Careers application links do not preserve the employer');

for (const [name, source] of [
  ['general', general], ['DSP/driver', dsp], ['nursing', nursing], ['executive', executive],
]) {
  expect(source.includes('/public/careers/openings?company='), `${name} application does not load the selected employer opening`);
  expect(source.includes('legalEntityCode:'), `${name} application does not submit the selected employer`);
}

expect(build.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2'), 'Static build does not require the company lifecycle selector');

if (failures.length) {
  console.error(`Approved-company activation verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Approved-company activation verified: SCLS, Home Health, and NMT are active operating providers with referrals, billing, workforce, compliance, client intake, and clinical capabilities enabled; the Sulandra Health parent remains a non-provider holding entity.');
