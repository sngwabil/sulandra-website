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

replaceExact(
  "async function fillVisibleForm(page,root='body'){",
  "async function adminLogin(page){const adminActor=ACTORS.admin;await employeeLogin(page,adminActor);await expect(page.locator('#livePill')).toContainText(/Railway:\\s*connected/i);}\n\nasync function fillVisibleForm(page,root='body'){",
  'Admin initialization readiness helper',
);
replaceAllExact(
  'await employeeLogin(page,ACTORS.admin);',
  'await adminLogin(page);',
  'Admin initialization readiness calls',
);

replaceAllExact(
  "await clickVisible(page,'#topModuleNav [data-module=\"onboarding\"]');await clickVisible(page,`#applicantTable [data-application-id=\"${app.id}\"]`);",
  "await clickVisible(page,'#topModuleNav [data-module=\"onboarding\"]');await clickVisible(page,'[data-onboarding-panel=\"applicants\"]');await clickVisible(page,`#onboarding-applicants #applicantTable [data-application-id=\"${app.id}\"]`);",
  'Admin applicant panel navigation',
);
replaceExact(
  "await clickVisible(page,'#topModuleNav [data-module=\"onboarding\"]');\n  await clickVisible(page,`#applicantTable [data-application-id=\"${app.id}\"]`);",
  "await clickVisible(page,'#topModuleNav [data-module=\"onboarding\"]');\n  await clickVisible(page,'[data-onboarding-panel=\"applicants\"]');\n  await clickVisible(page,`#onboarding-applicants #applicantTable [data-application-id=\"${app.id}\"]`);",
  'Initial Admin applicant panel navigation',
);
replaceAllExact(
  "await clickVisible(page,'[data-onboarding-panel=\"applicants\"]');await clickVisible(page,`#applicantTable [data-application-id=\"${app.id}\"]`);",
  "await clickVisible(page,'[data-onboarding-panel=\"applicants\"]');await clickVisible(page,`#onboarding-applicants #applicantTable [data-application-id=\"${app.id}\"]`);",
  'Previously prepared Admin applicant scoping',
);

replaceExact(
  "await adminLogin(page);await clickVisible(page,'#topModuleNav a[href$=\"spire-admin.html\"]');await clickVisible(page,'#openIntake');\n  await clickVisible(page,'#newIntake');",
  "await adminLogin(page);await clickVisible(page,'#topModuleNav a[href$=\"spire-admin.html\"]');await clickVisible(page,'#openIntake');\n  await expect(page.locator('#caseList')).not.toContainText(/Loading/i);await clickVisible(page,'#newIntake');",
  'Client Intake initialization readiness',
);

replaceAllExact(
  "/flowsheets/vitals`&&method==='POST'",
  "/vitals`&&method==='POST'",
  'My Shift vitals endpoint',
);
replaceAllExact(
  "const med={id:'biz-med',name:'Synthetic UAT Medication'",
  "const med={id:'biz-med',medicationOrderId:'biz-med',name:'Synthetic UAT Medication'",
  'eMAR medication order identity',
);
replaceAllExact(
  "if(path.startsWith(`/api/spire/patients/${patient.id}`)&&method==='GET')return{data:{data:{patient,flags:[],allergies:[],medications:[]}}};",
  "if(path===`/api/spire/patients/${patient.id}`&&method==='GET')return{data:{data:patient}};\n    if(path===`/api/spire/patients/${patient.id}/storyboard`&&method==='GET')return{data:{data:{...patient,flags:[],allergies:[],medications:[]}}};",
  'SPIRE base patient and storyboard fixture',
);
replaceAllExact(
  "if(path.startsWith(`/api/spire/patients/${patient.id}`)&&method==='GET')return{data:{data:{patient,flags:[],allergies:[],medications:[med]}}};",
  "if(path===`/api/spire/patients/${patient.id}`&&method==='GET')return{data:{data:patient}};\n    if(path===`/api/spire/patients/${patient.id}/storyboard`&&method==='GET')return{data:{data:{...patient,flags:[],allergies:[],medications:[med]}}};",
  'eMAR SPIRE base patient fixture',
);

