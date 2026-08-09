import type { Express, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaClient, UserRole } from '@prisma/client';
import { entityAccessOf } from './entity-access.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole; email?: string };
type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
};

const blockedSchema = z.object({
  punchType: z.enum(['CLOCK_IN', 'CLOCK_OUT']),
  reason: z.string().trim().min(2).max(2000),
  code: z.string().trim().max(80).optional().default('BLOCKED'),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  accuracyMeters: z.number().finite().min(0).max(10_000).optional(),
  shiftId: z.string().trim().optional(),
});

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

export const registerTimeAttendanceExceptionRoutes = ({ app, prisma, authOf, requireRoles }: Dependencies) => {
  const admin = requireRoles(UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HR_MANAGER, UserRole.SCHEDULER, UserRole.CEO, UserRole.COO);

  app.post('/api/time-attendance/clock/blocked-attempt', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const input = blockedSchema.parse(req.body);
      const employment = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "Employment"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 AND "status"='ACTIVE'
           AND "startsAt"<=CURRENT_DATE AND ("endsAt" IS NULL OR "endsAt">=CURRENT_DATE) LIMIT 1`,
        auth.organizationId, access.legalEntityId, auth.userId,
      );
      if (!employment[0]) throw httpError(409, 'Active employment in the selected company is required to use the time clock');
      if (input.shiftId) {
        const shift = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "TimeAttendanceShift"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3
             AND ("employeeId"=$4 OR "employeeId" IS NULL) AND "status"='PUBLISHED' LIMIT 1`,
          auth.organizationId, access.legalEntityId, input.shiftId, auth.userId,
        );
        if (!shift[0]) throw httpError(409, 'The selected shift is not available in the selected company');
      }
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "TimeAttendanceManualPunchRequest" (
           "id","organizationId","legalEntityId","employeeId","shiftId","punchType","requestedAt","reason",
           "latitude","longitude","accuracyMeters","status","reviewNotes"
         ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9,$10,'PENDING',$11)`,
        id, auth.organizationId, access.legalEntityId, auth.userId, input.shiftId || null, input.punchType,
        `Automatic blocked attempt [${input.code}]: ${input.reason}`,
        input.latitude ?? null, input.longitude ?? null, input.accuracyMeters ?? null,
        'Employee was prevented from using regular clocking. Review the exception and instruct the employee to submit an exact Add Clock request if needed.',
      );
      res.status(201).json({ data: { id, status: 'PENDING' } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/time-attendance/blocked-attempts', admin, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT request_row.*,COALESCE(credential."displayName",user_row."email",request_row."employeeId") AS "employeeName"
         FROM "TimeAttendanceManualPunchRequest" request_row
         LEFT JOIN "User" user_row ON user_row."organizationId"=request_row."organizationId" AND user_row."id"=request_row."employeeId"
         LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
         WHERE request_row."organizationId"=$1 AND request_row."legalEntityId"=$2
           AND request_row."reason" LIKE 'Automatic blocked attempt%'
         ORDER BY request_row."createdAt" DESC LIMIT 500`,
        auth.organizationId, access.legalEntityId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });
};
