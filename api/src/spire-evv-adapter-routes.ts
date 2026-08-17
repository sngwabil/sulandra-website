import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import {
  appendSpireEvvTransmissionEvent,
  buildCanonicalOhioEvvVisitPayload,
  loadCanonicalEvvSnapshot,
  validateCanonicalEvvSnapshot,
} from './spire-evv-canonical.js';

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
type Dependencies = { authOf: (response: express.Response) => AuthContext };

const statusWriters = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HOUSE_MANAGER,
  UserRole.BILLING_SPECIALIST, UserRole.CEO, UserRole.DOO,
]);
const testReaders = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.BILLING_SPECIALIST,
  UserRole.AUDITOR, UserRole.CEO, UserRole.DOO,
]);
const testWriters = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.BILLING_SPECIALIST,
  UserRole.CEO, UserRole.DOO,
]);
const clean = (value: unknown, max = 5000) => String(value ?? '').trim().slice(0, max);
const owner = (auth: AuthContext) => auth.enterpriseOwner === true
  || clean(auth.email, 320).toLowerCase() === 'admin@sulandrahealth.com';
const httpError = (status: number, message: string, details?: unknown) => Object.assign(new Error(message), { status, details });
const entity = (auth: AuthContext) => {
  if (!auth.legalEntityId) throw httpError(409, 'Select a Sulandra company before opening the EVV UAT console');
  return auth.legalEntityId;
};
const ensureStatusWrite = (auth: AuthContext) => {
  if (!statusWriters.has(auth.role) && !owner(auth)) throw httpError(403, 'EVV transmission write access is required');
};
const ensureTestRead = (auth: AuthContext) => {
  entity(auth);
  if (!testReaders.has(auth.role) && !owner(auth)) throw httpError(403, 'EVV adapter test access is required');
};
const ensureTestWrite = (auth: AuthContext) => {
  ensureTestRead(auth);
  if (!testWriters.has(auth.role) && !owner(auth)) throw httpError(403, 'EVV adapter UAT simulation access is required');
};

async function audit(prisma: PrismaClient, auth: AuthContext, patientId: string, action: string, resourceType: string, resourceId: string, after: unknown) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"(
      "id","organizationId","actorUserId","actorEmail","clientId","action","resourceType","resourceId",
      "afterValue","ipAddress","userAgent"
    ) VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
    auth.organizationId, auth.userId, auth.email ?? null, patientId, action, resourceType, resourceId,
    JSON.stringify(after ?? {}), auth.ipAddress ?? null, auth.userAgent ?? null,
  );
}

async function selectedVisit(prisma: PrismaClient, auth: AuthContext, patientId: string, visitId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireEvvVisit"
      WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3
        AND ("legalEntityId" IS NULL OR "legalEntityId"=$4) LIMIT 1`,
    auth.organizationId, patientId, visitId, entity(auth),
  );
  if (!rows[0]) throw httpError(404, 'EVV visit was not found in the selected company scope');
  return rows[0];
}

async function selectedTransmission(prisma: PrismaClient, auth: AuthContext, patientId: string, transmissionId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireEvvTransmission"
      WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3
        AND ("legalEntityId" IS NULL OR "legalEntityId"=$4) LIMIT 1`,
    auth.organizationId, patientId, transmissionId, entity(auth),
  );
  if (!rows[0]) throw httpError(404, 'EVV transmission was not found in the selected company scope');
  return rows[0];
}

