import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const employeePortalPath = path.join(root, 'dist-web', 'employee-portal.html');
const version = '20260806-employee-self-service-1';

try {
  let html = await readFile(employeePortalPath, 'utf8');
  html = html.replace(/\s*<script src="\/assets\/employee-self-service-records\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  if (!html.includes('</body>')) throw new Error('dist-web/employee-portal.html is missing a closing body tag');
  html = html.replace('</body>', `  <script src="/assets/employee-self-service-records.js?v=${version}"></script>\n</body>`);
  await writeFile(employeePortalPath, html, 'utf8');
  console.log('Employee Portal approved-record self-service installed.');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
