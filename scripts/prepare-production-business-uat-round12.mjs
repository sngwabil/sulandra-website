import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'tests/production-business-path-uat.spec.mjs');
let source=await readFile(target,'utf8');

function replaceExact(from,to,label){
  if(source.includes(to))return;
  if(!source.includes(from))throw new Error(`Round-twelve business UAT anchor missing: ${label}`);
  source=source.replace(from,to);
}

replaceExact(
  "  page.__businessUat={unexpectedLiveMutations,expectedMutations};\n",
  "  page.__businessUat={unexpectedLiveMutations,expectedMutations};\n  page.on('pageerror',error=>console.error('[BUSINESS-UAT PAGE ERROR]',error.message));\n  page.on('console',message=>{if(message.type()==='error')console.error('[BUSINESS-UAT CONSOLE ERROR]',message.text());});\n",
  'Browser error diagnostics',
);

replaceExact(
  "await clickVisible(page,'a[href*=\"/spire.html?patientId=biz-patient\"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);",
  "await clickVisible(page,'a[href*=\"/spire.html?patientId=biz-patient\"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);await expect(page.locator('body[data-spire-chart-ready=\"true\"][data-spire-chart-patient-id=\"biz-patient\"]')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);",
  'Client Intake chart coordinator readiness',
);

replaceExact(
  "await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);const marTab=page.locator('[data-chart-tab=\"mar\"]');",
  "await page.getByRole('link',{name:/Open eMAR/i}).first().click();await expect(page).toHaveURL(/\\/spire\\.html/);await expect(page.locator(`body[data-spire-chart-ready=\"true\"][data-spire-chart-patient-id=\"${patient.id}\"]`)).toBeVisible();await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);const marTab=page.locator('[data-chart-tab=\"mar\"]');",
  'eMAR chart coordinator readiness',
);

replaceExact(
  "await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  "await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await expect(page.locator(`body[data-spire-chart-ready=\"true\"][data-spire-chart-patient-id=\"${patient.id}\"]`)).toBeVisible();await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  'Incident chart coordinator readiness',
);

replaceExact(
  "await openIntake.click();await expect(page).toHaveURL(/\\/client-intake\\.html/);await expect(page.locator('.status.APPROVED').first()).toBeVisible();",
  "await openIntake.click();await expect(page).toHaveURL(/\\/client-intake\\.html/);await expect(page.locator('#workspace .status.APPROVED').first()).toBeVisible();",
  'Home Health intake approved status scope',
);

await writeFile(target,source,'utf8');
console.log('Applied round-twelve business UAT corrections: browser error diagnostics, deterministic SPIRE chart coordinator readiness for Intake/eMAR/Incident, and scoped Home Health intake approval verification.');
