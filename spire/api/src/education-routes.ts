import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { registerAuthRecoveryRoutes } from './auth-recovery-routes.js';
import { registerOfferOnboardingRoutes } from './offer-onboarding-routes.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Helpers = {
  authOf: (response: express.Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
  audit: (auth: Partial<AuthContext>, action: string, resourceType: string, resourceId?: string, metadata?: object) => Promise<void>;
};

const bulkAssignSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(1000),
  packageCode: z.enum(['INITIAL', 'ANNUAL', 'CUSTOM']),
  courseCode: z.string().trim().min(1).max(120).nullable().optional(),
  courseCodes: z.array(z.string().trim().min(1).max(120)).max(250).optional(),
  courseTitle: z.string().trim().max(300).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  reason: z.string().trim().max(1000).optional(),
});

const progressSchema = z.object({
  progressPercent: z.number().int().min(0).max(100),
  currentActivity: z.string().trim().max(240).nullable().optional(),
  completed: z.boolean().optional(),
});

export function registerEducationRoutes(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;
  registerAuthRecoveryRoutes(app, prisma);
  registerOfferOnboardingRoutes(app, prisma, helpers);

  app.get('/api/education/my-assignments', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","courseCode","title","status","dueDate","reason","assignedAt","startedAt","completedAt","expiresAt","progressPercent","currentActivity"
         FROM "EducationAssignment"
         WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"<>'COMPLETED'
         ORDER BY "dueDate" ASC NULLS LAST, "assignedAt" DESC`,
        auth.organizationId, auth.userId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/education/my-completions', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","courseCode","title","completedAt","scorePercent","expiresAt","progressPercent","currentActivity"
         FROM "EducationAssignment"
         WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='COMPLETED'
         ORDER BY "completedAt" DESC`,
        auth.organizationId, auth.userId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.patch('/api/education/assignments/:courseCode/progress', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = progressSchema.parse(req.body);
      const courseCode = String(req.params.courseCode || '').trim();
      if (!courseCode) return res.status(400).json({ error: 'Course code is required.' });

      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","status","progressPercent" FROM "EducationAssignment"
         WHERE "organizationId"=$1 AND "employeeId"=$2 AND "courseCode"=$3
           AND "status" IN ('ASSIGNED','IN_PROGRESS')
         ORDER BY "assignedAt" DESC LIMIT 1`,
        auth.organizationId, auth.userId, courseCode,
      );
      const assignment = rows[0];
      if (!assignment) return res.status(404).json({ error: 'Active course assignment not found.' });

      const progressPercent = input.completed ? 100 : Math.max(Number(assignment.progressPercent || 0), input.progressPercent);
      const completed = input.completed || progressPercent >= 100;
      const validityMonths = 12;

      await prisma.$executeRawUnsafe(
        `UPDATE "EducationAssignment"
         SET "status"=$1,
             "progressPercent"=$2,
             "currentActivity"=$3,
             "startedAt"=COALESCE("startedAt",NOW()),
             "completedAt"=CASE WHEN $1='COMPLETED' THEN COALESCE("completedAt",NOW()) ELSE "completedAt" END,
             "expiresAt"=CASE WHEN $1='COMPLETED' THEN COALESCE("expiresAt",NOW()+($4||' months')::interval) ELSE "expiresAt" END,
             "updatedAt"=NOW()
         WHERE "id"=$5`,
        completed ? 'COMPLETED' : 'IN_PROGRESS',
        progressPercent,
        input.currentActivity ?? null,
        String(validityMonths),
        assignment.id,
      );

      await audit(auth, completed ? 'COMPLETE_EDUCATION' : 'UPDATE_EDUCATION_PROGRESS', 'EducationAssignment', assignment.id, {
        courseCode, progressPercent, currentActivity: input.currentActivity ?? null,
      });

      res.json({ data: { id: assignment.id, courseCode, status: completed ? 'COMPLETED' : 'IN_PROGRESS', progressPercent, currentActivity: input.currentActivity ?? null } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/education/bulk-assign', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = bulkAssignSchema.parse(req.body);
      const requestedCodes = [...(input.courseCodes ?? []), ...(input.courseCode ? [input.courseCode] : [])];
      const courseCodes = [...new Set(requestedCodes.map((code) => code.trim()).filter(Boolean))];
      if (input.packageCode === 'CUSTOM' && courseCodes.length === 0) return res.status(400).json({ error: 'Select at least one course.' });
      if (courseCodes.length === 0) return res.status(400).json({ error: 'This education package does not contain any courses yet.' });

      const employeeRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "User" WHERE "organizationId"=$1 AND "id" = ANY($2::text[])`, auth.organizationId, input.employeeIds,
      );
      const employeeIds = employeeRows.map((row) => String(row.id));
      if (employeeIds.length === 0) return res.status(404).json({ error: 'No matching employees were found.' });

      let assignedCount = 0;
      await prisma.$transaction(async (tx) => {
        for (const employeeId of employeeIds) {
          for (const courseCode of courseCodes) {
            const existing = await tx.$queryRawUnsafe<any[]>(
              `SELECT "id" FROM "EducationAssignment"
               WHERE "organizationId"=$1 AND "employeeId"=$2 AND "courseCode"=$3
                 AND "status" IN ('ASSIGNED','IN_PROGRESS') LIMIT 1`,
              auth.organizationId, employeeId, courseCode,
            );
            if (existing[0]) continue;
            const assignmentId = randomUUID();
            await tx.$executeRawUnsafe(
              `INSERT INTO "EducationAssignment"
               ("id","organizationId","employeeId","courseCode","title","packageCode","status","progressPercent","dueDate","reason","assignedById","assignedAt","createdAt","updatedAt")
               VALUES ($1,$2,$3,$4,$5,$6,'ASSIGNED',0,$7,$8,$9,NOW(),NOW(),NOW())`,
              assignmentId, auth.organizationId, employeeId, courseCode, input.courseTitle || courseCode, input.packageCode,
              input.dueDate ?? null, input.reason ?? 'Required employee education', auth.userId,
            );
            assignedCount += 1;
          }
        }
      });

      await audit(auth, 'BULK_ASSIGN_EDUCATION', 'EducationAssignment', undefined, { employeeCount: employeeIds.length, courseCodes, assignedCount, packageCode: input.packageCode, dueDate: input.dueDate ?? null });
      res.status(201).json({ data: { assignedCount, employeesAffected: employeeIds.length, skippedCount: employeeIds.length * courseCodes.length - assignedCount, courseCodes } });
    } catch (error) { next(error); }
  });
}
