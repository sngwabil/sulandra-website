import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import {
  putSecureObject,
  scanBufferForMalware,
} from './secure-object-storage.js';
import {
  encryptPushToken,
  pushTokenHash,
  startSpirePushDispatcher,
} from './spire-push-service.js';

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

type MobileScope =
  | 'mobile:session'
  | 'push:register'
  | 'schedule:read'
  | 'schedule:manage'
  | 'evv:read'
  | 'evv:clock'
  | 'carelog:read'
  | 'carelog:write'
  | 'client:assigned:summary'
  | 'clinical:assigned:read'
  | 'clinical:assigned:write'
  | 'result:manual:write'
  | 'transport:trips:read'
  | 'transport:trips:update'
  | 'admin:field';

const ALL_SCOPES: MobileScope[] = [
  'mobile:session','push:register','schedule:read','schedule:manage','evv:read','evv:clock',
  'carelog:read','carelog:write','client:assigned:summary','clinical:assigned:read',
  'clinical:assigned:write','result:manual:write','transport:trips:read','transport:trips:update','admin:field',
];
const text = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const err = (status: number, message: string) => Object.assign(new Error(message), { status });
const json = (value: unknown) => JSON.stringify(value ?? {});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const elevatedRoles = new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.CEO,UserRole.DOO]);
const nurseRoles = new Set<UserRole>([UserRole.RN,UserRole.LPN,UserRole.DELEGATING_NURSE]);

const roleScopes = (role: UserRole): MobileScope[] => {
  if (elevatedRoles.has(role)) return [...ALL_SCOPES];
  if (role === UserRole.HOUSE_MANAGER) return [
    'mobile:session','push:register','schedule:read','schedule:manage','evv:read','evv:clock',
    'carelog:read','carelog:write','client:assigned:summary','clinical:assigned:read','clinical:assigned:write',
  ];
  if (nurseRoles.has(role)) return [
    'mobile:session','push:register','schedule:read','evv:read','evv:clock','carelog:read','carelog:write',
    'client:assigned:summary','clinical:assigned:read','clinical:assigned:write','result:manual:write',
  ];
  if (role === UserRole.DSP) return [
    'mobile:session','push:register','schedule:read','evv:read','evv:clock','carelog:read','carelog:write',
    'client:assigned:summary','clinical:assigned:read',
  ];
  if (role === UserRole.DRIVER) return [
    'mobile:session','push:register','schedule:read','transport:trips:read','transport:trips:update',
  ];
  if (role === UserRole.SCHEDULER) return ['mobile:session','push:register','schedule:read','schedule:manage','transport:trips:read'];
  if (role === UserRole.BILLING_SPECIALIST) return ['mobile:session','push:register','evv:read'];
  if (role === UserRole.AUDITOR) return ['mobile:session','schedule:read','evv:read','carelog:read','client:assigned:summary','clinical:assigned:read'];
  return ['mobile:session'];
};

const entity = (auth: AuthContext) => {
  const value = text(auth.legalEntityId, 120);
  if (!value) throw err(409, 'Select a Sulandra company before using the field app');
  return value;
};
const scopesOf = (response: express.Response) => Array.isArray(response.locals.mobileScopes)
  ? response.locals.mobileScopes.filter((value: unknown): value is string => typeof value === 'string')
  : [];
const mobileJti = (response: express.Response) => text(response.locals.mobileJti, 500);
const mobileClientId = (response: express.Response) => text(response.locals.mobileClientId, 200);
const mobileEntity = (response: express.Response) => text(response.locals.mobileLegalEntityId, 120);

