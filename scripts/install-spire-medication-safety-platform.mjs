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
const RESUME_MARKER = 'SPIRE_MEDICATION_RESUME_REBUILDS_MAR_V1';

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

if (!source.includes(IMPORT) || !source.includes(REGISTRATION)) throw new Error('SPIRE medication safety routes were not installed into the API bootstrap');
await writeFile(bootstrapPath, source, 'utf8');

let safetyRoutes = await readFile(safetyRoutesPath, 'utf8');

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

const unconditionalSchedule = '      await generateFutureAdministrations(prisma, auth, req.params.orderId, { ...input, dueTimes });\n      const updated = await getOrder(prisma, auth, req.params.orderId);';
const guardedSchedule = `      if (String(existing.status) === 'ACTIVE') {\n        await generateFutureAdministrations(prisma, auth, req.params.orderId, { ...input, dueTimes });\n      } else {\n        await prisma.$executeRawUnsafe(\n          \`DELETE FROM "SpireMedicationAdministration"\n           WHERE "organizationId"=$1 AND "medicationOrderId"=$2 AND "scheduledFor">=NOW()\n             AND "status" IN ('SCHEDULED','DUE')\`,\n          auth.organizationId, req.params.orderId,\n        );\n      }\n      const updated = await getOrder(prisma, auth, req.params.orderId);`;
if (safetyRoutes.includes(unconditionalSchedule)) safetyRoutes = safetyRoutes.replace(unconditionalSchedule, guardedSchedule);
if (!safetyRoutes.includes("if (String(existing.status) === 'ACTIVE')")) throw new Error('Medication safety installer could not protect held-order scheduling');

if (!safetyRoutes.includes(RESUME_MARKER)) {
  const helperAnchor = `function orderResponse(row: Record<string, unknown>) {\n  return {\n    ...row,\n    dueTimes: jsonArray(row.dueTimes),\n    daysOfWeek: jsonArray(row.daysOfWeek),\n    slidingScale: jsonArray(row.slidingScale),\n    holdParameters: jsonArray(row.holdParameters),\n    administrationDetails: jsonObject(row.administrationDetails),\n    linkedOrderRule: jsonObject(row.linkedOrderRule),\n  };\n}`;
  if (!safetyRoutes.includes(helperAnchor)) throw new Error('Medication resume helper anchor is missing');
  const helper = `${helperAnchor}\n\n// ${RESUME_MARKER}\nfunction structuredInputFromOrder(row: Record<string, unknown>) {\n  return orderSchema.parse({\n    clientId: String(row.clientId), name: String(row.name), activeIngredient: row.activeIngredient ?? undefined,\n    dose: String(row.dose), doseAmount: row.doseAmount == null ? undefined : Number(row.doseAmount), doseUnit: row.doseUnit ?? undefined, route: String(row.route),\n    scheduleMode: row.scheduleMode || 'SCHEDULED', frequencyCode: row.frequencyCode || 'CUSTOM_TIMES', frequency: String(row.frequency || 'Custom times'),\n    dueTimes: jsonArray(row.dueTimes), intervalHours: row.intervalHours == null ? undefined : Number(row.intervalHours), daysOfWeek: jsonArray(row.daysOfWeek),\n    prnReason: row.prnReason ?? undefined, maxDosesPer24Hours: row.maxDosesPer24Hours == null ? undefined : Number(row.maxDosesPer24Hours), maxDailyDoseMg: row.maxDailyDoseMg == null ? undefined : Number(row.maxDailyDoseMg),\n    startDate: row.startDate, endDate: row.endDate ?? undefined, instructions: row.instructions ?? undefined, administrationDetails: jsonObject(row.administrationDetails),\n    holdParameters: jsonArray(row.holdParameters), slidingScale: jsonArray(row.slidingScale), linkedOrderGroupId: row.linkedOrderGroupId ?? undefined, linkedOrderRule: jsonObject(row.linkedOrderRule),\n    prescriberName: row.prescriberName ?? undefined, prescriberCredentials: row.prescriberCredentials ?? undefined, prescriberOrderDate: row.prescriberOrderDate ?? undefined, orderSource: row.orderSource ?? undefined,\n  });\n}`;
  safetyRoutes = safetyRoutes.replace(helperAnchor, helper);
}

