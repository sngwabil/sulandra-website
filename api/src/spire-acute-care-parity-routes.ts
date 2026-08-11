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
};
type Deps = { authOf: (response: express.Response) => AuthContext };

const clinicalRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.AUDITOR, UserRole.DSP,
  UserRole.DELEGATING_NURSE, UserRole.LPN, UserRole.RN, UserRole.HOUSE_MANAGER,
  UserRole.CEO, UserRole.DOO,
]);
const writeRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.DSP,
  UserRole.DELEGATING_NURSE, UserRole.LPN, UserRole.RN, UserRole.HOUSE_MANAGER,
  UserRole.CEO, UserRole.DOO,
]);
const adminRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.CEO, UserRole.DOO,
]);

const text = (value: unknown, max = 10000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const numberOrNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const integerOrNull = (value: unknown) => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
};
const jsonObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const jsonArray = (value: unknown) => Array.isArray(value) ? value : [];
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const isAdmin = (auth: AuthContext) => adminRoles.has(auth.role) || String(auth.email || '').toLowerCase() === 'admin@sulandrahealth.com';
const selectedEntity = (auth: AuthContext) => {
  const id = text(auth.legalEntityId, 120);
  if (!id) throw httpError(409, 'Select a Sulandra company before using SPIRE acute care');
  return id;
};
const ensureClinical = (auth: AuthContext) => {
  if (!clinicalRoles.has(auth.role)) throw httpError(403, 'SPIRE clinical access is required');
};
const ensureWrite = (auth: AuthContext) => {
  ensureClinical(auth);
  if (!writeRoles.has(auth.role)) throw httpError(403, 'This SPIRE role is read-only');
};

async function patientAllowed(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  const entityId = selectedEntity(auth);
  const enrolled = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "ClientEnrollment" e
       WHERE e."organizationId"=$1 AND e."legalEntityId"=$2 AND e."clientId"=$3
         AND e."status" IN ('PENDING','ACTIVE','PAUSED')
     ) AS allowed`,
    auth.organizationId, entityId, patientId,
  );
  if (enrolled[0]?.allowed !== true) return false;
  if (isAdmin(auth) || auth.role === UserRole.AUDITOR) return true;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeClientAssignment" a
       WHERE a."organizationId"=$1 AND a."legalEntityId"=$2 AND a."userId"=$3 AND a."clientId"=$4
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
    auth.organizationId, entityId, auth.userId, patientId,
  );
  return rows[0]?.allowed === true;
}

async function requirePatient(prisma: PrismaClient, auth: AuthContext, patientId: string, write = false) {
  write ? ensureWrite(auth) : ensureClinical(auth);
  if (!(await patientAllowed(prisma, auth, patientId))) {
    throw httpError(403, 'This chart is outside your authorized clinical scope');
  }
}

async function audit(
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  afterValue: unknown = {},
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"
      ("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent")
     VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
    auth.organizationId, selectedEntity(auth), auth.userId, auth.email ?? null, patientId,
    action, resourceType, resourceId, JSON.stringify(afterValue ?? {}), auth.ipAddress ?? null, auth.userAgent ?? null,
  );
}

async function currentStay(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireHospitalStay"
     WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3
       AND "status" IN ('ADMITTED','TRANSFERRED','DISCHARGE_READY')
     ORDER BY "admittedAt" DESC LIMIT 1`,
    auth.organizationId, selectedEntity(auth), patientId,
  );
  return rows[0] ?? null;
}

export const registerSpireAcuteCareParityRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  deps: Deps,
) => {
  const { authOf } = deps;

  app.get('/api/spire/patients/:patientId/acute-care/overview', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId);
      const entityId = selectedEntity(auth);
      const stay = await currentStay(prisma, auth, patientId);
      const [locations, milestones, io, devices, infusions, critical, ventilator, alerts, ed, periop] = await Promise.all([
        stay ? prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireHospitalLocationEvent" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "hospitalStayId"=$3 ORDER BY "occurredAt" DESC LIMIT 100`,
          auth.organizationId, entityId, stay.id,
        ) : [],
        stay ? prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireDischargeMilestone" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "hospitalStayId"=$3 ORDER BY CASE "status" WHEN 'BLOCKED' THEN 0 WHEN 'OPEN' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END,"dueAt" NULLS LAST,"createdAt"`,
          auth.organizationId, entityId, stay.id,
        ) : [],
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireIntakeOutputEntry" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "recordedAt">=NOW()-INTERVAL '48 hours' ORDER BY "recordedAt" DESC LIMIT 500`,
          auth.organizationId, entityId, patientId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireLdaDevice" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 ORDER BY CASE "status" WHEN 'ACTIVE' THEN 0 ELSE 1 END,"insertedAt" DESC LIMIT 250`,
          auth.organizationId, entityId, patientId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireContinuousInfusion" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 ORDER BY CASE "status" WHEN 'RUNNING' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END,"startedAt" DESC LIMIT 250`,
          auth.organizationId, entityId, patientId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireCriticalCareObservation" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "recordedAt">=NOW()-INTERVAL '24 hours' ORDER BY "recordedAt" DESC LIMIT 500`,
          auth.organizationId, entityId, patientId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireVentilatorSetting" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 ORDER BY "recordedAt" DESC LIMIT 100`,
          auth.organizationId, entityId, patientId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireDeteriorationAlert" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 ORDER BY CASE "status" WHEN 'OPEN' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,"triggeredAt" DESC LIMIT 100`,
          auth.organizationId, entityId, patientId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT v.*,COALESCE((SELECT jsonb_agg(t ORDER BY t."triagedAt" DESC) FROM "SpireEmergencyTriage" t WHERE t."emergencyVisitId"=v."id"),'[]'::jsonb) AS triage,
                  COALESCE((SELECT jsonb_agg(e ORDER BY e."occurredAt" DESC) FROM "SpireEmergencyTrackingEvent" e WHERE e."emergencyVisitId"=v."id"),'[]'::jsonb) AS events
             FROM "SpireEmergencyVisit" v
            WHERE v."organizationId"=$1 AND v."legalEntityId"=$2 AND v."patientId"=$3
            ORDER BY v."arrivalAt" DESC LIMIT 25`,
          auth.organizationId, entityId, patientId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT c.*,
             COALESCE((SELECT jsonb_agg(e ORDER BY e."occurredAt") FROM "SpirePeriopEvent" e WHERE e."procedureCaseId"=c."id"),'[]'::jsonb) AS events,
             COALESCE((SELECT jsonb_agg(a ORDER BY a."createdAt" DESC) FROM "SpireAnesthesiaRecord" a WHERE a."procedureCaseId"=c."id"),'[]'::jsonb) AS anesthesia,
             COALESCE((SELECT jsonb_agg(i ORDER BY i."createdAt" DESC) FROM "SpireImplantLog" i WHERE i."procedureCaseId"=c."id"),'[]'::jsonb) AS implants,
             COALESCE((SELECT jsonb_agg(sc ORDER BY sc."recordedAt" DESC) FROM "SpireSurgicalCount" sc WHERE sc."procedureCaseId"=c."id"),'[]'::jsonb) AS counts
           FROM "SpireProcedureCase" c
           WHERE c."organizationId"=$1 AND c."legalEntityId"=$2 AND c."patientId"=$3
           ORDER BY c."scheduledAt" DESC NULLS LAST,c."createdAt" DESC LIMIT 25`,
          auth.organizationId, entityId, patientId,
        ),
      ]);
      const intakeMl = io.filter((x) => x.direction === 'INTAKE').reduce((sum, x) => sum + Number(x.amountMl || 0), 0);
      const outputMl = io.filter((x) => x.direction === 'OUTPUT').reduce((sum, x) => sum + Number(x.amountMl || 0), 0);
      res.json({ data: {
        stay, locations, milestones, io, ioTotals: { intakeMl, outputMl, netMl: intakeMl - outputMl },
        devices, infusions, criticalObservations: critical, ventilatorSettings: ventilator, deteriorationAlerts: alerts,
        emergencyVisits: ed, procedureCases: periop,
      } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/stays', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      if (await currentStay(prisma, auth, patientId)) throw httpError(409, 'This patient already has an active hospital stay in the selected company');
      const entityId = selectedEntity(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireHospitalStay"
          ("organizationId","legalEntityId","patientId","encounterId","stayType","status","admitSource","admitDiagnosis","service","attendingUserId","location","room","bed","levelOfCare","createdById")
         VALUES($1,$2,$3,$4,$5,'ADMITTED',$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        auth.organizationId, entityId, patientId, text(req.body?.encounterId, 120) || null,
        text(req.body?.stayType, 60) || 'INPATIENT', text(req.body?.admitSource, 120) || null,
        text(req.body?.admitDiagnosis, 500) || null, text(req.body?.service, 120) || null,
        text(req.body?.attendingUserId, 120) || null, text(req.body?.location, 120) || null,
        text(req.body?.room, 60) || null, text(req.body?.bed, 60) || null,
        text(req.body?.levelOfCare, 120) || null, auth.userId,
      );
      const row = rows[0];
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireHospitalLocationEvent"("organizationId","legalEntityId","hospitalStayId","patientId","eventType","toLocation","toRoom","toBed","toLevelOfCare","reason","performedById")
         VALUES($1,$2,$3,$4,'ADMISSION',$5,$6,$7,$8,$9,$10)`,
        auth.organizationId, entityId, row.id, patientId, row.location ?? null, row.room ?? null, row.bed ?? null, row.levelOfCare ?? null,
        text(req.body?.admitReason, 500) || 'Hospital admission', auth.userId,
      );
      await audit(prisma, auth, patientId, 'ACUTE_CARE_ADMIT', 'HOSPITAL_STAY', String(row.id), row);
      res.status(201).json({ data: row });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/stays/:stayId/transfer', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const entityId = selectedEntity(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireHospitalStay" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 AND "status" IN ('ADMITTED','TRANSFERRED','DISCHARGE_READY') FOR UPDATE`,
        auth.organizationId, entityId, patientId, req.params.stayId,
      );
      const stay = rows[0]; if (!stay) throw httpError(404, 'Active hospital stay not found');
      const toLocation = text(req.body?.location, 120) || String(stay.location || '');
      const toRoom = text(req.body?.room, 60) || String(stay.room || '');
      const toBed = text(req.body?.bed, 60) || String(stay.bed || '');
      const toLevel = text(req.body?.levelOfCare, 120) || String(stay.levelOfCare || '');
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE "SpireHospitalStay" SET "status"='TRANSFERRED',"location"=$1,"room"=$2,"bed"=$3,"levelOfCare"=$4,"updatedAt"=NOW() WHERE "id"=$5`,
          toLocation || null, toRoom || null, toBed || null, toLevel || null, req.params.stayId,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireHospitalLocationEvent"("organizationId","legalEntityId","hospitalStayId","patientId","eventType","fromLocation","toLocation","fromRoom","toRoom","fromBed","toBed","fromLevelOfCare","toLevelOfCare","reason","performedById")
           VALUES($1,$2,$3,$4,'TRANSFER',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          auth.organizationId, entityId, req.params.stayId, patientId, stay.location ?? null, toLocation || null,
          stay.room ?? null, toRoom || null, stay.bed ?? null, toBed || null, stay.levelOfCare ?? null, toLevel || null,
          text(req.body?.reason, 500) || 'Transfer', auth.userId,
        );
      });
      await audit(prisma, auth, patientId, 'ACUTE_CARE_TRANSFER', 'HOSPITAL_STAY', req.params.stayId, { toLocation, toRoom, toBed, toLevel });
      res.json({ data: { id: req.params.stayId, status: 'TRANSFERRED', location: toLocation, room: toRoom, bed: toBed, levelOfCare: toLevel } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/stays/:stayId/discharge', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const entityId = selectedEntity(auth);
      const disposition = text(req.body?.disposition, 120); if (!disposition) throw httpError(400, 'Discharge disposition is required');
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "SpireHospitalStay" SET "status"='DISCHARGED',"disposition"=$1,"dischargeSummary"=$2,"dischargedAt"=NOW(),"updatedAt"=NOW()
         WHERE "organizationId"=$3 AND "legalEntityId"=$4 AND "patientId"=$5 AND "id"=$6 AND "status" IN ('ADMITTED','TRANSFERRED','DISCHARGE_READY')`,
        disposition, text(req.body?.dischargeSummary, 10000) || null, auth.organizationId, entityId, patientId, req.params.stayId,
      );
      if (!result) throw httpError(404, 'Active hospital stay not found');
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireHospitalLocationEvent"("organizationId","legalEntityId","hospitalStayId","patientId","eventType","reason","performedById") VALUES($1,$2,$3,$4,'DISCHARGE',$5,$6)`,
        auth.organizationId, entityId, req.params.stayId, patientId, disposition, auth.userId,
      );
      await audit(prisma, auth, patientId, 'ACUTE_CARE_DISCHARGE', 'HOSPITAL_STAY', req.params.stayId, { disposition });
      res.json({ data: { id: req.params.stayId, status: 'DISCHARGED', disposition } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/milestones', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const stay = await currentStay(prisma, auth, patientId);
      if (!stay) throw httpError(409, 'An active hospital stay is required');
      const title = text(req.body?.title, 250); if (!title) throw httpError(400, 'Milestone title is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireDischargeMilestone"("organizationId","legalEntityId","hospitalStayId","patientId","milestoneType","title","status","dueAt","ownerUserId","barrier","notes","createdById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        auth.organizationId, selectedEntity(auth), stay.id, patientId, text(req.body?.milestoneType, 80) || 'DISCHARGE', title,
        text(req.body?.status, 30) || 'OPEN', req.body?.dueAt ? new Date(String(req.body.dueAt)) : null,
        text(req.body?.ownerUserId, 120) || null, text(req.body?.barrier, 1000) || null, text(req.body?.notes, 5000) || null, auth.userId,
      );
      await audit(prisma, auth, patientId, 'CREATE_DISCHARGE_MILESTONE', 'DISCHARGE_MILESTONE', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/spire/patients/:patientId/acute-care/milestones/:milestoneId', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const status = text(req.body?.status, 30); if (!['OPEN','IN_PROGRESS','BLOCKED','COMPLETE','NOT_APPLICABLE'].includes(status)) throw httpError(400, 'Valid milestone status is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireDischargeMilestone" SET "status"=$1,"barrier"=$2,"notes"=$3,"completedAt"=CASE WHEN $1='COMPLETE' THEN NOW() ELSE NULL END,"updatedAt"=NOW()
         WHERE "organizationId"=$4 AND "legalEntityId"=$5 AND "patientId"=$6 AND "id"=$7 RETURNING *`,
        status, text(req.body?.barrier, 1000) || null, text(req.body?.notes, 5000) || null,
        auth.organizationId, selectedEntity(auth), patientId, req.params.milestoneId,
      );
      if (!rows[0]) throw httpError(404, 'Discharge milestone not found');
      await audit(prisma, auth, patientId, 'UPDATE_DISCHARGE_MILESTONE', 'DISCHARGE_MILESTONE', req.params.milestoneId, rows[0]);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/io', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const entityId = selectedEntity(auth); const stay = await currentStay(prisma, auth, patientId);
      const direction = text(req.body?.direction, 20).toUpperCase(); if (!['INTAKE','OUTPUT'].includes(direction)) throw httpError(400, 'I&O direction must be INTAKE or OUTPUT');
      const category = text(req.body?.category, 120); if (!category) throw httpError(400, 'I&O category is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireIntakeOutputEntry"("organizationId","legalEntityId","patientId","encounterId","hospitalStayId","direction","category","source","amountMl","details","recordedAt","recordedById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,NOW()),$12) RETURNING *`,
        auth.organizationId, entityId, patientId, text(req.body?.encounterId, 120) || null, stay?.id ?? null, direction, category,
        text(req.body?.source, 120) || null, numberOrNull(req.body?.amountMl), text(req.body?.details, 2000) || null,
        req.body?.recordedAt ? new Date(String(req.body.recordedAt)) : null, auth.userId,
      );
      await audit(prisma, auth, patientId, 'RECORD_INTAKE_OUTPUT', 'INTAKE_OUTPUT', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/devices', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const entityId = selectedEntity(auth); const stay = await currentStay(prisma, auth, patientId);
      const deviceType = text(req.body?.deviceType, 120); if (!deviceType) throw httpError(400, 'Device type is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireLdaDevice"("organizationId","legalEntityId","patientId","encounterId","hospitalStayId","deviceType","site","laterality","size","indication","assessment","insertedById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) RETURNING *`,
        auth.organizationId, entityId, patientId, text(req.body?.encounterId, 120) || null, stay?.id ?? null, deviceType,
        text(req.body?.site, 120) || null, text(req.body?.laterality, 30) || null, text(req.body?.size, 60) || null,
        text(req.body?.indication, 1000) || null, JSON.stringify(jsonObject(req.body?.assessment)), auth.userId,
      );
      await audit(prisma, auth, patientId, 'ADD_LDA_DEVICE', 'LDA_DEVICE', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/devices/:deviceId/remove', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireLdaDevice" SET "status"='REMOVED',"removedAt"=NOW(),"removedById"=$1,"updatedAt"=NOW()
         WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "patientId"=$4 AND "id"=$5 AND "status"='ACTIVE' RETURNING *`,
        auth.userId, auth.organizationId, selectedEntity(auth), patientId, req.params.deviceId,
      );
      if (!rows[0]) throw httpError(404, 'Active device not found');
      await audit(prisma, auth, patientId, 'REMOVE_LDA_DEVICE', 'LDA_DEVICE', req.params.deviceId, rows[0]);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/infusions', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const stay = await currentStay(prisma, auth, patientId);
      const medicationName = text(req.body?.medicationName, 250); if (!medicationName) throw httpError(400, 'Infusion medication is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireContinuousInfusion"("organizationId","legalEntityId","patientId","encounterId","hospitalStayId","medicationName","concentration","rate","rateUnit","dose","doseUnit","titrationTarget","verifiedById","recordedById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        auth.organizationId, selectedEntity(auth), patientId, text(req.body?.encounterId, 120) || null, stay?.id ?? null, medicationName,
        text(req.body?.concentration, 120) || null, numberOrNull(req.body?.rate), text(req.body?.rateUnit, 60) || null,
        numberOrNull(req.body?.dose), text(req.body?.doseUnit, 60) || null, text(req.body?.titrationTarget, 1000) || null,
        text(req.body?.verifiedById, 120) || null, auth.userId,
      );
      await audit(prisma, auth, patientId, 'START_CONTINUOUS_INFUSION', 'CONTINUOUS_INFUSION', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/spire/patients/:patientId/acute-care/infusions/:infusionId', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const status = text(req.body?.status, 30).toUpperCase(); if (!['RUNNING','PAUSED','STOPPED','COMPLETED'].includes(status)) throw httpError(400, 'Valid infusion status is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireContinuousInfusion" SET "status"=$1,"rate"=COALESCE($2,"rate"),"dose"=COALESCE($3,"dose"),"stoppedAt"=CASE WHEN $1 IN ('STOPPED','COMPLETED') THEN NOW() ELSE NULL END,"updatedAt"=NOW()
         WHERE "organizationId"=$4 AND "legalEntityId"=$5 AND "patientId"=$6 AND "id"=$7 RETURNING *`,
        status, numberOrNull(req.body?.rate), numberOrNull(req.body?.dose), auth.organizationId, selectedEntity(auth), patientId, req.params.infusionId,
      );
      if (!rows[0]) throw httpError(404, 'Infusion not found');
      await audit(prisma, auth, patientId, 'UPDATE_CONTINUOUS_INFUSION', 'CONTINUOUS_INFUSION', req.params.infusionId, rows[0]);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/critical-observations', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const stay = await currentStay(prisma, auth, patientId);
      const observationType = text(req.body?.observationType, 120); if (!observationType) throw httpError(400, 'Critical-care observation type is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireCriticalCareObservation"("organizationId","legalEntityId","patientId","encounterId","hospitalStayId","observationType","value","numericValue","unit","severity","deviceSource","recordedAt","recordedById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,NOW()),$13) RETURNING *`,
        auth.organizationId, selectedEntity(auth), patientId, text(req.body?.encounterId, 120) || null, stay?.id ?? null,
        observationType, text(req.body?.value, 500) || null, numberOrNull(req.body?.numericValue), text(req.body?.unit, 60) || null,
        text(req.body?.severity, 30) || null, text(req.body?.deviceSource, 120) || null,
        req.body?.recordedAt ? new Date(String(req.body.recordedAt)) : null, auth.userId,
      );
      await audit(prisma, auth, patientId, 'RECORD_CRITICAL_CARE_OBSERVATION', 'CRITICAL_CARE_OBSERVATION', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/ventilator', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const stay = await currentStay(prisma, auth, patientId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireVentilatorSetting"("organizationId","legalEntityId","patientId","encounterId","hospitalStayId","mode","fio2","peep","rate","tidalVolume","pressureSupport","plateauPressure","settings","recordedAt","recordedById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,COALESCE($14,NOW()),$15) RETURNING *`,
        auth.organizationId, selectedEntity(auth), patientId, text(req.body?.encounterId, 120) || null, stay?.id ?? null,
        text(req.body?.mode, 80) || null, numberOrNull(req.body?.fio2), numberOrNull(req.body?.peep), numberOrNull(req.body?.rate),
        numberOrNull(req.body?.tidalVolume), numberOrNull(req.body?.pressureSupport), numberOrNull(req.body?.plateauPressure),
        JSON.stringify(jsonObject(req.body?.settings)), req.body?.recordedAt ? new Date(String(req.body.recordedAt)) : null, auth.userId,
      );
      await audit(prisma, auth, patientId, 'RECORD_VENTILATOR_SETTINGS', 'VENTILATOR_SETTING', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/deterioration-alerts', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const reason = text(req.body?.reason, 2000); if (!reason) throw httpError(400, 'Alert reason is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireDeteriorationAlert"("organizationId","legalEntityId","patientId","encounterId","alertType","severity","score","reason")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        auth.organizationId, selectedEntity(auth), patientId, text(req.body?.encounterId, 120) || null,
        text(req.body?.alertType, 120) || 'CLINICAL_DETERIORATION', text(req.body?.severity, 30) || 'HIGH', numberOrNull(req.body?.score), reason,
      );
      await audit(prisma, auth, patientId, 'CREATE_DETERIORATION_ALERT', 'DETERIORATION_ALERT', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/spire/patients/:patientId/acute-care/deterioration-alerts/:alertId', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const status = text(req.body?.status, 30).toUpperCase(); if (!['ACKNOWLEDGED','RESOLVED'].includes(status)) throw httpError(400, 'Alert status must be ACKNOWLEDGED or RESOLVED');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireDeteriorationAlert" SET "status"=$1,
          "acknowledgedAt"=CASE WHEN $1='ACKNOWLEDGED' THEN NOW() ELSE COALESCE("acknowledgedAt",NOW()) END,
          "acknowledgedById"=CASE WHEN $1='ACKNOWLEDGED' THEN $2 ELSE COALESCE("acknowledgedById",$2) END,
          "resolvedAt"=CASE WHEN $1='RESOLVED' THEN NOW() ELSE "resolvedAt" END,
          "resolvedById"=CASE WHEN $1='RESOLVED' THEN $2 ELSE "resolvedById" END,
          "resolution"=CASE WHEN $1='RESOLVED' THEN $3 ELSE "resolution" END
         WHERE "organizationId"=$4 AND "legalEntityId"=$5 AND "patientId"=$6 AND "id"=$7 AND "status"<>'RESOLVED' RETURNING *`,
        status, auth.userId, text(req.body?.resolution, 2000) || null, auth.organizationId, selectedEntity(auth), patientId, req.params.alertId,
      );
      if (!rows[0]) throw httpError(404, 'Open deterioration alert not found');
      await audit(prisma, auth, patientId, `DETERIORATION_ALERT_${status}`, 'DETERIORATION_ALERT', req.params.alertId, rows[0]);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/ed-visits', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const chiefComplaint = text(req.body?.chiefComplaint, 1000); if (!chiefComplaint) throw httpError(400, 'ED chief complaint is required');
      const acuity = integerOrNull(req.body?.acuity); if (acuity !== null && (acuity < 1 || acuity > 5)) throw httpError(400, 'ED acuity must be 1 through 5');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireEmergencyVisit"("organizationId","legalEntityId","patientId","encounterId","arrivalMode","chiefComplaint","acuity","trackingStatus","room","providerUserId","createdById")
         VALUES($1,$2,$3,$4,$5,$6,$7,'ARRIVED',$8,$9,$10) RETURNING *`,
        auth.organizationId, selectedEntity(auth), patientId, text(req.body?.encounterId, 120) || null,
        text(req.body?.arrivalMode, 120) || null, chiefComplaint, acuity, text(req.body?.room, 60) || null,
        text(req.body?.providerUserId, 120) || null, auth.userId,
      );
      await audit(prisma, auth, patientId, 'ED_ARRIVAL', 'EMERGENCY_VISIT', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/ed-visits/:visitId/triage', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const acuity = integerOrNull(req.body?.acuity);
      if (acuity === null || acuity < 1 || acuity > 5) throw httpError(400, 'ED triage acuity 1 through 5 is required');
      const painScore = integerOrNull(req.body?.painScore); if (painScore !== null && (painScore < 0 || painScore > 10)) throw httpError(400, 'Pain score must be 0 through 10');
      const visit = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id" FROM "SpireEmergencyVisit" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4`,
        auth.organizationId, selectedEntity(auth), patientId, req.params.visitId,
      );
      if (!visit[0]) throw httpError(404, 'Emergency visit not found');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireEmergencyTriage"("organizationId","legalEntityId","emergencyVisitId","patientId","acuity","painScore","presentingProblem","highRiskFlags","triageNote","triagedById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`,
        auth.organizationId, selectedEntity(auth), req.params.visitId, patientId, acuity, painScore,
        text(req.body?.presentingProblem, 2000) || null, JSON.stringify(jsonArray(req.body?.highRiskFlags)), text(req.body?.triageNote, 5000) || null, auth.userId,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireEmergencyVisit" SET "acuity"=$1,"trackingStatus"='TRIAGED',"updatedAt"=NOW() WHERE "id"=$2`, acuity, req.params.visitId,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireEmergencyTrackingEvent"("organizationId","legalEntityId","emergencyVisitId","patientId","fromStatus","toStatus","note","performedById") VALUES($1,$2,$3,$4,'ARRIVED','TRIAGED',$5,$6)`,
        auth.organizationId, selectedEntity(auth), req.params.visitId, patientId, text(req.body?.triageNote, 1000) || null, auth.userId,
      );
      await audit(prisma, auth, patientId, 'ED_TRIAGE', 'EMERGENCY_TRIAGE', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/ed-visits/:visitId/status', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const entityId = selectedEntity(auth);
      const toStatus = text(req.body?.status, 60).toUpperCase(); if (!toStatus) throw httpError(400, 'ED tracking status is required');
      const visits = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireEmergencyVisit" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 FOR UPDATE`,
        auth.organizationId, entityId, patientId, req.params.visitId,
      );
      const visit = visits[0]; if (!visit) throw httpError(404, 'Emergency visit not found');
      const disposition = text(req.body?.disposition, 120) || null;
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE "SpireEmergencyVisit" SET "trackingStatus"=$1,"room"=COALESCE($2,"room"),"providerUserId"=COALESCE($3,"providerUserId"),"disposition"=COALESCE($4,"disposition"),"dispositionAt"=CASE WHEN $4 IS NOT NULL THEN NOW() ELSE "dispositionAt" END,"updatedAt"=NOW() WHERE "id"=$5`,
          toStatus, text(req.body?.room, 60) || null, text(req.body?.providerUserId, 120) || null, disposition, req.params.visitId,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireEmergencyTrackingEvent"("organizationId","legalEntityId","emergencyVisitId","patientId","fromStatus","toStatus","room","note","performedById") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          auth.organizationId, entityId, req.params.visitId, patientId, String(visit.trackingStatus || ''), toStatus,
          text(req.body?.room, 60) || null, text(req.body?.note, 1000) || null, auth.userId,
        );
      });
      await audit(prisma, auth, patientId, 'ED_TRACKING_STATUS', 'EMERGENCY_VISIT', req.params.visitId, { from: visit.trackingStatus, to: toStatus, disposition });
      res.json({ data: { id: req.params.visitId, trackingStatus: toStatus, disposition } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/procedure-cases', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const procedureName = text(req.body?.procedureName, 300); if (!procedureName) throw httpError(400, 'Procedure name is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireProcedureCase"("organizationId","legalEntityId","patientId","encounterId","procedureName","serviceLine","caseStatus","scheduledAt","room","primarySurgeonUserId","anesthesiaType","preOpDiagnosis","createdById")
         VALUES($1,$2,$3,$4,$5,$6,'SCHEDULED',$7,$8,$9,$10,$11,$12) RETURNING *`,
        auth.organizationId, selectedEntity(auth), patientId, text(req.body?.encounterId, 120) || null, procedureName,
        text(req.body?.serviceLine, 120) || null, req.body?.scheduledAt ? new Date(String(req.body.scheduledAt)) : null,
        text(req.body?.room, 80) || null, text(req.body?.primarySurgeonUserId, 120) || null,
        text(req.body?.anesthesiaType, 120) || null, text(req.body?.preOpDiagnosis, 2000) || null, auth.userId,
      );
      await audit(prisma, auth, patientId, 'CREATE_PROCEDURE_CASE', 'PROCEDURE_CASE', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/procedure-cases/:caseId/events', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const entityId = selectedEntity(auth);
      const eventType = text(req.body?.eventType, 100).toUpperCase(); if (!eventType) throw httpError(400, 'Perioperative event type is required');
      const caseRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireProcedureCase" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4`,
        auth.organizationId, entityId, patientId, req.params.caseId,
      );
      if (!caseRows[0]) throw httpError(404, 'Procedure case not found');
      const statusMap: Record<string, string> = { PRE_OP: 'PRE_OP', IN_ROOM: 'IN_ROOM', PROCEDURE_START: 'PROCEDURE', PACU: 'PACU', COMPLETE: 'COMPLETE', CANCELLED: 'CANCELLED' };
      const nextStatus = statusMap[eventType];
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpirePeriopEvent"("organizationId","legalEntityId","procedureCaseId","patientId","eventType","occurredAt","details","performedById")
         VALUES($1,$2,$3,$4,$5,COALESCE($6,NOW()),$7::jsonb,$8) RETURNING *`,
        auth.organizationId, entityId, req.params.caseId, patientId, eventType,
        req.body?.occurredAt ? new Date(String(req.body.occurredAt)) : null, JSON.stringify(jsonObject(req.body?.details)), auth.userId,
      );
      if (nextStatus) {
        await prisma.$executeRawUnsafe(
          `UPDATE "SpireProcedureCase" SET "caseStatus"=$1,"startedAt"=CASE WHEN $1='PROCEDURE' THEN COALESCE("startedAt",NOW()) ELSE "startedAt" END,"endedAt"=CASE WHEN $1='COMPLETE' THEN NOW() ELSE "endedAt" END,"updatedAt"=NOW() WHERE "id"=$2`,
          nextStatus, req.params.caseId,
        );
      }
      await audit(prisma, auth, patientId, 'PERIOP_EVENT', 'PERIOP_EVENT', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/procedure-cases/:caseId/anesthesia', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true); const entityId = selectedEntity(auth);
      const exists = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "SpireProcedureCase" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4`,
        auth.organizationId, entityId, patientId, req.params.caseId,
      ); if (!exists[0]) throw httpError(404, 'Procedure case not found');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireAnesthesiaRecord"("organizationId","legalEntityId","procedureCaseId","patientId","recordType","airway","asaClass","anesthesiaType","startedAt","endedAt","details","providerUserId")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12) RETURNING *`,
        auth.organizationId, entityId, req.params.caseId, patientId, text(req.body?.recordType, 60) || 'INTRA_OP',
        text(req.body?.airway, 500) || null, text(req.body?.asaClass, 20) || null, text(req.body?.anesthesiaType, 120) || null,
        req.body?.startedAt ? new Date(String(req.body.startedAt)) : null, req.body?.endedAt ? new Date(String(req.body.endedAt)) : null,
        JSON.stringify(jsonObject(req.body?.details)), text(req.body?.providerUserId, 120) || auth.userId,
      );
      await audit(prisma, auth, patientId, 'CREATE_ANESTHESIA_RECORD', 'ANESTHESIA_RECORD', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/procedure-cases/:caseId/implants', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const itemName = text(req.body?.itemName, 250); if (!itemName) throw httpError(400, 'Implant item name is required');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireImplantLog"("organizationId","legalEntityId","procedureCaseId","patientId","itemName","manufacturer","lotNumber","serialNumber","expirationDate","implantedAt","recordedById")
         SELECT $1,$2,"id",$3,$4,$5,$6,$7,$8,COALESCE($9,NOW()),$10 FROM "SpireProcedureCase"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$11 RETURNING *`,
        auth.organizationId, selectedEntity(auth), patientId, itemName, text(req.body?.manufacturer, 200) || null,
        text(req.body?.lotNumber, 120) || null, text(req.body?.serialNumber, 120) || null,
        req.body?.expirationDate ? new Date(String(req.body.expirationDate)) : null,
        req.body?.implantedAt ? new Date(String(req.body.implantedAt)) : null, auth.userId, req.params.caseId,
      );
      if (!rows[0]) throw httpError(404, 'Procedure case not found');
      await audit(prisma, auth, patientId, 'LOG_IMPLANT', 'IMPLANT', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/acute-care/procedure-cases/:caseId/counts', async (req, res, next) => {
    try {
      const auth = authOf(res); const patientId = req.params.patientId; await requirePatient(prisma, auth, patientId, true);
      const itemType = text(req.body?.itemType, 120); if (!itemType) throw httpError(400, 'Count item type is required');
      const expectedCount = integerOrNull(req.body?.expectedCount) ?? 0; const actualCount = integerOrNull(req.body?.actualCount) ?? 0;
      const status = expectedCount === actualCount ? 'CORRECT' : 'DISCREPANCY';
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireSurgicalCount"("organizationId","legalEntityId","procedureCaseId","patientId","countType","itemType","expectedCount","actualCount","status","resolvedNote","verifiedById")
         SELECT $1,$2,"id",$3,$4,$5,$6,$7,$8,$9,$10 FROM "SpireProcedureCase"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$11 RETURNING *`,
        auth.organizationId, selectedEntity(auth), patientId, text(req.body?.countType, 80) || 'FINAL', itemType,
        expectedCount, actualCount, status, text(req.body?.resolvedNote, 2000) || null, text(req.body?.verifiedById, 120) || auth.userId, req.params.caseId,
      );
      if (!rows[0]) throw httpError(404, 'Procedure case not found');
      await audit(prisma, auth, patientId, 'SURGICAL_COUNT', 'SURGICAL_COUNT', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });
};
