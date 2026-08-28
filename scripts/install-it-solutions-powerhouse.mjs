import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','src','onboarding-bootstrap.ts');
const importLine="import { registerITSolutionsRoutes } from './it-solutions-routes.js';";
const registerLine='registerITSolutionsRoutes({ app, prisma, authOf, requireRoles });';
const siaImport="import { registerSIARoutes } from './sia-routes.js';";
const siaRegister='registerSIARoutes({ app, prisma, authOf, requireRoles });';
let source=await readFile(target,'utf8');
if(!source.includes(importLine)){if(!source.includes(siaImport))throw new Error('SIA import anchor missing for IT Solutions');source=source.replace(siaImport,`${siaImport}\n${importLine}`)}
source=source.replaceAll(registerLine,'');
if(!source.includes(siaRegister))throw new Error('SIA registration anchor missing for IT Solutions');
source=source.replace(siaRegister,`${siaRegister}\n${registerLine}`);
await writeFile(target,source,'utf8');
await import('./verify-it-solutions-powerhouse.mjs');
console.log('IT Solutions routes registered after SIA and verified.');