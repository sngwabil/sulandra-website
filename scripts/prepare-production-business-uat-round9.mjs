import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'tests/production-business-path-uat.spec.mjs');
let source = await readFile(target, 'utf8');

function replaceExact(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Round-nine business UAT anchor missing: ${label}`);
  source = source.replace(from, to);
}

function replaceAllExact(from, to, label) {
  if (!source.includes(from) && source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Round-nine business UAT anchor missing: ${label}`);
  source = source.split(from).join(to);
}

// Client Intake arrives at SPIRE through a direct patient link. Prove the chart
// workspace is actually open before selecting Care Plan / ISP.
replaceExact(
  "await clickVisible(page,'a[href*=\"/spire.html?patientId=biz-patient\"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);\n  await clickVisible(page,'[data-chart-tab=\"care-plan\"]');",
  "await clickVisible(page,'a[href*=\"/spire.html?patientId=biz-patient\"]');await expect(page).toHaveURL(/\\/spire\\.html\\?patientId=biz-patient/);await expect(page.locator('#spireChartWorkspace')).toHaveClass(/active/);\n  await clickVisible(page,'[data-chart-tab=\"care-plan\"]');",
  'Client Intake SPIRE chart-open readiness',
);

// The Task Board has static placeholder options before its async load completes.
// Wait for the real synthetic home option so #newTask has definitely been wired.
replaceExact(
  "await expect.poll(async()=>page.locator('#taskHome option').count()).toBeGreaterThan(0);await clickVisible(page,'#newTask');",
  "await expect(page.locator(`#homeFilter option[value=\"${home.id}\"]`)).toHaveCount(1);await clickVisible(page,'#newTask');",
  'SCLS Task Board real-home readiness',
);

// Home Health Referral Inbox uses the admin-scoped operational routes.
replaceAllExact(
  "/api/home-health/referrals/context",
  "/api/admin/home-health/referral-context",
  'Home Health referral context route',
);
replaceAllExact(
  "/api/home-health/referrals/${referral.id}/review",
  "/api/admin/home-health/referrals/${referral.id}/review",
  'Home Health referral review route',
);
replaceAllExact(
  "/api/home-health/referrals/${referral.id}",
  "/api/admin/home-health/referrals/${referral.id}",
  'Home Health referral detail route',
);
replaceAllExact(
  "/api/home-health/referrals'&&method==='GET'",
  "/api/admin/home-health/referrals'&&method==='GET'",
  'Home Health referral list route',
);

// Workforce navigation is a real page transition. Wait for it before asserting
// page initialization so a fast assertion cannot race location assignment.
replaceExact(
  "await clickVisible(page,'#employeeWorkforceLauncher');await expect(page.locator('#company')).not.toContainText(/Loading company/i);",
  "await clickVisible(page,'#employeeWorkforceLauncher');await expect(page).toHaveURL(/\\/workforce\\.html$/);await expect(page.locator('#company')).not.toContainText(/Loading company/i);",
  'Workforce employee-page navigation readiness',
);

await writeFile(target, source, 'utf8');
console.log('Applied round-nine business UAT corrections: Client Intake chart-open readiness, real SCLS Task Board initialization, admin-scoped Home Health referral APIs, and deterministic Workforce navigation.');
