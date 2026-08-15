import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const IMPORT = "import { registerMedicationSafetyRoutes } from './spire-medication-safety-routes.js';";
const REGISTRATION = 'registerMedicationSafetyRoutes(app, prisma, { authOf });';

let source = await readFile(bootstrapPath, 'utf8');

if (!source.includes(IMPORT)) {
  const importAnchor = "import { registerCareersRoutes } from './careers-routes.js';";
  if (!source.includes(importAnchor)) throw new Error('SPIRE medication safety installer: careers import anchor is missing');
  source = source.replace(importAnchor, `${importAnchor}\n${IMPORT}`);
}

if (!source.includes(REGISTRATION)) {
  const registrationAnchor = 'registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });';
  if (!source.includes(registrationAnchor)) throw new Error('SPIRE medication safety installer: API registration anchor is missing');
  source = source.replace(registrationAnchor, `${REGISTRATION}\n${registrationAnchor}`);
}

if (!source.includes(IMPORT) || !source.includes(REGISTRATION)) {
  throw new Error('SPIRE medication safety routes were not installed into the API bootstrap');
}

await writeFile(bootstrapPath, source, 'utf8');
console.log('SPIRE structured medication-ordering and MAR safety routes installed into the API bootstrap.');
