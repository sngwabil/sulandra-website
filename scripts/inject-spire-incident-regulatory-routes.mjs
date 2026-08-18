import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','dist','onboarding-bootstrap.js');
let source=await readFile(target,'utf8');
const importAnchor="import { registerCareersRoutes } from './careers-routes.js';";
const callAnchor='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const importLine="import { registerSpireIncidentRegulatoryRoutes } from './spire-incident-regulatory-routes.js';";
const callLine='registerSpireIncidentRegulatoryRoutes(app, prisma, { authOf });';
if(!source.includes(importAnchor)||!source.includes(callAnchor))throw new Error('Ohio incident compliance injector could not locate careers route anchors');
if(!source.includes(importLine))source=source.replace(importAnchor,`${importAnchor}\n${importLine}`);
source=source.replace(new RegExp(`\\n?${callLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
source=source.replace(callAnchor,`${callLine}\n${callAnchor}`);
await writeFile(target,source,'utf8');
console.log('Ohio MUI/UI compliance routes injected before the existing SPIRE incident route owner; close and reporting guards remain companion middleware.');
