import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checks = [];

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function expect(label, condition) {
  checks.push(label);
  if (!condition) failures.push(label);
}

const workflow = await read('DEVELOPMENT_WORKFLOW.md');
expect('primary branch documented', workflow.includes('feature/spire-ehr-platform'));
expect('static/backend separation documented', workflow.includes('Sulandra Static Website') && workflow.includes('sulandra-website — backend API'));

const permissions = await read('api/src/employee-360-permissions.ts');
expect('enterprise owner permission profile', permissions.includes('ENTERPRISE_OWNER') && permissions.includes('MANAGE_ACCESS_GRANTS'));
expect('role-scoped access profiles', ['HR_FULL','ADMIN_GLOBAL','PROGRAM_MANAGER','HOUSE_MANAGER','SCHEDULER','EDUCATION_MANAGER','AUDITOR_READ_ONLY'].every((value) => permissions.includes(value)));
expect('location scope enforcement', permissions.includes("scopeType === 'LOCATION'") && permissions.includes('TimeAttendanceLocationAssignment'));
expect('employee scope enforcement', permissions.includes("scopeType === 'EMPLOYEE'") && permissions.includes('policy.employeeId === target.id'));
expect('confidential document classifications', ['HR_CONFIDENTIAL','MEDICAL','BACKGROUND','DISCIPLINARY','IDENTITY','COMPENSATION'].every((value) => permissions.includes(value)));
expect('owner write protection', permissions.includes('The enterprise owner account cannot be managed by another user'));
expect('authorization allow and deny logging', permissions.includes('Employee360AccessEvent') && permissions.includes("'ALLOW'") && permissions.includes("'DENY'"));
expect('approved employee self-service endpoint', permissions.includes('/api/employee/me/360'));
expect('server response masking', permissions.includes('maskEmployee') && permissions.includes('VIEW_PRIVATE_PROFILE') && permissions.includes('VIEW_HR_NOTES'));

const selfServiceRoutes = await read('api/src/employee-self-service-routes.ts');
expect('employee-approved download route', selfServiceRoutes.includes('/api/employee/me/documents/:documentId/download'));
expect('self downloads require employeeVisible', selfServiceRoutes.includes('employeeVisible') && selfServiceRoutes.includes('auth.userId'));

const installer = await read('scripts/install-employee-management-platform.mjs');
const permissionRegisterAt = installer.indexOf('registerEmployee360Permissions');
const managementRegisterAt = installer.lastIndexOf('registerEmployeeManagementRoutes');
expect('permission middleware registered before management routes', permissionRegisterAt >= 0 && managementRegisterAt > permissionRegisterAt);
expect('self-service routes registered', installer.includes('registerEmployeeSelfServiceRoutes'));

const routeFix = await read('scripts/fix-employee-management-types.mjs');
expect('document sensitivity persisted by management routes', routeFix.includes('employeeVisible') && routeFix.includes('sensitivity'));
expect('scoped management roles admitted to protected middleware', ['HOUSE_MANAGER','SCHEDULER','AUDITOR','DELEGATING_NURSE'].every((value) => routeFix.includes(value)));

const permissionFix = await read('scripts/fix-employee-360-permissions.mjs');
expect('restricted profile fields preserved', permissionFix.includes('Preserve fields outside the actor') && permissionFix.includes('profileSnapshot'));
expect('permission scripts resolve repository root safely', permissionFix.includes('import.meta.url') && !permissionFix.includes('process.cwd'));

const adminPermissions = await read('assets/admin-employee-permissions.js');
expect('permission-aware Employee 360 frontend', adminPermissions.includes('Scoped management access') && adminPermissions.includes('allowedDocumentSensitivities'));
expect('owner access grant controls', adminPermissions.includes('employee360GrantForm') && adminPermissions.includes('Create Access Grant'));
expect('unauthorized tabs and fields hidden', adminPermissions.includes('enforceTabs') && adminPermissions.includes('enforceOverview'));

const employeeSelfService = await read('assets/employee-self-service-records.js');
expect('employee self-service frontend', employeeSelfService.includes('My Employee File') && employeeSelfService.includes('/api/employee/me/360'));

