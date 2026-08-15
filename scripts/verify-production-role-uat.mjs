import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const read=async rel=>{try{return await readFile(path.join(root,rel),'utf8')}catch{failures.push(`Missing ${rel}`);return''}};
const expect=(condition,label)=>{if(!condition)failures.push(label)};
const contract='20260810-role-uat-1';

// Normalize the same source files Railway publishes before validating the role contract.
await import('./install-role-workspaces.mjs');
await import('./verify-role-workspaces.mjs');

const [portal,runtime,guard,portalInstaller,loginHtml,loginAsset,loginRoot,adminFixer,nmt,testSource,config,workflow,pkg,roleRuntime,roleDirectory]=await Promise.all([
  read('employee-portal.html'),read('employee-portal-railway.js'),read('assets/employee-role-navigation-guard.js'),read('scripts/install-employee-portal-deep-integration.mjs'),
  read('employee-login.html'),read('assets/employee-login-railway.js'),read('employee-login-railway.js'),read('scripts/fix-admin-session-bounce.mjs'),
  read('api/src/nmt-dispatch-routes.ts'),read('tests/production-role-uat.spec.mjs'),read('playwright.role-uat.config.mjs'),read('.github/workflows/production-role-uat.yml'),read('package.json'),
  read('assets/role-workspace.js'),read('role-workspaces.html'),
]);

expect(portal.includes(`sulandra-role-uat-contract\" content=\"${contract}`)||portal.includes(`sulandra-role-uat-contract" content="${contract}`),'Employee Portal lacks production role-UAT contract marker');
expect(portal.includes('data-role-uat-contract="20260810-role-uat-1"'),'Employee Portal body lacks role-UAT marker');
for(const marker of [
  'id="employeeStaticMyShift" class="portal-link" href="/spire-shift.html" hidden',
  'id="employeeStaticSpire" class="portal-link" href="/spire.html" hidden',
  'id="employeeStaticNmtDriver" class="portal-link" href="/nmt-driver.html" hidden',
  'id="employeeStaticCompanyDocuments" class="portal-link" href="/company-documents.html" hidden',
])expect(portal.includes(marker),`Restricted portal surface is not hidden by default: ${marker}`);
expect(!portal.includes('<li><a href="/spire.html">SPIRE</a></li>'),'Employee Portal still exposes an unconditional live SPIRE top-navigation link');
expect(!portal.includes('<li><a href="/company-documents.html">Documents</a></li>'),'Employee Portal still exposes an unconditional company-vault top-navigation link');

for(const marker of [
  `const UAT_CONTRACT = "${contract}"`,'executiveAdminRoles','companyDocumentRoles','sclsOperationsRoles','homeHealthVisitRoles','nmtDispatchRoles','enterpriseAnalyticsRoles','securityAuditRoles','employee360Roles','schedulingRoles',
  'applyStaticRoleVisibility(session)','selected.code === "NMT" && nmtDispatchRoles.has(role)','document.body.dataset.roleUatReady = "true"','document.body.dataset.authenticatedRole = role','window.SulandraRoleUat',
  'const roleWorkspaceRoutes = new Map([','employeeRoleWorkspaceLauncher','employeeRoleWorkspaceNav','const executiveAdminRoles = new Set(["ADMINISTRATOR"]);',
])expect(runtime.includes(marker),`Employee Portal runtime missing UAT behavior: ${marker}`);
expect(guard.includes(contract)&&guard.includes("['employeeSchedulingLauncher', '/scheduling.html']")&&guard.includes("['employeeSchedulingNav', '/scheduling.html']"),'Protected employee Scheduling navigation guard is incomplete');
expect(portalInstaller.includes('employee-role-navigation-guard.js?v=20260810-role-uat-1')&&portalInstaller.includes("install-role-workspaces.mjs"),'Employee Portal publisher does not install protected navigation plus role workspaces');

