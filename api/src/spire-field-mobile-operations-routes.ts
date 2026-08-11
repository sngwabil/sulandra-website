import { createHash, randomUUID } from 'node:crypto';
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

const text = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const err = (status: number, message: string) => Object.assign(new Error(message), { status });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const elevatedRoles = new Set<UserRole>([UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.CEO, UserRole.DOO]);
const careLogRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.DSP, UserRole.HOUSE_MANAGER,
  UserRole.RN, UserRole.LPN, UserRole.DELEGATING_NURSE, UserRole.CEO, UserRole.DOO,
]);

const entity = (auth: AuthContext) => {
  const id = text(auth.legalEntityId, 120);
  if (!id) throw err(409, 'Select a Sulandra company before using the field app');
  return id;
};
const elevated = (auth: AuthContext) => elevatedRoles.has(auth.role)
  || auth.enterpriseOwner === true
  || String(auth.email || '').toLowerCase() === 'admin@sulandrahealth.com';
const scopes = (response: express.Response) => Array.isArray(response.locals.mobileScopes)
  ? response.locals.mobileScopes.filter((value: unknown): value is string => typeof value === 'string')
  : [];

async function requireMobile(
  prisma: PrismaClient,
  response: express.Response,
  auth: AuthContext,
  requiredScope: string,
) {
  if (response.locals.mobileTokenUse !== 'mobile_oauth') throw err(401, 'A scoped Sulandra mobile token is required');
  const allowedScopes = scopes(response);
  if (!allowedScopes.includes(requiredScope) && !allowedScopes.includes('admin:field')) {
    throw err(403, `Mobile permission ${requiredScope} is required`);
  }
  const tokenEntity = text(response.locals.mobileLegalEntityId, 120);
  if (tokenEntity && tokenEntity !== entity(auth)) throw err(403, 'This mobile token belongs to a different Sulandra company');
  const jti = text(response.locals.mobileJti, 500);
  if (!jti) throw err(401, 'Mobile token identifier is missing');
  const grants = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "SpireMobileAccessGrant"
      WHERE "organizationId"=$1 AND "userId"=$2 AND "jtiHash"=$3
        AND "revokedAt" IS NULL AND "expiresAt">NOW() LIMIT 1`,
    auth.organizationId, auth.userId, hash(jti),
  );
  if (!grants[0]) throw err(401, 'This mobile session is expired or revoked');
}

async function patientAllowed(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  const legalEntityId = entity(auth);
  const enrolled = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM "ClientEnrollment"
      WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clientId"=$3
        AND "status" IN ('PENDING','ACTIVE','PAUSED')) AS allowed`,
    auth.organizationId, legalEntityId, patientId,
  );
  if (enrolled[0]?.allowed !== true) return false;
  if (elevated(auth) || auth.role === UserRole.AUDITOR) return true;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
      SELECT 1 FROM "SpireEmployeeClientAssignment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 AND "clientId"=$4
      UNION ALL
      SELECT 1 FROM "SpirePatientHomeAssignment" p
      JOIN "SpireEmployeeHomeAssignment" h
        ON h."organizationId"=p."organizationId" AND h."legalEntityId"=p."legalEntityId" AND h."homeId"=p."homeId"
       WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND h."userId"=$3 AND p."patientId"=$4
         AND (p."endsAt" IS NULL OR p."endsAt">NOW())
    ) AS allowed`,
    auth.organizationId, legalEntityId, auth.userId, patientId,
  );
  return rows[0]?.allowed === true;
}

async function audit(
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
  details: unknown,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"(
      "id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent"
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
    randomUUID(), auth.organizationId, auth.legalEntityId ?? null, auth.userId, auth.email ?? null,
    patientId, action, resourceType, resourceId, JSON.stringify(details ?? {}), auth.ipAddress ?? null, auth.userAgent ?? null,
  );
}

const tripTransitions: Record<string, string[]> = {
  SCHEDULED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['EN_ROUTE_TO_PICKUP', 'CANCELLED'],
  EN_ROUTE_TO_PICKUP: ['ARRIVED_PICKUP', 'CANCELLED'],
  ARRIVED_PICKUP: ['RIDER_ON_BOARD', 'NO_SHOW', 'CANCELLED'],
  RIDER_ON_BOARD: ['EN_ROUTE_TO_DESTINATION', 'CANCELLED'],
  EN_ROUTE_TO_DESTINATION: ['ARRIVED_DESTINATION', 'CANCELLED'],
  ARRIVED_DESTINATION: ['COMPLETED'],
  COMPLETED: [], NO_SHOW: [], CANCELLED: [],
};

export const registerSpireFieldMobileOperationsRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  deps: Deps,
) => {
  const { authOf } = deps;

  app.get('/api/mobile/clients/:patientId/care-logs', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await requireMobile(prisma, res, auth, 'carelog:read');
      if (!(await patientAllowed(prisma, auth, req.params.patientId))) throw err(403, 'This client is outside your assigned field scope');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT n."id",n."noteType",n."title",n."status",n."authorUserId",n."signedAt",n."createdAt",v."body"
          FROM "SpireClinicalNote" n
          JOIN "SpireClinicalNoteVersion" v ON v."noteId"=n."id" AND v."version"=n."currentVersion"
         WHERE n."organizationId"=$1 AND n."patientId"=$2 AND n."noteType" IN ('FIELD_CARE_LOG','PROGRESS_NOTE')
         ORDER BY n."createdAt" DESC LIMIT 100`,
        auth.organizationId, req.params.patientId,
      );
      await audit(prisma, auth, req.params.patientId, 'MOBILE_VIEW_CARE_LOGS', 'CARE_LOG', req.params.patientId, { count: rows.length });
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/mobile/clients/:patientId/care-logs', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await requireMobile(prisma, res, auth, 'carelog:write');
      if (!careLogRoles.has(auth.role) && !elevated(auth)) throw err(403, 'Your role cannot create client care logs');
      const patientId = req.params.patientId;
      if (!(await patientAllowed(prisma, auth, patientId))) throw err(403, 'This client is outside your assigned field scope');
      const body = text(req.body?.body, 50_000);
      if (!body) throw err(400, 'Care log text is required');
      const title = text(req.body?.title, 250) || 'Field Care Log';
      const signed = req.body?.sign !== false;
      const noteId = randomUUID();
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireClinicalNote"(
            "id","organizationId","patientId","encounterId","noteType","title","status","currentVersion","authorUserId","signedAt","signedById"
          ) VALUES($1,$2,$3,$4,'FIELD_CARE_LOG',$5,$6,1,$7,$8,$9)`,
          noteId, auth.organizationId, patientId, text(req.body?.encounterId, 120) || null, title,
          signed ? 'SIGNED' : 'DRAFT', auth.userId, signed ? new Date() : null, signed ? auth.userId : null,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireClinicalNoteVersion"("organizationId","noteId","version","body","createdById")
           VALUES($1,$2,1,$3,$4)`,
          auth.organizationId, noteId, body, auth.userId,
        );
      });
      await audit(prisma, auth, patientId, signed ? 'MOBILE_SIGN_CARE_LOG' : 'MOBILE_DRAFT_CARE_LOG', 'CLINICAL_NOTE', noteId, { noteType: 'FIELD_CARE_LOG', signed });
      res.status(201).json({ data: { id: noteId, status: signed ? 'SIGNED' : 'DRAFT' } });
    } catch (error) { next(error); }
  });

  app.post('/api/mobile/transport/trips/:tripId/status', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await requireMobile(prisma, res, auth, 'transport:trips:update');
      const trips = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT t.*,d."userId" AS "driverUserId"
          FROM "NmtTrip" t LEFT JOIN "NmtDriverProfile" d ON d."id"=t."driverId"
         WHERE t."organizationId"=$1 AND t."legalEntityId"=$2 AND t."id"=$3 LIMIT 1`,
        auth.organizationId, entity(auth), req.params.tripId,
      );
      const trip = trips[0];
      if (!trip) throw err(404, 'Transport trip was not found');
      if (!elevated(auth) && String(trip.driverUserId || '') !== auth.userId) throw err(403, 'This transport trip is not assigned to you');
      const current = String(trip.status || 'SCHEDULED');
      const nextStatus = text(req.body?.status, 50).toUpperCase();
      if (!(tripTransitions[current] || []).includes(nextStatus)) throw err(409, `Transport trip cannot move from ${current} to ${nextStatus}`);
      const latitude = req.body?.latitude == null ? null : Number(req.body.latitude);
      const longitude = req.body?.longitude == null ? null : Number(req.body.longitude);
      if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw err(400, 'Invalid latitude');
      if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw err(400, 'Invalid longitude');
      const notes = text(req.body?.notes, 5000) || null;
      const updated = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `UPDATE "NmtTrip" SET "status"=$1,"updatedAt"=NOW()
            WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "id"=$4 AND "status"=$5 RETURNING *`,
          nextStatus, auth.organizationId, entity(auth), req.params.tripId, current,
        );
        if (!rows[0]) throw err(409, 'Transport trip changed on another device; refresh and try again');
        await tx.$executeRawUnsafe(
          `INSERT INTO "NmtTripEvent"(
            "id","organizationId","legalEntityId","tripId","actorUserId","eventType","fromStatus","toStatus","details","latitude","longitude"
          ) VALUES($1,$2,$3,$4,$5,'MOBILE_STATUS',$6,$7,$8::jsonb,$9,$10)`,
          randomUUID(), auth.organizationId, entity(auth), req.params.tripId, auth.userId, current, nextStatus,
          JSON.stringify({ notes, source: 'FIELD_MOBILE' }), latitude, longitude,
        );
        return rows[0];
      });
      await audit(prisma, auth, null, 'MOBILE_TRANSPORT_STATUS', 'NMT_TRIP', req.params.tripId, { from: current, to: nextStatus, latitude, longitude });
      res.json({ data: updated });
    } catch (error) { next(error); }
  });
};
