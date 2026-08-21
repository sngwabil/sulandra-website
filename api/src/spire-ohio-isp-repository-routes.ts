import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  legalEntityId?: string;
  enterpriseOwner?: boolean;
};
type Dependencies = {
  authOf: (response: express.Response) => AuthContext;
  audit?: (auth: Partial<AuthContext>, action: string, resourceType: string, resourceId?: string, metadata?: object) => Promise<void>;
};

const roles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.AUDITOR, UserRole.DSP,
  UserRole.DELEGATING_NURSE, UserRole.LPN, UserRole.RN, UserRole.HOUSE_MANAGER,
  UserRole.BILLING_SPECIALIST, UserRole.CEO, UserRole.DOO,
]);
const planWriters = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.DELEGATING_NURSE,
  UserRole.LPN, UserRole.RN, UserRole.HOUSE_MANAGER, UserRole.CEO, UserRole.DOO,
]);
const elevated = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.AUDITOR,
  UserRole.DELEGATING_NURSE, UserRole.RN, UserRole.CEO, UserRole.DOO,
  UserRole.BILLING_SPECIALIST,
]);
const owner = (a: AuthContext) => a.enterpriseOwner === true || String(a.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';
const entity = (a: AuthContext) => {
  if (!a.legalEntityId) throw Object.assign(new Error('Select Sulandra Community Living Services (SCLS)'), { status: 409 });
  return a.legalEntityId;
};
const httpError = (status: number, message: string, details?: unknown) => Object.assign(new Error(message), { status, details });
const text = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';

const documentSchema = z.object({
  documentId: z.string().trim().min(1).max(120),
  documentVersion: z.coerce.number().int().positive().optional(),
  documentRole: z.enum(['ACTIVE_PLAN', 'SOURCE_ATTACHMENT', 'SIGNATURE_ATTACHMENT', 'ASSESSMENT_ATTACHMENT']),
  supersedesLinkId: z.string().trim().max(120).optional().nullable(),
});
const versionSchema = z.object({ reason: z.string().trim().min(3).max(2000) });
const exceptionSchema = z.object({ reason: z.string().trim().min(10).max(5000) });

async function ensureScls(prisma: PrismaClient, a: AuthContext) {
  if (!roles.has(a.role) && !owner(a)) throw httpError(403, 'OhioISP repository access is required');
  const rows = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
    `SELECT "code" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, a.organizationId, entity(a),
  );
  if (rows[0]?.code !== 'SCLS') throw httpError(409, 'Select Sulandra Community Living Services (SCLS)');
}
async function patientAllowed(prisma: PrismaClient, a: AuthContext, patientId: string) {
  await ensureScls(prisma, a);
  if (owner(a) || elevated.has(a.role)) return;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
      SELECT 1 FROM "SpireEmployeeClientAssignment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 AND "clientId"=$4
      UNION ALL
      SELECT 1 FROM "SpirePatientHomeAssignment" p JOIN "SpireEmployeeHomeAssignment" h
        ON h."organizationId"=p."organizationId" AND h."legalEntityId"=p."legalEntityId" AND h."homeId"=p."homeId"
       WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND h."userId"=$3 AND p."patientId"=$4
         AND (p."endsAt" IS NULL OR p."endsAt">NOW())
    ) AS allowed`, a.organizationId, entity(a), a.userId, patientId,
  );
  if (!rows[0]?.allowed) throw httpError(403, 'This individual is outside your assigned SCLS scope');
}
function ensurePlanWriter(a: AuthContext) {
  if (a.role === UserRole.AUDITOR || (!owner(a) && !planWriters.has(a.role))) throw httpError(403, 'OhioISP repository changes require plan-team access');
}
async function plan(prisma: PrismaClient, a: AuthContext, patientId: string, carePlanId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT o.* FROM "SpireOhioIspPlan" o
      JOIN "SpireCarePlan" p ON p."organizationId"=o."organizationId" AND p."legalEntityId"=o."legalEntityId"
       AND p."patientId"=o."patientId" AND p."id"=o."carePlanId"
     WHERE o."organizationId"=$1 AND o."legalEntityId"=$2 AND o."patientId"=$3 AND o."carePlanId"=$4 LIMIT 1`,
    a.organizationId, entity(a), patientId, carePlanId,
  );
  if (!rows[0]) throw httpError(404, 'OhioISP profile was not found for this Care Plan / ISP');
  return rows[0];
}
async function ohioEvent(
  prisma: PrismaClient, a: AuthContext, patientId: string, planId: string,
  resourceType: string, resourceId: string, eventType: string, afterValue: unknown,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireOhioIspEvent"(
      "organizationId","legalEntityId","patientId","ohioIspPlanId","resourceType","resourceId","eventType","actorUserId","actorEmail","afterValue"
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    a.organizationId, entity(a), patientId, planId, resourceType, resourceId, eventType, a.userId, a.email ?? null, JSON.stringify(afterValue ?? {}),
  );
}

async function snapshot(prisma: PrismaClient, a: AuthContext, patientId: string, profile: Record<string, unknown>, reason: string) {
  const planId = String(profile.id);
  const [domains, outcomes, supports, documents, signatures] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspAssessmentDomain" WHERE "ohioIspPlanId"=$1 ORDER BY "domainCode"`, planId),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspOutcome" WHERE "ohioIspPlanId"=$1 ORDER BY "sequence","createdAt"`, planId),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspSupport" WHERE "ohioIspPlanId"=$1 ORDER BY "createdAt"`, planId),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspPlanDocumentLink" WHERE "ohioIspPlanId"=$1 ORDER BY "linkedAt"`, planId),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspSignatureLink" WHERE "ohioIspPlanId"=$1 ORDER BY "signedAt"`, planId),
  ]);
  const nextRows = await prisma.$queryRawUnsafe<Array<{ next: number }>>(
    `SELECT COALESCE(MAX("version"),0)::int+1 AS next FROM "SpireOhioIspPlanVersion" WHERE "ohioIspPlanId"=$1`, planId,
  );
  const version = Number(nextRows[0]?.next || 1);
  const snapshotValue = { profile, domains, outcomes, supports, documents, signatures };
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `INSERT INTO "SpireOhioIspPlanVersion"(
      "organizationId","legalEntityId","patientId","ohioIspPlanId","version","sourcePlanVersion","snapshot","reason","createdByUserId"
    ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`,
    a.organizationId, entity(a), patientId, planId, version, profile.sourcePlanVersion ?? null, JSON.stringify(snapshotValue), reason, a.userId,
  );
  await ohioEvent(prisma, a, patientId, planId, 'PLAN_VERSION', String(rows[0].id), 'SNAPSHOT_CREATED', { version, reason });
  return rows[0];
}

