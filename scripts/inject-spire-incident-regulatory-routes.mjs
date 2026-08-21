import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','dist','onboarding-bootstrap.js');
let source=await readFile(target,'utf8');
const importAnchor="import { registerCareersRoutes } from './careers-routes.js';";
const callAnchor='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const importLines=[
  "import { registerSpireIncidentRegulatoryRoutes } from './spire-incident-regulatory-routes.js';",
  "import { registerSpireIncidentOitmsHandoffRoutes } from './spire-incident-oitms-handoff-routes.js';",
];
const callLines=[
  'registerSpireIncidentRegulatoryRoutes(app, prisma, { authOf });',
  'registerSpireIncidentOitmsHandoffRoutes(app, prisma, { authOf });',
];
if(!source.includes(importAnchor)||!source.includes(callAnchor))throw new Error('Ohio incident compliance injector could not locate careers route anchors');
for(const line of importLines)if(!source.includes(line))source=source.replace(importAnchor,`${importAnchor}\n${line}`);
for(const line of callLines)source=source.replace(new RegExp(`\\n?${line.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
source=source.replace(callAnchor,`${callLines.join('\n')}\n${callAnchor}`);
await writeFile(target,source,'utf8');
const page=path.join(root,'spire-incident-compliance.html');
let frontendAttached=false;
try{
  let html=await readFile(page,'utf8');
  const handoffScript='<script src="/assets/spire-incident-oitms-handoff.js?v=20260818-phase-c4-1"></script>';
  if(!html.includes(handoffScript)){
    if(!html.includes('</body>'))throw new Error('SPIRE Incident Compliance page is missing </body>');
    html=html.replace('</body>',`${handoffScript}</body>`);
    await writeFile(page,html,'utf8');
  }
  frontendAttached=true;
}catch(error){
  if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw error;
}
console.log('Ohio MUI/UI compliance routes injected before the existing SPIRE incident route owner; close and reporting guards remain companion middleware.');
if(frontendAttached){
  console.log('OhioITMS handoff routes and MUI handoff panel installed in manual county-board handoff mode; no direct OITMS connector is claimed.');
}else{
  console.log('OhioITMS handoff routes registered in manual county-board handoff mode; frontend panel injection skipped because spire-incident-compliance.html is not present in this backend build image.');
}
