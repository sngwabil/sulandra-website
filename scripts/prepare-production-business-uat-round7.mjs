import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'tests/production-business-path-uat.spec.mjs');
let source = await readFile(target, 'utf8');

function replaceExact(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Round-seven business UAT anchor missing: ${label}`);
  source = source.replace(from, to);
}

function replaceAllExact(from, to, label) {
  if (!source.includes(from) && source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Round-seven business UAT anchor missing: ${label}`);
  source = source.split(from).join(to);
}

// Hiring: status badges and application-status selects both use data-status.
// Target only the actual select control used to advance the applicant lifecycle.
replaceAllExact(
  "page.locator('[data-status]')",
  "page.locator('select[data-status]')",
  'Applicant lifecycle status select specificity',
);

// Client Intake: the button is visible, but its center can sit under the sticky
// header in desktop Chromium. Keyboard activation still exercises the visible
// button and its real onclick handler without bypassing the UI.
replaceExact(
  "await clickVisible(page,'#newIntake');",
  "const newIntakeButton=page.locator('#newIntake');await expect(newIntakeButton).toBeVisible();await newIntakeButton.focus();await newIntakeButton.press('Enter');",
  'Client Intake sticky-header-safe New Intake activation',
);

// eMAR: wait for the native patient/tab deep-link handoff to finish instead of
// racing the chart bootstrap, then click the real MAR tab if it is not active.
replaceExact(
  "await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);await clickVisible(page,'[data-chart-tab=\"mar\"]');",
  "await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);await expect(page.locator('#spirePatientStrip')).toBeVisible();const marTab=page.locator('[data-chart-tab=\"mar\"]');await expect(marTab).toBeVisible();if(!(await marTab.evaluate(el=>el.classList.contains('active'))))await marTab.click();",
  'eMAR native deep-link readiness',
);

// SCLS: staff assignment is intentionally a separate visible tab.
replaceExact(
  "await clickVisible(page,'#addStaff');",
  "await clickVisible(page,'[data-tab=\"staff\"]');await clickVisible(page,'#addStaff');",
  'SCLS Staff tab transition before assignment',
);

// Home Health Operations now exposes the external Referral Inbox explicitly.
replaceExact(
  "await employeeLogin(page,ACTORS.hhRn);await clickVisible(page,'#employeeHomeHealthOperationsLauncher');const referrals=page.getByRole('link',{name:/Referral/i}).first();if(await referrals.isVisible().catch(()=>false))await referrals.click();else await page.locator('a[href=\"/home-health-referrals.html\"]').first().click();",
  "await employeeLogin(page,ACTORS.hhRn);await clickVisible(page,'#employeeHomeHealthOperationsLauncher');await clickVisible(page,'#homeHealthReferralInboxLink');",
  'Home Health Operations to Referral Inbox transition',
);

// NMT order detail rendering requires all of the arrays consumed by the page.
replaceExact(
  "if(path===`/api/admin/nmt/orders/${order.id}`&&method==='GET')return{data:{data:{order:{...order,status:state.accepted?'ACCEPTED':'RECEIVED'},events:[],attachments:[]}}};",
  "if(path===`/api/admin/nmt/orders/${order.id}`&&method==='GET')return{data:{data:{order:{...order,status:state.accepted?'ACCEPTED':'RECEIVED'},events:[],attachments:[],patientCandidates:[]}}};",
  'NMT order-detail patientCandidates fixture',
);
replaceExact(
  "const order={id:'biz-nmt-order',orderNumber:'NMT-UAT-001',status:'RECEIVED',mode:'OPERATIONAL',riderFirstName:'Synthetic',riderLastName:'Rider',pickupAddress:'822 Dalewood Pl, Dayton, OH',destinationAddress:'Synthetic Hospital, Dayton, OH',requestedPickupTime:futureIso(24),tripType:'ONE_WAY',mobilityLevel:'AMBULATORY'};",
  "const order={id:'biz-nmt-order',orderNumber:'NMT-UAT-001',status:'RECEIVED',mode:'OPERATIONAL',facilityName:'Synthetic Hospital',riderFirstName:'Synthetic',riderLastName:'Rider',requestedPickupAt:futureIso(24),requestedPickupTime:futureIso(24),serviceLevel:'AMBULATORY',priority:'ROUTINE',tripType:'ONE_WAY',mobilityLevel:'AMBULATORY',pickupName:'Synthetic Residence',pickupStreet:'822 Dalewood Pl',pickupCity:'Dayton',pickupState:'OH',pickupPostalCode:'45426',pickupAddress:'822 Dalewood Pl, Dayton, OH',dropoffName:'Synthetic Hospital',dropoffStreet:'Synthetic Hospital',dropoffCity:'Dayton',dropoffState:'OH',dropoffPostalCode:'45426',destinationAddress:'Synthetic Hospital, Dayton, OH',orderingContactName:'Synthetic Dispatcher',orderingContactPhone:'9375550100'};",
  'NMT operational order display shape',
);

