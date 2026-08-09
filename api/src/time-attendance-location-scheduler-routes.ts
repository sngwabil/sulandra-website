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

const locationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(3).max(300),
  latitude: z.number().finite().min(-90).max(90).optional().nullable(),
  longitude: z.number().finite().min(-180).max(180).optional().nullable(),
  geofenceRadiusMeters: z.number().int().min(50).max(5000).default(250),
});
const assignmentSchema = z.object({
  employeeId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  isManager: z.boolean().optional().default(false),
});
const cellSchema = z.object({
  employeeId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezoneOffsetMinutes: z.number().int().min(-840).max(840).default(0),
  code: z.string().trim().min(1).max(30).default('SHIFT'),
  payCode: z.string().trim().max(40).default('REG'),
});
const saveGridSchema = z.object({
  locationId: z.string().trim().min(1),
  cells: z.array(cellSchema).max(1000),
  publish: z.boolean().optional().default(true),
});
const copySchema = z.object({
  locationId: z.string().trim().min(1),
  sourceStart: z.coerce.date(),
  sourceEnd: z.coerce.date(),
  targetStart: z.coerce.date(),
  weeks: z.number().int().min(1).max(104),
  publish: z.boolean().optional().default(true),
});

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const localDateTime = (date: string, time: string, offsetMinutes: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) + offsetMinutes * 60_000);
};

const ensureSchema = async (prisma: PrismaClient) => {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceLocation" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,"address" TEXT NOT NULL,"latitude" DOUBLE PRECISION,"longitude" DOUBLE PRECISION,
    "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 250,"active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceLocation" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TA_location_entity_name_uq" ON "TimeAttendanceLocation"("organizationId","legalEntityId","name")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceLocationAssignment" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"isManager" BOOLEAN NOT NULL DEFAULT FALSE,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceLocationAssignment" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TA_location_assignment_uq" ON "TimeAttendanceLocationAssignment"("organizationId","locationId","employeeId")`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "locationId" TEXT`);
};

