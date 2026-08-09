import type { Express, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaClient, UserRole } from '@prisma/client';
import { entityAccessOf, requireEntityManageAccess, type EntityAccessContext } from './entity-access.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
};

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY', 'DC',
]);
const homeSchema = z.object({
  name: z.string().trim().min(2).max(160),
  streetAddress: z.string().trim().min(3).max(220),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().transform((value) => value.toUpperCase()).refine((value) => US_STATES.has(value), 'Select a valid state'),
  zipCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/, 'Enter a valid ZIP code'),
  latitude: z.number().finite().min(-90).max(90).optional().nullable(),
  longitude: z.number().finite().min(-180).max(180).optional().nullable(),
  geofenceRadiusMeters: z.number().int().min(50).max(5000).default(250),
});
const geocodeSchema = z.object({
  streetAddress: z.string().trim().min(3).max(220),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().transform((value) => value.toUpperCase()).refine((value) => US_STATES.has(value)),
  zipCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
});
const assignmentSchema = z.object({ employeeId: z.string().trim().min(1), isManager: z.boolean().default(false) });
const clientAssignmentSchema = z.object({ clientId: z.string().trim().min(1) });
const fullAddress = (value: { streetAddress: string; city: string; state: string; zipCode: string }) =>
  `${value.streetAddress}, ${value.city}, ${value.state} ${value.zipCode}`;
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const ensureSchema = async (prisma: PrismaClient) => {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceLocation" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"name" TEXT NOT NULL,"address" TEXT NOT NULL,"latitude" DOUBLE PRECISION,"longitude" DOUBLE PRECISION,"geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 250,"active" BOOLEAN NOT NULL DEFAULT TRUE,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceLocation" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceLocation" ADD COLUMN IF NOT EXISTS "streetAddress" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceLocation" ADD COLUMN IF NOT EXISTS "city" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceLocation" ADD COLUMN IF NOT EXISTS "state" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceLocation" ADD COLUMN IF NOT EXISTS "zipCode" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TA_location_entity_name_uq" ON "TimeAttendanceLocation"("organizationId","legalEntityId","name")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceLocationAssignment" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"locationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"isManager" BOOLEAN NOT NULL DEFAULT FALSE,"active" BOOLEAN NOT NULL DEFAULT TRUE,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceLocationAssignment" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TA_location_assignment_uq" ON "TimeAttendanceLocationAssignment"("organizationId","locationId","employeeId")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ServiceHomeClientAssignment" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"locationId" TEXT NOT NULL,"clientId" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT TRUE,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ServiceHomeClientAssignment" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "service_home_client_uq" ON "ServiceHomeClientAssignment"("organizationId","locationId","clientId")`);
};

export function registerServiceHomeManagementRoutes({ app, prisma, authOf, requireRoles }: Dependencies) {
  let readyPromise: Promise<void> | null = null;
  const ready = () => readyPromise ??= ensureSchema(prisma).catch((error) => { readyPromise = null; throw error; });
  const global = requireRoles(UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HR_MANAGER, UserRole.SCHEDULER, UserRole.CEO, UserRole.COO);
  const managers = requireRoles(UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HR_MANAGER, UserRole.SCHEDULER, UserRole.CEO, UserRole.COO, UserRole.HOUSE_MANAGER);
  const isGlobal = (role: UserRole) => ['ADMINISTRATOR', 'PROGRAM_MANAGER', 'HR_MANAGER', 'SCHEDULER', 'CEO', 'COO'].includes(String(role));

  const requireHome = async (auth: AuthContext, access: EntityAccessContext, locationId: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "TimeAttendanceLocation"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      locationId,
    );
    if (!rows[0]) throw httpError(404, 'Service home was not found in the selected company');
    return rows[0];
  };

  const canAccessHome = async (auth: AuthContext, access: EntityAccessContext, locationId: string, write = false) => {
    try { await requireHome(auth, access, locationId); } catch { return false; }
    if (isGlobal(auth.role)) return !write || access.accessLevel === 'MANAGE';
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "TimeAttendanceLocationAssignment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3 AND "employeeId"=$4
         AND "isManager"=true AND "active"=true LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      locationId,
      auth.userId,
    );
    return Boolean(rows[0]);
  };

  const requireEmployee = async (auth: AuthContext, access: EntityAccessContext, employeeId: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "Employment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 AND "status"<>'TERMINATED' LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      employeeId,
    );
    if (!rows[0]) throw httpError(409, 'The employee is not actively employed by the selected company');
  };

  const requireClient = async (auth: AuthContext, access: EntityAccessContext, clientId: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "ClientEnrollment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clientId"=$3
         AND "status" IN ('PENDING','ACTIVE','PAUSED') LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      clientId,
    );
    if (!rows[0]) throw httpError(409, 'The client is not enrolled with the selected company');
  };

  app.post('/api/admin/service-homes/geocode', managers, async (req, res, next) => {
    try {
      const input = geocodeSchema.parse(req.body);
      const params = new URLSearchParams({ street: input.streetAddress, city: input.city, state: input.state, zip: input.zipCode, benchmark: 'Public_AR_Current', format: 'json' });
      const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/address?${params.toString()}`, { headers: { Accept: 'application/json', 'User-Agent': 'SulandraHealth-ServiceHomes/1.0 admin@sulandrahealth.com' } });
      if (!response.ok) return void res.status(502).json({ error: 'The address mapping service is temporarily unavailable' });
      const body: any = await response.json();
      const match = body?.result?.addressMatches?.[0];
      if (!match?.coordinates) return void res.status(404).json({ error: 'No exact GPS match was found. Confirm the street, city, state, and ZIP code, or use Current GPS.' });
      res.json({ data: { latitude: Number(match.coordinates.y), longitude: Number(match.coordinates.x), matchedAddress: String(match.matchedAddress || fullAddress(input)), source: 'US_CENSUS_GEOCODER' } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/service-homes', managers, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const select = `SELECT location_row.*,
        COALESCE(NULLIF(location_row."streetAddress",''),location_row."address") AS "streetAddress",
        COALESCE(location_row."city",'') AS "city",COALESCE(location_row."state",'') AS "state",COALESCE(location_row."zipCode",'') AS "zipCode",
        (SELECT count(*)::int FROM "TimeAttendanceLocationAssignment" assignment
         WHERE assignment."organizationId"=location_row."organizationId" AND assignment."legalEntityId"=location_row."legalEntityId"
           AND assignment."locationId"=location_row."id" AND assignment."active"=true) AS "employeeCount",
        (SELECT count(*)::int FROM "ServiceHomeClientAssignment" assignment
         WHERE assignment."organizationId"=location_row."organizationId" AND assignment."legalEntityId"=location_row."legalEntityId"
           AND assignment."locationId"=location_row."id" AND assignment."active"=true) AS "clientCount"
        FROM "TimeAttendanceLocation" location_row`;
      const homes = isGlobal(auth.role)
        ? await prisma.$queryRawUnsafe<any[]>(
          `${select} WHERE location_row."organizationId"=$1 AND location_row."legalEntityId"=$2 AND location_row."active"=true ORDER BY location_row."name"`,
          auth.organizationId,
          access.legalEntityId,
        )
        : await prisma.$queryRawUnsafe<any[]>(
          `${select} JOIN "TimeAttendanceLocationAssignment" manager_assignment
             ON manager_assignment."organizationId"=location_row."organizationId"
            AND manager_assignment."legalEntityId"=location_row."legalEntityId"
            AND manager_assignment."locationId"=location_row."id"
           WHERE location_row."organizationId"=$1 AND location_row."legalEntityId"=$2 AND location_row."active"=true
             AND manager_assignment."employeeId"=$3 AND manager_assignment."isManager"=true AND manager_assignment."active"=true
           ORDER BY location_row."name"`,
          auth.organizationId,
          access.legalEntityId,
          auth.userId,
        );
      res.json({ data: homes });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/service-homes', global, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const input = homeSchema.parse(req.body);
      const address = fullAddress(input);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO "TimeAttendanceLocation" (
           "id","organizationId","legalEntityId","name","address","streetAddress","city","state","zipCode",
           "latitude","longitude","geofenceRadiusMeters"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        randomUUID(), auth.organizationId, access.legalEntityId, input.name, address, input.streetAddress, input.city,
        input.state, input.zipCode, input.latitude ?? null, input.longitude ?? null, input.geofenceRadiusMeters,
      );
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/service-homes/:id', managers, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      if (!(await canAccessHome(auth, access, req.params.id, true))) return void res.status(403).json({ error: 'You may manage only assigned service homes in the selected company' });
      const input = homeSchema.parse(req.body);
      const address = fullAddress(input);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "TimeAttendanceLocation" SET
           "name"=$1,"address"=$2,"streetAddress"=$3,"city"=$4,"state"=$5,"zipCode"=$6,
           "latitude"=$7,"longitude"=$8,"geofenceRadiusMeters"=$9,"updatedAt"=now()
         WHERE "id"=$10 AND "organizationId"=$11 AND "legalEntityId"=$12 RETURNING *`,
        input.name, address, input.streetAddress, input.city, input.state, input.zipCode, input.latitude ?? null,
        input.longitude ?? null, input.geofenceRadiusMeters, req.params.id, auth.organizationId, access.legalEntityId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Service home not found' });
      await prisma.$executeRawUnsafe(
        `UPDATE "TimeAttendanceShift" SET "location"=$1,"latitude"=$2,"longitude"=$3,"geofenceRadiusMeters"=$4
         WHERE "organizationId"=$5 AND "legalEntityId"=$6 AND "locationId"=$7`,
        input.name, input.latitude ?? null, input.longitude ?? null, input.geofenceRadiusMeters,
        auth.organizationId, access.legalEntityId, req.params.id,
      ).catch(() => undefined);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.delete('/api/admin/service-homes/:id', global, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      await requireHome(auth, access, req.params.id);
      await prisma.$transaction([
        prisma.$executeRawUnsafe(`UPDATE "TimeAttendanceLocation" SET "active"=false,"updatedAt"=now() WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3`, req.params.id, auth.organizationId, access.legalEntityId),
        prisma.$executeRawUnsafe(`UPDATE "TimeAttendanceLocationAssignment" SET "active"=false,"updatedAt"=now() WHERE "locationId"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3`, req.params.id, auth.organizationId, access.legalEntityId),
        prisma.$executeRawUnsafe(`UPDATE "ServiceHomeClientAssignment" SET "active"=false,"updatedAt"=now() WHERE "locationId"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3`, req.params.id, auth.organizationId, access.legalEntityId),
      ]);
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/admin/service-homes/directory/employees', global, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT DISTINCT user_row."id",user_row."email",user_row."role"::text AS "role",
                COALESCE(NULLIF(credential."displayName",''),user_row."email") AS "displayName"
         FROM "Employment" employment
         JOIN "User" user_row ON user_row."organizationId"=employment."organizationId" AND user_row."id"=employment."userId"
         LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
         WHERE employment."organizationId"=$1 AND employment."legalEntityId"=$2 AND employment."status"<>'TERMINATED'
         ORDER BY COALESCE(NULLIF(credential."displayName",''),user_row."email")`,
        auth.organizationId,
        access.legalEntityId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/service-homes/directory/clients', global, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT DISTINCT patient."id",patient."medicalRecordNumber",patient."firstName",patient."middleName",patient."lastName",patient."preferredName",
          COALESCE(NULLIF(patient."preferredName",''),NULLIF(trim(concat_ws(' ',patient."firstName",patient."middleName",patient."lastName")),''),patient."medicalRecordNumber",patient."id") AS "displayName"
         FROM "ClientEnrollment" enrollment
         JOIN "SpirePatient" patient ON patient."organizationId"=enrollment."organizationId" AND patient."id"=enrollment."clientId"
         WHERE enrollment."organizationId"=$1 AND enrollment."legalEntityId"=$2
           AND enrollment."status" IN ('PENDING','ACTIVE','PAUSED') AND patient."active"=true
         ORDER BY "displayName"`,
        auth.organizationId,
        access.legalEntityId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/service-homes/:id/assignments', managers, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      if (!(await canAccessHome(auth, access, req.params.id))) return void res.status(403).json({ error: 'You may view only assigned service homes in the selected company' });
      const [employees, clients] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT user_row."id",user_row."email",user_row."role"::text AS "role",
                  COALESCE(NULLIF(credential."displayName",''),user_row."email") AS "displayName",assignment."isManager"
           FROM "TimeAttendanceLocationAssignment" assignment
           JOIN "User" user_row ON user_row."organizationId"=assignment."organizationId" AND user_row."id"=assignment."employeeId"
           LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
           WHERE assignment."organizationId"=$1 AND assignment."legalEntityId"=$2 AND assignment."locationId"=$3 AND assignment."active"=true
           ORDER BY COALESCE(NULLIF(credential."displayName",''),user_row."email")`,
          auth.organizationId, access.legalEntityId, req.params.id,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT DISTINCT patient."id",patient."medicalRecordNumber",patient."firstName",patient."lastName",patient."preferredName",
             COALESCE(NULLIF(patient."preferredName",''),NULLIF(trim(concat_ws(' ',patient."firstName",patient."middleName",patient."lastName")),''),patient."medicalRecordNumber",patient."id") AS "displayName"
           FROM "ServiceHomeClientAssignment" assignment
           JOIN "ClientEnrollment" enrollment
             ON enrollment."organizationId"=assignment."organizationId" AND enrollment."legalEntityId"=assignment."legalEntityId"
            AND enrollment."clientId"=assignment."clientId" AND enrollment."status" IN ('PENDING','ACTIVE','PAUSED')
           JOIN "SpirePatient" patient ON patient."organizationId"=assignment."organizationId" AND patient."id"=assignment."clientId"
           WHERE assignment."organizationId"=$1 AND assignment."legalEntityId"=$2 AND assignment."locationId"=$3 AND assignment."active"=true
           ORDER BY "displayName"`,
          auth.organizationId, access.legalEntityId, req.params.id,
        ),
      ]);
      res.json({ data: { employees, clients } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/service-homes/:id/employees', global, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const input = assignmentSchema.parse(req.body);
      await Promise.all([requireHome(auth, access, req.params.id), requireEmployee(auth, access, input.employeeId)]);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO "TimeAttendanceLocationAssignment" ("id","organizationId","legalEntityId","locationId","employeeId","isManager")
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT ("organizationId","locationId","employeeId") DO UPDATE SET
           "legalEntityId"=EXCLUDED."legalEntityId","isManager"=EXCLUDED."isManager","active"=true,"updatedAt"=now() RETURNING *`,
        randomUUID(), auth.organizationId, access.legalEntityId, req.params.id, input.employeeId, input.isManager,
      );
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.delete('/api/admin/service-homes/:id/employees/:employeeId', global, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      await requireHome(auth, access, req.params.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "TimeAttendanceLocationAssignment" SET "active"=false,"isManager"=false,"updatedAt"=now()
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3 AND "employeeId"=$4`,
        auth.organizationId, access.legalEntityId, req.params.id, req.params.employeeId,
      );
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.post('/api/admin/service-homes/:id/clients', global, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const input = clientAssignmentSchema.parse(req.body);
      await Promise.all([requireHome(auth, access, req.params.id), requireClient(auth, access, input.clientId)]);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO "ServiceHomeClientAssignment" ("id","organizationId","legalEntityId","locationId","clientId")
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT ("organizationId","locationId","clientId") DO UPDATE SET
           "legalEntityId"=EXCLUDED."legalEntityId","active"=true,"updatedAt"=now() RETURNING *`,
        randomUUID(), auth.organizationId, access.legalEntityId, req.params.id, input.clientId,
      );
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.delete('/api/admin/service-homes/:id/clients/:clientId', global, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      await requireHome(auth, access, req.params.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "ServiceHomeClientAssignment" SET "active"=false,"updatedAt"=now()
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3 AND "clientId"=$4`,
        auth.organizationId, access.legalEntityId, req.params.id, req.params.clientId,
      );
      res.status(204).end();
    } catch (error) { next(error); }
  });
}