// Workforce submission is intentionally guarded by a confirmation dialog.
replaceExact(
  "await employeeLogin(page,ACTORS.dsp);await clickVisible(page,'#employeeWorkforceLauncher');await expect(page.locator('#company')).not.toContainText(/Loading company/i);await clickVisible(page,'.tab[data-tab=\"timesheets\"]');await expect(page.locator('#timesheets')).toHaveClass(/active/);",
  "page.on('dialog',d=>d.accept().catch(()=>{}));await employeeLogin(page,ACTORS.dsp);await clickVisible(page,'#employeeWorkforceLauncher');await expect(page.locator('#company')).not.toContainText(/Loading company/i);await clickVisible(page,'.tab[data-tab=\"timesheets\"]');await expect(page.locator('#timesheets')).toHaveClass(/active/);",
  'Workforce submit confirmation acceptance',
);

// Company Compliance initializes categories and write permissions asynchronously.
replaceExact(
  "const item=()=>({id:'biz-compliance',category:'LICENSE',name:'Synthetic Business UAT License',status:state.renewed?'ACTIVE':'EXPIRED',health:state.renewed?'ACTIVE':'EXPIRED',expirationDate:state.renewed?'2027-12-31':'2026-08-01',renewalStatus:state.renewed?'COMPLETED':'NOT_STARTED',sourceDocumentId:doc.id,documentId:doc.id,notes:'Synthetic Business UAT'});",
  "const item=()=>({id:'biz-compliance',category:'LICENSE',requirementName:'Synthetic Business UAT License',status:state.renewed?'ACTIVE':'EXPIRED',health:state.renewed?'ACTIVE':'EXPIRED',expirationDate:state.renewed?'2027-12-31':'2026-08-01',daysToExpiration:state.renewed?508:-9,renewalLeadDays:60,renewalStatus:state.renewed?'COMPLETED':'NOT_STARTED',linkedDocumentId:doc.id,notes:'Synthetic Business UAT'});",
  'Company Compliance item display shape',
);
replaceExact(
  "if(path==='/api/company-compliance/context')return{data:{data:{company:ENTITIES.SCLS,role:'ADMINISTRATOR',write:true}}};",
  "if(path==='/api/company-compliance/context')return{data:{data:{company:ENTITIES.SCLS,role:'ADMINISTRATOR',write:true,categories:['LICENSE']}}};",
  'Company Compliance category/write context',
);
replaceExact(
  "if(path==='/api/company-compliance/items'&&method==='GET')return{data:{data:state.compliance?[item()]:[]}};",
  "if(path==='/api/company-compliance/items'&&method==='GET')return{data:{data:state.compliance?[item()]:[]}};\n    if(path==='/api/company-compliance/summary'&&method==='GET')return{data:{data:{expired:state.compliance&&!state.renewed?1:0,due15:0,due60:0,unverified:0,byStatus:state.compliance?[{status:state.renewed?'ACTIVE':'EXPIRED',count:1}]:[]}}};",
  'Company Compliance summary fixture',
);
replaceExact(
  "await expect(page).toHaveURL(/\\/company-compliance\\.html$/);await clickVisible(page,'#newItem');await fillVisibleForm(page,'#itemDialog');",
  "await expect(page).toHaveURL(/\\/company-compliance\\.html$/);await expect.poll(async()=>page.locator('#cCategory option').count()).toBeGreaterThan(0);await expect(page.locator('#list')).not.toContainText(/Loading compliance register/i);await clickVisible(page,'#newItem');await expect(page.locator('#itemDialog')).toBeVisible();await fillVisibleForm(page,'#itemDialog');",
  'Company Compliance initialization readiness',
);

// Incident path: wait for openPatient() to finish before requesting a chart tab.
replaceExact(
  "await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  "await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await expect(page.locator('#spirePatientStrip')).toBeVisible();await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  'Incident patient chart open readiness',
);

await writeFile(target, source, 'utf8');
console.log('Applied round-seven business UAT corrections: specific hiring status control, sticky-header-safe intake activation, native SPIRE/eMAR readiness, SCLS Staff transition, Home Health Referral Inbox, complete NMT detail shape, Workforce confirmation, Company Compliance readiness, and incident chart-open wait.');
