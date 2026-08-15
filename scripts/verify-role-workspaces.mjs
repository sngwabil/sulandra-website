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

const [schema, runtime, css, directory, portal, loginAsset, loginRoot, admin, adminHtml, adminLink, installer] = await Promise.all([
  read('prisma/schema.prisma'), read('assets/role-workspace.js'), read('assets/role-workspace.css'), read('role-workspaces.html'),
  read('employee-portal-railway.js'), read('assets/employee-login-railway.js'), read('employee-login-railway.js'), read('admin-railway.js'),
  read('admin.html'), read('assets/admin-role-workspaces-link.js'), read('scripts/install-role-workspaces.mjs'),
]);

for (const role of ['ADMINISTRATOR', ...Object.keys(roleFiles)]) expect(schema.includes(`  ${role}`), `Prisma UserRole is missing ${role}`);
for (const [role, file] of Object.entries(roleFiles)) {
  const html = await read(file);
  expect(html.includes(`data-role-workspace="${role}"`), `${file} is not bound to ${role}`);
  expect(html.includes('/assets/role-workspace.js?v=20260815-role-workspaces-1'), `${file} does not load the shared role workspace runtime`);
  expect(runtime.includes(`"${role}"`) && runtime.includes(`/${file}`), `Role workspace runtime is missing ${role} → ${file}`);
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
expect(portal.includes('const executiveAdminRoles = new Set(["ADMINISTRATOR"]);'), 'Employee Portal still redirects CEO or DOO into owner admin.html');
for (const source of [loginAsset, loginRoot]) {
  expect(source.includes('function landingForRole(role)'), 'Employee login lacks role-specific executive landing');
  expect(source.includes('if (role === "ADMINISTRATOR") return "admin.html";'), 'Administrator login no longer lands on owner Admin');
  expect(source.includes('if (role === "DOO") return "doo.html";'), 'DOO login does not land on doo.html');
  expect(source.includes('if (role === "CEO") return "ceo.html";'), 'CEO login does not land on ceo.html');
}
expect(admin.includes('role !== "ADMINISTRATOR"') && admin.includes('role === "DOO" ? "doo.html"'), 'admin.html controller is not owner-only');
expect(adminHtml.includes('/assets/admin-role-workspaces-link.js?v=20260815-role-workspaces-1'), 'Admin portal does not publish Role Workspaces navigation');
expect(adminLink.includes('adminRoleWorkspacesLink') && adminLink.includes('/role-workspaces.html'), 'Admin Role Workspaces link runtime is incomplete');
expect(installer.includes('Owner-only Admin main-page guard was not installed') && installer.includes('Manage My Home Team') === false, 'Role workspace installer guard is missing or incorrectly duplicates workspace content');

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
console.log('Role workspaces verified: all 15 employee/leadership roles have dedicated HTML, Home Manager has assigned-home team operations, DOO has every separate administrative HTML except owner admin.html, CEO/DOO have dedicated landings, and Owner Admin can preview every role workspace.');
