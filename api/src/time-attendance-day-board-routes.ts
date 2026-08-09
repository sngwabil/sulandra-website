import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { entityAccessOf } from './entity-access.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
};

const GLOBAL_ROLES = new Set<string>(['ADMINISTRATOR', 'PROGRAM_MANAGER', 'HR_MANAGER', 'SCHEDULER', 'CEO', 'DOO']);
const VIEW_ROLES = [
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HR_MANAGER, UserRole.SCHEDULER,
  UserRole.CEO, UserRole.DOO, UserRole.HOUSE_MANAGER, UserRole.AUDITOR,
] as const;

const parseDate = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const start = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { raw, start, end };
};

const ensureColumns = async (prisma: PrismaClient) => {
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "legalEntityId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "locationId" TEXT`);
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
};

export const registerTimeAttendanceDayBoardRoutes = ({ app, prisma, authOf, requireRoles }: Dependencies) => {
  let readyPromise: Promise<void> | null = null;
  const ready = () => readyPromise ??= ensureColumns(prisma).catch((error) => { readyPromise = null; throw error; });
  const gate = requireRoles(...VIEW_ROLES);

  app.get('/api/admin/time-attendance/day-board', gate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const requested = parseDate(req.query.date) || parseDate(new Date().toISOString().slice(0, 10));
      if (!requested) return void res.status(400).json({ error: 'Date must use YYYY-MM-DD' });
      const global = GLOBAL_ROLES.has(String(auth.role));

      const locations = global
        ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT location_row.* FROM "TimeAttendanceLocation" location_row
           WHERE location_row."organizationId"=$1 AND location_row."legalEntityId"=$2 AND location_row."active"=TRUE
           ORDER BY CASE WHEN LOWER(location_row."name")='office' THEN 1 ELSE 0 END,location_row."name"`,
          auth.organizationId, access.legalEntityId,
        )
        : await prisma.$queryRawUnsafe<any[]>(
          `SELECT DISTINCT location_row.* FROM "TimeAttendanceLocation" location_row
           JOIN "TimeAttendanceLocationAssignment" assignment
             ON assignment."organizationId"=location_row."organizationId"
            AND assignment."legalEntityId"=location_row."legalEntityId"
            AND assignment."locationId"=location_row."id"
           WHERE location_row."organizationId"=$1 AND location_row."legalEntityId"=$2 AND location_row."active"=TRUE
             AND assignment."employeeId"=$3 AND assignment."active"=TRUE
             AND (assignment."isManager"=TRUE OR $4='AUDITOR')
           ORDER BY location_row."name"`,
          auth.organizationId, access.legalEntityId, auth.userId, String(auth.role),
        );
      const locationIds = locations.map((row) => String(row.id));

      const shiftProjection = `SELECT shift_row.*,
        COALESCE(NULLIF(credential."displayName",''),NULLIF(profile."displayName",''),user_row."email",'Open shift') AS "employeeName",
        user_row."email" AS "employeeEmail",user_row."role"::text AS "role",
        COALESCE(profile."department",shift_row."department",'') AS "employeeDepartment",
        COALESCE(location_row."name",NULLIF(shift_row."location",''),'Unassigned location') AS "locationName",
        COALESCE(location_row."address",'') AS "locationAddress"
        FROM "TimeAttendanceShift" shift_row
        LEFT JOIN "User" user_row ON user_row."id"=shift_row."employeeId" AND user_row."organizationId"=shift_row."organizationId"
        LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
        LEFT JOIN "EmployeeManagementProfile" profile ON profile."userId"=user_row."id" AND profile."organizationId"=shift_row."organizationId"
        LEFT JOIN "TimeAttendanceLocation" location_row
          ON location_row."id"=shift_row."locationId" AND location_row."organizationId"=shift_row."organizationId"
         AND location_row."legalEntityId"=shift_row."legalEntityId"`;
      const shifts = global
        ? await prisma.$queryRawUnsafe<any[]>(
          `${shiftProjection}
           WHERE shift_row."organizationId"=$1 AND shift_row."legalEntityId"=$2
             AND shift_row."startTime"<$4 AND shift_row."endTime">$3
           ORDER BY COALESCE(location_row."name",shift_row."location"),shift_row."startTime"`,
          auth.organizationId, access.legalEntityId, requested.start, requested.end,
        )
        : locationIds.length
          ? await prisma.$queryRawUnsafe<any[]>(
            `${shiftProjection}
             WHERE shift_row."organizationId"=$1 AND shift_row."legalEntityId"=$2
               AND shift_row."locationId"=ANY($3::text[]) AND shift_row."startTime"<$5 AND shift_row."endTime">$4
             ORDER BY COALESCE(location_row."name",shift_row."location"),shift_row."startTime"`,
            auth.organizationId, access.legalEntityId, locationIds, requested.start, requested.end,
          )
          : [];

      const clockProjection = `SELECT clock_entry.*,
        COALESCE(NULLIF(credential."displayName",''),NULLIF(profile."displayName",''),user_row."email",clock_entry."employeeId") AS "employeeName",
        user_row."role"::text AS "role",COALESCE(profile."department",'') AS "employeeDepartment",
        COALESCE(location_row."name",NULLIF(shift_row."location",''),'Unassigned location') AS "locationName",
        COALESCE(location_row."address",'') AS "locationAddress"
        FROM "TimeAttendanceClockEntry" clock_entry
        LEFT JOIN "User" user_row ON user_row."id"=clock_entry."employeeId" AND user_row."organizationId"=clock_entry."organizationId"
        LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
        LEFT JOIN "EmployeeManagementProfile" profile ON profile."userId"=user_row."id" AND profile."organizationId"=clock_entry."organizationId"
        LEFT JOIN "TimeAttendanceShift" shift_row
          ON shift_row."id"=clock_entry."shiftId" AND shift_row."organizationId"=clock_entry."organizationId"
         AND shift_row."legalEntityId"=clock_entry."legalEntityId"
        LEFT JOIN "TimeAttendanceLocation" location_row
          ON location_row."id"=shift_row."locationId" AND location_row."organizationId"=clock_entry."organizationId"
         AND location_row."legalEntityId"=clock_entry."legalEntityId"`;
      const clockEntries = global
        ? await prisma.$queryRawUnsafe<any[]>(
          `${clockProjection}
           WHERE clock_entry."organizationId"=$1 AND clock_entry."legalEntityId"=$2
             AND clock_entry."clockIn"<$4 AND COALESCE(clock_entry."clockOut",NOW())>=$3
           ORDER BY clock_entry."clockIn"`,
          auth.organizationId, access.legalEntityId, requested.start, requested.end,
        )
        : locationIds.length
          ? await prisma.$queryRawUnsafe<any[]>(
            `${clockProjection}
             WHERE clock_entry."organizationId"=$1 AND clock_entry."legalEntityId"=$2
               AND shift_row."locationId"=ANY($3::text[])
               AND clock_entry."clockIn"<$5 AND COALESCE(clock_entry."clockOut",NOW())>=$4
             ORDER BY clock_entry."clockIn"`,
            auth.organizationId, access.legalEntityId, locationIds, requested.start, requested.end,
          )
          : [];

      const clocksByShift = new Map<string, any>();
      const openByEmployee = new Map<string, any>();
      for (const entry of clockEntries) {
        if (entry.shiftId) clocksByShift.set(String(entry.shiftId), entry);
        if (!entry.clockOut) openByEmployee.set(String(entry.employeeId), entry);
      }

      const now = Date.now();
      const rows = shifts.map((shift) => {
        const clock = clocksByShift.get(String(shift.id))
          || (shift.employeeId ? openByEmployee.get(String(shift.employeeId)) : null)
          || null;
        const start = new Date(shift.startTime).getTime();
        const end = new Date(shift.endTime).getTime();
        const status = clock && !clock.clockOut
          ? 'CLOCKED_IN'
          : clock?.clockOut
            ? 'COMPLETED'
            : now < start
              ? 'UPCOMING'
              : now > end
                ? 'MISSED_OR_UNRECORDED'
                : 'SCHEDULED_NOW';
        return { ...shift, clock, status };
      });

      const scheduledEmployeeIds = new Set(rows.map((row) => row.employeeId).filter(Boolean).map(String));
      const unscheduledClockedIn = clockEntries
        .filter((entry) => !entry.clockOut && !scheduledEmployeeIds.has(String(entry.employeeId)))
        .map((entry) => ({ ...entry, status: 'CLOCKED_IN_UNSCHEDULED' }));
      const metrics = {
        locations: locations.length,
        scheduledShifts: rows.length,
        clockedIn: clockEntries.filter((entry) => !entry.clockOut).length,
        upcoming: rows.filter((row) => row.status === 'UPCOMING').length,
        completed: rows.filter((row) => row.status === 'COMPLETED').length,
        exceptions: rows.filter((row) => row.status === 'MISSED_OR_UNRECORDED').length + unscheduledClockedIn.length,
      };
      res.json({ data: { date: requested.raw, locations, rows, unscheduledClockedIn, metrics, generatedAt: new Date().toISOString() } });
    } catch (error) { next(error); }
  });
};
