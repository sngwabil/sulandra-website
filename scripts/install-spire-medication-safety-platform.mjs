import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const safetyRoutesPath = path.join(root, 'api', 'src', 'spire-medication-safety-routes.ts');
const emarRoutesPath = path.join(root, 'api', 'src', 'spire-emar-routes.ts');
const IMPORT = "import { registerMedicationSafetyRoutes } from './spire-medication-safety-routes.js';";
const REGISTRATION = 'registerMedicationSafetyRoutes(app, prisma, { authOf });';
const READ_MARKER = 'SPIRE_MEDICATION_SAFETY_AUTHORIZED_READ_V1';

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

let safetyRoutes = await readFile(safetyRoutesPath, 'utf8');

// Keep physician/order-management authority separate from MAR safety-read authority.
// Qualified DSPs and assigned clinical staff may run the safety check for clients in
// their own selected company without gaining create/edit/discontinue order access.
if (!safetyRoutes.includes(READ_MARKER)) {
  const accessAnchor = `const ensureOrderAccess = (auth: AuthContext) => {\n  if (!orderRoles.has(roleOf(auth))) {\n    throw Object.assign(new Error('Medication order entry requires an authorized nurse or administrator role.'), { status: 403 });\n  }\n};`;
  if (!safetyRoutes.includes(accessAnchor)) throw new Error('Medication safety authorized-read anchor is missing');
  const readAccess = `${accessAnchor}\n\n// ${READ_MARKER}\nconst medicationReadRoles = new Set([...orderRoles, 'DSP', 'HOUSE_MANAGER', 'AUDITOR']);\nconst medicationReadElevated = new Set(['ADMINISTRATOR','PROGRAM_MANAGER','CEO','DOO','AUDITOR']);\nasync function ensureMedicationReadAccess(prisma: PrismaClient, auth: AuthContext, clientId: string) {\n  if (!medicationReadRoles.has(roleOf(auth)) && String(auth.email || '').trim().toLowerCase() !== 'admin@sulandrahealth.com') {\n    throw Object.assign(new Error('Medication chart access is required.'), { status: 403 });\n  }\n  const entity = String(auth.legalEntityId || '').trim();\n  if (!entity) throw Object.assign(new Error('Select a Sulandra company before viewing medication safety details.'), { status: 409 });\n  const enrolled = await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(\`SELECT EXISTS(SELECT 1 FROM "ClientEnrollment" e WHERE e."organizationId"=$1 AND e."legalEntityId"=$2 AND e."clientId"=$3 AND e."status" IN ('PENDING','ACTIVE','PAUSED')) AS allowed\`, auth.organizationId, entity, clientId);\n  if (enrolled[0]?.allowed !== true) throw Object.assign(new Error('This medication belongs to a client outside the selected company.'), { status: 403 });\n  if (medicationReadElevated.has(roleOf(auth)) || String(auth.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com') return;\n  const assigned = await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(\`SELECT EXISTS(\n    SELECT 1 FROM "SpireEmployeeClientAssignment" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."userId"=$3 AND x."clientId"=$4\n    UNION ALL SELECT 1 FROM "SpirePatientHomeAssignment" p JOIN "SpireEmployeeHomeAssignment" h ON h."organizationId"=p."organizationId" AND h."legalEntityId"=p."legalEntityId" AND h."homeId"=p."homeId" WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND h."userId"=$3 AND p."patientId"=$4 AND (p."endsAt" IS NULL OR p."endsAt">NOW())\n    UNION ALL SELECT 1 FROM "UserEntityAccessGrant" g WHERE g."organizationId"=$1 AND g."legalEntityId"=$2 AND g."userId"=$3 AND g."scopeType"='CLIENT' AND g."clientId"=$4 AND g."active"=TRUE AND g."effectiveFrom"<=NOW() AND (g."effectiveTo" IS NULL OR g."effectiveTo">NOW())\n  ) AS allowed\`, auth.organizationId, entity, auth.userId, clientId);\n  if (assigned[0]?.allowed !== true) throw Object.assign(new Error('This chart is outside your authorized medication scope.'), { status: 403 });\n}`;
  safetyRoutes = safetyRoutes.replace(accessAnchor, readAccess);
}

const oldSingleRead = `  app.get('/api/spire/medication-orders-v2/:orderId', async (req, res, next) => {\n    try {\n      const auth = authOf(res); ensureOrderAccess(auth);\n      res.json({ data: orderResponse(await getOrder(prisma, auth, req.params.orderId)) });\n    } catch (error) { next(error); }\n  });`;
const newSingleRead = `  app.get('/api/spire/medication-orders-v2/:orderId', async (req, res, next) => {\n    try {\n      const auth = authOf(res);\n      const order = await getOrder(prisma, auth, req.params.orderId);\n      await ensureMedicationReadAccess(prisma, auth, String(order.clientId));\n      res.json({ data: orderResponse(order) });\n    } catch (error) { next(error); }\n  });`;
if (safetyRoutes.includes(oldSingleRead)) safetyRoutes = safetyRoutes.replace(oldSingleRead, newSingleRead);
if (!safetyRoutes.includes('await ensureMedicationReadAccess(prisma, auth, String(order.clientId));')) throw new Error('Medication order safety-read route was not scoped to the authorized client');

const oldSafetyStart = `  app.post('/api/spire/medication-safety/check', async (req, res, next) => {\n    try {\n      const auth = authOf(res); ensureOrderAccess(auth);\n      const input = safetySchema.parse(req.body);`;
const newSafetyStart = `  app.post('/api/spire/medication-safety/check', async (req, res, next) => {\n    try {\n      const auth = authOf(res);\n      const input = safetySchema.parse(req.body);\n      await ensureMedicationReadAccess(prisma, auth, input.clientId);`;
if (safetyRoutes.includes(oldSafetyStart)) safetyRoutes = safetyRoutes.replace(oldSafetyStart, newSafetyStart);
if (!safetyRoutes.includes('await ensureMedicationReadAccess(prisma, auth, input.clientId);')) throw new Error('MAR safety check was not scoped to the assigned client');

// Editing a held medication may update its definition, but it must not recreate future
// due doses until the order is resumed. Active orders continue to rebuild their future MAR.
const unconditionalSchedule = '      await generateFutureAdministrations(prisma, auth, req.params.orderId, { ...input, dueTimes });\n      const updated = await getOrder(prisma, auth, req.params.orderId);';
const guardedSchedule = `      if (String(existing.status) === 'ACTIVE') {\n        await generateFutureAdministrations(prisma, auth, req.params.orderId, { ...input, dueTimes });\n      } else {\n        await prisma.$executeRawUnsafe(\n          \`DELETE FROM "SpireMedicationAdministration"\n           WHERE "organizationId"=$1 AND "medicationOrderId"=$2 AND "scheduledFor">=NOW()\n             AND "status" IN ('SCHEDULED','DUE')\`,\n          auth.organizationId, req.params.orderId,\n        );\n      }\n      const updated = await getOrder(prisma, auth, req.params.orderId);`;
if (safetyRoutes.includes(unconditionalSchedule)) safetyRoutes = safetyRoutes.replace(unconditionalSchedule, guardedSchedule);
if (!safetyRoutes.includes("if (String(existing.status) === 'ACTIVE')")) throw new Error('Medication safety installer could not protect held-order scheduling');
if (!safetyRoutes.includes(READ_MARKER)) throw new Error('Medication safety authorized-read guard was not installed');
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

console.log('SPIRE structured medication ordering installed; order authority remains nurse/admin scoped, assigned medication staff can run safety checks, held-order scheduling is protected, and eMAR writes enforce the server-side safety backstop.');
