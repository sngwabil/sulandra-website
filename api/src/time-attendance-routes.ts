import type { Express, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaClient, UserRole } from '@prisma/client';
import { entityAccessOf, requireEntityManageAccess, type EntityAccessContext } from './entity-access.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole; email?: string };
type RouteDependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
};

const requestSchema = z.object({
  type: z.enum(['TIME_OFF', 'AVAILABILITY', 'SHIFT_TRADE', 'CLOCK_CORRECTION']),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  reason: z.string().trim().max(2000).optional().default(''),
}).refine((value) => value.endAt > value.startAt, { message: 'End must be after start' });

const shiftFields = z.object({
  employeeId: z.string().trim().nullable().optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  code: z.string().trim().min(1).max(30),
  department: z.string().trim().max(120).optional().default(''),
  location: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
  clientId: z.string().trim().nullable().optional(),
  payCode: z.string().trim().max(40).optional().default('REG'),
  repeatWeeks: z.number().int().min(1).max(52).optional().default(1),
});
const shiftSchema = shiftFields.refine((value) => value.endTime > value.startTime, { message: 'End must be after start' });

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const ensureSchema = async (prisma: PrismaClient) => {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceShift" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"employeeId" TEXT,
    "startTime" TIMESTAMPTZ NOT NULL,"endTime" TIMESTAMPTZ NOT NULL,"code" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT '',"location" TEXT NOT NULL DEFAULT '',"notes" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,"payCode" TEXT NOT NULL DEFAULT 'REG',"status" TEXT NOT NULL DEFAULT 'DRAFT',"createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "clientId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "payCode" TEXT NOT NULL DEFAULT 'REG'`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimeAttendanceShift_entity_start_idx" ON "TimeAttendanceShift"("organizationId","legalEntityId","startTime")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceClockEntry" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,
    "clockIn" TIMESTAMPTZ NOT NULL,"clockOut" TIMESTAMPTZ,"source" TEXT NOT NULL DEFAULT 'PORTAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',"notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TimeAttendanceClockEntry_entity_one_open" ON "TimeAttendanceClockEntry"("organizationId","legalEntityId","employeeId") WHERE "clockOut" IS NULL`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceRequest" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"type" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,"endAt" TIMESTAMPTZ NOT NULL,"reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',"reviewedById" TEXT,"reviewedAt" TIMESTAMPTZ,"reviewNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceRequest" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimeAttendanceRequest_entity_status_idx" ON "TimeAttendanceRequest"("organizationId","legalEntityId","status")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceAudit" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,"resourceId" TEXT,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceAudit" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
};

