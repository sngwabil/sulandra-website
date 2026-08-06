import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checks = [];
const exists = async relativePath => { try { await access(path.join(root, relativePath)); return true; } catch { return false; } };
const read = relativePath => readFile(path.join(root, relativePath), 'utf8');
const expect = (label, condition) => { checks.push(label); if (!condition) failures.push(label); };

const backendPath = 'api/src/employee-compliance-routes.ts';
expect('compliance backend exists', await exists(backendPath));
if (await exists(backendPath)) {
  const source = await read(backendPath);
  expect('requirement catalog schema', source.includes('EmployeeComplianceRequirement') && source.includes("'DOCUMENT' | 'EDUCATION' | 'ATTESTATION' | 'MANUAL'"));
  expect('automatic assignment reconciliation', source.includes('requirementApplies') && source.includes('upsertAssignment') && source.includes('evaluateAssignment'));
  expect('document evidence reconciliation', source.includes('latestDocument') && source.includes('reviewStatus'));
  expect('education evidence and auto assignment', source.includes('latestEducation') && source.includes('ensureEducationAssignment'));
  expect('employee attestation evidence', source.includes('EmployeeComplianceAttestation') && source.includes('/attest'));
  expect('employee secure document submission', source.includes('/upload') && source.includes('MAX_DOCUMENT_BYTES') && source.includes("'PENDING'"));
  expect('daily timezone scheduler', source.includes('runScheduledOrganizations') && source.includes('localClock') && source.includes('scanHour'));
  expect('multi-instance advisory lock', source.includes('pg_try_advisory_lock') && source.includes('pg_advisory_unlock'));
  expect('reminder deduplication', source.includes('dedupeKey') && source.includes('EmployeeComplianceReminder_dedupe_unique'));
  expect('retry limit', source.includes('attempts') && source.includes('>= 3'));
  expect('employee manager and HR escalation', ['SUPERVISOR','LOCATION_MANAGER','HR'].every(value => source.includes(value)));
  expect('branded SMTP reminder delivery', source.includes('Sulandra Health Human Resources Department') && source.includes('createTransport'));
  expect('location-scoped manager access', source.includes('scopedEmployeeIds') && source.includes('TimeAttendanceLocationAssignment'));
  expect('owner HR admin requirement control', source.includes('requireRequirementManager') && source.includes('OWNER_EMAIL'));
  expect('manual run and audit history endpoints', source.includes('/engine/run') && source.includes('/runs') && source.includes('/reminders'));
  expect('manual exemptions and overrides', source.includes('CLEAR_EXEMPTION') && source.includes('MARK_COMPLETE') && source.includes('CHANGE_DUE_DATE'));
}

const migrationPath = 'prisma/migrations/20260806131500_employee_compliance_engine/migration.sql';
expect('compliance migration exists', await exists(migrationPath));
if (await exists(migrationPath)) {
  const migration = await read(migrationPath);
  expect('all compliance tables migrated', ['EmployeeComplianceSettings','EmployeeComplianceRequirement','EmployeeComplianceAssignment','EmployeeComplianceAttestation','EmployeeComplianceReminder','EmployeeComplianceRun'].every(value => migration.includes(value)));
  expect('database reminder dedupe index', migration.includes('EmployeeComplianceReminder_dedupe_unique'));
  expect('document review workflow columns', migration.includes('reviewStatus') && migration.includes('PENDING') && migration.includes('APPROVED') && migration.includes('REJECTED'));
  expect('fresh database document guard', migration.includes("to_regclass('public.\"EmployeeDocument\"')"));
}

const installer = await read('scripts/install-employee-management-platform.mjs');
expect('compliance routes wired into backend', installer.includes('registerEmployeeComplianceRoutes'));
expect('compliance registration occurs before careers', installer.includes('${selfServiceRegister}\\n${complianceRegister}\\n\\n${careersRegister}'));

const adminAsset = await read('assets/admin-employee-compliance.js');
expect('admin compliance center exists', adminAsset.includes('Employee Compliance Center') && adminAsset.includes('Run Compliance Engine'));
expect('requirement builder frontend', adminAsset.includes('complianceRequirementForm') && adminAsset.includes('Create Requirement'));
expect('per-employee compliance tab', adminAsset.includes('data-tab-button="compliance"') && adminAsset.includes('loadEmployeeCompliance'));
expect('document approval frontend', adminAsset.includes('Approve Document') && adminAsset.includes('/review'));
expect('reminder settings frontend', adminAsset.includes('Automatic Reminder Settings') && adminAsset.includes('scanHour'));

const selfAsset = await read('assets/employee-compliance-self-service.js');
expect('employee compliance dashboard exists', selfAsset.includes('My Compliance') && selfAsset.includes('/api/employee/me/compliance'));
expect('employee upload action exists', selfAsset.includes('Submit for HR Review') && selfAsset.includes('/upload'));
expect('employee attestation action exists', selfAsset.includes('Sign and Attest') && selfAsset.includes('/attest'));
expect('employee education action exists', selfAsset.includes('Open Learning Center'));

const adminInstaller = await read('scripts/install-employee-management-frontend.mjs');
expect('admin compliance asset published', adminInstaller.includes('/assets/admin-employee-compliance.js'));
const selfInstaller = await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee compliance asset published', selfInstaller.includes('/assets/employee-compliance-self-service.js'));

const distAdminPath = 'dist-web/admin.html';
if (await exists(distAdminPath)) {
  const html = await read(distAdminPath);
  const managementAt = html.indexOf('/assets/admin-employee-management.js');
  const complianceAt = html.indexOf('/assets/admin-employee-compliance.js');
  expect('generated admin loads compliance after Employee 360 management', managementAt >= 0 && complianceAt > managementAt);
}
const distEmployeePath = 'dist-web/employee-portal.html';
if (await exists(distEmployeePath)) {
  const html = await read(distEmployeePath);
  expect('generated employee portal loads compliance self-service', html.includes('/assets/employee-compliance-self-service.js'));
}

if (failures.length) {
  console.error(`Employee 360 compliance verification failed (${failures.length}/${checks.length}):`);
  failures.forEach(failure => console.error(` - ${failure}`));
  process.exit(1);
}
console.log(`Employee 360 compliance verification passed (${checks.length} checks).`);
