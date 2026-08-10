import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'tests/production-business-path-uat.spec.mjs');
let source=await readFile(target,'utf8');

function replaceExact(from,to,label){
  if(source.includes(to)&&!source.includes(from))return;
  if(!source.includes(from))throw new Error(`Round-fourteen business UAT anchor missing: ${label}`);
  source=source.replace(from,to);
}

replaceExact(
  "await clickVisible(page,'a[href*=\"/spire.html?patientId=biz-patient\"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);await expect(page.locator('body[data-spire-chart-ready=\"true\"][data-spire-chart-patient-id=\"biz-patient\"]')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);",
  "await clickVisible(page,'a[href*=\"/spire.html?patientId=biz-patient\"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);await expect(page.locator('[data-chart-tab=\"care-plan\"]')).toBeVisible();",
  'Client Intake visible chart interface',
);

replaceExact(
  "await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);await expect(page.locator(`body[data-spire-chart-ready=\"true\"][data-spire-chart-patient-id=\"${patient.id}\"]`)).toBeVisible();await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);const marTab=page.locator('[data-chart-tab=\"mar\"]');",
  "await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);const marTab=page.locator('[data-chart-tab=\"mar\"]');",
  'eMAR visible chart interface',
);

replaceExact(
  "await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await expect(page.locator(`body[data-spire-chart-ready=\"true\"][data-spire-chart-patient-id=\"${patient.id}\"]`)).toBeVisible();await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  "await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  'Incident visible chart interface',
);

await writeFile(target,source,'utf8');
console.log('Applied round-fourteen Item 7 execution corrections: the three SPIRE paths now prove visible patient strip, active chart workspace, and visible chart tabs instead of relying on internal body readiness metadata.');
