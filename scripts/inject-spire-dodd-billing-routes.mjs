import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','dist','onboarding-bootstrap.js');
let source=await readFile(target,'utf8');
const importAnchor="import { registerRevenueCycleRoutes } from './revenue-cycle-routes.js';";
const callAnchor='registerRevenueCycleRoutes(app, prisma, { authOf, audit });';
const importLine="import { registerSpireDoddBillingRuleRoutes } from './spire-dodd-billing-rule-routes.js';";
const callLine='registerSpireDoddBillingRuleRoutes(app, prisma, { authOf });';
if(!source.includes(importAnchor)||!source.includes(callAnchor))throw new Error('DODD billing injector could not locate Revenue Cycle route anchors');
if(!source.includes(importLine))source=source.replace(importAnchor,`${importLine}\n${importAnchor}`);
source=source.replace(new RegExp(`\\n?${callLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
source=source.replace(callAnchor,`${callLine}\n${callAnchor}`);
await writeFile(target,source,'utf8');
console.log('SPIRE 1.1 date-effective DODD billing rule gate registered before the canonical Revenue Cycle routes.');
