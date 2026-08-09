import type { Express, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaClient, UserRole } from '@prisma/client';
import { entityAccessOf, requireEntityManageAccess, type EntityAccessContext } from './entity-access.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole; email?: string };
type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
};

type ShiftRow = {
  id: string;
  employeeId: string | null;
  startTime: Date | string;
  endTime: Date | string;
  code: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number;
};

const gpsSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).max(10_000).optional().default(0),
  source: z.string().trim().max(40).optional().default('PORTAL_GPS'),
});
const manualSchema = z.object({
  punchType: z.enum(['CLOCK_IN', 'CLOCK_OUT']),
  requestedAt: z.coerce.date(),
  reason: z.string().trim().min(5).max(2000),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  accuracyMeters: z.number().finite().min(0).max(10_000).optional(),
  shiftId: z.string().trim().optional(),
});
const geofenceSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  geofenceRadiusMeters: z.number().int().min(50).max(5000).default(250),
  location: z.string().trim().min(2).max(200),
});

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const distanceMeters = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const radius = 6_371_000;
  const radians = Math.PI / 180;
  const latitudeDelta = (bLat - aLat) * radians;
  const longitudeDelta = (bLng - aLng) * radians;
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(aLat * radians) * Math.cos(bLat * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
};

const ensureSchema = async (prisma: PrismaClient) => {
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 250`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "shiftId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInLatitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInLongitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInAccuracyMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInDistanceMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutLatitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutLongitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutAccuracyMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutDistanceMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceManualPunchRequest" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"shiftId" TEXT,
    "punchType" TEXT NOT NULL,"requestedAt" TIMESTAMPTZ NOT NULL,"reason" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,"longitude" DOUBLE PRECISION,"accuracyMeters" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',"reviewedById" TEXT,"reviewedAt" TIMESTAMPTZ,"reviewNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceManualPunchRequest" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManualPunch_entity_status_idx" ON "TimeAttendanceManualPunchRequest"("organizationId","legalEntityId","status")`);
};

