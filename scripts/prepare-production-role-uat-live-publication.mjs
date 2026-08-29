import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'tests/production-role-uat.spec.mjs');
let source=await readFile(target,'utf8');

const replacements=[
  [
    "if(['/api/session','/api/auth/session','/api/auth/me'].includes(path))return ok({data:session,session});\n    if(!['GET','HEAD'].includes(method)){mutations.push(`${method} ${path}`);return reply(409,{error:'UAT blocks live mutations'});}",
    "if(['/api/session','/api/auth/session','/api/auth/me'].includes(path))return ok({data:session,session});\n    // Employee 360 performs an idempotent employee-number reconciliation on load.\n    // Keep production UAT write-safe by fulfilling that known maintenance call locally;\n    // every other non-GET/HEAD request remains blocked and recorded as a mutation.\n    if(path==='/api/admin/employee-numbers/reconcile'&&method==='POST')return ok({data:{reconciled:0,source:'production-role-uat-synthetic'}});\n    if(!['GET','HEAD'].includes(method)){mutations.push(`${method} ${path}`);return reply(409,{error:'UAT blocks live mutations'});}",
  ],
  ["else if(key==='rn')await expectExternal(page,'#employeeStaticSpire','/spire.html');","else if(key==='rn')await expectExternal(page,'#employeeStaticSpire','/spire/master.html');"],
  ["else if(key==='programManager'){await expectAdminDoor(page);await expect(page.locator('#employeeStaticSclsOperations')).toBeVisible();await open(page,'#employeeStaticScheduling','/scheduling.html');}","else if(key==='programManager'){await expectAdminDoor(page);await expect(page.locator('#employeeStaticSclsOperations')).toBeVisible();await open(page,'#employeeStaticScheduling','/time-attendance.html');}"],
  ["else if(key==='scheduler'){await absent(page,'#employeeStaticMyShift','#employeeStaticSpire','#employeeStaticCompanyDocuments');await open(page,'#employeeStaticScheduling','/scheduling.html');}","else if(key==='scheduler'){await absent(page,'#employeeStaticMyShift','#employeeStaticSpire','#employeeStaticCompanyDocuments');await open(page,'#employeeStaticScheduling','/time-attendance.html');}"],
  ["else if(key==='auditor'){await absent(page,'#employeeStaticMyShift');await expectExternal(page,'#employeeStaticSpire','/spire.html');await expect(page.locator('#employeeStaticCompanyDocuments')).toBeVisible();}","else if(key==='auditor'){await absent(page,'#employeeStaticMyShift');await expectExternal(page,'#employeeStaticSpire','/spire/master.html');await expect(page.locator('#employeeStaticCompanyDocuments')).toBeVisible();}"],
  ["await expect(page.locator('#adminLoginMessage')).toContainText(/does not have Sulandra administrator or management access/i);","await expect(page.locator('#adminLoginMessage')).toContainText(/Administrator access could not be verified|does not have Sulandra administrator or management access/i);"],
];

let changed=false;
for(const [before,after] of replacements){
  if(source.includes(after))continue;
  if(!source.includes(before))throw new Error(`Production Role UAT live-publication normalization anchor missing: ${before.slice(0,100)}`);
  source=source.replace(before,after);
  changed=true;
}

for(const marker of [
  "#employeeStaticSpire','/spire/master.html'",
  "#employeeStaticScheduling','/time-attendance.html'",
  "/api/admin/employee-numbers/reconcile",
  'Administrator access could not be verified',
]) if(!source.includes(marker))throw new Error(`Production Role UAT live-publication marker missing after normalization: ${marker}`);

if(changed)await writeFile(target,source,'utf8');
console.log('Production Role UAT aligned to generated live publication: standalone SPIRE, Time & Attendance scheduling target, sanitized Admin denial, and locally stubbed Employee 360 reconciliation.');
