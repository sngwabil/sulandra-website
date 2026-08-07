import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','src','onboarding-bootstrap.ts');
let source=await readFile(target,'utf8');
const importLine="import { registerClientServiceRequestRoutes } from './client-service-request-routes.js';";
const careersImport="import { registerCareersRoutes } from './careers-routes.js';";
if(!source.includes(importLine)){
  if(!source.includes(careersImport))throw new Error('Unable to locate Careers import anchor for client service requests');
  source=source.replace(careersImport,`${importLine}\n${careersImport}`);
}
const registerLine='registerClientServiceRequestRoutes({ app, prisma, authOf, requireRoles, audit });';
const careersRegister='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
if(!source.includes(registerLine)){
  if(!source.includes(careersRegister))throw new Error('Unable to locate Careers registration anchor for client service requests');
  source=source.replace(careersRegister,`${registerLine}\n\n${careersRegister}`);
}
await writeFile(target,source,'utf8');
console.log('Public client service request intake and authenticated Admin review routes are registered before Careers.');