export const registerTimeAttendanceGeofenceRoutes = ({ app, prisma, authOf, requireRoles }: Dependencies) => {
  let schemaReady: Promise<void> | null = null;
  const ready = () => schemaReady ??= ensureSchema(prisma).catch((error) => { schemaReady = null; throw error; });
  const admin = requireRoles(UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HR_MANAGER, UserRole.SCHEDULER, UserRole.CEO, UserRole.COO);

  const requireEmployment = async (auth: AuthContext, access: EntityAccessContext, employeeId: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "Employment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 AND "status"='ACTIVE'
         AND "startsAt"<=CURRENT_DATE AND ("endsAt" IS NULL OR "endsAt">=CURRENT_DATE) LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      employeeId,
    );
    if (!rows[0]) throw httpError(409, 'Active employment in the selected company is required to use the time clock');
  };

  const requireEmployeeShift = async (
    auth: AuthContext,
    access: EntityAccessContext,
    shiftId: string,
    employeeId: string,
  ) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "TimeAttendanceShift"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3
         AND ("employeeId"=$4 OR "employeeId" IS NULL) AND "status"='PUBLISHED' LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      shiftId,
      employeeId,
    );
    if (!rows[0]) throw httpError(409, 'The selected shift is not available to this employee in the selected company');
  };

  const findShift = async (auth: AuthContext, access: EntityAccessContext, at: Date) => {
    const rows = await prisma.$queryRawUnsafe<ShiftRow[]>(
      `SELECT "id","employeeId","startTime","endTime","code","location","latitude","longitude","geofenceRadiusMeters"
       FROM "TimeAttendanceShift"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3 AND "status"='PUBLISHED'
         AND "startTime" <= $4 + INTERVAL '60 minutes' AND "endTime" >= $4 - INTERVAL '120 minutes'
       ORDER BY ABS(EXTRACT(EPOCH FROM ("startTime"-$4))) LIMIT 1`,
      auth.organizationId,
      access.legalEntityId,
      auth.userId,
      at,
    );
    return rows[0] || null;
  };

  const validate = async (
    auth: AuthContext,
    access: EntityAccessContext,
    gps: z.infer<typeof gpsSchema>,
    at = new Date(),
  ) => {
    await requireEmployment(auth, access, auth.userId);
    const shift = await findShift(auth, access, at);
    if (!shift) return {
      allowed: false,
      code: 'OUTSIDE_SCHEDULE',
      message: 'You are not within an assigned shift window. Regular clocking is unavailable. Please submit an Add Clock In/Out request for administrator review.',
      shift: null,
    };
    if (shift.latitude == null || shift.longitude == null) return {
      allowed: false,
      code: 'LOCATION_NOT_CONFIGURED',
      message: 'The GPS work location has not been configured for this shift. Please submit an Add Clock In/Out request for administrator review.',
      shift,
    };
    const distance = Math.round(distanceMeters(gps.latitude, gps.longitude, Number(shift.latitude), Number(shift.longitude)));
    const radius = Math.max(50, Number(shift.geofenceRadiusMeters || 250));
    const effectiveDistance = Math.max(0, distance - Number(gps.accuracyMeters || 0));
    if (effectiveDistance > radius) return {
      allowed: false,
      code: 'TOO_FAR',
      message: `You are approximately ${distance} meters from your assigned work area and cannot clock in or out here. Move closer to ${shift.location || 'the assigned location'} or submit an Add Clock In/Out request for administrator review.`,
      distanceMeters: distance,
      radiusMeters: radius,
      shift,
    };
    return { allowed: true, code: 'ALLOWED', message: 'Location and schedule verified.', distanceMeters: distance, radiusMeters: radius, shift };
  };

  app.post('/api/time-attendance/clock/validate', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const gps = gpsSchema.parse(req.body);
      res.json({ data: await validate(auth, access, gps) });
    } catch (error) { next(error); }
  });

  app.post('/api/time-attendance/clock/geofenced-in', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const gps = gpsSchema.parse(req.body);
      const check = await validate(auth, access, gps);
      if (!check.allowed) return void res.status(403).json({ error: check.message, code: check.code, data: check });
      const open = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "TimeAttendanceClockEntry"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3 AND "clockOut" IS NULL LIMIT 1`,
        auth.organizationId, access.legalEntityId, auth.userId,
      );
      if (open[0]) return void res.status(409).json({ error: 'You are already clocked in' });
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "TimeAttendanceClockEntry" (
           "id","organizationId","legalEntityId","employeeId","shiftId","clockIn","source",
           "clockInLatitude","clockInLongitude","clockInAccuracyMeters","clockInDistanceMeters"
         ) VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9,$10)`,
        id, auth.organizationId, access.legalEntityId, auth.userId, check.shift?.id || null,
        gps.source, gps.latitude, gps.longitude, gps.accuracyMeters, check.distanceMeters || 0,
      );
      res.status(201).json({ data: { id, clockedIn: true, verification: check } });
    } catch (error) { next(error); }
  });

  app.post('/api/time-attendance/clock/geofenced-out', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId);
      const gps = gpsSchema.parse(req.body);
      const open = await prisma.$queryRawUnsafe<any[]>(
        `SELECT clock_entry.*,shift_row."latitude" AS "shiftLatitude",shift_row."longitude" AS "shiftLongitude",
                shift_row."geofenceRadiusMeters",shift_row."location"
         FROM "TimeAttendanceClockEntry" clock_entry
         LEFT JOIN "TimeAttendanceShift" shift_row
           ON shift_row."organizationId"=clock_entry."organizationId" AND shift_row."legalEntityId"=clock_entry."legalEntityId"
          AND shift_row."id"=clock_entry."shiftId"
         WHERE clock_entry."organizationId"=$1 AND clock_entry."legalEntityId"=$2
           AND clock_entry."employeeId"=$3 AND clock_entry."clockOut" IS NULL
         ORDER BY clock_entry."clockIn" DESC LIMIT 1`,
        auth.organizationId, access.legalEntityId, auth.userId,
      );
      if (!open[0]) return void res.status(409).json({ error: 'You are not clocked in' });
      const row = open[0];
      if (row.shiftLatitude == null || row.shiftLongitude == null) {
        return void res.status(403).json({
          error: 'The assigned work location cannot be verified. Please submit an Add Clock Out request for administrator review.',
          code: 'LOCATION_NOT_CONFIGURED',
        });
      }
      const distance = Math.round(distanceMeters(gps.latitude, gps.longitude, Number(row.shiftLatitude), Number(row.shiftLongitude)));
      const radius = Math.max(50, Number(row.geofenceRadiusMeters || 250));
      if (Math.max(0, distance - gps.accuracyMeters) > radius) {
        return void res.status(403).json({
          error: `You are approximately ${distance} meters from your assigned work area and cannot clock out here. Return to ${row.location || 'the assigned location'} or submit an Add Clock Out request for administrator review.`,
          code: 'TOO_FAR',
          data: { distanceMeters: distance, radiusMeters: radius },
        });
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "TimeAttendanceClockEntry" SET
           "clockOut"=NOW(),"status"='COMPLETED',"clockOutLatitude"=$1,"clockOutLongitude"=$2,
           "clockOutAccuracyMeters"=$3,"clockOutDistanceMeters"=$4,"updatedAt"=NOW()
         WHERE "id"=$5 AND "organizationId"=$6 AND "legalEntityId"=$7 RETURNING *`,
        gps.latitude, gps.longitude, gps.accuracyMeters, distance, row.id, auth.organizationId, access.legalEntityId,
      );
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/time-attendance/manual-punch-requests', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId);
      const input = manualSchema.parse(req.body);
      if (input.shiftId) await requireEmployeeShift(auth, access, input.shiftId, auth.userId);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "TimeAttendanceManualPunchRequest" (
           "id","organizationId","legalEntityId","employeeId","shiftId","punchType","requestedAt","reason",
           "latitude","longitude","accuracyMeters"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        id, auth.organizationId, access.legalEntityId, auth.userId, input.shiftId || null, input.punchType,
        input.requestedAt, input.reason, input.latitude ?? null, input.longitude ?? null, input.accuracyMeters ?? null,
      );
      res.status(201).json({ data: { id, status: 'PENDING' } });
    } catch (error) { next(error); }
  });

  app.get('/api/time-attendance/manual-punch-requests', async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      await requireEmployment(auth, access, auth.userId);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "TimeAttendanceManualPunchRequest"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3 ORDER BY "createdAt" DESC`,
        auth.organizationId, access.legalEntityId, auth.userId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/time-attendance/shifts/:id/geofence', admin, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const input = geofenceSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "TimeAttendanceShift" SET
           "latitude"=$1,"longitude"=$2,"geofenceRadiusMeters"=$3,"location"=$4,"updatedAt"=NOW()
         WHERE "id"=$5 AND "organizationId"=$6 AND "legalEntityId"=$7 RETURNING *`,
        input.latitude, input.longitude, input.geofenceRadiusMeters, input.location,
        req.params.id, auth.organizationId, access.legalEntityId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Shift not found' });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/time-attendance/manual-punch-requests', admin, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT request_row.*,COALESCE(credential."displayName",user_row."email",request_row."employeeId") AS "employeeName",
                shift_row."code" AS "shiftCode",shift_row."location" AS "shiftLocation"
         FROM "TimeAttendanceManualPunchRequest" request_row
         LEFT JOIN "User" user_row ON user_row."organizationId"=request_row."organizationId" AND user_row."id"=request_row."employeeId"
         LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
         LEFT JOIN "TimeAttendanceShift" shift_row
           ON shift_row."organizationId"=request_row."organizationId" AND shift_row."legalEntityId"=request_row."legalEntityId"
          AND shift_row."id"=request_row."shiftId"
         WHERE request_row."organizationId"=$1 AND request_row."legalEntityId"=$2
         ORDER BY CASE WHEN request_row."status"='PENDING' THEN 0 ELSE 1 END,request_row."createdAt" DESC LIMIT 500`,
        auth.organizationId, access.legalEntityId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/time-attendance/manual-punch-requests/:id', admin, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const status = z.enum(['APPROVED', 'DENIED']).parse(req.body?.status);
      const notes = z.string().trim().max(2000).optional().default('').parse(req.body?.reviewNotes);
      const requests = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "TimeAttendanceManualPunchRequest"
         WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3 LIMIT 1`,
        req.params.id, auth.organizationId, access.legalEntityId,
      );
      const item = requests[0];
      if (!item) return void res.status(404).json({ error: 'Request not found' });
      if (item.status !== 'PENDING') return void res.status(409).json({ error: 'Request has already been reviewed' });
      if (status === 'APPROVED') {
        await requireEmployment(auth, access, item.employeeId);
        if (item.punchType === 'CLOCK_IN') {
          const open = await prisma.$queryRawUnsafe<any[]>(
            `SELECT "id" FROM "TimeAttendanceClockEntry"
             WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3 AND "clockOut" IS NULL LIMIT 1`,
            auth.organizationId, access.legalEntityId, item.employeeId,
          );
          if (open[0]) return void res.status(409).json({ error: 'Employee already has an open clock entry' });
          await prisma.$executeRawUnsafe(
            `INSERT INTO "TimeAttendanceClockEntry" (
               "id","organizationId","legalEntityId","employeeId","shiftId","clockIn","source","status","notes"
             ) VALUES ($1,$2,$3,$4,$5,$6,'ADMIN_APPROVED','OPEN',$7)`,
            randomUUID(), auth.organizationId, access.legalEntityId, item.employeeId, item.shiftId,
            item.requestedAt, `Approved manual punch: ${item.reason}`,
          );
        } else {
          const rows = await prisma.$queryRawUnsafe<any[]>(
            `UPDATE "TimeAttendanceClockEntry" SET
               "clockOut"=$1,"status"='COMPLETED',"notes"=CONCAT("notes",$2),"updatedAt"=NOW()
             WHERE "id"=(SELECT "id" FROM "TimeAttendanceClockEntry"
               WHERE "organizationId"=$3 AND "legalEntityId"=$4 AND "employeeId"=$5 AND "clockOut" IS NULL
               ORDER BY "clockIn" DESC LIMIT 1) RETURNING "id"`,
            item.requestedAt, ` | Approved manual clock out: ${item.reason}`,
            auth.organizationId, access.legalEntityId, item.employeeId,
          );
          if (!rows[0]) return void res.status(409).json({ error: 'Employee has no open clock entry to close' });
        }
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "TimeAttendanceManualPunchRequest" SET
           "status"=$1,"reviewedById"=$2,"reviewedAt"=NOW(),"reviewNotes"=$3,"updatedAt"=NOW()
         WHERE "id"=$4 AND "organizationId"=$5 AND "legalEntityId"=$6 RETURNING *`,
        status, auth.userId, notes, item.id, auth.organizationId, access.legalEntityId,
      );
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });
};
