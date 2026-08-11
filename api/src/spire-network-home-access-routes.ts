import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: unknown;
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
  address?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  companyName?: string | null;
  companyCode?: string | null;
};

const clinicalRoles = new Set([
  'ADMINISTRATOR', 'PROGRAM_MANAGER', 'AUDITOR', 'DSP', 'DELEGATING_NURSE', 'LPN', 'RN',
  'HOUSE_MANAGER', 'CEO', 'DOO', 'COO',
]);
const adminRoles = new Set(['ADMINISTRATOR', 'PROGRAM_MANAGER', 'CEO', 'DOO', 'COO']);
const allHomeRoles = new Set([...adminRoles, 'AUDITOR']);
const roleOf = (auth: AuthContext) => String(auth.role || '');
const isAdmin = (auth: AuthContext) => adminRoles.has(roleOf(auth)) || String(auth.email || '').toLowerCase() === 'admin@sulandrahealth.com';
const seesAllHomes = (auth: AuthContext) => isAdmin(auth) || allHomeRoles.has(roleOf(auth));
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const ensureClinical = (auth: AuthContext) => {
  if (!clinicalRoles.has(roleOf(auth))) throw httpError(403, 'SPIRE clinical access is required');
};
const ensureAdmin = (auth: AuthContext) => {
  if (!isAdmin(auth)) throw httpError(403, 'SPIRE administrator access is required');
};
const uniqueIds = (value: unknown, max = 500) => {
  if (!Array.isArray(value)) throw httpError(400, 'homeIds must be an array');
  const ids = [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  if (ids.length > max) throw httpError(400, `No more than ${max} homes may be supplied`);
  return ids;
};
const requestHomeId = (req: express.Request) => String(req.get('x-spire-home-id') || '').trim();

async function homeById(prisma: PrismaClient, organizationId: string, homeId: string) {
  const rows = await prisma.$queryRawUnsafe<HomeRow[]>(
    `SELECT h."id",h."legalEntityId",h."name",h."address",h."streetAddress",h."city",h."state",h."zipCode",
            e."displayName" AS "companyName",e."code" AS "companyCode"
       FROM "TimeAttendanceLocation" h
       LEFT JOIN "LegalEntity" e ON e."organizationId"=h."organizationId" AND e."id"=h."legalEntityId"
      WHERE h."organizationId"=$1 AND h."id"=$2 AND h."active"=true
      LIMIT 1`,
    organizationId,
    homeId,
  );
  return rows[0] || null;
}

async function homeAllowed(prisma: PrismaClient, auth: AuthContext, homeId: string) {
  const home = await homeById(prisma, auth.organizationId, homeId);
  if (!home) return null;
  if (seesAllHomes(auth)) return home;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeHomeAssignment" assignment
        WHERE assignment."organizationId"=$1 AND assignment."userId"=$2 AND assignment."homeId"=$3
     ) AS allowed`,
    auth.organizationId,
    auth.userId,
    homeId,
  );
  return rows[0]?.allowed === true ? home : null;
}

async function patientInHome(prisma: PrismaClient, organizationId: string, patientId: string, homeId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpirePatientHomeAssignment" assignment
        WHERE assignment."organizationId"=$1 AND assignment."patientId"=$2 AND assignment."homeId"=$3
          AND (assignment."startsAt" IS NULL OR assignment."startsAt"<=now())
          AND (assignment."endsAt" IS NULL OR assignment."endsAt">now())
     ) AS allowed`,
    organizationId,
    patientId,
    homeId,
  );
  return rows[0]?.allowed === true;
}

async function actorEmail(prisma: PrismaClient, auth: AuthContext) {
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
  home?: HomeRow | null,
  subjectUserId?: string | null,
  metadata: unknown = {},
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
    subjectUserId || null,
    action,
    auth.ipAddress || null,
    auth.userAgent || null,
    JSON.stringify(metadata ?? {}),
  );
}

async function listHomes(prisma: PrismaClient, auth: AuthContext) {
  const accessClause = seesAllHomes(auth)
    ? ''
    : `AND EXISTS (
         SELECT 1 FROM "SpireEmployeeHomeAssignment" access
          WHERE access."organizationId"=h."organizationId" AND access."userId"=$2 AND access."homeId"=h."id"
       )`;
  const args = seesAllHomes(auth) ? [auth.organizationId] : [auth.organizationId, auth.userId];
  return prisma.$queryRawUnsafe<Array<HomeRow & { favorite: boolean; clientCount: number }>>(
    `SELECT h."id",h."legalEntityId",h."name",h."address",h."streetAddress",h."city",h."state",h."zipCode",
            entity."displayName" AS "companyName",entity."code" AS "companyCode",
            EXISTS(
              SELECT 1 FROM "SpireUserHomeFavorite" favorite
               WHERE favorite."organizationId"=h."organizationId" AND favorite."userId"=${seesAllHomes(auth) ? '$2' : '$2'} AND favorite."homeId"=h."id"
            ) AS favorite,
            (SELECT count(DISTINCT patient_home."patientId")::int
               FROM "SpirePatientHomeAssignment" patient_home
              WHERE patient_home."organizationId"=h."organizationId" AND patient_home."homeId"=h."id"
                AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">now())) AS "clientCount"
       FROM "TimeAttendanceLocation" h
       LEFT JOIN "LegalEntity" entity ON entity."organizationId"=h."organizationId" AND entity."id"=h."legalEntityId"
      WHERE h."organizationId"=$1 AND h."active"=true ${accessClause}
      ORDER BY favorite DESC, lower(h."name"), lower(COALESCE(entity."displayName",''))`,
    ...(seesAllHomes(auth) ? [auth.organizationId, auth.userId] : args),
  );
}

