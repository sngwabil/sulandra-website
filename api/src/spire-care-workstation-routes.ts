import { createHash } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  legalEntityId?: string;
  enterpriseOwner?: boolean;
};
type Deps = { authOf: (response: express.Response) => AuthContext };

const clinicalRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.AUDITOR, UserRole.DSP,
  UserRole.DELEGATING_NURSE, UserRole.LPN, UserRole.RN, UserRole.HOUSE_MANAGER,
  UserRole.CEO, UserRole.DOO,
]);
const writerRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.DSP, UserRole.DELEGATING_NURSE,
  UserRole.LPN, UserRole.RN, UserRole.HOUSE_MANAGER, UserRole.CEO, UserRole.DOO,
]);
const nurseRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.DELEGATING_NURSE,
  UserRole.LPN, UserRole.RN, UserRole.CEO, UserRole.DOO,
]);
const adminRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.CEO, UserRole.DOO,
]);

const text = (value: unknown, max = 20000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const isAdmin = (auth: AuthContext) => adminRoles.has(auth.role)
  || auth.enterpriseOwner === true
  || String(auth.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';
const entityId = (auth: AuthContext) => {
  if (!auth.legalEntityId) throw Object.assign(new Error('Select a Sulandra company before using S.P.I.R.E.'), { status: 409 });
  return auth.legalEntityId;
};
const ensureClinical = (auth: AuthContext) => {
  if (!clinicalRoles.has(auth.role)) throw Object.assign(new Error('S.P.I.R.E. clinical access is required'), { status: 403 });
};
const ensureWrite = (auth: AuthContext) => {
  ensureClinical(auth);
  if (!writerRoles.has(auth.role)) throw Object.assign(new Error('This S.P.I.R.E. role is read-only'), { status: 403 });
};
const ensureNurse = (auth: AuthContext) => {
  ensureClinical(auth);
  if (!nurseRoles.has(auth.role)) throw Object.assign(new Error('Nursing permission is required to configure clinical modules'), { status: 403 });
};

async function patientAllowed(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  const entity = entityId(auth);
  const enrolled = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "ClientEnrollment" e
       WHERE e."organizationId"=$1 AND e."legalEntityId"=$2 AND e."clientId"=$3
         AND e."status" IN ('PENDING','ACTIVE','PAUSED')
     ) AS allowed`,
    auth.organizationId, entity, patientId,
  );
  if (enrolled[0]?.allowed !== true) return false;
  if (isAdmin(auth) || auth.role === UserRole.AUDITOR) return true;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeClientAssignment" x
       WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."userId"=$3 AND x."clientId"=$4
       UNION ALL
       SELECT 1 FROM "SpirePatientHomeAssignment" p
       JOIN "SpireEmployeeHomeAssignment" h
         ON h."organizationId"=p."organizationId" AND h."legalEntityId"=p."legalEntityId" AND h."homeId"=p."homeId"
       WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND h."userId"=$3 AND p."patientId"=$4
         AND (p."endsAt" IS NULL OR p."endsAt">NOW())
       UNION ALL
       SELECT 1 FROM "UserEntityAccessGrant" g
       WHERE g."organizationId"=$1 AND g."legalEntityId"=$2 AND g."userId"=$3
         AND g."scopeType"='CLIENT' AND g."clientId"=$4 AND g."active"=TRUE
         AND g."effectiveFrom"<=NOW() AND (g."effectiveTo" IS NULL OR g."effectiveTo">NOW())
     ) AS allowed`,
    auth.organizationId, entity, auth.userId, patientId,
  );
  return rows[0]?.allowed === true;
}

async function requirePatient(prisma: PrismaClient, auth: AuthContext, patientId: string, write = false) {
  write ? ensureWrite(auth) : ensureClinical(auth);
  if (!(await patientAllowed(prisma, auth, patientId))) {
    throw Object.assign(new Error('This chart is outside your authorized clinical scope for the selected company'), { status: 403 });
  }
}

