import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'api/src/employee360-enterprise-gap-routes.ts',
  'prisma/migrations/20260806222000_employee360_enterprise_gap_controls/migration.sql',
  'public/assets/admin-employee360-enterprise-controls.js',
  'public/assets/employee360-enterprise-self-service.js',
];

for (const file of requiredFiles) {
  const content = await readFile(path.join(root, file), 'utf8');
  if (!content.trim()) throw new Error(`${file} is empty`);
}

const route = await readFile(path.join(root, 'api/src/employee360-enterprise-gap-routes.ts'), 'utf8');
for (const marker of [
  '/api/admin/employee360/enterprise-gap-dashboard',
  '/api/admin/employee360/work-assignments',
  '/api/admin/employee360/time-corrections',
  '/api/admin/employee360/payroll-signoffs',
  '/api/admin/employee360/communications',
  '/api/admin/employee360/security-actions',
  '/api/admin/employee360/account-profile-changes',
  '/api/employee/me/enterprise360',
  'EmployeeAuditLedger',
  'eligibilityStatus',
  'REVOKE_ALL',
  'REQUIRE_MFA',
]) {
  if (!route.includes(marker)) throw new Error(`Enterprise gap route is missing ${marker}`);
}

const installer = await readFile(path.join(root, 'scripts/install-employee-management-platform.mjs'), 'utf8');
if (!installer.includes('registerEmployee360EnterpriseGapRoutes')) throw new Error('Enterprise gap routes are not registered');
if (!installer.includes("./employee360-enterprise-gap-routes.js")) throw new Error('Enterprise gap route import is missing');

const adminInstaller = await readFile(path.join(root, 'scripts/install-employee-management-frontend.mjs'), 'utf8');
if (!adminInstaller.includes('admin-employee360-enterprise-controls.js')) throw new Error('Admin enterprise controls asset is not installed');
const employeeInstaller = await readFile(path.join(root, 'scripts/install-employee-self-service-frontend.mjs'), 'utf8');
if (!employeeInstaller.includes('employee360-enterprise-self-service.js')) throw new Error('Employee enterprise self-service asset is not installed');

const migration = await readFile(path.join(root, 'prisma/migrations/20260806222000_employee360_enterprise_gap_controls/migration.sql'), 'utf8');
for (const table of ['EmployeeWorkAssignment','EmployeeTimeCorrection','EmployeePayrollPeriodSignoff','EmployeeUnifiedCommunication','EmployeeAccountSecurityEvent','EmployeeAccountProfileChange','EmployeeAuditLedger']) {
  if (!migration.includes(table)) throw new Error(`Migration is missing ${table}`);
}

console.log('Employee 360 enterprise gap controls verified.');
