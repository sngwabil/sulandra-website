import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','dist','onboarding-bootstrap.js');
let source=await readFile(target,'utf8');
const importAnchor="import { registerHomeHealthOperationsRoutes } from './home-health-operations-routes.js';";
const callAnchor='registerHomeHealthOperationsRoutes(app, prisma, { authOf, audit });';
const importLine="import { registerHomeHealthRegulatedCoreRoutes } from './home-health-regulated-core-routes.js';";
const callLine='registerHomeHealthRegulatedCoreRoutes(app, prisma, { authOf, audit });';
if(!source.includes(importAnchor)||!source.includes(callAnchor))throw new Error('Home Health regulated-core injector could not locate Home Health operations route anchors');
if(!source.includes(importLine))source=source.replace(importAnchor,`${importLine}\n${importAnchor}`);
source=source.replace(new RegExp(`\\n?${callLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
source=source.replace(callAnchor,`${callLine}\n${callAnchor}`);
await writeFile(target,source,'utf8');
console.log('Home Health regulated-core routes registered before the existing Home Health operations routes.');

// The spec-driven OASIS/iQIES routes intentionally register ahead of the
// regulated-core compatibility handlers so the real edit engine/export path
// owns duplicate OASIS endpoints at runtime.
await import('./inject-home-health-oasis-iqies-routes.mjs');
