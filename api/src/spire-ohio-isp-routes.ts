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

const domainCodes = [
  'COMMUNICATION',
  'ADVOCACY_ENGAGEMENT',
  'SAFETY_SECURITY',
  'SOCIAL_SPIRITUALITY',
  'DAILY_LIFE_EMPLOYMENT',
  'COMMUNITY_LIVING',
  'HEALTHY_LIVING',
] as const;

const readRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.AUDITOR, UserRole.DSP,
  UserRole.DELEGATING_NURSE, UserRole.LPN, UserRole.RN, UserRole.HOUSE_MANAGER,
  UserRole.BILLING_SPECIALIST, UserRole.CEO, UserRole.DOO,
]);
const planWriterRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.DELEGATING_NURSE,
  UserRole.LPN, UserRole.RN, UserRole.HOUSE_MANAGER, UserRole.CEO, UserRole.DOO,
]);
const taskWriterRoles = new Set<UserRole>([
  ...planWriterRoles, UserRole.DSP,
]);
const elevatedRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.AUDITOR,
  UserRole.DELEGATING_NURSE, UserRole.RN, UserRole.CEO, UserRole.DOO,
  UserRole.BILLING_SPECIALIST,
]);

const owner = (a: AuthContext) => a.enterpriseOwner === true
  || String(a.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';
const elevated = (a: AuthContext) => owner(a) || elevatedRoles.has(a.role);
const httpError = (status: number, message: string, details?: unknown) => Object.assign(new Error(message), { status, details });
const text = (value: unknown, max = 20_000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const entity = (a: AuthContext) => {
  if (!a.legalEntityId) throw httpError(409, 'Select Sulandra Community Living Services (SCLS) before opening OhioISP');
  return a.legalEntityId;
};
const jsonObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const profileSchema = z.object({
  sourcePlanId: z.string().trim().max(200).optional().nullable(),
  sourcePlanVersion: z.string().trim().max(120).optional().nullable(),
  countyBoardName: z.string().trim().max(300).optional().nullable(),
  countyBoardIdentifier: z.string().trim().max(120).optional().nullable(),
  ssaName: z.string().trim().max(300).optional().nullable(),
  ssaContact: z.string().trim().max(500).optional().nullable(),
  effectiveStartDate: dateString.optional().nullable(),
  effectiveEndDate: dateString.optional().nullable(),
  annualReviewDate: dateString.optional().nullable(),
  importantTo: z.string().trim().max(20_000).optional().nullable(),
  importantFor: z.string().trim().max(20_000).optional().nullable(),
  knownRisks: z.string().trim().max(20_000).optional().nullable(),
  skillsAndAbilities: z.string().trim().max(20_000).optional().nullable(),
  sourceMetadata: z.record(z.unknown()).optional(),
});
const domainSchema = z.object({
  summary: z.string().trim().max(20_000).optional().nullable(),
  strengths: z.array(z.unknown()).max(500).default([]),
  needs: z.array(z.unknown()).max(500).default([]),
  risks: z.array(z.unknown()).max(500).default([]),
  preferences: z.array(z.unknown()).max(500).default([]),
  assessmentData: z.record(z.unknown()).default({}),
  status: z.enum(['IN_PROGRESS', 'COMPLETE', 'NOT_APPLICABLE']).default('IN_PROGRESS'),
});
const outcomeSchema = z.object({
  carePlanGoalId: z.string().trim().max(120).optional().nullable(),
  sequence: z.coerce.number().int().positive().max(1000).default(1),
  title: z.string().trim().min(2).max(300),
  outcomeStatement: z.string().trim().min(2).max(20_000),
  detailsToKnow: z.string().trim().max(20_000).optional().nullable(),
  measurementMethod: z.string().trim().max(5_000).optional().nullable(),
  reviewFrequency: z.string().trim().max(250).optional().nullable(),
  baseline: z.string().trim().max(5_000).optional().nullable(),
  targetValue: z.coerce.number().optional().nullable(),
  targetUnit: z.string().trim().max(100).optional().nullable(),
  dueDate: dateString.optional().nullable(),
});
const outcomePatchSchema = z.object({
  sequence: z.coerce.number().int().positive().max(1000).optional(),
  title: z.string().trim().min(2).max(300).optional(),
  outcomeStatement: z.string().trim().min(2).max(20_000).optional(),
  detailsToKnow: z.string().trim().max(20_000).optional().nullable(),
  measurementMethod: z.string().trim().max(5_000).optional().nullable(),
  reviewFrequency: z.string().trim().max(250).optional().nullable(),
  status: z.enum(['IN_PROGRESS', 'ACHIEVED', 'DISCONTINUED']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one outcome change is required');
const supportSchema = z.object({
  outcomeId: z.string().trim().max(120).optional().nullable(),
  carePlanInterventionId: z.string().trim().max(120).optional().nullable(),
  authorizationId: z.string().trim().max(120).optional().nullable(),
  serviceCode: z.string().trim().max(120).optional().nullable(),
  serviceType: z.string().trim().max(250).optional().nullable(),
  providerName: z.string().trim().max(300).optional().nullable(),
  providerIdentifier: z.string().trim().max(120).optional().nullable(),
  fundingSource: z.string().trim().max(250).optional().nullable(),
  title: z.string().trim().min(2).max(300),
  scope: z.string().trim().min(2).max(20_000),
  instructions: z.string().trim().min(2).max(20_000),
  frequency: z.string().trim().max(500).optional().nullable(),
  amount: z.coerce.number().nonnegative().optional().nullable(),
  amountUnit: z.string().trim().max(100).optional().nullable(),
  schedule: z.record(z.unknown()).default({}),
  beginsOn: dateString.optional().nullable(),
  endsOn: dateString.optional().nullable(),
  responsibleRole: z.string().trim().max(160).optional().nullable(),
  taskGenerationMode: z.enum(['NONE', 'ON_DEMAND', 'SCHEDULED']).default('ON_DEMAND'),
  priority: z.enum(['ROUTINE', 'HIGH', 'URGENT']).default('ROUTINE'),
});
const supportPatchSchema = supportSchema.partial().omit({ carePlanInterventionId: true }).extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one support change is required');
const taskSchema = z.object({
  homeId: z.string().trim().max(120).optional().nullable(),
  dueAt: z.string().datetime(),
  assignedUserId: z.string().trim().max(120).optional().nullable(),
  generationKey: z.string().trim().max(250).optional().nullable(),
  priority: z.enum(['ROUTINE', 'HIGH', 'URGENT']).optional(),
  title: z.string().trim().max(300).optional().nullable(),
  instructions: z.string().trim().max(20_000).optional().nullable(),
});
const acknowledgmentSchema = z.object({
  attestation: z.string().trim().min(10).max(5_000),
});
const evidenceSchema = z.object({
  outcomeId: z.string().trim().max(120).optional().nullable(),
  supportId: z.string().trim().max(120).optional().nullable(),
  serviceDocumentId: z.string().trim().max(120).optional().nullable(),
  goalProgressEntryId: z.string().trim().max(120).optional().nullable(),
  taskId: z.string().trim().max(120).optional().nullable(),
  evidenceType: z.enum(['SERVICE_DOCUMENT', 'GOAL_PROGRESS', 'TASK_COMPLETION', 'OTHER']),
  note: z.string().trim().max(5_000).optional().nullable(),
}).refine((v) => Boolean(v.outcomeId || v.supportId), 'An outcome or support target is required')
  .refine((v) => Boolean(v.serviceDocumentId || v.goalProgressEntryId || v.taskId), 'At least one evidence source is required');

async function ensureScls(prisma: PrismaClient, a: AuthContext) {
  if (!readRoles.has(a.role) && !owner(a)) throw httpError(403, 'OhioISP access is required');
  const rows = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
    `SELECT "code" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    a.organizationId, entity(a),
  );
  if (rows[0]?.code !== 'SCLS') throw httpError(409, 'Select Sulandra Community Living Services (SCLS)');
}

async function requirePatient(prisma: PrismaClient, a: AuthContext, patientId: string) {
  await ensureScls(prisma, a);
  const enrolled = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM "ClientEnrollment"
      WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clientId"=$3
        AND "status" IN ('PENDING','ACTIVE','PAUSED')) AS allowed`,
    a.organizationId, entity(a), patientId,
  );
  if (!enrolled[0]?.allowed) throw httpError(409, 'The individual is not enrolled with SCLS');
  if (elevated(a)) return;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
      SELECT 1 FROM "SpireEmployeeClientAssignment"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 AND "clientId"=$4
      UNION ALL
      SELECT 1 FROM "SpirePatientHomeAssignment" p
      JOIN "SpireEmployeeHomeAssignment" h
        ON h."organizationId"=p."organizationId" AND h."legalEntityId"=p."legalEntityId" AND h."homeId"=p."homeId"
      WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND h."userId"=$3 AND p."patientId"=$4
        AND (p."endsAt" IS NULL OR p."endsAt">NOW())
    ) AS allowed`,
    a.organizationId, entity(a), a.userId, patientId,
  );
  if (!rows[0]?.allowed) throw httpError(403, 'This individual is outside your assigned SCLS scope');
}

function ensurePlanWriter(a: AuthContext) {
  if (a.role === UserRole.AUDITOR || (!owner(a) && !planWriterRoles.has(a.role))) {
    throw httpError(403, 'OhioISP plan changes require authorized SCLS plan-team access');
  }
}
function ensureTaskWriter(a: AuthContext) {
  if (a.role === UserRole.AUDITOR || (!owner(a) && !taskWriterRoles.has(a.role))) {
    throw httpError(403, 'OhioISP support task creation requires direct-care or SCLS management access');
  }
}

async function carePlan(prisma: PrismaClient, a: AuthContext, patientId: string, carePlanId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireCarePlan"
      WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 LIMIT 1`,
    a.organizationId, entity(a), patientId, carePlanId,
  );
  if (!rows[0]) throw httpError(404, 'Care Plan / ISP was not found in the selected SCLS company');
  return rows[0];
}

async function ohioPlan(prisma: PrismaClient, a: AuthContext, patientId: string, carePlanId: string, required = true) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireOhioIspPlan"
      WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "carePlanId"=$4 LIMIT 1`,
    a.organizationId, entity(a), patientId, carePlanId,
  );
  if (required && !rows[0]) throw httpError(404, 'OhioISP profile has not been created for this Care Plan / ISP');
  return rows[0] ?? null;
}

async function event(
  prisma: PrismaClient, a: AuthContext, patientId: string, ohioIspPlanId: string,
  resourceType: string, resourceId: string, eventType: string,
  beforeValue?: unknown, afterValue?: unknown, reason?: string | null,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireOhioIspEvent"(
      "organizationId","legalEntityId","patientId","ohioIspPlanId","resourceType","resourceId","eventType",
      "actorUserId","actorEmail","reason","beforeValue","afterValue"
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,
    a.organizationId, entity(a), patientId, ohioIspPlanId, resourceType, resourceId, eventType,
    a.userId, a.email ?? null, reason ?? null,
    beforeValue == null ? null : JSON.stringify(beforeValue),
    afterValue == null ? null : JSON.stringify(afterValue),
  );
}

async function readiness(prisma: PrismaClient, a: AuthContext, patientId: string, carePlanId: string) {
  const profile = await ohioPlan(prisma, a, patientId, carePlanId, false);
  if (!profile) return { configured: false, blockers: ['Create the OhioISP profile'], warnings: [], ready: false };
  const planId = String(profile.id);
  const [domains, outcomes, missingSupport, incompleteSupports, acknowledgments, bindings] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ domainCode: string; status: string }>>(
      `SELECT "domainCode","status" FROM "SpireOhioIspAssessmentDomain" WHERE "ohioIspPlanId"=$1`, planId,
    ),
    prisma.$queryRawUnsafe<Array<{ id: string; title: string; status: string }>>(
      `SELECT "id","title","status" FROM "SpireOhioIspOutcome" WHERE "ohioIspPlanId"=$1 AND "status"<>'DISCONTINUED' ORDER BY "sequence"`, planId,
    ),
    prisma.$queryRawUnsafe<Array<{ id: string; title: string }>>(
      `SELECT o."id",o."title" FROM "SpireOhioIspOutcome" o
       WHERE o."ohioIspPlanId"=$1 AND o."status"='IN_PROGRESS'
         AND NOT EXISTS(SELECT 1 FROM "SpireOhioIspSupport" s WHERE s."outcomeId"=o."id" AND s."status"='ACTIVE')`, planId,
    ),
    prisma.$queryRawUnsafe<Array<{ id: string; title: string }>>(
      `SELECT "id","title" FROM "SpireOhioIspSupport"
       WHERE "ohioIspPlanId"=$1 AND "status"='ACTIVE' AND (
         NULLIF(BTRIM(COALESCE("providerName",'')),'') IS NULL OR
         NULLIF(BTRIM(COALESCE("fundingSource",'')),'') IS NULL OR
         NULLIF(BTRIM(COALESCE("frequency",'')),'') IS NULL OR
         NULLIF(BTRIM(COALESCE("scope",'')),'') IS NULL OR
         NULLIF(BTRIM(COALESCE("instructions",'')),'') IS NULL
       )`, planId,
    ),
    prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM "SpireOhioIspStaffAcknowledgment" WHERE "ohioIspPlanId"=$1`, planId,
    ),
    prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM "SpireOhioIspSupportTaskBinding" b
       JOIN "SpireOhioIspSupport" s ON s."id"=b."supportId" WHERE s."ohioIspPlanId"=$1`, planId,
    ),
  ]);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const requiredText: Array<[string, string]> = [
    ['sourcePlanId', 'Record the OhioISP/source plan identifier'],
    ['sourcePlanVersion', 'Record the OhioISP/source plan version'],
    ['importantTo', 'Document what is important TO the person'],
    ['importantFor', 'Document what is important FOR the person'],
    ['knownRisks', 'Document known or likely risks'],
    ['skillsAndAbilities', 'Document skills and abilities'],
  ];
  for (const [key, message] of requiredText) if (!text(profile[key])) blockers.push(message);
  if (!profile.effectiveStartDate) blockers.push('Set the OhioISP effective start date');
  if (!profile.effectiveEndDate) blockers.push('Set the OhioISP effective end date');
  const completed = new Set(domains.filter((d) => ['COMPLETE', 'NOT_APPLICABLE'].includes(d.status)).map((d) => d.domainCode));
  for (const code of domainCodes) if (!completed.has(code)) blockers.push(`Complete the ${code.toLowerCase().replaceAll('_', ' ')} assessment domain`);
  if (!outcomes.length) blockers.push('Add at least one OhioISP outcome');
  for (const row of missingSupport) blockers.push(`Add an active support for outcome: ${row.title}`);
  for (const row of incompleteSupports) blockers.push(`Complete provider, funding source, frequency, scope and instructions for support: ${row.title}`);
  if (!Number(acknowledgments[0]?.count || 0)) warnings.push('No assigned staff have acknowledged this OhioISP version yet');
  return {
    configured: true,
    profile,
    assessmentDomains: { completed: completed.size, required: domainCodes.length },
    activeOutcomeCount: outcomes.length,
    taskBindingCount: Number(bindings[0]?.count || 0),
    staffAcknowledgmentCount: Number(acknowledgments[0]?.count || 0),
    blockers,
    warnings,
    ready: blockers.length === 0,
  };
}

async function currentPlanVersion(prisma: PrismaClient, profile: Record<string, unknown>) {
  const rows = await prisma.$queryRawUnsafe<Array<{ version: number }>>(
    `SELECT COALESCE(MAX("version"),0)::int AS version FROM "SpireCarePlanVersion" WHERE "carePlanId"=$1`,
    String(profile.carePlanId),
  );
  return `${text(profile.sourcePlanVersion, 120) || 'SOURCE_UNVERSIONED'}|SPIRE:${Number(rows[0]?.version || 0)}`;
}

async function ownedOutcome(prisma: PrismaClient, planId: string, outcomeId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireOhioIspOutcome" WHERE "ohioIspPlanId"=$1 AND "id"=$2 LIMIT 1`, planId, outcomeId,
  );
  if (!rows[0]) throw httpError(404, 'OhioISP outcome was not found');
  return rows[0];
}
async function ownedSupport(prisma: PrismaClient, planId: string, supportId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireOhioIspSupport" WHERE "ohioIspPlanId"=$1 AND "id"=$2 LIMIT 1`, planId, supportId,
  );
  if (!rows[0]) throw httpError(404, 'OhioISP support was not found');
  return rows[0];
}

