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
};

type Deps = { authOf: (response: express.Response) => AuthContext };

const clinicalRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.AUDITOR,
  UserRole.DSP,
  UserRole.DELEGATING_NURSE,
  UserRole.LPN,
  UserRole.RN,
  UserRole.HOUSE_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);
const adminRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);

const ensureClinical = (auth: AuthContext) => {
  if (!clinicalRoles.has(auth.role)) {
    throw Object.assign(new Error('Spire clinical access is required'), { status: 403 });
  }
};
const isAdmin = (auth: AuthContext) => adminRoles.has(auth.role)
  || String(auth.email || '').toLowerCase() === 'admin@sulandrahealth.com';

async function patientAllowed(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  if (isAdmin(auth) || auth.role === UserRole.AUDITOR) return true;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeClientAssignment" a
        WHERE a."organizationId"=$1 AND a."userId"=$2 AND a."clientId"=$3
       UNION ALL
       SELECT 1
         FROM "SpirePatientHomeAssignment" p
         JOIN "SpireEmployeeHomeAssignment" h
           ON h."organizationId"=p."organizationId" AND h."homeId"=p."homeId"
        WHERE p."organizationId"=$1 AND h."userId"=$2 AND p."patientId"=$3
          AND (p."endsAt" IS NULL OR p."endsAt">NOW())
     ) AS allowed`,
    auth.organizationId,
    auth.userId,
    patientId,
  );
  return rows[0]?.allowed === true;
}

async function requirePatient(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  ensureClinical(auth);
  if (!(await patientAllowed(prisma, auth, patientId))) {
    throw Object.assign(new Error('This chart is outside your authorized clinical scope'), { status: 403 });
  }
}

async function logAccess(
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  action: string,
  resourceType?: string,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireChartAccessEvent"
      ("organizationId","patientId","actorUserId","actorEmail","action","resourceType","ipAddress","userAgent")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    auth.organizationId,
    patientId,
    auth.userId,
    auth.email ?? null,
    action,
    resourceType ?? null,
    auth.ipAddress ?? null,
    auth.userAgent ?? null,
  );
}

const categoryClauses: Record<string, string> = {
  encounters: `SELECT e."startedAt" AS date,'Encounter'::text AS type,COALESCE(e."chiefComplaint",e."encounterType") AS description,e."status",COALESCE(e."signedById",e."createdById") AS author,e."id"::text AS "resourceId" FROM "SpireEncounter" e WHERE e."organizationId"=$1 AND e."patientId"=$2`,
  notes: `SELECT n."createdAt",'Note',COALESCE(n."title",n."noteType"),n."status",n."authorUserId",n."id"::text FROM "SpireClinicalNote" n WHERE n."organizationId"=$1 AND n."patientId"=$2`,
  labs: `SELECT r."resultedAt",COALESCE(NULLIF(r."category",''),'Lab'),r."testName",r."status",r."source",r."id"::text FROM "SpireResult" r WHERE r."organizationId"=$1 AND r."patientId"=$2`,
  micro: `SELECT COALESCE(m."resultedAt",m."createdAt"),'Microbiology',m."testName",COALESCE(m."result",'FINAL'),m."specimen",m."id"::text FROM "SpireMicrobiologyResult" m WHERE m."organizationId"=$1 AND m."patientId"=$2`,
  pathology: `SELECT COALESCE(p."resultedAt",p."createdAt"),'Pathology',COALESCE(p."diagnosis",p."specimen",'Pathology result'),'FINAL',p."specimen",p."id"::text FROM "SpirePathologyResult" p WHERE p."organizationId"=$1 AND p."patientId"=$2`,
  imaging: `SELECT COALESCE(i."performedAt",i."createdAt"),'Imaging',i."description",i."status",i."modality",i."id"::text FROM "SpireImagingStudy" i WHERE i."organizationId"=$1 AND i."patientId"=$2`,
  medications: `SELECT m."createdAt",'Medication',m."name" || ' ' || m."dose" || ' ' || m."route",m."status",m."orderedById",m."id"::text FROM "SpireMedicationOrder" m WHERE m."organizationId"=$1 AND m."patientId"=$2`,
  orders: `SELECT o."orderedAt",'Order',o."name",o."status",o."orderedById",o."id"::text FROM "SpireOrder" o WHERE o."organizationId"=$1 AND o."patientId"=$2`,
  documents: `SELECT d."createdAt",'Document',d."title",d."status",d."createdById",d."id"::text FROM "SpireClinicalDocument" d WHERE d."organizationId"=$1 AND d."patientId"=$2`,
  media: `SELECT COALESCE(m."takenAt",m."createdAt"),'Media',COALESCE(m."caption",m."mediaType"),m."mediaType",NULL::text,m."id"::text FROM "SpireMediaItem" m WHERE m."organizationId"=$1 AND m."patientId"=$2`,
};

export const registerSpireChartRoutes = (app: express.Express, prisma: PrismaClient, deps: Deps) => {
  const { authOf } = deps;

  app.get('/api/spire/patients/:patientId/storyboard', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT p.*,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('type',f."type",'label',f."label",'severity',f."severity",'details',f."details") ORDER BY f."createdAt" DESC)
            FROM "SpirePatientFlag" f WHERE f."organizationId"=p."organizationId" AND f."patientId"=p."id" AND f."active"=TRUE),'[]'::jsonb) AS flags,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('substance',a."substance",'reaction',a."reaction",'severity',a."severity") ORDER BY a."substance")
            FROM "SpirePatientAllergy" a WHERE a."organizationId"=p."organizationId" AND a."patientId"=p."id" AND a."status"='ACTIVE'),'[]'::jsonb) AS allergies,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('display',d."display",'code',d."code",'onsetDate',d."onsetDate") ORDER BY d."display")
            FROM "SpirePatientDiagnosis" d WHERE d."organizationId"=p."organizationId" AND d."patientId"=p."id" AND d."status"='ACTIVE'),'[]'::jsonb) AS diagnoses,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('title',pr."title",'priority',pr."priority",'status',pr."status") ORDER BY pr."updatedAt" DESC)
            FROM "SpirePatientProblem" pr WHERE pr."organizationId"=p."organizationId" AND pr."patientId"=p."id" AND pr."status"='ACTIVE'),'[]'::jsonb) AS problems,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('name',c."name",'relationship',c."relationship",'phone',c."phone",'email',c."email",'priority',c."priority") ORDER BY c."priority")
            FROM "SpireEmergencyContact" c WHERE c."organizationId"=p."organizationId" AND c."patientId"=p."id"),'[]'::jsonb) AS "emergencyContacts",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',ct."userId",'roleLabel',ct."roleLabel",'primary',ct."primary") ORDER BY ct."primary" DESC,ct."startsAt")
            FROM "SpirePatientCareTeam" ct WHERE ct."organizationId"=p."organizationId" AND ct."patientId"=p."id" AND (ct."endsAt" IS NULL OR ct."endsAt">NOW())),'[]'::jsonb) AS "careTeam",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('type',c."type",'value',c."value",'preferred',c."preferred") ORDER BY c."preferred" DESC,c."createdAt")
            FROM "SpirePatientContact" c WHERE c."organizationId"=p."organizationId" AND c."patientId"=p."id"),'[]'::jsonb) AS contacts,
          (SELECT h."homeId" FROM "SpirePatientHomeAssignment" h WHERE h."organizationId"=p."organizationId" AND h."patientId"=p."id" AND (h."endsAt" IS NULL OR h."endsAt">NOW()) ORDER BY h."primary" DESC,h."startsAt" DESC LIMIT 1) AS "homeName",
          (SELECT e."programId" FROM "SpirePatientProgramEnrollment" e WHERE e."organizationId"=p."organizationId" AND e."patientId"=p."id" AND e."status"='ACTIVE' ORDER BY e."startsAt" DESC LIMIT 1) AS "programName",
          (SELECT jsonb_build_object('recordedAt',v."recordedAt",'temperature',v."temperature",'pulse',v."pulse",'respirations',v."respirations",'systolic',v."systolic",'diastolic',v."diastolic",'spo2',v."spo2",'weight',v."weight",'oxygen',v."oxygen")
            FROM "SpireVitalSign" v WHERE v."organizationId"=p."organizationId" AND v."patientId"=p."id" ORDER BY v."recordedAt" DESC LIMIT 1) AS "latestVitals",
          (SELECT jsonb_build_object('id',e."id",'startedAt',e."startedAt",'status',e."status",'encounterType',e."encounterType",'chiefComplaint',e."chiefComplaint")
            FROM "SpireEncounter" e WHERE e."organizationId"=p."organizationId" AND e."patientId"=p."id" ORDER BY e."startedAt" DESC LIMIT 1) AS "latestEncounter",
          (SELECT jsonb_build_object('id',a."id",'startsAt',a."startsAt",'status',a."status",'appointmentType',a."appointmentType",'reason',a."reason")
            FROM "SpireAppointment" a WHERE a."organizationId"=p."organizationId" AND a."patientId"=p."id" AND a."startsAt">=NOW() ORDER BY a."startsAt" LIMIT 1) AS "nextAppointment",
          (SELECT COUNT(*)::int FROM "SpireMedicationOrder" m WHERE m."organizationId"=p."organizationId" AND m."patientId"=p."id" AND m."status"='ACTIVE') AS "activeMedicationCount",
          (SELECT COUNT(*)::int FROM "SpireOrder" o WHERE o."organizationId"=p."organizationId" AND o."patientId"=p."id" AND o."status" IN ('PENDING','ACTIVE','IN_PROGRESS')) AS "openOrderCount",
          (SELECT COUNT(*)::int FROM "SpireClinicalTask" t WHERE t."organizationId"=p."organizationId" AND t."patientId"=p."id" AND t."status"='OPEN') AS "openTaskCount",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('type',r."type",'severity',r."severity",'title',r."title",'details',r."details") ORDER BY r."createdAt" DESC)
            FROM "SpireRiskAlert" r WHERE r."organizationId"=p."organizationId" AND r."patientId"=p."id" AND r."active"=TRUE),'[]'::jsonb) AS "riskAlerts"
         FROM "SpirePatient" p WHERE p."organizationId"=$1 AND p."id"=$2`,
        auth.organizationId,
        patientId,
      );
      if (!rows[0]) throw Object.assign(new Error('Patient not found'), { status: 404 });
      await logAccess(prisma, auth, patientId, 'VIEW_STORYBOARD', 'STORYBOARD');
      res.json({ data: rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/spire/patients/:patientId/chart-review-v2', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId);
      const requested = String(req.query.category || 'all').toLowerCase();
      const selected = requested === 'all'
        ? Object.values(categoryClauses)
        : [categoryClauses[requested]].filter((value): value is string => Boolean(value));
      if (!selected.length) throw Object.assign(new Error('Unsupported chart review category'), { status: 400 });
      const sql = `SELECT * FROM (${selected.join(' UNION ALL ')}) history ORDER BY date DESC NULLS LAST LIMIT 750`;
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, auth.organizationId, patientId);
      await logAccess(prisma, auth, patientId, 'VIEW_CHART_REVIEW', `CHART_REVIEW:${requested}`);
      res.json({ data: { category: requested, items: rows } });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/spire/patients/:patientId/timeline-v2', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM (
          SELECT a."startsAt" AS date,'Appointment'::text AS type,a."appointmentType" AS title,COALESCE(a."reason",a."status") AS detail,a."status",a."id"::text AS "resourceId" FROM "SpireAppointment" a WHERE a."organizationId"=$1 AND a."patientId"=$2
          UNION ALL SELECT e."startedAt",'Encounter',e."encounterType",COALESCE(e."chiefComplaint",e."status"),e."status",e."id"::text FROM "SpireEncounter" e WHERE e."organizationId"=$1 AND e."patientId"=$2
          UNION ALL SELECT n."createdAt",'Note',COALESCE(n."title",n."noteType"),n."status",n."status",n."id"::text FROM "SpireClinicalNote" n WHERE n."organizationId"=$1 AND n."patientId"=$2
          UNION ALL SELECT r."resultedAt",'Result',r."testName",r."category",r."status",r."id"::text FROM "SpireResult" r WHERE r."organizationId"=$1 AND r."patientId"=$2
          UNION ALL SELECT m."createdAt",'Medication',m."name",m."dose" || ' ' || m."route" || ' ' || m."frequency",m."status",m."id"::text FROM "SpireMedicationOrder" m WHERE m."organizationId"=$1 AND m."patientId"=$2
          UNION ALL SELECT o."orderedAt",'Order',o."name",COALESCE(o."instructions",o."orderType"),o."status",o."id"::text FROM "SpireOrder" o WHERE o."organizationId"=$1 AND o."patientId"=$2
          UNION ALL SELECT i."occurredAt",'Incident',i."incidentType",i."summary",i."status",i."id"::text FROM "SpireIncident" i WHERE i."organizationId"=$1 AND i."patientId"=$2
          UNION ALL SELECT c."createdAt",'Care Plan',COALESCE(c."title",c."planType"),COALESCE(c."summary",c."status"),c."status",c."id"::text FROM "SpireCarePlan" c WHERE c."organizationId"=$1 AND c."patientId"=$2
          UNION ALL SELECT d."createdAt",'Document',d."title",d."category",d."status",d."id"::text FROM "SpireClinicalDocument" d WHERE d."organizationId"=$1 AND d."patientId"=$2
          UNION ALL SELECT v."recordedAt",'Vitals','Vital signs',CONCAT_WS(' · ',CASE WHEN v."temperature" IS NOT NULL THEN 'T '||v."temperature"::text END,CASE WHEN v."pulse" IS NOT NULL THEN 'HR '||v."pulse"::text END,CASE WHEN v."systolic" IS NOT NULL THEN 'BP '||v."systolic"::text||'/'||COALESCE(v."diastolic"::text,'') END,CASE WHEN v."spo2" IS NOT NULL THEN 'SpO2 '||v."spo2"::text||'%' END),'RECORDED',v."id"::text FROM "SpireVitalSign" v WHERE v."organizationId"=$1 AND v."patientId"=$2
        ) timeline ORDER BY date DESC NULLS LAST LIMIT 1000`,
        auth.organizationId,
        patientId,
      );
      await logAccess(prisma, auth, patientId, 'VIEW_TIMELINE', 'TIMELINE');
      res.json({ data: { items: rows } });
    } catch (error) {
      next(error);
    }
  });
};