async function listPatientsForHome(prisma: PrismaClient, organizationId: string, homeId: string) {
  return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT p."id",p."id" AS "patientId",p."medicalRecordNumber",p."firstName",p."lastName",p."preferredName",p."dateOfBirth",
            h."name" AS "homeName",h."id" AS "homeId",h."legalEntityId",
            entity."displayName" AS "companyName",entity."code" AS "companyCode",
            (SELECT enrollment."programId" FROM "SpirePatientProgramEnrollment" enrollment
              WHERE enrollment."organizationId"=p."organizationId" AND enrollment."patientId"=p."id" AND enrollment."status"='ACTIVE'
              ORDER BY enrollment."startsAt" DESC LIMIT 1) AS "programName",
            COALESCE((SELECT jsonb_agg(jsonb_build_object('label',flag."label",'severity',flag."severity"))
              FROM "SpirePatientFlag" flag
              WHERE flag."organizationId"=p."organizationId" AND flag."patientId"=p."id" AND flag."active"=true),'[]'::jsonb) AS flags
       FROM "SpirePatientHomeAssignment" assignment
       JOIN "SpirePatient" p ON p."organizationId"=assignment."organizationId" AND p."id"=assignment."patientId" AND p."active"=true
       JOIN "TimeAttendanceLocation" h ON h."organizationId"=assignment."organizationId" AND h."id"=assignment."homeId" AND h."active"=true
       LEFT JOIN "LegalEntity" entity ON entity."organizationId"=h."organizationId" AND entity."id"=h."legalEntityId"
      WHERE assignment."organizationId"=$1 AND assignment."homeId"=$2
        AND (assignment."startsAt" IS NULL OR assignment."startsAt"<=now())
        AND (assignment."endsAt" IS NULL OR assignment."endsAt">now())
      ORDER BY lower(p."lastName"),lower(p."firstName")`,
    organizationId,
    homeId,
  ).then((rows) => rows.map((row) => ({
    ...row,
    name: [row.preferredName || row.firstName, row.lastName].filter(Boolean).join(' '),
    allergies: [],
    diagnoses: [],
  })));
}

async function listScheduleForHome(prisma: PrismaClient, organizationId: string, homeId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT appointment."id",appointment."patientId",appointment."startsAt",appointment."endsAt",appointment."status",
            appointment."appointmentType",appointment."locationId",appointment."providerUserId",
            patient."firstName",patient."preferredName",patient."lastName"
       FROM "SpireAppointment" appointment
       JOIN "SpirePatient" patient ON patient."id"=appointment."patientId" AND patient."organizationId"=appointment."organizationId"
       JOIN "SpirePatientHomeAssignment" home ON home."organizationId"=appointment."organizationId" AND home."patientId"=appointment."patientId"
      WHERE appointment."organizationId"=$1 AND home."homeId"=$2
        AND (home."startsAt" IS NULL OR home."startsAt"<=now()) AND (home."endsAt" IS NULL OR home."endsAt">now())
        AND appointment."startsAt">=date_trunc('day',now()) AND appointment."startsAt"<date_trunc('day',now())+interval '1 day'
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

export function registerSpireNetworkHomeAccessRoutes(app: express.Express, prisma: PrismaClient, deps: Dependencies) {
  const { authOf } = deps;

  // Selected service home becomes the server-side SPIRE provenance context. This runs
  // before legacy chart routes so SPIRE users never have to select a company manually.
  app.use('/api/spire', async (req, res, next) => {
    try {
      const homeId = requestHomeId(req);
      if (!homeId) return next();
      const auth = authOf(res);
      ensureClinical(auth);
      const home = await homeAllowed(prisma, auth, homeId);
      if (!home) throw httpError(403, 'This service home is outside your assigned SPIRE access');
      const patientMatch = req.originalUrl.match(/\/api\/spire\/patients\/([^/?#]+)/i);
      if (patientMatch && !seesAllHomes(auth)) {
        const patientId = decodeURIComponent(patientMatch[1]);
        if (!(await patientInHome(prisma, auth.organizationId, patientId, homeId))) {
          throw httpError(403, 'Select the service home where this client currently resides before opening the chart');
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
      const homeIds = uniqueIds(req.body?.homeIds, 5);
      if (homeIds.length > 5) throw httpError(400, 'You may favorite up to five service homes');
      for (const homeId of homeIds) {
        if (!(await homeAllowed(prisma, auth, homeId))) throw httpError(403, 'A favorite must be one of your accessible service homes');
      }
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM "SpireUserHomeFavorite" WHERE "organizationId"=$1 AND "userId"=$2`,
          auth.organizationId,
          auth.userId,
        );
        for (const homeId of homeIds) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireUserHomeFavorite"("id","organizationId","userId","homeId","createdAt") VALUES($1,$2,$3,$4,now())`,
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

  app.get('/api/admin/spire/network-access/employees', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      ensureAdmin(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT user_row."id",user_row."email",user_row."role",
                COALESCE(NULLIF(to_jsonb(user_row)->>'displayName',''),NULLIF(to_jsonb(user_row)->>'fullName',''),user_row."email") AS "displayName"
           FROM "User" user_row
          WHERE user_row."organizationId"=$1
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
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT h."id",h."legalEntityId",h."name",h."address",h."streetAddress",h."city",h."state",h."zipCode",
                entity."displayName" AS "companyName",entity."code" AS "companyCode",
                (SELECT count(DISTINCT access."userId")::int FROM "SpireEmployeeHomeAssignment" access
                  WHERE access."organizationId"=h."organizationId" AND access."homeId"=h."id") AS "employeeAccessCount",
                (SELECT count(DISTINCT patient_home."patientId")::int FROM "SpirePatientHomeAssignment" patient_home
                  WHERE patient_home."organizationId"=h."organizationId" AND patient_home."homeId"=h."id"
                    AND (patient_home."endsAt" IS NULL OR patient_home."endsAt">now())) AS "clientCount"
           FROM "TimeAttendanceLocation" h
           LEFT JOIN "LegalEntity" entity ON entity."organizationId"=h."organizationId" AND entity."id"=h."legalEntityId"
          WHERE h."organizationId"=$1 AND h."active"=true
          ORDER BY lower(COALESCE(entity."displayName",'')),lower(h."name")`,
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
        `SELECT "homeId","legalEntityId" FROM "SpireEmployeeHomeAssignment"
          WHERE "organizationId"=$1 AND "userId"=$2 ORDER BY "createdAt"`,
        auth.organizationId,
        req.params.employeeId,
      );
      res.json({ data: { employeeId: req.params.employeeId, homeIds: [...new Set(rows.map((row) => row.homeId))], assignments: rows } });
    } catch (error) { next(error); }
  });

  app.put('/api/admin/spire/network-access/assignments', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureAdmin(auth);
      const employeeId = String(req.body?.employeeId || '').trim();
      if (!employeeId) throw httpError(400, 'employeeId is required');
      const employee = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "User" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
        auth.organizationId,
        employeeId,
      );
      if (!employee[0]) throw httpError(404, 'Employee account was not found');
      const homeIds = uniqueIds(req.body?.homeIds, 500);
      const homes: HomeRow[] = [];
      for (const homeId of homeIds) {
        const home = await homeById(prisma, auth.organizationId, homeId);
        if (!home) throw httpError(400, `Service home ${homeId} is not active in the Sulandra network`);
        homes.push(home);
      }
      const prior = await prisma.$queryRawUnsafe<Array<{ homeId: string }>>(
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
        before: [...new Set(prior.map((row) => row.homeId))],
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
      const [homeEvents, chartEvents] = await Promise.all([
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT event."id",event."action",event."homeId",home."name" AS "homeName",event."actorUserId",event."actorEmail",
                  event."subjectUserId",event."metadata",event."ipAddress",event."createdAt",entity."displayName" AS "companyName"
             FROM "SpireServiceHomeAccessEvent" event
             LEFT JOIN "TimeAttendanceLocation" home ON home."organizationId"=event."organizationId" AND home."id"=event."homeId"
             LEFT JOIN "LegalEntity" entity ON entity."organizationId"=event."organizationId" AND entity."id"=event."legalEntityId"
            WHERE event."organizationId"=$1 ORDER BY event."createdAt" DESC LIMIT $2`,
          auth.organizationId,
          limit,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT event."id",event."action",event."patientId",patient."medicalRecordNumber",
                  trim(concat_ws(' ',COALESCE(patient."preferredName",patient."firstName"),patient."lastName")) AS "patientName",
                  event."actorUserId",event."actorEmail",event."resourceType",event."resourceId",event."ipAddress",event."createdAt",
                  entity."displayName" AS "companyName"
             FROM "SpireChartAccessEvent" event
             LEFT JOIN "SpirePatient" patient ON patient."organizationId"=event."organizationId" AND patient."id"=event."patientId"
             LEFT JOIN "LegalEntity" entity ON entity."organizationId"=event."organizationId" AND entity."id"=event."legalEntityId"
            WHERE event."organizationId"=$1 ORDER BY event."createdAt" DESC LIMIT $2`,
          auth.organizationId,
          limit,
        ),
      ]);
      const events = [
        ...homeEvents.map((event) => ({ ...event, auditType: 'SERVICE_HOME' })),
        ...chartEvents.map((event) => ({ ...event, auditType: 'CHART' })),
      ].sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime()).slice(0, limit);
      res.json({ data: events });
    } catch (error) { next(error); }
  });
}
