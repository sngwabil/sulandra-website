import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(repoRoot, 'api', 'dist', 'onboarding-bootstrap.js');
let source = await readFile(bootstrapPath, 'utf8');

const importNeedle = "import { registerClinicalRoutes } from './clinical-routes.js';";
const importLine = "import { registerSpireCareWorkstationRoutes } from './spire-care-workstation-routes.js';";
if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) throw new Error('Could not find clinical-routes import in compiled API bootstrap');
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const registerNeedle = 'registerClinicalRoutes(app, prisma, { authOf });';
const registerLine = 'registerSpireCareWorkstationRoutes(app, prisma, { authOf });';
if (!source.includes(registerLine)) {
  if (!source.includes(registerNeedle)) throw new Error('Could not find clinical route registration in compiled API bootstrap');
  source = source.replace(registerNeedle, `${registerNeedle}\n${registerLine}`);
}

await writeFile(bootstrapPath, source, 'utf8');
console.log('SPIRE care workstation routes wired into compiled Railway API bundle.');
