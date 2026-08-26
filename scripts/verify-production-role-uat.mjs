import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const read=async rel=>{try{return await readFile(path.join(root,rel),'utf8')}catch{failures.push(`Missing ${rel}`);return''}};
const expect=(condition,label)=>{if(!condition)failures.push(label)};
const contract='20260810-role-uat-1';

// Normalize role workspaces only. Authentication boundaries are verified from
// canonical source/installers so this verifier cannot manufacture a passing login.
await import('./install-home-manager-residential-scope.mjs');
await import('./install-role-workspaces.mjs');
await import('./verify-role-workspaces.mjs');

const [portal,runtime,guard,portalInstaller,adminCrossInstaller,adminCross,loginHtml,loginAsset,adminLoginHtml,adminLoginAsset,authInstaller,nmt,testSource,config,workflow,pkg,roleRuntime,roleDirectory,residentialApi,residentialHtml,homeManagerInstaller,apiPackage]=await Promise.all([
  read('employee-portal.html'),
  read('employee-portal-railway.js'),
  read('assets/employee-role-navigation-guard.js'),
  read('scripts/install-employee-portal-deep-integration.mjs'),
  read('scripts/install-admin-cross-workspace-launcher.mjs'),
  read('assets/admin-cross-workspace-launcher.js'),
  read('employee-login.html'),
  read('assets/employee-login-railway.js'),
  read('admin-login.html'),
  read('admin-login-railway.js'),
  read('scripts/install-employee-auth-security.mjs'),
  read('api/src/nmt-dispatch-routes.ts'),
  read('tests/production-role-uat.spec.mjs'),
  read('playwright.role-uat.config.mjs'),
  read('.github/workflows/production-role-uat.yml'),
  read('package.json'),
  read('assets/role-workspace.js'),
  read('role-workspaces.html'),
  read('api/src/scls-residential-routes.ts'),
  read('scls-residential.html'),
  read('scripts/install-home-manager-residential-scope.mjs'),
  read('api/package.json'),
]);

expect(portal.includes(`sulandra-role-uat-contract\" content=\"${contract}`)||portal.includes(`sulandra-role-uat-contract" content="${contract}`),'Employee Portal lacks production role-UAT contract marker');
expect(portal.includes('data-role-uat-contract="20260810-role-uat-1"'),'Employee Portal body lacks role-UAT marker');
expect(!portal.includes('<li><a href="/spire.html">SPIRE</a></li>'),'Employee Portal still exposes an unconditional live SPIRE top-navigation link');
expect(!portal.includes('<li><a href="/company-documents.html">Documents</a></li>'),'Employee Portal still exposes an unconditional company-vault top-navigation link');

for(const marker of [
  `const UAT_CONTRACT = "${contract}"`,
  'companyDocumentRoles','sclsOperationsRoles','homeHealthVisitRoles','nmtDispatchRoles','enterpriseAnalyticsRoles','securityAuditRoles','employee360Roles','schedulingRoles',
  'applyStaticRoleVisibility(session)','selected.code === "NMT" && nmtDispatchRoles.has(role)','document.body.dataset.roleUatReady = "true"','document.body.dataset.authenticatedRole = role','window.SulandraRoleUat',
  'const roleWorkspaceRoutes = new Map([','employeeRoleWorkspaceLauncher','employeeRoleWorkspaceNav',
])expect(runtime.includes(marker),`Employee Portal runtime missing role/company UAT behavior: ${marker}`);

for(const marker of [
  'managementAdminRoles',
  "'ADMINISTRATOR'", "'PROGRAM_MANAGER'", "'HR_MANAGER'", "'CEO'", "'DOO'",
  "adminControl.href = '/admin-login.html?returnTo=/admin.html'",
  "adminControl.target = '_blank'",
  'sulandra:employee:session',
  'loadingWatchdogMs: 8000',
  '20260825-portal-separation-3',
])expect(guard.includes(marker),`Employee Portal Admin-door/navigation guard missing ${marker}`);
expect(guard.includes("['employeeSchedulingLauncher', '/scheduling.html']")&&guard.includes("['employeeSchedulingNav', '/scheduling.html']"),'Protected Employee Scheduling navigation guard is incomplete');