replaceExact(
  "const detail=()=>({home,residents:state.resident?[{patientId:resident.id,roomLabel:'Room 1',bedLabel:'A',patient:resident}]:[],staff:state.staff?[{userId:staff.id,role:'DSP',displayName:staff.displayName,email:staff.email}]:[],tasks:state.tasks,handoffs:state.handoff?[{id:'biz-handoff',status:'SIGNED',shiftType:'DAY',signedAt:nowIso(),staffSummary:'Synthetic handoff'}]:[],logs:[],appointments:[]});",
  "const detail=()=>({home,residents:state.resident?[{...resident,placement:{roomLabel:'Room 1',bedLabel:'A'},flags:[],medications:[],dueAssessments:[],carePlan:{status:'ACTIVE',annualReviewDate:'2027-09-01'}}]:[],staff:state.staff?[{userId:staff.id,role:'DSP',displayName:staff.displayName,email:staff.email,assignedAt:nowIso()}]:[],tasks:state.tasks,handoffs:state.handoff?[{id:'biz-handoff',status:'SIGNED',shiftType:'DAY',shiftStart:nowIso(),signedAt:nowIso(),createdByUserId:staff.id,signedByUserId:staff.id,followUpRequired:'Synthetic follow-up'}]:[],logs:[],appointments:[]});",
  'SCLS resident/staff/handoff detail shape',
);
replaceExact(
  "if(path==='/api/scls/residential/context')return{data:{data:{company:ENTITIES.SCLS,role:'HOUSE_MANAGER',write:true}}};",
  "if(path==='/api/scls/residential/context')return{data:{data:{company:ENTITIES.SCLS,role:'HOUSE_MANAGER',write:true,elevated:true}}};",
  'SCLS elevated assignment context',
);
replaceExact(
  "await employeeLogin(page,ACTORS.house);await clickVisible(page,'#employeeSclsOperationsLauncher');await expect(page.getByText(home.name,{exact:false})).toBeVisible();",
  "await employeeLogin(page,ACTORS.house);await clickVisible(page,'#employeeSclsOperationsLauncher');await expect(page.getByRole('heading',{name:home.name,exact:true})).toBeVisible();",
  'SCLS home heading assertion',
);
replaceAllExact(
  "await page.locator('#staffUserId').selectOption(staff.id);",
  "await page.locator('#staffUserId').fill(staff.id);",
  'SCLS staff assignment input',
);

replaceExact(
  "if(path==='/public/home-health/referrals/session')return{data:{data:{purpose:'OPERATIONAL',companyName:ENTITIES.HOME_HEALTH.displayName,sourceName:'Synthetic Hospital',sourceType:'HOSPITAL',expiresAt:futureIso(720)}}};",
  "if(path==='/public/home-health/referrals/session')return{data:{data:{purpose:'OPERATIONAL',companyName:ENTITIES.HOME_HEALTH.displayName,sourceName:'Synthetic Hospital',sourceType:'HOSPITAL',submissionsRemaining:3,expiresAt:futureIso(720)}}};",
  'Home Health referral session fixture',
);
replaceExact(
  "await page.goto('/home-health-referral.html?token=synthetic-business-hh-token');await fillVisibleForm(page,'body');\n  for(let i=0;i<6&&!state.referral;i++){\n    const submit=page.getByRole('button',{name:/Securely Submit Referral/i});if(await submit.isVisible().catch(()=>false)){await submit.click();break;}\n    const next=page.getByRole('button',{name:/Next|Continue|Review/i}).last();if(await next.isVisible().catch(()=>false)){await next.click();await fillVisibleForm(page,'body');}else break;\n  }",
  "await page.goto('/home-health-referral.html?token=synthetic-business-hh-token');\n  await expect(page.locator('#next')).toBeVisible();for(let step=0;step<4;step++){await fillVisibleForm(page,'body');await clickVisible(page,'#next');}",
  'Home Health four-step referral wizard',
);
replaceExact(
  "await page.goto('/home-health-referral.html?token=synthetic-business-hh-token');\n  for(let step=0;step<4;step++){await fillVisibleForm(page,'body');await clickVisible(page,'#next');}",
  "await page.goto('/home-health-referral.html?token=synthetic-business-hh-token');\n  await expect(page.locator('#next')).toBeVisible();for(let step=0;step<4;step++){await fillVisibleForm(page,'body');await clickVisible(page,'#next');}",
  'Previously prepared Home Health wizard readiness',
);

