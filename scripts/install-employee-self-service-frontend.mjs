import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const employeePortalPath = path.join(root, 'dist-web', 'employee-portal.html');
const version = '20260806-employee-collaboration-self-service-1';

try {
  let html = await readFile(employeePortalPath, 'utf8');
  html = html
    .replace(/\s*<script src="\/assets\/employee-self-service-records\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-compliance-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
    .replace(/\s*<script src="\/assets\/employee-collaboration-self-service\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  if (!html.includes('</body>')) throw new Error('dist-web/employee-portal.html is missing a closing body tag');
  html = html.replace('</body>', `  <script src="/assets/employee-self-service-records.js?v=${version}"></script>\n  <script src="/assets/employee-compliance-self-service.js?v=${version}"></script>\n  <script src="/assets/employee-collaboration-self-service.js?v=${version}"></script>\n</body>`);
  await writeFile(employeePortalPath, html, 'utf8');
  console.log('Employee Portal approved records, compliance self-service, My Workplace requests, feedback, recognition, and notifications installed.');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