const migrationPath = 'prisma/migrations/20260806121500_employee_360_scoped_permissions/migration.sql';
expect('versioned permission migration exists', await exists(path.join(root, migrationPath)));
if (await exists(path.join(root, migrationPath))) {
  const migration = await read(migrationPath);
  expect('migration protects fresh databases', migration.includes("to_regclass('public.\"EmployeeDocument\"')"));
  expect('active duplicate grant prevention', migration.includes('Employee360AccessGrant_active_unique_idx'));
}

// Admin is now deliberately split. The compatibility router only selects an
// owner or company-Operations bootstrap; each bootstrap owns its own Employee
// 360 loader. Operations has a small dedicated shell because the preserved
// owner shell must remain unchanged.
const contextRouter = await read('assets/admin-company-context.js');
const ownerContext = await read('assets/admin-owner-context.js');
const operationsContext = await read('assets/admin-operations-context.js');
const ownerShell = await read('assets/admin-shell.js');
const operationsShell = await read('assets/admin-operations-shell.js');
for (const [label,context] of [['owner',ownerContext],['Operations',operationsContext]]) {
  const permissionAssetAt = context.indexOf("'admin-employee-permissions'");
  const managementAssetAt = context.indexOf("'admin-employee-management'");
  expect(`${label} Admin loader owns Employee 360 scripts`, context.includes('loadEmployeeSuite') && permissionAssetAt >= 0 && managementAssetAt > permissionAssetAt);
}
expect('Admin context router selects owner and Operations loaders', contextRouter.includes('admin-owner-context.js') && contextRouter.includes('admin-operations-context.js'));
expect('owner Admin shell preserves Employee 360 module host', ownerShell.includes("employee.id = 'module-employees'") && ownerShell.includes('ensureModuleHosts()'));
expect('Operations shell creates Employee 360 module host', operationsShell.includes("employee.id = 'module-employees'") && operationsShell.includes('ensureModuleHosts()'));

const distOwnerAdmin = path.join(root, 'dist-web', 'admin.html');
const distOperationsAdmin = path.join(root, 'dist-web', 'admin-operations.html');
if (await exists(distOwnerAdmin) && await exists(distOperationsAdmin)) {
  const [ownerHtml,operationsHtml,publishedRouter,publishedOwnerContext,publishedOperationsContext,publishedOwnerShell,publishedOperationsShell] = await Promise.all([
    readFile(distOwnerAdmin, 'utf8'),
    readFile(distOperationsAdmin, 'utf8'),
    read('dist-web/assets/admin-company-context.js'),
    read('dist-web/assets/admin-owner-context.js'),
    read('dist-web/assets/admin-operations-context.js'),
    read('dist-web/assets/admin-shell.js'),
    read('dist-web/assets/admin-operations-shell.js'),
  ]);
  for (const [label,html] of [['owner',ownerHtml],['Operations',operationsHtml]]) {
    expect(`dist ${label} Admin loads context router`, html.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2'));
  }
  expect('dist context router selects both Admin bootstraps', publishedRouter.includes('admin-owner-context.js') && publishedRouter.includes('admin-operations-context.js'));
  expect('dist owner shell includes Employee 360 module', publishedOwnerShell.includes("employee.id = 'module-employees'"));
  expect('dist Operations shell includes Employee 360 module', publishedOperationsShell.includes("employee.id = 'module-employees'"));
  for (const [label,context] of [['owner',publishedOwnerContext],['Operations',publishedOperationsContext]]) {
    const publishedPermissionAt = context.indexOf("'admin-employee-permissions'");
    const publishedManagementAt = context.indexOf("'admin-employee-management'");
    expect(`dist ${label} loader loads permission script before management script`, publishedPermissionAt >= 0 && publishedManagementAt > publishedPermissionAt);
  }
}

const distPortal = path.join(root, 'dist-web', 'employee-portal.html');
if (await exists(distPortal)) {
  const html = await readFile(distPortal, 'utf8');
  expect('dist employee portal includes self-service records', html.includes('/assets/employee-self-service-records.js'));
}

if (failures.length) {
  console.error(`Employee 360 permission verification failed (${failures.length}/${checks.length}):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Employee 360 permission verification passed (${checks.length} checks) using separate owner/Operations Admin bootstrap ownership.`);
