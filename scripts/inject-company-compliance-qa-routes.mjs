import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','dist','onboarding-bootstrap.js');
let source=await readFile(target,'utf8');
const importAnchor="import { registerCareersRoutes } from './careers-routes.js';";
const callAnchor='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const importLines=[
  "import { registerCompanyComplianceQaRoutes } from './company-compliance-qa-routes.js';",
  "import { registerCompanyComplianceTrendRoutes } from './company-compliance-trend-routes.js';",
];
const callLines=[
  'registerCompanyComplianceQaRoutes(app, prisma, { authOf, audit });',
  'registerCompanyComplianceTrendRoutes(app, prisma, { authOf, audit });',
];
if(!source.includes(importAnchor)||!source.includes(callAnchor))throw new Error('Company Compliance QA/trend injector could not locate Careers route anchors');
for(const line of importLines)if(!source.includes(line))source=source.replace(importAnchor,`${line}\n${importAnchor}`);
for(const line of callLines)source=source.replace(new RegExp(`\\n?${line.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
source=source.replace(callAnchor,`${callLines.join('\n')}\n${callAnchor}`);
await writeFile(target,source,'utf8');
const page=path.join(root,'company-compliance.html');
let frontendAttached=false;
try{
  let html=await readFile(page,'utf8');
  const scripts=[
    '<script src="/assets/company-compliance-qa.js?v=20260818-phase-c2-1"></script>',
    '<script src="/assets/company-compliance-trends.js?v=20260818-phase-c3-1"></script>',
  ];
  for(const script of scripts){
    if(html.includes(script))continue;
    if(!html.includes('</body>'))throw new Error('Company Compliance page is missing </body>');
    html=html.replace('</body>',`${script}</body>`);
  }
  await writeFile(page,html,'utf8');
  frontendAttached=true;
}catch(error){
  if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw error;
}
if(frontendAttached){
  console.log('SPIRE 1.1 Company Compliance QA + annual trend routes registered before Careers; QA packets and annual trend/export panels attached to the existing Company Compliance page.');
}else{
  console.log('SPIRE 1.1 Company Compliance QA + annual trend routes registered before Careers; frontend page injection skipped because company-compliance.html is not present in this backend build image.');
}
