import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  legalEntityId?: string;
};
type Dependencies = { authOf: (response: express.Response) => AuthContext };
type HomeRow = {
  id: string;
  legalEntityId: string;
  name: string;
  address: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  companyName: string | null;
  companyCode: string | null;
};

const CLINICAL_ROLES = new Set<string>([
  'ADMINISTRATOR', 'PROGRAM_MANAGER', 'AUDITOR', 'DSP', 'DELEGATING_NURSE', 'LPN', 'RN',
  'HOUSE_MANAGER', 'CEO', 'DOO', 'COO',
]);
const ADMIN_ROLES = new Set<string>(['ADMINISTRATOR', 'PROGRAM_MANAGER', 'CEO', 'DOO', 'COO']);
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const roleOf = (auth: AuthContext) => String(auth.role || '');
const isAdmin = (auth: AuthContext) => ADMIN_ROLES.has(roleOf(auth))
  || String(auth.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';
const seesAllHomes = (auth: AuthContext) => isAdmin(auth) || roleOf(auth) === 'AUDITOR';
const ensureClinical = (auth: AuthContext) => {
  if (!CLINICAL_ROLES.has(roleOf(auth))) throw httpError(403, 'SPIRE clinical access is required');
};
const ensureAdmin = (auth: AuthContext) => {
  if (!isAdmin(auth)) throw httpError(403, 'SPIRE administrator access is required');
};
const requestHomeId = (req: express.Request) => String(req.get('x-spire-home-id') || '').trim();
const uniqueHomeIds = (value: unknown, maximum: number) => {
  if (!Array.isArray(value)) throw httpError(400, 'homeIds must be an array');
  const result = Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
  if (result.length > maximum) throw httpError(400, `No more than ${maximum} homes may be supplied`);
  return result;
};

async function homeById(prisma: PrismaClient, organizationId: string, homeId: string): Promise<HomeRow | null> {
  const rows = await prisma.$queryRawUnsafe<HomeRow[]>(
    `SELECT h."id",h."legalEntityId",h."name",h."address",h."streetAddress",h."city",h."state",h."zipCode",
            entity."displayName" AS "companyName",entity."code" AS "companyCode"
       FROM "TimeAttendanceLocation" h
       LEFT JOIN "LegalEntity" entity
         ON entity."organizationId"=h."organizationId" AND entity."id"=h."legalEntityId"
      WHERE h."organizationId"=$1 AND h."id"=$2 AND h."active"=true
      LIMIT 1`,
    organizationId,
    homeId,
  );
  return rows[0] || null;
}

async function homeAllowed(prisma: PrismaClient, auth: AuthContext, homeId: string): Promise<HomeRow | null> {
  const home = await homeById(prisma, auth.organizationId, homeId);
  if (!home) return null;
  if (seesAllHomes(auth)) return home;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1
         FROM "SpireEmployeeHomeAssignment" assignment
        WHERE assignment."organizationId"=$1
          AND assignment."userId"=$2
          AND assignment."homeId"=$3
     ) AS allowed`,
    auth.organizationId,
    auth.userId,
    homeId,
  );
  return rows[0]?.allowed === true ? home : null;
}

async function patientInHome(
  prisma: PrismaClient,
  organizationId: string,
  patientId: string,
  homeId: string,
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1
         FROM "SpirePatientHomeAssignment" assignment
        WHERE assignment."organizationId"=$1
          AND assignment."patientId"=$2
          AND assignment."homeId"=$3
          AND (assignment."startsAt" IS NULL OR assignment."startsAt"<=now())
          AND (assignment."endsAt" IS NULL OR assignment."endsAt">now())
     ) AS allowed`,
    organizationId,
    patientId,
    homeId,
  );
  return rows[0]?.allowed === true;
}

async function actorEmail(prisma: PrismaClient, auth: AuthContext): Promise<string | null> {
  if (auth.email) return auth.email;
  const rows = await prisma.$queryRawUnsafe<Array<{ email: string | null }>>(
    `SELECT "email" FROM "User" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    auth.organizationId,
    auth.userId,
  );
  return rows[0]?.email || null;
}

async function logHomeEvent(
  prisma: PrismaClient,
  auth: AuthContext,
  action: string,
  home: HomeRow | null,
  subjectUserId: string | null,
  metadata: Record<string, unknown>,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireServiceHomeAccessEvent"
       ("id","organizationId","legalEntityId","homeId","actorUserId","actorEmail","subjectUserId","action","ipAddress","userAgent","metadata","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now())`,
    randomUUID(),
    auth.organizationId,
    home?.legalEntityId || null,
    home?.id || null,
    auth.userId,
    await actorEmail(prisma, auth),
    subjectUserId,
    action,
    auth.ipAddress || null,
    auth.userAgent || null,
    JSON.stringify(metadata),
  );
}

