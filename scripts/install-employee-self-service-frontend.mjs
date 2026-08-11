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

// These run during build:web before the API TypeScript build, so the applicant
// workspace, applicant folder, document routing, interview review, and career
// application contracts are installed together and deployed as one system.
await import('./install-applicant-document-upload-v2.mjs');
await import('./install-applicant-folder-review-v2.mjs');
await import('./install-careers-current-employment.mjs');
