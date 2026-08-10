import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'tests/production-business-path-uat.spec.mjs');
let source = await readFile(target, 'utf8');

function replaceExact(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Round-eight business UAT anchor missing: ${label}`);
  source = source.replace(from, to);
}

// Offer Acceptance has both an H1 and H2 containing the same phrase.
replaceExact(
  "page.getByRole('heading',{name:/Offer of Employment/i})",
  "page.getByRole('heading',{name:'Offer of Employment',exact:true})",
  'Offer Acceptance exact heading',
);

// Intake shows the submitted state in both the case rail and open workspace.
replaceExact(
  "page.locator('.status.SUBMITTED')",
  "page.locator('#workspace .status.SUBMITTED')",
  'Client Intake submitted workspace status',
);

// Task Board options are populated asynchronously from the selected company.
replaceExact(
  "await clickVisible(page,'#newTask');await fillVisibleForm(page,'#taskDialog');await page.locator('#taskHome').selectOption(home.id);",
  "await expect.poll(async()=>page.locator('#taskHome option').count()).toBeGreaterThan(0);await clickVisible(page,'#newTask');await expect(page.locator('#taskDialog')).toBeVisible();await fillVisibleForm(page,'#taskDialog');await page.locator('#taskHome').selectOption(home.id);",
  'SCLS Task Board initialization readiness',
);

// Use the dedicated employee-portal referral launcher so hospital referrals go
// straight to the operational review inbox without relying on a cached subpage.
replaceExact(
  "await employeeLogin(page,ACTORS.hhRn);await clickVisible(page,'#employeeHomeHealthOperationsLauncher');await clickVisible(page,'#homeHealthReferralInboxLink');",
  "await employeeLogin(page,ACTORS.hhRn);await clickVisible(page,'#employeeHomeHealthReferralInboxLauncher');",
  'Home Health direct Referral Inbox launcher',
);

// The real dispatcher only offers vehicles that explicitly support the order's
// service level.
replaceExact(
  "const vehicle={id:'biz-vehicle',name:'Synthetic Van',status:'ACTIVE',licensePlate:'UAT001'};",
  "const vehicle={id:'biz-vehicle',name:'Synthetic Van',vehicleNumber:'UAT-001',status:'ACTIVE',active:true,licensePlate:'UAT001',make:'Synthetic',model:'Accessible Van',serviceLevels:['AMBULATORY'],wheelchairCapacity:1,ambulatoryCapacity:4};",
  'NMT dispatch-compatible vehicle fixture',
);

// Workforce Administration posts an action enum, not the resulting status.
replaceExact(
  "if(path===`/api/admin/workforce/timesheets/biz-sheet/status`&&method==='POST'){if(body.status==='APPROVED')state.approved=true;return{expectedMutation:true,data:{data:sheet()}};}",
  "if(path===`/api/admin/workforce/timesheets/biz-sheet/status`&&method==='POST'){if(body.action==='APPROVE')state.approved=true;return{expectedMutation:true,data:{data:sheet()}};}",
  'Workforce timesheet approval action contract',
);

// Scope ACTIVE verification to the rendered compliance register, not hidden
// select options elsewhere on the page.
replaceExact(
  "page.getByText(/ACTIVE/i).first()",
  "page.locator('#list .status.ACTIVE').first()",
  'Company Compliance resolved ACTIVE status',
);

// Make the SPIRE chart-open boundary explicit in both medication and incident
// paths. The chart-first product hardening guarantees this workspace exists
// before auxiliary storyboard/context rendering can fail.
replaceExact(
  "await expect(page.locator('#spirePatientStrip')).toBeVisible();const marTab=page.locator('[data-chart-tab=\"mar\"]');",
  "await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);const marTab=page.locator('[data-chart-tab=\"mar\"]');",
  'eMAR chart workspace readiness',
);
replaceExact(
  "await expect(page.locator('#spirePatientStrip')).toBeVisible();await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  "await expect(page.locator('#spirePatientStrip')).toBeVisible();await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);await clickVisible(page,'[data-chart-tab=\"incidents\"]');",
  'Incident chart workspace readiness',
);

await writeFile(target, source, 'utf8');
console.log('Applied round-eight business UAT corrections: exact offer/intake/compliance selectors, Task Board readiness, direct Home Health Referral Inbox launch, NMT service-level vehicle, Workforce approval action, and explicit SPIRE chart-workspace readiness.');
