import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'dist-web', 'admin.html');
const employeeAssetPath = path.join(root, 'dist-web', 'assets', 'admin-employee-management.js');
const version = '20260806-employee360-collaboration-1';

let html = await readFile(adminPath, 'utf8');
html = html
  .replace(/\s*<script src="\/assets\/admin-employee-permissions\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/admin-employee-management\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/admin-employee-compliance\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace(/\s*<script src="\/assets\/admin-employee-collaboration\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');

if (!html.includes('id="module-employees"')) {
  const employeeModule = `
        <!-- Employee 360 Module -->
        <section class="card module" id="module-employees" aria-label="Employee management workspace">
          <h1>Employees</h1>
          <p class="sub">Loading employee directory, scoped permissions, compliance, manager collaboration, approval workflows, feedback, recognition, education, timekeeping, communications, and account tools…</p>
        </section>

`;
  const onboardingAnchor = '        <!-- Onboarding Module (Primary Suite) -->';
  const settingsAnchor = '        <!-- Settings Module -->';
  if (html.includes(onboardingAnchor)) {
    html = html.replace(onboardingAnchor, `${employeeModule}${onboardingAnchor}`);
  } else if (html.includes(settingsAnchor)) {
    html = html.replace(settingsAnchor, `${employeeModule}${settingsAnchor}`);
  } else {
    throw new Error('Unable to locate an insertion point for the Employee 360 module');
  }
}

if (!html.includes('</body>')) throw new Error('dist-web/admin.html is missing a closing body tag');
html = html.replace('</body>', `  <script src="/assets/admin-employee-permissions.js?v=${version}"></script>\n  <script src="/assets/admin-employee-management.js?v=${version}"></script>\n  <script src="/assets/admin-employee-compliance.js?v=${version}"></script>\n  <script src="/assets/admin-employee-collaboration.js?v=${version}"></script>\n</body>`);
await writeFile(adminPath, html, 'utf8');

let employeeAsset = await readFile(employeeAssetPath, 'utf8');
if (!employeeAsset.includes("document.getElementById('module-employees')")) {
  const findHostAnchor = `  function findHost() {\n    const heading = [...document.querySelectorAll('h1,h2,h3')]`;
  const fixedFindHost = `  function findHost() {\n    const explicitHost = document.getElementById('module-employees');\n    if (explicitHost) return explicitHost;\n    const heading = [...document.querySelectorAll('h1,h2,h3')]`;
  if (!employeeAsset.includes(findHostAnchor)) {
    throw new Error('Unable to patch the Employee 360 host lookup');
  }
  employeeAsset = employeeAsset.replace(findHostAnchor, fixedFindHost);
}
await writeFile(employeeAssetPath, employeeAsset, 'utf8');

console.log('Employee 360 permissions, management, compliance, Team Hub, approvals, feedback, recognition, and workflow controls added to the static Admin portal.');