export const registerSpireEvvAdapterRoutes = (app: express.Express, prisma: PrismaClient, deps: Dependencies) => {
  const { authOf } = deps;

  app.get('/api/spire/evv/adapter-status', async (_req, res, next) => {
    try {
      const auth = authOf(res); ensureTestRead(auth);
      const counts = await prisma.$queryRawUnsafe<Array<{ environment: string; status: string; count: number }>>(
        `SELECT "environment","status",count(*)::int AS count
           FROM "SpireEvvTransmission"
          WHERE "organizationId"=$1 AND ("legalEntityId" IS NULL OR "legalEntityId"=$2)
          GROUP BY "environment","status" ORDER BY "environment","status"`,
        auth.organizationId, entity(auth),
      );
      res.json({ data: {
        adapter: 'OHIO_ALTERNATE_EVV',
        mode: 'UAT_SIMULATOR_ONLY',
        externalUatConfigured: false,
        productionConfigured: false,
        certified: false,
        certificationState: 'NOT_CERTIFIED',
        productionBillingGate: 'REQUIRES_ACCEPTED_PRODUCTION_TRANSMISSION',
        counts,
        message: 'SPIRE can build and validate canonical Ohio Alternate EVV payloads and simulate UAT responses locally. No external Sandata/ODM transmission or certification is represented by this console.',
      } });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/patients/:patientId/evv/visits/:visitId/adapter-preview', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureTestRead(auth);
      const patientId = req.params.patientId, visitId = req.params.visitId;
      await selectedVisit(prisma, auth, patientId, visitId);
      const snapshot = await loadCanonicalEvvSnapshot(prisma, auth.organizationId, patientId, visitId);
      const validationErrors = validateCanonicalEvvSnapshot(snapshot);
      const payload = buildCanonicalOhioEvvVisitPayload(snapshot, 'PREVIEW');
      res.json({ data: {
        environment: 'UAT',
        simulatorOnly: true,
        externalSubmission: false,
        sequenceConsumed: false,
        transmittable: validationErrors.length === 0,
        validationErrors,
        payload,
        certificationClaimed: false,
      } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/patients/:patientId/evv/transmissions/:transmissionId/simulate-uat-response', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureTestWrite(auth);
      const patientId = req.params.patientId;
      const current = await selectedTransmission(prisma, auth, patientId, req.params.transmissionId);
      if (clean(current.environment, 20).toUpperCase() !== 'UAT') {
        throw httpError(409, 'Only UAT transmissions can receive simulated responses. Production acknowledgements require the future authenticated external adapter.');
      }
      const status = clean(req.body?.status, 40).toUpperCase();
      const allowed = new Set(['ACKNOWLEDGED','ACCEPTED','REJECTED','RETRY_PENDING','FAILED']);
      if (!allowed.has(status)) throw httpError(400, 'UAT simulation status must be ACKNOWLEDGED, ACCEPTED, REJECTED, RETRY_PENDING or FAILED');
      const reason = clean(req.body?.reason, 2000) || (status === 'ACCEPTED' ? 'Simulated UAT acceptance' : `Simulated UAT ${status.toLowerCase()}`);
      const transactionId = clean(req.body?.transactionId, 250) || `SIM-UAT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const simulatedResponse = {
        simulated: true,
        externalTransmission: false,
        environment: 'UAT',
        status,
        userResponse: req.body?.response ?? {},
      };
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireEvvTransmission" SET
          "status"=$1,"transactionId"=$2,"ackReason"=$3,
          "acknowledgedAt"=CASE WHEN $1 IN ('ACKNOWLEDGED','ACCEPTED','REJECTED') THEN COALESCE("acknowledgedAt",NOW()) ELSE "acknowledgedAt" END,
          "resolvedAt"=CASE WHEN $1 IN ('ACCEPTED','REJECTED','FAILED') THEN NOW() ELSE NULL END,
          "lastError"=CASE WHEN $1 IN ('REJECTED','FAILED') THEN $3 ELSE NULL END,
          "nextAttemptAt"=CASE WHEN $1='RETRY_PENDING' THEN NOW()+INTERVAL '5 minutes' ELSE NULL END,
          "updatedAt"=NOW()
         WHERE "organizationId"=$4 AND "patientId"=$5 AND "id"=$6 RETURNING *`,
        status, transactionId, reason, auth.organizationId, patientId, req.params.transmissionId,
      );
      await appendSpireEvvTransmissionEvent(prisma, {
        organizationId: auth.organizationId,
        transmissionId: req.params.transmissionId,
        eventType: `UAT_SIMULATED_${status}`,
        status,
        transactionId,
        reason,
        response: simulatedResponse,
        actorUserId: auth.userId,
      });
      const visitId = clean(current.evvVisitId, 160);
      if (visitId) {
        await prisma.$executeRawUnsafe(
          `UPDATE "SpireEvvVisit" SET "transmissionState"=$1,"updatedAt"=NOW()
            WHERE "organizationId"=$2 AND "patientId"=$3 AND "id"=$4`,
          `UAT_${status}`, auth.organizationId, patientId, visitId,
        );
      }
      await audit(prisma, auth, patientId, 'SIMULATE_EVV_UAT_RESPONSE', 'EVV_TRANSMISSION', req.params.transmissionId, {
        fromStatus: current.status,
        toStatus: status,
        transactionId,
        simulated: true,
        externalTransmission: false,
      });
      res.json({ data: {
        transmission: rows[0],
        simulation: simulatedResponse,
        productionBillingSatisfied: false,
        certificationClaimed: false,
      } });
    } catch (error) { next(error); }
  });

  // The Phase A status endpoint is retained for compatibility, but production
  // acknowledgement cannot be manually asserted. Register this guard before it.
  app.post('/api/spire/patients/:patientId/evv/transmissions/:transmissionId/status', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureStatusWrite(auth);
      const rows = await prisma.$queryRawUnsafe<Array<{ environment: string }>>(
        `SELECT "environment" FROM "SpireEvvTransmission"
          WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 LIMIT 1`,
        auth.organizationId, req.params.patientId, req.params.transmissionId,
      );
      if (!rows[0]) return void next();
      if (clean(rows[0].environment, 20).toUpperCase() === 'PRODUCTION') {
        throw httpError(409, 'Manual PRODUCTION EVV status updates are disabled. ACCEPTED production evidence must come from the authenticated external Sandata/ODM adapter after external UAT/certification work is completed.');
      }
      next();
    } catch (error) { next(error); }
  });
};
