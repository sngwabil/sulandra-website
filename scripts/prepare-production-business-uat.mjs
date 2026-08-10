import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'tests/production-business-path-uat.spec.mjs');
let source=await readFile(target,'utf8');

function replaceAllExact(from,to,label){
  if(!source.includes(from)&&!source.includes(to))throw new Error(`Business UAT preparation anchor missing: ${label}`);
  source=source.split(from).join(to);
}
function replaceExact(from,to,label){
  if(source.includes(to))return;
  if(!source.includes(from))throw new Error(`Business UAT preparation anchor missing: ${label}`);
  source=source.replace(from,to);
}

replaceAllExact(
  "await clickVisible(page,'#topModuleNav [data-module=\"onboarding\"]');await clickVisible(page,`#applicantTable [data-application-id=\"${app.id}\"]`);",
  "await clickVisible(page,'#topModuleNav [data-module=\"onboarding\"]');await clickVisible(page,'[data-onboarding-panel=\"applicants\"]');await clickVisible(page,`#applicantTable [data-application-id=\"${app.id}\"]`);",
  'Admin applicant panel navigation',
);
replaceExact(
  "await clickVisible(page,'#topModuleNav [data-module=\"onboarding\"]');\n  await clickVisible(page,`#applicantTable [data-application-id=\"${app.id}\"]`);",
  "await clickVisible(page,'#topModuleNav [data-module=\"onboarding\"]');\n  await clickVisible(page,'[data-onboarding-panel=\"applicants\"]');\n  await clickVisible(page,`#applicantTable [data-application-id=\"${app.id}\"]`);",
  'Initial Admin applicant panel navigation',
);

replaceAllExact(
  "/flowsheets/vitals`&&method==='POST'",
  "/vitals`&&method==='POST'",
  'My Shift vitals endpoint',
);

replaceExact(
  "await employeeLogin(page,ACTORS.house);await clickVisible(page,'#employeeSclsOperationsLauncher');await expect(page.getByText(home.name,{exact:false})).toBeVisible();",
  "await employeeLogin(page,ACTORS.house);await clickVisible(page,'#employeeSclsOperationsLauncher');await expect(page.getByRole('heading',{name:home.name,exact:true})).toBeVisible();",
  'SCLS home heading assertion',
);

replaceExact(
  "if(path==='/public/home-health/referrals/session')return{data:{data:{purpose:'OPERATIONAL',companyName:ENTITIES.HOME_HEALTH.displayName,sourceName:'Synthetic Hospital',sourceType:'HOSPITAL',expiresAt:futureIso(720)}}};",
  "if(path==='/public/home-health/referrals/session')return{data:{data:{purpose:'OPERATIONAL',companyName:ENTITIES.HOME_HEALTH.displayName,sourceName:'Synthetic Hospital',sourceType:'HOSPITAL',submissionsRemaining:3,expiresAt:futureIso(720)}}};",
  'Home Health referral session fixture',
);
replaceExact(
  "await page.goto('/home-health-referral.html?token=synthetic-business-hh-token');await fillVisibleForm(page,'body');\n  for(let i=0;i<6&&!state.referral;i++){\n    const submit=page.getByRole('button',{name:/Securely Submit Referral/i});if(await submit.isVisible().catch(()=>false)){await submit.click();break;}\n    const next=page.getByRole('button',{name:/Next|Continue|Review/i}).last();if(await next.isVisible().catch(()=>false)){await next.click();await fillVisibleForm(page,'body');}else break;\n  }",
  "await page.goto('/home-health-referral.html?token=synthetic-business-hh-token');\n  for(let step=0;step<4;step++){await fillVisibleForm(page,'body');await clickVisible(page,'#next');}",
  'Home Health four-step referral wizard',
);

replaceExact(
  "if(path==='/public/nmt/referrals/session')return{data:{data:{purpose:'OPERATIONAL',companyName:ENTITIES.NMT.displayName,sourceName:'Synthetic Hospital',expiresAt:futureIso(720)}}};",
  "if(path==='/public/nmt/referrals/session')return{data:{data:{purpose:'OPERATIONAL',companyName:ENTITIES.NMT.displayName,facilityName:'Synthetic Hospital',facilityType:'HOSPITAL',submissionsRemaining:3,expiresAt:futureIso(720)}}};",
  'NMT facility referral session fixture',
);
replaceExact(
  "await page.goto('/nmt-referral.html?token=synthetic-business-nmt-token');await fillVisibleForm(page,'body');\n  for(let i=0;i<7&&!state.order;i++){\n    const submit=page.locator('#submitReferral');if(await submit.isVisible().catch(()=>false)){await submit.click();break;}\n    const next=page.getByRole('button',{name:/Next|Continue|Review/i}).last();if(await next.isVisible().catch(()=>false)){await next.click();await fillVisibleForm(page,'body');}else break;\n  }",
  "await page.goto('/nmt-referral.html?token=synthetic-business-nmt-token');\n  for(let step=0;step<4;step++){await fillVisibleForm(page,'body');await clickVisible(page,'[data-next]');}\n  await fillVisibleForm(page,'body');await clickVisible(page,'#submitReferral');",
  'NMT five-step facility referral wizard',
);

replaceExact(
  "if(path==='/api/company-documents/folders')return{data:{data:[{id:'licenses',name:'Licenses',category:'LICENSE',sensitivity:'CONFIDENTIAL',documentCount:state.document?1:0}]}};\n    if(path==='/api/company-documents'&&method==='GET')return{data:{data:state.document?[doc]:[]}};\n    if(path==='/api/company-documents'&&method==='POST'){state.document=true;return{expectedMutation:true,data:{data:doc}};}",
  "if(path==='/api/admin/company-documents/tree'&&method==='GET')return{data:{data:{folders:[{id:'licenses',name:'Licenses',category:'LICENSE',description:'Licenses and registrations',sensitivity:'CONFIDENTIAL',documentCount:state.document?1:0}],documents:state.document?[doc]:[]}}};\n    if(path==='/api/admin/company-documents/files'&&method==='POST'){state.document=true;return{expectedMutation:true,data:{data:doc}};}",
  'Company Documents tree and upload API contract',
);

replaceExact(
  "await employeeLogin(page,ACTORS.rn);await clickVisible(page,'#employeeLiveSpireLauncher');await expect(page).toHaveURL(/\\/spire\\.html$/);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  "await employeeLogin(page,ACTORS.rn);await clickVisible(page,'#employeeLiveSpireLauncher');await expect(page).toHaveURL(/\\/spire\\.html$/);await clickVisible(page,'[data-workspace=\"census\"]');await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  'Incident patient chart navigation',
);

await writeFile(target,source,'utf8');
console.log('Prepared production business UAT for live applicant panels, vitals, SCLS, referral wizards, Company Documents, and SPIRE patient-chart navigation.');
