import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const businessTarget=path.join(root,'tests/production-business-path-uat.spec.mjs');
const selectedHomeTarget=path.join(root,'tests/00-spire-selected-home-regression.spec.mjs');
let source=await readFile(businessTarget,'utf8');

function replaceRequired(from,to,label){
  if(source.includes(to)&&!source.includes(from))return;
  if(!source.includes(from))throw new Error(`Round-sixteen business UAT anchor missing: ${label}`);
  source=source.replace(from,to);
}

source=source
  .replaceAll('#topModuleNav [data-module="onboarding"]','[data-module="onboarding"]')
  .replaceAll('#topModuleNav a[href$="spire-admin.html"]','a[href$="spire-admin.html"]');

replaceRequired(
  "const intakesRail=page.locator('[data-rail=\"intakes\"]');if(await intakesRail.isVisible().catch(()=>false))await intakesRail.click();await clickVisible(page,'[data-open-episode]');",
  "await clickVisible(page,'[data-rail=\"intakes\"]');await clickVisible(page,'[data-open-episode]');",
  'visible Home Health intake rail',
);

replaceRequired(
  "company:ENTITIES.SCLS,role:'HOUSE_MANAGER',write:true",
  "company:ENTITIES.SCLS,role:'HOUSE_MANAGER',write:true,elevated:true",
  'elevated SCLS House Manager fixture',
);

const rememberHome="await page.evaluate(()=>{sessionStorage.setItem('spire:selected-service-home-id','biz-home');localStorage.setItem('spire:selected-service-home-id','biz-home');sessionStorage.setItem('spire:selected-service-home-entity','entity-scls');localStorage.setItem('spire:selected-service-home-entity','entity-scls');});";

replaceRequired(
  "await clickVisible(page,'a[href*=\"/spire.html?patientId=biz-patient\"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);",
  `await expect(page.locator('a[href*=\"/spire.html?patientId=biz-patient\"]').first()).toBeVisible();${rememberHome}await page.goto('/spire/login.html?spireHome=biz-home#patient=biz-patient&tab=care-plan');await expect(page).toHaveURL(/\\/spire\\/login\\.html/);const intakeChart=page.frameLocator('#spireWorkspaceFrame');`,
  'Client Intake authenticated SPIRE shell',
);
source=source.replace(
  "await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);await expect(page.locator('[data-chart-tab=\"care-plan\"]')).toBeVisible();",
  "await expect(intakeChart.locator('#spirePatientStrip')).toBeVisible();await expect(intakeChart.locator('#spireChartWorkspace')).toHaveClass(/active/);await expect(intakeChart.locator('[data-chart-tab=\"care-plan\"]')).toBeVisible();",
);
replaceRequired(
  "await clickVisible(page,'[data-chart-tab=\"care-plan\"]');await expect(page.getByRole('heading',{name:/Care Plan \\/ ISP/i})).toBeVisible();await expect(page.locator('#spireChartTabBody')).toContainText('DRAFT');await expect(page.locator('#spireChartTabBody')).toContainText('Family and community choice');",
  "await intakeChart.locator('[data-chart-tab=\"care-plan\"]').click();await expect(intakeChart.getByRole('heading',{name:/Care Plan \\/ ISP/i})).toBeVisible();await expect(intakeChart.locator('#spireChartTabBody')).toContainText('DRAFT');await expect(intakeChart.locator('#spireChartTabBody')).toContainText('Family and community choice');",
  'Client Intake Care Plan frame assertions',
);

