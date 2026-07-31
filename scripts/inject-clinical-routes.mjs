import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const target = path.join(repositoryRoot, 'api', 'dist', 'onboarding-bootstrap.js');
let source = await readFile(target, 'utf8');

const importMarker = "import { registerCareersRoutes } from './careers-routes.js';";
const callMarker = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const clinicalImport = "import { registerClinicalRoutes } from './clinical-routes.js';";
const clinicalCall = 'registerClinicalRoutes(app, prisma, { authOf });';

if (!source.includes(importMarker)) {
  throw new Error(`Clinical route injection failed: import marker not found in ${target}`);
}
if (!source.includes(callMarker)) {
  throw new Error(`Clinical route injection failed: registration marker not found in ${target}`);
}

if (!source.includes(clinicalImport)) {
  source = source.replace(importMarker, `${importMarker}\n${clinicalImport}`);
}
if (!source.includes(clinicalCall)) {
  source = source.replace(callMarker, `${clinicalCall}\n${callMarker}`);
}

await writeFile(target, source, 'utf8');
console.log(`Registered Spire clinical routes in ${target}.`);