replaceExact(
  "if(path==='/public/nmt/referrals/session')return{data:{data:{purpose:'OPERATIONAL',companyName:ENTITIES.NMT.displayName,sourceName:'Synthetic Hospital',expiresAt:futureIso(720)}}};",
  "if(path==='/public/nmt/referrals/session')return{data:{data:{purpose:'OPERATIONAL',companyName:ENTITIES.NMT.displayName,facilityName:'Synthetic Hospital',facilityType:'HOSPITAL',submissionsRemaining:3,expiresAt:futureIso(720)}}};",
  'NMT facility referral session fixture',
);
replaceAllExact(
  "if(path==='/api/admin/nmt/referrals/context')return{data:{data:{company:ENTITIES.NMT,operational:true}}};",
  "if(path==='/api/admin/nmt/referral-context')return{data:{data:{company:ENTITIES.NMT,operational:true}}};",
  'NMT referral review context endpoint',
);
replaceExact(
  "await page.goto('/nmt-referral.html?token=synthetic-business-nmt-token');await fillVisibleForm(page,'body');\n  for(let i=0;i<7&&!state.order;i++){\n    const submit=page.locator('#submitReferral');if(await submit.isVisible().catch(()=>false)){await submit.click();break;}\n    const next=page.getByRole('button',{name:/Next|Continue|Review/i}).last();if(await next.isVisible().catch(()=>false)){await next.click();await fillVisibleForm(page,'body');}else break;\n  }",
  "await page.goto('/nmt-referral.html?token=synthetic-business-nmt-token');\n  await expect(page.locator('[data-next]')).toBeVisible();for(let step=0;step<4;step++){await fillVisibleForm(page,'body');await clickVisible(page,'[data-next]');}\n  await fillVisibleForm(page,'body');await clickVisible(page,'#submitReferral');",
  'NMT five-step facility referral wizard',
);
replaceExact(
  "await page.goto('/nmt-referral.html?token=synthetic-business-nmt-token');\n  for(let step=0;step<4;step++){await fillVisibleForm(page,'body');await clickVisible(page,'[data-next]');}\n  await fillVisibleForm(page,'body');await clickVisible(page,'#submitReferral');",
  "await page.goto('/nmt-referral.html?token=synthetic-business-nmt-token');\n  await expect(page.locator('[data-next]')).toBeVisible();for(let step=0;step<4;step++){await fillVisibleForm(page,'body');await clickVisible(page,'[data-next]');}\n  await fillVisibleForm(page,'body');await clickVisible(page,'#submitReferral');",
  'Previously prepared NMT wizard readiness',
);

replaceExact(
  "await employeeLogin(page,ACTORS.dsp);await clickVisible(page,'#employeeWorkforceLauncher');await clickVisible(page,'[data-tab=\"timesheets\"]');",
  "await employeeLogin(page,ACTORS.dsp);await clickVisible(page,'#employeeWorkforceLauncher');await expect(page.locator('#company')).not.toContainText(/Loading company/i);await clickVisible(page,'.tab[data-tab=\"timesheets\"]');await expect(page.locator('#timesheets')).toHaveClass(/active/);",
  'Workforce interactive readiness and Timesheets activation',
);

replaceExact(
  "if(path==='/api/company-documents/folders')return{data:{data:[{id:'licenses',name:'Licenses',category:'LICENSE',sensitivity:'CONFIDENTIAL',documentCount:state.document?1:0}]}};\n    if(path==='/api/company-documents'&&method==='GET')return{data:{data:state.document?[doc]:[]}};\n    if(path==='/api/company-documents'&&method==='POST'){state.document=true;return{expectedMutation:true,data:{data:doc}};}",
  "if(path==='/api/admin/company-documents/tree'&&method==='GET')return{data:{data:{folders:[{id:'licenses',name:'Licenses',category:'LICENSE',description:'Licenses and registrations',sensitivity:'CONFIDENTIAL',documentCount:state.document?1:0}],documents:state.document?[doc]:[]}}};\n    if(path==='/api/admin/company-documents/files'&&method==='POST'){state.document=true;return{expectedMutation:true,data:{data:doc}};}",
  'Company Documents tree and upload API contract',
);
replaceExact(
  "const complianceLink=page.getByRole('link',{name:/Compliance/i});if(await complianceLink.isVisible().catch(()=>false))await complianceLink.click();else{await page.getByRole('link',{name:/Admin Console/i}).click();await clickVisible(page,'#topModuleNav a[href$=\"spire-admin.html\"]');const c=page.locator('a[href=\"/company-compliance.html\"]').first();await expect(c).toBeVisible();await c.click();}",
  "await clickVisible(page,'#companyComplianceLink');",
  'Company Documents to Company Compliance navigation',
);

replaceExact(
  "await employeeLogin(page,ACTORS.rn);await clickVisible(page,'#employeeLiveSpireLauncher');await expect(page).toHaveURL(/\\/spire\\.html$/);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  "await employeeLogin(page,ACTORS.rn);await clickVisible(page,'#employeeLiveSpireLauncher');await expect(page).toHaveURL(/\\/spire\\.html$/);await clickVisible(page,'[data-workspace=\"census\"]');await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  'Incident patient chart navigation',
);
replaceExact(
  "if(path.startsWith(`/api/spire/patients/${patient.id}`)&&method==='GET')return{data:{data:{patient,flags:[],allergies:[],medications:[]}}};\n    if(path==='/api/security-audit/context')",
  "if(path===`/api/spire/patients/${patient.id}`&&method==='GET')return{data:{data:patient}};\n    if(path===`/api/spire/patients/${patient.id}/storyboard`&&method==='GET')return{data:{data:{...patient,flags:[],allergies:[],medications:[]}}};\n    if(path==='/api/security-audit/context')",
  'Incident SPIRE patient/storyboard fixture',
);

await writeFile(target,source,'utf8');
console.log('Prepared production business UAT for admin/page readiness, exact SPIRE patient and eMAR contracts, SCLS assignment controls, secure referral wizards, NMT review context, Workforce activation, Company Documents compliance continuity, and incident chart navigation.');
