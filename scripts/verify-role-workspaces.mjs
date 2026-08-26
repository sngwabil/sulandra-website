import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const expect = (condition, label) => { if (!condition) failures.push(label); };
const read = async (relative) => { try { return await readFile(path.join(root, relative), 'utf8'); } catch { failures.push(`Missing ${relative}`); return ''; } };

const roleFiles = Object.freeze({
  PROGRAM_MANAGER: 'program-manager.html', AUDITOR: 'auditor.html', DSP: 'dsp.html', DELEGATING_NURSE: 'delegating-nurse.html',
  LPN: 'lpn.html', RN: 'rn.html', HOUSE_MANAGER: 'home-manager.html', HR_MANAGER: 'hr-manager.html', SCHEDULER: 'scheduler.html',
  BILLING_SPECIALIST: 'billing-specialist.html', ADMINISTRATIVE_ASSISTANT: 'administrative-assistant.html', CEO: 'ceo.html', DOO: 'doo.html',
  DRIVER: 'driver.html', GENERAL: 'general-employee.html',
});

const [schema, runtime, css, directory, portal, loginAsset, admin, ownerHtml, operationsHtml, router, operationsContext, adminLink, installer] = await Promise.all([
  read('prisma/schema.prisma'), read('assets/role-workspace.js'), read('assets/role-workspace.css'), read('role-workspaces.html'),
  read('employee-portal-railway.js'), read('assets/employee-login-railway.js'), read('admin-railway.js'),
  read('admin.html'), read('admin-operations.html'), read('assets/admin-company-context.js'), read('assets/admin-operations-context.js'),
  read('assets/admin-role-workspaces-link.js'), read('scripts/install-role-workspaces.mjs'),
]);

for (const role of ['ADMINISTRATOR', ...Object.keys(roleFiles)]) expect(schema.includes(`  ${role}`), `Prisma UserRole is missing ${role}`);
for (const [role, file] of Object.entries(roleFiles)) {
  const html = await read(file);
  expect(html.includes(`data-role-workspace="${role}"`), `${file} is not bound to ${role}`);
  expect(html.includes('/assets/role-workspace.js?v=20260815-role-workspaces-1'), `${file} does not load the shared role workspace runtime`);
  const runtimeHasRole = runtime.includes(`${role}:`) || runtime.includes(`"${role}"`) || runtime.includes(`'${role}'`);
  expect(runtimeHasRole && runtime.includes(`/${file}`), `Role workspace runtime is missing ${role} → ${file}`);
}

expect(directory.includes('data-role-workspace-directory="true"'), 'Owner role-workspace directory is not Admin-only runtime bound');
expect(runtime.includes('actualRole !== expectedRole && actualRole !== ADMIN_ROLE'), 'Role workspaces do not enforce matching role or Owner Administrator preview');
expect(runtime.includes('Manage My Home Team') && runtime.includes('/scls-residential.html#staff'), 'Home Manager workspace does not expose assigned-home staff management');
expect(runtime.includes('All Administrative HTML Workspaces — Owner Admin excluded'), 'DOO workspace does not expose the complete separate administrative HTML collection');
const adminListStart = runtime.indexOf('const adminHtml = [');
const adminListEnd = runtime.indexOf('];', adminListStart);
expect(adminListStart >= 0 && adminListEnd > adminListStart, 'Administrative HTML catalog is missing');
if (adminListStart >= 0 && adminListEnd > adminListStart) expect(!runtime.slice(adminListStart, adminListEnd).includes('/admin.html'), 'DOO administrative HTML catalog incorrectly exposes owner admin.html');
expect(runtime.includes('ownerMain: "/admin.html"') && runtime.includes('adminMainIsRoleWorkspace: false'), 'Owner Administrator main-page separation marker is missing');
expect(css.includes('.rw-card-grid') && css.includes('.rw-preview'), 'Shared role workspace styling is incomplete');

expect(portal.includes('const roleWorkspaceRoutes = new Map(['), 'Employee Portal does not publish role workspace routes');
expect(portal.includes('employeeRoleWorkspaceLauncher') && portal.includes('employeeRoleWorkspaceNav'), 'Employee Portal does not add a role-specific launcher and navigation tab');
expect(portal.includes('const executiveAdminRoles = new Set(["ADMINISTRATOR"]);'), 'Employee Portal still treats CEO or DOO as implicit owner Admin');
for (const marker of ['username.includes("@")','portal: "EMPLOYEE"','safeReturnTarget() || "/employee-portal.html"']) expect(loginAsset.includes(marker), `Employee Login does not preserve username → Employee Portal behavior: ${marker}`);
for (const forbidden of ['function landingForRole(role)','return "admin.html"','return "doo.html"','return "ceo.html"']) expect(!loginAsset.includes(forbidden), `Employee Login still contains obsolete privileged landing: ${forbidden}`);

expect(admin.includes('/\\/admin\\.html$/i.test(location.pathname)') && admin.includes('role !== "ADMINISTRATOR"'), 'admin.html controller is not owner-only');
expect(admin.includes('/\\/admin-operations\\.html$/i.test(location.pathname)') && admin.includes('["ADMINISTRATOR", "PROGRAM_MANAGER", "HR_MANAGER", "CEO", "DOO"]'), 'Company Operations controller does not enforce the authorized management-role set');
expect(ownerHtml.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2'), 'Owner Admin does not load the canonical context router');
expect(operationsHtml.includes('/assets/admin-company-context.js?v=20260809-admin-company-context-2'), 'Company Operations does not load the canonical context router');
expect(!ownerHtml.includes('/assets/admin-role-workspaces-link.js'), 'Owner command center must not receive a new Role Workspaces navigation injection');
expect(!operationsHtml.includes('/assets/admin-role-workspaces-link.js'), 'Operations HTML must not bypass its canonical registry with a Role Workspaces injector');
expect(router.includes('admin-owner-context.js') && router.includes('admin-operations-context.js'), 'Admin context router does not preserve owner/Operations separation');
expect(
  operationsContext.includes("key:'role-workspaces'")
    && operationsContext.includes("label:'Roles, Permissions & Workspaces'")
    && operationsContext.includes("href:'/role-workspaces.html'"),
  'Company Operations System Administration registry does not include Roles, Permissions & Workspaces',
);
expect(adminLink.includes('adminRoleWorkspacesTopLink') && adminLink.includes('/role-workspaces.html'), 'Retained Role Workspaces compatibility runtime is incomplete');
expect(installer.includes("await patch('assets/admin-operations-context.js'"), 'Role workspace installer does not keep the Operations registry aligned');
expect(installer.includes('Owner/Operations split guard was not installed'), 'Role workspace installer does not enforce the owner/Operations role guards');
expect(installer.includes('do not patch employee-login-railway.js'), 'Role workspace installer does not explicitly preserve the separate Employee login contract');
expect(!installer.includes("await patch('tests/production-role-uat.spec.mjs'"), 'Role workspace installer must not rewrite the production UAT test into obsolete landing behavior');

for (const relative of ['assets/role-workspace.js', 'assets/admin-role-workspaces-link.js', 'scripts/install-role-workspaces.mjs']) {
  try {
    await access(path.join(root, relative));
    const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(`${relative} syntax check failed: ${(result.stderr || result.stdout || '').trim()}`);
  } catch {}
}

if (failures.length) {
  console.error('Role workspace verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Role workspaces verified: all 15 employee/leadership roles retain dedicated Employee-side HTML workspaces, Employee Login never redirects a management role into Admin, the owner command center stays owner-only, and authorized management roles use the separate Admin Operations entry after Admin sign-in.');