export const registerTimeAttendanceLocationSchedulerRoutes = ({ app, prisma, authOf, requireRoles }: Dependencies) => {
  let readyPromise: Promise<void> | null = null;
  const ready = () => readyPromise ??= ensureSchema(prisma).catch((error) => { readyPromise = null; throw error; });
  const admin = requireRoles(UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HR_MANAGER, UserRole.SCHEDULER, UserRole.CEO, UserRole.COO);
  const managers = requireRoles(UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HR_MANAGER, UserRole.SCHEDULER, UserRole.CEO, UserRole.COO, UserRole.HOUSE_MANAGER);
  const isGlobal = (role: UserRole) => ['ADMINISTRATOR', 'PROGRAM_MANAGER', 'HR_MANAGER', 'SCHEDULER', 'CEO', 'COO'].includes(String(role));

  const requireLocation = async (auth: AuthContext, access: EntityAccessContext, locationId: string) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "TimeAttendanceLocation"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 AND "active"=TRUE LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      locationId,
    );
    if (!rows[0]) throw httpError(404, 'Service location was not found in the selected company');
    return rows[0];
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

  const canAccessLocation = async (
    auth: AuthContext,
    access: EntityAccessContext,
    locationId: string,
    write = false,
  ) => {
    try { await requireLocation(auth, access, locationId); } catch { return false; }
    if (isGlobal(auth.role)) return !write || access.accessLevel === 'MANAGE';
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "TimeAttendanceLocationAssignment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3 AND "employeeId"=$4
         AND "isManager"=TRUE AND "active"=TRUE LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      locationId,
      auth.userId,
    );
    return Boolean(rows[0]);
  };

  const requireAssignedEmployee = async (
    auth: AuthContext,
    access: EntityAccessContext,
    locationId: string,
    employeeId: string,
  ) => {
    await requireEmployee(auth, access, employeeId);
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "TimeAttendanceLocationAssignment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3 AND "employeeId"=$4 AND "active"=TRUE LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      locationId,
      employeeId,
    );
    if (!rows[0]) throw httpError(409, 'The employee must be assigned to this selected-company location before scheduling');
  };

  const assignEmployee = async (
    auth: AuthContext,
    access: EntityAccessContext,
    locationId: string,
    employeeId: string,
    isManager = false,
  ) => {
    await Promise.all([
      requireLocation(auth, access, locationId),
      requireEmployee(auth, access, employeeId),
    ]);
    return prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO "TimeAttendanceLocationAssignment" ("id","organizationId","legalEntityId","locationId","employeeId","isManager")
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("organizationId","locationId","employeeId") DO UPDATE SET
         "legalEntityId"=EXCLUDED."legalEntityId",
         "isManager"=("TimeAttendanceLocationAssignment"."isManager" OR EXCLUDED."isManager"),
         "active"=TRUE,"updatedAt"=NOW()
       RETURNING *`,
      randomUUID(),
      auth.organizationId,
      access.legalEntityId,
      locationId,
      employeeId,
      isManager,
    );
  };

  const ensureOffice = async (auth: AuthContext, access: EntityAccessContext) => {
    let rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "TimeAttendanceLocation"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND LOWER("name")='office' AND "active"=TRUE LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
    );
    if (!rows[0] && access.legalEntityCode === 'SCLS' && isGlobal(auth.role) && access.accessLevel === 'MANAGE') {
      rows = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO "TimeAttendanceLocation" ("id","organizationId","legalEntityId","name","address","geofenceRadiusMeters")
         VALUES ($1,$2,$3,'Office','822 Dalewood Pl Dayton Ohio 45426 Suite A',250) RETURNING *`,
        randomUUID(),
        auth.organizationId,
        access.legalEntityId,
      );
    }
    return rows[0] || null;
  };

  app.get('/api/admin/time-attendance/locations', managers, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await ensureOffice(auth, access);
      const rows = isGlobal(auth.role)
        ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "TimeAttendanceLocation"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "active"=TRUE
           ORDER BY CASE WHEN LOWER("name")='office' THEN 0 ELSE 1 END,"name"`,
          auth.organizationId,
          access.legalEntityId,
        )
        : await prisma.$queryRawUnsafe<any[]>(
          `SELECT location_row.* FROM "TimeAttendanceLocation" location_row
           JOIN "TimeAttendanceLocationAssignment" assignment
             ON assignment."organizationId"=location_row."organizationId"
            AND assignment."legalEntityId"=location_row."legalEntityId"
            AND assignment."locationId"=location_row."id"
           WHERE location_row."organizationId"=$1 AND location_row."legalEntityId"=$2
             AND location_row."active"=TRUE AND assignment."employeeId"=$3
             AND assignment."isManager"=TRUE AND assignment."active"=TRUE
           ORDER BY CASE WHEN LOWER(location_row."name")='office' THEN 0 ELSE 1 END,location_row."name"`,
          auth.organizationId,
          access.legalEntityId,
          auth.userId,
        );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/time-attendance/locations', admin, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const input = locationSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO "TimeAttendanceLocation" ("id","organizationId","legalEntityId","name","address","latitude","longitude","geofenceRadiusMeters")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        randomUUID(), auth.organizationId, access.legalEntityId, input.name, input.address,
        input.latitude ?? null, input.longitude ?? null, input.geofenceRadiusMeters,
      );
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/time-attendance/location-assignments', admin, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const input = assignmentSchema.parse(req.body);
      const rows = await assignEmployee(auth, access, input.locationId, input.employeeId, input.isManager);
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/time-attendance/locations/:id/employees', managers, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      if (!(await canAccessLocation(auth, access, req.params.id))) {
        return void res.status(403).json({ error: 'You may view only assigned service locations in the selected company' });
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT user_row."id",user_row."email",user_row."role"::text AS "role",
                COALESCE(NULLIF(credential."displayName",''),user_row."email") AS "displayName",assignment."isManager"
         FROM "TimeAttendanceLocationAssignment" assignment
         JOIN "Employment" employment
           ON employment."organizationId"=assignment."organizationId" AND employment."legalEntityId"=assignment."legalEntityId"
          AND employment."userId"=assignment."employeeId" AND employment."status"<>'TERMINATED'
         JOIN "User" user_row ON user_row."organizationId"=assignment."organizationId" AND user_row."id"=assignment."employeeId"
         LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
         WHERE assignment."organizationId"=$1 AND assignment."legalEntityId"=$2
           AND assignment."locationId"=$3 AND assignment."active"=TRUE
         ORDER BY COALESCE(NULLIF(credential."displayName",''),user_row."email")`,
        auth.organizationId,
        access.legalEntityId,
        req.params.id,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/time-attendance/location-grid', managers, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const locationId = String(req.query.locationId || '');
      if (!(await canAccessLocation(auth, access, locationId))) {
        return void res.status(403).json({ error: 'You may view only assigned service locations in the selected company' });
      }
      const start = new Date(String(req.query.start));
      const end = new Date(String(req.query.end));
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return void res.status(400).json({ error: 'A valid schedule start and end are required' });
      }
      const [location, employees, shifts] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "TimeAttendanceLocation"
           WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3 LIMIT 1`,
          locationId, auth.organizationId, access.legalEntityId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT user_row."id",user_row."role"::text AS "role",
                  COALESCE(NULLIF(credential."displayName",''),user_row."email") AS "displayName"
           FROM "TimeAttendanceLocationAssignment" assignment
           JOIN "Employment" employment
             ON employment."organizationId"=assignment."organizationId" AND employment."legalEntityId"=assignment."legalEntityId"
            AND employment."userId"=assignment."employeeId" AND employment."status"<>'TERMINATED'
           JOIN "User" user_row ON user_row."organizationId"=assignment."organizationId" AND user_row."id"=assignment."employeeId"
           LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
           WHERE assignment."organizationId"=$1 AND assignment."legalEntityId"=$2
             AND assignment."locationId"=$3 AND assignment."active"=TRUE
           ORDER BY COALESCE(NULLIF(credential."displayName",''),user_row."email")`,
          auth.organizationId, access.legalEntityId, locationId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "TimeAttendanceShift"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3
             AND "startTime">=$4 AND "startTime"<$5 ORDER BY "startTime"`,
          auth.organizationId, access.legalEntityId, locationId, start, end,
        ),
      ]);
      res.json({ data: { location: location[0], employees, shifts } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/time-attendance/location-grid', managers, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const input = saveGridSchema.parse(req.body);
      if (!(await canAccessLocation(auth, access, input.locationId, true))) {
        return void res.status(403).json({ error: 'You may manage only assigned service locations in the selected company' });
      }
      const location = await requireLocation(auth, access, input.locationId);
      const ids: string[] = [];
      for (const cell of input.cells) {
        await requireAssignedEmployee(auth, access, input.locationId, cell.employeeId);
        const start = localDateTime(cell.date, cell.startTime, cell.timezoneOffsetMinutes);
        let end = localDateTime(cell.date, cell.endTime, cell.timezoneOffsetMinutes);
        if (end <= start) end = new Date(end.getTime() + 86_400_000);
        const dayStart = localDateTime(cell.date, '00:00', cell.timezoneOffsetMinutes);
        const nextDay = new Date(dayStart.getTime() + 86_400_000);
        await prisma.$executeRawUnsafe(
          `DELETE FROM "TimeAttendanceShift"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3 AND "employeeId"=$4
             AND "startTime">=$5 AND "startTime"<$6`,
          auth.organizationId, access.legalEntityId, input.locationId, cell.employeeId, dayStart, nextDay,
        );
        const id = randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "TimeAttendanceShift" (
             "id","organizationId","legalEntityId","employeeId","locationId","startTime","endTime","code",
             "department","location","payCode","status","latitude","longitude","geofenceRadiusMeters","createdById"
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'',$9,$10,$11,$12,$13,$14,$15)`,
          id, auth.organizationId, access.legalEntityId, cell.employeeId, input.locationId, start, end, cell.code,
          location.name, cell.payCode, input.publish ? 'PUBLISHED' : 'DRAFT', location.latitude, location.longitude,
          location.geofenceRadiusMeters, auth.userId,
        );
        ids.push(id);
      }
      res.status(201).json({ data: { saved: ids.length, ids, published: input.publish } });
    } catch (error) { next(error); }
  });

  app.delete('/api/admin/time-attendance/shifts/:id', managers, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","locationId" FROM "TimeAttendanceShift"
         WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3 LIMIT 1`,
        req.params.id, auth.organizationId, access.legalEntityId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Shift not found' });
      if (rows[0].locationId) {
        if (!(await canAccessLocation(auth, access, String(rows[0].locationId), true))) {
          return void res.status(403).json({ error: 'You may manage only assigned service locations in the selected company' });
        }
      } else {
        requireEntityManageAccess(access);
      }
      await prisma.$executeRawUnsafe(
        `DELETE FROM "TimeAttendanceShift" WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3`,
        req.params.id, auth.organizationId, access.legalEntityId,
      );
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.post('/api/admin/time-attendance/copy-schedule', managers, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const input = copySchema.parse(req.body);
      if (!(await canAccessLocation(auth, access, input.locationId, true))) {
        return void res.status(403).json({ error: 'You may manage only assigned service locations in the selected company' });
      }
      const source = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "TimeAttendanceShift"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3
           AND "startTime">=$4 AND "startTime"<$5 ORDER BY "startTime"`,
        auth.organizationId, access.legalEntityId, input.locationId, input.sourceStart, input.sourceEnd,
      );
      const delta = input.targetStart.getTime() - input.sourceStart.getTime();
      let copied = 0;
      for (let week = 0; week < input.weeks; week += 1) {
        for (const shift of source) {
          if (shift.employeeId) await requireAssignedEmployee(auth, access, input.locationId, shift.employeeId);
          const start = new Date(new Date(shift.startTime).getTime() + delta + week * 7 * 86_400_000);
          const end = new Date(new Date(shift.endTime).getTime() + delta + week * 7 * 86_400_000);
          await prisma.$executeRawUnsafe(
            `DELETE FROM "TimeAttendanceShift"
             WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "locationId"=$3
               AND "employeeId" IS NOT DISTINCT FROM $4 AND DATE("startTime")=DATE($5)`,
            auth.organizationId, access.legalEntityId, input.locationId, shift.employeeId, start,
          );
          await prisma.$executeRawUnsafe(
            `INSERT INTO "TimeAttendanceShift" (
               "id","organizationId","legalEntityId","employeeId","locationId","startTime","endTime","code","department",
               "location","notes","clientId","payCode","status","latitude","longitude","geofenceRadiusMeters","createdById"
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            randomUUID(), auth.organizationId, access.legalEntityId, shift.employeeId, input.locationId, start, end,
            shift.code, shift.department, shift.location, shift.notes, shift.clientId, shift.payCode,
            input.publish ? 'PUBLISHED' : 'DRAFT', shift.latitude, shift.longitude, shift.geofenceRadiusMeters, auth.userId,
          );
          copied += 1;
        }
      }
      res.status(201).json({ data: { copied } });
    } catch (error) { next(error); }
  });
};
