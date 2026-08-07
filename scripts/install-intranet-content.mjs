import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','src','onboarding-bootstrap.ts');
let source=await readFile(target,'utf8');
const importLine="import { registerIntranetContentRoutes } from './intranet-content-routes.js';";
if(!source.includes(importLine)){
  const anchor="import { registerCareersRoutes } from './careers-routes.js';";
  if(!source.includes(anchor))throw new Error('Unable to locate Careers import anchor for intranet content registration');
  source=source.replace(anchor,`${importLine}\n${anchor}`);
}
const registerLine='registerIntranetContentRoutes({ app, prisma, authOf, requireRoles });';
if(!source.includes(registerLine)){
  const anchor='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
  if(!source.includes(anchor))throw new Error('Unable to locate Careers registration anchor for intranet content registration');
  source=source.replace(anchor,`${registerLine}\n\n${anchor}`);
}
await writeFile(target,source,'utf8');
console.log('Managed intranet content, slideshow settings, and image-upload routes are registered before Careers.');
