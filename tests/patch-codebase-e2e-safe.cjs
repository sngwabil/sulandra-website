const fs = require('node:fs');
const file = '/e2e/codebase-railway-e2e-safe.mjs';
let source = fs.readFileSync(file, 'utf8');
source = source.replace(
  "pageErrors.push(String(error?.message || error))",
  "pageErrors.push(String(error?.stack || error?.message || error))",
);
source = source.replace(
  "await page.locator('#itwsSulandraCodebaseButton').waitFor({ state: 'visible', timeout: 30_000 });",
  "await page.waitForFunction(() => window.SulandraDockableWorkspace && window.SulandraCodebase, null, { timeout: 30_000 });\n    await page.evaluate(() => window.SulandraDockableWorkspace.show('terminal'));\n    await page.locator('#itwsSulandraCodebaseButton').waitFor({ state: 'visible', timeout: 15_000 });",
);
fs.writeFileSync(file, source, 'utf8');