async function listHomes(prisma: PrismaClient, auth: AuthContext) {
  const accessSql = seesAllHomes(auth)
    ? ''
    : `AND EXISTS (
         SELECT 1 FROM "SpireEmployeeHomeAssignment" access
          WHERE access."organizationId"=home."organizationId"
            AND access."userId"=$2
            AND access."homeId"=home."id"
       )`;
  const parameters: unknown[] = [auth.organizationId, auth.userId];
  return prisma.$queryRawUnsafe<any[]>(
    `SELECT home."id",home."legalEntityId",home."name",home."address",home."streetAddress",home."city",home."state",home."zipCode",
            entity."displayName" AS "companyName",entity."code" AS "companyCode",
            EXISTS(
              SELECT 1 FROM "SpireUserHomeFavorite" favorite
               WHERE favorite."organizationId"=home."organizationId"
                 AND favorite."userId"=$2
                 AND favorite."homeId"=home."id"
            ) AS favorite,
            (SELECT count(DISTINCT patient_home."patientId")::int
               FROM "SpirePatientHomeAssignment" patient_home
              WHERE patient_home."organizationId"=home."organizationId"
                AND patient_home."homeId"=home."id"
                AND (patient_home."startsAt" IS NULL OR patient_home."startsAt"<=now())
                AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">now())) AS "clientCount"
       FROM "TimeAttendanceLocation" home
       LEFT JOIN "LegalEntity" entity
         ON entity."organizationId"=home."organizationId" AND entity."id"=home."legalEntityId"
      WHERE home."organizationId"=$1 AND home."active"=true ${accessSql}
      ORDER BY favorite DESC,lower(home."name"),lower(COALESCE(entity."displayName",''))`,
    ...parameters,
  );
}

async function listPatientsForHome(prisma: PrismaClient, organizationId: string, homeId: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT patient."id",patient."id" AS "patientId",patient."medicalRecordNumber",patient."firstName",patient."lastName",
            patient."preferredName",patient."dateOfBirth",home."name" AS "homeName",home."id" AS "homeId",
            home."legalEntityId",entity."displayName" AS "companyName",entity."code" AS "companyCode",
            (SELECT enrollment."programId"
               FROM "SpirePatientProgramEnrollment" enrollment
              WHERE enrollment."organizationId"=patient."organizationId"
                AND enrollment."patientId"=patient."id"
                AND enrollment."status"='ACTIVE'
              ORDER BY enrollment."startsAt" DESC LIMIT 1) AS "programName",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object('label',flag."label",'severity',flag."severity"))
                FROM "SpirePatientFlag" flag
               WHERE flag."organizationId"=patient."organizationId"
                 AND flag."patientId"=patient."id"
                 AND flag."active"=true
            ),'[]'::jsonb) AS flags
       FROM "SpirePatientHomeAssignment" assignment
       JOIN "SpirePatient" patient
         ON patient."organizationId"=assignment."organizationId" AND patient."id"=assignment."patientId" AND patient."active"=true
       JOIN "TimeAttendanceLocation" home
         ON home."organizationId"=assignment."organizationId" AND home."id"=assignment."homeId" AND home."active"=true
       LEFT JOIN "LegalEntity" entity
         ON entity."organizationId"=home."organizationId" AND entity."id"=home."legalEntityId"
      WHERE assignment."organizationId"=$1
        AND assignment."homeId"=$2
        AND (assignment."startsAt" IS NULL OR assignment."startsAt"<=now())
        AND (assignment."endsAt" IS NULL OR assignment."endsAt">now())
      ORDER BY lower(patient."lastName"),lower(patient."firstName")`,
    organizationId,
    homeId,
  );
  return rows.map((row) => ({
    ...row,
    name: [row.preferredName || row.firstName, row.lastName].filter(Boolean).join(' '),
    allergies: Array.isArray(row.allergies) ? row.allergies : [],
    diagnoses: Array.isArray(row.diagnoses) ? row.diagnoses : [],
  }));
}

async function listScheduleForHome(prisma: PrismaClient, organizationId: string, homeId: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT appointment."id",appointment."patientId",appointment."startsAt",appointment."endsAt",appointment."status",
            appointment."appointmentType",appointment."locationId",appointment."providerUserId",
            patient."firstName",patient."preferredName",patient."lastName"
       FROM "SpireAppointment" appointment
       JOIN "SpirePatient" patient
         ON patient."id"=appointment."patientId" AND patient."organizationId"=appointment."organizationId"
       JOIN "SpirePatientHomeAssignment" patient_home
         ON patient_home."organizationId"=appointment."organizationId" AND patient_home."patientId"=appointment."patientId"
      WHERE appointment."organizationId"=$1
        AND patient_home."homeId"=$2
        AND (patient_home."startsAt" IS NULL OR patient_home."startsAt"<=now())
        AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">now())
        AND appointment."startsAt">=date_trunc('day',now())
        AND appointment."startsAt"<date_trunc('day',now())+interval '1 day'
      ORDER BY appointment."startsAt"`,
    organizationId,
    homeId,
  );
  return rows.map((row) => ({
    id: row.id,
    patientId: row.patientId,
    patientName: [row.preferredName || row.firstName, row.lastName].filter(Boolean).join(' '),
    time: new Date(String(row.startsAt)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    status: row.status,
    type: row.appointmentType,
    provider: row.providerUserId,
    location: row.locationId,
  }));
}

