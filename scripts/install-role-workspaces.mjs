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
  if (!source.includes('const executiveAdminRoles = new Set(["ADMINISTRATOR"]);')) throw new Error('Employee Portal still routes CEO/DOO to owner Admin');
  if (!source.includes('employeeRoleWorkspaceLauncher') || !source.includes('employeeRoleWorkspaceNav')) throw new Error('Employee Portal role workspace tab was not installed');
  return source;
});

function patchLogin(source) {
  if (!source.includes('function landingForRole(role)')) {
    const anchor = '  const ADMIN_LANDING_ROLES = new Set(["ADMINISTRATOR", "CEO", "DOO"]);\n';
    if (!source.includes(anchor)) throw new Error('Employee login privileged-role anchor changed');
    source = source.replace(anchor, `${anchor}  function landingForRole(role) {\n    if (role === "ADMINISTRATOR") return "admin.html";\n    if (role === "DOO") return "doo.html";\n    if (role === "CEO") return "ceo.html";\n    return "employee-portal.html";\n  }\n`);
  }
  source = source.replace('window.location.assign(requestedTarget || (ADMIN_LANDING_ROLES.has(role) ? "admin.html" : "employee-portal.html"));','window.location.assign(requestedTarget || landingForRole(role));');
  if (!source.includes('if (role === "DOO") return "doo.html";') || !source.includes('if (role === "CEO") return "ceo.html";')) throw new Error('Executive role workspace login routing was not installed');
  return source;
}
await patch('assets/employee-login-railway.js', patchLogin);
await patch('employee-login-railway.js', patchLogin);

await patch('admin-railway.js', (source) => {
  const ownerOnly = 'if (!session || role !== "ADMINISTRATOR") { const destination = role === "DOO" ? "doo.html" : role === "CEO" ? "ceo.html" : "employee-portal.html"; location.replace(destination); return; }';
  source = source.replace('if (!session || !["ADMINISTRATOR", "DOO"].includes(role)) { location.replace("employee-portal.html"); return; }', ownerOnly);
  source = source.replace('if (!session || !["ADMINISTRATOR", "CEO", "DOO"].includes(role)) { location.replace("employee-portal.html"); return; }', ownerOnly);
  if (!source.includes('role !== "ADMINISTRATOR"') || !source.includes('role === "DOO" ? "doo.html"')) throw new Error('Owner-only Admin main-page guard was not installed');
  return source;
});

await patch('assets/admin-company-context.js', (source) => {
  // The canonical Admin IA owns Role Workspaces inside System Administration.
  // Older source layouts can still be upgraded, but canonical layouts must not
  // receive a second top/side/drawer navigation injector.
  if (source.includes("key:'role-workspaces'") && source.includes("href:'/role-workspaces.html'")) return source;
  const legacyAnchor = "      {key:'company-files',label:'Company Files',sub:'Official Records',kind:'route',href:'/company-documents.html'},\n";
  if (!source.includes(legacyAnchor)) throw new Error('Canonical Admin Role Workspaces registry entry is missing');
  const roleTab = "      {key:'role-workspaces',label:'Role Workspaces',sub:'Preview Role HTML',kind:'route',href:'/role-workspaces.html'},\n";
  return source.replace(legacyAnchor, `${legacyAnchor}${roleTab}`);
});

await patch('admin.html', (html) => {
  // Remove the retired Role Workspaces navigation injector if an older build
  // left it behind. The route is now rendered by the canonical Admin registry.
  html = html.replace(/\s*<script src="\/assets\/admin-role-workspaces-link\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  const context = '<script src="/assets/admin-company-context.js?v=20260809-admin-company-context-2"></script>';
  if (!html.includes(context)) throw new Error('Canonical Admin company-context marker changed');
  return html;
});

await patch('tests/production-role-uat.spec.mjs', (source) => {
  const oldLogin = `  if(p.executive){await expect(page).toHaveURL(/\\/admin\\.html(?:#.*)?$/);await expect(page.locator('#topModuleNav')).toBeVisible();}\n  else{await expect(page).toHaveURL(/\\/employee-portal\\.html$/);await expect(page.locator('body')).toHaveAttribute('data-role-uat-ready','true');await expect(page.locator('body')).toHaveAttribute('data-authenticated-role',p.role);}`;
  const newLogin = `  if(p.role==='ADMINISTRATOR'){await expect(page).toHaveURL(/\\/admin\\.html(?:#.*)?$/);await expect(page.locator('#topModuleNav')).toBeVisible();}\n  else if(p.role==='DOO'){await expect(page).toHaveURL(/\\/doo\\.html$/);await expect(page.locator('body')).toHaveAttribute('data-role-workspace-ready','true');await expect(page.locator('body')).toHaveAttribute('data-role-workspace-role','DOO');}\n  else if(p.role==='CEO'){await expect(page).toHaveURL(/\\/ceo\\.html$/);await expect(page.locator('body')).toHaveAttribute('data-role-workspace-ready','true');await expect(page.locator('body')).toHaveAttribute('data-role-workspace-role','CEO');}\n  else{await expect(page).toHaveURL(/\\/employee-portal\\.html$/);await expect(page.locator('body')).toHaveAttribute('data-role-uat-ready','true');await expect(page.locator('body')).toHaveAttribute('data-authenticated-role',p.role);}`;
  if (source.includes(oldLogin)) source = source.replace(oldLogin, newLogin);

  source = source.replace("  else if(key==='houseManager'){await absent(page,'#employeeCompanyDocumentsLauncher');await open(page,'#employeeSclsOperationsLauncher','/scls-residential.html','SCLS Residential Operations');}","  else if(key==='houseManager'){await absent(page,'#employeeCompanyDocumentsLauncher');await open(page,'#employeeRoleWorkspaceLauncher','/home-manager.html','Home Manager');await expect(page.getByRole('link',{name:'Manage My Home Team'})).toBeVisible();}");

  const oldExecutive = `  else if(p.executive){const link=page.locator('#topModuleNav a[href="/spire-admin.html"]').first();await expect(link).toBeVisible();await link.click();await expect(page).toHaveURL(/\\/spire-admin\\.html$/);await expect(page).toHaveTitle(/SPIRE/i);}`;
  const newExecutive = `  else if(key==='administrator'){const link=page.locator('#topModuleNav a[href="/spire-admin.html"]').first();await expect(link).toBeVisible();await link.click();await expect(page).toHaveURL(/\\/spire-admin\\.html$/);await expect(page).toHaveTitle(/SPIRE/i);}\n  else if(key==='doo'){await expect(page.locator('a.rw-card[href="/admin.html"]')).toHaveCount(0);const link=page.locator('a.rw-card[href="/spire-admin.html"]').first();await expect(link).toBeVisible();await link.click();await expect(page).toHaveURL(/\\/spire-admin\\.html$/);}\n  else if(key==='ceo'){await expect(page.locator('a.rw-card[href="/admin.html"]')).toHaveCount(0);const link=page.locator('a.rw-card[href="/enterprise-analytics.html"]').first();await expect(link).toBeVisible();}`;
  if (source.includes(oldExecutive)) source = source.replace(oldExecutive, newExecutive);
  return source;
});

console.log('Role workspaces installed: every employee role has a dedicated HTML workspace, Home Manager gets a home-team tab, CEO/DOO use dedicated executive workspaces, and Owner Admin exposes Role Workspaces only through the canonical System Administration registry.');
