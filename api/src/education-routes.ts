import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { entityAccessOf, requireEntityManageAccess } from './entity-access.js';
import { educationCourseAssessments } from './education-course-assessments.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole; ipAddress?: string; userAgent?: string };
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

const completionSchema = z.object({
  courseCode: z.string().trim().min(1).max(120),
  courseVersion: z.string().trim().min(1).max(40),
  moduleAcknowledgements: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
  answers: z.array(z.object({
    questionId: z.string().trim().min(1).max(80),
    choiceIndex: z.number().int().min(0).max(20),
  })).min(1).max(50),
  attested: z.literal(true),
});

const requireEducationAccess = (access: ReturnType<typeof entityAccessOf>) => {
  if (!access.capabilities.includes('EDUCATION')) {
    throw Object.assign(new Error(`Education is not enabled for ${access.legalEntityName}`), { status: 409 });
  }
};

const addUtcMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
};

const certificateNumber = (completedAt: Date) =>
  `SUL-${completedAt.getUTCFullYear()}-${randomBytes(6).toString('hex').toUpperCase()}`;

export function registerEducationRoutes(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;

  app.get('/api/education/health', (_req, res) => res.json({ data: { service: 'education', status: 'ready' } }));

  app.get('/api/education/my-assignments', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEducationAccess(access);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT assignment."id",assignment."courseCode",assignment."title",assignment."status",assignment."dueDate",assignment."reason",
                assignment."assignedAt",assignment."startedAt",assignment."completedAt",assignment."expiresAt",
                assignment."scorePercent",assignment."attemptCount",
                CASE WHEN assignment."status"='IN_PROGRESS' THEN 50 ELSE 0 END AS "progressPercent",
                CASE WHEN assignment."status"='IN_PROGRESS' THEN 'Assessment started' ELSE 'Ready to begin' END AS "currentActivity",
                assignment."legalEntityId",entity."code" AS "legalEntityCode",entity."displayName" AS "legalEntityName"
         FROM "EducationAssignment" assignment
         JOIN "LegalEntity" entity ON entity."organizationId"=assignment."organizationId" AND entity."id"=assignment."legalEntityId"
         WHERE assignment."organizationId"=$1 AND assignment."legalEntityId"=$3 AND assignment."employeeId"=$2
           AND assignment."status"<>'COMPLETED'
         ORDER BY assignment."dueDate" ASC NULLS LAST, assignment."assignedAt" DESC`,
        auth.organizationId, auth.userId, access.legalEntityId);
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/education/my-completions', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEducationAccess(access);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT assignment."id",assignment."courseCode",assignment."title",assignment."completedAt",assignment."expiresAt",
                assignment."scorePercent",assignment."certificateNumber",assignment."attemptCount",assignment."completionEvidence",
                assignment."legalEntityId",entity."code" AS "legalEntityCode",entity."displayName" AS "legalEntityName"
         FROM "EducationAssignment" assignment
         JOIN "LegalEntity" entity ON entity."organizationId"=assignment."organizationId" AND entity."id"=assignment."legalEntityId"
         WHERE assignment."organizationId"=$1 AND assignment."legalEntityId"=$3 AND assignment."employeeId"=$2
           AND assignment."status"='COMPLETED'
         ORDER BY assignment."completedAt" DESC`, auth.organizationId, auth.userId, access.legalEntityId);
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/education/completions', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEducationAccess(access);
      const input = completionSchema.parse(req.body);
      const assessment = educationCourseAssessments[input.courseCode];
      if (!assessment) return void res.status(404).json({ error: 'This approved course is not available.' });
      if (input.courseVersion !== assessment.version) {
        return void res.status(409).json({ error: 'This course was updated. Reload it before submitting the assessment.' });
      }
      const acknowledged = new Set(input.moduleAcknowledgements);
      if (assessment.requiredModuleIds.some((moduleId) => !acknowledged.has(moduleId))) {
        return void res.status(400).json({ error: 'Review and acknowledge every learning module before submitting.' });
      }
      const submittedAnswers = new Map(input.answers.map((answer) => [answer.questionId, answer.choiceIndex]));
      const questionIds = Object.keys(assessment.correctAnswers);
      if (submittedAnswers.size !== questionIds.length || questionIds.some((questionId) => !submittedAnswers.has(questionId))) {
        return void res.status(400).json({ error: 'Answer every assessment question before submitting.' });
      }
      const correctCount = questionIds.filter((questionId) => submittedAnswers.get(questionId) === assessment.correctAnswers[questionId]).length;
      const scorePercent = Math.round(correctCount / questionIds.length * 100);
      const passed = scorePercent >= assessment.requiredScorePercent;
      const completedAt = new Date();
      const expiresAt = passed ? addUtcMonths(completedAt, assessment.validityMonths) : null;
      const issuedCertificateNumber = passed ? certificateNumber(completedAt) : null;
      const evidence = JSON.stringify({
        courseVersion: assessment.version,
        requiredScorePercent: assessment.requiredScorePercent,
        moduleAcknowledgements: [...acknowledged],
        answers: input.answers,
        attested: input.attested,
        passed,
        submittedAt: completedAt.toISOString(),
        ipAddress: auth.ipAddress ?? null,
        userAgent: auth.userAgent ?? null,
      });
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","attemptCount" FROM "EducationAssignment"
         WHERE "organizationId"=$1 AND "legalEntityId"=$4 AND "employeeId"=$2 AND "courseCode"=$3
           AND "status" IN ('ASSIGNED','IN_PROGRESS')
         ORDER BY "assignedAt" DESC LIMIT 1`, auth.organizationId, auth.userId, input.courseCode, access.legalEntityId);
      let id = rows[0]?.id as string | undefined;
      const attemptCount = Number(rows[0]?.attemptCount ?? 0) + 1;
      if (id) {
        await prisma.$executeRawUnsafe(
          `UPDATE "EducationAssignment" SET "status"=$1,"startedAt"=COALESCE("startedAt",NOW()),"completedAt"=$2,
                  "expiresAt"=$3,"scorePercent"=$4,"certificateNumber"=$5,"attemptCount"=$6,
                  "completionEvidence"=$7::jsonb,"title"=$8,"updatedAt"=NOW()
           WHERE "id"=$9 AND "organizationId"=$10 AND "legalEntityId"=$12 AND "employeeId"=$11`,
          passed ? 'COMPLETED' : 'IN_PROGRESS', passed ? completedAt : null, expiresAt, scorePercent,
          issuedCertificateNumber, attemptCount, evidence, assessment.title, id,
          auth.organizationId, auth.userId, access.legalEntityId);
      } else {
        id = randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "EducationAssignment"
           ("id","organizationId","legalEntityId","departmentId","employeeId","courseCode","title","packageCode","status","startedAt","completedAt","scorePercent","expiresAt","certificateNumber","attemptCount","completionEvidence","reason","assignedById","assignedAt","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'CUSTOM',$8,NOW(),$9,$10,$11,$12,1,$13::jsonb,'Employee self-enrolled in approved education',$5,NOW(),NOW(),NOW())`,
          id, auth.organizationId, access.legalEntityId, access.departmentId, auth.userId,
          input.courseCode, assessment.title, passed ? 'COMPLETED' : 'IN_PROGRESS',
          passed ? completedAt : null, scorePercent, expiresAt, issuedCertificateNumber, evidence);
      }
      await audit(auth, passed ? 'COMPLETE_EDUCATION' : 'FAIL_EDUCATION_ASSESSMENT', 'EducationAssignment', id, {
        courseCode: input.courseCode,
        courseVersion: assessment.version,
        legalEntityId: access.legalEntityId,
        scorePercent,
        certificateNumber: issuedCertificateNumber,
        attemptCount,
      });
      if (!passed) {
        return void res.status(422).json({
          error: `A score of ${assessment.requiredScorePercent}% is required. Review the course and try again.`,
          data: { id, courseCode: input.courseCode, status: 'IN_PROGRESS', scorePercent, attemptCount, requiredScorePercent: assessment.requiredScorePercent },
        });
      }
      res.status(201).json({ data: {
        id, courseCode: input.courseCode, title: assessment.title, status: 'COMPLETED', completedAt,
        expiresAt, scorePercent, attemptCount, certificateNumber: issuedCertificateNumber,
        legalEntityId: access.legalEntityId, legalEntityName: access.legalEntityName,
      } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/education/bulk-assign', requireRoles(UserRole.ADMINISTRATOR, UserRole.DOO, UserRole.HR_MANAGER), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEducationAccess(access);
      requireEntityManageAccess(access);
      const input = bulkAssignSchema.parse(req.body);
      const requestedCodes = [...(input.courseCodes ?? []), ...(input.courseCode ? [input.courseCode] : [])];
      const courseCodes = [...new Set(requestedCodes.map((code) => code.trim()).filter(Boolean))];
      if (input.packageCode === 'CUSTOM' && courseCodes.length === 0) return void res.status(400).json({ error: 'Select at least one course.' });
      if (courseCodes.length === 0) return void res.status(400).json({ error: 'This education package does not contain any courses yet.' });
      const unknownCourseCodes = courseCodes.filter((courseCode) => !educationCourseAssessments[courseCode]);
      if (unknownCourseCodes.length) return void res.status(400).json({ error: `Unknown approved education course: ${unknownCourseCodes.join(', ')}` });
      const employeeRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT DISTINCT employment."userId" AS "id",employment."departmentId"
           FROM "Employment" employment
          WHERE employment."organizationId"=$1 AND employment."legalEntityId"=$3
            AND employment."userId"=ANY($2::text[]) AND employment."status"<>'TERMINATED'
            AND ($4::text IS NULL OR employment."departmentId"=$4)`,
        auth.organizationId, input.employeeIds, access.legalEntityId, access.departmentId);
      const employeeIds = employeeRows.map((row) => String(row.id));
      if (employeeIds.length === 0) return void res.status(404).json({ error: 'No matching employees were found.' });
      let assignedCount = 0;
      await prisma.$transaction(async (tx) => {
        for (const employeeId of employeeIds) for (const courseCode of courseCodes) {
          const existing = await tx.$queryRawUnsafe<any[]>(
            `SELECT "id" FROM "EducationAssignment"
              WHERE "organizationId"=$1 AND "legalEntityId"=$4 AND "employeeId"=$2 AND "courseCode"=$3
                AND "status" IN ('ASSIGNED','IN_PROGRESS') LIMIT 1`,
            auth.organizationId, employeeId, courseCode, access.legalEntityId);
          if (existing[0]) continue;
          const assignmentId = randomUUID();
          await tx.$executeRawUnsafe(
            `INSERT INTO "EducationAssignment"
             ("id","organizationId","legalEntityId","departmentId","employeeId","courseCode","title","packageCode","status","dueDate","reason","assignedById","assignedAt","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ASSIGNED',$9,$10,$11,NOW(),NOW(),NOW())`,
            assignmentId, auth.organizationId, access.legalEntityId,
            employeeRows.find((row) => String(row.id) === employeeId)?.departmentId ?? null,
            employeeId, courseCode, educationCourseAssessments[courseCode].title || input.courseTitle || courseCode, input.packageCode,
            input.dueDate ?? null, input.reason ?? 'Required employee education', auth.userId);
          assignedCount += 1;
        }
      });
      await audit(auth, 'BULK_ASSIGN_EDUCATION', 'EducationAssignment', undefined, {
        employeeCount: employeeIds.length, courseCodes, assignedCount, packageCode: input.packageCode,
        dueDate: input.dueDate ?? null, legalEntityId: access.legalEntityId, departmentId: access.departmentId,
      });
      res.status(201).json({ data: { assignedCount, employeesAffected: employeeIds.length, skippedCount: employeeIds.length * courseCodes.length - assignedCount, courseCodes } });
    } catch (error) { next(error); }
  });
}
