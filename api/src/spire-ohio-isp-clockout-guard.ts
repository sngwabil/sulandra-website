import type { Express, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { entityAccessOf } from './entity-access.js';
import type { UserRole } from '@prisma/client';

type AuthContext = { userId: string; organizationId: string; role: UserRole; email?: string };
type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
};

export const registerSpireOhioIspClockOutGuard = ({ app, prisma, authOf }: Dependencies) => {
  app.post('/api/time-attendance/clock/geofenced-out', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const entities = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
        `SELECT "code" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
        auth.organizationId, access.legalEntityId,
      );
      if (entities[0]?.code !== 'SCLS') return void next();

      let clocks: Array<Record<string, unknown>>;
      try {
        clocks = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT c."id",c."shiftId",c."clockIn",s."endTime" AS "shiftEndTime",s."clientId" AS "shiftClientId"
             FROM "TimeAttendanceClockEntry" c
             LEFT JOIN "TimeAttendanceShift" s
               ON s."organizationId"=c."organizationId" AND s."legalEntityId"=c."legalEntityId" AND s."id"=c."shiftId"
            WHERE c."organizationId"=$1 AND c."legalEntityId"=$2 AND c."employeeId"=$3 AND c."clockOut" IS NULL
            ORDER BY c."clockIn" DESC LIMIT 1`,
          auth.organizationId, access.legalEntityId, auth.userId,
        );
      } catch (error: any) {
        if (error?.code === '42P01' || String(error?.message || '').includes('does not exist')) return void next();
        throw error;
      }
      const clock = clocks[0];
      if (!clock) return void next();
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT t."id",t."title",t."dueAt",t."clientId",s."title" AS "supportTitle",o."title" AS "outcomeTitle"
           FROM "SpireOhioIspSupportTaskBinding" b
           JOIN "SpireOhioIspSupport" s ON s."id"=b."supportId" AND s."status"='ACTIVE'
           JOIN "SpireOhioIspPlan" p ON p."id"=s."ohioIspPlanId" AND p."status"='ACTIVE'
           LEFT JOIN "SpireOhioIspOutcome" o ON o."id"=s."outcomeId"
           JOIN "SpireClinicalTask" t ON t."id"=b."taskId"
           LEFT JOIN "SpireOhioIspTaskException" x ON x."taskId"=t."id" AND x."clockEntryId"=$4
          WHERE b."organizationId"=$1 AND b."legalEntityId"=$2
            AND t."assignedUserId"=$3 AND t."status" IN ('OPEN','IN_PROGRESS')
            AND t."dueAt" IS NOT NULL
            AND t."dueAt">=$5::timestamptz
            AND t."dueAt"<=COALESCE($6::timestamptz,NOW())
            AND ($7::text IS NULL OR t."clientId"=$7)
            AND x."id" IS NULL
          ORDER BY t."dueAt",t."title"`,
        auth.organizationId, access.legalEntityId, auth.userId, String(clock.id), clock.clockIn,
        clock.shiftEndTime ?? null, clock.shiftClientId ?? null,
      );
      if (!rows.length) return void next();
      res.status(409).json({
        error: 'Complete the required OhioISP support work or document an exception before clocking out.',
        code: 'OHIO_ISP_TASKS_INCOMPLETE',
        data: {
          clockEntryId: clock.id,
          shiftId: clock.shiftId ?? null,
          tasks: rows.map((row) => ({
            id: row.id,
            title: row.title,
            dueAt: row.dueAt,
            patientId: row.clientId,
            supportTitle: row.supportTitle,
            outcomeTitle: row.outcomeTitle,
          })),
        },
      });
    } catch (error) { next(error); }
  });
};
