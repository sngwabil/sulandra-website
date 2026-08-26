import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function patch(relative, transform) {
  const target = path.join(root, relative);
  const before = await readFile(target, 'utf8');
  const after = transform(before);
  if (after === before) return false;
  await writeFile(target, after, 'utf8');
  return true;
}

const routesBlock = `  const roleWorkspaceRoutes = new Map([\n    ["PROGRAM_MANAGER", ["Program Manager", "/program-manager.html"]],\n    ["AUDITOR", ["Auditor", "/auditor.html"]],\n    ["DSP", ["DSP", "/dsp.html"]],\n    ["DELEGATING_NURSE", ["Delegating Nurse", "/delegating-nurse.html"]],\n    ["LPN", ["LPN", "/lpn.html"]],\n    ["RN", ["RN", "/rn.html"]],\n    ["HOUSE_MANAGER", ["Home Manager", "/home-manager.html"]],\n    ["HR_MANAGER", ["HR Manager", "/hr-manager.html"]],\n    ["SCHEDULER", ["Scheduler", "/scheduler.html"]],\n    ["BILLING_SPECIALIST", ["Billing Specialist", "/billing-specialist.html"]],\n    ["ADMINISTRATIVE_ASSISTANT", ["Administrative Assistant", "/administrative-assistant.html"]],\n    ["CEO", ["CEO", "/ceo.html"]],\n    ["DOO", ["Director of Operations", "/doo.html"]],\n    ["DRIVER", ["Driver", "/driver.html"]],\n    ["GENERAL", ["Role Workspace", "/general-employee.html"]],\n  ]);\n`;

await patch('employee-portal-railway.js', (source) => {
  // The Employee Portal never converts a management role into an Admin login.
  // Dedicated role workspaces remain employee-side destinations; Admin access is
  // exposed separately by the cross-workspace Admin sign-in door.
  source = source.replace('  const executiveAdminRoles = new Set(["ADMINISTRATOR", "CEO", "DOO"]);','  const executiveAdminRoles = new Set(["ADMINISTRATOR"]);');
  if (!source.includes('const roleWorkspaceRoutes = new Map([')) {
    const anchor = '  const schedulingRoles = new Set(["SCHEDULER", "PROGRAM_MANAGER"]);\n';
    if (!source.includes(anchor)) throw new Error('Employee Portal scheduling-role anchor changed');
    source = source.replace(anchor, `${anchor}${routesBlock}`);
  }
  if (!source.includes('function installRoleWorkspaceLauncher(session)')) {
    const anchor = '  function installApplicationLaunchers(session) {';
    if (!source.includes(anchor)) throw new Error('Employee Portal launcher anchor changed');
    const helper = `  function installRoleWorkspaceLauncher(session) {\n    const role = String(session.role || "").toUpperCase();\n    const workspace = roleWorkspaceRoutes.get(role);\n    if (!workspace) return;\n    const [label, href] = workspace;\n    const quick = document.querySelector(".page-hero .quick-actions");\n    if (quick && !document.getElementById("employeeRoleWorkspaceLauncher")) {\n      quick.appendChild(launcher(label, href, "Open the " + label + " workspace", "employeeRoleWorkspaceLauncher"));\n    }\n    appendNavLink("employeeRoleWorkspaceNav", label, href);\n  }\n\n`;
    source = source.replace(anchor, `${helper}${anchor}`);
  }
  const roleAnchor = '    const role = String(session.role || "").toUpperCase();\n\n    quick.appendChild(launcher("Workforce"';
  if (!source.includes('installRoleWorkspaceLauncher(session);') && source.includes(roleAnchor)) source = source.replace(roleAnchor,'    const role = String(session.role || "").toUpperCase();\n    installRoleWorkspaceLauncher(session);\n\n    quick.appendChild(launcher("Workforce"');
  if (!source.includes('roleWorkspaceRoutes: Object.fromEntries(roleWorkspaceRoutes)')) source = source.replace('    executiveAdminRoles: [...executiveAdminRoles],\n','    executiveAdminRoles: [...executiveAdminRoles],\n    roleWorkspaceRoutes: Object.fromEntries(roleWorkspaceRoutes),\n');
  if (!source.includes('const executiveAdminRoles = new Set(["ADMINISTRATOR"]);')) throw new Error('Employee Portal still treats CEO/DOO as an implicit owner-Admin redirect');
  if (!source.includes('employeeRoleWorkspaceLauncher') || !source.includes('employeeRoleWorkspaceNav')) throw new Error('Employee Portal role workspace tab was not installed');
  return source;
});