async function audit(prisma: PrismaClient, auth: AuthContext, patientId: string, action: string, resourceType: string, resourceId: string, after: unknown) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"
      ("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent")
     VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
    auth.organizationId, entityId(auth), auth.userId, auth.email ?? null, patientId,
    action, resourceType, resourceId, JSON.stringify(after ?? {}), auth.ipAddress ?? null, auth.userAgent ?? null,
  );
}

const catalog: Array<[string, string, string, string]> = [
  ['RN_LPN_VISIT','RN / LPN Visit','Nursing','Skilled nursing visit, head-to-toe assessment, interventions, education and follow-up'],
  ['COMPREHENSIVE_NURSING_ASSESSMENT','Comprehensive Nursing Assessment','Nursing','Admission, recertification and comprehensive nursing assessment'],
  ['CHANGE_OF_CONDITION','Change of Condition','Nursing','Focused reassessment, practitioner notification and escalation tracking'],
  ['WOUND_SKIN','Wound & Skin Care','Wound / Skin','Wound measurements, tissue, drainage, treatment, dressing and photo tracking'],
  ['PRESSURE_INJURY','Pressure Injury','Wound / Skin','Pressure injury staging, offloading, repositioning and treatment response'],
  ['OSTOMY','Ostomy Care','GI / GU','Stoma and peristomal assessment, appliance care and output'],
  ['FOLEY','Foley Catheter','GI / GU','Catheter assessment, urine characteristics, output, care and change tracking'],
  ['SUPRAPUBIC_CATHETER','Suprapubic Catheter','GI / GU','Site, drainage, catheter patency and care'],
  ['INTERMITTENT_CATH','Intermittent Catheterization','GI / GU','Scheduled catheterization, output and tolerance'],
  ['G_TUBE','G-Tube Care','Enteral','Site assessment, tube patency, medications and care'],
  ['J_TUBE','J-Tube Care','Enteral','Site assessment, tube patency, medications and care'],
  ['ENTERAL_FEEDING','Enteral Feeding','Enteral','Formula, rate, flushes, residual/tolerance and aspiration precautions'],
  ['INTAKE_OUTPUT','Intake & Output','Monitoring','Oral/enteral/IV intake and urinary, stool, drain or emesis output'],
  ['BOWEL_PROGRAM','Bowel Program','GI / GU','Bowel pattern, interventions and outcomes'],
  ['OXYGEN','Oxygen Therapy','Respiratory','Oxygen device, flow, saturation, response and safety'],
  ['NEBULIZER','Nebulizer Treatment','Respiratory','Medication treatment, pre/post respiratory status and response'],
  ['TRACH','Tracheostomy Care','Respiratory','Trach site, tube, ties, secretions and care'],
  ['SUCTION','Airway Suctioning','Respiratory','Route, secretions, tolerance, oxygenation and response'],
  ['VENTILATOR','Ventilator Monitoring','Respiratory','Settings, alarms, airway and respiratory assessment'],
  ['CPAP_BIPAP','CPAP / BiPAP','Respiratory','Device use, settings, mask/skin assessment and tolerance'],
  ['DIABETES','Diabetes Management','Diabetes','Diabetes assessment, medications, nutrition and hypoglycemia plan'],
  ['GLUCOSE_CGM','Glucose / CGM','Diabetes','Blood glucose or CGM readings with symptoms and actions'],
  ['INSULIN','Insulin Administration','Diabetes','Insulin dose, site, glucose linkage and response'],
  ['IV','Peripheral IV','Infusion','Site, patency, dressing, infusion and complications'],
  ['PICC','PICC Line','Infusion','Line/site assessment, dressing, flush and complications'],
  ['CENTRAL_LINE','Central Line','Infusion','Line/site assessment, dressing, flush and infection prevention'],
  ['PORT','Implanted Port','Infusion','Access, site assessment, dressing, flush and de-access'],
  ['INFUSION','Infusion Therapy','Infusion','Medication/fluid, rate, access, monitoring and response'],
  ['SEIZURE','Seizure Monitoring','Neurologic','Event onset/duration, characteristics, intervention and recovery'],
  ['VNS','Vagus Nerve Stimulator','Neurologic','VNS use, event response and staff competency documentation'],
  ['POST_ICTAL','Post-Ictal Monitoring','Neurologic','Level of consciousness, airway, safety and return to baseline'],
  ['CARDIOVASCULAR','Cardiovascular Assessment','Cardiovascular','Heart rate/rhythm, circulation, symptoms and focused assessment'],
  ['BP_ORTHOSTATICS','Blood Pressure / Orthostatics','Cardiovascular','Lying/sitting/standing readings, symptoms and response'],
  ['EDEMA','Edema Monitoring','Cardiovascular','Location, grade, circumference and interventions'],
  ['DAILY_WEIGHT','Daily Weight','Cardiovascular','Daily weight trend, variance alerts and follow-up'],
  ['MED_RECONCILIATION','Medication Reconciliation','Medication','Medication comparison, discrepancies and clinical verification'],
  ['MAR_TAR','MAR / TAR','Medication','Medication and treatment administration documentation'],
  ['PRN_EFFECTIVENESS','PRN Effectiveness','Medication','Indication, administration and required effectiveness reassessment'],
  ['INJECTIONS','Injection Administration','Medication','Medication, dose, site, technique and response'],
  ['PAIN','Pain Assessment','Assessment','Pain score, location, characteristics, intervention and reassessment'],
  ['FALL_RISK','Fall Risk','Safety','Fall risk assessment, precautions and post-fall follow-up'],
  ['POSITIONING','Positioning / Repositioning','Mobility','Position, pressure relief and skin/safety observations'],
  ['ROM','Range of Motion','Mobility','Passive/active ROM, tolerance and limitations'],
  ['TRANSFERS_HOYER','Transfers / Hoyer Lift','Mobility','Transfer method, assistance, equipment and tolerance'],
  ['NUTRITION_SWALLOW','Nutrition / Swallow','Nutrition','Diet, intake, swallowing precautions and tolerance'],
  ['BEHAVIOR_SUPPORT','Behavior Support','Behavioral','Antecedent, behavior, intervention, outcome and plan adherence'],
  ['RESTRICTIVE_MEASURE','Restrictive Measure','Behavioral','Time, duration, antecedents, measure, notifications and follow-up'],
  ['PALLIATIVE_COMFORT','Palliative / Comfort Care','Comfort','Comfort symptoms, interventions, response and family communication'],
  ['HOSPICE','Hospice Coordination','Comfort','Hospice plan, symptom management, communication and coordination'],
  ['LAB_SPECIMEN','Lab / Specimen Collection','Clinical','Specimen, collection, transport and result follow-up'],
  ['RESPIRATORY_ASSESSMENT','Respiratory Assessment','Respiratory','Breath sounds, effort, oxygenation, secretions and symptoms'],
  ['DELEGATED_NURSING','Delegated Nursing','Delegation','Ongoing assessment, statement of delegation, supervision and availability'],
  ['INDIVIDUAL_SPECIFIC_TRAINING','Individual-Specific Training','Delegation','Patient-specific task training and competency evidence'],
  ['RETURN_DEMONSTRATION','Return Demonstration','Delegation','Nurse-observed satisfactory return demonstration and remediation'],
];