async function listInBasketForHome(prisma: PrismaClient, auth: AuthContext, homeId: string) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT item.*,patient."firstName",patient."preferredName",patient."lastName"
       FROM "SpireInBasketItem" item
       LEFT JOIN "SpirePatient" patient
         ON patient."id"=item."patientId" AND patient."organizationId"=item."organizationId"
      WHERE item."organizationId"=$1
        AND item."assignedToUserId"=$2
        AND item."status"<>'DONE'
        AND (
          item."patientId" IS NULL OR EXISTS (
            SELECT 1 FROM "SpirePatientHomeAssignment" patient_home
             WHERE patient_home."organizationId"=item."organizationId"
               AND patient_home."patientId"=item."patientId"
               AND patient_home."homeId"=$3
               AND (patient_home."startsAt" IS NULL OR patient_home."startsAt"<=now())
               AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">now())
          )
        )
      ORDER BY CASE item."priority" WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,item."createdAt" DESC
      LIMIT 250`,
    auth.organizationId,
    auth.userId,
    homeId,
  );
  return rows.map((row) => ({
    ...row,
    patientName: [row.preferredName || row.firstName, row.lastName].filter(Boolean).join(' '),
  }));
}

export function registerSpireNetworkHomeAccessRoutes(
  app: express.Express,
  prisma: PrismaClient,
  deps: Dependencies,
) {
  const { authOf } = deps;

  // A selected service home becomes SPIRE's server-side clinical scope and provenance.
  // This middleware is registered before the legacy SPIRE route modules.
  app.use('/api/spire', async (req, res, next) => {
    try {
      const homeId = requestHomeId(req);
      if (!homeId) { next(); return; }
      const auth = authOf(res);
      ensureClinical(auth);
      const home = await homeAllowed(prisma, auth, homeId);
      if (!home) throw httpError(403, 'This service home is outside your assigned SPIRE access');
      const match = req.originalUrl.match(/\/api\/spire\/patients\/([^/?#]+)/i);
      if (match && !seesAllHomes(auth)) {
        const patientId = decodeURIComponent(match[1]);
        if (!(await patientInHome(prisma, auth.organizationId, patientId, homeId))) {
          throw httpError(403, 'This client is not assigned to the selected service home');
        }
      }
      res.locals.auth.legalEntityId = home.legalEntityId;
      res.locals.spireHome = home;
      next();
    } catch (error) { next(error); }
  });

  app.get('/api/spire/network/service-homes', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const homes = await listHomes(prisma, auth);
      res.json({ data: { homes, maximumFavorites: 5, administratorAccess: seesAllHomes(auth) } });
    } catch (error) { next(error); }
  });

  app.put('/api/spire/network/favorites', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const homeIds = uniqueHomeIds(req.body?.homeIds, 5);
      for (const homeId of homeIds) {
        if (!(await homeAllowed(prisma, auth, homeId))) {
          throw httpError(403, 'A favorite must be one of your accessible service homes');
        }
      }
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM "SpireUserHomeFavorite" WHERE "organizationId"=$1 AND "userId"=$2`,
          auth.organizationId,
          auth.userId,
        );
        for (const homeId of homeIds) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireUserHomeFavorite"("id","organizationId","userId","homeId","createdAt")
             VALUES($1,$2,$3,$4,now())`,
            randomUUID(), auth.organizationId, auth.userId, homeId,
          );
        }
      });
      res.json({ data: { homeIds, maximumFavorites: 5 } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/network/service-homes/:homeId/access', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const home = await homeAllowed(prisma, auth, req.params.homeId);
      if (!home) throw httpError(403, 'This service home is outside your assigned SPIRE access');
      const patients = await listPatientsForHome(prisma, auth.organizationId, home.id);
      await logHomeEvent(prisma, auth, 'SERVICE_HOME_ACCESSED', home, null, { clientCount: patients.length });
      res.json({ data: { home, patients } });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/network/service-homes/:homeId/patients', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const home = await homeAllowed(prisma, auth, req.params.homeId);
      if (!home) throw httpError(403, 'This service home is outside your assigned SPIRE access');
      res.json({ data: await listPatientsForHome(prisma, auth.organizationId, home.id) });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/network/service-homes/:homeId/schedule', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const home = await homeAllowed(prisma, auth, req.params.homeId);
      if (!home) throw httpError(403, 'This service home is outside your assigned SPIRE access');
      res.json({ data: await listScheduleForHome(prisma, auth.organizationId, home.id) });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/network/service-homes/:homeId/inbasket', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const home = await homeAllowed(prisma, auth, req.params.homeId);
      if (!home) throw httpError(403, 'This service home is outside your assigned SPIRE access');
      res.json({ data: await listInBasketForHome(prisma, auth, home.id) });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/spire/network-access/employees', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      ensureAdmin(auth);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT user_row."id",user_row."email",user_row."role",
                COALESCE(NULLIF(to_jsonb(user_row)->>'displayName',''),NULLIF(to_jsonb(user_row)->>'fullName',''),user_row."email") AS "displayName"
           FROM "User" user_row
          WHERE user_row."organizationId"=$1
            AND lower(COALESCE(user_row."email",'')) NOT LIKE '%@demo.spire.local'
          ORDER BY lower(COALESCE(user_row."email",''))`,
        auth.organizationId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/spire/network-access/homes', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      ensureAdmin(auth);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT home."id",home."legalEntityId",home."name",home."address",home."streetAddress",home."city",home."state",home."zipCode",
                entity."displayName" AS "companyName",entity."code" AS "companyCode",
                (SELECT count(DISTINCT access."userId")::int FROM "SpireEmployeeHomeAssignment" access
                  WHERE access."organizationId"=home."organizationId" AND access."homeId"=home."id") AS "employeeAccessCount",
                (SELECT count(DISTINCT patient_home."patientId")::int FROM "SpirePatientHomeAssignment" patient_home
                  WHERE patient_home."organizationId"=home."organizationId" AND patient_home."homeId"=home."id"
                    AND (patient_home."startsAt" IS NULL OR patient_home."startsAt"<=now())
                    AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">now())) AS "clientCount"
           FROM "TimeAttendanceLocation" home
           LEFT JOIN "LegalEntity" entity
             ON entity."organizationId"=home."organizationId" AND entity."id"=home."legalEntityId"
          WHERE home."organizationId"=$1 AND home."active"=true
          ORDER BY lower(COALESCE(entity."displayName",'')),lower(home."name")`,
        auth.organizationId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/spire/network-access/assignments/:employeeId', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureAdmin(auth);
      const rows = await prisma.$queryRawUnsafe<Array<{ homeId: string; legalEntityId: string | null }>>(
        `SELECT "homeId","legalEntityId"
           FROM "SpireEmployeeHomeAssignment"
          WHERE "organizationId"=$1 AND "userId"=$2
          ORDER BY "createdAt"`,
        auth.organizationId,
        req.params.employeeId,
      );
      res.json({
        data: {
          employeeId: req.params.employeeId,
          homeIds: Array.from(new Set(rows.map((row) => row.homeId))),
          assignments: rows,
        },
      });
    } catch (error) { next(error); }
  });

  app.put('/api/admin/spire/network-access/assignments', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureAdmin(auth);
      const employeeId = String(req.body?.employeeId || '').trim();
      if (!employeeId) throw httpError(400, 'employeeId is required');
      const employeeRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "User" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
        auth.organizationId,
        employeeId,
      );
      if (!employeeRows[0]) throw httpError(404, 'Employee account was not found');

      const homeIds = uniqueHomeIds(req.body?.homeIds, 500);
      const homes: HomeRow[] = [];
      for (const homeId of homeIds) {
        const home = await homeById(prisma, auth.organizationId, homeId);
        if (!home) throw httpError(400, `Service home ${homeId} is not active in the Sulandra network`);
        homes.push(home);
      }
      const priorRows = await prisma.$queryRawUnsafe<Array<{ homeId: string }>>(
        `SELECT "homeId" FROM "SpireEmployeeHomeAssignment" WHERE "organizationId"=$1 AND "userId"=$2`,
        auth.organizationId,
        employeeId,
      );
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM "SpireEmployeeHomeAssignment" WHERE "organizationId"=$1 AND "userId"=$2`,
          auth.organizationId,
          employeeId,
        );
        for (const home of homes) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireEmployeeHomeAssignment"
               ("id","organizationId","legalEntityId","userId","homeId","assignedByUserId","createdAt")
             VALUES($1,$2,$3,$4,$5,$6,now())`,
            randomUUID(), auth.organizationId, home.legalEntityId, employeeId, home.id, auth.userId,
          );
        }
      });
      await logHomeEvent(prisma, auth, 'HOME_ACCESS_ASSIGNMENTS_REPLACED', null, employeeId, {
        before: Array.from(new Set(priorRows.map((row) => row.homeId))),
        after: homeIds,
      });
      res.json({ data: { employeeId, homeIds } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/spire/network-access/audit', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureAdmin(auth);
      const requested = Number(req.query.limit || 150);
      const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 25), 500) : 150;
      const homeEvents = await prisma.$queryRawUnsafe<any[]>(
        `SELECT event."id",event."action",event."homeId",home."name" AS "homeName",event."actorUserId",event."actorEmail",
                event."subjectUserId",event."metadata",event."ipAddress",event."createdAt",entity."displayName" AS "companyName"
           FROM "SpireServiceHomeAccessEvent" event
           LEFT JOIN "TimeAttendanceLocation" home
             ON home."organizationId"=event."organizationId" AND home."id"=event."homeId"
           LEFT JOIN "LegalEntity" entity
             ON entity."organizationId"=event."organizationId" AND entity."id"=event."legalEntityId"
          WHERE event."organizationId"=$1
          ORDER BY event."createdAt" DESC LIMIT $2`,
        auth.organizationId,
        limit,
      );
      const chartEvents = await prisma.$queryRawUnsafe<any[]>(
        `SELECT event."id",event."action",event."patientId",patient."medicalRecordNumber",
                trim(concat_ws(' ',COALESCE(patient."preferredName",patient."firstName"),patient."lastName")) AS "patientName",
                event."actorUserId",event."actorEmail",event."resourceType",event."resourceId",event."ipAddress",event."createdAt",
                entity."displayName" AS "companyName"
           FROM "SpireChartAccessEvent" event
           LEFT JOIN "SpirePatient" patient
             ON patient."organizationId"=event."organizationId" AND patient."id"=event."patientId"
           LEFT JOIN "LegalEntity" entity
             ON entity."organizationId"=event."organizationId" AND entity."id"=event."legalEntityId"
          WHERE event."organizationId"=$1
          ORDER BY event."createdAt" DESC LIMIT $2`,
        auth.organizationId,
        limit,
      );
      const events = [
        ...homeEvents.map((event) => ({ ...event, auditType: 'SERVICE_HOME' })),
        ...chartEvents.map((event) => ({ ...event, auditType: 'CHART' })),
      ]
        .sort((left, right) => new Date(String(right.createdAt)).getTime() - new Date(String(left.createdAt)).getTime())
        .slice(0, limit);
      res.json({ data: events });
    } catch (error) { next(error); }
  });
}
