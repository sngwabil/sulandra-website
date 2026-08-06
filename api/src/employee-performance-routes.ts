import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { createTransport } from 'nodemailer';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
};

type AuditFn = (
  auth: Partial<AuthContext>,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: object,
) => Promise<void>;

type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
  audit?: AuditFn;
};

type EmployeeRow = {
  id: string;
  email: string | null;
  role: string;
  displayName: string;
  department: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  hireDate: Date | string | null;
  supervisorId: string | null;
  locationIds: string[];
};

type TemplateCompetency = {
  id: string;
  name: string;
  description?: string;
  weight: number;
};

type ReviewRow = {
  id: string;
  organizationId: string;
  cycleId: string;
  employeeId: string;
  managerId: string | null;
  status: string;
  selfAssessmentDueAt: Date | string | null;
  managerAssessmentDueAt: Date | string | null;
  acknowledgmentDueAt: Date | string | null;
  employeeSubmittedAt: Date | string | null;
  managerSubmittedAt: Date | string | null;
  calibratedAt: Date | string | null;
  finalizedAt: Date | string | null;
  acknowledgedAt: Date | string | null;
  finalScore: number | null;
  finalRating: number | null;
  calibrationRating: number | null;
  summary: string;
  strengths: string;
  improvementAreas: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
const EMPLOYEE_URL = 'https://www.sulandrahealth.com/employee-portal.html#myPerformance';
const ADMIN_URL = 'https://www.sulandrahealth.com/admin.html#employeePerformance';
const DAY = 86_400_000;

const managerRoles = [
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.AUDITOR,
  UserRole.DELEGATING_NURSE,
  UserRole.CEO,
  UserRole.COO,
] as const;

const globalRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.HR_MANAGER,
  UserRole.AUDITOR,
  UserRole.CEO,
  UserRole.COO,
]);

const locationRoles = new Set<UserRole>([
  UserRole.PROGRAM_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.DELEGATING_NURSE,
]);

const performanceManagerRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.HR_MANAGER,
]);

const assessmentManagerRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.DELEGATING_NURSE,
  UserRole.CEO,
  UserRole.COO,
]);

const competencySchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().max(2_000).optional().default(''),
  weight: z.number().min(0).max(100),
});

const ratingScaleSchema = z.object({
  value: z.number().int().min(1).max(10),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().default(''),
});

const templateSchema = z.object({
  name: z.string().trim().min(3).max(240),
  description: z.string().trim().max(4_000).optional().default(''),
  competencies: z.array(competencySchema).min(1).max(50),
  ratingScale: z.array(ratingScaleSchema).min(3).max(10),
  goalWeight: z.number().min(0).max(100).optional().default(50),
  competencyWeight: z.number().min(0).max(100).optional().default(50),
  employeeSelfAssessment: z.boolean().optional().default(true),
  employeeAcknowledgment: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true),
}).refine(value => Math.round(value.goalWeight + value.competencyWeight) === 100, {
  message: 'Goal and competency weights must total 100',
});

const cycleSchema = z.object({
  templateId: z.string().trim().min(1),
  name: z.string().trim().min(3).max(240),
  description: z.string().trim().max(4_000).optional().default(''),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  selfAssessmentDueAt: z.coerce.date().optional().nullable(),
  managerAssessmentDueAt: z.coerce.date().optional().nullable(),
  acknowledgmentDueAt: z.coerce.date().optional().nullable(),
  applicability: z.object({
    roles: z.array(z.string().trim().min(1)).optional().default([]),
    departments: z.array(z.string().trim().min(1)).optional().default([]),
    jobTitles: z.array(z.string().trim().min(1)).optional().default([]),
    locationIds: z.array(z.string().trim().min(1)).optional().default([]),
    employmentStatuses: z.array(z.string().trim().min(1)).optional().default(['ACTIVE', 'ON_LEAVE']),
  }).optional().default({ roles: [], departments: [], jobTitles: [], locationIds: [], employmentStatuses: ['ACTIVE', 'ON_LEAVE'] }),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED']).optional().default('DRAFT'),
}).refine(value => value.periodEnd > value.periodStart, { message: 'Review-cycle end date must be after the start date' });

const goalSchema = z.object({
  cycleId: z.string().trim().optional().nullable(),
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().min(3).max(8_000),
  category: z.enum(['PERFORMANCE', 'DEVELOPMENT', 'COMPLIANCE', 'EDUCATION', 'LEADERSHIP', 'QUALITY', 'SAFETY', 'ATTENDANCE', 'OTHER']).optional().default('PERFORMANCE'),
  metricType: z.enum(['PERCENT', 'NUMBER', 'CURRENCY', 'MILESTONE', 'BOOLEAN']).optional().default('PERCENT'),
  targetValue: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  unit: z.string().trim().max(60).optional().default(''),
  startDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  weight: z.number().min(0).max(100).optional().default(0),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'AT_RISK', 'COMPLETED', 'CANCELLED']).optional().default('ACTIVE'),
  employeeCanUpdate: z.boolean().optional().default(true),
  visibility: z.enum(['EMPLOYEE_VISIBLE', 'MANAGEMENT_ONLY', 'HR_CONFIDENTIAL']).optional().default('EMPLOYEE_VISIBLE'),
});

const goalProgressSchema = z.object({
  currentValue: z.number().optional().nullable(),
  progressPercent: z.number().min(0).max(100).optional(),
  status: z.enum(['ACTIVE', 'AT_RISK', 'COMPLETED']).optional(),
  updateNote: z.string().trim().min(2).max(4_000),
});

const assessmentResponseSchema = z.object({
  competencyRatings: z.array(z.object({
    competencyId: z.string().trim().min(1),
    rating: z.number().min(1).max(10),
    comments: z.string().trim().max(4_000).optional().default(''),
  })).max(50),
  goalRatings: z.array(z.object({
    goalId: z.string().trim().min(1),
    rating: z.number().min(1).max(10),
    comments: z.string().trim().max(4_000).optional().default(''),
  })).max(100).optional().default([]),
  overallComments: z.string().trim().max(12_000).optional().default(''),
  accomplishments: z.string().trim().max(12_000).optional().default(''),
  challenges: z.string().trim().max(12_000).optional().default(''),
  supportNeeded: z.string().trim().max(8_000).optional().default(''),
});

const managerAssessmentSchema = assessmentResponseSchema.extend({
  summary: z.string().trim().max(12_000).optional().default(''),
  strengths: z.string().trim().max(12_000).optional().default(''),
  improvementAreas: z.string().trim().max(12_000).optional().default(''),
  recommendedRating: z.number().min(1).max(10).optional().nullable(),
});

const calibrationSchema = z.object({
  calibrationRating: z.number().min(1).max(10),
  notes: z.string().trim().min(3).max(8_000),
});

const acknowledgmentSchema = z.object({
  acknowledged: z.literal(true),
  comments: z.string().trim().max(8_000).optional().default(''),
});

const developmentPlanSchema = z.object({
  title: z.string().trim().min(3).max(300),
  purpose: z.string().trim().min(3).max(8_000),
  startDate: z.coerce.date().optional().nullable(),
  targetDate: z.coerce.date().optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional().default('ACTIVE'),
  employeeVisible: z.boolean().optional().default(true),
  acknowledgmentRequired: z.boolean().optional().default(true),
  actions: z.array(z.object({
    id: z.string().trim().min(1).max(120).optional().default(() => randomUUID()),
    title: z.string().trim().min(2).max(300),
    description: z.string().trim().max(4_000).optional().default(''),
    owner: z.enum(['EMPLOYEE', 'MANAGER', 'HR', 'SHARED']).optional().default('EMPLOYEE'),
    dueDate: z.coerce.date().optional().nullable(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).optional().default('NOT_STARTED'),
    courseCode: z.string().trim().max(120).optional().nullable(),
    evidenceUrl: z.string().trim().url().optional().nullable(),
  })).min(1).max(100),
});

const actionPlanSchema = z.object({
  title: z.string().trim().min(3).max(300),
  reason: z.string().trim().min(3).max(12_000),
  expectations: z.string().trim().min(3).max(12_000),
  supportProvided: z.string().trim().max(8_000).optional().default(''),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  severity: z.enum(['COACHING', 'FORMAL_WARNING', 'PERFORMANCE_IMPROVEMENT_PLAN', 'FINAL_WARNING']).optional().default('PERFORMANCE_IMPROVEMENT_PLAN'),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUCCESSFULLY_COMPLETED', 'EXTENDED', 'UNSUCCESSFUL', 'CANCELLED']).optional().default('ACTIVE'),
  employeeVisible: z.boolean().optional().default(true),
  acknowledgmentRequired: z.boolean().optional().default(true),
  confidentiality: z.enum(['MANAGEMENT_ONLY', 'HR_CONFIDENTIAL', 'EMPLOYEE_VISIBLE']).optional().default('EMPLOYEE_VISIBLE'),
}).refine(value => value.endDate > value.startDate, { message: 'Action-plan end date must be after the start date' });

const checkpointSchema = z.object({
  scheduledDate: z.coerce.date(),
  completedDate: z.coerce.date().optional().nullable(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'MISSED', 'RESCHEDULED']).optional().default('SCHEDULED'),
  employeeProgress: z.string().trim().max(8_000).optional().default(''),
  managerAssessment: z.string().trim().max(8_000).optional().default(''),
  outcome: z.enum(['ON_TRACK', 'NEEDS_IMPROVEMENT', 'MET', 'NOT_MET', 'PENDING']).optional().default('PENDING'),
  nextSteps: z.string().trim().max(8_000).optional().default(''),
});

const actionPlanStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUCCESSFULLY_COMPLETED', 'EXTENDED', 'UNSUCCESSFUL', 'CANCELLED']),
  endDate: z.coerce.date().optional().nullable(),
  resolutionNotes: z.string().trim().min(3).max(12_000),
});

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const isOwnerEmail = (value: unknown) => normalizeEmail(value) === OWNER_EMAIL;
const asObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return {};
};
const asArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed as T[] : []; }
    catch { return []; }
  }
  return [];
};
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const round2 = (value: number) => Math.round(value * 100) / 100;
const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function registerEmployeePerformanceRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  let readyPromise: Promise<void> | null = null;
  const ready = () => readyPromise ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePerformanceTemplate" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"name" TEXT NOT NULL,"description" TEXT NOT NULL DEFAULT '',
      "competencies" JSONB NOT NULL DEFAULT '[]'::jsonb,"ratingScale" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "goalWeight" NUMERIC(5,2) NOT NULL DEFAULT 50,"competencyWeight" NUMERIC(5,2) NOT NULL DEFAULT 50,
      "employeeSelfAssessment" BOOLEAN NOT NULL DEFAULT TRUE,"employeeAcknowledgment" BOOLEAN NOT NULL DEFAULT TRUE,
      "active" BOOLEAN NOT NULL DEFAULT TRUE,"createdById" TEXT NOT NULL,"updatedById" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceTemplate_org_idx" ON "EmployeePerformanceTemplate"("organizationId","active","name")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePerformanceCycle" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"templateId" TEXT NOT NULL,"name" TEXT NOT NULL,"description" TEXT NOT NULL DEFAULT '',
      "periodStart" DATE NOT NULL,"periodEnd" DATE NOT NULL,"selfAssessmentDueAt" TIMESTAMPTZ,"managerAssessmentDueAt" TIMESTAMPTZ,"acknowledgmentDueAt" TIMESTAMPTZ,
      "applicability" JSONB NOT NULL DEFAULT '{}'::jsonb,"status" TEXT NOT NULL DEFAULT 'DRAFT',"launchedAt" TIMESTAMPTZ,"closedAt" TIMESTAMPTZ,
      "createdById" TEXT NOT NULL,"updatedById" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceCycle_org_idx" ON "EmployeePerformanceCycle"("organizationId","status","periodEnd")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePerformanceReview" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"cycleId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"managerId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'EMPLOYEE_INPUT',"selfAssessmentDueAt" TIMESTAMPTZ,"managerAssessmentDueAt" TIMESTAMPTZ,"acknowledgmentDueAt" TIMESTAMPTZ,
      "employeeSubmittedAt" TIMESTAMPTZ,"managerSubmittedAt" TIMESTAMPTZ,"calibratedAt" TIMESTAMPTZ,"calibratedById" TEXT,
      "finalizedAt" TIMESTAMPTZ,"finalizedById" TEXT,"acknowledgedAt" TIMESTAMPTZ,"acknowledgmentComments" TEXT NOT NULL DEFAULT '',
      "finalScore" NUMERIC(6,2),"finalRating" NUMERIC(4,2),"calibrationRating" NUMERIC(4,2),"summary" TEXT NOT NULL DEFAULT '',
      "strengths" TEXT NOT NULL DEFAULT '',"improvementAreas" TEXT NOT NULL DEFAULT '',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePerformanceReview_cycle_employee_unique" ON "EmployeePerformanceReview"("organizationId","cycleId","employeeId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceReview_employee_idx" ON "EmployeePerformanceReview"("organizationId","employeeId","status","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceReview_manager_idx" ON "EmployeePerformanceReview"("organizationId","managerId","status","managerAssessmentDueAt")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePerformanceAssessment" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"reviewId" TEXT NOT NULL,"assessorUserId" TEXT NOT NULL,"assessorType" TEXT NOT NULL,
      "responses" JSONB NOT NULL DEFAULT '{}'::jsonb,"competencyScore" NUMERIC(6,2),"goalScore" NUMERIC(6,2),"overallRating" NUMERIC(4,2),
      "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePerformanceAssessment_review_type_unique" ON "EmployeePerformanceAssessment"("organizationId","reviewId","assessorType")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePerformanceGoal" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"cycleId" TEXT,"reviewId" TEXT,"createdById" TEXT NOT NULL,
      "title" TEXT NOT NULL,"description" TEXT NOT NULL,"category" TEXT NOT NULL DEFAULT 'PERFORMANCE',"metricType" TEXT NOT NULL DEFAULT 'PERCENT',
      "targetValue" NUMERIC,"currentValue" NUMERIC,"progressPercent" NUMERIC(5,2) NOT NULL DEFAULT 0,"unit" TEXT NOT NULL DEFAULT '',
      "startDate" DATE,"dueDate" DATE,"weight" NUMERIC(5,2) NOT NULL DEFAULT 0,"status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "employeeCanUpdate" BOOLEAN NOT NULL DEFAULT TRUE,"visibility" TEXT NOT NULL DEFAULT 'EMPLOYEE_VISIBLE',"approvedById" TEXT,"approvedAt" TIMESTAMPTZ,
      "completedAt" TIMESTAMPTZ,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceGoal_employee_idx" ON "EmployeePerformanceGoal"("organizationId","employeeId","status","dueDate")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceGoal_cycle_idx" ON "EmployeePerformanceGoal"("organizationId","cycleId","status")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePerformanceGoalUpdate" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"goalId" TEXT NOT NULL,"authorUserId" TEXT NOT NULL,"previousProgress" NUMERIC(5,2),
      "newProgress" NUMERIC(5,2),"previousValue" NUMERIC,"newValue" NUMERIC,"status" TEXT,"updateNote" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceGoalUpdate_goal_idx" ON "EmployeePerformanceGoalUpdate"("organizationId","goalId","createdAt" DESC)`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeDevelopmentPlan" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"reviewId" TEXT,"createdById" TEXT NOT NULL,
      "title" TEXT NOT NULL,"purpose" TEXT NOT NULL,"actions" JSONB NOT NULL DEFAULT '[]'::jsonb,"startDate" DATE,"targetDate" DATE,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',"employeeVisible" BOOLEAN NOT NULL DEFAULT TRUE,"acknowledgmentRequired" BOOLEAN NOT NULL DEFAULT TRUE,
      "acknowledgedAt" TIMESTAMPTZ,"acknowledgmentComments" TEXT NOT NULL DEFAULT '',"completedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeDevelopmentPlan_employee_idx" ON "EmployeeDevelopmentPlan"("organizationId","employeeId","status","targetDate")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePerformanceActionPlan" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"reviewId" TEXT,"createdById" TEXT NOT NULL,
      "title" TEXT NOT NULL,"reason" TEXT NOT NULL,"expectations" TEXT NOT NULL,"supportProvided" TEXT NOT NULL DEFAULT '',
      "startDate" DATE NOT NULL,"endDate" DATE NOT NULL,"severity" TEXT NOT NULL DEFAULT 'PERFORMANCE_IMPROVEMENT_PLAN',"status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "employeeVisible" BOOLEAN NOT NULL DEFAULT TRUE,"acknowledgmentRequired" BOOLEAN NOT NULL DEFAULT TRUE,"confidentiality" TEXT NOT NULL DEFAULT 'EMPLOYEE_VISIBLE',
      "acknowledgedAt" TIMESTAMPTZ,"acknowledgmentComments" TEXT NOT NULL DEFAULT '',"resolutionNotes" TEXT NOT NULL DEFAULT '',"resolvedAt" TIMESTAMPTZ,"resolvedById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceActionPlan_employee_idx" ON "EmployeePerformanceActionPlan"("organizationId","employeeId","status","endDate")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePerformanceCheckpoint" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"actionPlanId" TEXT NOT NULL,"createdById" TEXT NOT NULL,"scheduledDate" DATE NOT NULL,
      "completedDate" DATE,"status" TEXT NOT NULL DEFAULT 'SCHEDULED',"employeeProgress" TEXT NOT NULL DEFAULT '',"managerAssessment" TEXT NOT NULL DEFAULT '',
      "outcome" TEXT NOT NULL DEFAULT 'PENDING',"nextSteps" TEXT NOT NULL DEFAULT '',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceCheckpoint_plan_idx" ON "EmployeePerformanceCheckpoint"("organizationId","actionPlanId","scheduledDate")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePerformanceEvent" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"actorUserId" TEXT,"eventType" TEXT NOT NULL,
      "resourceType" TEXT NOT NULL,"resourceId" TEXT,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePerformanceEvent_employee_idx" ON "EmployeePerformanceEvent"("organizationId","employeeId","createdAt" DESC)`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeNotification" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"userId" TEXT NOT NULL,"notificationType" TEXT NOT NULL,"title" TEXT NOT NULL,"message" TEXT NOT NULL,
      "actionUrl" TEXT,"relatedType" TEXT,"relatedId" TEXT,"dedupeKey" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'UNREAD',
      "emailStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',"emailError" TEXT,"providerMessageId" TEXT,"readAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeNotification_dedupe_unique" ON "EmployeeNotification"("organizationId","userId","dedupeKey")`);
  })().catch(error => { readyPromise = null; throw error; });

  const managerGate = requireRoles(...managerRoles);
  const tableExists = async (name: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(`SELECT to_regclass($1::text)::text AS "name"`, `public."${name}"`);
    return Boolean(rows[0]?.name);
  };

  const actorIdentity = async (auth: AuthContext) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string | null; role: string }>>(
      `SELECT "email","role"::text AS "role" FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`, auth.userId, auth.organizationId,
    );
    const email = normalizeEmail(rows[0]?.email || auth.email);
    return { email, role: String(rows[0]?.role || auth.role), isOwner: email === OWNER_EMAIL };
  };

  const employeeById = async (organizationId: string, employeeId: string): Promise<EmployeeRow> => {
    const hasAssignments = await tableExists('TimeAttendanceLocationAssignment');
    const locationProjection = hasAssignments
      ? `ARRAY(SELECT x."locationId" FROM "TimeAttendanceLocationAssignment" x WHERE x."organizationId"=u."organizationId" AND x."employeeId"=u."id" AND x."active"=TRUE) AS "locationIds"`
      : `ARRAY[]::text[] AS "locationIds"`;
    const rows = await prisma.$queryRawUnsafe<EmployeeRow[]>(
      `SELECT u."id",u."email",u."role"::text AS "role",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "displayName",
              p."department",p."jobTitle",COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus",p."hireDate",p."supervisorId",${locationProjection}
       FROM "User" u LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
       WHERE u."organizationId"=$1 AND u."id"=$2 LIMIT 1`, organizationId, employeeId,
    );
    if (!rows[0]) throw Object.assign(new Error('Employee was not found'), { status: 404 });
    return { ...rows[0], displayName: isOwnerEmail(rows[0].email) ? OWNER_NAME : rows[0].displayName, locationIds: Array.isArray(rows[0].locationIds) ? rows[0].locationIds.map(String) : [] };
  };

  const allEmployees = async (organizationId: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "User" WHERE "organizationId"=$1`, organizationId);
    return Promise.all(rows.map(row => employeeById(organizationId, row.id)));
  };

  const scopedEmployeeIds = async (auth: AuthContext) => {
    const identity = await actorIdentity(auth);
    if (identity.isOwner || globalRoles.has(auth.role)) {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "User" WHERE "organizationId"=$1`, auth.organizationId);
      return rows.map(row => String(row.id));
    }
    if (!locationRoles.has(auth.role) || !(await tableExists('TimeAttendanceLocationAssignment'))) return [auth.userId];
    const managerOnly = auth.role === UserRole.HOUSE_MANAGER;
    const rows = await prisma.$queryRawUnsafe<Array<{ employeeId: string }>>(
      `SELECT DISTINCT target."employeeId" FROM "TimeAttendanceLocationAssignment" actor
       JOIN "TimeAttendanceLocationAssignment" target ON target."organizationId"=actor."organizationId" AND target."locationId"=actor."locationId" AND target."active"=TRUE
       WHERE actor."organizationId"=$1 AND actor."employeeId"=$2 AND actor."active"=TRUE AND ($3::boolean=FALSE OR actor."isManager"=TRUE)`,
      auth.organizationId, auth.userId, managerOnly,
    );
    return [...new Set([auth.userId, ...rows.map(row => String(row.employeeId))])];
  };

  const assertScope = async (auth: AuthContext, employeeId: string) => {
    const ids = await scopedEmployeeIds(auth);
    if (!ids.includes(employeeId)) throw Object.assign(new Error('You do not have performance-management access to this employee'), { status: 403 });
  };

  const requireWritableManager = async (auth: AuthContext) => {
    if (auth.role === UserRole.AUDITOR) throw Object.assign(new Error('Auditor performance access is read only'), { status: 403 });
  };

  const requirePerformanceManager = async (auth: AuthContext) => {
    const identity = await actorIdentity(auth);
    if (!identity.isOwner && !performanceManagerRoles.has(auth.role)) {
      throw Object.assign(new Error('Only the Enterprise Owner, Human Resources, or an Administrator may manage performance templates and review cycles'), { status: 403 });
    }
    return identity;
  };

  const event = async (organizationId: string, employeeId: string, actorUserId: string | null, eventType: string, resourceType: string, resourceId: string | null, details: object = {}) => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeePerformanceEvent" ("id","organizationId","employeeId","actorUserId","eventType","resourceType","resourceId","details")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, randomUUID(), organizationId, employeeId, actorUserId, eventType, resourceType, resourceId, JSON.stringify(details),
    );
  };

  const notification = async (input: { organizationId: string; userId: string; title: string; message: string; relatedType: string; relatedId: string; dedupeKey: string; actionUrl: string; email?: boolean }) => {
    const id = randomUUID();
    const inserted = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "EmployeeNotification" ("id","organizationId","userId","notificationType","title","message","actionUrl","relatedType","relatedId","dedupeKey","emailStatus")
       VALUES ($1,$2,$3,'PERFORMANCE',$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT ("organizationId","userId","dedupeKey") DO NOTHING RETURNING "id"`,
      id, input.organizationId, input.userId, input.title, input.message, input.actionUrl, input.relatedType, input.relatedId, input.dedupeKey, input.email ? 'QUEUED' : 'NOT_REQUESTED',
    );
    if (!inserted[0] || !input.email) return;
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string | null }>>(`SELECT "email" FROM "User" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, input.organizationId, input.userId);
    const recipient = normalizeEmail(rows[0]?.email);
    if (!recipient) {
      await prisma.$executeRawUnsafe(`UPDATE "EmployeeNotification" SET "emailStatus"='FAILED',"emailError"='Employee email is unavailable',"updatedAt"=NOW() WHERE "id"=$1`, id);
      return;
    }
    try {
      const host = process.env.SMTP_HOST?.trim();
      const user = process.env.SMTP_USER?.trim();
      const pass = process.env.SMTP_PASS;
      const port = Number(process.env.SMTP_PORT || 587);
      if (!host || !user || !pass) throw new Error('SMTP is not configured');
      const transport = createTransport({ host, port, secure: port === 465, auth: { user, pass }, tls: { minVersion: 'TLSv1.2' } });
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#182533;max-width:700px"><div style="background:#075493;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0"><h2 style="margin:0">Sulandra Health Employee 360</h2></div><div style="border:1px solid #cbd7e1;border-top:0;padding:22px;border-radius:0 0 8px 8px"><h3 style="color:#075493">${escapeHtml(input.title)}</h3><p>${escapeHtml(input.message)}</p><p><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#0784c6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:700">Open Employee 360</a></p><p style="margin-top:28px"><strong><em style="color:#159bd3">Sulandra Health Human Resources Department</em></strong></p><p style="font-size:12px;color:#637080">This is an automated performance-management notice. Please do not reply to this message.</p></div></div>`;
      const result = await transport.sendMail({ from: `"Sulandra Health Human Resources Department" <${user}>`, to: recipient, subject: input.title, text: `${input.message}\n\n${input.actionUrl}`, html });
      await prisma.$executeRawUnsafe(`UPDATE "EmployeeNotification" SET "emailStatus"='SENT',"providerMessageId"=$1,"emailError"=NULL,"updatedAt"=NOW() WHERE "id"=$2`, String(result.messageId || ''), id);
    } catch (error) {
      await prisma.$executeRawUnsafe(`UPDATE "EmployeeNotification" SET "emailStatus"='FAILED',"emailError"=$1,"updatedAt"=NOW() WHERE "id"=$2`, error instanceof Error ? error.message : String(error), id);
    }
  };

  const defaultCompetencies: TemplateCompetency[] = [
    { id: 'quality', name: 'Quality and Accuracy', description: 'Produces accurate, complete, timely, and compliant work.', weight: 20 },
    { id: 'safety', name: 'Safety and Risk Awareness', description: 'Protects clients, coworkers, records, and organizational resources.', weight: 20 },
    { id: 'communication', name: 'Communication', description: 'Communicates respectfully, clearly, promptly, and professionally.', weight: 15 },
    { id: 'teamwork', name: 'Teamwork and Reliability', description: 'Collaborates, follows through, and supports continuity of care and operations.', weight: 15 },
    { id: 'person_centered', name: 'Person-Centered Service', description: 'Demonstrates dignity, respect, choice, compassion, and client-focused support.', weight: 20 },
    { id: 'growth', name: 'Learning and Growth', description: 'Uses feedback, training, and reflection to improve performance.', weight: 10 },
  ];
  const defaultRatingScale = [
    { value: 1, label: 'Does Not Meet Expectations', description: 'Performance consistently falls below requirements.' },
    { value: 2, label: 'Needs Improvement', description: 'Performance partially meets requirements but improvement is necessary.' },
    { value: 3, label: 'Meets Expectations', description: 'Performance consistently meets the requirements of the role.' },
    { value: 4, label: 'Exceeds Expectations', description: 'Performance frequently exceeds role requirements.' },
    { value: 5, label: 'Exceptional', description: 'Performance is consistently outstanding and has broad positive impact.' },
  ];

  const ensureDefaults = async (organizationId: string, actorUserId: string) => {
    await ready();
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "EmployeePerformanceTemplate" WHERE "organizationId"=$1 LIMIT 1`, organizationId);
    if (!existing[0]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeePerformanceTemplate" ("id","organizationId","name","description","competencies","ratingScale","goalWeight","competencyWeight","employeeSelfAssessment","employeeAcknowledgment","active","createdById","updatedById")
         VALUES ($1,$2,'Sulandra Annual Performance Review','Balanced annual review covering measurable goals, core competencies, development, and employee acknowledgment.',$3::jsonb,$4::jsonb,50,50,TRUE,TRUE,TRUE,$5,$5)`,
        randomUUID(), organizationId, JSON.stringify(defaultCompetencies), JSON.stringify(defaultRatingScale), actorUserId,
      );
    }
  };

  const reviewById = async (organizationId: string, reviewId: string): Promise<ReviewRow> => {
    const rows = await prisma.$queryRawUnsafe<ReviewRow[]>(`SELECT * FROM "EmployeePerformanceReview" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, organizationId, reviewId);
    if (!rows[0]) throw Object.assign(new Error('Performance review was not found'), { status: 404 });
    return rows[0];
  };

  const reviewDetails = async (organizationId: string, reviewId: string) => {
    const review = await reviewById(organizationId, reviewId);
    const [cycleRows, assessments, goals, events, employee, managerRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT c.*,t."name" AS "templateName",t."description" AS "templateDescription",t."competencies",t."ratingScale",t."goalWeight",t."competencyWeight",t."employeeSelfAssessment",t."employeeAcknowledgment"
         FROM "EmployeePerformanceCycle" c JOIN "EmployeePerformanceTemplate" t ON t."id"=c."templateId" AND t."organizationId"=c."organizationId"
         WHERE c."organizationId"=$1 AND c."id"=$2 LIMIT 1`, organizationId, review.cycleId,
      ),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceAssessment" WHERE "organizationId"=$1 AND "reviewId"=$2 ORDER BY "submittedAt"`, organizationId, review.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceGoal" WHERE "organizationId"=$1 AND "employeeId"=$2 AND ("reviewId"=$3 OR "cycleId"=$4) ORDER BY "dueDate" NULLS LAST,"createdAt"`, organizationId, review.employeeId, review.id, review.cycleId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceEvent" WHERE "organizationId"=$1 AND "resourceType"='REVIEW' AND "resourceId"=$2 ORDER BY "createdAt"`, organizationId, review.id),
      employeeById(organizationId, review.employeeId),
      review.managerId ? prisma.$queryRawUnsafe<any[]>(`SELECT u."id",u."email",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName" FROM "User" u LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId" WHERE u."organizationId"=$1 AND u."id"=$2 LIMIT 1`, organizationId, review.managerId) : Promise.resolve([]),
    ]);
    const cycle = cycleRows[0];
    if (!cycle) throw Object.assign(new Error('Performance review cycle was not found'), { status: 404 });
    cycle.competencies = asArray<TemplateCompetency>(cycle.competencies);
    cycle.ratingScale = asArray(cycle.ratingScale);
    return { review, cycle, employee, manager: managerRows[0] || null, assessments: assessments.map(row => ({ ...row, responses: asObject(row.responses) })), goals, events };
  };

  const assessmentScores = (responses: z.infer<typeof assessmentResponseSchema>) => {
    const competencyScore = average(responses.competencyRatings.map(item => Number(item.rating)));
    const goalScore = average(responses.goalRatings.map(item => Number(item.rating)));
    return { competencyScore: round2(competencyScore), goalScore: round2(goalScore), overallRating: round2(average([competencyScore, ...(goalScore ? [goalScore] : [])])) };
  };

  const recomputeReview = async (organizationId: string, reviewId: string) => {
    const details = await reviewDetails(organizationId, reviewId);
    const managerAssessment = details.assessments.find(item => item.assessorType === 'MANAGER');
    if (!managerAssessment) return details.review;
    const goalWeight = Number(details.cycle.goalWeight || 50) / 100;
    const competencyWeight = Number(details.cycle.competencyWeight || 50) / 100;
    const goalScore = Number(managerAssessment.goalScore || 0);
    const competencyScore = Number(managerAssessment.competencyScore || 0);
    const weighted = goalScore ? goalScore * goalWeight + competencyScore * competencyWeight : competencyScore;
    const finalRating = details.review.calibrationRating == null ? Number(managerAssessment.overallRating || weighted) : Number(details.review.calibrationRating);
    await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceReview" SET "finalScore"=$1,"finalRating"=$2,"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4`, round2(weighted), round2(finalRating), organizationId, reviewId);
    return reviewById(organizationId, reviewId);
  };

  const applicabilityMatches = (employee: EmployeeRow, applicabilityValue: unknown) => {
    const applicability = asObject(applicabilityValue);
    const roles = asArray<string>(applicability.roles).map(String);
    const departments = asArray<string>(applicability.departments).map(String);
    const jobTitles = asArray<string>(applicability.jobTitles).map(String);
    const locationIds = asArray<string>(applicability.locationIds).map(String);
    const statuses = asArray<string>(applicability.employmentStatuses).map(String);
    if (roles.length && !roles.includes(employee.role)) return false;
    if (departments.length && !departments.includes(String(employee.department || ''))) return false;
    if (jobTitles.length && !jobTitles.includes(String(employee.jobTitle || ''))) return false;
    if (locationIds.length && !employee.locationIds.some(id => locationIds.includes(id))) return false;
    if (statuses.length && !statuses.includes(employee.employmentStatus)) return false;
    return !isOwnerEmail(employee.email) || true;
  };

  const launchCycle = async (auth: AuthContext, cycleId: string) => {
    await requirePerformanceManager(auth);
    const cycles = await prisma.$queryRawUnsafe<any[]>(
      `SELECT c.*,t."employeeSelfAssessment" FROM "EmployeePerformanceCycle" c JOIN "EmployeePerformanceTemplate" t ON t."id"=c."templateId" AND t."organizationId"=c."organizationId" WHERE c."organizationId"=$1 AND c."id"=$2 LIMIT 1`,
      auth.organizationId, cycleId,
    );
    const cycle = cycles[0];
    if (!cycle) throw Object.assign(new Error('Performance cycle was not found'), { status: 404 });
    if (cycle.status === 'CLOSED' || cycle.status === 'ARCHIVED') throw Object.assign(new Error('A closed or archived cycle cannot be launched'), { status: 409 });
    const employees = (await allEmployees(auth.organizationId)).filter(employee => applicabilityMatches(employee, cycle.applicability));
    let created = 0;
    for (const employee of employees) {
      const managerId = employee.supervisorId || (await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "User" WHERE "organizationId"=$1 AND LOWER(COALESCE("email",''))=$2 LIMIT 1`, auth.organizationId, OWNER_EMAIL))[0]?.id || null;
      const reviewId = randomUUID();
      const status = cycle.employeeSelfAssessment ? 'EMPLOYEE_INPUT' : 'MANAGER_REVIEW';
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO "EmployeePerformanceReview" ("id","organizationId","cycleId","employeeId","managerId","status","selfAssessmentDueAt","managerAssessmentDueAt","acknowledgmentDueAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT ("organizationId","cycleId","employeeId") DO NOTHING RETURNING "id"`,
        reviewId, auth.organizationId, cycle.id, employee.id, managerId, status, cycle.selfAssessmentDueAt || null, cycle.managerAssessmentDueAt || null, cycle.acknowledgmentDueAt || null,
      );
      if (!rows[0]) continue;
      created += 1;
      await event(auth.organizationId, employee.id, auth.userId, 'REVIEW_ASSIGNED', 'REVIEW', reviewId, { cycleId: cycle.id, managerId });
      await notification({ organizationId: auth.organizationId, userId: employee.id, title: `Performance review assigned: ${cycle.name}`, message: cycle.employeeSelfAssessment ? 'A new performance review is ready for your self-assessment.' : 'A new performance review has been assigned. You will be notified when acknowledgment is required.', relatedType: 'EmployeePerformanceReview', relatedId: reviewId, dedupeKey: `review-assigned:${reviewId}:${employee.id}`, actionUrl: EMPLOYEE_URL, email: true });
      if (managerId) await notification({ organizationId: auth.organizationId, userId: managerId, title: `Performance review responsibility: ${employee.displayName}`, message: `You are assigned as the manager reviewer for ${employee.displayName} in ${cycle.name}.`, relatedType: 'EmployeePerformanceReview', relatedId: reviewId, dedupeKey: `review-manager-assigned:${reviewId}:${managerId}`, actionUrl: ADMIN_URL, email: true });
    }
    await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceCycle" SET "status"='OPEN',"launchedAt"=COALESCE("launchedAt",NOW()),"updatedById"=$1,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "id"=$3`, auth.userId, auth.organizationId, cycle.id);
    await audit?.(auth, 'LAUNCH_PERFORMANCE_CYCLE', 'EmployeePerformanceCycle', cycle.id, { createdReviewCount: created, eligibleEmployeeCount: employees.length });
    return { created, eligible: employees.length };
  };

  const employeeVisibilityFilter = (role: UserRole, identity: { isOwner: boolean }) => identity.isOwner || role === UserRole.HR_MANAGER || role === UserRole.ADMINISTRATOR;

  app.get('/api/employee/me/performance', async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await ensureDefaults(auth.organizationId, auth.userId);
      const employee = await employeeById(auth.organizationId, auth.userId);
      const [reviews, goals, developmentPlans, actionPlans, recognition, feedback] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT r.*,c."name" AS "cycleName",c."periodStart",c."periodEnd",t."name" AS "templateName"
           FROM "EmployeePerformanceReview" r JOIN "EmployeePerformanceCycle" c ON c."id"=r."cycleId" AND c."organizationId"=r."organizationId"
           JOIN "EmployeePerformanceTemplate" t ON t."id"=c."templateId" AND t."organizationId"=c."organizationId"
           WHERE r."organizationId"=$1 AND r."employeeId"=$2 ORDER BY c."periodEnd" DESC,r."createdAt" DESC`, auth.organizationId, auth.userId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "EmployeePerformanceGoal" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "visibility"='EMPLOYEE_VISIBLE' ORDER BY CASE "status" WHEN 'AT_RISK' THEN 0 WHEN 'ACTIVE' THEN 1 ELSE 2 END,"dueDate" NULLS LAST`, auth.organizationId, auth.userId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "EmployeeDevelopmentPlan" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "employeeVisible"=TRUE ORDER BY "targetDate" NULLS LAST,"createdAt" DESC`, auth.organizationId, auth.userId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "EmployeePerformanceActionPlan" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "employeeVisible"=TRUE AND "confidentiality"='EMPLOYEE_VISIBLE' ORDER BY CASE "status" WHEN 'ACTIVE' THEN 0 ELSE 1 END,"endDate" DESC`, auth.organizationId, auth.userId,
        ),
        tableExists('EmployeeRecognition').then(exists => exists ? prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeRecognition" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='ACTIVE' AND "visibility"<>'MANAGEMENT_ONLY' ORDER BY "awardDate" DESC LIMIT 100`, auth.organizationId, auth.userId) : []),
        tableExists('EmployeeTeamFeedback').then(exists => exists ? prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeTeamFeedback" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='ACTIVE' AND "visibility"='EMPLOYEE_VISIBLE' ORDER BY "createdAt" DESC LIMIT 100`, auth.organizationId, auth.userId) : []),
      ]);
      const normalizedPlans = developmentPlans.map(row => ({ ...row, actions: asArray(row.actions) }));
      res.json({ data: { employee, reviews, goals, developmentPlans: normalizedPlans, actionPlans, recognition, feedback, metrics: {
        activeReviews: reviews.filter(row => !['COMPLETED', 'CANCELLED'].includes(String(row.status))).length,
        activeGoals: goals.filter(row => ['ACTIVE', 'AT_RISK', 'PENDING_APPROVAL'].includes(String(row.status))).length,
        goalsAtRisk: goals.filter(row => row.status === 'AT_RISK' || (row.dueDate && new Date(row.dueDate).getTime() < Date.now() && row.status !== 'COMPLETED')).length,
        pendingAcknowledgments: reviews.filter(row => row.status === 'ACKNOWLEDGMENT' && !row.acknowledgedAt).length + developmentPlans.filter(row => row.acknowledgmentRequired && !row.acknowledgedAt).length + actionPlans.filter(row => row.acknowledgmentRequired && !row.acknowledgedAt).length,
        activeDevelopmentPlans: developmentPlans.filter(row => row.status === 'ACTIVE').length,
      } } });
    } catch (error) { next(error); }
  });

  app.get('/api/employee/me/performance/reviews/:reviewId', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const review = await reviewById(auth.organizationId, req.params.reviewId);
      if (review.employeeId !== auth.userId) return void res.status(404).json({ error: 'Performance review was not found' });
      res.json({ data: await reviewDetails(auth.organizationId, review.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/performance/reviews/:reviewId/self-assessment', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const review = await reviewById(auth.organizationId, req.params.reviewId);
      if (review.employeeId !== auth.userId) return void res.status(404).json({ error: 'Performance review was not found' });
      if (!['EMPLOYEE_INPUT', 'DRAFT'].includes(review.status)) return void res.status(409).json({ error: 'This review is no longer accepting employee self-assessment' });
      const input = assessmentResponseSchema.parse(req.body);
      const scores = assessmentScores(input);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeePerformanceAssessment" ("id","organizationId","reviewId","assessorUserId","assessorType","responses","competencyScore","goalScore","overallRating")
         VALUES ($1,$2,$3,$4,'EMPLOYEE',$5::jsonb,$6,$7,$8)
         ON CONFLICT ("organizationId","reviewId","assessorType") DO UPDATE SET "assessorUserId"=EXCLUDED."assessorUserId","responses"=EXCLUDED."responses","competencyScore"=EXCLUDED."competencyScore","goalScore"=EXCLUDED."goalScore","overallRating"=EXCLUDED."overallRating","submittedAt"=NOW(),"updatedAt"=NOW()`,
        id, auth.organizationId, review.id, auth.userId, JSON.stringify(input), scores.competencyScore, scores.goalScore, scores.overallRating,
      );
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceReview" SET "status"='MANAGER_REVIEW',"employeeSubmittedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=$1 AND "id"=$2`, auth.organizationId, review.id);
      await event(auth.organizationId, auth.userId, auth.userId, 'SELF_ASSESSMENT_SUBMITTED', 'REVIEW', review.id, scores);
      if (review.managerId) await notification({ organizationId: auth.organizationId, userId: review.managerId, title: 'Employee self-assessment ready for manager review', message: `${(await employeeById(auth.organizationId, auth.userId)).displayName} submitted a self-assessment.`, relatedType: 'EmployeePerformanceReview', relatedId: review.id, dedupeKey: `self-assessment-submitted:${review.id}:${review.managerId}`, actionUrl: ADMIN_URL, email: true });
      await audit?.(auth, 'SUBMIT_PERFORMANCE_SELF_ASSESSMENT', 'EmployeePerformanceReview', review.id, scores);
      res.json({ data: await reviewDetails(auth.organizationId, review.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/performance/goals', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const input = goalSchema.parse({ ...req.body, status: 'PENDING_APPROVAL', visibility: 'EMPLOYEE_VISIBLE' });
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeePerformanceGoal" ("id","organizationId","employeeId","cycleId","createdById","title","description","category","metricType","targetValue","currentValue","unit","startDate","dueDate","weight","status","employeeCanUpdate","visibility")
         VALUES ($1,$2,$3,$4,$3,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'PENDING_APPROVAL',$15,'EMPLOYEE_VISIBLE')`,
        id, auth.organizationId, auth.userId, input.cycleId || null, input.title, input.description, input.category, input.metricType, input.targetValue ?? null, input.currentValue ?? null, input.unit, input.startDate ?? null, input.dueDate ?? null, input.weight, input.employeeCanUpdate,
      );
      const employee = await employeeById(auth.organizationId, auth.userId);
      if (employee.supervisorId) await notification({ organizationId: auth.organizationId, userId: employee.supervisorId, title: `Goal approval requested: ${employee.displayName}`, message: `${employee.displayName} proposed a performance or development goal for manager approval.`, relatedType: 'EmployeePerformanceGoal', relatedId: id, dedupeKey: `goal-approval:${id}:${employee.supervisorId}`, actionUrl: ADMIN_URL, email: true });
      await event(auth.organizationId, auth.userId, auth.userId, 'GOAL_PROPOSED', 'GOAL', id, { title: input.title });
      await audit?.(auth, 'PROPOSE_PERFORMANCE_GOAL', 'EmployeePerformanceGoal', id, { title: input.title });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.patch('/api/employee/me/performance/goals/:goalId/progress', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const input = goalProgressSchema.parse(req.body);
      const current = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceGoal" WHERE "organizationId"=$1 AND "id"=$2 AND "employeeId"=$3 LIMIT 1`, auth.organizationId, req.params.goalId, auth.userId);
      const goal = current[0];
      if (!goal) return void res.status(404).json({ error: 'Performance goal was not found' });
      if (!goal.employeeCanUpdate) return void res.status(403).json({ error: 'This goal can only be updated by management' });
      if (!['ACTIVE', 'AT_RISK'].includes(goal.status)) return void res.status(409).json({ error: 'This goal is not open for progress updates' });
      const progress = input.progressPercent ?? (input.currentValue != null && goal.targetValue != null && Number(goal.targetValue) !== 0 ? Math.min(100, Math.max(0, Number(input.currentValue) / Number(goal.targetValue) * 100)) : Number(goal.progressPercent || 0));
      const nextStatus = input.status || (progress >= 100 ? 'COMPLETED' : goal.status);
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeePerformanceGoal" SET "currentValue"=COALESCE($1,"currentValue"),"progressPercent"=$2,"status"=$3,"completedAt"=CASE WHEN $3='COMPLETED' THEN COALESCE("completedAt",NOW()) ELSE NULL END,"updatedAt"=NOW() WHERE "id"=$4`,
        input.currentValue ?? null, round2(progress), nextStatus, goal.id,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeePerformanceGoalUpdate" ("id","organizationId","goalId","authorUserId","previousProgress","newProgress","previousValue","newValue","status","updateNote") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        randomUUID(), auth.organizationId, goal.id, auth.userId, goal.progressPercent, round2(progress), goal.currentValue, input.currentValue ?? goal.currentValue, nextStatus, input.updateNote,
      );
      await event(auth.organizationId, auth.userId, auth.userId, 'GOAL_PROGRESS_UPDATED', 'GOAL', goal.id, { progressPercent: round2(progress), status: nextStatus });
      await audit?.(auth, 'UPDATE_PERFORMANCE_GOAL_PROGRESS', 'EmployeePerformanceGoal', goal.id, { progressPercent: round2(progress), status: nextStatus });
      res.json({ data: { id: goal.id, progressPercent: round2(progress), status: nextStatus } });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/performance/reviews/:reviewId/acknowledge', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const input = acknowledgmentSchema.parse(req.body);
      const review = await reviewById(auth.organizationId, req.params.reviewId);
      if (review.employeeId !== auth.userId) return void res.status(404).json({ error: 'Performance review was not found' });
      if (!['ACKNOWLEDGMENT', 'COMPLETED'].includes(review.status)) return void res.status(409).json({ error: 'This review is not ready for acknowledgment' });
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceReview" SET "status"='COMPLETED',"acknowledgedAt"=NOW(),"acknowledgmentComments"=$1,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "id"=$3`, input.comments, auth.organizationId, review.id);
      await event(auth.organizationId, auth.userId, auth.userId, 'REVIEW_ACKNOWLEDGED', 'REVIEW', review.id, { comments: input.comments });
      await audit?.(auth, 'ACKNOWLEDGE_PERFORMANCE_REVIEW', 'EmployeePerformanceReview', review.id);
      res.json({ data: await reviewById(auth.organizationId, review.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/performance/development-plans/:planId/acknowledge', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const input = acknowledgmentSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "EmployeeDevelopmentPlan" SET "acknowledgedAt"=NOW(),"acknowledgmentComments"=$1,"updatedAt"=NOW()
         WHERE "organizationId"=$2 AND "id"=$3 AND "employeeId"=$4 AND "employeeVisible"=TRUE RETURNING *`, input.comments, auth.organizationId, req.params.planId, auth.userId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Development plan was not found' });
      await event(auth.organizationId, auth.userId, auth.userId, 'DEVELOPMENT_PLAN_ACKNOWLEDGED', 'DEVELOPMENT_PLAN', req.params.planId, {});
      await audit?.(auth, 'ACKNOWLEDGE_DEVELOPMENT_PLAN', 'EmployeeDevelopmentPlan', req.params.planId);
      res.json({ data: { ...rows[0], actions: asArray(rows[0].actions) } });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/performance/action-plans/:planId/acknowledge', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const input = acknowledgmentSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "EmployeePerformanceActionPlan" SET "acknowledgedAt"=NOW(),"acknowledgmentComments"=$1,"updatedAt"=NOW()
         WHERE "organizationId"=$2 AND "id"=$3 AND "employeeId"=$4 AND "employeeVisible"=TRUE AND "confidentiality"='EMPLOYEE_VISIBLE' RETURNING *`, input.comments, auth.organizationId, req.params.planId, auth.userId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Performance action plan was not found' });
      await event(auth.organizationId, auth.userId, auth.userId, 'ACTION_PLAN_ACKNOWLEDGED', 'ACTION_PLAN', req.params.planId, {});
      await audit?.(auth, 'ACKNOWLEDGE_PERFORMANCE_ACTION_PLAN', 'EmployeePerformanceActionPlan', req.params.planId);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employee-performance/dashboard', managerGate, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await ensureDefaults(auth.organizationId, auth.userId);
      const identity = await actorIdentity(auth);
      const ids = await scopedEmployeeIds(auth);
      const employees = (await Promise.all(ids.map(id => employeeById(auth.organizationId, id)))).filter(employee => employee.id !== auth.userId);
      const [reviews, goals, plans, actionPlans, cycles, templates] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT r.*,c."name" AS "cycleName",c."periodStart",c."periodEnd",COALESCE(NULLIF(pc."displayName",''),NULLIF(pp."displayName",''),u."email",r."employeeId") AS "employeeName"
           FROM "EmployeePerformanceReview" r JOIN "EmployeePerformanceCycle" c ON c."id"=r."cycleId" AND c."organizationId"=r."organizationId"
           JOIN "User" u ON u."id"=r."employeeId" LEFT JOIN "EmployeePortalCredential" pc ON pc."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" pp ON pp."userId"=u."id" AND pp."organizationId"=u."organizationId"
           WHERE r."organizationId"=$1 AND r."employeeId"=ANY($2::text[]) ORDER BY c."periodEnd" DESC,r."createdAt" DESC LIMIT 1000`, auth.organizationId, ids,
        ),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceGoal" WHERE "organizationId"=$1 AND "employeeId"=ANY($2::text[]) ORDER BY "dueDate" NULLS LAST,"createdAt" DESC LIMIT 2000`, auth.organizationId, ids),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeDevelopmentPlan" WHERE "organizationId"=$1 AND "employeeId"=ANY($2::text[]) ORDER BY "targetDate" NULLS LAST,"createdAt" DESC LIMIT 1000`, auth.organizationId, ids),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceActionPlan" WHERE "organizationId"=$1 AND "employeeId"=ANY($2::text[]) ORDER BY CASE "status" WHEN 'ACTIVE' THEN 0 ELSE 1 END,"endDate" LIMIT 1000`, auth.organizationId, ids),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceCycle" WHERE "organizationId"=$1 ORDER BY "periodEnd" DESC,"createdAt" DESC`, auth.organizationId),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceTemplate" WHERE "organizationId"=$1 ORDER BY "active" DESC,"name"`, auth.organizationId),
      ]);
      const team = employees.map(employee => {
        const employeeReviews = reviews.filter(row => row.employeeId === employee.id);
        const employeeGoals = goals.filter(row => row.employeeId === employee.id);
        const employeePlans = plans.filter(row => row.employeeId === employee.id);
        const employeeActions = actionPlans.filter(row => row.employeeId === employee.id);
        return {
          ...employee,
          activeReviewCount: employeeReviews.filter(row => !['COMPLETED', 'CANCELLED'].includes(String(row.status))).length,
          pendingSelfAssessmentCount: employeeReviews.filter(row => row.status === 'EMPLOYEE_INPUT').length,
          pendingManagerReviewCount: employeeReviews.filter(row => row.status === 'MANAGER_REVIEW').length,
          pendingAcknowledgmentCount: employeeReviews.filter(row => row.status === 'ACKNOWLEDGMENT').length,
          activeGoalCount: employeeGoals.filter(row => ['ACTIVE', 'AT_RISK', 'PENDING_APPROVAL'].includes(String(row.status))).length,
          goalsAtRiskCount: employeeGoals.filter(row => row.status === 'AT_RISK' || (row.dueDate && new Date(row.dueDate).getTime() < Date.now() && row.status !== 'COMPLETED')).length,
          activeDevelopmentPlanCount: employeePlans.filter(row => row.status === 'ACTIVE').length,
          activeActionPlanCount: employeeActions.filter(row => row.status === 'ACTIVE').length,
          latestRating: employeeReviews.find(row => row.finalRating != null)?.finalRating ?? null,
        };
      });
      res.json({ data: { permissions: {
        actorIsOwner: identity.isOwner,
        readOnly: auth.role === UserRole.AUDITOR,
        canManageConfiguration: identity.isOwner || performanceManagerRoles.has(auth.role),
        canAssess: identity.isOwner || assessmentManagerRoles.has(auth.role),
        canCalibrate: identity.isOwner || auth.role === UserRole.HR_MANAGER || auth.role === UserRole.ADMINISTRATOR || auth.role === UserRole.CEO || auth.role === UserRole.COO,
        canManageActionPlans: identity.isOwner || auth.role === UserRole.HR_MANAGER || auth.role === UserRole.ADMINISTRATOR,
      }, metrics: {
        teamCount: team.length,
        openReviewCount: reviews.filter(row => !['COMPLETED', 'CANCELLED'].includes(String(row.status))).length,
        pendingManagerReviewCount: reviews.filter(row => row.status === 'MANAGER_REVIEW').length,
        pendingAcknowledgmentCount: reviews.filter(row => row.status === 'ACKNOWLEDGMENT').length,
        goalsAtRiskCount: team.reduce((sum, row) => sum + row.goalsAtRiskCount, 0),
        activeDevelopmentPlanCount: plans.filter(row => row.status === 'ACTIVE').length,
        activeActionPlanCount: actionPlans.filter(row => row.status === 'ACTIVE').length,
        completedReviewCount: reviews.filter(row => row.status === 'COMPLETED').length,
      }, team, reviews, goals, developmentPlans: plans.map(row => ({ ...row, actions: asArray(row.actions) })), actionPlans, cycles: cycles.map(row => ({ ...row, applicability: asObject(row.applicability) })), templates: templates.map(row => ({ ...row, competencies: asArray(row.competencies), ratingScale: asArray(row.ratingScale) })) } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employees/:employeeId/performance', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await assertScope(auth, req.params.employeeId);
      const identity = await actorIdentity(auth);
      const allowConfidential = employeeVisibilityFilter(auth.role, identity);
      const employee = await employeeById(auth.organizationId, req.params.employeeId);
      const [reviews, goals, plans, actionPlans, checkpoints, events] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(`SELECT r.*,c."name" AS "cycleName",c."periodStart",c."periodEnd" FROM "EmployeePerformanceReview" r JOIN "EmployeePerformanceCycle" c ON c."id"=r."cycleId" AND c."organizationId"=r."organizationId" WHERE r."organizationId"=$1 AND r."employeeId"=$2 ORDER BY c."periodEnd" DESC`, auth.organizationId, employee.id),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceGoal" WHERE "organizationId"=$1 AND "employeeId"=$2 AND ($3::boolean=TRUE OR "visibility"<>'HR_CONFIDENTIAL') ORDER BY "dueDate" NULLS LAST,"createdAt" DESC`, auth.organizationId, employee.id, allowConfidential),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeDevelopmentPlan" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "targetDate" NULLS LAST,"createdAt" DESC`, auth.organizationId, employee.id),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceActionPlan" WHERE "organizationId"=$1 AND "employeeId"=$2 AND ($3::boolean=TRUE OR "confidentiality"<>'HR_CONFIDENTIAL') ORDER BY CASE "status" WHEN 'ACTIVE' THEN 0 ELSE 1 END,"endDate"`, auth.organizationId, employee.id, allowConfidential),
        prisma.$queryRawUnsafe<any[]>(`SELECT c.* FROM "EmployeePerformanceCheckpoint" c JOIN "EmployeePerformanceActionPlan" p ON p."id"=c."actionPlanId" AND p."organizationId"=c."organizationId" WHERE c."organizationId"=$1 AND p."employeeId"=$2 ORDER BY c."scheduledDate"`, auth.organizationId, employee.id),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceEvent" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC LIMIT 1000`, auth.organizationId, employee.id),
      ]);
      res.json({ data: { employee, reviews, goals, developmentPlans: plans.map(row => ({ ...row, actions: asArray(row.actions) })), actionPlans, checkpoints, events } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employee-performance/reviews/:reviewId', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const review = await reviewById(auth.organizationId, req.params.reviewId);
      await assertScope(auth, review.employeeId);
      res.json({ data: await reviewDetails(auth.organizationId, review.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-performance/templates', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res); await requireWritableManager(auth); await requirePerformanceManager(auth);
      const input = templateSchema.parse(req.body); const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeePerformanceTemplate" ("id","organizationId","name","description","competencies","ratingScale","goalWeight","competencyWeight","employeeSelfAssessment","employeeAcknowledgment","active","createdById","updatedById") VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$12)`,
        id, auth.organizationId, input.name, input.description, JSON.stringify(input.competencies), JSON.stringify(input.ratingScale), input.goalWeight, input.competencyWeight, input.employeeSelfAssessment, input.employeeAcknowledgment, input.active, auth.userId,
      );
      await audit?.(auth, 'CREATE_PERFORMANCE_TEMPLATE', 'EmployeePerformanceTemplate', id, { name: input.name });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employee-performance/templates/:templateId', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res); await requireWritableManager(auth); await requirePerformanceManager(auth);
      const current = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceTemplate" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.templateId);
      if (!current[0]) return void res.status(404).json({ error: 'Performance template was not found' });
      const merged = templateSchema.parse({ ...current[0], ...req.body, competencies: req.body?.competencies ?? asArray(current[0].competencies), ratingScale: req.body?.ratingScale ?? asArray(current[0].ratingScale) });
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceTemplate" SET "name"=$1,"description"=$2,"competencies"=$3::jsonb,"ratingScale"=$4::jsonb,"goalWeight"=$5,"competencyWeight"=$6,"employeeSelfAssessment"=$7,"employeeAcknowledgment"=$8,"active"=$9,"updatedById"=$10,"updatedAt"=NOW() WHERE "organizationId"=$11 AND "id"=$12`, merged.name, merged.description, JSON.stringify(merged.competencies), JSON.stringify(merged.ratingScale), merged.goalWeight, merged.competencyWeight, merged.employeeSelfAssessment, merged.employeeAcknowledgment, merged.active, auth.userId, auth.organizationId, req.params.templateId);
      await audit?.(auth, 'UPDATE_PERFORMANCE_TEMPLATE', 'EmployeePerformanceTemplate', req.params.templateId, { name: merged.name });
      res.json({ data: { id: req.params.templateId } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-performance/cycles', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res); await requireWritableManager(auth); await requirePerformanceManager(auth);
      const input = cycleSchema.parse(req.body); const template = await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "EmployeePerformanceTemplate" WHERE "organizationId"=$1 AND "id"=$2 AND "active"=TRUE LIMIT 1`, auth.organizationId, input.templateId);
      if (!template[0]) return void res.status(404).json({ error: 'Active performance template was not found' });
      const id = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePerformanceCycle" ("id","organizationId","templateId","name","description","periodStart","periodEnd","selfAssessmentDueAt","managerAssessmentDueAt","acknowledgmentDueAt","applicability","status","createdById","updatedById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$13)`, id, auth.organizationId, input.templateId, input.name, input.description, input.periodStart, input.periodEnd, input.selfAssessmentDueAt ?? null, input.managerAssessmentDueAt ?? null, input.acknowledgmentDueAt ?? null, JSON.stringify(input.applicability), input.status, auth.userId);
      await audit?.(auth, 'CREATE_PERFORMANCE_CYCLE', 'EmployeePerformanceCycle', id, { name: input.name });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employee-performance/cycles/:cycleId', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res); await requireWritableManager(auth); await requirePerformanceManager(auth);
      const current = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceCycle" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.cycleId);
      if (!current[0]) return void res.status(404).json({ error: 'Performance cycle was not found' });
      if (current[0].status === 'CLOSED' || current[0].status === 'ARCHIVED') return void res.status(409).json({ error: 'Closed or archived cycles cannot be edited' });
      const merged = cycleSchema.parse({ ...current[0], ...req.body, applicability: req.body?.applicability ?? asObject(current[0].applicability) });
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceCycle" SET "templateId"=$1,"name"=$2,"description"=$3,"periodStart"=$4,"periodEnd"=$5,"selfAssessmentDueAt"=$6,"managerAssessmentDueAt"=$7,"acknowledgmentDueAt"=$8,"applicability"=$9::jsonb,"status"=$10,"updatedById"=$11,"updatedAt"=NOW() WHERE "organizationId"=$12 AND "id"=$13`, merged.templateId, merged.name, merged.description, merged.periodStart, merged.periodEnd, merged.selfAssessmentDueAt ?? null, merged.managerAssessmentDueAt ?? null, merged.acknowledgmentDueAt ?? null, JSON.stringify(merged.applicability), merged.status, auth.userId, auth.organizationId, req.params.cycleId);
      await audit?.(auth, 'UPDATE_PERFORMANCE_CYCLE', 'EmployeePerformanceCycle', req.params.cycleId, { name: merged.name });
      res.json({ data: { id: req.params.cycleId } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-performance/cycles/:cycleId/launch', managerGate, async (req, res, next) => {
    try { await ready(); const auth = authOf(res); await requireWritableManager(auth); res.json({ data: await launchCycle(auth, req.params.cycleId) }); }
    catch (error) { next(error); }
  });

  app.post('/api/admin/employee-performance/cycles/:cycleId/close', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth); await requirePerformanceManager(auth);
      const open = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT COUNT(*)::int AS "count" FROM "EmployeePerformanceReview" WHERE "organizationId"=$1 AND "cycleId"=$2 AND "status" NOT IN ('COMPLETED','CANCELLED')`, auth.organizationId, req.params.cycleId);
      if ((open[0]?.count || 0) > 0 && !req.body?.force) return void res.status(409).json({ error: `${open[0]?.count || 0} reviews are still open. Submit force=true to close the cycle administratively.` });
      const rows = await prisma.$queryRawUnsafe<any[]>(`UPDATE "EmployeePerformanceCycle" SET "status"='CLOSED',"closedAt"=NOW(),"updatedById"=$1,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "id"=$3 RETURNING "id"`, auth.userId, auth.organizationId, req.params.cycleId);
      if (!rows[0]) return void res.status(404).json({ error: 'Performance cycle was not found' });
      await audit?.(auth, 'CLOSE_PERFORMANCE_CYCLE', 'EmployeePerformanceCycle', req.params.cycleId, { forced: Boolean(req.body?.force), openReviewCount: open[0]?.count || 0 });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:employeeId/performance/goals', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth); await assertScope(auth, req.params.employeeId);
      const identity = await actorIdentity(auth); if (!identity.isOwner && !assessmentManagerRoles.has(auth.role)) return void res.status(403).json({ error: 'You are not authorized to manage performance goals' });
      const input = goalSchema.parse(req.body); const id = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePerformanceGoal" ("id","organizationId","employeeId","cycleId","createdById","title","description","category","metricType","targetValue","currentValue","unit","startDate","dueDate","weight","status","employeeCanUpdate","visibility","approvedById","approvedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$5,CASE WHEN $16='PENDING_APPROVAL' THEN NULL ELSE NOW() END)`, id, auth.organizationId, req.params.employeeId, input.cycleId || null, auth.userId, input.title, input.description, input.category, input.metricType, input.targetValue ?? null, input.currentValue ?? null, input.unit, input.startDate ?? null, input.dueDate ?? null, input.weight, input.status, input.employeeCanUpdate, input.visibility);
      await event(auth.organizationId, req.params.employeeId, auth.userId, 'GOAL_CREATED', 'GOAL', id, { title: input.title, status: input.status });
      if (input.visibility === 'EMPLOYEE_VISIBLE') await notification({ organizationId: auth.organizationId, userId: req.params.employeeId, title: `Performance goal assigned: ${input.title}`, message: 'A manager added or approved a goal in your Employee 360 performance plan.', relatedType: 'EmployeePerformanceGoal', relatedId: id, dedupeKey: `goal-assigned:${id}:${req.params.employeeId}`, actionUrl: EMPLOYEE_URL, email: true });
      await audit?.(auth, 'CREATE_EMPLOYEE_PERFORMANCE_GOAL', 'EmployeePerformanceGoal', id, { employeeId: req.params.employeeId, title: input.title });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employee-performance/goals/:goalId', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth);
      const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceGoal" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.goalId);
      if (!rows[0]) return void res.status(404).json({ error: 'Performance goal was not found' });
      await assertScope(auth, rows[0].employeeId); const merged = goalSchema.parse({ ...rows[0], ...req.body });
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceGoal" SET "cycleId"=$1,"title"=$2,"description"=$3,"category"=$4,"metricType"=$5,"targetValue"=$6,"currentValue"=$7,"unit"=$8,"startDate"=$9,"dueDate"=$10,"weight"=$11,"status"=$12,"employeeCanUpdate"=$13,"visibility"=$14,"approvedById"=CASE WHEN $12='PENDING_APPROVAL' THEN NULL ELSE COALESCE("approvedById",$15) END,"approvedAt"=CASE WHEN $12='PENDING_APPROVAL' THEN NULL ELSE COALESCE("approvedAt",NOW()) END,"completedAt"=CASE WHEN $12='COMPLETED' THEN COALESCE("completedAt",NOW()) ELSE NULL END,"updatedAt"=NOW() WHERE "organizationId"=$16 AND "id"=$17`, merged.cycleId || null, merged.title, merged.description, merged.category, merged.metricType, merged.targetValue ?? null, merged.currentValue ?? null, merged.unit, merged.startDate ?? null, merged.dueDate ?? null, merged.weight, merged.status, merged.employeeCanUpdate, merged.visibility, auth.userId, auth.organizationId, req.params.goalId);
      await event(auth.organizationId, rows[0].employeeId, auth.userId, 'GOAL_UPDATED', 'GOAL', req.params.goalId, { status: merged.status });
      await audit?.(auth, 'UPDATE_EMPLOYEE_PERFORMANCE_GOAL', 'EmployeePerformanceGoal', req.params.goalId, { employeeId: rows[0].employeeId, status: merged.status });
      res.json({ data: { id: req.params.goalId } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-performance/reviews/:reviewId/manager-assessment', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth);
      const identity = await actorIdentity(auth); if (!identity.isOwner && !assessmentManagerRoles.has(auth.role)) return void res.status(403).json({ error: 'You are not authorized to complete manager assessments' });
      const review = await reviewById(auth.organizationId, req.params.reviewId); await assertScope(auth, review.employeeId);
      if (!['MANAGER_REVIEW', 'EMPLOYEE_INPUT'].includes(review.status)) return void res.status(409).json({ error: 'This review is not accepting a manager assessment' });
      const input = managerAssessmentSchema.parse(req.body); const scores = assessmentScores(input); const id = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePerformanceAssessment" ("id","organizationId","reviewId","assessorUserId","assessorType","responses","competencyScore","goalScore","overallRating") VALUES ($1,$2,$3,$4,'MANAGER',$5::jsonb,$6,$7,$8) ON CONFLICT ("organizationId","reviewId","assessorType") DO UPDATE SET "assessorUserId"=EXCLUDED."assessorUserId","responses"=EXCLUDED."responses","competencyScore"=EXCLUDED."competencyScore","goalScore"=EXCLUDED."goalScore","overallRating"=EXCLUDED."overallRating","submittedAt"=NOW(),"updatedAt"=NOW()`, id, auth.organizationId, review.id, auth.userId, JSON.stringify(input), scores.competencyScore, scores.goalScore, input.recommendedRating ?? scores.overallRating);
      const nextStatus = identity.isOwner || auth.role === UserRole.HR_MANAGER || auth.role === UserRole.ADMINISTRATOR || auth.role === UserRole.CEO || auth.role === UserRole.COO ? 'CALIBRATION' : 'CALIBRATION';
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceReview" SET "status"=$1,"managerSubmittedAt"=NOW(),"summary"=$2,"strengths"=$3,"improvementAreas"=$4,"updatedAt"=NOW() WHERE "organizationId"=$5 AND "id"=$6`, nextStatus, input.summary, input.strengths, input.improvementAreas, auth.organizationId, review.id);
      await recomputeReview(auth.organizationId, review.id);
      await event(auth.organizationId, review.employeeId, auth.userId, 'MANAGER_ASSESSMENT_SUBMITTED', 'REVIEW', review.id, scores);
      await audit?.(auth, 'SUBMIT_MANAGER_PERFORMANCE_ASSESSMENT', 'EmployeePerformanceReview', review.id, { employeeId: review.employeeId, ...scores });
      res.json({ data: await reviewDetails(auth.organizationId, review.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-performance/reviews/:reviewId/calibrate', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth); const identity = await actorIdentity(auth);
      const canCalibrate = identity.isOwner || auth.role === UserRole.HR_MANAGER || auth.role === UserRole.ADMINISTRATOR || auth.role === UserRole.CEO || auth.role === UserRole.COO;
      if (!canCalibrate) return void res.status(403).json({ error: 'You are not authorized to calibrate performance ratings' });
      const review = await reviewById(auth.organizationId, req.params.reviewId); await assertScope(auth, review.employeeId);
      if (!['CALIBRATION', 'MANAGER_REVIEW'].includes(review.status)) return void res.status(409).json({ error: 'This review is not ready for calibration' });
      const input = calibrationSchema.parse(req.body);
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceReview" SET "calibrationRating"=$1,"calibratedAt"=NOW(),"calibratedById"=$2,"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4`, input.calibrationRating, auth.userId, auth.organizationId, review.id);
      await recomputeReview(auth.organizationId, review.id);
      await event(auth.organizationId, review.employeeId, auth.userId, 'REVIEW_CALIBRATED', 'REVIEW', review.id, input);
      await audit?.(auth, 'CALIBRATE_PERFORMANCE_REVIEW', 'EmployeePerformanceReview', review.id, { employeeId: review.employeeId, rating: input.calibrationRating, notes: input.notes });
      res.json({ data: await reviewDetails(auth.organizationId, review.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-performance/reviews/:reviewId/finalize', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth);
      const review = await reviewById(auth.organizationId, req.params.reviewId); await assertScope(auth, review.employeeId);
      const identity = await actorIdentity(auth); const canFinalize = identity.isOwner || auth.role === UserRole.HR_MANAGER || auth.role === UserRole.ADMINISTRATOR || auth.role === UserRole.CEO || auth.role === UserRole.COO || review.managerId === auth.userId;
      if (!canFinalize) return void res.status(403).json({ error: 'You are not authorized to finalize this performance review' });
      if (!['CALIBRATION', 'MANAGER_REVIEW'].includes(review.status)) return void res.status(409).json({ error: 'This review is not ready to finalize' });
      const details = await reviewDetails(auth.organizationId, review.id); const hasManager = details.assessments.some(item => item.assessorType === 'MANAGER');
      if (!hasManager) return void res.status(409).json({ error: 'A manager assessment is required before finalization' });
      await recomputeReview(auth.organizationId, review.id);
      const acknowledgmentRequired = Boolean(details.cycle.employeeAcknowledgment);
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceReview" SET "status"=$1,"finalizedAt"=NOW(),"finalizedById"=$2,"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4`, acknowledgmentRequired ? 'ACKNOWLEDGMENT' : 'COMPLETED', auth.userId, auth.organizationId, review.id);
      await event(auth.organizationId, review.employeeId, auth.userId, 'REVIEW_FINALIZED', 'REVIEW', review.id, { acknowledgmentRequired });
      await notification({ organizationId: auth.organizationId, userId: review.employeeId, title: 'Performance review finalized', message: acknowledgmentRequired ? 'Your performance review is ready for acknowledgment in My Performance.' : 'Your performance review has been finalized and is available in My Performance.', relatedType: 'EmployeePerformanceReview', relatedId: review.id, dedupeKey: `review-finalized:${review.id}:${review.employeeId}`, actionUrl: EMPLOYEE_URL, email: true });
      await audit?.(auth, 'FINALIZE_PERFORMANCE_REVIEW', 'EmployeePerformanceReview', review.id, { employeeId: review.employeeId, acknowledgmentRequired });
      res.json({ data: await reviewDetails(auth.organizationId, review.id) });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employee-performance/reviews/:reviewId/report', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); const review = await reviewById(auth.organizationId, req.params.reviewId); await assertScope(auth, review.employeeId);
      const details = await reviewDetails(auth.organizationId, review.id);
      const managerAssessment = details.assessments.find(item => item.assessorType === 'MANAGER');
      const employeeAssessment = details.assessments.find(item => item.assessorType === 'EMPLOYEE');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(details.employee.displayName)} Performance Review</title><style>body{font-family:Arial,sans-serif;color:#1f2d3d;margin:36px}h1,h2{color:#075493}.header{border-bottom:3px solid #159bd3;padding-bottom:14px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}.box{border:1px solid #cbd7e1;border-radius:7px;padding:12px;margin:12px 0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd7e1;padding:8px;text-align:left}.signature{margin-top:30px;border-top:1px solid #667;padding-top:8px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print or Save as PDF</button><div class="header"><h1>Sulandra Health Performance Review</h1><p>${escapeHtml(details.cycle.cycleName || details.cycle.name)}</p></div><div class="meta"><div><strong>Employee:</strong> ${escapeHtml(details.employee.displayName)}</div><div><strong>Manager:</strong> ${escapeHtml(details.manager?.displayName || '—')}</div><div><strong>Period:</strong> ${escapeHtml(String(details.cycle.periodStart).slice(0,10))} through ${escapeHtml(String(details.cycle.periodEnd).slice(0,10))}</div><div><strong>Status:</strong> ${escapeHtml(details.review.status)}</div><div><strong>Final rating:</strong> ${escapeHtml(details.review.finalRating ?? '—')}</div><div><strong>Final score:</strong> ${escapeHtml(details.review.finalScore ?? '—')}</div></div><h2>Summary</h2><div class="box">${escapeHtml(details.review.summary || '—')}</div><h2>Strengths</h2><div class="box">${escapeHtml(details.review.strengths || '—')}</div><h2>Improvement Areas</h2><div class="box">${escapeHtml(details.review.improvementAreas || '—')}</div><h2>Goals</h2><table><thead><tr><th>Goal</th><th>Status</th><th>Progress</th><th>Due</th></tr></thead><tbody>${details.goals.map((goal:any) => `<tr><td>${escapeHtml(goal.title)}</td><td>${escapeHtml(goal.status)}</td><td>${escapeHtml(goal.progressPercent)}%</td><td>${escapeHtml(goal.dueDate ? String(goal.dueDate).slice(0,10) : '—')}</td></tr>`).join('')}</tbody></table><h2>Employee Self-Assessment</h2><div class="box"><pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(employeeAssessment?.responses || {}, null, 2))}</pre></div><h2>Manager Assessment</h2><div class="box"><pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(managerAssessment?.responses || {}, null, 2))}</pre></div><div class="signature"><strong>Employee acknowledgment:</strong> ${details.review.acknowledgedAt ? escapeHtml(String(details.review.acknowledgedAt)) : 'Pending or not required'}<br>${escapeHtml(details.review.acknowledgmentComments || '')}</div></body></html>`;
      await event(auth.organizationId, review.employeeId, auth.userId, 'REVIEW_REPORT_VIEWED', 'REVIEW', review.id, {});
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.send(html);
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:employeeId/performance/development-plans', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth); await assertScope(auth, req.params.employeeId);
      const input = developmentPlanSchema.parse(req.body); const id = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeDevelopmentPlan" ("id","organizationId","employeeId","reviewId","createdById","title","purpose","actions","startDate","targetDate","status","employeeVisible","acknowledgmentRequired") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)`, id, auth.organizationId, req.params.employeeId, req.body?.reviewId || null, auth.userId, input.title, input.purpose, JSON.stringify(input.actions), input.startDate ?? null, input.targetDate ?? null, input.status, input.employeeVisible, input.acknowledgmentRequired);
      await event(auth.organizationId, req.params.employeeId, auth.userId, 'DEVELOPMENT_PLAN_CREATED', 'DEVELOPMENT_PLAN', id, { title: input.title });
      if (input.employeeVisible) await notification({ organizationId: auth.organizationId, userId: req.params.employeeId, title: `Development plan assigned: ${input.title}`, message: 'A development plan is available in My Performance.', relatedType: 'EmployeeDevelopmentPlan', relatedId: id, dedupeKey: `development-plan:${id}:${req.params.employeeId}`, actionUrl: EMPLOYEE_URL, email: true });
      await audit?.(auth, 'CREATE_EMPLOYEE_DEVELOPMENT_PLAN', 'EmployeeDevelopmentPlan', id, { employeeId: req.params.employeeId, title: input.title });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employee-performance/development-plans/:planId', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth);
      const current = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeDevelopmentPlan" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.planId);
      if (!current[0]) return void res.status(404).json({ error: 'Development plan was not found' });
      await assertScope(auth, current[0].employeeId);
      const merged = developmentPlanSchema.parse({ ...current[0], ...req.body, actions: req.body?.actions ?? asArray(current[0].actions) });
      await prisma.$executeRawUnsafe(`UPDATE "EmployeeDevelopmentPlan" SET "title"=$1,"purpose"=$2,"actions"=$3::jsonb,"startDate"=$4,"targetDate"=$5,"status"=$6,"employeeVisible"=$7,"acknowledgmentRequired"=$8,"completedAt"=CASE WHEN $6='COMPLETED' THEN COALESCE("completedAt",NOW()) ELSE NULL END,"updatedAt"=NOW() WHERE "organizationId"=$9 AND "id"=$10`, merged.title, merged.purpose, JSON.stringify(merged.actions), merged.startDate ?? null, merged.targetDate ?? null, merged.status, merged.employeeVisible, merged.acknowledgmentRequired, auth.organizationId, req.params.planId);
      await event(auth.organizationId, current[0].employeeId, auth.userId, 'DEVELOPMENT_PLAN_UPDATED', 'DEVELOPMENT_PLAN', req.params.planId, { status: merged.status });
      await audit?.(auth, 'UPDATE_EMPLOYEE_DEVELOPMENT_PLAN', 'EmployeeDevelopmentPlan', req.params.planId, { employeeId: current[0].employeeId, status: merged.status });
      res.json({ data: { id: req.params.planId } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:employeeId/performance/action-plans', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth); await assertScope(auth, req.params.employeeId); const identity = await actorIdentity(auth);
      if (!identity.isOwner && auth.role !== UserRole.HR_MANAGER && auth.role !== UserRole.ADMINISTRATOR) return void res.status(403).json({ error: 'Only the Enterprise Owner, Human Resources, or an Administrator may create formal performance action plans' });
      const employee = await employeeById(auth.organizationId, req.params.employeeId); if (isOwnerEmail(employee.email) && !identity.isOwner) return void res.status(403).json({ error: 'The Enterprise Owner cannot be placed on a performance action plan by another user' });
      const input = actionPlanSchema.parse(req.body); const id = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePerformanceActionPlan" ("id","organizationId","employeeId","reviewId","createdById","title","reason","expectations","supportProvided","startDate","endDate","severity","status","employeeVisible","acknowledgmentRequired","confidentiality") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, id, auth.organizationId, employee.id, req.body?.reviewId || null, auth.userId, input.title, input.reason, input.expectations, input.supportProvided, input.startDate, input.endDate, input.severity, input.status, input.employeeVisible, input.acknowledgmentRequired, input.confidentiality);
      await event(auth.organizationId, employee.id, auth.userId, 'ACTION_PLAN_CREATED', 'ACTION_PLAN', id, { title: input.title, severity: input.severity });
      if (input.employeeVisible && input.confidentiality === 'EMPLOYEE_VISIBLE') await notification({ organizationId: auth.organizationId, userId: employee.id, title: `Performance action plan: ${input.title}`, message: 'A formal performance action plan requires your review in My Performance.', relatedType: 'EmployeePerformanceActionPlan', relatedId: id, dedupeKey: `action-plan:${id}:${employee.id}`, actionUrl: EMPLOYEE_URL, email: true });
      await audit?.(auth, 'CREATE_EMPLOYEE_PERFORMANCE_ACTION_PLAN', 'EmployeePerformanceActionPlan', id, { employeeId: employee.id, severity: input.severity });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-performance/action-plans/:planId/checkpoints', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth);
      const plans = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceActionPlan" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.planId);
      if (!plans[0]) return void res.status(404).json({ error: 'Performance action plan was not found' });
      await assertScope(auth, plans[0].employeeId); const input = checkpointSchema.parse(req.body); const id = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePerformanceCheckpoint" ("id","organizationId","actionPlanId","createdById","scheduledDate","completedDate","status","employeeProgress","managerAssessment","outcome","nextSteps") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, id, auth.organizationId, plans[0].id, auth.userId, input.scheduledDate, input.completedDate ?? null, input.status, input.employeeProgress, input.managerAssessment, input.outcome, input.nextSteps);
      await event(auth.organizationId, plans[0].employeeId, auth.userId, 'ACTION_PLAN_CHECKPOINT_RECORDED', 'ACTION_PLAN', plans[0].id, { checkpointId: id, outcome: input.outcome });
      await audit?.(auth, 'CREATE_PERFORMANCE_ACTION_PLAN_CHECKPOINT', 'EmployeePerformanceCheckpoint', id, { employeeId: plans[0].employeeId, actionPlanId: plans[0].id });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employee-performance/action-plans/:planId/status', managerGate, async (req, res, next) => {
    try {
      await ready(); const auth = authOf(res); await requireWritableManager(auth); const identity = await actorIdentity(auth);
      if (!identity.isOwner && auth.role !== UserRole.HR_MANAGER && auth.role !== UserRole.ADMINISTRATOR) return void res.status(403).json({ error: 'Only the Enterprise Owner, Human Resources, or an Administrator may resolve formal performance action plans' });
      const plans = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePerformanceActionPlan" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.planId);
      if (!plans[0]) return void res.status(404).json({ error: 'Performance action plan was not found' });
      await assertScope(auth, plans[0].employeeId); const input = actionPlanStatusSchema.parse(req.body);
      await prisma.$executeRawUnsafe(`UPDATE "EmployeePerformanceActionPlan" SET "status"=$1,"endDate"=COALESCE($2,"endDate"),"resolutionNotes"=$3,"resolvedAt"=CASE WHEN $1='ACTIVE' OR $1='EXTENDED' THEN NULL ELSE NOW() END,"resolvedById"=CASE WHEN $1='ACTIVE' OR $1='EXTENDED' THEN NULL ELSE $4 END,"updatedAt"=NOW() WHERE "organizationId"=$5 AND "id"=$6`, input.status, input.endDate ?? null, input.resolutionNotes, auth.userId, auth.organizationId, plans[0].id);
      await event(auth.organizationId, plans[0].employeeId, auth.userId, 'ACTION_PLAN_STATUS_CHANGED', 'ACTION_PLAN', plans[0].id, { status: input.status, resolutionNotes: input.resolutionNotes });
      await audit?.(auth, 'CHANGE_PERFORMANCE_ACTION_PLAN_STATUS', 'EmployeePerformanceActionPlan', plans[0].id, { employeeId: plans[0].employeeId, status: input.status });
      res.json({ data: { id: plans[0].id, status: input.status } });
    } catch (error) { next(error); }
  });
}
