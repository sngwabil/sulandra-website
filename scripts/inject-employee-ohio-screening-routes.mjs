import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','dist','onboarding-bootstrap.js');
let source=await readFile(target,'utf8');
const importAnchor="import { registerServiceHomeManagementRoutes } from './service-home-management-routes.js';";
const callAnchor='registerServiceHomeManagementRoutes({ app, prisma, authOf, requireRoles });';
const importLine="import { registerEmployeeOhioScreeningRoutes } from './employee-ohio-screening-routes.js';";
const callLine='registerEmployeeOhioScreeningRoutes(app, prisma, { authOf });';
if(!source.includes(importAnchor)||!source.includes(callAnchor))throw new Error('Ohio screening injector could not locate service-home route anchors');
if(!source.includes(importLine))source=source.replace(importAnchor,`${importLine}\n${importAnchor}`);
source=source.replace(new RegExp(`\\n?${callLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
source=source.replace(callAnchor,`${callLine}\n${callAnchor}`);
if(source.indexOf(callLine)>source.indexOf(callAnchor))throw new Error('Ohio screening route must be registered before service-home assignment routes');
await writeFile(target,source,'utf8');
console.log('Ohio workforce screening routes registered before service-home assignment routes; SCLS assignment remains fail-closed on screening readiness.');
