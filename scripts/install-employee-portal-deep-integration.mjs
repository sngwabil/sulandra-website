import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'employee-portal.html');
let html=await readFile(target,'utf8');
html=html.replace(/\s*<script src="\/assets\/employee-portal-deep-integration\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
if(!html.includes('</body>'))throw new Error('Unable to install live Employee Portal integration');
html=html.replace('</body>','<script src="/assets/employee-portal-deep-integration.js?v=20260807-live-modules-1"></script>\n</body>');
await writeFile(target,html,'utf8');
console.log('Employee Portal demo workflows are redirected to live Time & Attendance, Documents, Education, Health & Safety, and Support modules.');
