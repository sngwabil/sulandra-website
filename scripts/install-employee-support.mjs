import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api/src/onboarding-bootstrap.ts');
const importLine="import { registerEmployeeSupportRoutes } from './employee-support-routes.js';";
const registerLine='registerEmployeeSupportRoutes({ app, prisma, authOf, requireRoles });';
const careersImport="import { registerCareersRoutes } from './careers-routes.js';";
const careersRegister='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
let source=await readFile(target,'utf8');
if(!source.includes(importLine)){
  if(!source.includes(careersImport))throw new Error('Unable to locate Careers import anchor for employee support routes');
  source=source.replace(careersImport,`${careersImport}\n${importLine}`);
}
source=source.replace(new RegExp(`\\n?${registerLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
if(!source.includes(careersRegister))throw new Error('Unable to locate Careers registration anchor for employee support routes');
source=source.replace(careersRegister,`${registerLine}\n\n${careersRegister}`);
await writeFile(target,source,'utf8');
console.log('Employee support request routes are registered before Careers.');

// SIA is part of the same authenticated employee-support surface. Chaining its
// idempotent installer here keeps API typecheck/build flows aligned without
// duplicating route registration commands across package scripts.
await import('./install-sia-routes.mjs');

// IT Solutions extends the canonical SIA support surface. Keep the richer 1.0
// SIA implementation intact, then register the section-9 IT routes immediately
// after SIA so every support workflow keeps the SIA-first diagnosis boundary.
await import('./install-it-solutions-powerhouse.mjs');