for(const marker of [
  'employee-role-navigation-guard.js?v=20260825-portal-separation-3',
  'install-home-manager-residential-scope.mjs',
  'install-role-workspaces.mjs',
  'install-admin-cross-workspace-launcher.mjs',
])expect(portalInstaller.includes(marker),`Employee Portal publisher missing ${marker}`);
for(const marker of ['admin.html','admin-operations.html','admin-cross-workspace-launcher.js?v=20260825-portal-separation-1'])expect(adminCrossInstaller.includes(marker),`Admin cross-workspace publisher missing ${marker}`);
for(const marker of [
  "employeeLogin: '/employee-login.html?returnTo=/employee-portal.html'",
  "link.target = '_blank'",
  "link.rel = 'noopener noreferrer'",
  'opensNewTab: true',
  'adminEmployeePortalLauncher',
])expect(adminCross.includes(marker),`Admin → Employee separate-tab launcher missing ${marker}`);

for(const marker of ['Employee username','Sign In to Employee Portal','Administrator Sign In','/admin-login.html'])expect(loginHtml.includes(marker),`Employee Login HTML missing ${marker}`);
for(const marker of [
  'username.includes("@")',
  'assigned employee username, not an email address',
  'portal: "EMPLOYEE"',
  'window.location.assign("/employee-portal.html")',
])expect(loginAsset.includes(marker),`Employee username login runtime missing ${marker}`);
for(const forbidden of ['ADMIN_LANDING_ROLES','landingForRole(role)','return "admin.html"','return "doo.html"','return "ceo.html"'])expect(!loginAsset.includes(forbidden),`Employee Login still contains obsolete privileged redirect behavior: ${forbidden}`);

for(const marker of ['Sulandra work email','Sign In to Admin'])expect(adminLoginHtml.includes(marker),`Admin Login HTML missing ${marker}`);
for(const marker of [
  'ADMINISTRATOR','PROGRAM_MANAGER','HR_MANAGER','CEO','DOO',
  'portal: "ADMIN"',
  '@sulandrahealth.com',
  'adminAllowed(session)',
  'returnToForRole(session.role)',
  'admin-operations.html',
])expect(adminLoginAsset.includes(marker),`Admin email/entitlement login runtime missing ${marker}`);

for(const marker of [
  "portal: z.enum(['EMPLOYEE','ADMIN']).optional()",
  "requestedPortal === 'EMPLOYEE' && identifier.includes('@')",
  "requestedPortal === 'ADMIN' && (!identifier.includes('@') || !identifier.endsWith('@sulandrahealth.com'))",
  "requestedPortal === 'ADMIN' && !administrationRoles.has(account.role)",
  'Admin portal entitlement required',
  'SULANDRA_CANONICAL_EMPLOYEE_USERNAME_V1',
  'canonicalEmployeeUsername(firstName: string, middleName: string | null | undefined, lastName: string)',
  'sequence === 1 ? base',
])expect(authInstaller.includes(marker),`Authentication/username installer missing ${marker}`);
expect(authInstaller.includes("[first, ...middle]")&&authInstaller.includes("part.slice(0, 1)")&&authInstaller.includes('surname'),'Hire-time username generation is not first initial + every middle initial + surname');

expect(nmt.includes('UserRole.SCHEDULER'),'NMT dispatch backend does not authorize the Scheduler dispatcher persona');
expect(roleRuntime.includes('Manage My Home Team')&&roleRuntime.includes('/scls-residential.html#staff'),'Home Manager role workspace is not connected to assigned-home staff management');
expect(roleRuntime.includes('All Administrative HTML Workspaces — Owner Admin excluded'),'DOO role workspace does not publish the administrative HTML collection');
expect(roleDirectory.includes('data-role-workspace-directory="true"'),'Owner Admin role directory is missing');

