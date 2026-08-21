import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import {
  appendSpireEvvTransmissionEvent,
  buildCanonicalOhioEvvVisitPayload,
  evvHttpError,
  evvText,
  loadCanonicalEvvSnapshot,
  nextSpireEvvSequence,
  validateCanonicalEvvSnapshot,
  type SpireEvvEnvironment,
} from './spire-evv-canonical.js';

type A = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  legalEntityId?: string;
};
type D = { authOf: (r: express.Response) => A };

const readers = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.AUDITOR,
  UserRole.DSP,
  UserRole.DELEGATING_NURSE,
  UserRole.LPN,
  UserRole.RN,
  UserRole.HOUSE_MANAGER,
  UserRole.BILLING_SPECIALIST,
  UserRole.CEO,
  UserRole.DOO,
]);
const writers = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.BILLING_SPECIALIST,
  UserRole.CEO,
  UserRole.DOO,
]);
const text = (v: unknown, n = 1000) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const admin = (a: A) => [UserRole.ADMINISTRATOR, UserRole.CEO, UserRole.DOO].includes(a.role)
  || String(a.email || '').toLowerCase() === 'admin@sulandrahealth.com';

async function scope(p: PrismaClient, a: A, pid: string, write = false) {
  if (!readers.has(a.role) || (write && !writers.has(a.role))) {
    throw Object.assign(new Error('Authorization/EVV access is required'), { status: 403 });
  }
  if (admin(a) || a.role === UserRole.AUDITOR || a.role === UserRole.BILLING_SPECIALIST) return;
  const x = await p.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeClientAssignment"
        WHERE "organizationId"=$1 AND "userId"=$2 AND "clientId"=$3
       UNION ALL
       SELECT 1 FROM "SpirePatientHomeAssignment" q
       JOIN "SpireEmployeeHomeAssignment" h
         ON h."organizationId"=q."organizationId" AND h."homeId"=q."homeId"
       WHERE q."organizationId"=$1 AND h."userId"=$2 AND q."patientId"=$3
         AND(q."endsAt" IS NULL OR q."endsAt">NOW())
     ) ok`,
    a.organizationId,
    a.userId,
    pid,
  );
  if (!x[0]?.ok) throw Object.assign(new Error('This chart is outside your authorized scope'), { status: 403 });
}

async function audit(
  p: PrismaClient,
  a: A,
  pid: string,
  action: string,
  type: string,
  id: string,
  after: unknown,
) {
  await p.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"(
      "id","organizationId","actorUserId","actorEmail","clientId","action","resourceType","resourceId",
      "afterValue","ipAddress","userAgent"
    ) VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
    a.organizationId,
    a.userId,
    a.email ?? null,
    pid,
    action,
    type,
    id,
    JSON.stringify(after ?? {}),
    a.ipAddress ?? null,
    a.userAgent ?? null,
  );
}

async function alerts(p: PrismaClient, a: A, pid: string, id: string) {
  await p.$executeRawUnsafe(
    `INSERT INTO "SpireAuthorizationAlert"("organizationId","authorizationId","patientId","alertType","severity","message")
     SELECT $1,"id",$2,'UTILIZATION','WARNING','Authorization has 20% or less units remaining'
       FROM "SpireServiceAuthorization"
      WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 AND "authorizedUnits">0
        AND ("authorizedUnits"-"deliveredUnits")/"authorizedUnits"<=.20
        AND NOT EXISTS(
          SELECT 1 FROM "SpireAuthorizationAlert"
           WHERE "organizationId"=$1 AND "authorizationId"=$3 AND "alertType"='UTILIZATION' AND "status"='OPEN'
        )`,
    a.organizationId,
    pid,
    id,
  );
  await p.$executeRawUnsafe(
    `INSERT INTO "SpireAuthorizationAlert"("organizationId","authorizationId","patientId","alertType","severity","message")
     SELECT $1,"id",$2,'EXPIRATION','WARNING','Authorization expires within 30 days'
       FROM "SpireServiceAuthorization"
      WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3
        AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE+30
        AND NOT EXISTS(
          SELECT 1 FROM "SpireAuthorizationAlert"
           WHERE "organizationId"=$1 AND "authorizationId"=$3 AND "alertType"='EXPIRATION' AND "status"='OPEN'
        )`,
    a.organizationId,
    pid,
    id,
  );
}

const has = (body: unknown, key: string) => Boolean(body && typeof body === 'object' && Object.hasOwn(body, key));
const nullableText = (value: unknown, max: number) => text(value, max) || null;
const nullableNumber = (value: unknown) => value === null || value === undefined || value === '' ? null : Number(value);
const nullableDateTime = (value: unknown) => value === null || value === undefined || value === '' ? null : String(value);

export const registerSpireAuthorizationsEvvRoutes = (app: express.Express, p: PrismaClient, d: D) => {
  const { authOf } = d;

  app.get('/api/spire/patients/:patientId/authorizations/overview', async (req, res, next) => {
    try {
      const a = authOf(res), pid = req.params.patientId;
      await scope(p, a, pid);
      const [auths, visits, openAlerts, recon] = await Promise.all([
        p.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT *,GREATEST("authorizedUnits"-"deliveredUnits",0) "remainingUnits",
                  CASE WHEN "authorizedUnits">0 THEN ROUND(("deliveredUnits"/"authorizedUnits")*100,1) ELSE 0 END "utilizationPercent"
             FROM "SpireServiceAuthorization"
            WHERE "organizationId"=$1 AND "patientId"=$2 ORDER BY "endDate"`,
          a.organizationId, pid,
        ),
        p.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireEvvVisit"
            WHERE "organizationId"=$1 AND "patientId"=$2
            ORDER BY COALESCE("clockInAt","scheduledStart","createdAt") DESC LIMIT 100`,
          a.organizationId, pid,
        ),
        p.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireAuthorizationAlert"
            WHERE "organizationId"=$1 AND "patientId"=$2 AND "status"='OPEN'
            ORDER BY "createdAt" DESC`,
          a.organizationId, pid,
        ),
        p.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireBillingReconciliation"
            WHERE "organizationId"=$1 AND "patientId"=$2
            ORDER BY "serviceDate" DESC LIMIT 100`,
          a.organizationId, pid,
        ),
      ]);
      res.json({ data: { authorizations: auths, evvVisits: visits, alerts: openAlerts, reconciliation: recon } });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/authorizations', async (req, res, next) => {
    try {
      const a = authOf(res), pid = req.params.patientId;
      await scope(p, a, pid, true);
      const serviceCode = text(req.body?.serviceCode, 80), serviceName = text(req.body?.serviceName, 200);
      const start = text(req.body?.startDate, 10), end = text(req.body?.endDate, 10);
      const units = Number(req.body?.authorizedUnits || 0);
      if (!serviceCode || !serviceName || !start || !end || units <= 0) {
        throw Object.assign(new Error('Service code, service name, dates and authorized units are required'), { status: 400 });
      }
      const rows = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireServiceAuthorization"(
          "organizationId","patientId","authorizationNumber","payer","waiverType","serviceCode","serviceName",
          "unitType","authorizedUnits","startDate","endDate","notes","createdById"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        a.organizationId, pid, text(req.body?.authorizationNumber, 120) || null,
        text(req.body?.payer, 80) || 'MEDICAID', text(req.body?.waiverType, 120) || null,
        serviceCode, serviceName, text(req.body?.unitType, 40) || 'UNIT', units,
        start, end, text(req.body?.notes, 3000) || null, a.userId,
      );
      await audit(p, a, pid, 'CREATE_AUTHORIZATION', 'SERVICE_AUTHORIZATION', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/evv/visits', async (req, res, next) => {
    try {
      const a = authOf(res), pid = req.params.patientId;
      await scope(p, a, pid, true);
      const authId = text(req.body?.authorizationId, 120), code = text(req.body?.serviceCode, 80);
      if (!code) throw Object.assign(new Error('Service code is required'), { status: 400 });
      if (authId) {
        const ok = await p.$queryRawUnsafe<Array<{ remaining: number }>>(
          `SELECT ("authorizedUnits"-"deliveredUnits")::float8 remaining
             FROM "SpireServiceAuthorization"
            WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 AND "status"='ACTIVE'
              AND CURRENT_DATE BETWEEN "startDate" AND "endDate"`,
          a.organizationId, pid, authId,
        );
        if (!ok[0] || Number(ok[0].remaining) <= 0) {
          throw Object.assign(new Error('No active authorization units remain for this service'), { status: 409 });
        }
      }
      const rows = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireEvvVisit"(
          "organizationId","patientId","authorizationId","employeeUserId","appointmentId","serviceCode",
          "scheduledStart","scheduledEnd","verificationMethod","status"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPEN') RETURNING *`,
        a.organizationId, pid, authId || null, text(req.body?.employeeUserId, 120) || a.userId,
        text(req.body?.appointmentId, 120) || null, code, req.body?.scheduledStart || null,
        req.body?.scheduledEnd || null, text(req.body?.verificationMethod, 80) || 'MOBILE',
      );
      await audit(p, a, pid, 'CREATE_EVV_VISIT', 'EVV_VISIT', String(rows[0].id), rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/evv/visits/:visitId/complete', async (req, res, next) => {
    try {
      const a = authOf(res), pid = req.params.patientId;
      await scope(p, a, pid, true);
      const units = Math.max(0, Number(req.body?.units || 0));
      if (units <= 0) throw Object.assign(new Error('Delivered units must be greater than zero'), { status: 400 });
      const v = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireEvvVisit" WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3`,
        a.organizationId, pid, req.params.visitId,
      );
      if (!v[0]) throw Object.assign(new Error('EVV visit not found'), { status: 404 });
      const aid = String(v[0].authorizationId || '');
      if (aid) {
        const left = await p.$queryRawUnsafe<Array<{ remaining: number }>>(
          `SELECT ("authorizedUnits"-"deliveredUnits")::float8 remaining
             FROM "SpireServiceAuthorization"
            WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 FOR UPDATE`,
          a.organizationId, pid, aid,
        );
        if (!left[0] || units > Number(left[0].remaining)) {
          throw Object.assign(new Error('Delivered units exceed remaining authorization'), { status: 409 });
        }
      }
      const rows = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireEvvVisit"
            SET "clockInAt"=COALESCE("clockInAt",$1::timestamptz,NOW()),
                "clockOutAt"=COALESCE($2::timestamptz,NOW()),
                "units"=$3,"status"='VERIFIED',"verifiedAt"=NOW(),"verifiedById"=$4,"updatedAt"=NOW()
          WHERE "organizationId"=$5 AND "patientId"=$6 AND "id"=$7 RETURNING *`,
        req.body?.clockInAt || null, req.body?.clockOutAt || null, units, a.userId,
        a.organizationId, pid, req.params.visitId,
      );
      if (aid) {
        await p.$executeRawUnsafe(
          `UPDATE "SpireServiceAuthorization"
              SET "deliveredUnits"="deliveredUnits"+$1,"updatedAt"=NOW()
            WHERE "organizationId"=$2 AND "patientId"=$3 AND "id"=$4`,
          units, a.organizationId, pid, aid,
        );
        await p.$executeRawUnsafe(
          `INSERT INTO "SpireAuthorizationLedger"(
            "organizationId","authorizationId","patientId","evvVisitId","entryType","units","serviceDate","createdById"
          ) VALUES($1,$2,$3,$4,'DELIVERED',$5,CURRENT_DATE,$6)`,
          a.organizationId, aid, pid, req.params.visitId, units, a.userId,
        );
        await alerts(p, a, pid, aid);
      }
      await p.$executeRawUnsafe(
        `INSERT INTO "SpireBillingReconciliation"(
          "organizationId","patientId","authorizationId","evvVisitId","serviceDate","serviceCode","deliveredUnits","billableUnits","status"
        ) VALUES($1,$2,$3,$4,CURRENT_DATE,$5,$6,$6,'READY')`,
        a.organizationId, pid, aid || null, req.params.visitId, String(v[0].serviceCode), units,
      );
      await audit(p, a, pid, 'VERIFY_EVV_VISIT', 'EVV_VISIT', req.params.visitId, rows[0]);
      res.json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  // SPIRE 1.1 canonical history. Existing 1.0 visit behavior remains intact while
  // this endpoint exposes the append-only evidence and transmission lifecycle.
  app.get('/api/spire/patients/:patientId/evv/visits/:visitId/history', async (req, res, next) => {
    try {
      const a = authOf(res), pid = req.params.patientId;
      await scope(p, a, pid);
      const snapshot = await loadCanonicalEvvSnapshot(p, a.organizationId, pid, req.params.visitId);
      const transmissions = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT t.*,
          COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e."createdAt")
                    FROM "SpireEvvTransmissionEvent" e
                    WHERE e."organizationId"=t."organizationId" AND e."transmissionId"=t."id"),'[]'::jsonb) AS events
         FROM "SpireEvvTransmission" t
         WHERE t."organizationId"=$1 AND t."patientId"=$2 AND t."evvVisitId"=$3
         ORDER BY t."createdAt" DESC`,
        a.organizationId, pid, req.params.visitId,
      );
      res.json({ data: { ...snapshot, transmissions } });
    } catch (e) { next(e); }
  });

  // Manual changes never overwrite original clock evidence. Corrected values live
  // on adjusted fields and every change receives immutable reason-99 provenance.
  app.post('/api/spire/patients/:patientId/evv/visits/:visitId/corrections', async (req, res, next) => {
    try {
      const a = authOf(res), pid = req.params.patientId;
      await scope(p, a, pid, true);
      if (!a.email) throw evvHttpError(409, 'A signed-in user email is required for EVV correction provenance');
      const reasonCode = text(req.body?.reasonCode, 20) || '99';
      if (reasonCode !== '99') throw evvHttpError(400, 'Ohio Alternate EVV manual corrections require reason code 99');
      const memo = nullableText(req.body?.changeReasonMemo, 256);
      const body = req.body ?? {};
      const changedKeys = [
        'providerMedicaidId','patientOtherId','patientMedicaidId','staffOtherId','payer','payerProgram',
        'procedureCode','modifier1','timeZone','visitLocationType','billVisit','hoursToBillMinutes',
        'groupVisitCode','visitMemo','adjustedClockInAt','adjustedClockOutAt',
      ].filter((key) => has(body, key));
      if (!changedKeys.length) throw evvHttpError(400, 'At least one canonical EVV field must be supplied');
      if (has(body, 'visitLocationType')) {
        const location = text(body.visitLocationType, 5);
        if (location && !['1', '2'].includes(location)) {
          throw evvHttpError(400, 'visitLocationType must be 1 (Home) or 2 (Community)');
        }
      }
      if (has(body, 'hoursToBillMinutes')) {
        const minutes = nullableNumber(body.hoursToBillMinutes);
        if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0)) {
          throw evvHttpError(400, 'hoursToBillMinutes must be a non-negative number');
        }
      }
      const result = await p.$transaction(async (tx) => {
        const currentRows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireEvvVisit"
            WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 FOR UPDATE`,
          a.organizationId, pid, req.params.visitId,
        );
        const current = currentRows[0];
        if (!current) throw evvHttpError(404, 'EVV visit not found');
        const visitOtherId = evvText(current.visitOtherId, 120) || req.params.visitId;
        const seqRows = await tx.$queryRawUnsafe<Array<{ sequenceId: string }>>(
          `SELECT "lastSequenceId"::text AS "sequenceId" FROM "SpireEvvSequence"
            WHERE "organizationId"=$1 AND "recordType"='VISIT' AND "recordOtherId"=$2 LIMIT 1`,
          a.organizationId, visitOtherId,
        );
        const updatedRows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `UPDATE "SpireEvvVisit" SET
            "providerMedicaidId"=CASE WHEN $1::boolean THEN $2 ELSE "providerMedicaidId" END,
            "patientOtherId"=CASE WHEN $3::boolean THEN $4 ELSE "patientOtherId" END,
            "patientMedicaidId"=CASE WHEN $5::boolean THEN $6 ELSE "patientMedicaidId" END,
            "staffOtherId"=CASE WHEN $7::boolean THEN $8 ELSE "staffOtherId" END,
            "payer"=CASE WHEN $9::boolean THEN $10 ELSE "payer" END,
            "payerProgram"=CASE WHEN $11::boolean THEN $12 ELSE "payerProgram" END,
            "procedureCode"=CASE WHEN $13::boolean THEN $14 ELSE "procedureCode" END,
            "modifier1"=CASE WHEN $15::boolean THEN $16 ELSE "modifier1" END,
            "timeZone"=CASE WHEN $17::boolean THEN $18 ELSE "timeZone" END,
            "visitLocationType"=CASE WHEN $19::boolean THEN $20 ELSE "visitLocationType" END,
            "billVisit"=CASE WHEN $21::boolean THEN $22::boolean ELSE "billVisit" END,
            "hoursToBillMinutes"=CASE WHEN $23::boolean THEN $24::numeric ELSE "hoursToBillMinutes" END,
            "groupVisitCode"=CASE WHEN $25::boolean THEN $26 ELSE "groupVisitCode" END,
            "visitMemo"=CASE WHEN $27::boolean THEN $28 ELSE "visitMemo" END,
            "adjustedClockInAt"=CASE WHEN $29::boolean THEN $30::timestamptz ELSE "adjustedClockInAt" END,
            "adjustedClockOutAt"=CASE WHEN $31::boolean THEN $32::timestamptz ELSE "adjustedClockOutAt" END,
            "transmissionState"='DIRTY',"updatedAt"=NOW()
          WHERE "organizationId"=$33 AND "patientId"=$34 AND "id"=$35 RETURNING *`,
          has(body,'providerMedicaidId'), nullableText(body.providerMedicaidId,80),
          has(body,'patientOtherId'), nullableText(body.patientOtherId,120),
          has(body,'patientMedicaidId'), nullableText(body.patientMedicaidId,80),
          has(body,'staffOtherId'), nullableText(body.staffOtherId,120),
          has(body,'payer'), nullableText(body.payer,120),
          has(body,'payerProgram'), nullableText(body.payerProgram,120),
          has(body,'procedureCode'), nullableText(body.procedureCode,120),
          has(body,'modifier1'), nullableText(body.modifier1,40),
          has(body,'timeZone'), nullableText(body.timeZone,80),
          has(body,'visitLocationType'), nullableText(body.visitLocationType,5),
          has(body,'billVisit'), Boolean(body.billVisit),
          has(body,'hoursToBillMinutes'), nullableNumber(body.hoursToBillMinutes),
          has(body,'groupVisitCode'), nullableText(body.groupVisitCode,120),
          has(body,'visitMemo'), nullableText(body.visitMemo,1000),
          has(body,'adjustedClockInAt'), nullableDateTime(body.adjustedClockInAt),
          has(body,'adjustedClockOutAt'), nullableDateTime(body.adjustedClockOutAt),
          a.organizationId, pid, req.params.visitId,
        );
        const updated = updatedRows[0];
        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireEvvVisitChange"(
            "organizationId","legalEntityId","patientId","evvVisitId","appliesToSequenceId","actorUserId",
            "changeMadeByEmail","reasonCode","changeReasonMemo","source","beforeValue","afterValue"
          ) VALUES($1,$2,$3,$4,$5::numeric,$6,$7,'99',$8,'MANUAL_EDIT',$9::jsonb,$10::jsonb)`,
          a.organizationId, current.legalEntityId ?? a.legalEntityId ?? null, pid, req.params.visitId,
          seqRows[0]?.sequenceId ?? null, a.userId, a.email, memo,
          JSON.stringify(current), JSON.stringify(updated),
        );
        return updated;
      });
      await audit(p, a, pid, 'CORRECT_EVV_VISIT', 'EVV_VISIT', req.params.visitId, { changedKeys, reasonCode: '99' });
      res.json({ data: result });
    } catch (e) { next(e); }
  });

  // Queue creates an immutable payload snapshot and consumes a new sequence ID.
  // It deliberately does not call Sandata; external UAT/certification belongs to
  // the later adapter phase and cannot be represented as complete by code alone.
  app.post('/api/spire/patients/:patientId/evv/visits/:visitId/queue-transmission', async (req, res, next) => {
    try {
      const a = authOf(res), pid = req.params.patientId;
      await scope(p, a, pid, true);
      const environment = (text(req.body?.environment, 20).toUpperCase() || 'UAT') as SpireEvvEnvironment;
      if (!['UAT', 'PRODUCTION'].includes(environment)) throw evvHttpError(400, 'environment must be UAT or PRODUCTION');
      const snapshot = await loadCanonicalEvvSnapshot(p, a.organizationId, pid, req.params.visitId);
      const validationErrors = validateCanonicalEvvSnapshot(snapshot);
      if (validationErrors.length) {
        throw evvHttpError(409, 'EVV visit is not ready to queue', { validationErrors });
      }
      const visitOtherId = evvText(snapshot.visit.visitOtherId, 120) || req.params.visitId;
      const sequenceId = await nextSpireEvvSequence(p, a.organizationId, 'VISIT', visitOtherId);
      const payload = buildCanonicalOhioEvvVisitPayload(snapshot, sequenceId);
      const rows = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireEvvTransmission"(
          "organizationId","legalEntityId","patientId","evvVisitId","recordType","recordOtherId","sequenceId",
          "environment","target","status","payload","queuedAt"
        ) VALUES($1,$2,$3,$4,'VISIT',$5,$6::numeric,$7,'SANDATA_AGGREGATOR','QUEUED',$8::jsonb,NOW()) RETURNING *`,
        a.organizationId, snapshot.visit.legalEntityId ?? a.legalEntityId ?? null, pid, req.params.visitId,
        visitOtherId, sequenceId, environment, JSON.stringify(payload),
      );
      const transmission = rows[0];
      await appendSpireEvvTransmissionEvent(p, {
        organizationId: a.organizationId,
        transmissionId: String(transmission.id),
        eventType: 'QUEUED',
        status: 'QUEUED',
        reason: 'Canonical EVV payload snapshot queued; no external submission performed by this action.',
        response: { sequenceId, environment },
        actorUserId: a.userId,
      });
      await p.$executeRawUnsafe(
        `UPDATE "SpireEvvVisit" SET "transmissionState"='QUEUED',"lastQueuedAt"=NOW(),"updatedAt"=NOW()
          WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3`,
        a.organizationId, pid, req.params.visitId,
      );
      await audit(p, a, pid, 'QUEUE_EVV_TRANSMISSION', 'EVV_TRANSMISSION', String(transmission.id), {
        visitId: req.params.visitId, sequenceId, environment,
      });
      res.status(202).json({ data: transmission });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/evv/transmissions/:transmissionId/status', async (req, res, next) => {
    try {
      const a = authOf(res), pid = req.params.patientId;
      await scope(p, a, pid, true);
      const status = text(req.body?.status, 40).toUpperCase();
      const allowed = new Set(['SENT','ACKNOWLEDGED','ACCEPTED','REJECTED','RETRY_PENDING','FAILED']);
      if (!allowed.has(status)) throw evvHttpError(400, 'Unsupported EVV transmission status');
      const txRows = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireEvvTransmission"
          WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 LIMIT 1`,
        a.organizationId, pid, req.params.transmissionId,
      );
      const current = txRows[0];
      if (!current) throw evvHttpError(404, 'EVV transmission not found');
      const transactionId = nullableText(req.body?.transactionId, 250);
      const reason = nullableText(req.body?.reason, 2000);
      const response = req.body?.response ?? {};
      const updatedRows = await p.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireEvvTransmission" SET
          "status"=$1,
          "transactionId"=COALESCE($2,"transactionId"),
          "ackReason"=CASE WHEN $3::boolean THEN $4 ELSE "ackReason" END,
          "attemptCount"="attemptCount"+CASE WHEN $1='SENT' THEN 1 ELSE 0 END,
          "sentAt"=CASE WHEN $1='SENT' THEN COALESCE("sentAt",NOW()) ELSE "sentAt" END,
          "acknowledgedAt"=CASE WHEN $1 IN ('ACKNOWLEDGED','ACCEPTED','REJECTED') THEN COALESCE("acknowledgedAt",NOW()) ELSE "acknowledgedAt" END,
          "resolvedAt"=CASE WHEN $1 IN ('ACCEPTED','REJECTED','FAILED') THEN NOW() ELSE "resolvedAt" END,
          "lastError"=CASE WHEN $1 IN ('REJECTED','FAILED') THEN $4 ELSE "lastError" END,
          "updatedAt"=NOW()
        WHERE "organizationId"=$5 AND "patientId"=$6 AND "id"=$7 RETURNING *`,
        status, transactionId, has(req.body, 'reason'), reason,
        a.organizationId, pid, req.params.transmissionId,
      );
      await appendSpireEvvTransmissionEvent(p, {
        organizationId: a.organizationId,
        transmissionId: req.params.transmissionId,
        eventType: status,
        status,
        transactionId,
        reason,
        response,
        actorUserId: a.userId,
      });
      const visitId = text(current.evvVisitId, 120);
      if (visitId) {
        const visitState = status === 'ACCEPTED' ? 'ACCEPTED' : status === 'REJECTED' ? 'REJECTED' : status;
        await p.$executeRawUnsafe(
          `UPDATE "SpireEvvVisit" SET "transmissionState"=$1,
             "lastAcceptedAt"=CASE WHEN $1='ACCEPTED' THEN NOW() ELSE "lastAcceptedAt" END,"updatedAt"=NOW()
           WHERE "organizationId"=$2 AND "patientId"=$3 AND "id"=$4`,
          visitState, a.organizationId, pid, visitId,
        );
      }
      await audit(p, a, pid, 'UPDATE_EVV_TRANSMISSION_STATUS', 'EVV_TRANSMISSION', req.params.transmissionId, {
        fromStatus: current.status, toStatus: status, transactionId, reason,
      });
      res.json({ data: updatedRows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/authorizations/:authorizationId/alerts/acknowledge', async (req, res, next) => {
    try {
      const a = authOf(res), pid = req.params.patientId;
      await scope(p, a, pid, true);
      await p.$executeRawUnsafe(
        `UPDATE "SpireAuthorizationAlert"
            SET "status"='ACKNOWLEDGED',"acknowledgedAt"=NOW(),"acknowledgedById"=$1,"updatedAt"=NOW()
          WHERE "organizationId"=$2 AND "patientId"=$3 AND "authorizationId"=$4 AND "status"='OPEN'`,
        a.userId, a.organizationId, pid, req.params.authorizationId,
      );
      res.json({ data: { ok: true } });
    } catch (e) { next(e); }
  });
};
