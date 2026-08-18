import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','dist','onboarding-bootstrap.js');
let source=await readFile(target,'utf8');
const importAnchor="import { registerCareersRoutes } from './careers-routes.js';";
const callAnchor='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const importLine="import { registerCompanyComplianceQaRoutes } from './company-compliance-qa-routes.js';";
const callLine='registerCompanyComplianceQaRoutes(app, prisma, { authOf, audit });';
if(!source.includes(importAnchor)||!source.includes(callAnchor))throw new Error('Company Compliance QA injector could not locate Careers route anchors');
if(!source.includes(importLine))source=source.replace(importAnchor,`${importLine}\n${importAnchor}`);
source=source.replace(new RegExp(`\\n?${callLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
source=source.replace(callAnchor,`${callLine}\n${callAnchor}`);
await writeFile(target,source,'utf8');
const page=path.join(root,'company-compliance.html');
let html=await readFile(page,'utf8');
const script='<script src="/assets/company-compliance-qa.js?v=20260818-phase-c2-1"></script>';
if(!html.includes(script)){
 if(!html.includes('</body>'))throw new Error('Company Compliance page is missing </body>');
 html=html.replace('</body>',`${script}</body>`);
 await writeFile(page,html,'utf8');
}
console.log('SPIRE 1.1 Company Compliance QA routes registered before Careers; Regulatory QA & Audit Packets panel attached to the existing Company Compliance page.');
