import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const safetyRoutesPath = path.join(root, 'api', 'src', 'spire-medication-safety-routes.ts');
const emarRoutesPath = path.join(root, 'api', 'src', 'spire-emar-routes.ts');
const IMPORT = "import { registerMedicationSafetyRoutes } from './spire-medication-safety-routes.js';";
const REGISTRATION = 'registerMedicationSafetyRoutes(app, prisma, { authOf });';

let source = await readFile(bootstrapPath, 'utf8');

if (!source.includes(IMPORT)) {
  const importAnchor = "import { registerCareersRoutes } from './careers-routes.js';";
  if (!source.includes(importAnchor)) throw new Error('SPIRE medication safety installer: careers import anchor is missing');
  source = source.replace(importAnchor, `${importAnchor}\n${IMPORT}`);
}

if (!source.includes(REGISTRATION)) {
  const emarRegistration = source.match(/registerSpireEmarRoutes\([^\n]+\);/)?.[0];
  const registrationAnchor = emarRegistration || 'registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });';
  if (!source.includes(registrationAnchor)) throw new Error('SPIRE medication safety installer: API registration anchor is missing');
  source = source.replace(registrationAnchor, `${REGISTRATION}\n${registrationAnchor}`);
}

if (!source.includes(IMPORT) || !source.includes(REGISTRATION)) {
  throw new Error('SPIRE medication safety routes were not installed into the API bootstrap');
}
await writeFile(bootstrapPath, source, 'utf8');

// Editing a held medication may update its definition, but it must not recreate future
// due doses until the order is resumed. Active orders continue to rebuild their future MAR.
let safetyRoutes = await readFile(safetyRoutesPath, 'utf8');
const unconditionalSchedule = '      await generateFutureAdministrations(prisma, auth, req.params.orderId, { ...input, dueTimes });\n      const updated = await getOrder(prisma, auth, req.params.orderId);';
const guardedSchedule = `      if (String(existing.status) === 'ACTIVE') {\n        await generateFutureAdministrations(prisma, auth, req.params.orderId, { ...input, dueTimes });\n      } else {\n        await prisma.$executeRawUnsafe(\n          \`DELETE FROM "SpireMedicationAdministration"\n           WHERE "organizationId"=$1 AND "medicationOrderId"=$2 AND "scheduledFor">=NOW()\n             AND "status" IN ('SCHEDULED','DUE')\`,\n          auth.organizationId, req.params.orderId,\n        );\n      }\n      const updated = await getOrder(prisma, auth, req.params.orderId);`;
if (safetyRoutes.includes(unconditionalSchedule)) safetyRoutes = safetyRoutes.replace(unconditionalSchedule, guardedSchedule);
if (!safetyRoutes.includes("if (String(existing.status) === 'ACTIVE')")) throw new Error('Medication safety installer could not protect held-order scheduling');
await writeFile(safetyRoutesPath, safetyRoutes, 'utf8');

// The browser performs an interactive second check, but the eMAR write endpoint must
// independently enforce hard stops so a direct API call cannot bypass order safety.
let emar = await readFile(emarRoutesPath, 'utf8');
const SAFETY_IMPORT = "import { assertMedicationAdministrationSafe } from './spire-medication-administration-safety.js';";
if (!emar.includes(SAFETY_IMPORT)) {
  const zodImport = "import { z } from 'zod';";
  if (!emar.includes(zodImport)) throw new Error('eMAR safety installer: zod import anchor is missing');
  emar = emar.replace(zodImport, `${zodImport}\n${SAFETY_IMPORT}`);
}

if (!emar.includes('bloodGlucose:z.number().finite().min(0).max(2000).optional().nullable()')) {
  const schemaAnchor = 'witnessUserId:z.string().optional().nullable()});';
  if (!emar.includes(schemaAnchor)) throw new Error('eMAR safety installer: event schema anchor is missing');
  emar = emar.replace(schemaAnchor, 'witnessUserId:z.string().optional().nullable(),bloodGlucose:z.number().finite().min(0).max(2000).optional().nullable()});');
}

if (!emar.includes('await assertMedicationAdministrationSafe(prisma,a.organizationId,patientId,b);')) {
  const parseAnchor = 'const b=eventSchema.parse(req.body);const med=';
  if (!emar.includes(parseAnchor)) throw new Error('eMAR safety installer: event parse anchor is missing');
  emar = emar.replace(parseAnchor, 'const b=eventSchema.parse(req.body);await assertMedicationAdministrationSafe(prisma,a.organizationId,patientId,b);const med=');
}

for (const marker of [SAFETY_IMPORT, 'bloodGlucose:z.number().finite().min(0).max(2000).optional().nullable()', 'await assertMedicationAdministrationSafe(prisma,a.organizationId,patientId,b);']) {
  if (!emar.includes(marker)) throw new Error(`eMAR safety installer is missing ${marker}`);
}
await writeFile(emarRoutesPath, emar, 'utf8');

console.log('SPIRE structured medication ordering installed; held-order scheduling is protected and eMAR writes enforce the server-side medication safety backstop.');
