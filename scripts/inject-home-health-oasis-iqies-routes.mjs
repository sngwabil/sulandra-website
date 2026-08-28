import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','dist','onboarding-bootstrap.js');
let source=await readFile(target,'utf8');
const importAnchor="import { registerHomeHealthRegulatedCoreRoutes } from './home-health-regulated-core-routes.js';";
const callAnchor='registerHomeHealthRegulatedCoreRoutes(app, prisma, { authOf, audit });';
const importLine="import { registerHomeHealthOasisIqiesRoutes } from './home-health-oasis-iqies-routes.js';";
const callLine='registerHomeHealthOasisIqiesRoutes(app, prisma, { authOf, audit });';
if(!source.includes(importAnchor)||!source.includes(callAnchor))throw new Error('OASIS/iQIES injector could not locate regulated-core route anchors');
if(!source.includes(importLine))source=source.replace(importAnchor,`${importLine}\n${importAnchor}`);
source=source.replace(new RegExp(`\\n?${callLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
source=source.replace(callAnchor,`${callLine}\n${callAnchor}`);
await writeFile(target,source,'utf8');
console.log('Spec-driven OASIS/iQIES routes registered before legacy regulated-core OASIS handlers.');