for(const source of [loginAsset,loginRoot]){
  expect(source.includes('ADMIN_LANDING_ROLES'),'Login runtime lacks centralized privileged-session roles');
  for(const role of ['ADMINISTRATOR','CEO','DOO'])expect(source.includes(`"${role}"`),`Login runtime does not preserve privileged session handling for ${role}`);
  expect(source.includes('function landingForRole(role)'),'Login runtime lacks role-specific landing function');
  expect(source.includes('if (role === "ADMINISTRATOR") return "admin.html";'),'Owner Administrator no longer lands on admin.html');
  expect(source.includes('if (role === "DOO") return "doo.html";'),'DOO does not land on doo.html');
  expect(source.includes('if (role === "CEO") return "ceo.html";'),'CEO does not land on ceo.html');
}
expect(adminFixer.includes('role !== "ADMINISTRATOR"'),'Admin controller normalizer does not reserve admin.html for the Owner Administrator');
expect(adminFixer.includes('role === "DOO" ? "doo.html"'),'Admin controller normalizer does not redirect DOO to the dedicated workspace');
expect(loginHtml.includes(contract),'Employee Login does not publish the role-UAT contract marker');
expect(loginHtml.includes('/assets/employee-login-railway.js?v=20260810-role-uat-1'),'Employee Login is not cache-pinned to the role-UAT runtime');
expect(nmt.includes('UserRole.SCHEDULER'),'NMT dispatch backend does not authorize the Scheduler dispatcher persona');
expect(roleRuntime.includes('Manage My Home Team')&&roleRuntime.includes('/scls-residential.html#staff'),'Home Manager role workspace is not connected to assigned-home staff management');
expect(roleRuntime.includes('All Administrative HTML Workspaces — Owner Admin excluded'),'DOO role workspace does not publish the administrative HTML collection');
expect(roleDirectory.includes('data-role-workspace-directory="true"'),'Owner Admin role directory is missing');

for(const label of ['DSP','Medication-Certified DSP','LPN','RN','Delegating Nurse','House Manager','Program Manager','Home Health Clinician','Scheduler','NMT Dispatcher','NMT Driver','HR Manager','Administrator','Director of Operations','CEO','Auditor'])expect(testSource.includes(`label:'${label}'`),`Production UAT is missing persona ${label}`);
expect((testSource.match(/page\.goto\(/g)||[]).length===1&&testSource.includes("page.goto('/employee-login.html')"),'Role browser UAT must begin navigation only from Employee Login');
expect(testSource.includes("p.role==='DOO'")&&testSource.includes("/doo\\.html"),'Production UAT does not verify the DOO dedicated landing');
expect(testSource.includes("p.role==='CEO'")&&testSource.includes("/ceo\\.html"),'Production UAT does not verify the CEO dedicated landing');
expect(testSource.includes('UAT blocks live mutations'),'Production UAT does not explicitly block non-login backend mutations');
expect(testSource.includes('representative mobile production UAT'),'Production UAT lacks representative mobile role coverage');
expect(config.includes("https://www.sulandrahealth.com"),'Role UAT Playwright config is not pinned to the live production website');
expect(config.includes('workers: 1'),'Production UAT is not serialized for deterministic role testing');

for(const marker of [
  contract,
  'Wait for exact production role-UAT deployment',
  'https://www.sulandrahealth.com/employee-portal.html',
  'https://www.sulandrahealth.com/assets/employee-login-railway.js',
  'https://www.sulandrahealth.com/assets/employee-role-navigation-guard.js',
  'https://www.sulandrahealth.com/admin-railway.js',
  'https://www.sulandrahealth.com/assets/role-workspace.js',
  'https://www.sulandrahealth.com/doo.html',
  'https://www.sulandrahealth.com/ceo.html',
  'https://www.sulandrahealth.com/home-manager.html',
  'function landingForRole(role)',
  'role !== "ADMINISTRATOR"',
  'Manage My Home Team',
  'ownerMain: "/admin.html"',
  'playwright.role-uat.config.mjs',
])expect(workflow.includes(marker),`Production Role UAT workflow missing ${marker}`);
expect(pkg.includes('verify:role-uat'),'package.json does not expose the production role-UAT verifier');

for(const rel of ['employee-portal-railway.js','assets/employee-role-navigation-guard.js','assets/employee-login-railway.js','employee-login-railway.js','assets/role-workspace.js','assets/admin-role-workspaces-link.js','playwright.role-uat.config.mjs','tests/production-role-uat.spec.mjs']){
  try{await access(path.join(root,rel));const result=spawnSync(process.execPath,['--check',path.join(root,rel)],{encoding:'utf8'});if(result.status!==0)failures.push(`${rel} syntax check failed: ${(result.stderr||result.stdout||'').trim()}`);}catch{}
}

if(failures.length){console.error('Production role UAT contract verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Production role UAT verified: role/company gating remains enforced, every occupiable role has a dedicated workspace, Home Manager receives assigned-home team operations, Owner Administrator alone lands on admin.html, CEO/DOO receive dedicated privileged workspaces, and DOO receives all separate administrative HTML except the owner main page.');
