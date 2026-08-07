import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'dist-web','employee-portal.html');
let html=await readFile(target,'utf8');
const asset='<script src="/assets/employee-portal-live-bridge.js?v=20260807-live-1"></script>';
html=html
  .replace(/Quick punch \(demo\)/g,'Live Time & Attendance')
  .replace(/Weekly entry \(demo\)/g,'Live payroll-period timekeeping')
  .replace(/Secure uploads \(demo\)/g,'Live secure document center')
  .replace(/\s*<script src="\/assets\/employee-portal-live-bridge\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
if(!html.includes('</body>'))throw new Error('Unable to install live Employee Portal bridge');
html=html.replace('</body>',`${asset}\n</body>`);
await writeFile(target,html,'utf8');
console.log('Legacy Employee Portal cards now route into live Time & Attendance, Documents, Health & Safety, Education, and Support modules.');
