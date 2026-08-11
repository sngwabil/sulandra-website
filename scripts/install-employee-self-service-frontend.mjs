import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const employeePortalPath = path.join(root, 'dist-web', 'employee-portal.html');
const version = '20260806-employee360-enterprise-self-service-1';

try {
  let html = await readFile(employeePortalPath, 'utf8');
  html = html
    .replace(/\s*<script src="\/assets\/employee-self-service-records\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-compliance-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-collaboration-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-performance-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-compensation-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-leave-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-assets-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-documents-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-workflows-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-communications-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-engagement-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-learning-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-health-safety-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee360-enterprise-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  if (!html.includes('</body>')) throw new Error('dist-web/employee-portal.html is missing a closing body tag');
  html = html.replace('</body>', `  <script src="/assets/employee-self-service-records.js?v=${version}"></script>\n  <script src="/assets/employee-compliance-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-collaboration-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-performance-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-compensation-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-leave-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-assets-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-documents-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-workflows-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-communications-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-engagement-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-learning-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-health-safety-self-service.js?v=${version}"></script>\n  <script src="/assets/employee360-enterprise-self-service.js?v=${version}"></script>\n</body>`);
  await writeFile(employeePortalPath, html, 'utf8');
  console.log('Employee Portal approved records, compliance, workplace, performance, pay, leave, assets, access, documents, policies, e-signatures, workflow automation, assigned tasks, communications, announcements, notifications, engagement surveys, feedback, recognition, learning, training, development, health, safety, incident reporting, wellness, assignments, communication timeline, and security history installed.');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

// Admin Employee 360 must not start before the selected legal-company context is
// available. admin-company-context.js used to initialize context and load the
// canonical shell in parallel, which allowed Employee Management to make its
// first protected request before X-Legal-Entity-Id existed. The failed request
// left an Authentication required banner even though the administrator session
// itself was valid. Serialize the startup in the published static asset.
const adminCompanyContextPath = path.join(root, 'dist-web', 'assets', 'admin-company-context.js');
try {
  let source = await readFile(adminCompanyContextPath, 'utf8');
  const oldStart = `  const start = () => {\n    initialize().catch(() => undefined);\n    loadCanonicalShell().catch(error => console.error('[Canonical Admin Shell]', error));\n  };`;
  const newStart = `  const start = async () => {\n    try { await initialize(); } catch (_) {}\n    loadCanonicalShell().catch(error => console.error('[Canonical Admin Shell]', error));\n  };`;
  if (source.includes(oldStart)) {
    source = source.replace(oldStart, newStart);
    await writeFile(adminCompanyContextPath, source, 'utf8');
    console.log('Admin Employee 360 startup now waits for authenticated company context before loading protected modules.');
  } else if (!source.includes(newStart)) {
    throw new Error('Unable to verify Admin company-context startup ordering in dist-web');
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

// Patch the published Employee Management asset itself. The transient red
// Authentication required banner came from its first request racing startup.
// Keep genuine persistent auth failures visible, but include the selected-company
// header and silently retry only a brief authenticated boot-time 401.
await import('./fix-admin-employee-auth-flash.mjs');

// Preserve the Employee Directory as the owner of the Employees module. Specialty
// centers must not replace #module-employees, and all of them must share the same
// canonical Admin token and selected-company request context.
await import('./fix-admin-employee-suite-mounting.mjs');

// These run during build:web before the API TypeScript build, so the applicant
// workspace, applicant folder, document routing, interview review, and career
// application contracts are installed together and deployed as one system.
await import('./install-applicant-document-upload-v2.mjs');
await import('./install-applicant-folder-review-v2.mjs');
await import('./install-careers-current-employment.mjs');
await import('./publish-applicant-review-ui.mjs');

// Final pass must touch the actual dist-web bundle Railway serves. Earlier fixes
// mutated source assets after build-static-site had already copied them, which
// allowed a green deployment to keep serving stale Employee 360 JavaScript.
await import('./fix-admin-published-runtime.mjs');