async function ensureCatalog(prisma: PrismaClient, auth: AuthContext) {
  for (const [moduleKey, title, category, description] of catalog) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireClinicalModuleCatalog"
        ("organizationId","moduleKey","title","category","description","discipline","configuration","active","createdById")
       VALUES($1,$2,$3,$4,$5,'NURSING','{}'::jsonb,TRUE,$6)
       ON CONFLICT("organizationId","moduleKey") DO NOTHING`,
      auth.organizationId, moduleKey, title, category, description, auth.userId,
    );
  }
}

async function ensureSleepRow(prisma: PrismaClient, auth: AuthContext) {
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "SpireFlowsheetRow"
     WHERE "organizationId"=$1 AND "name"='Sleep / Wake Status' AND "active"=TRUE
     ORDER BY "createdAt" LIMIT 1`, auth.organizationId,
  );
  if (existing[0]) return existing[0].id;
  const inserted = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO "SpireFlowsheetRow"
      ("id","organizationId","name","groupName","dataType","unit","active","description","options","sortOrder","createdAt","updatedAt")
     VALUES(gen_random_uuid()::text,$1,'Sleep / Wake Status','Sleep / Wake','SELECT',NULL,TRUE,
       'Scheduled sleep/wake observation from the ISP or individual support plan.',
       '["SLEEPING","AWAKE","BATHROOM","OUT_OF_BED","SNACK","OTHER"]'::jsonb,10,NOW(),NOW())
     RETURNING "id"`, auth.organizationId,
  );
  return inserted[0].id;
}

function dateValue(value: unknown) {
  const supplied = text(value, 80);
  if (!supplied) return new Date();
  const parsed = new Date(supplied);
  if (Number.isNaN(parsed.getTime())) throw Object.assign(new Error('A valid observation time is required'), { status: 400 });
  return parsed;
}

function entryModeFor(eventAt: Date) {
  return Math.abs(Date.now() - eventAt.getTime()) > 5 * 60 * 1000 ? 'PAST' : 'CURRENT';
}

export const registerSpireCareWorkstationRoutes = (app: express.Express, prisma: PrismaClient, deps: Deps) => {
  const { authOf } = deps;

  app.get('/api/spire/care-workstation/patients/:patientId', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId);
      await ensureCatalog(prisma, auth);
      const entity = entityId(auth);
      const [patientRows, profileRows, plans, goals, modules, schedule, progress, intakeNote, compliance] = await Promise.all([
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT p.* FROM "SpirePatient" p WHERE p."organizationId"=$1 AND p."id"=$2 LIMIT 1`, auth.organizationId, patientId),
        prisma.$queryRawUnsafe<Array<{ record: Record<string, unknown> }>>(
          `SELECT to_jsonb(c) AS record FROM "SpireClientProfile" c
           WHERE c."organizationId"=$1 AND (c."clientId"=$2 OR c."id"=$2) ORDER BY c."updatedAt" DESC NULLS LAST LIMIT 1`, auth.organizationId, patientId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireCarePlan" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3
           ORDER BY CASE WHEN "status"='ACTIVE' THEN 0 ELSE 1 END,"updatedAt" DESC LIMIT 20`, auth.organizationId, entity, patientId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT g.* FROM "SpireCarePlanGoal" g WHERE g."organizationId"=$1 AND g."legalEntityId"=$2 AND g."patientId"=$3
           AND g."status"='ACTIVE' ORDER BY g."createdAt",g."title"`, auth.organizationId, entity, patientId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT m.*,c."title",c."category",c."description",c."discipline"
           FROM "SpirePatientClinicalModule" m JOIN "SpireClinicalModuleCatalog" c
             ON c."organizationId"=m."organizationId" AND c."moduleKey"=m."moduleKey"
           WHERE m."organizationId"=$1 AND m."legalEntityId"=$2 AND m."patientId"=$3 AND m."enabled"=TRUE
           ORDER BY c."category",c."title"`, auth.organizationId, entity, patientId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireSleepWakeSchedule" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 LIMIT 1`, auth.organizationId, entity, patientId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT p.*,g."title" AS "goalTitle" FROM "SpireGoalProgressEntry" p
           LEFT JOIN "SpireCarePlanGoal" g ON g."id"=p."goalId" AND g."organizationId"=p."organizationId"
           WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND p."patientId"=$3
           ORDER BY p."recordedAt" DESC LIMIT 100`, auth.organizationId, entity, patientId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT n."id",n."title",n."status",n."createdAt",v."body"
           FROM "SpireClinicalNote" n LEFT JOIN LATERAL (
             SELECT "body" FROM "SpireClinicalNoteVersion" v WHERE v."noteId"=n."id" ORDER BY v."version" DESC LIMIT 1
           ) v ON TRUE
           WHERE n."organizationId"=$1 AND n."legalEntityId"=$2 AND n."patientId"=$3 AND n."noteType"='ADMISSION_INTAKE'
           ORDER BY n."createdAt" DESC LIMIT 1`, auth.organizationId, entity, patientId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT
             EXISTS(SELECT 1 FROM "SpireCarePlan" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."patientId"=$3 AND x."status" IN ('ACTIVE','APPROVED')) AS "currentIsp",
             EXISTS(SELECT 1 FROM "SpireMedicationOrder" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."patientId"=$3 AND x."status"='ACTIVE') AS "activeMedicationOrders",
             EXISTS(SELECT 1 FROM "SpireClinicalNote" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."patientId"=$3) AS "clinicalNotes",
             EXISTS(SELECT 1 FROM "SpireAssessmentResponse" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."patientId"=$3 AND x."status"='COMPLETED') AS "assessments",
             EXISTS(SELECT 1 FROM "SpireClinicalDocument" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."patientId"=$3 AND x."status"='ACTIVE') AS "clinicalDocuments",
             EXISTS(SELECT 1 FROM "SpireIncident" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."patientId"=$3) AS "incidentHistory"`,
          auth.organizationId, entity, patientId),
      ]);
      const patient = patientRows[0];
      if (!patient) throw Object.assign(new Error('Patient was not found'), { status: 404 });
      res.json({ data: {
        patient,
        intakeProfile: profileRows[0]?.record ?? null,
        intakeAdmissionSummary: intakeNote[0] ?? null,
        carePlans: plans,
        goals,
        goalProgress: progress,
        clinicalModules: modules,
        sleepWakeSchedule: schedule[0] ?? null,
        auditReadiness: compliance[0] ?? {},
        permissions: { adminEdit: isAdmin(auth), nursingCatalog: nurseRoles.has(auth.role), canDocument: writerRoles.has(auth.role), readOnly: !writerRoles.has(auth.role) },
        selectedLegalEntityId: entity,
      } });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/care-workstation/catalog', async (_req, res, next) => {
    try {
      const auth = authOf(res); ensureClinical(auth); entityId(auth); await ensureCatalog(prisma, auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireClinicalModuleCatalog" WHERE "organizationId"=$1 AND "active"=TRUE ORDER BY "category","title"`, auth.organizationId);
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.put('/api/spire/care-workstation/catalog/:moduleKey', async (req, res, next) => {
    try {
      const auth = authOf(res); entityId(auth);
      if (!isAdmin(auth)) throw Object.assign(new Error('S.P.I.R.E. Admin Edit Mode is required'), { status: 403 });
      await ensureCatalog(prisma, auth);
      const moduleKey = text(req.params.moduleKey, 120).toUpperCase();
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireClinicalModuleCatalog" SET
           "title"=COALESCE(NULLIF($1,''),"title"),"category"=COALESCE(NULLIF($2,''),"category"),
           "description"=COALESCE(NULLIF($3,''),"description"),"configuration"=$4::jsonb,
           "active"=$5,"updatedAt"=NOW()
         WHERE "organizationId"=$6 AND "moduleKey"=$7 RETURNING *`,
        text(req.body?.title, 250), text(req.body?.category, 120), text(req.body?.description, 4000),
        JSON.stringify(req.body?.configuration ?? {}), req.body?.active !== false, auth.organizationId, moduleKey,
      );
      if (!rows[0]) throw Object.assign(new Error('Clinical catalog item was not found'), { status: 404 });
      await audit(prisma, auth, 'CATALOG', 'UPDATE_CLINICAL_CATALOG', 'CLINICAL_MODULE_CATALOG', String(rows[0].id), rows[0]);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.put('/api/spire/care-workstation/patients/:patientId/modules/:moduleKey', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId; ensureNurse(auth); await requirePatient(prisma, auth, patientId, true); await ensureCatalog(prisma, auth);
      const moduleKey = text(req.params.moduleKey, 120).toUpperCase(), enabled = req.body?.enabled !== false;
      const catalogRows = await prisma.$queryRawUnsafe<Array<{ moduleKey: string }>>(
        `SELECT "moduleKey" FROM "SpireClinicalModuleCatalog" WHERE "organizationId"=$1 AND "moduleKey"=$2 AND "active"=TRUE LIMIT 1`, auth.organizationId, moduleKey);
      if (!catalogRows[0]) throw Object.assign(new Error('Clinical module is not available in the catalog'), { status: 404 });
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpirePatientClinicalModule"
          ("organizationId","legalEntityId","patientId","moduleKey","configuration","enabled","enabledById","enabledAt","disabledAt","updatedAt")
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,NOW(),CASE WHEN $6 THEN NULL ELSE NOW() END,NOW())
         ON CONFLICT("organizationId","legalEntityId","patientId","moduleKey") DO UPDATE SET
           "configuration"=EXCLUDED."configuration","enabled"=EXCLUDED."enabled","enabledById"=EXCLUDED."enabledById",
           "enabledAt"=CASE WHEN EXCLUDED."enabled" THEN NOW() ELSE "SpirePatientClinicalModule"."enabledAt" END,
           "disabledAt"=CASE WHEN EXCLUDED."enabled" THEN NULL ELSE NOW() END,"updatedAt"=NOW()
         RETURNING *`,
        auth.organizationId, entityId(auth), patientId, moduleKey, JSON.stringify(req.body?.configuration ?? {}), enabled, auth.userId,
      );
      await audit(prisma, auth, patientId, enabled ? 'ENABLE_CLINICAL_MODULE' : 'DISABLE_CLINICAL_MODULE', 'PATIENT_CLINICAL_MODULE', String(rows[0].id), rows[0]);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/care-workstation/patients/:patientId/photo', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId; await requirePatient(prisma, auth, patientId);
      const rows = await prisma.$queryRawUnsafe<Array<{ mimeType: string; imageData: Buffer; updatedAt: Date }>>(
        `SELECT "mimeType","imageData","updatedAt" FROM "SpirePatientPhoto"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 LIMIT 1`, auth.organizationId, entityId(auth), patientId);
      if (!rows[0]) { res.status(404).json({ error: 'No patient photo has been uploaded' }); return; }
      res.setHeader('Content-Type', rows[0].mimeType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(rows[0].imageData);
    } catch (error) { next(error); }
  });

  app.put('/api/spire/care-workstation/patients/:patientId/photo', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      if (!isAdmin(auth)) throw Object.assign(new Error('Patient image changes require S.P.I.R.E. Admin Edit Mode'), { status: 403 });
      const mimeType = text(req.body?.mimeType, 100).toLowerCase();
      if (!['image/jpeg','image/png','image/webp'].includes(mimeType)) throw Object.assign(new Error('Patient photo must be JPEG, PNG, or WebP'), { status: 400 });
      const encoded = text(req.body?.base64, 8_000_000).replace(/^data:[^;]+;base64,/, '');
      const image = Buffer.from(encoded, 'base64');
      if (!image.length || image.length > 5 * 1024 * 1024) throw Object.assign(new Error('Patient photo must be between 1 byte and 5 MB'), { status: 413 });
      const sha256 = createHash('sha256').update(image).digest('hex');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpirePatientPhoto"("organizationId","legalEntityId","patientId","mimeType","imageData","sha256","uploadedById")
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT("organizationId","legalEntityId","patientId") DO UPDATE SET
           "mimeType"=EXCLUDED."mimeType","imageData"=EXCLUDED."imageData","sha256"=EXCLUDED."sha256",
           "uploadedById"=EXCLUDED."uploadedById","updatedAt"=NOW()
         RETURNING "id","mimeType","sha256","uploadedById","updatedAt"`,
        auth.organizationId, entityId(auth), patientId, mimeType, image, sha256, auth.userId,
      );
      await audit(prisma, auth, patientId, 'UPDATE_PATIENT_PHOTO', 'PATIENT_PHOTO', String(rows[0].id), rows[0]);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.put('/api/spire/care-workstation/patients/:patientId/sleep-wake/schedule', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const start = text(req.body?.startLocalTime, 5), end = text(req.body?.endLocalTime, 5), frequency = Number(req.body?.frequencyMinutes ?? 60);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) throw Object.assign(new Error('Start and end times must use HH:MM'), { status: 400 });
      if (!Number.isInteger(frequency) || frequency < 15 || frequency > 720) throw Object.assign(new Error('Frequency must be between 15 and 720 minutes'), { status: 400 });
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireSleepWakeSchedule"("organizationId","legalEntityId","patientId","startLocalTime","endLocalTime","frequencyMinutes","instructions","active","createdById")
         VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,$8)
         ON CONFLICT("organizationId","legalEntityId","patientId") DO UPDATE SET
           "startLocalTime"=EXCLUDED."startLocalTime","endLocalTime"=EXCLUDED."endLocalTime","frequencyMinutes"=EXCLUDED."frequencyMinutes",
           "instructions"=EXCLUDED."instructions","active"=TRUE,"updatedAt"=NOW()
         RETURNING *`, auth.organizationId, entityId(auth), patientId, start, end, frequency, text(req.body?.instructions, 4000) || null, auth.userId);
      await audit(prisma, auth, patientId, 'UPDATE_SLEEP_WAKE_SCHEDULE', 'SLEEP_WAKE_SCHEDULE', String(rows[0].id), rows[0]);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/care-workstation/patients/:patientId/sleep-wake', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId; await requirePatient(prisma, auth, patientId);
      const rowId = await ensureSleepRow(prisma, auth);
      const from = text(req.query.from, 80) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const to = text(req.query.to, 80) || new Date().toISOString();
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireFlowsheetEntry" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "rowId"=$4
         AND "recordedAt">=$5::timestamptz AND "recordedAt"<=$6::timestamptz ORDER BY "recordedAt"`,
        auth.organizationId, entityId(auth), patientId, rowId, from, to);
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/care-workstation/patients/:patientId/sleep-wake', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const status = text(req.body?.status, 40).toUpperCase();
      if (!['SLEEPING','AWAKE','BATHROOM','OUT_OF_BED','SNACK','OTHER'].includes(status)) throw Object.assign(new Error('Select a valid sleep/wake observation'), { status: 400 });
      const eventAt = dateValue(req.body?.recordedAt), mode = entryModeFor(eventAt), lateReason = text(req.body?.lateEntryReason, 1000);
      if (mode === 'PAST' && !lateReason) throw Object.assign(new Error('A reason is required when documenting a past time'), { status: 400 });
      const rowId = await ensureSleepRow(prisma, auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireFlowsheetEntry"
          ("organizationId","legalEntityId","patientId","rowId","value","recordedAt","recordedById","comment","source","documentedAt","entryMode","lateEntryReason","signedAt")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'SLEEP_WAKE',NOW(),$9,$10,NOW()) RETURNING *`,
        auth.organizationId, entityId(auth), patientId, rowId, status, eventAt, auth.userId, text(req.body?.note, 4000) || null, mode, lateReason || null);
      await audit(prisma, auth, patientId, 'DOCUMENT_SLEEP_WAKE', 'FLOWSHEET_ENTRY', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/care-workstation/patients/:patientId/goal-progress', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const goalId = text(req.body?.goalId, 120), narrative = text(req.body?.narrative, 10000);
      if (!goalId || !narrative) throw Object.assign(new Error('Goal and progress note are required'), { status: 400 });
      const owner = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "SpireCarePlanGoal" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 AND "status"='ACTIVE' LIMIT 1`,
        auth.organizationId, entityId(auth), patientId, goalId);
      if (!owner[0]) throw Object.assign(new Error('ISP goal was not found in the selected company'), { status: 404 });
      const eventAt = dateValue(req.body?.recordedAt), mode = entryModeFor(eventAt), lateReason = text(req.body?.lateEntryReason, 1000);
      if (mode === 'PAST' && !lateReason) throw Object.assign(new Error('A reason is required when documenting progress for a past time'), { status: 400 });
      const progressPercent = req.body?.progressPercent == null ? null : Number(req.body.progressPercent);
      if (progressPercent != null && (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100)) throw Object.assign(new Error('Progress percent must be from 0 to 100'), { status: 400 });
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireGoalProgressEntry"
          ("id","organizationId","legalEntityId","patientId","goalId","progressPercent","status","narrative","recordedById","recordedAt","documentedAt","entryMode","lateEntryReason")
         VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,'DOCUMENTED',$6,$7,$8,NOW(),$9,$10) RETURNING *`,
        auth.organizationId, entityId(auth), patientId, goalId, progressPercent, narrative, auth.userId, eventAt, mode, lateReason || null);
      if (progressPercent != null) await prisma.$executeRawUnsafe(
        `UPDATE "SpireCarePlanGoal" SET "progressPercent"=$1,"updatedAt"=NOW()
         WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "patientId"=$4 AND "id"=$5`,
        progressPercent, auth.organizationId, entityId(auth), patientId, goalId);
      await audit(prisma, auth, patientId, 'DOCUMENT_ISP_PROGRESS', 'GOAL_PROGRESS', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/care-workstation/patients/:patientId/flowsheet-entry', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const rowId = text(req.body?.rowId, 120);
      if (!rowId) throw Object.assign(new Error('Flowsheet row is required'), { status: 400 });
      const owner = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "SpireFlowsheetRow" WHERE "organizationId"=$1 AND "id"=$2 AND "active"=TRUE LIMIT 1`, auth.organizationId, rowId);
      if (!owner[0]) throw Object.assign(new Error('Flowsheet row was not found'), { status: 404 });
      const eventAt = dateValue(req.body?.recordedAt), mode = entryModeFor(eventAt), lateReason = text(req.body?.lateEntryReason, 1000);
      if (mode === 'PAST' && !lateReason) throw Object.assign(new Error('A reason is required for a past-time flowsheet column'), { status: 400 });
      const numeric = req.body?.numericValue == null || req.body?.numericValue === '' ? null : Number(req.body.numericValue);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireFlowsheetEntry"
          ("organizationId","legalEntityId","patientId","encounterId","rowId","value","numericValue","recordedAt","recordedById","comment","source","documentedAt","entryMode","lateEntryReason","signedAt")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'MANUAL',NOW(),$11,$12,NOW()) RETURNING *`,
        auth.organizationId, entityId(auth), patientId, text(req.body?.encounterId, 120) || null, rowId,
        text(req.body?.value, 4000) || null, Number.isFinite(numeric) ? numeric : null, eventAt, auth.userId,
        text(req.body?.comment, 4000) || null, mode, lateReason || null);
      await audit(prisma, auth, patientId, 'DOCUMENT_FLOWSHEET', 'FLOWSHEET_ENTRY', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/care-workstation/patients/:patientId/flowsheet-entry/:entryId/amend', async (req, res, next) => {
    try {
      const auth = authOf(res), patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const reason = text(req.body?.amendmentReason, 2000);
      if (!reason) throw Object.assign(new Error('An amendment reason is required'), { status: 400 });
      const original = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireFlowsheetEntry" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 LIMIT 1`,
        auth.organizationId, entityId(auth), patientId, req.params.entryId);
      if (!original[0]) throw Object.assign(new Error('Original flowsheet entry was not found'), { status: 404 });
      const source = original[0];
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireFlowsheetEntry"
          ("organizationId","legalEntityId","patientId","encounterId","rowId","value","numericValue","recordedAt","recordedById","comment","source","documentedAt","entryMode","lateEntryReason","amendsEntryId","amendmentReason","signedAt")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'AMENDMENT',NOW(),'AMENDMENT',NULL,$11,$12,NOW()) RETURNING *`,
        auth.organizationId, entityId(auth), patientId, source.encounterId ?? null, source.rowId,
        text(req.body?.value, 4000) || source.value || null,
        req.body?.numericValue == null ? source.numericValue ?? null : Number(req.body.numericValue),
        source.recordedAt, auth.userId, text(req.body?.comment, 4000) || source.comment || null,
        req.params.entryId, reason);
      await audit(prisma, auth, patientId, 'AMEND_FLOWSHEET', 'FLOWSHEET_ENTRY', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });
};
