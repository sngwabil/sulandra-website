import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'tests/production-business-path-uat.spec.mjs');
let source = await readFile(target, 'utf8');

function replaceExact(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Round-ten business UAT anchor missing: ${label}`);
  source = source.replace(from, to);
}

// The Client Intake page contains an APPROVED <option> in its status filter.
// Prove the actual visible intake status badge instead of matching that hidden option.
replaceExact(
  "await expect(page).toHaveURL(/\\/client-intake\\.html/);await expect(page.getByText(/APPROVED/i).first()).toBeVisible();",
  "await expect(page).toHaveURL(/\\/client-intake\\.html/);await expect(page.locator('.status.APPROVED').first()).toBeVisible();",
  'Home Health intake visible APPROVED status',
);

// Make the Incident path prove that the authorized census row is present before
// using the real row click that opens the chart. Product-side patient-click recovery
// handles any competing SPIRE enhancement listeners without test-only shortcuts.
replaceExact(
  "await clickVisible(page,'[data-workspace=\"census\"]');await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await expect(page.locator('#spirePatientStrip')).toBeVisible();",
  "await clickVisible(page,'[data-workspace=\"census\"]');await expect(page.locator(`[data-patient-id=\"${patient.id}\"]`)).toBeVisible();await clickVisible(page,`[data-patient-id=\"${patient.id}\"]`);await expect(page.locator('#spirePatientStrip')).toBeVisible();",
  'Incident authorized census-row readiness',
);

await writeFile(target, source, 'utf8');
console.log('Applied round-ten business UAT corrections: visible Home Health intake approval status and explicit Incident census-row readiness while preserving real UI chart opening.');