async function authorizeMobile(
  prisma: PrismaClient,
  response: express.Response,
  auth: AuthContext,
  scope: MobileScope,
) {
  if (response.locals.mobileTokenUse !== 'mobile_oauth') throw err(401, 'A scoped Sulandra mobile token is required');
  const scopes = scopesOf(response);
  if (!scopes.includes(scope) && !scopes.includes('admin:field')) throw err(403, `Mobile permission ${scope} is required`);
  const claimEntity = mobileEntity(response);
  const selectedEntity = entity(auth);
  if (claimEntity && claimEntity !== selectedEntity) throw err(403, 'This mobile token belongs to a different Sulandra company');
  const jti = mobileJti(response);
  if (!jti) throw err(401, 'Mobile token identifier is missing');
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "SpireMobileAccessGrant"
      WHERE "organizationId"=$1 AND "userId"=$2 AND "jtiHash"=$3
        AND "revokedAt" IS NULL AND "expiresAt">NOW() LIMIT 1`,
    auth.organizationId,
    auth.userId,
    hash(jti),
  );
  if (!rows[0]) throw err(401, 'This mobile session is expired or revoked');
  await prisma.$executeRawUnsafe(
    `UPDATE "SpireMobileAccessGrant" SET "lastUsedAt"=NOW() WHERE "id"=$1`,
    rows[0].id,
  );
  return scopes;
}

const elevated = (auth: AuthContext) => elevatedRoles.has(auth.role)
  || auth.enterpriseOwner === true
  || String(auth.email || '').toLowerCase() === 'admin@sulandrahealth.com';

async function patientAllowed(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  const legalEntityId = entity(auth);
  const enrolled = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "ClientEnrollment"
        WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clientId"=$3
          AND "status" IN ('PENDING','ACTIVE','PAUSED')
     ) AS allowed`,
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
       UNION ALL
       SELECT 1 FROM "UserEntityAccessGrant" g
       WHERE g."organizationId"=$1 AND g."legalEntityId"=$2 AND g."userId"=$3
         AND g."scopeType"='CLIENT' AND g."clientId"=$4 AND g."active"=TRUE
         AND g."effectiveFrom"<=NOW() AND (g."effectiveTo" IS NULL OR g."effectiveTo">NOW())
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
  afterValue: unknown,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"(
      "id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent"
    ) VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
    auth.organizationId, auth.legalEntityId ?? null, auth.userId, auth.email ?? null, patientId,
    action, resourceType, resourceId, json(afterValue), auth.ipAddress ?? null, auth.userAgent ?? null,
  );
}