export const registerSpireOhioIspRepositoryRoutes = (app: express.Express, prisma: PrismaClient, deps: Dependencies) => {
  const { authOf, audit } = deps;

  app.get('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/repository', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await patientAllowed(prisma, a, patientId);
      const profile = await plan(prisma, a, patientId, req.params.carePlanId), planId = String(profile.id);
      const [versions, documents, signatures, exceptions] = await Promise.all([
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT "id","version","sourcePlanVersion","reason","createdByUserId","createdAt" FROM "SpireOhioIspPlanVersion" WHERE "ohioIspPlanId"=$1 ORDER BY "version" DESC`, planId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT l.*,d."title",d."mimeType",d."reviewStatus",d."sensitivity" FROM "SpireOhioIspPlanDocumentLink" l LEFT JOIN "SpireClinicalDocument" d ON d."organizationId"=l."organizationId" AND d."patientId"=l."patientId" AND d."id"=l."documentId" WHERE l."ohioIspPlanId"=$1 ORDER BY l."linkedAt" DESC`, planId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspSignatureLink" WHERE "ohioIspPlanId"=$1 ORDER BY "signedAt" DESC`, planId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT x.*,t."title" AS "taskTitle" FROM "SpireOhioIspTaskException" x LEFT JOIN "SpireClinicalTask" t ON t."id"=x."taskId" WHERE x."ohioIspPlanId"=$1 ORDER BY x."createdAt" DESC`, planId),
      ]);
      res.json({ data: { profile, versions, documents, signatures, exceptions } });
    } catch (e) { next(e); }
  });

  app.get('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/repository/versions/:version', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await patientAllowed(prisma, a, patientId);
      const profile = await plan(prisma, a, patientId, req.params.carePlanId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireOhioIspPlanVersion" WHERE "ohioIspPlanId"=$1 AND "version"=$2 LIMIT 1`, String(profile.id), Number(req.params.version),
      );
      if (!rows[0]) throw httpError(404, 'OhioISP repository version was not found');
      res.json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/repository/versions', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, input = versionSchema.parse(req.body);
      await patientAllowed(prisma, a, patientId); ensurePlanWriter(a);
      const profile = await plan(prisma, a, patientId, req.params.carePlanId);
      const row = await snapshot(prisma, a, patientId, profile, input.reason);
      await audit?.(a, 'SNAPSHOT_OHIO_ISP_PLAN', 'SpireOhioIspPlanVersion', String(row.id), { patientId, carePlanId: req.params.carePlanId, version: row.version });
      res.status(201).json({ data: row });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/repository/documents', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, input = documentSchema.parse(req.body);
      await patientAllowed(prisma, a, patientId); ensurePlanWriter(a);
      const profile = await plan(prisma, a, patientId, req.params.carePlanId), planId = String(profile.id);
      const docs = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireClinicalDocument" WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 AND "status"='ACTIVE' LIMIT 1`,
        a.organizationId, patientId, input.documentId,
      );
      if (!docs[0]) throw httpError(409, 'The selected SPIRE document does not belong to this individual');
      const versions = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "version","sha256" FROM "SpireClinicalDocumentVersion" WHERE "organizationId"=$1 AND "documentId"=$2 AND ($3::int IS NULL OR "version"=$3) ORDER BY "version" DESC LIMIT 1`,
        a.organizationId, input.documentId, input.documentVersion ?? null,
      );
      if (!versions[0]) throw httpError(409, 'The selected SPIRE document version was not found');
      if (input.supersedesLinkId) {
        const prior = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "SpireOhioIspPlanDocumentLink" WHERE "ohioIspPlanId"=$1 AND "id"=$2 LIMIT 1`, planId, input.supersedesLinkId);
        if (!prior[0]) throw httpError(409, 'The superseded OhioISP document link was not found in this plan');
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireOhioIspPlanDocumentLink"(
          "organizationId","legalEntityId","patientId","ohioIspPlanId","documentId","documentVersion","documentSha256","documentRole","sourcePlanVersion","supersedesLinkId","linkedByUserId"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT ("ohioIspPlanId","documentId","documentVersion","documentRole") DO NOTHING RETURNING *`,
        a.organizationId, entity(a), patientId, planId, input.documentId, Number(versions[0].version), versions[0].sha256 ?? null,
        input.documentRole, profile.sourcePlanVersion ?? null, input.supersedesLinkId ?? null, a.userId,
      );
      if (!rows[0]) {
        const existing = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspPlanDocumentLink" WHERE "ohioIspPlanId"=$1 AND "documentId"=$2 AND "documentVersion"=$3 AND "documentRole"=$4 LIMIT 1`, planId, input.documentId, Number(versions[0].version), input.documentRole);
        return void res.json({ data: existing[0], idempotent: true });
      }
      await ohioEvent(prisma, a, patientId, planId, 'PLAN_DOCUMENT', String(rows[0].id), 'LINKED', rows[0]);
      let planVersion: Record<string, unknown> | null = null;
      if (input.documentRole === 'ACTIVE_PLAN') planVersion = await snapshot(prisma, a, patientId, profile, 'Active OhioISP document linked');
      await audit?.(a, 'LINK_OHIO_ISP_DOCUMENT', 'SpireOhioIspPlanDocumentLink', String(rows[0].id), { patientId, documentId: input.documentId, documentRole: input.documentRole });
      res.status(201).json({ data: rows[0], planVersion });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/ohio-isp/tasks/:taskId/shift-exception', async (req, res, next) => {
    try {
      const a = authOf(res), input = exceptionSchema.parse(req.body); await ensureScls(prisma, a);
      if (a.role === UserRole.AUDITOR) throw httpError(403, 'Auditor OhioISP access is read-only');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT b."id" AS "bindingId",b."patientId",b."supportId",s."ohioIspPlanId",t."assignedUserId",t."title",t."status"
           FROM "SpireOhioIspSupportTaskBinding" b
           JOIN "SpireOhioIspSupport" s ON s."id"=b."supportId"
           JOIN "SpireClinicalTask" t ON t."id"=b."taskId"
          WHERE b."organizationId"=$1 AND b."legalEntityId"=$2 AND b."taskId"=$3 LIMIT 1`,
        a.organizationId, entity(a), req.params.taskId,
      );
      const task = rows[0]; if (!task) throw httpError(404, 'OhioISP support task was not found');
      if (String(task.assignedUserId || '') !== a.userId) throw httpError(403, 'Only the employee assigned this OhioISP task may document the shift exception');
      if (!['OPEN', 'IN_PROGRESS'].includes(String(task.status))) throw httpError(409, 'Only incomplete OhioISP tasks can receive a shift exception');
      const clocks = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id","shiftId","clockIn" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "employeeId"=$3 AND "clockOut" IS NULL ORDER BY "clockIn" DESC LIMIT 1`,
        a.organizationId, entity(a), a.userId,
      );
      if (!clocks[0]) throw httpError(409, 'A currently open shift clock entry is required to document an OhioISP shift exception');
      const clock = clocks[0];
      const inserted = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireOhioIspTaskException"(
          "organizationId","legalEntityId","patientId","ohioIspPlanId","supportId","taskBindingId","taskId","employeeId","clockEntryId","shiftId","reason","createdByUserId"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$8)
        ON CONFLICT ("clockEntryId","taskId") DO NOTHING RETURNING *`,
        a.organizationId, entity(a), String(task.patientId), String(task.ohioIspPlanId), String(task.supportId), String(task.bindingId),
        req.params.taskId, a.userId, String(clock.id), clock.shiftId ?? null, input.reason,
      );
      if (!inserted[0]) {
        const existing = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspTaskException" WHERE "clockEntryId"=$1 AND "taskId"=$2 LIMIT 1`, String(clock.id), req.params.taskId);
        return void res.json({ data: existing[0], idempotent: true });
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireClinicalTaskEvent"("id","organizationId","legalEntityId","taskId","eventType","fromStatus","toStatus","actorUserId","comment","metadata")
         VALUES($1,$2,$3,$4,'COMMENT',$5,$5,$6,$7,$8::jsonb)`,
        randomUUID(), a.organizationId, entity(a), req.params.taskId, String(task.status), a.userId,
        `OhioISP shift exception: ${input.reason}`, JSON.stringify({ ohioIspTaskExceptionId: inserted[0].id, clockEntryId: clock.id, shiftId: clock.shiftId ?? null }),
      );
      await ohioEvent(prisma, a, String(task.patientId), String(task.ohioIspPlanId), 'TASK_EXCEPTION', String(inserted[0].id), 'DOCUMENTED', inserted[0]);
      await audit?.(a, 'DOCUMENT_OHIO_ISP_SHIFT_EXCEPTION', 'SpireOhioIspTaskException', String(inserted[0].id), { taskId: req.params.taskId, patientId: task.patientId });
      res.status(201).json({ data: inserted[0] });
    } catch (e) { next(e); }
  });
};