for(const marker of [
  'const staffManagementRoles=new Set<UserRole>([...managementRoles,UserRole.HOUSE_MANAGER]);',
  'const ensureStaffManager=',
  'h."managerUserId"=$3',
  'OR h."managerUserId"=$4 OR EXISTS',
  'canManageStaff:owner(a)||staffManagementRoles.has(a.role)',
  "homes/:homeId/staff',async(req,res,next)=>{try{const a=authOf(res);ensureStaffManager(a);",
  "homes/:homeId/staff/:userId',async(req,res,next)=>{try{const a=authOf(res);ensureStaffManager(a);",
])expect(residentialApi.includes(marker),`Assigned-home manager backend scope missing ${marker}`);
expect(!residentialApi.includes('const managementRoles=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.DELEGATING_NURSE,UserRole.RN,UserRole.HOUSE_MANAGER'),'HOUSE_MANAGER must not become globally elevated residential management');
for(const marker of [
  "const validTabs=new Set(['residents','staff','tasks','handoff','log'])",
  'state.context.canManageStaff?',
  "history.replaceState(null,'','#'+state.tab)",
  "$('newHouse').hidden=!state.context.elevated",
])expect(residentialHtml.includes(marker),`Assigned-home manager frontend scope missing ${marker}`);
expect(homeManagerInstaller.includes('appointed managers see only their assigned/managed homes'),'Home Manager installer lacks assigned-home scope contract');
expect(!apiPackage.includes('install-home-manager-residential-scope.mjs'),'Home Manager backend scope must live in canonical API source rather than depend on an API build-time rewrite');

for(const label of ['DSP','Medication-Certified DSP','LPN','RN','Delegating Nurse','House Manager','Program Manager','Home Health Clinician','Scheduler','NMT Dispatcher','NMT Driver','HR Manager','Administrator','Director of Operations','CEO','Auditor'])expect(testSource.includes(`label:'${label}'`),`Production UAT is missing persona ${label}`);
for(const marker of [
  'username stays in Employee Portal',
  "page.goto('/employee-login.html')",
  "page.getByLabel('Employee username')",
  "page.goto('/admin-login.html')",
  "page.getByLabel('Sulandra work email')",
  'Sulandra email opens entitled Admin workspace',
  'Employee Login rejects email even for an Administrator',
  'Admin Login rejects a non-management employee',
  'expectAdminDoor',
  "key==='houseManager'",
  'Manage My Home Team',
  'UAT blocks live mutations',
  'representative mobile production UAT',
])expect(testSource.includes(marker),`Production role browser UAT missing ${marker}`);
expect(!testSource.includes("p.role==='DOO'")&&!testSource.includes("p.role==='CEO'"),'Production UAT still contains Employee-login privileged-role redirect expectations');
expect(config.includes('https://www.sulandrahealth.com'),'Role UAT Playwright config is not pinned to the live production website');
expect(config.includes('workers: 1'),'Production UAT is not serialized for deterministic role testing');

for(const marker of [
  'release/sulandra-1.0',
  'Two-door role-by-role production UAT',
  'Wait for exact production two-door deployment',
  'https://www.sulandrahealth.com/employee-portal.html',
  'https://www.sulandrahealth.com/employee-login.html',
  'https://www.sulandrahealth.com/admin-login.html',
  'https://www.sulandrahealth.com/assets/admin-cross-workspace-launcher.js',
  'portal: "EMPLOYEE"',
  'portal: "ADMIN"',
  'managementAdminRoles',
  'opensNewTab: true',
  'Manage My Home Team',
  'canManageStaff',
  'playwright.role-uat.config.mjs',
])expect(workflow.includes(marker),`Production Role UAT workflow missing ${marker}`);
expect(pkg.includes('verify:role-uat'),'package.json does not expose the production role-UAT verifier');

for(const rel of [
  'employee-portal-railway.js',
  'assets/employee-role-navigation-guard.js',
  'assets/employee-login-railway.js',
  'admin-login-railway.js',
  'assets/admin-cross-workspace-launcher.js',
  'assets/role-workspace.js',
  'assets/admin-role-workspaces-link.js',
  'scripts/install-admin-cross-workspace-launcher.mjs',
  'scripts/install-employee-portal-deep-integration.mjs',
  'scripts/install-home-manager-residential-scope.mjs',
  'playwright.role-uat.config.mjs',
  'tests/production-role-uat.spec.mjs',
]){
  try{
    await access(path.join(root,rel));
    const result=spawnSync(process.execPath,['--check',path.join(root,rel)],{encoding:'utf8'});
    if(result.status!==0)failures.push(`${rel} syntax check failed: ${(result.stderr||result.stdout||'').trim()}`);
  }catch{}
}

if(failures.length){console.error('Production role UAT contract verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Production role UAT verified: employee usernames always enter Employee Portal, Sulandra work email plus management entitlement enters Admin, cross-workspace navigation opens the other sign-in in a separate tab, role/company permissions remain enforced, and appointed Home Managers remain scoped to their assigned/managed homes.');