export const registerTimeAttendanceRoutes = ({ app, prisma, authOf, requireRoles }: RouteDependencies) => {
  let schemaReady: Promise<void> | null = null;
  const ready = () => schemaReady ??= ensureSchema(prisma).catch((error) => { schemaReady = null; throw error; });
  const admin = requireRoles(UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HR_MANAGER, UserRole.SCHEDULER, UserRole.CEO, UserRole.COO);

  const requireEmployment = async (
    auth: AuthContext,
    access: EntityAccessContext,
    employeeId: string,
    clockable = false,
  ) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "Employment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3
         AND "status" ${clockable ? "='ACTIVE'" : "IN ('ACTIVE','LEAVE')"}
         AND "startsAt"<=CURRENT_DATE AND ("endsAt" IS NULL OR "endsAt">=CURRENT_DATE) LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      employeeId,
    );
    if (!rows[0]) {
      throw httpError(409, clockable
        ? 'Active employment in the selected company is required to use the time clock'
        : 'The employee is not active in the selected company');
    }
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

  const log = async (
    auth: AuthContext,
    access: EntityAccessContext,
    action: string,
    resourceType: string,
    resourceId?: string,
    details: object = {},
  ) => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TimeAttendanceAudit" ("id","organizationId","legalEntityId","actorId","action","resourceType","resourceId","details")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      randomUUID(), auth.organizationId, access.legalEntityId, auth.userId, action,
      resourceType, resourceId || null, JSON.stringify(details),
    );
  };

  app.get('/api/time-attendance/clock/status', async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId, true);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "TimeAttendanceClockEntry"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3 AND "clockOut" IS NULL
         ORDER BY "clockIn" DESC LIMIT 1`,
        auth.organizationId, access.legalEntityId, auth.userId,
      );
      res.json({ data: { clockedIn: Boolean(rows[0]), ...(rows[0] || {}) } });
    } catch (error) { next(error); }
  });

  app.post('/api/time-attendance/clock/in', async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId, true);
      res.status(409).json({
        error: 'GPS and assigned-shift verification are required. Use the verified clock-in action or submit a manual punch request.',
        code: 'GEOFENCE_REQUIRED',
      });
    } catch (error) { next(error); }
  });

  app.post('/api/time-attendance/clock/out', async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId, true);
      res.status(409).json({
        error: 'GPS and assigned-shift verification are required. Use the verified clock-out action or submit a manual punch request.',
        code: 'GEOFENCE_REQUIRED',
      });
    } catch (error) { next(error); }
  });

  app.get('/api/time-attendance/schedule', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId);
      const start = new Date(String(req.query.start || new Date().toISOString().slice(0, 10)));
      const end = new Date(String(req.query.end || new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)));
      end.setHours(23, 59, 59, 999);
      const shifts = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "TimeAttendanceShift"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND ("employeeId"=$3 OR "employeeId" IS NULL)
           AND "startTime">=$4 AND "startTime"<=$5 AND "status"='PUBLISHED' ORDER BY "startTime"`,
        auth.organizationId, access.legalEntityId, auth.userId, start, end,
      );
      res.json({ data: { shifts } });
    } catch (error) { next(error); }
  });

  app.get('/api/time-attendance/timecard', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId);
      const start = new Date(String(req.query.start || new Date(Date.now() - 14 * 86_400_000).toISOString()));
      const end = new Date(String(req.query.end || new Date().toISOString()));
      const entries = await prisma.$queryRawUnsafe<any[]>(
        `SELECT *,ROUND((EXTRACT(EPOCH FROM (COALESCE("clockOut",NOW())-"clockIn"))/3600)::numeric,2)::float8 AS "hours"
         FROM "TimeAttendanceClockEntry"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3
           AND "clockIn">=$4 AND "clockIn"<=$5 ORDER BY "clockIn" DESC`,
        auth.organizationId, access.legalEntityId, auth.userId, start, end,
      );
      res.json({ data: { entries } });
    } catch (error) { next(error); }
  });

  app.get('/api/time-attendance/requests', async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "TimeAttendanceRequest"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3 ORDER BY "createdAt" DESC`,
        auth.organizationId, access.legalEntityId, auth.userId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/time-attendance/requests', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId);
      const input = requestSchema.parse(req.body);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "TimeAttendanceRequest" ("id","organizationId","legalEntityId","employeeId","type","startAt","endAt","reason")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        id, auth.organizationId, access.legalEntityId, auth.userId, input.type, input.startAt, input.endAt, input.reason,
      );
      await log(auth, access, 'CREATE_REQUEST', 'REQUEST', id, input);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "TimeAttendanceRequest" WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3`,
        id, auth.organizationId, access.legalEntityId,
      );
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/time-attendance/employees', admin, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT DISTINCT user_row."id",COALESCE(credential."displayName",user_row."email",user_row."id") AS "displayName",
                user_row."email",user_row."role"::text AS "role",COALESCE(department."name",'') AS "department"
         FROM "Employment" employment
         JOIN "User" user_row ON user_row."organizationId"=employment."organizationId" AND user_row."id"=employment."userId"
         LEFT JOIN "Department" department ON department."id"=employment."departmentId" AND department."legalEntityId"=employment."legalEntityId"
         LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
         WHERE employment."organizationId"=$1 AND employment."legalEntityId"=$2 AND employment."status" IN ('ACTIVE','LEAVE')
         ORDER BY "displayName"`,
        auth.organizationId, access.legalEntityId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/time-attendance/requests', admin, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT request_row.*,COALESCE(credential."displayName",user_row."email",request_row."employeeId") AS "employeeName"
         FROM "TimeAttendanceRequest" request_row
         LEFT JOIN "User" user_row ON user_row."organizationId"=request_row."organizationId" AND user_row."id"=request_row."employeeId"
         LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
         WHERE request_row."organizationId"=$1 AND request_row."legalEntityId"=$2
         ORDER BY request_row."createdAt" DESC LIMIT 500`,
        auth.organizationId, access.legalEntityId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/time-attendance/dashboard', admin, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const start = req.query.start ? new Date(String(req.query.start)) : new Date(Date.now() - 7 * 86_400_000);
      const end = req.query.end ? new Date(String(req.query.end)) : new Date(Date.now() + 35 * 86_400_000);
      const department = typeof req.query.department === 'string' ? req.query.department : '';
      const location = typeof req.query.location === 'string' ? req.query.location : '';
      const [employees, clocked, openShifts, pending, shifts, overtime, missed] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(DISTINCT "userId")::int AS "count" FROM "Employment"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "status" IN ('ACTIVE','LEAVE')`,
          auth.organizationId, access.legalEntityId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS "count" FROM "TimeAttendanceClockEntry"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clockOut" IS NULL`,
          auth.organizationId, access.legalEntityId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS "count" FROM "TimeAttendanceShift"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId" IS NULL AND "startTime">=NOW()`,
          auth.organizationId, access.legalEntityId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS "count" FROM "TimeAttendanceRequest"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "status"='PENDING'`,
          auth.organizationId, access.legalEntityId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT shift_row.*,COALESCE(credential."displayName",user_row."email",'Open shift') AS "employeeName",user_row."role"::text AS "role"
           FROM "TimeAttendanceShift" shift_row
           LEFT JOIN "User" user_row ON user_row."organizationId"=shift_row."organizationId" AND user_row."id"=shift_row."employeeId"
           LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
           WHERE shift_row."organizationId"=$1 AND shift_row."legalEntityId"=$2
             AND shift_row."startTime">=$3 AND shift_row."startTime"<=$4
             AND ($5='' OR shift_row."department"=$5) AND ($6='' OR shift_row."location"=$6)
           ORDER BY shift_row."startTime" LIMIT 1000`,
          auth.organizationId, access.legalEntityId, start, end, department, location,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS "count" FROM (
             SELECT "employeeId",DATE_TRUNC('week',"clockIn") AS "week",
                    SUM(EXTRACT(EPOCH FROM (COALESCE("clockOut",NOW())-"clockIn"))/3600) AS "hours"
             FROM "TimeAttendanceClockEntry"
             WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clockIn">=NOW()-INTERVAL '14 days'
             GROUP BY 1,2 HAVING SUM(EXTRACT(EPOCH FROM (COALESCE("clockOut",NOW())-"clockIn"))/3600)>40
           ) overtime_rows`,
          auth.organizationId, access.legalEntityId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS "count" FROM "TimeAttendanceClockEntry"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clockIn"<NOW()-INTERVAL '16 hours' AND "clockOut" IS NULL`,
          auth.organizationId, access.legalEntityId,
        ),
      ]);
      res.json({ data: {
        employeeCount: employees[0]?.count || 0,
        clockedInCount: clocked[0]?.count || 0,
        openShiftCount: openShifts[0]?.count || 0,
        pendingRequestCount: pending[0]?.count || 0,
        overtimeCount: overtime[0]?.count || 0,
        missedPunchCount: missed[0]?.count || 0,
        shifts,
      } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/time-attendance/shifts', admin, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const input = shiftSchema.parse(req.body);
      if (input.employeeId) await requireEmployment(auth, access, input.employeeId, true);
      if (input.clientId) await requireClient(auth, access, input.clientId);
      const ids: string[] = [];
      for (let week = 0; week < input.repeatWeeks; week += 1) {
        const start = new Date(input.startTime);
        const end = new Date(input.endTime);
        start.setDate(start.getDate() + week * 7);
        end.setDate(end.getDate() + week * 7);
        const conflicts = input.employeeId
          ? await prisma.$queryRawUnsafe<any[]>(
            `SELECT "id" FROM "TimeAttendanceShift"
             WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3
               AND "startTime"<$5 AND "endTime">$4 LIMIT 1`,
            auth.organizationId, access.legalEntityId, input.employeeId, start, end,
          )
          : [];
        if (conflicts[0]) return void res.status(409).json({ error: `Schedule conflict detected for week ${week + 1}` });
        const id = randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "TimeAttendanceShift" (
             "id","organizationId","legalEntityId","employeeId","startTime","endTime","code","department",
             "location","notes","clientId","payCode","createdById"
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          id, auth.organizationId, access.legalEntityId, input.employeeId || null, start, end, input.code,
          input.department, input.location, input.notes, input.clientId || null, input.payCode, auth.userId,
        );
        ids.push(id);
      }
      await log(auth, access, 'CREATE_SHIFT', 'SHIFT', ids[0], { ids, ...input });
      res.status(201).json({ data: { ids, count: ids.length } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/time-attendance/shifts/:id', admin, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const input = shiftFields.partial().parse(req.body);
      if (input.employeeId) await requireEmployment(auth, access, input.employeeId, true);
      if (input.clientId) await requireClient(auth, access, input.clientId);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "TimeAttendanceShift" SET
           "employeeId"=COALESCE($1,"employeeId"),"startTime"=COALESCE($2,"startTime"),"endTime"=COALESCE($3,"endTime"),
           "code"=COALESCE($4,"code"),"department"=COALESCE($5,"department"),"location"=COALESCE($6,"location"),
           "notes"=COALESCE($7,"notes"),"clientId"=COALESCE($8,"clientId"),"payCode"=COALESCE($9,"payCode"),"updatedAt"=NOW()
         WHERE "id"=$10 AND "organizationId"=$11 AND "legalEntityId"=$12 RETURNING *`,
        input.employeeId ?? null, input.startTime ?? null, input.endTime ?? null, input.code ?? null,
        input.department ?? null, input.location ?? null, input.notes ?? null, input.clientId ?? null,
        input.payCode ?? null, req.params.id, auth.organizationId, access.legalEntityId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Shift not found' });
      await log(auth, access, 'UPDATE_SHIFT', 'SHIFT', req.params.id, input);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.delete('/api/admin/time-attendance/shifts/:id', admin, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `DELETE FROM "TimeAttendanceShift"
         WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3 RETURNING *`,
        req.params.id, auth.organizationId, access.legalEntityId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Shift not found' });
      await log(auth, access, 'DELETE_SHIFT', 'SHIFT', req.params.id);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/time-attendance/publish', admin, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const changed = await prisma.$executeRawUnsafe(
        `UPDATE "TimeAttendanceShift" SET "status"='PUBLISHED',"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "status"='DRAFT'`,
        auth.organizationId, access.legalEntityId,
      );
      await log(auth, access, 'PUBLISH_SCHEDULE', 'SCHEDULE', undefined, { published: changed });
      res.json({ data: { published: changed } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/time-attendance/requests/:id', admin, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const status = z.enum(['APPROVED', 'DENIED']).parse(req.body?.status);
      const notes = z.string().max(2000).optional().default('').parse(req.body?.reviewNotes);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "TimeAttendanceRequest" SET
           "status"=$1,"reviewedById"=$2,"reviewedAt"=NOW(),"reviewNotes"=$3,"updatedAt"=NOW()
         WHERE "id"=$4 AND "organizationId"=$5 AND "legalEntityId"=$6 RETURNING *`,
        status, auth.userId, notes, req.params.id, auth.organizationId, access.legalEntityId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Request not found' });
      await log(auth, access, 'REVIEW_REQUEST', 'REQUEST', req.params.id, { status, notes });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/time-attendance/audit', admin, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "TimeAttendanceAudit"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 ORDER BY "createdAt" DESC LIMIT 500`,
        auth.organizationId, access.legalEntityId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });
};
