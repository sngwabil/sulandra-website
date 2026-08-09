import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [migration, access, context, careers, general, dsp, nursing, executive, build] = await Promise.all([
  read('prisma/migrations/20260809110000_activate_prelaunch_companies/migration.sql'),
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

expect(migration.includes('"status"=\'ACTIVE\''), 'Company workspaces are not activated');
expect(migration.includes('"isEmployer"=true'), 'Active company workspaces are not enabled for recruiting');
expect(migration.includes('"isProvider"=CASE WHEN "code"=\'SCLS\' THEN true ELSE false END'), 'Pending companies could be represented as approved providers');
for (const marker of [
  "'licensingStatus','PENDING_APPROVAL'",
  "'serviceOperationsStatus','PRE_LAUNCH'",
  "'referralStatus','NOT_ACCEPTING'",
  "'billingStatus','DISABLED'",
]) expect(migration.includes(marker), `Activation migration is missing safeguard ${marker}`);

expect(access.includes('capabilities: EntityCapability[]'), 'Resolved company access does not expose module capabilities');
expect(access.includes('requiredCapability(request.path)'), 'Pre-launch modules are not server-gated');
expect(access.includes('is not enabled for ${access.legalEntityName} during pre-launch'), 'Blocked pre-launch modules do not return a clear error');
for (const [route, capability] of [
  ["path.startsWith('/api/admin/employee-')", 'EMPLOYEE_360'],
  ["path.startsWith('/api/employee/me/')", 'EMPLOYEE_360'],
  ["path.startsWith('/api/admin/compliance')", 'COMPLIANCE'],
  ["path.startsWith('/api/admin/spire')", 'SPIRE'],
  ["path.startsWith('/api/admin/clients')", 'SPIRE'],
  ["path.startsWith('/api/admin/homes')", 'SCLS_OPERATIONS'],
]) {
  expect(access.includes(route), `${capability} routes are not covered by the pre-launch capability gate`);
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

expect(build.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2'), 'Static build does not require the new company lifecycle selector');

if (failures.length) {
  console.error(`Pre-launch recruiting verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Pre-launch recruiting verified: all Sulandra company workspaces can recruit, exact employer identity follows every application, and unapproved provider operations remain disabled.');