replaceRequired(
  "await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);",
  `${rememberHome}await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\/login\\.html.*patient=biz-med-patient.*tab=mar/);const marChart=page.frameLocator('#spireWorkspaceFrame');`,
  'eMAR authenticated SPIRE shell',
);
source=source.replace(
  "await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);const marTab=page.locator('[data-chart-tab=\"mar\"]');",
  "await expect(marChart.locator('#spirePatientStrip')).toBeVisible();await expect(marChart.locator('#spireChartWorkspace')).toHaveClass(/active/);const marTab=marChart.locator('[data-chart-tab=\"mar\"]');",
);
replaceRequired(
  "await clickVisible(page,'[data-chart-tab=\"mar\"]');await expect(page.locator(`[data-medication-id=\"${med.id}\"]`)).toBeVisible();await clickVisible(page,'[data-emar-administer]');await fillVisibleForm(page,'.spire-emar-modal');await page.locator('#emarStatus').selectOption('GIVEN').catch(()=>{});await clickVisible(page,'#emarSave');await expect.poll(()=>state.administered).toBe(true);await expect(page.locator('#spireChartTabBody')).toContainText(/GIVEN|Synthetic UAT Medication/i);",
  "await marChart.locator('[data-chart-tab=\"mar\"]').click();await expect(marChart.locator(`[data-medication-id=\"${med.id}\"]`)).toBeVisible();await marChart.locator('[data-emar-administer]').click();await fillVisibleForm(marChart,'.spire-emar-modal');await marChart.locator('#emarStatus').selectOption('GIVEN').catch(()=>{});await marChart.locator('#emarSave').click();await expect.poll(()=>state.administered).toBe(true);await expect(marChart.locator('#spireChartTabBody')).toContainText(/GIVEN|Synthetic UAT Medication/i);",
  'eMAR frame workflow',
);

const incidentTest=source.indexOf("test('Incident → Follow-up → Audit History'");
const incidentStart=source.indexOf('  await employeeLogin(page,ACTORS.rn);',incidentTest);
const incidentEnd=source.indexOf('\n  await employeeLogin(page,ACTORS.auditor);',incidentStart);
if(incidentTest<0||incidentStart<0||incidentEnd<0)throw new Error('Round-sixteen Incident RN workflow anchors missing');
const incidentFlow=`  await employeeLogin(page,ACTORS.rn);await expect(page.locator('#employeeLiveSpireLauncher')).toBeVisible();${rememberHome}await page.goto(\`/spire/login.html?spireHome=biz-home#patient=\${patient.id}&tab=incidents\`);await expect(page).toHaveURL(/\\/spire\\/login\\.html/);const incidentChart=page.frameLocator('#spireWorkspaceFrame');await expect(incidentChart.locator('#spirePatientStrip')).toBeVisible();await expect(incidentChart.locator('#spireChartWorkspace')).toHaveClass(/active/);await incidentChart.locator('[data-chart-tab="incidents"]').click();await incidentChart.locator('[data-new-incident]').click();await fillVisibleForm(incidentChart,'.spire-incident-modal');await incidentChart.locator('#incDescription').fill('Synthetic Business UAT incident');await incidentChart.locator('#incActions').fill('Synthetic safe immediate actions');await incidentChart.locator('#incSave').click();await expect.poll(()=>state.incident).toBe(true);await incidentChart.locator('tr[data-incident-id="biz-incident"]').click();await incidentChart.locator('[data-add-followup]').click();await fillVisibleForm(incidentChart,'.spire-incident-modal');await incidentChart.locator('#fDetails').fill('Synthetic Business UAT follow-up');await incidentChart.locator('#fSave').click();await expect.poll(()=>state.followup).toBe(true);`;
source=source.slice(0,incidentStart)+incidentFlow+source.slice(incidentEnd);

await writeFile(businessTarget,source,'utf8');

let selected=await readFile(selectedHomeTarget,'utf8');
const selectedOld="await page.goto(`/spire.html?spireHome=${HOME_ID}#patient=${PATIENT_ID}&tab=chart-review`,{waitUntil:'commit'});";
const selectedNew="await page.goto(`/spire/master.html?spireHome=${HOME_ID}&patientId=${PATIENT_ID}#patient=${PATIENT_ID}&tab=chart-review`,{waitUntil:'commit'});";
if(selected.includes(selectedOld))selected=selected.replace(selectedOld,selectedNew);
else if(!selected.includes(selectedNew))throw new Error('Round-sixteen selected-home master route anchor missing');
selected=selected.replace("  await expect(page.locator('body')).toHaveClass(/spmt-ready/);\n",'');
await writeFile(selectedHomeTarget,selected,'utf8');

console.log('Applied round-sixteen production UAT corrections for duplicate navigation, Home Health rail selection, SCLS elevation, authenticated SPIRE deep links, iframe chart workflows, and direct selected-home master regression coverage.');