export const registerSpireOhioIspRoutes = (app: express.Express, prisma: PrismaClient, deps: Dependencies) => {
  const { authOf, audit } = deps;

  app.get('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId;
      await requirePatient(prisma, a, patientId); await carePlan(prisma, a, patientId, carePlanId);
      const profile = await ohioPlan(prisma, a, patientId, carePlanId, false);
      if (!profile) return void res.json({ data: { profile: null, domains: [], outcomes: [], supports: [], taskBindings: [], acknowledgments: [], evidence: [], readiness: await readiness(prisma, a, patientId, carePlanId) } });
      const planId = String(profile.id);
      const [domains, outcomes, supports, taskBindings, acknowledgments, evidence, events] = await Promise.all([
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspAssessmentDomain" WHERE "ohioIspPlanId"=$1 ORDER BY "domainCode"`, planId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspOutcome" WHERE "ohioIspPlanId"=$1 ORDER BY "sequence","createdAt"`, planId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspSupport" WHERE "ohioIspPlanId"=$1 ORDER BY "createdAt"`, planId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT b.*,t."title" AS "taskTitle",t."status" AS "taskStatus",t."dueAt" AS "taskDueAt",t."assignedUserId" FROM "SpireOhioIspSupportTaskBinding" b JOIN "SpireClinicalTask" t ON t."id"=b."taskId" WHERE b."organizationId"=$1 AND b."legalEntityId"=$2 AND b."patientId"=$3 ORDER BY b."createdAt" DESC`, a.organizationId, entity(a), patientId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspStaffAcknowledgment" WHERE "ohioIspPlanId"=$1 ORDER BY "acknowledgedAt" DESC`, planId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspEvidenceLink" WHERE "ohioIspPlanId"=$1 ORDER BY "createdAt" DESC`, planId),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspEvent" WHERE "ohioIspPlanId"=$1 ORDER BY "createdAt" DESC LIMIT 500`, planId),
      ]);
      res.json({ data: { profile, domains, outcomes, supports, taskBindings, acknowledgments, evidence, events, readiness: await readiness(prisma, a, patientId, carePlanId) } });
    } catch (e) { next(e); }
  });

  app.get('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/readiness', async (req, res, next) => {
    try {
      const a = authOf(res); await requirePatient(prisma, a, req.params.patientId); await carePlan(prisma, a, req.params.patientId, req.params.carePlanId);
      res.json({ data: await readiness(prisma, a, req.params.patientId, req.params.carePlanId) });
    } catch (e) { next(e); }
  });

  app.put('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/profile', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId, input = profileSchema.parse(req.body);
      await requirePatient(prisma, a, patientId); ensurePlanWriter(a); await carePlan(prisma, a, patientId, carePlanId);
      const before = await ohioPlan(prisma, a, patientId, carePlanId, false);
      const id = before ? String(before.id) : randomUUID();
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireOhioIspPlan"(
          "id","organizationId","legalEntityId","patientId","carePlanId","sourcePlanId","sourcePlanVersion",
          "countyBoardName","countyBoardIdentifier","ssaName","ssaContact","effectiveStartDate","effectiveEndDate","annualReviewDate",
          "importantTo","importantFor","knownRisks","skillsAndAbilities","sourceMetadata","createdByUserId","updatedByUserId"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13::date,$14::date,$15,$16,$17,$18,$19::jsonb,$20,$20)
        ON CONFLICT ("organizationId","legalEntityId","carePlanId") DO UPDATE SET
          "sourcePlanId"=COALESCE(EXCLUDED."sourcePlanId","SpireOhioIspPlan"."sourcePlanId"),
          "sourcePlanVersion"=COALESCE(EXCLUDED."sourcePlanVersion","SpireOhioIspPlan"."sourcePlanVersion"),
          "countyBoardName"=COALESCE(EXCLUDED."countyBoardName","SpireOhioIspPlan"."countyBoardName"),
          "countyBoardIdentifier"=COALESCE(EXCLUDED."countyBoardIdentifier","SpireOhioIspPlan"."countyBoardIdentifier"),
          "ssaName"=COALESCE(EXCLUDED."ssaName","SpireOhioIspPlan"."ssaName"),
          "ssaContact"=COALESCE(EXCLUDED."ssaContact","SpireOhioIspPlan"."ssaContact"),
          "effectiveStartDate"=COALESCE(EXCLUDED."effectiveStartDate","SpireOhioIspPlan"."effectiveStartDate"),
          "effectiveEndDate"=COALESCE(EXCLUDED."effectiveEndDate","SpireOhioIspPlan"."effectiveEndDate"),
          "annualReviewDate"=COALESCE(EXCLUDED."annualReviewDate","SpireOhioIspPlan"."annualReviewDate"),
          "importantTo"=COALESCE(EXCLUDED."importantTo","SpireOhioIspPlan"."importantTo"),
          "importantFor"=COALESCE(EXCLUDED."importantFor","SpireOhioIspPlan"."importantFor"),
          "knownRisks"=COALESCE(EXCLUDED."knownRisks","SpireOhioIspPlan"."knownRisks"),
          "skillsAndAbilities"=COALESCE(EXCLUDED."skillsAndAbilities","SpireOhioIspPlan"."skillsAndAbilities"),
          "sourceMetadata"=CASE WHEN EXCLUDED."sourceMetadata"='{}'::jsonb THEN "SpireOhioIspPlan"."sourceMetadata" ELSE EXCLUDED."sourceMetadata" END,
          "updatedByUserId"=EXCLUDED."updatedByUserId"
        RETURNING *`,
        id, a.organizationId, entity(a), patientId, carePlanId,
        input.sourcePlanId ?? null, input.sourcePlanVersion ?? null, input.countyBoardName ?? null, input.countyBoardIdentifier ?? null,
        input.ssaName ?? null, input.ssaContact ?? null, input.effectiveStartDate ?? null, input.effectiveEndDate ?? null,
        input.annualReviewDate ?? null, input.importantTo ?? null, input.importantFor ?? null, input.knownRisks ?? null,
        input.skillsAndAbilities ?? null, JSON.stringify(input.sourceMetadata ?? {}), a.userId,
      );
      const row = rows[0];
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireCarePlan" SET
          "importantTo"=COALESCE($1,"importantTo"),"importantFor"=COALESCE($2,"importantFor"),
          "effectiveDate"=COALESCE($3::date,"effectiveDate"),"annualReviewDate"=COALESCE($4::date,"annualReviewDate"),"updatedAt"=NOW()
         WHERE "organizationId"=$5 AND "legalEntityId"=$6 AND "patientId"=$7 AND "id"=$8`,
        input.importantTo ?? null, input.importantFor ?? null, input.effectiveStartDate ?? null, input.annualReviewDate ?? null,
        a.organizationId, entity(a), patientId, carePlanId,
      );
      await event(prisma, a, patientId, String(row.id), 'PLAN', String(row.id), before ? 'UPDATED' : 'CREATED', before, row);
      await audit?.(a, before ? 'UPDATE_OHIO_ISP_PROFILE' : 'CREATE_OHIO_ISP_PROFILE', 'SpireOhioIspPlan', String(row.id), { patientId, carePlanId });
      res.status(before ? 200 : 201).json({ data: row });
    } catch (e) { next(e); }
  });

  app.put('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/domains/:domainCode', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId;
      const domainCode = z.enum(domainCodes).parse(req.params.domainCode), input = domainSchema.parse(req.body);
      await requirePatient(prisma, a, patientId); ensurePlanWriter(a); await carePlan(prisma, a, patientId, carePlanId);
      const profile = await ohioPlan(prisma, a, patientId, carePlanId, true) as Record<string, unknown>, planId = String(profile.id);
      const priorRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "SpireOhioIspAssessmentDomain" WHERE "ohioIspPlanId"=$1 AND "domainCode"=$2 LIMIT 1`, planId, domainCode);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireOhioIspAssessmentDomain"(
          "organizationId","legalEntityId","patientId","ohioIspPlanId","domainCode","summary","strengths","needs","risks","preferences","assessmentData","status","reviewedByUserId","reviewedAt","updatedByUserId"
        ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,CASE WHEN $12 IN ('COMPLETE','NOT_APPLICABLE') THEN $13 ELSE NULL END,CASE WHEN $12 IN ('COMPLETE','NOT_APPLICABLE') THEN NOW() ELSE NULL END,$13)
        ON CONFLICT ("ohioIspPlanId","domainCode") DO UPDATE SET
          "summary"=EXCLUDED."summary","strengths"=EXCLUDED."strengths","needs"=EXCLUDED."needs","risks"=EXCLUDED."risks",
          "preferences"=EXCLUDED."preferences","assessmentData"=EXCLUDED."assessmentData","status"=EXCLUDED."status",
          "reviewedByUserId"=EXCLUDED."reviewedByUserId","reviewedAt"=EXCLUDED."reviewedAt","updatedByUserId"=EXCLUDED."updatedByUserId"
        RETURNING *`,
        a.organizationId, entity(a), patientId, planId, domainCode, input.summary ?? null,
        JSON.stringify(input.strengths), JSON.stringify(input.needs), JSON.stringify(input.risks), JSON.stringify(input.preferences),
        JSON.stringify(input.assessmentData), input.status, a.userId,
      );
      const row = rows[0];
      await event(prisma, a, patientId, planId, 'ASSESSMENT_DOMAIN', String(row.id), priorRows[0] ? 'UPDATED' : 'CREATED', priorRows[0], row);
      res.json({ data: row });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/outcomes', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId, input = outcomeSchema.parse(req.body);
      await requirePatient(prisma, a, patientId); ensurePlanWriter(a); await carePlan(prisma, a, patientId, carePlanId);
      const profile = await ohioPlan(prisma, a, patientId, carePlanId, true) as Record<string, unknown>, planId = String(profile.id);
      let goalId = input.carePlanGoalId ?? null;
      if (goalId) {
        const goals = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "SpireCarePlanGoal" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "carePlanId"=$4 AND "id"=$5 LIMIT 1`,
          a.organizationId, entity(a), patientId, carePlanId, goalId,
        );
        if (!goals[0]) throw httpError(409, 'Selected Care Plan goal does not belong to this SCLS plan');
      } else {
        const goals = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO "SpireCarePlanGoal"(
            "organizationId","legalEntityId","patientId","carePlanId","title","baseline","desiredOutcome","targetValue","targetUnit","frequency","status","progressPercent","dueDate","createdById"
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',0,$11::date,$12) RETURNING "id"`,
          a.organizationId, entity(a), patientId, carePlanId, input.title, input.baseline ?? null, input.outcomeStatement,
          input.targetValue ?? null, input.targetUnit ?? null, input.reviewFrequency ?? null, input.dueDate ?? null, a.userId,
        );
        goalId = String(goals[0].id);
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireOhioIspOutcome"(
          "organizationId","legalEntityId","patientId","ohioIspPlanId","carePlanGoalId","sequence","title","outcomeStatement","detailsToKnow","measurementMethod","reviewFrequency","createdByUserId","updatedByUserId"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
        a.organizationId, entity(a), patientId, planId, goalId, input.sequence, input.title, input.outcomeStatement,
        input.detailsToKnow ?? null, input.measurementMethod ?? null, input.reviewFrequency ?? null, a.userId,
      );
      const row = rows[0]; await event(prisma, a, patientId, planId, 'OUTCOME', String(row.id), 'CREATED', null, row);
      await audit?.(a, 'CREATE_OHIO_ISP_OUTCOME', 'SpireOhioIspOutcome', String(row.id), { patientId, carePlanId, carePlanGoalId: goalId });
      res.status(201).json({ data: row });
    } catch (e) { next(e); }
  });

  app.patch('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/outcomes/:outcomeId', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId, input = outcomePatchSchema.parse(req.body);
      await requirePatient(prisma, a, patientId); ensurePlanWriter(a); await carePlan(prisma, a, patientId, carePlanId);
      const profile = await ohioPlan(prisma, a, patientId, carePlanId, true) as Record<string, unknown>, planId = String(profile.id);
      const before = await ownedOutcome(prisma, planId, req.params.outcomeId);
      const merged = { ...before, ...input };
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireOhioIspOutcome" SET "sequence"=$1,"title"=$2,"outcomeStatement"=$3,"detailsToKnow"=$4,
          "measurementMethod"=$5,"reviewFrequency"=$6,"status"=$7,"updatedByUserId"=$8 WHERE "id"=$9 RETURNING *`,
        Number(merged.sequence), String(merged.title), String(merged.outcomeStatement), merged.detailsToKnow ?? null,
        merged.measurementMethod ?? null, merged.reviewFrequency ?? null, String(merged.status), a.userId, req.params.outcomeId,
      );
      const row = rows[0];
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireCarePlanGoal" SET "title"=$1,"desiredOutcome"=$2,"frequency"=COALESCE($3,"frequency"),
          "status"=CASE WHEN $4='DISCONTINUED' THEN 'INACTIVE' ELSE 'ACTIVE' END,"updatedAt"=NOW()
         WHERE "organizationId"=$5 AND "legalEntityId"=$6 AND "patientId"=$7 AND "carePlanId"=$8 AND "id"=$9`,
        String(row.title), String(row.outcomeStatement), row.reviewFrequency ?? null, String(row.status),
        a.organizationId, entity(a), patientId, carePlanId, String(row.carePlanGoalId),
      );
      await event(prisma, a, patientId, planId, 'OUTCOME', String(row.id), 'UPDATED', before, row);
      res.json({ data: row });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/supports', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId, input = supportSchema.parse(req.body);
      await requirePatient(prisma, a, patientId); ensurePlanWriter(a); await carePlan(prisma, a, patientId, carePlanId);
      const profile = await ohioPlan(prisma, a, patientId, carePlanId, true) as Record<string, unknown>, planId = String(profile.id);
      let outcome: Record<string, unknown> | null = null;
      if (input.outcomeId) outcome = await ownedOutcome(prisma, planId, input.outcomeId);
      if (input.authorizationId) {
        const auths = await prisma.$queryRawUnsafe<Array<{ patientId: string; serviceCode: string }>>(
          `SELECT "patientId","serviceCode" FROM "SpireServiceAuthorization" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
          a.organizationId, input.authorizationId,
        );
        if (!auths[0] || auths[0].patientId !== patientId) throw httpError(409, 'Selected authorization does not belong to this individual');
        if (input.serviceCode && auths[0].serviceCode && input.serviceCode !== auths[0].serviceCode) throw httpError(409, 'Support service code does not match the linked authorization');
      }
      let interventionId = input.carePlanInterventionId ?? null;
      if (interventionId) {
        const interventions = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "SpireCarePlanIntervention" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "carePlanId"=$4 AND "id"=$5 LIMIT 1`,
          a.organizationId, entity(a), patientId, carePlanId, interventionId,
        );
        if (!interventions[0]) throw httpError(409, 'Selected Care Plan intervention does not belong to this SCLS plan');
      } else {
        const interventions = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `INSERT INTO "SpireCarePlanIntervention"(
            "organizationId","legalEntityId","patientId","carePlanId","goalId","title","instructions","frequency","responsibleRole","serviceType","status","createdById"
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11) RETURNING "id"`,
          a.organizationId, entity(a), patientId, carePlanId, outcome?.carePlanGoalId ?? null, input.title, input.instructions,
          input.frequency ?? null, input.responsibleRole ?? null, input.serviceType ?? null, a.userId,
        );
        interventionId = String(interventions[0].id);
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireOhioIspSupport"(
          "organizationId","legalEntityId","patientId","ohioIspPlanId","outcomeId","carePlanInterventionId","authorizationId",
          "serviceCode","serviceType","providerName","providerIdentifier","fundingSource","title","scope","instructions","frequency",
          "amount","amountUnit","schedule","beginsOn","endsOn","responsibleRole","taskGenerationMode","priority","createdByUserId","updatedByUserId"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::date,$21::date,$22,$23,$24,$25,$25) RETURNING *`,
        a.organizationId, entity(a), patientId, planId, input.outcomeId ?? null, interventionId, input.authorizationId ?? null,
        input.serviceCode ?? null, input.serviceType ?? null, input.providerName ?? null, input.providerIdentifier ?? null, input.fundingSource ?? null,
        input.title, input.scope, input.instructions, input.frequency ?? null, input.amount ?? null, input.amountUnit ?? null,
        JSON.stringify(input.schedule), input.beginsOn ?? null, input.endsOn ?? null, input.responsibleRole ?? null,
        input.taskGenerationMode, input.priority, a.userId,
      );
      const row = rows[0]; await event(prisma, a, patientId, planId, 'SUPPORT', String(row.id), 'CREATED', null, row);
      await audit?.(a, 'CREATE_OHIO_ISP_SUPPORT', 'SpireOhioIspSupport', String(row.id), { patientId, carePlanId, outcomeId: input.outcomeId ?? null, carePlanInterventionId: interventionId });
      res.status(201).json({ data: row });
    } catch (e) { next(e); }
  });

  app.patch('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/supports/:supportId', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId, input = supportPatchSchema.parse(req.body);
      await requirePatient(prisma, a, patientId); ensurePlanWriter(a); await carePlan(prisma, a, patientId, carePlanId);
      const profile = await ohioPlan(prisma, a, patientId, carePlanId, true) as Record<string, unknown>, planId = String(profile.id);
      const before = await ownedSupport(prisma, planId, req.params.supportId), merged = { ...before, ...input };
      if (merged.outcomeId) await ownedOutcome(prisma, planId, String(merged.outcomeId));
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireOhioIspSupport" SET "outcomeId"=$1,"authorizationId"=$2,"serviceCode"=$3,"serviceType"=$4,
          "providerName"=$5,"providerIdentifier"=$6,"fundingSource"=$7,"title"=$8,"scope"=$9,"instructions"=$10,"frequency"=$11,
          "amount"=$12,"amountUnit"=$13,"schedule"=$14::jsonb,"beginsOn"=$15::date,"endsOn"=$16::date,"responsibleRole"=$17,
          "taskGenerationMode"=$18,"priority"=$19,"status"=$20,"updatedByUserId"=$21 WHERE "id"=$22 RETURNING *`,
        merged.outcomeId ?? null, merged.authorizationId ?? null, merged.serviceCode ?? null, merged.serviceType ?? null,
        merged.providerName ?? null, merged.providerIdentifier ?? null, merged.fundingSource ?? null, String(merged.title), String(merged.scope),
        String(merged.instructions), merged.frequency ?? null, merged.amount ?? null, merged.amountUnit ?? null,
        JSON.stringify(jsonObject(merged.schedule)), merged.beginsOn ?? null, merged.endsOn ?? null, merged.responsibleRole ?? null,
        String(merged.taskGenerationMode), String(merged.priority), String(merged.status), a.userId, req.params.supportId,
      );
      const row = rows[0];
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireCarePlanIntervention" SET "title"=$1,"instructions"=$2,"frequency"=$3,"responsibleRole"=$4,"serviceType"=$5,
          "status"=CASE WHEN $6='ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END,"updatedAt"=NOW()
         WHERE "organizationId"=$7 AND "legalEntityId"=$8 AND "patientId"=$9 AND "carePlanId"=$10 AND "id"=$11`,
        String(row.title), String(row.instructions), row.frequency ?? null, row.responsibleRole ?? null, row.serviceType ?? null, String(row.status),
        a.organizationId, entity(a), patientId, carePlanId, String(row.carePlanInterventionId),
      );
      await event(prisma, a, patientId, planId, 'SUPPORT', String(row.id), 'UPDATED', before, row);
      res.json({ data: row });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/supports/:supportId/tasks', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId, input = taskSchema.parse(req.body);
      await requirePatient(prisma, a, patientId); ensureTaskWriter(a); await carePlan(prisma, a, patientId, carePlanId);
      const profile = await ohioPlan(prisma, a, patientId, carePlanId, true) as Record<string, unknown>, planId = String(profile.id);
      const support = await ownedSupport(prisma, planId, req.params.supportId);
      if (String(support.status) !== 'ACTIVE') throw httpError(409, 'Only active OhioISP supports can generate work');
      if (String(support.taskGenerationMode) === 'NONE') throw httpError(409, 'This OhioISP support is not configured to generate tasks');
      if (input.homeId && !elevated(a)) {
        const homes = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
          `SELECT EXISTS(SELECT 1 FROM "SpireEmployeeHomeAssignment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 AND "homeId"=$4) AS allowed`,
          a.organizationId, entity(a), a.userId, input.homeId,
        );
        if (!homes[0]?.allowed) throw httpError(403, 'The selected home is outside your SCLS assignment');
      }
      const generationKey = input.generationKey || `${input.dueAt}|${input.assignedUserId || 'UNASSIGNED'}|${input.homeId || 'NO_HOME'}`;
      const existing = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT b.*,t."title",t."status",t."dueAt",t."assignedUserId" FROM "SpireOhioIspSupportTaskBinding" b
         JOIN "SpireClinicalTask" t ON t."id"=b."taskId" WHERE b."supportId"=$1 AND b."generationKey"=$2 LIMIT 1`,
        req.params.supportId, generationKey,
      );
      if (existing[0]) return void res.json({ data: existing[0], idempotent: true });
      const taskId = randomUUID(), priority = input.priority || String(support.priority || 'ROUTINE');
      const title = input.title || String(support.title), instructions = input.instructions || String(support.instructions);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireClinicalTask"(
          "id","organizationId","legalEntityId","clientId","homeId","taskType","title","instructions","priority","status","dueAt","assignedUserId","createdByUserId","createdAt","updatedAt"
        ) VALUES($1,$2,$3,$4,$5,'OHIO_ISP_SUPPORT',$6,$7,$8,'OPEN',$9::timestamptz,$10,$11,NOW(),NOW())`,
        taskId, a.organizationId, entity(a), patientId, input.homeId ?? null, title, instructions, priority, input.dueAt, input.assignedUserId ?? null, a.userId,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireClinicalTaskEvent"("organizationId","legalEntityId","taskId","eventType","fromStatus","toStatus","actorUserId","comment","metadata")
         VALUES($1,$2,$3,'CREATED',NULL,'OPEN',$4,$5,$6::jsonb)`,
        a.organizationId, entity(a), taskId, a.userId, 'Generated from an OhioISP support',
        JSON.stringify({ ohioIspPlanId: planId, outcomeId: support.outcomeId ?? null, supportId: support.id, carePlanId, generationKey }),
      );
      const bindings = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireOhioIspSupportTaskBinding"(
          "organizationId","legalEntityId","patientId","supportId","taskId","generationKey","sourcePlanVersion","createdByUserId"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        a.organizationId, entity(a), patientId, String(support.id), taskId, generationKey, profile.sourcePlanVersion ?? null, a.userId,
      );
      await event(prisma, a, patientId, planId, 'TASK_BINDING', String(bindings[0].id), 'CREATED', null, { ...bindings[0], taskId });
      await audit?.(a, 'GENERATE_OHIO_ISP_TASK', 'SpireClinicalTask', taskId, { patientId, carePlanId, supportId: support.id, generationKey });
      res.status(201).json({ data: { ...bindings[0], task: { id: taskId, title, instructions, priority, dueAt: input.dueAt, assignedUserId: input.assignedUserId ?? null } } });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/acknowledgments', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId, input = acknowledgmentSchema.parse(req.body);
      await requirePatient(prisma, a, patientId);
      if (a.role === UserRole.AUDITOR) throw httpError(403, 'Auditor OhioISP access is read-only');
      await carePlan(prisma, a, patientId, carePlanId);
      const profile = await ohioPlan(prisma, a, patientId, carePlanId, true) as Record<string, unknown>, planId = String(profile.id);
      const version = await currentPlanVersion(prisma, profile);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireOhioIspStaffAcknowledgment"(
          "organizationId","legalEntityId","patientId","ohioIspPlanId","userId","planVersion","attestation","ipAddress","userAgent"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT ("ohioIspPlanId","userId","planVersion") DO NOTHING RETURNING *`,
        a.organizationId, entity(a), patientId, planId, a.userId, version, input.attestation, a.ipAddress ?? null, a.userAgent ?? null,
      );
      if (!rows[0]) {
        const existing = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireOhioIspStaffAcknowledgment" WHERE "ohioIspPlanId"=$1 AND "userId"=$2 AND "planVersion"=$3 LIMIT 1`,
          planId, a.userId, version,
        );
        return void res.json({ data: existing[0], idempotent: true });
      }
      await event(prisma, a, patientId, planId, 'STAFF_ACKNOWLEDGMENT', String(rows[0].id), 'ACKNOWLEDGED', null, rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/ohio-isp/evidence', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId, carePlanId = req.params.carePlanId, input = evidenceSchema.parse(req.body);
      await requirePatient(prisma, a, patientId);
      if (a.role === UserRole.AUDITOR) throw httpError(403, 'Auditor OhioISP access is read-only');
      await carePlan(prisma, a, patientId, carePlanId);
      const profile = await ohioPlan(prisma, a, patientId, carePlanId, true) as Record<string, unknown>, planId = String(profile.id);
      if (input.outcomeId) await ownedOutcome(prisma, planId, input.outcomeId);
      if (input.supportId) await ownedSupport(prisma, planId, input.supportId);
      if (input.serviceDocumentId) {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "SpireDoddServiceDocument" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 LIMIT 1`,
          a.organizationId, entity(a), patientId, input.serviceDocumentId,
        );
        if (!rows[0]) throw httpError(409, 'DODD service-document evidence does not belong to this individual');
      }
      if (input.goalProgressEntryId) {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "SpireGoalProgressEntry" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 LIMIT 1`,
          a.organizationId, entity(a), patientId, input.goalProgressEntryId,
        );
        if (!rows[0]) throw httpError(409, 'Goal-progress evidence does not belong to this individual');
      }
      if (input.taskId) {
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id" FROM "SpireClinicalTask" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clientId"=$3 AND "id"=$4 LIMIT 1`,
          a.organizationId, entity(a), patientId, input.taskId,
        );
        if (!rows[0]) throw httpError(409, 'Task evidence does not belong to this individual');
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireOhioIspEvidenceLink"(
          "organizationId","legalEntityId","patientId","ohioIspPlanId","outcomeId","supportId","serviceDocumentId","goalProgressEntryId","taskId","evidenceType","note","createdByUserId"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        a.organizationId, entity(a), patientId, planId, input.outcomeId ?? null, input.supportId ?? null,
        input.serviceDocumentId ?? null, input.goalProgressEntryId ?? null, input.taskId ?? null, input.evidenceType, input.note ?? null, a.userId,
      );
      await event(prisma, a, patientId, planId, 'EVIDENCE', String(rows[0].id), 'LINKED', null, rows[0]);
      res.status(201).json({ data: rows[0] });
    } catch (e) { next(e); }
  });
};