const resumeAnchor = `      const updated = await getOrder(prisma, auth, req.params.orderId);\n      await snapshotRevision(prisma, auth, updated, input.status, input.reason);`;
const resumeReplacement = `      const updated = await getOrder(prisma, auth, req.params.orderId);\n      if (input.status === 'ACTIVE') {\n        const resumedInput = structuredInputFromOrder(updated);\n        await generateFutureAdministrations(prisma, auth, req.params.orderId, resumedInput);\n      }\n      await snapshotRevision(prisma, auth, updated, input.status, input.reason);`;
if (safetyRoutes.includes(resumeAnchor)) safetyRoutes = safetyRoutes.replace(resumeAnchor, resumeReplacement);
if (!safetyRoutes.includes('const resumedInput = structuredInputFromOrder(updated);')) throw new Error('Medication resume MAR schedule rebuild was not installed');
if (!safetyRoutes.includes(READ_MARKER) || !safetyRoutes.includes(RESUME_MARKER)) throw new Error('Medication safety guards were not fully installed');
await writeFile(safetyRoutesPath, safetyRoutes, 'utf8');

let emar = await readFile(emarRoutesPath, 'utf8');
const SAFETY_IMPORT = "import { assertMedicationAdministrationSafe } from './spire-medication-administration-safety.js';";
if (!emar.includes(SAFETY_IMPORT)) {
  const zodImport = "import { z } from 'zod';";
  if (!emar.includes(zodImport)) throw new Error('eMAR safety installer: zod import anchor is missing');
  emar = emar.replace(zodImport, `${zodImport}\n${SAFETY_IMPORT}`);
}

const hasBloodGlucose = /bloodGlucose\s*:\s*z\.number\(\)\.finite\(\)\.min\(0\)\.max\(2000\)\.optional\(\)\.nullable\(\)/.test(emar);
if (!hasBloodGlucose) {
  const compactSchemaAnchor = 'witnessUserId:z.string().optional().nullable()});';
  const modernSchemaAnchor = '  witnessUserId: z.string().optional().nullable(),\n';
  const formattedSchemaAnchor = /(witnessUserId\s*:\s*z\.string\(\)\.optional\(\)\.nullable\(\),?)(\s*\n\s*\}\);)/;
  if (emar.includes(compactSchemaAnchor)) {
    emar = emar.replace(
      compactSchemaAnchor,
      'witnessUserId:z.string().optional().nullable(),bloodGlucose:z.number().finite().min(0).max(2000).optional().nullable()});',
    );
  } else if (emar.includes(modernSchemaAnchor)) {
    emar = emar.replace(
      modernSchemaAnchor,
      `${modernSchemaAnchor}  bloodGlucose: z.number().finite().min(0).max(2000).optional().nullable(),\n`,
    );
  } else if (formattedSchemaAnchor.test(emar)) {
    emar = emar.replace(
      formattedSchemaAnchor,
      `$1\n  bloodGlucose: z.number().finite().min(0).max(2000).optional().nullable(),$2`,
    );
  } else {
    throw new Error('eMAR safety installer: event schema anchor is missing');
  }
}

const compactSafetyCall = 'await assertMedicationAdministrationSafe(prisma,a.organizationId,patientId,b);';
const formattedSafetyCall = 'await assertMedicationAdministrationSafe(prisma, auth.organizationId, patientId, body);';
if (!emar.includes(compactSafetyCall) && !emar.includes(formattedSafetyCall)) {
  const compactParseAnchor = 'const b=eventSchema.parse(req.body);const med=';
  const formattedParseAnchor = 'const body = eventSchema.parse(req.body);';
  if (emar.includes(compactParseAnchor)) {
    emar = emar.replace(
      compactParseAnchor,
      `const b=eventSchema.parse(req.body);${compactSafetyCall}const med=`,
    );
  } else if (emar.includes(formattedParseAnchor)) {
    emar = emar.replace(
      formattedParseAnchor,
      `${formattedParseAnchor}\n      ${formattedSafetyCall}`,
    );
  } else {
    throw new Error('eMAR safety installer: event parse anchor is missing');
  }
}

if (!emar.includes(SAFETY_IMPORT)) throw new Error(`eMAR safety installer is missing ${SAFETY_IMPORT}`);
if (!/bloodGlucose\s*:\s*z\.number\(\)\.finite\(\)\.min\(0\)\.max\(2000\)\.optional\(\)\.nullable\(\)/.test(emar)) {
  throw new Error('eMAR safety installer is missing blood-glucose administration safety input');
}
if (!emar.includes(compactSafetyCall) && !emar.includes(formattedSafetyCall)) {
  throw new Error('eMAR safety installer is missing the server-side administration safety check');
}
await writeFile(emarRoutesPath, emar, 'utf8');

console.log('SPIRE structured medication ordering installed; order authority remains nurse/admin scoped, assigned medication staff can run safety checks, held/resumed MAR schedules are server-managed, and eMAR writes enforce the server-side safety backstop.');