// IMPORTANT: do not patch employee-login-railway.js here. The canonical login
// runtime deliberately accepts only an employee username and always enters the
// Employee Portal. Admin email login is owned exclusively by admin-login.html.

await patch('admin-railway.js', (source) => {
  source = source.replace(
    'const OPERATIONS_ROLES = new Set(["ADMINISTRATOR", "HR_MANAGER", "CEO", "DOO"]);',
    'const OPERATIONS_ROLES = new Set(["ADMINISTRATOR", "PROGRAM_MANAGER", "HR_MANAGER", "CEO", "DOO"]);'
  );
  const modernOperationsController = source.includes('const IS_OPERATIONS = /\\/admin-operations\\.html$/i.test(location.pathname);')
    && source.includes('const OPERATIONS_ROLES = new Set(["ADMINISTRATOR", "PROGRAM_MANAGER", "HR_MANAGER", "CEO", "DOO"]);')
    && source.includes('if (IS_OPERATIONS) {')
    && source.includes('OPERATIONS_ROLES.has(role)');
  if (modernOperationsController) return source;

  const legacyOwnerOnly = 'if (!session || role !== "ADMINISTRATOR") { const destination = role === "DOO" ? "doo.html" : role === "CEO" ? "ceo.html" : "employee-portal.html"; location.replace(destination); return; }';
  const legacyMixed = 'if (!session || !["ADMINISTRATOR", "DOO"].includes(role)) { location.replace("employee-portal.html"); return; }';
  const legacyExecutive = 'if (!session || !["ADMINISTRATOR", "CEO", "DOO"].includes(role)) { location.replace("employee-portal.html"); return; }';
  const splitGuard = 'if (!session) { location.replace("employee-login.html"); return; }\n      if (/\\/admin\\.html$/i.test(location.pathname) && role !== "ADMINISTRATOR") { location.replace("admin-operations.html"); return; }\n      if (/\\/admin-operations\\.html$/i.test(location.pathname) && !["ADMINISTRATOR", "PROGRAM_MANAGER", "HR_MANAGER", "CEO", "DOO"].includes(role)) { location.replace("employee-portal.html"); return; }';
  if (!source.includes('/\\/admin-operations\\.html$/i.test(location.pathname)')) {
    if (source.includes(legacyOwnerOnly)) source = source.replace(legacyOwnerOnly, splitGuard);
    else if (source.includes(legacyMixed)) source = source.replace(legacyMixed, splitGuard);
    else if (source.includes(legacyExecutive)) source = source.replace(legacyExecutive, splitGuard);
    else throw new Error('Admin role guard anchor changed');
  }
  if (!source.includes('/\\/admin\\.html$/i.test(location.pathname)') || !source.includes('/\\/admin-operations\\.html$/i.test(location.pathname)')) throw new Error('Owner/Operations split guard was not installed');
  return source;
});

await patch('assets/admin-operations-context.js', (source) => {
  // Role Workspaces belongs only in the Operations System Administration
  // folder. Never inject it into the parent-company owner command center.
  if (source.includes("key:'role-workspaces'") && source.includes("href:'/role-workspaces.html'")) return source;
  const legacyAnchor = "      {key:'company-files',label:'Company Files',sub:'Official Records',kind:'route',href:'/company-documents.html'},\n";
  if (!source.includes(legacyAnchor)) throw new Error('Operations Role Workspaces registry entry is missing');
  const roleTab = "      {key:'role-workspaces',label:'Role Workspaces',sub:'Preview Role HTML',kind:'route',href:'/role-workspaces.html'},\n";
  return source.replace(legacyAnchor, `${legacyAnchor}${roleTab}`);
});

for (const page of ['admin.html','admin-operations.html']) {
  await patch(page, (html) => {
    html = html.replace(/\s*<script src="\/assets\/admin-role-workspaces-link\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
    const context = '<script src="/assets/admin-company-context.js?v=20260809-admin-company-context-2"></script>';
    if (!html.includes(context)) throw new Error(`Admin context router marker changed in ${page}`);
    return html;
  });
}

console.log('Role workspaces installed without rewriting Employee Login: every employee role stays in Employee Portal, owner Admin remains owner-only, and authorized management roles use the separate Admin Operations desktop after Admin sign-in.');