async function ownEvvVisit(prisma: PrismaClient, auth: AuthContext, visitId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT v.* FROM "SpireEvvVisit" v
      WHERE v."organizationId"=$1 AND v."id"=$2
        AND (v."legalEntityId"=$3 OR v."legalEntityId" IS NULL)
        AND ($4::boolean=TRUE OR v."employeeUserId"=$5)
      LIMIT 1`,
    auth.organizationId, visitId, entity(auth), elevated(auth), auth.userId,
  );
  const visit = rows[0];
  if (!visit) throw err(404, 'Assigned EVV visit was not found');
  if (!(await patientAllowed(prisma, auth, String(visit.patientId)))) throw err(403, 'This visit is outside your authorized client scope');
  return visit;
}

export const registerSpireFieldMobileRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  deps: Deps,
) => {
  const { authOf } = deps;
  startSpirePushDispatcher(prisma);

  app.post('/api/mobile/oauth/exchange', async (req, res, next) => {
    try {
      if (res.locals.mobileTokenUse === 'mobile_oauth') throw err(409, 'Use the existing mobile token or sign in again; mobile tokens cannot mint additional tokens');
      const auth = authOf(res);
      const legalEntityId = entity(auth);
      const secret = text(process.env.JWT_SECRET, 4096);
      if (!secret) throw err(503, 'Mobile sign-in is not configured');
      const clientId = text(req.body?.clientId, 160) || 'sulandra-field-mobile';
      const platform = text(req.body?.platform, 20).toUpperCase();
      if (!['IOS','ANDROID'].includes(platform)) throw err(400, 'platform must be IOS or ANDROID');
      const bundleId = text(req.body?.bundleId, 250) || (platform === 'IOS' ? 'com.sulandrahealth.field' : 'com.sulandrahealth.field');
      const available = roleScopes(auth.role);
      const requested = Array.isArray(req.body?.scopes)
        ? req.body.scopes.filter((value: unknown): value is string => typeof value === 'string')
        : available;
      const scopes = requested.filter((scope) => available.includes(scope as MobileScope)) as MobileScope[];
      if (!scopes.includes('mobile:session')) scopes.unshift('mobile:session');

      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireMobileOAuthClient"(
          "organizationId","legalEntityId","clientId","name","platform","bundleId","allowedScopes","createdById"
        ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
        ON CONFLICT("organizationId","clientId") DO UPDATE SET
          "legalEntityId"=EXCLUDED."legalEntityId","platform"=EXCLUDED."platform","bundleId"=EXCLUDED."bundleId",
          "allowedScopes"=EXCLUDED."allowedScopes","active"=TRUE,"updatedAt"=NOW()`,
        auth.organizationId, legalEntityId, clientId, 'Sulandra Health Field App', platform, bundleId, json(ALL_SCOPES), auth.userId,
      );

      const jti = randomUUID();
      const expiresSeconds = 8 * 60 * 60;
      const token = jwt.sign(
        {
          organizationId: auth.organizationId,
          role: auth.role,
          email: auth.email,
          tokenUse: 'mobile_oauth',
          scopes,
          legalEntityId,
          clientId,
          jti,
        },
        secret,
        { algorithm: 'HS256', subject: auth.userId, expiresIn: expiresSeconds },
      );
      const expiresAt = new Date(Date.now() + expiresSeconds * 1000).toISOString();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireMobileAccessGrant"(
          "organizationId","legalEntityId","clientId","userId","role","scopes","jtiHash","deviceId","expiresAt"
        ) VALUES($1,$2,$3,$4,$5,$6::text[],$7,$8,$9::timestamptz)`,
        auth.organizationId, legalEntityId, clientId, auth.userId, String(auth.role), scopes,
        hash(jti), text(req.body?.deviceId, 250) || null, expiresAt,
      );
      await audit(prisma, auth, null, 'ISSUE_MOBILE_TOKEN', 'MOBILE_ACCESS_GRANT', hash(jti), { clientId, scopes, platform, expiresAt });
      res.json({ data: { accessToken: token, tokenType: 'Bearer', expiresIn: expiresSeconds, expiresAt, scopes, legalEntityId } });
    } catch (error) { next(error); }
  });

  app.get('/api/mobile/session', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const scopes = await authorizeMobile(prisma, res, auth, 'mobile:session');
      res.json({ data: { userId: auth.userId, role: auth.role, legalEntityId: entity(auth), scopes, clientId: mobileClientId(res) } });
    } catch (error) { next(error); }
  });

  app.post('/api/mobile/oauth/revoke', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'mobile:session');
      const jti = mobileJti(res);
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireMobileAccessGrant" SET "revokedAt"=NOW() WHERE "organizationId"=$1 AND "userId"=$2 AND "jtiHash"=$3 AND "revokedAt" IS NULL`,
        auth.organizationId, auth.userId, hash(jti),
      );
      res.json({ data: { revoked: true } });
    } catch (error) { next(error); }
  });

  app.post('/api/mobile/push/register', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'push:register');
      const token = text(req.body?.token, 8192);
      const platform = text(req.body?.platform, 20).toUpperCase();
      const provider = text(req.body?.provider, 20).toUpperCase();
      if (!token || !['IOS','ANDROID'].includes(platform)) throw err(400, 'A native push token and IOS/ANDROID platform are required');
      if ((platform === 'IOS' && provider !== 'APNS') || (platform === 'ANDROID' && provider !== 'FCM')) {
        throw err(400, 'iOS devices must register APNS tokens and Android devices must register FCM tokens');
      }
      const tokenHash = pushTokenHash(token);
      const ciphertext = encryptPushToken(token);
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO "SpirePushDevice"(
          "organizationId","legalEntityId","userId","platform","provider","tokenHash","tokenCiphertext","appBundleId","environment","deviceLabel"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT("organizationId","userId","provider","tokenHash") DO UPDATE SET
          "legalEntityId"=EXCLUDED."legalEntityId","tokenCiphertext"=EXCLUDED."tokenCiphertext",
          "appBundleId"=EXCLUDED."appBundleId","environment"=EXCLUDED."environment","deviceLabel"=EXCLUDED."deviceLabel",
          "status"='ACTIVE',"lastSeenAt"=NOW(),"updatedAt"=NOW()
        RETURNING "id"`,
        auth.organizationId, entity(auth), auth.userId, platform, provider, tokenHash, ciphertext,
        text(req.body?.appBundleId, 250) || null,
        text(req.body?.environment, 40).toUpperCase() === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION',
        text(req.body?.deviceLabel, 200) || null,
      );
      await audit(prisma, auth, null, 'REGISTER_PUSH_DEVICE', 'PUSH_DEVICE', rows[0].id, { platform, provider, tokenHash });
      res.status(201).json({ data: { id: rows[0].id, platform, provider } });
    } catch (error) { next(error); }
  });

  app.delete('/api/mobile/push/devices/:deviceId', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'push:register');
      await prisma.$executeRawUnsafe(
        `UPDATE "SpirePushDevice" SET "status"='INACTIVE',"updatedAt"=NOW()
          WHERE "organizationId"=$1 AND "userId"=$2 AND "id"=$3`,
        auth.organizationId, auth.userId, req.params.deviceId,
      );
      res.json({ data: { removed: true } });
    } catch (error) { next(error); }
  });

  app.post('/api/mobile/push/test', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'push:register');
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpirePushDelivery"(
          "organizationId","legalEntityId","userId","deviceId","category","title","body","deepLink","priority"
        ) SELECT $1,$2,$3,d."id",'TEST','Sulandra Health','Push notifications are connected.','sulandra://home','NORMAL'
          FROM "SpirePushDevice" d WHERE d."organizationId"=$1 AND d."userId"=$3 AND d."status"='ACTIVE'`,
        auth.organizationId, entity(auth), auth.userId,
      );
      res.status(202).json({ data: { queued: true } });
    } catch (error) { next(error); }
  });

  app.get('/api/mobile/notifications', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'mobile:session');
      const rows = await prisma.$queryRawUnsafe(
        `SELECT "id","category","title","body","deepLink","priority","status","createdAt","sentAt"
           FROM "SpirePushDelivery"
          WHERE "organizationId"=$1 AND "userId"=$2 AND ("legalEntityId"=$3 OR "legalEntityId" IS NULL)
          ORDER BY "createdAt" DESC LIMIT 100`,
        auth.organizationId, auth.userId, entity(auth),
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/mobile/work/today', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const scopes = await authorizeMobile(prisma, res, auth, 'schedule:read');
      const date = text(req.query.date, 10) || new Date().toISOString().slice(0, 10);
      const legalEntityId = entity(auth);
      const appointments = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT a."id",a."patientId",a."startsAt",a."endsAt",a."status",a."appointmentType",a."reason",
                p."preferredName",p."firstName",p."lastName"
           FROM "SpireAppointment" a JOIN "SpirePatient" p ON p."id"=a."patientId" AND p."organizationId"=a."organizationId"
          WHERE a."organizationId"=$1 AND (a."legalEntityId"=$2 OR a."legalEntityId" IS NULL)
            AND a."startsAt">=$3::date AND a."startsAt"<$3::date+INTERVAL '1 day'
            AND (a."providerUserId"=$4 OR $5::boolean=TRUE)
          ORDER BY a."startsAt"`,
        auth.organizationId, legalEntityId, date, auth.userId, scopes.includes('admin:field'),
      );
      const evvVisits = scopes.includes('evv:read') || scopes.includes('admin:field')
        ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT v."id",v."patientId",v."serviceCode",v."scheduledStart",v."scheduledEnd",v."clockInAt",v."clockOutAt",v."status",v."units",
                  p."preferredName",p."firstName",p."lastName"
             FROM "SpireEvvVisit" v JOIN "SpirePatient" p ON p."id"=v."patientId" AND p."organizationId"=v."organizationId"
            WHERE v."organizationId"=$1 AND (v."legalEntityId"=$2 OR v."legalEntityId" IS NULL)
              AND COALESCE(v."scheduledStart",v."clockInAt",v."createdAt")::date=$3::date
              AND (v."employeeUserId"=$4 OR $5::boolean=TRUE)
            ORDER BY COALESCE(v."scheduledStart",v."clockInAt",v."createdAt")`,
          auth.organizationId, legalEntityId, date, auth.userId, scopes.includes('admin:field'),
        ) : [];
      const trips = scopes.includes('transport:trips:read') || scopes.includes('admin:field')
        ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT t."id",t."tripNumber",t."status",t."scheduledPickupAt",t."scheduledArrivalAt",
                  o."riderFirstName",o."riderLastName",o."pickupName",o."pickupStreet",o."pickupCity",o."pickupState",o."pickupPostalCode",
                  o."dropoffName",o."dropoffStreet",o."dropoffCity",o."dropoffState",o."dropoffPostalCode",o."serviceLevel",v."vehicleNumber"
             FROM "NmtTrip" t JOIN "NmtDriverProfile" d ON d."id"=t."driverId"
             JOIN "NmtTransportOrder" o ON o."id"=t."orderId"
             LEFT JOIN "NmtVehicle" v ON v."id"=t."vehicleId"
            WHERE t."organizationId"=$1 AND t."legalEntityId"=$2 AND t."scheduledPickupAt"::date=$3::date
              AND (d."userId"=$4 OR $5::boolean=TRUE)
            ORDER BY t."scheduledPickupAt"`,
          auth.organizationId, legalEntityId, date, auth.userId, scopes.includes('admin:field'),
        ).catch(() => []) : [];
      res.json({ data: { date, appointments, evvVisits, trips } });
    } catch (error) { next(error); }
  });

  app.get('/api/mobile/my-shift', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'client:assigned:summary');
      const legalEntityId = entity(auth);
      const patients = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT p."id",p."medicalRecordNumber",p."firstName",p."preferredName",p."lastName",p."dateOfBirth",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('label',f."label",'severity',f."severity",'details',f."details") ORDER BY f."createdAt" DESC)
                    FROM "SpirePatientFlag" f WHERE f."organizationId"=p."organizationId" AND f."patientId"=p."id" AND f."active"=TRUE),'[]'::jsonb) AS flags,
          (SELECT jsonb_build_object('temperature',v."temperature",'pulse',v."pulse",'respirations',v."respirations",'systolic',v."systolic",'diastolic',v."diastolic",'spo2',v."spo2",'weight',v."weight",'recordedAt',v."recordedAt")
             FROM "SpireVitalSign" v WHERE v."organizationId"=p."organizationId" AND v."patientId"=p."id" ORDER BY v."recordedAt" DESC LIMIT 1) AS "latestVitals",
          (SELECT COUNT(*)::int FROM "SpireMedicationOrder" m WHERE m."organizationId"=p."organizationId" AND m."patientId"=p."id" AND m."status"='ACTIVE') AS "activeMedicationCount"
         FROM "SpirePatient" p JOIN "ClientEnrollment" ce ON ce."organizationId"=p."organizationId" AND ce."clientId"=p."id"
        WHERE p."organizationId"=$1 AND ce."legalEntityId"=$2 AND ce."status" IN ('PENDING','ACTIVE','PAUSED') AND p."active"=TRUE
          AND ($3::boolean=TRUE OR EXISTS(
            SELECT 1 FROM "SpireEmployeeClientAssignment" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."userId"=$4 AND x."clientId"=p."id"
            UNION ALL SELECT 1 FROM "SpirePatientHomeAssignment" pa JOIN "SpireEmployeeHomeAssignment" ha
              ON ha."organizationId"=pa."organizationId" AND ha."legalEntityId"=pa."legalEntityId" AND ha."homeId"=pa."homeId"
              WHERE pa."organizationId"=$1 AND pa."legalEntityId"=$2 AND ha."userId"=$4 AND pa."patientId"=p."id" AND (pa."endsAt" IS NULL OR pa."endsAt">NOW())
          )) ORDER BY p."lastName",p."firstName"`,
        auth.organizationId, legalEntityId, elevated(auth), auth.userId,
      );
      res.json({ data: { legalEntityId, patients } });
    } catch (error) { next(error); }
  });

  app.get('/api/mobile/clients/:patientId/summary', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'client:assigned:summary');
      const patientId = req.params.patientId;
      if (!(await patientAllowed(prisma, auth, patientId))) throw err(403, 'This client is outside your assigned field scope');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT p."id",p."medicalRecordNumber",p."firstName",p."preferredName",p."lastName",p."dateOfBirth",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('substance',a."substance",'reaction',a."reaction",'severity',a."severity")) FROM "SpirePatientAllergy" a WHERE a."organizationId"=p."organizationId" AND a."patientId"=p."id" AND a."status"='ACTIVE'),'[]'::jsonb) allergies,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('label',f."label",'severity',f."severity",'details',f."details")) FROM "SpirePatientFlag" f WHERE f."organizationId"=p."organizationId" AND f."patientId"=p."id" AND f."active"=TRUE),'[]'::jsonb) flags,
          (SELECT COUNT(*)::int FROM "SpireMedicationOrder" m WHERE m."organizationId"=p."organizationId" AND m."patientId"=p."id" AND m."status"='ACTIVE') AS "activeMedicationCount"
         FROM "SpirePatient" p WHERE p."organizationId"=$1 AND p."id"=$2 LIMIT 1`,
        auth.organizationId, patientId,
      );
      if (!rows[0]) throw err(404, 'Client was not found');
      await audit(prisma, auth, patientId, 'MOBILE_VIEW_CLIENT_SUMMARY', 'PATIENT', patientId, { source: 'FIELD_APP' });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/mobile/evv/:visitId/clock-in', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'evv:clock');
      const visit = await ownEvvVisit(prisma, auth, req.params.visitId);
      if (visit.clockInAt) throw err(409, 'This visit is already clocked in');
      const latitude = req.body?.latitude === undefined ? null : Number(req.body.latitude);
      const longitude = req.body?.longitude === undefined ? null : Number(req.body.longitude);
      if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw err(400, 'Invalid latitude');
      if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw err(400, 'Invalid longitude');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireEvvVisit" SET "legalEntityId"=$1,"clockInAt"=NOW(),"clockInLatitude"=$2,"clockInLongitude"=$3,
          "verificationMethod"='MOBILE_GPS',"updatedAt"=NOW()
          WHERE "organizationId"=$4 AND "id"=$5 RETURNING *`,
        entity(auth), latitude, longitude, auth.organizationId, req.params.visitId,
      );
      await audit(prisma, auth, String(visit.patientId), 'MOBILE_EVV_CLOCK_IN', 'EVV_VISIT', req.params.visitId, { latitude, longitude });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/mobile/evv/:visitId/clock-out', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'evv:clock');
      const visit = await ownEvvVisit(prisma, auth, req.params.visitId);
      if (!visit.clockInAt) throw err(409, 'Clock in before clocking out');
      if (visit.clockOutAt) throw err(409, 'This visit is already clocked out');
      const latitude = req.body?.latitude === undefined ? null : Number(req.body.latitude);
      const longitude = req.body?.longitude === undefined ? null : Number(req.body.longitude);
      if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw err(400, 'Invalid latitude');
      if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw err(400, 'Invalid longitude');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireEvvVisit" SET "legalEntityId"=$1,"clockOutAt"=NOW(),"clockOutLatitude"=$2,"clockOutLongitude"=$3,"updatedAt"=NOW()
          WHERE "organizationId"=$4 AND "id"=$5 RETURNING *`,
        entity(auth), latitude, longitude, auth.organizationId, req.params.visitId,
      );
      await audit(prisma, auth, String(visit.patientId), 'MOBILE_EVV_CLOCK_OUT', 'EVV_VISIT', req.params.visitId, { latitude, longitude });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/mobile/evv/:visitId/complete', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'evv:clock');
      const visit = await ownEvvVisit(prisma, auth, req.params.visitId);
      const patientId = String(visit.patientId);
      const units = Number(req.body?.units || 0);
      if (!Number.isFinite(units) || units <= 0) throw err(400, 'Delivered units must be greater than zero');
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireEvvVisit" WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE`,
          auth.organizationId, req.params.visitId,
        );
        const row = current[0];
        if (!row) throw err(404, 'EVV visit was not found');
        if (String(row.status) === 'VERIFIED') throw err(409, 'This EVV visit is already verified');
        const authorizationId = text(row.authorizationId, 120);
        if (authorizationId) {
          const remaining = await tx.$queryRawUnsafe<Array<{ remaining: number }>>(
            `SELECT ("authorizedUnits"-"deliveredUnits")::float8 AS remaining FROM "SpireServiceAuthorization"
              WHERE "organizationId"=$1 AND "id"=$2 FOR UPDATE`,
            auth.organizationId, authorizationId,
          );
          if (!remaining[0] || units > Number(remaining[0].remaining)) throw err(409, 'Delivered units exceed remaining authorization');
        }
        const updated = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `UPDATE "SpireEvvVisit" SET "legalEntityId"=$1,"clockInAt"=COALESCE("clockInAt",NOW()),"clockOutAt"=COALESCE("clockOutAt",NOW()),
            "units"=$2,"status"='VERIFIED',"verifiedAt"=NOW(),"verifiedById"=$3,"updatedAt"=NOW()
            WHERE "organizationId"=$4 AND "id"=$5 RETURNING *`,
          entity(auth), units, auth.userId, auth.organizationId, req.params.visitId,
        );
        if (authorizationId) {
          await tx.$executeRawUnsafe(
            `UPDATE "SpireServiceAuthorization" SET "legalEntityId"=COALESCE("legalEntityId",$1),"deliveredUnits"="deliveredUnits"+$2,"updatedAt"=NOW()
              WHERE "organizationId"=$3 AND "id"=$4`,
            entity(auth), units, auth.organizationId, authorizationId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireAuthorizationLedger"("organizationId","legalEntityId","authorizationId","patientId","evvVisitId","entryType","units","serviceDate","createdById")
              VALUES($1,$2,$3,$4,$5,'DELIVERED',$6,CURRENT_DATE,$7)`,
            auth.organizationId, entity(auth), authorizationId, patientId, req.params.visitId, units, auth.userId,
          );
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireBillingReconciliation"("organizationId","legalEntityId","patientId","authorizationId","evvVisitId","serviceDate","serviceCode","deliveredUnits","billableUnits","status")
            VALUES($1,$2,$3,$4,$5,CURRENT_DATE,$6,$7,$7,'READY')`,
          auth.organizationId, entity(auth), patientId, authorizationId || null, req.params.visitId, String(row.serviceCode), units,
        );
        return updated[0];
      });
      await audit(prisma, auth, patientId, 'MOBILE_EVV_VERIFY', 'EVV_VISIT', req.params.visitId, { units });
      res.json({ data: result });
    } catch (error) { next(error); }
  });

  app.post('/api/mobile/clients/:patientId/results/manual', async (req, res, next) => {
    try {
      const auth = authOf(res);
      await authorizeMobile(prisma, res, auth, 'result:manual:write');
      const patientId = req.params.patientId;
      if (!(await patientAllowed(prisma, auth, patientId))) throw err(403, 'This client is outside your authorized clinical scope');
      const resultType = text(req.body?.resultType, 40).toUpperCase() || 'LAB';
      if (!['LAB','IMAGING','MICROBIOLOGY','PATHOLOGY','OTHER'].includes(resultType)) throw err(400, 'Unsupported manual result type');
      const title = text(req.body?.title, 250);
      if (!title) throw err(400, 'Result title is required');
      let documentId: string | null = null;
      const base64 = text(req.body?.dataBase64, 40_000_000);
      if (base64) {
        const body = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
        if (!body.length || body.length > 25 * 1024 * 1024) throw err(413, 'Result PDF must be between 1 byte and 25 MB');
        const scan = await scanBufferForMalware(body);
        if (scan.status === 'INFECTED') throw err(422, `Upload blocked by malware scanner: ${scan.signature || 'infected file'}`);
        documentId = randomUUID();
        const storageKey = `spire/${auth.organizationId}/${patientId}/${documentId}/v1`;
        const stored = await putSecureObject({
          key: storageKey,
          body,
          contentType: text(req.body?.mimeType, 120) || 'application/pdf',
          metadata: { patient: patientId, document: documentId, category: 'DIAGNOSTIC_RESULT' },
        });
        await prisma.$executeRawUnsafe(
          `INSERT INTO "SpireClinicalDocument"(
            "id","organizationId","patientId","category","title","description","mimeType","storageKey","sha256","sizeBytes",
            "storageBucket","etag","encryption","kmsKeyId","ivBase64","authTagBase64","malwareScanStatus","malwareScanDetail",
            "sensitivity","source","reviewStatus","createdById"
          ) VALUES($1,$2,$3,'DIAGNOSTIC_RESULT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'CLINICAL','MANUAL_RESULT_UPLOAD','PENDING',$18)`,
          documentId, auth.organizationId, patientId, title, text(req.body?.notes, 5000) || null,
          text(req.body?.mimeType, 120) || 'application/pdf', stored.key, stored.sha256, stored.sizeBytes, stored.bucket, stored.etag,
          stored.encryption, stored.kmsKeyId, stored.ivBase64, stored.authTagBase64, scan.status, scan.detail, auth.userId,
        );
        await prisma.$executeRawUnsafe(
          `INSERT INTO "SpireClinicalDocumentVersion"(
            "organizationId","documentId","version","storageKey","sha256","mimeType","sizeBytes","createdById","storageBucket","etag",
            "encryption","kmsKeyId","ivBase64","authTagBase64","malwareScanStatus","malwareScanDetail"
          ) VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          auth.organizationId, documentId, stored.key, stored.sha256, text(req.body?.mimeType, 120) || 'application/pdf', stored.sizeBytes,
          auth.userId, stored.bucket, stored.etag, stored.encryption, stored.kmsKeyId, stored.ivBase64, stored.authTagBase64, scan.status, scan.detail,
        );
      }

      let resourceId = '';
      if (resultType === 'IMAGING') {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO "SpireImagingStudy"("organizationId","patientId","modality","description","status","performedAt","report")
            VALUES($1,$2,$3,$4,'FINAL',$5::timestamptz,$6) RETURNING "id"`,
          auth.organizationId, patientId, text(req.body?.modality, 80) || null, title, req.body?.resultedAt || null, text(req.body?.resultText, 20000) || null,
        );
        resourceId = rows[0].id;
      } else if (resultType === 'MICROBIOLOGY') {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO "SpireMicrobiologyResult"("organizationId","patientId","specimen","testName","organism","result","susceptibilities","resultedAt")
            VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,COALESCE($8::timestamptz,NOW())) RETURNING "id"`,
          auth.organizationId, patientId, text(req.body?.specimen, 250) || null, title, text(req.body?.organism, 250) || null,
          text(req.body?.resultText, 20000) || null, json(req.body?.susceptibilities || {}), req.body?.resultedAt || null,
        );
        resourceId = rows[0].id;
      } else if (resultType === 'PATHOLOGY') {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO "SpirePathologyResult"("organizationId","patientId","specimen","diagnosis","report","resultedAt")
            VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,NOW())) RETURNING "id"`,
          auth.organizationId, patientId, text(req.body?.specimen, 250) || null, title, text(req.body?.resultText, 20000) || null, req.body?.resultedAt || null,
        );
        resourceId = rows[0].id;
      } else {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO "SpireResult"("organizationId","patientId","category","testName","status","resultedAt","source","rawData")
            VALUES($1,$2,$3,$4,'FINAL',COALESCE($5::timestamptz,NOW()),'MANUAL_FIELD_ENTRY',$6::jsonb) RETURNING "id"`,
          auth.organizationId, patientId, resultType === 'LAB' ? 'LAB' : 'OTHER', title, req.body?.resultedAt || null,
          json({ resultText: text(req.body?.resultText, 20000) || null, notes: text(req.body?.notes, 5000) || null, documentId, enteredBy: auth.userId }),
        );
        resourceId = rows[0].id;
        if (Array.isArray(req.body?.components)) {
          for (let index = 0; index < req.body.components.length && index < 100; index += 1) {
            const component = req.body.components[index] as Record<string, unknown>;
            const name = text(component?.name, 250);
            if (!name) continue;
            await prisma.$executeRawUnsafe(
              `INSERT INTO "SpireResultComponent"("organizationId","resultId","name","value","numericValue","unit","referenceRange","abnormalFlag","sortOrder")
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              auth.organizationId, resourceId, name, text(component?.value, 1000) || null,
              component?.numericValue === undefined || component?.numericValue === null ? null : Number(component.numericValue),
              text(component?.unit, 80) || null, text(component?.referenceRange, 200) || null, text(component?.abnormalFlag, 40) || null, index,
            );
          }
        }
      }
      await audit(prisma, auth, patientId, 'MANUAL_DIAGNOSTIC_RESULT', resultType, resourceId, { title, documentId, source: 'MANUAL_FIELD_ENTRY' });
      res.status(201).json({ data: { id: resourceId, resultType, documentId } });
    } catch (error) { next(error); }
  });
};
