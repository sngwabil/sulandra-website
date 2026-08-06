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

type RequestType =
  | 'PROFILE_CHANGE'
  | 'TIME_OFF'
  | 'SCHEDULE_CHANGE'
  | 'DOCUMENT_CORRECTION'
  | 'TRAINING_SUPPORT'
  | 'HR_SUPPORT'
  | 'GENERAL_REQUEST';

type RequestStatus = 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
type ApprovalDecision = 'APPROVE' | 'REJECT';
type ApprovalMode = 'ANY' | 'ALL';
type ApproverType = 'SUPERVISOR' | 'LOCATION_MANAGER' | 'HR' | 'ADMINISTRATOR' | 'OWNER' | 'SPECIFIC_USER';
type CommentVisibility = 'EMPLOYEE_VISIBLE' | 'MANAGEMENT_ONLY' | 'HR_CONFIDENTIAL';
type FeedbackVisibility = 'EMPLOYEE_VISIBLE' | 'MANAGEMENT_ONLY' | 'HR_CONFIDENTIAL';
type RecognitionVisibility = 'EMPLOYEE_ONLY' | 'TEAM_VISIBLE' | 'ORGANIZATION_VISIBLE' | 'MANAGEMENT_ONLY';

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

type WorkflowStep = {
  sequence: number;
  approverType: ApproverType;
  approvalMode: ApprovalMode;
  userId?: string | null;
  label?: string | null;
};

type WorkflowRequestRow = {
  id: string;
  organizationId: string;
  employeeId: string;
  requestType: RequestType;
  title: string;
  description: string;
  payload: unknown;
  priority: string;
  status: RequestStatus;
  currentSequence: number | null;
  linkedResourceType: string | null;
  linkedResourceId: string | null;
  submittedAt: Date | string;
  resolvedAt: Date | string | null;
  resolvedById: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
const PORTAL_URL = 'https://www.sulandrahealth.com/employee-portal.html#myWorkplace';
const ADMIN_URL = 'https://www.sulandrahealth.com/admin.html';
const REQUEST_TYPES: RequestType[] = [
  'PROFILE_CHANGE',
  'TIME_OFF',
  'SCHEDULE_CHANGE',
  'DOCUMENT_CORRECTION',
  'TRAINING_SUPPORT',
  'HR_SUPPORT',
  'GENERAL_REQUEST',
];

const managerRoles = [
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.SCHEDULER,
  UserRole.AUDITOR,
  UserRole.DELEGATING_NURSE,
  UserRole.CEO,
  UserRole.COO,
] as const;

const globalManagerRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.HR_MANAGER,
  UserRole.AUDITOR,
  UserRole.CEO,
  UserRole.COO,
]);

const locationManagerRoles = new Set<UserRole>([
  UserRole.PROGRAM_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.SCHEDULER,
  UserRole.DELEGATING_NURSE,
]);

const decisionRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.SCHEDULER,
  UserRole.DELEGATING_NURSE,
  UserRole.CEO,
  UserRole.COO,
]);

const workflowManagerRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.HR_MANAGER,
]);

const feedbackRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.DELEGATING_NURSE,
  UserRole.CEO,
  UserRole.COO,
]);

const requestSchema = z.object({
  requestType: z.enum(REQUEST_TYPES as [RequestType, ...RequestType[]]),
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().min(3).max(10_000),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional().default('NORMAL'),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

const profileChangeSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  personalEmail: z.union([z.string().trim().email(), z.literal('')]).optional(),
  phone: z.string().trim().max(60).optional(),
  alternatePhone: z.string().trim().max(60).optional(),
  streetAddress: z.string().trim().max(240).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(40).optional(),
  zipCode: z.string().trim().max(20).optional(),
  emergencyContactName: z.string().trim().max(160).optional(),
  emergencyContactPhone: z.string().trim().max(60).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Choose at least one profile field to update');

const timeRequestPayloadSchema = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  reason: z.string().trim().min(3).max(2_000),
  shiftId: z.string().trim().max(200).optional().nullable(),
}).refine((value) => value.endAt > value.startAt, { message: 'End must be after start' });

const documentCorrectionSchema = z.object({
  documentId: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).optional(),
  title: z.string().trim().max(240).optional(),
  issueDate: z.coerce.date().optional().nullable(),
  expirationDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(4_000).optional(),
  reason: z.string().trim().min(3).max(4_000),
});

const trainingSupportSchema = z.object({
  courseCode: z.string().trim().max(120).optional().nullable(),
  courseTitle: z.string().trim().max(300).optional().nullable(),
  reason: z.string().trim().min(3).max(4_000),
});

const approvalStepSchema = z.object({
  sequence: z.number().int().min(1).max(20),
  approverType: z.enum(['SUPERVISOR', 'LOCATION_MANAGER', 'HR', 'ADMINISTRATOR', 'OWNER', 'SPECIFIC_USER']),
  approvalMode: z.enum(['ANY', 'ALL']).optional().default('ANY'),
  userId: z.string().trim().max(200).optional().nullable(),
  label: z.string().trim().max(160).optional().nullable(),
}).superRefine((value, context) => {
  if (value.approverType === 'SPECIFIC_USER' && !value.userId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['userId'], message: 'Specific-user steps require a user ID' });
  }
});

const workflowDefinitionSchema = z.object({
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2_000).optional().nullable(),
  enabled: z.boolean().optional().default(true),
  employeeCanSubmit: z.boolean().optional().default(true),
  steps: z.array(approvalStepSchema).min(1).max(20),
}).superRefine((value, context) => {
  const sequences = value.steps.map((step) => step.sequence);
  if (new Set(sequences).size !== sequences.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['steps'], message: 'Each approval sequence must be unique' });
  }
});

const decisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  notes: z.string().trim().max(4_000).optional().default(''),
});

const commentSchema = z.object({
  body: z.string().trim().min(1).max(8_000),
  visibility: z.enum(['EMPLOYEE_VISIBLE', 'MANAGEMENT_ONLY', 'HR_CONFIDENTIAL']).optional().default('EMPLOYEE_VISIBLE'),
});

const feedbackSchema = z.object({
  kind: z.enum(['CHECK_IN', 'FEEDBACK', 'COACHING', 'GOAL', 'DEVELOPMENT_NOTE', 'PERFORMANCE_NOTE']),
  subject: z.string().trim().min(3).max(240),
  body: z.string().trim().min(3).max(12_000),
  visibility: z.enum(['EMPLOYEE_VISIBLE', 'MANAGEMENT_ONLY', 'HR_CONFIDENTIAL']).optional().default('EMPLOYEE_VISIBLE'),
  requiresAcknowledgment: z.boolean().optional().default(false),
  followUpDate: z.coerce.date().optional().nullable(),
});

const recognitionSchema = z.object({
  category: z.enum(['VALUES', 'TEAMWORK', 'EXCELLENCE', 'SAFETY', 'COMPASSION', 'LEADERSHIP', 'RELIABILITY', 'MILESTONE', 'OTHER']),
  title: z.string().trim().min(3).max(240),
  message: z.string().trim().min(3).max(8_000),
  visibility: z.enum(['EMPLOYEE_ONLY', 'TEAM_VISIBLE', 'ORGANIZATION_VISIBLE', 'MANAGEMENT_ONLY']).optional().default('EMPLOYEE_ONLY'),
  points: z.number().int().min(0).max(10_000).optional().default(0),
  awardDate: z.coerce.date().optional().default(() => new Date()),
});

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const cleanText = (value: unknown) => String(value ?? '').trim();
const isOwnerEmail = (value: unknown) => normalizeEmail(value) === OWNER_EMAIL;
const asObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* ignore invalid persisted JSON */ }
  }
  return {};
};
const asSteps = (value: unknown): WorkflowStep[] => {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? (() => { try { return JSON.parse(value) as unknown; } catch { return []; } })() : [];
  if (!Array.isArray(raw)) return [];
  return raw.map((step) => approvalStepSchema.parse(step)).sort((a, b) => a.sequence - b.sequence);
};
const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function registerEmployeeCollaborationRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  let readyPromise: Promise<void> | null = null;

  const ready = () => readyPromise ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeWorkflowDefinition" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "requestType" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "steps" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
      "employeeCanSubmit" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdById" TEXT NOT NULL,
      "updatedById" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeWorkflowDefinition_type_unique" ON "EmployeeWorkflowDefinition"("organizationId","requestType")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeWorkflowRequest" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "requestType" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "priority" TEXT NOT NULL DEFAULT 'NORMAL',
      "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
      "currentSequence" INTEGER,
      "linkedResourceType" TEXT,
      "linkedResourceId" TEXT,
      "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "resolvedAt" TIMESTAMPTZ,
      "resolvedById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeWorkflowRequest_employee_idx" ON "EmployeeWorkflowRequest"("organizationId","employeeId","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeWorkflowRequest_status_idx" ON "EmployeeWorkflowRequest"("organizationId","status","currentSequence","createdAt")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeWorkflowApproval" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "requestId" TEXT NOT NULL,
      "sequence" INTEGER NOT NULL,
      "approvalMode" TEXT NOT NULL DEFAULT 'ANY',
      "approverType" TEXT NOT NULL,
      "approverUserId" TEXT,
      "label" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "decisionNotes" TEXT NOT NULL DEFAULT '',
      "decidedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeWorkflowApproval_actor_idx" ON "EmployeeWorkflowApproval"("organizationId","approverUserId","status","sequence")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeWorkflowApproval_request_idx" ON "EmployeeWorkflowApproval"("organizationId","requestId","sequence","status")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeWorkflowComment" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "requestId" TEXT NOT NULL,
      "authorUserId" TEXT NOT NULL,
      "visibility" TEXT NOT NULL DEFAULT 'EMPLOYEE_VISIBLE',
      "body" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeWorkflowComment_request_idx" ON "EmployeeWorkflowComment"("organizationId","requestId","createdAt")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeWorkflowEvent" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "requestId" TEXT NOT NULL,
      "actorUserId" TEXT,
      "eventType" TEXT NOT NULL,
      "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeWorkflowEvent_request_idx" ON "EmployeeWorkflowEvent"("organizationId","requestId","createdAt")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeTeamFeedback" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "authorUserId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "visibility" TEXT NOT NULL DEFAULT 'EMPLOYEE_VISIBLE',
      "requiresAcknowledgment" BOOLEAN NOT NULL DEFAULT FALSE,
      "acknowledgedAt" TIMESTAMPTZ,
      "acknowledgedById" TEXT,
      "followUpDate" DATE,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeTeamFeedback_employee_idx" ON "EmployeeTeamFeedback"("organizationId","employeeId","status","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeTeamFeedback_followup_idx" ON "EmployeeTeamFeedback"("organizationId","followUpDate","status")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeRecognition" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "nominatorUserId" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "visibility" TEXT NOT NULL DEFAULT 'EMPLOYEE_ONLY',
      "points" INTEGER NOT NULL DEFAULT 0,
      "awardDate" DATE NOT NULL DEFAULT CURRENT_DATE,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeRecognition_employee_idx" ON "EmployeeRecognition"("organizationId","employeeId","status","awardDate" DESC)`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeNotification" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "notificationType" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "actionUrl" TEXT,
      "relatedType" TEXT,
      "relatedId" TEXT,
      "dedupeKey" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'UNREAD',
      "emailStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
      "emailError" TEXT,
      "providerMessageId" TEXT,
      "readAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeNotification_dedupe_unique" ON "EmployeeNotification"("organizationId","userId","dedupeKey")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeNotification_user_idx" ON "EmployeeNotification"("organizationId","userId","status","createdAt" DESC)`);
  })().catch((error) => {
    readyPromise = null;
    throw error;
  });

  const managerGate = requireRoles(...managerRoles);
  const tableExists = async (name: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
      `SELECT to_regclass($1::text)::text AS "name"`,
      `public."${name}"`,
    );
    return Boolean(rows[0]?.name);
  };

  const actorIdentity = async (auth: AuthContext) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string | null; role: string }>>(
      `SELECT "email","role"::text AS "role" FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,
      auth.userId,
      auth.organizationId,
    );
    const email = normalizeEmail(rows[0]?.email || auth.email);
    return { email, isOwner: email === OWNER_EMAIL, role: String(rows[0]?.role || auth.role) };
  };

  const employeeById = async (organizationId: string, employeeId: string): Promise<EmployeeRow> => {
    const hasAssignments = await tableExists('TimeAttendanceLocationAssignment');
    const locationProjection = hasAssignments
      ? `ARRAY(SELECT x."locationId" FROM "TimeAttendanceLocationAssignment" x WHERE x."organizationId"=u."organizationId" AND x."employeeId"=u."id" AND x."active"=TRUE) AS "locationIds"`
      : `ARRAY[]::text[] AS "locationIds"`;
    const rows = await prisma.$queryRawUnsafe<EmployeeRow[]>(
      `SELECT u."id",u."email",u."role"::text AS "role",
              COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "displayName",
              p."department",p."jobTitle",COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus",
              p."hireDate",p."supervisorId",${locationProjection}
       FROM "User" u
       LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
       WHERE u."organizationId"=$1 AND u."id"=$2 LIMIT 1`,
      organizationId,
      employeeId,
    );
    const employee = rows[0];
    if (!employee) throw Object.assign(new Error('Employee was not found'), { status: 404 });
    employee.displayName = isOwnerEmail(employee.email) ? OWNER_NAME : employee.displayName;
    employee.locationIds = Array.isArray(employee.locationIds) ? employee.locationIds.map(String) : [];
    return employee;
  };

  const allEmployees = async (organizationId: string): Promise<EmployeeRow[]> => {
    const hasAssignments = await tableExists('TimeAttendanceLocationAssignment');
    const locationProjection = hasAssignments
      ? `ARRAY(SELECT x."locationId" FROM "TimeAttendanceLocationAssignment" x WHERE x."organizationId"=u."organizationId" AND x."employeeId"=u."id" AND x."active"=TRUE) AS "locationIds"`
      : `ARRAY[]::text[] AS "locationIds"`;
    const rows = await prisma.$queryRawUnsafe<EmployeeRow[]>(
      `SELECT u."id",u."email",u."role"::text AS "role",
              COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "displayName",
              p."department",p."jobTitle",COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus",
              p."hireDate",p."supervisorId",${locationProjection}
       FROM "User" u
       LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
       WHERE u."organizationId"=$1 AND LOWER(COALESCE(u."email",'')) NOT LIKE '%@demo.spire.local'
       ORDER BY COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id")`,
      organizationId,
    );
    return rows.map((employee) => ({
      ...employee,
      displayName: isOwnerEmail(employee.email) ? OWNER_NAME : employee.displayName,
      locationIds: Array.isArray(employee.locationIds) ? employee.locationIds.map(String) : [],
    }));
  };

  const scopedEmployeeIds = async (auth: AuthContext): Promise<string[]> => {
    const identity = await actorIdentity(auth);
    if (identity.isOwner || globalManagerRoles.has(auth.role)) {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "User" WHERE "organizationId"=$1`,
        auth.organizationId,
      );
      return rows.map((row) => String(row.id));
    }
    if (!locationManagerRoles.has(auth.role) || !(await tableExists('TimeAttendanceLocationAssignment'))) return [auth.userId];
    const managerOnly = auth.role === UserRole.HOUSE_MANAGER;
    const rows = await prisma.$queryRawUnsafe<Array<{ employeeId: string }>>(
      `SELECT DISTINCT target."employeeId"
       FROM "TimeAttendanceLocationAssignment" actor
       JOIN "TimeAttendanceLocationAssignment" target
         ON target."organizationId"=actor."organizationId" AND target."locationId"=actor."locationId" AND target."active"=TRUE
       WHERE actor."organizationId"=$1 AND actor."employeeId"=$2 AND actor."active"=TRUE
         AND ($3::boolean=FALSE OR actor."isManager"=TRUE)`,
      auth.organizationId,
      auth.userId,
      managerOnly,
    );
    return [...new Set([auth.userId, ...rows.map((row) => String(row.employeeId))])];
  };

  const assertEmployeeScope = async (auth: AuthContext, employeeId: string) => {
    const allowed = await scopedEmployeeIds(auth);
    if (!allowed.includes(employeeId)) throw Object.assign(new Error('You do not have access to this employee'), { status: 403 });
  };

  const requireWorkflowManager = async (auth: AuthContext) => {
    const identity = await actorIdentity(auth);
    if (!identity.isOwner && !workflowManagerRoles.has(auth.role)) {
      throw Object.assign(new Error('Only the Enterprise Owner, Human Resources, or an Administrator may configure approval workflows'), { status: 403 });
    }
    return identity;
  };

  const requireWritableManager = async (auth: AuthContext) => {
    if (auth.role === UserRole.AUDITOR) throw Object.assign(new Error('Auditor access is read only'), { status: 403 });
  };

  const logEvent = async (organizationId: string, requestId: string, actorUserId: string | null, eventType: string, details: object = {}) => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeeWorkflowEvent" ("id","organizationId","requestId","actorUserId","eventType","details")
       VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
      randomUUID(),
      organizationId,
      requestId,
      actorUserId,
      eventType,
      JSON.stringify(details),
    );
  };

  const mailTransport = () => {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    const port = Number(process.env.SMTP_PORT || 587);
    if (!host || !user || !pass) throw Object.assign(new Error('Employee workflow email delivery is not configured'), { status: 503 });
    return {
      user,
      transport: createTransport({ host, port, secure: port === 465, auth: { user, pass }, tls: { minVersion: 'TLSv1.2' } }),
    };
  };

  const createNotification = async (input: {
    organizationId: string;
    userId: string;
    notificationType: string;
    title: string;
    message: string;
    actionUrl?: string | null;
    relatedType?: string | null;
    relatedId?: string | null;
    dedupeKey: string;
    email?: boolean;
  }) => {
    const id = randomUUID();
    const inserted = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "EmployeeNotification"
        ("id","organizationId","userId","notificationType","title","message","actionUrl","relatedType","relatedId","dedupeKey","emailStatus")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT ("organizationId","userId","dedupeKey") DO NOTHING
       RETURNING "id"`,
      id,
      input.organizationId,
      input.userId,
      input.notificationType,
      input.title,
      input.message,
      input.actionUrl || null,
      input.relatedType || null,
      input.relatedId || null,
      input.dedupeKey,
      input.email ? 'QUEUED' : 'NOT_REQUESTED',
    );
    if (!inserted[0] || !input.email) return Boolean(inserted[0]);

    const recipients = await prisma.$queryRawUnsafe<Array<{ email: string | null }>>(
      `SELECT "email" FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,
      input.userId,
      input.organizationId,
    );
    const recipient = normalizeEmail(recipients[0]?.email);
    if (!recipient) {
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeNotification" SET "emailStatus"='FAILED',"emailError"='Employee email is unavailable',"updatedAt"=NOW() WHERE "id"=$1`,
        id,
      );
      return true;
    }
    try {
      const { user, transport } = mailTransport();
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#182533;max-width:700px">
        <div style="background:#075493;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0"><h2 style="margin:0">Sulandra Health Employee 360</h2></div>
        <div style="border:1px solid #cbd7e1;border-top:0;padding:22px;border-radius:0 0 8px 8px">
          <h3 style="color:#075493">${escapeHtml(input.title)}</h3>
          <p>${escapeHtml(input.message).replace(/\n/g, '<br>')}</p>
          ${input.actionUrl ? `<p><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#0784c6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:700">Open Employee 360</a></p>` : ''}
          <p style="margin-top:28px"><strong><em style="color:#159bd3">Sulandra Health Human Resources Department</em></strong></p>
          <p style="font-size:12px;color:#637080">This is an automated Employee 360 workflow notice. Please do not reply to this message.</p>
        </div>
      </div>`;
      const result = await transport.sendMail({
        from: `"Sulandra Health Human Resources Department" <${user}>`,
        to: recipient,
        subject: input.title,
        text: `${input.message}\n\n${input.actionUrl || ''}\n\nSulandra Health Human Resources Department`,
        html,
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeNotification" SET "emailStatus"='SENT',"providerMessageId"=$1,"emailError"=NULL,"updatedAt"=NOW() WHERE "id"=$2`,
        String(result.messageId || ''),
        id,
      );
    } catch (error) {
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeNotification" SET "emailStatus"='FAILED',"emailError"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
        error instanceof Error ? error.message : String(error),
        id,
      );
    }
    return true;
  };

  const defaultDefinitions: Array<{ requestType: RequestType; name: string; description: string; steps: WorkflowStep[] }> = [
    {
      requestType: 'PROFILE_CHANGE',
      name: 'Employee Profile Change',
      description: 'Employee-submitted contact, address, legal/display-name, or emergency-contact updates.',
      steps: [
        { sequence: 1, approverType: 'SUPERVISOR', approvalMode: 'ANY', label: 'Supervisor review' },
        { sequence: 2, approverType: 'HR', approvalMode: 'ANY', label: 'Human Resources verification' },
      ],
    },
    {
      requestType: 'TIME_OFF',
      name: 'Time Off Request',
      description: 'Employee time-off requests routed to the responsible home or program manager.',
      steps: [{ sequence: 1, approverType: 'LOCATION_MANAGER', approvalMode: 'ANY', label: 'Home or program manager approval' }],
    },
    {
      requestType: 'SCHEDULE_CHANGE',
      name: 'Schedule or Availability Change',
      description: 'Availability and scheduled-shift change requests.',
      steps: [{ sequence: 1, approverType: 'LOCATION_MANAGER', approvalMode: 'ANY', label: 'Scheduling approval' }],
    },
    {
      requestType: 'DOCUMENT_CORRECTION',
      name: 'Employee Document Correction',
      description: 'Correction requests for employee-folder document metadata.',
      steps: [{ sequence: 1, approverType: 'HR', approvalMode: 'ANY', label: 'Human Resources document review' }],
    },
    {
      requestType: 'TRAINING_SUPPORT',
      name: 'Training and Education Support',
      description: 'Requests for course access, deadline support, or education-record correction.',
      steps: [
        { sequence: 1, approverType: 'SUPERVISOR', approvalMode: 'ANY', label: 'Supervisor review' },
        { sequence: 2, approverType: 'HR', approvalMode: 'ANY', label: 'Education administration' },
      ],
    },
    {
      requestType: 'HR_SUPPORT',
      name: 'Human Resources Support',
      description: 'Private employee support requests routed directly to Human Resources.',
      steps: [{ sequence: 1, approverType: 'HR', approvalMode: 'ANY', label: 'Human Resources response' }],
    },
    {
      requestType: 'GENERAL_REQUEST',
      name: 'General Employee Request',
      description: 'General workplace requests routed to the employee supervisor.',
      steps: [{ sequence: 1, approverType: 'SUPERVISOR', approvalMode: 'ANY', label: 'Supervisor review' }],
    },
  ];

  const ensureDefaults = async (organizationId: string, actorUserId: string) => {
    await ready();
    for (const definition of defaultDefinitions) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeWorkflowDefinition"
          ("id","organizationId","requestType","name","description","steps","enabled","employeeCanSubmit","createdById","updatedById")
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,TRUE,TRUE,$7,$7)
         ON CONFLICT ("organizationId","requestType") DO NOTHING`,
        randomUUID(),
        organizationId,
        definition.requestType,
        definition.name,
        definition.description,
        JSON.stringify(definition.steps),
        actorUserId,
      );
    }
  };

  const validatePayload = (requestType: RequestType, payload: Record<string, unknown>) => {
    if (requestType === 'PROFILE_CHANGE') return profileChangeSchema.parse(payload);
    if (requestType === 'TIME_OFF' || requestType === 'SCHEDULE_CHANGE') return timeRequestPayloadSchema.parse(payload);
    if (requestType === 'DOCUMENT_CORRECTION') return documentCorrectionSchema.parse(payload);
    if (requestType === 'TRAINING_SUPPORT') return trainingSupportSchema.parse(payload);
    return payload;
  };

  const resolveApprovers = async (organizationId: string, employee: EmployeeRow, step: WorkflowStep): Promise<string[]> => {
    let rows: Array<{ id: string }> = [];
    if (step.approverType === 'SPECIFIC_USER' && step.userId) {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "User" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
        organizationId,
        step.userId,
      );
    } else if (step.approverType === 'SUPERVISOR' && employee.supervisorId) {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "User" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
        organizationId,
        employee.supervisorId,
      );
    } else if (step.approverType === 'LOCATION_MANAGER' && employee.locationIds.length && await tableExists('TimeAttendanceLocationAssignment')) {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT DISTINCT u."id"
         FROM "TimeAttendanceLocationAssignment" x
         JOIN "User" u ON u."id"=x."employeeId" AND u."organizationId"=x."organizationId"
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE x."organizationId"=$1 AND x."locationId"=ANY($2::text[]) AND x."active"=TRUE AND x."isManager"=TRUE
           AND COALESCE(p."employmentStatus",'ACTIVE')<>'TERMINATED'`,
        organizationId,
        employee.locationIds,
      );
    } else if (step.approverType === 'HR') {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT u."id" FROM "User" u
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE u."organizationId"=$1 AND u."role"::text='HR_MANAGER' AND COALESCE(p."employmentStatus",'ACTIVE')<>'TERMINATED'`,
        organizationId,
      );
    } else if (step.approverType === 'ADMINISTRATOR') {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT u."id" FROM "User" u
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE u."organizationId"=$1 AND u."role"::text='ADMINISTRATOR' AND COALESCE(p."employmentStatus",'ACTIVE')<>'TERMINATED'`,
        organizationId,
      );
    } else if (step.approverType === 'OWNER') {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "User" WHERE "organizationId"=$1 AND LOWER(COALESCE("email",''))=$2 LIMIT 1`,
        organizationId,
        OWNER_EMAIL,
      );
    }

    if (!rows.length && step.approverType === 'LOCATION_MANAGER' && employee.supervisorId) {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "User" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
        organizationId,
        employee.supervisorId,
      );
    }
    if (!rows.length) {
      rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "User" WHERE "organizationId"=$1 AND LOWER(COALESCE("email",''))=$2 LIMIT 1`,
        organizationId,
        OWNER_EMAIL,
      );
    }
    return [...new Set(rows.map((row) => String(row.id)).filter(Boolean))];
  };

  const requestById = async (organizationId: string, requestId: string): Promise<WorkflowRequestRow> => {
    const rows = await prisma.$queryRawUnsafe<WorkflowRequestRow[]>(
      `SELECT * FROM "EmployeeWorkflowRequest" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      organizationId,
      requestId,
    );
    if (!rows[0]) throw Object.assign(new Error('Employee request was not found'), { status: 404 });
    rows[0].payload = asObject(rows[0].payload);
    return rows[0];
  };

  const notifyCurrentApprovers = async (request: WorkflowRequestRow, employee: EmployeeRow) => {
    const approvals = await prisma.$queryRawUnsafe<Array<{ approverUserId: string; sequence: number; label: string | null }>>(
      `SELECT "approverUserId","sequence","label" FROM "EmployeeWorkflowApproval"
       WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='PENDING'
         AND "sequence"=(SELECT MIN("sequence") FROM "EmployeeWorkflowApproval" WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='PENDING')`,
      request.organizationId,
      request.id,
    );
    for (const approval of approvals) {
      if (!approval.approverUserId) continue;
      await createNotification({
        organizationId: request.organizationId,
        userId: approval.approverUserId,
        notificationType: 'APPROVAL_REQUIRED',
        title: `Approval required: ${request.title}`,
        message: `${employee.displayName} submitted a ${request.requestType.replaceAll('_', ' ').toLowerCase()} request. ${approval.label || 'Your review is required.'}`,
        actionUrl: `${ADMIN_URL}#employeeTeamHub`,
        relatedType: 'EmployeeWorkflowRequest',
        relatedId: request.id,
        dedupeKey: `approval:${request.id}:${approval.sequence}:${approval.approverUserId}`,
        email: true,
      });
    }
  };

  const notifyEmployee = async (request: WorkflowRequestRow, employee: EmployeeRow, title: string, message: string, key: string) => {
    await createNotification({
      organizationId: request.organizationId,
      userId: employee.id,
      notificationType: 'REQUEST_UPDATE',
      title,
      message,
      actionUrl: PORTAL_URL,
      relatedType: 'EmployeeWorkflowRequest',
      relatedId: request.id,
      dedupeKey: `${key}:${request.id}`,
      email: true,
    });
  };

  const applyApprovedRequest = async (request: WorkflowRequestRow, actorUserId: string) => {
    const payload = asObject(request.payload);
    const employee = await employeeById(request.organizationId, request.employeeId);
    if (request.requestType === 'PROFILE_CHANGE') {
      if (isOwnerEmail(employee.email) && actorUserId !== employee.id) {
        throw Object.assign(new Error('The Enterprise Owner profile cannot be changed by another user'), { status: 403 });
      }
      const input = profileChangeSchema.parse(payload);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeManagementProfile" ("userId","organizationId","displayName","createdAt","updatedAt")
         VALUES ($1,$2,$3,NOW(),NOW())
         ON CONFLICT ("userId") DO NOTHING`,
        employee.id,
        request.organizationId,
        employee.displayName,
      );
      const serialized = JSON.stringify(input);
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeManagementProfile" SET
          "displayName"=CASE WHEN $1::jsonb ? 'displayName' THEN NULLIF($1::jsonb->>'displayName','') ELSE "displayName" END,
          "personalEmail"=CASE WHEN $1::jsonb ? 'personalEmail' THEN NULLIF($1::jsonb->>'personalEmail','') ELSE "personalEmail" END,
          "phone"=CASE WHEN $1::jsonb ? 'phone' THEN NULLIF($1::jsonb->>'phone','') ELSE "phone" END,
          "alternatePhone"=CASE WHEN $1::jsonb ? 'alternatePhone' THEN NULLIF($1::jsonb->>'alternatePhone','') ELSE "alternatePhone" END,
          "streetAddress"=CASE WHEN $1::jsonb ? 'streetAddress' THEN NULLIF($1::jsonb->>'streetAddress','') ELSE "streetAddress" END,
          "city"=CASE WHEN $1::jsonb ? 'city' THEN NULLIF($1::jsonb->>'city','') ELSE "city" END,
          "state"=CASE WHEN $1::jsonb ? 'state' THEN NULLIF($1::jsonb->>'state','') ELSE "state" END,
          "zipCode"=CASE WHEN $1::jsonb ? 'zipCode' THEN NULLIF($1::jsonb->>'zipCode','') ELSE "zipCode" END,
          "emergencyContactName"=CASE WHEN $1::jsonb ? 'emergencyContactName' THEN NULLIF($1::jsonb->>'emergencyContactName','') ELSE "emergencyContactName" END,
          "emergencyContactPhone"=CASE WHEN $1::jsonb ? 'emergencyContactPhone' THEN NULLIF($1::jsonb->>'emergencyContactPhone','') ELSE "emergencyContactPhone" END,
          "updatedAt"=NOW()
         WHERE "userId"=$2 AND "organizationId"=$3`,
        serialized,
        employee.id,
        request.organizationId,
      );
      if (input.displayName) {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmployeePortalCredential" SET "displayName"=$1,"updatedAt"=NOW() WHERE "userId"=$2`,
          input.displayName,
          employee.id,
        ).catch(() => undefined);
      }
    } else if ((request.requestType === 'TIME_OFF' || request.requestType === 'SCHEDULE_CHANGE') && await tableExists('TimeAttendanceRequest')) {
      if (!request.linkedResourceId) {
        const input = timeRequestPayloadSchema.parse(payload);
        const linkedId = randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "TimeAttendanceRequest"
            ("id","organizationId","employeeId","type","startAt","endAt","reason","status","reviewedById","reviewedAt","reviewNotes")
           VALUES ($1,$2,$3,$4,$5,$6,$7,'APPROVED',$8,NOW(),'Approved through Employee 360 workflow')`,
          linkedId,
          request.organizationId,
          employee.id,
          request.requestType === 'TIME_OFF' ? 'TIME_OFF' : 'AVAILABILITY',
          input.startAt,
          input.endAt,
          input.reason,
          actorUserId,
        );
        await prisma.$executeRawUnsafe(
          `UPDATE "EmployeeWorkflowRequest" SET "linkedResourceType"='TimeAttendanceRequest',"linkedResourceId"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
          linkedId,
          request.id,
        );
      }
    } else if (request.requestType === 'DOCUMENT_CORRECTION' && await tableExists('EmployeeDocument')) {
      const input = documentCorrectionSchema.parse(payload);
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE "EmployeeDocument" SET
          "category"=COALESCE($1,"category"),
          "title"=COALESCE($2,"title"),
          "issueDate"=CASE WHEN $3::boolean THEN $4 ELSE "issueDate" END,
          "expirationDate"=CASE WHEN $5::boolean THEN $6 ELSE "expirationDate" END,
          "notes"=COALESCE($7,"notes"),
          "reviewStatus"='APPROVED',"reviewedById"=$8,"reviewedAt"=NOW(),"updatedAt"=NOW()
         WHERE "id"=$9 AND "organizationId"=$10 AND "employeeId"=$11
         RETURNING "id"`,
        input.category ?? null,
        input.title ?? null,
        Object.prototype.hasOwnProperty.call(input, 'issueDate'),
        input.issueDate ?? null,
        Object.prototype.hasOwnProperty.call(input, 'expirationDate'),
        input.expirationDate ?? null,
        input.notes ?? null,
        actorUserId,
        input.documentId,
        request.organizationId,
        employee.id,
      );
      if (!rows[0]) throw Object.assign(new Error('The requested employee document was not found'), { status: 404 });
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeWorkflowRequest" SET "linkedResourceType"='EmployeeDocument',"linkedResourceId"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
        input.documentId,
        request.id,
      );
    }
    await logEvent(request.organizationId, request.id, actorUserId, 'APPROVED_REQUEST_APPLIED', { requestType: request.requestType });
  };

  const advanceRequest = async (organizationId: string, requestId: string, actorUserId: string) => {
    let request = await requestById(organizationId, requestId);
    const rejected = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "EmployeeWorkflowApproval" WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='REJECTED' LIMIT 1`,
      organizationId,
      requestId,
    );
    const employee = await employeeById(organizationId, request.employeeId);
    if (rejected[0]) {
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeWorkflowApproval" SET "status"='SKIPPED',"updatedAt"=NOW() WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='PENDING'`,
        organizationId,
        requestId,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeWorkflowRequest" SET "status"='REJECTED',"currentSequence"=NULL,"resolvedAt"=NOW(),"resolvedById"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
        actorUserId,
        requestId,
      );
      request = await requestById(organizationId, requestId);
      await notifyEmployee(request, employee, `Request not approved: ${request.title}`, 'Your request was reviewed and was not approved. Open My Workplace to view the decision and comments.', 'request-rejected');
      return request;
    }

    const pending = await prisma.$queryRawUnsafe<Array<{ sequence: number }>>(
      `SELECT MIN("sequence")::int AS "sequence" FROM "EmployeeWorkflowApproval" WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='PENDING'`,
      organizationId,
      requestId,
    );
    const nextSequence = pending[0]?.sequence ?? null;
    if (nextSequence != null) {
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeWorkflowRequest" SET "status"='IN_REVIEW',"currentSequence"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
        nextSequence,
        requestId,
      );
      request = await requestById(organizationId, requestId);
      await notifyCurrentApprovers(request, employee);
      return request;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "EmployeeWorkflowRequest" SET "status"='APPROVED',"currentSequence"=NULL,"resolvedAt"=NOW(),"resolvedById"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
      actorUserId,
      requestId,
    );
    request = await requestById(organizationId, requestId);
    await applyApprovedRequest(request, actorUserId);
    request = await requestById(organizationId, requestId);
    await notifyEmployee(request, employee, `Request approved: ${request.title}`, 'Your request completed the approval workflow. Open My Workplace to review the final status.', 'request-approved');
    return request;
  };

  const createWorkflowRequest = async (auth: AuthContext, rawInput: unknown) => {
    await ensureDefaults(auth.organizationId, auth.userId);
    const input = requestSchema.parse(rawInput);
    const payload = validatePayload(input.requestType, input.payload);
    const definitions = await prisma.$queryRawUnsafe<Array<{
      id: string;
      enabled: boolean;
      employeeCanSubmit: boolean;
      steps: unknown;
    }>>(
      `SELECT "id","enabled","employeeCanSubmit","steps" FROM "EmployeeWorkflowDefinition"
       WHERE "organizationId"=$1 AND "requestType"=$2 LIMIT 1`,
      auth.organizationId,
      input.requestType,
    );
    const definition = definitions[0];
    if (!definition?.enabled) throw Object.assign(new Error('This employee request workflow is currently disabled'), { status: 409 });
    if (!definition.employeeCanSubmit) throw Object.assign(new Error('Employees cannot submit this request type directly'), { status: 403 });
    const employee = await employeeById(auth.organizationId, auth.userId);
    let steps = asSteps(definition.steps);
    if (isOwnerEmail(employee.email)) steps = [{ sequence: 1, approverType: 'OWNER', approvalMode: 'ANY', label: 'Enterprise Owner self-approval' }];
    const requestId = randomUUID();

    await prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "EmployeeWorkflowRequest"
          ("id","organizationId","employeeId","requestType","title","description","payload","priority","status","submittedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'SUBMITTED',NOW())`,
        requestId,
        auth.organizationId,
        auth.userId,
        input.requestType,
        input.title,
        input.description,
        JSON.stringify(payload),
        input.priority,
      );
      for (const step of steps) {
        const approverIds = await resolveApprovers(auth.organizationId, employee, step);
        if (!approverIds.length) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmployeeWorkflowApproval"
              ("id","organizationId","requestId","sequence","approvalMode","approverType","approverUserId","label","status","decisionNotes")
             VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,'SKIPPED','No eligible approver was available')`,
            randomUUID(), auth.organizationId, requestId, step.sequence, step.approvalMode, step.approverType, step.label || null,
          );
          continue;
        }
        for (const approverId of approverIds) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmployeeWorkflowApproval"
              ("id","organizationId","requestId","sequence","approvalMode","approverType","approverUserId","label","status")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING')`,
            randomUUID(), auth.organizationId, requestId, step.sequence, step.approvalMode, step.approverType, approverId, step.label || null,
          );
        }
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO "EmployeeWorkflowEvent" ("id","organizationId","requestId","actorUserId","eventType","details")
         VALUES ($1,$2,$3,$4,'REQUEST_SUBMITTED',$5::jsonb)`,
        randomUUID(), auth.organizationId, requestId, auth.userId, JSON.stringify({ requestType: input.requestType, priority: input.priority }),
      );
    });

    let request = await requestById(auth.organizationId, requestId);
    const pending = await prisma.$queryRawUnsafe<Array<{ sequence: number }>>(
      `SELECT MIN("sequence")::int AS "sequence" FROM "EmployeeWorkflowApproval" WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='PENDING'`,
      auth.organizationId,
      requestId,
    );
    const firstSequence = pending[0]?.sequence ?? null;
    if (firstSequence == null) {
      request = await advanceRequest(auth.organizationId, requestId, auth.userId);
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeWorkflowRequest" SET "status"='IN_REVIEW',"currentSequence"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
        firstSequence,
        requestId,
      );
      request = await requestById(auth.organizationId, requestId);
      await notifyCurrentApprovers(request, employee);
    }
    await audit?.(auth, 'SUBMIT_EMPLOYEE_WORKFLOW_REQUEST', 'EmployeeWorkflowRequest', requestId, { requestType: input.requestType, priority: input.priority });
    return request;
  };

  const commentsForRequest = async (organizationId: string, requestId: string, includeManagement: boolean, includeHr: boolean) => {
    const allowed: CommentVisibility[] = ['EMPLOYEE_VISIBLE'];
    if (includeManagement) allowed.push('MANAGEMENT_ONLY');
    if (includeHr) allowed.push('HR_CONFIDENTIAL');
    return prisma.$queryRawUnsafe<any[]>(
      `SELECT c."id",c."authorUserId",c."visibility",c."body",c."createdAt",
              COALESCE(NULLIF(pc."displayName",''),NULLIF(pp."displayName",''),u."email",c."authorUserId") AS "authorName"
       FROM "EmployeeWorkflowComment" c
       LEFT JOIN "User" u ON u."id"=c."authorUserId"
       LEFT JOIN "EmployeePortalCredential" pc ON pc."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" pp ON pp."userId"=u."id" AND pp."organizationId"=u."organizationId"
       WHERE c."organizationId"=$1 AND c."requestId"=$2 AND c."visibility"=ANY($3::text[])
       ORDER BY c."createdAt"`,
      organizationId,
      requestId,
      allowed,
    );
  };

  const requestDetails = async (auth: AuthContext, requestId: string, employeeView = false) => {
    const request = await requestById(auth.organizationId, requestId);
    if (employeeView) {
      if (request.employeeId !== auth.userId) throw Object.assign(new Error('Employee request was not found'), { status: 404 });
    } else {
      await assertEmployeeScope(auth, request.employeeId);
    }
    const actor = await actorIdentity(auth);
    const includeHr = actor.isOwner || auth.role === UserRole.HR_MANAGER || auth.role === UserRole.ADMINISTRATOR;
    const [approvals, comments, events, employee] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT a.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",a."approverUserId") AS "approverName"
         FROM "EmployeeWorkflowApproval" a
         LEFT JOIN "User" u ON u."id"=a."approverUserId"
         LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE a."organizationId"=$1 AND a."requestId"=$2 ORDER BY a."sequence",a."createdAt"`,
        auth.organizationId,
        request.id,
      ),
      commentsForRequest(auth.organizationId, request.id, !employeeView, includeHr),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","actorUserId","eventType","details","createdAt" FROM "EmployeeWorkflowEvent"
         WHERE "organizationId"=$1 AND "requestId"=$2 ORDER BY "createdAt"`,
        auth.organizationId,
        request.id,
      ),
      employeeById(auth.organizationId, request.employeeId),
    ]);
    return { request, employee, approvals, comments, events };
  };

  const managerPermissions = async (auth: AuthContext) => {
    const actor = await actorIdentity(auth);
    return {
      actorIsOwner: actor.isOwner,
      readOnly: auth.role === UserRole.AUDITOR,
      canManageWorkflows: actor.isOwner || workflowManagerRoles.has(auth.role),
      canApprove: actor.isOwner || decisionRoles.has(auth.role),
      canAddFeedback: actor.isOwner || feedbackRoles.has(auth.role),
      canRecognize: actor.isOwner || feedbackRoles.has(auth.role),
      canViewHrConfidential: actor.isOwner || auth.role === UserRole.HR_MANAGER || auth.role === UserRole.ADMINISTRATOR,
    };
  };

  app.get('/api/employee/me/collaboration', async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await ensureDefaults(auth.organizationId, auth.userId);
      const employee = await employeeById(auth.organizationId, auth.userId);
      const [definitions, requests, approvals, comments, feedback, recognition, notifications, managerRows] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "requestType","name","description" FROM "EmployeeWorkflowDefinition"
           WHERE "organizationId"=$1 AND "enabled"=TRUE AND "employeeCanSubmit"=TRUE ORDER BY "name"`,
          auth.organizationId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "EmployeeWorkflowRequest" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC LIMIT 250`,
          auth.organizationId,
          auth.userId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","requestId","sequence","approvalMode","approverType","label","status","decisionNotes","decidedAt","createdAt"
           FROM "EmployeeWorkflowApproval" WHERE "organizationId"=$1 AND "requestId" IN
             (SELECT "id" FROM "EmployeeWorkflowRequest" WHERE "organizationId"=$1 AND "employeeId"=$2)
           ORDER BY "sequence","createdAt"`,
          auth.organizationId,
          auth.userId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","requestId","authorUserId","visibility","body","createdAt" FROM "EmployeeWorkflowComment"
           WHERE "organizationId"=$1 AND "visibility"='EMPLOYEE_VISIBLE' AND "requestId" IN
             (SELECT "id" FROM "EmployeeWorkflowRequest" WHERE "organizationId"=$1 AND "employeeId"=$2)
           ORDER BY "createdAt"`,
          auth.organizationId,
          auth.userId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT f.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",f."authorUserId") AS "authorName"
           FROM "EmployeeTeamFeedback" f
           LEFT JOIN "User" u ON u."id"=f."authorUserId"
           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
           WHERE f."organizationId"=$1 AND f."employeeId"=$2 AND f."status"='ACTIVE' AND f."visibility"='EMPLOYEE_VISIBLE'
           ORDER BY f."createdAt" DESC LIMIT 250`,
          auth.organizationId,
          auth.userId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT r.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",r."nominatorUserId") AS "nominatorName"
           FROM "EmployeeRecognition" r
           LEFT JOIN "User" u ON u."id"=r."nominatorUserId"
           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
           WHERE r."organizationId"=$1 AND r."employeeId"=$2 AND r."status"='ACTIVE' AND r."visibility"<>'MANAGEMENT_ONLY'
           ORDER BY r."awardDate" DESC,r."createdAt" DESC LIMIT 250`,
          auth.organizationId,
          auth.userId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "EmployeeNotification" WHERE "organizationId"=$1 AND "userId"=$2 AND "status"<>'ARCHIVED'
           ORDER BY CASE WHEN "status"='UNREAD' THEN 0 ELSE 1 END,"createdAt" DESC LIMIT 300`,
          auth.organizationId,
          auth.userId,
        ),
        employee.supervisorId
          ? prisma.$queryRawUnsafe<any[]>(
            `SELECT u."id",u."email",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName"
             FROM "User" u LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
             LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
             WHERE u."organizationId"=$1 AND u."id"=$2 LIMIT 1`,
            auth.organizationId,
            employee.supervisorId,
          )
          : Promise.resolve([]),
      ]);
      res.json({
        data: {
          employee,
          manager: managerRows[0] || null,
          availableRequestTypes: definitions,
          requests: requests.map((row) => ({ ...row, payload: asObject(row.payload) })),
          approvals,
          comments,
          feedback,
          recognition,
          notifications,
          metrics: {
            openRequests: requests.filter((row) => ['SUBMITTED', 'IN_REVIEW'].includes(String(row.status))).length,
            unreadNotifications: notifications.filter((row) => row.status === 'UNREAD').length,
            pendingAcknowledgments: feedback.filter((row) => row.requiresAcknowledgment && !row.acknowledgedAt).length,
            recognitionCount: recognition.length,
          },
        },
      });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/collaboration/requests', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const request = await createWorkflowRequest(auth, req.body);
      res.status(201).json({ data: request });
    } catch (error) { next(error); }
  });

  app.get('/api/employee/me/collaboration/requests/:requestId', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      res.json({ data: await requestDetails(auth, req.params.requestId, true) });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/collaboration/requests/:requestId/comments', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const request = await requestById(auth.organizationId, req.params.requestId);
      if (request.employeeId !== auth.userId) return void res.status(404).json({ error: 'Employee request was not found' });
      const input = commentSchema.parse({ ...req.body, visibility: 'EMPLOYEE_VISIBLE' });
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeWorkflowComment" ("id","organizationId","requestId","authorUserId","visibility","body")
         VALUES ($1,$2,$3,$4,'EMPLOYEE_VISIBLE',$5)`,
        id, auth.organizationId, request.id, auth.userId, input.body,
      );
      await logEvent(auth.organizationId, request.id, auth.userId, 'EMPLOYEE_COMMENT_ADDED', { commentId: id });
      await notifyCurrentApprovers(request, await employeeById(auth.organizationId, auth.userId));
      await audit?.(auth, 'ADD_EMPLOYEE_REQUEST_COMMENT', 'EmployeeWorkflowRequest', request.id, { commentId: id });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/collaboration/requests/:requestId/cancel', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const request = await requestById(auth.organizationId, req.params.requestId);
      if (request.employeeId !== auth.userId) return void res.status(404).json({ error: 'Employee request was not found' });
      if (!['SUBMITTED', 'IN_REVIEW'].includes(request.status)) return void res.status(409).json({ error: 'Only an open request can be cancelled' });
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeWorkflowRequest" SET "status"='CANCELLED',"currentSequence"=NULL,"resolvedAt"=NOW(),"resolvedById"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
        auth.userId,
        request.id,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeWorkflowApproval" SET "status"='SKIPPED',"decisionNotes"='Request cancelled by employee',"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='PENDING'`,
        auth.organizationId,
        request.id,
      );
      await logEvent(auth.organizationId, request.id, auth.userId, 'REQUEST_CANCELLED', {});
      await audit?.(auth, 'CANCEL_EMPLOYEE_WORKFLOW_REQUEST', 'EmployeeWorkflowRequest', request.id);
      res.json({ data: await requestById(auth.organizationId, request.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/collaboration/feedback/:feedbackId/acknowledge', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "EmployeeTeamFeedback" SET "acknowledgedAt"=NOW(),"acknowledgedById"=$1,"updatedAt"=NOW()
         WHERE "id"=$2 AND "organizationId"=$3 AND "employeeId"=$1 AND "status"='ACTIVE' AND "visibility"='EMPLOYEE_VISIBLE'
         RETURNING "id","acknowledgedAt"`,
        auth.userId,
        req.params.feedbackId,
        auth.organizationId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Feedback record was not found' });
      await audit?.(auth, 'ACKNOWLEDGE_EMPLOYEE_FEEDBACK', 'EmployeeTeamFeedback', req.params.feedbackId);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/employee/me/collaboration/notifications/:notificationId/read', async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "EmployeeNotification" SET "status"='READ',"readAt"=COALESCE("readAt",NOW()),"updatedAt"=NOW()
         WHERE "id"=$1 AND "organizationId"=$2 AND "userId"=$3 RETURNING "id","status","readAt"`,
        req.params.notificationId,
        auth.organizationId,
        auth.userId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Notification was not found' });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/collaboration/notifications/read-all', async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const count = await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeNotification" SET "status"='READ',"readAt"=COALESCE("readAt",NOW()),"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "userId"=$2 AND "status"='UNREAD'`,
        auth.organizationId,
        auth.userId,
      );
      res.json({ data: { updated: count } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employee-collaboration/dashboard', managerGate, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await ensureDefaults(auth.organizationId, auth.userId);
      const allowedIds = await scopedEmployeeIds(auth);
      const employees = (await allEmployees(auth.organizationId)).filter((employee) => allowedIds.includes(employee.id));
      const permissions = await managerPermissions(auth);
      const approvalWhere = permissions.actorIsOwner || globalManagerRoles.has(auth.role)
        ? `a."organizationId"=$1 AND a."status"='PENDING'`
        : `a."organizationId"=$1 AND a."status"='PENDING' AND a."approverUserId"=$2`;
      const approvalArgs = permissions.actorIsOwner || globalManagerRoles.has(auth.role)
        ? [auth.organizationId]
        : [auth.organizationId, auth.userId];
      const [pendingApprovals, recentRequests, recentRecognition, followUps, notifications] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT a."id" AS "approvalId",a."requestId",a."sequence",a."approvalMode",a."approverType",a."label",
                  r."employeeId",r."requestType",r."title",r."description",r."priority",r."status",r."createdAt",
                  COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",r."employeeId") AS "employeeName"
           FROM "EmployeeWorkflowApproval" a
           JOIN "EmployeeWorkflowRequest" r ON r."id"=a."requestId" AND r."organizationId"=a."organizationId"
           JOIN "User" u ON u."id"=r."employeeId"
           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
           WHERE ${approvalWhere} AND r."employeeId"=ANY($${approvalArgs.length + 1}::text[])
           ORDER BY CASE r."priority" WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,r."createdAt" LIMIT 500`,
          ...approvalArgs,
          allowedIds,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT r.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",r."employeeId") AS "employeeName"
           FROM "EmployeeWorkflowRequest" r JOIN "User" u ON u."id"=r."employeeId"
           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
           WHERE r."organizationId"=$1 AND r."employeeId"=ANY($2::text[])
           ORDER BY r."createdAt" DESC LIMIT 500`,
          auth.organizationId,
          allowedIds,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT r.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",r."employeeId") AS "employeeName"
           FROM "EmployeeRecognition" r JOIN "User" u ON u."id"=r."employeeId"
           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
           WHERE r."organizationId"=$1 AND r."employeeId"=ANY($2::text[]) AND r."status"='ACTIVE'
           ORDER BY r."awardDate" DESC,r."createdAt" DESC LIMIT 100`,
          auth.organizationId,
          allowedIds,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT f.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",f."employeeId") AS "employeeName"
           FROM "EmployeeTeamFeedback" f JOIN "User" u ON u."id"=f."employeeId"
           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
           WHERE f."organizationId"=$1 AND f."employeeId"=ANY($2::text[]) AND f."status"='ACTIVE'
             AND f."followUpDate" IS NOT NULL AND f."followUpDate"<=CURRENT_DATE+30
           ORDER BY f."followUpDate",f."createdAt" DESC LIMIT 200`,
          auth.organizationId,
          allowedIds,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "EmployeeNotification" WHERE "organizationId"=$1 AND "userId"=$2 AND "status"<>'ARCHIVED'
           ORDER BY CASE WHEN "status"='UNREAD' THEN 0 ELSE 1 END,"createdAt" DESC LIMIT 200`,
          auth.organizationId,
          auth.userId,
        ),
      ]);

      const hasCompliance = await tableExists('EmployeeComplianceAssignment');
      const hasEducation = await tableExists('EducationAssignment');
      const hasDocuments = await tableExists('EmployeeDocument');
      const hasShifts = await tableExists('TimeAttendanceShift');
      const teamRows = await Promise.all(employees.filter((employee) => employee.id !== auth.userId).map(async (employee) => {
        const [openRequestRows, complianceRows, educationRows, documentRows, shiftRows] = await Promise.all([
          prisma.$queryRawUnsafe<Array<{ count: number }>>(
            `SELECT COUNT(*)::int AS "count" FROM "EmployeeWorkflowRequest" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status" IN ('SUBMITTED','IN_REVIEW')`,
            auth.organizationId, employee.id,
          ),
          hasCompliance ? prisma.$queryRawUnsafe<Array<{ overdue: number; dueSoon: number }>>(
            `SELECT COUNT(*) FILTER (WHERE "status"='OVERDUE')::int AS "overdue",COUNT(*) FILTER (WHERE "status"='DUE_SOON')::int AS "dueSoon"
             FROM "EmployeeComplianceAssignment" WHERE "organizationId"=$1 AND "employeeId"=$2`,
            auth.organizationId, employee.id,
          ) : Promise.resolve([{ overdue: 0, dueSoon: 0 }]),
          hasEducation ? prisma.$queryRawUnsafe<Array<{ overdue: number }>>(
            `SELECT COUNT(*) FILTER (WHERE "status"<>'COMPLETED' AND "dueDate"<NOW())::int AS "overdue"
             FROM "EducationAssignment" WHERE "organizationId"=$1 AND "employeeId"=$2`,
            auth.organizationId, employee.id,
          ) : Promise.resolve([{ overdue: 0 }]),
          hasDocuments ? prisma.$queryRawUnsafe<Array<{ expiring: number; expired: number }>>(
            `SELECT COUNT(*) FILTER (WHERE "status"='ACTIVE' AND "expirationDate"<CURRENT_DATE)::int AS "expired",
                    COUNT(*) FILTER (WHERE "status"='ACTIVE' AND "expirationDate">=CURRENT_DATE AND "expirationDate"<=CURRENT_DATE+60)::int AS "expiring"
             FROM "EmployeeDocument" WHERE "organizationId"=$1 AND "employeeId"=$2`,
            auth.organizationId, employee.id,
          ) : Promise.resolve([{ expiring: 0, expired: 0 }]),
          hasShifts ? prisma.$queryRawUnsafe<Array<{ count: number }>>(
            `SELECT COUNT(*)::int AS "count" FROM "TimeAttendanceShift" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "startTime">NOW() AND "startTime"<=NOW()+INTERVAL '14 days'`,
            auth.organizationId, employee.id,
          ) : Promise.resolve([{ count: 0 }]),
        ]);
        return {
          ...employee,
          openRequestCount: openRequestRows[0]?.count || 0,
          overdueComplianceCount: complianceRows[0]?.overdue || 0,
          dueSoonComplianceCount: complianceRows[0]?.dueSoon || 0,
          overdueEducationCount: educationRows[0]?.overdue || 0,
          expiredDocumentCount: documentRows[0]?.expired || 0,
          expiringDocumentCount: documentRows[0]?.expiring || 0,
          upcomingShiftCount: shiftRows[0]?.count || 0,
        };
      }));

      res.json({
        data: {
          permissions,
          metrics: {
            teamCount: teamRows.length,
            pendingApprovalCount: pendingApprovals.length,
            openRequestCount: recentRequests.filter((row) => ['SUBMITTED', 'IN_REVIEW'].includes(String(row.status))).length,
            unreadNotificationCount: notifications.filter((row) => row.status === 'UNREAD').length,
            overdueComplianceCount: teamRows.reduce((sum, row) => sum + Number(row.overdueComplianceCount || 0), 0),
            overdueEducationCount: teamRows.reduce((sum, row) => sum + Number(row.overdueEducationCount || 0), 0),
            expiringDocumentCount: teamRows.reduce((sum, row) => sum + Number(row.expiringDocumentCount || 0) + Number(row.expiredDocumentCount || 0), 0),
            recognitionLast30Days: recentRecognition.filter((row) => new Date(row.awardDate).getTime() >= Date.now() - 30 * 86_400_000).length,
          },
          team: teamRows,
          pendingApprovals,
          recentRequests,
          recentRecognition,
          followUps,
          notifications,
        },
      });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employee-collaboration/requests/:requestId', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      res.json({ data: await requestDetails(auth, req.params.requestId, false) });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-collaboration/requests/:requestId/decision', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await requireWritableManager(auth);
      const identity = await actorIdentity(auth);
      if (!identity.isOwner && !decisionRoles.has(auth.role)) return void res.status(403).json({ error: 'You are not authorized to approve employee requests' });
      const request = await requestById(auth.organizationId, req.params.requestId);
      await assertEmployeeScope(auth, request.employeeId);
      if (!['SUBMITTED', 'IN_REVIEW'].includes(request.status)) return void res.status(409).json({ error: 'This request is no longer awaiting approval' });
      const input = decisionSchema.parse(req.body);
      const assigned = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "EmployeeWorkflowApproval" WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='PENDING'
         AND "sequence"=$3 AND "approverUserId"=$4 ORDER BY "createdAt" LIMIT 1`,
        auth.organizationId,
        request.id,
        request.currentSequence,
        auth.userId,
      );
      const canOverride = identity.isOwner || auth.role === UserRole.HR_MANAGER || auth.role === UserRole.ADMINISTRATOR;
      const approval = assigned[0] || (canOverride ? (await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "EmployeeWorkflowApproval" WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='PENDING'
         AND "sequence"=$3 ORDER BY "createdAt" LIMIT 1`,
        auth.organizationId,
        request.id,
        request.currentSequence,
      ))[0] : null);
      if (!approval) return void res.status(403).json({ error: 'This approval step is not assigned to you' });

      const nextStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeWorkflowApproval" SET "status"=$1,"decisionNotes"=$2,"decidedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$3`,
        nextStatus,
        input.notes,
        approval.id,
      );
      if (input.decision === 'APPROVE' && approval.approvalMode === 'ANY') {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmployeeWorkflowApproval" SET "status"='SKIPPED',"decisionNotes"='Approval completed by another authorized approver',"updatedAt"=NOW()
           WHERE "organizationId"=$1 AND "requestId"=$2 AND "sequence"=$3 AND "status"='PENDING'`,
          auth.organizationId,
          request.id,
          approval.sequence,
        );
      }
      if (input.decision === 'REJECT') {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmployeeWorkflowApproval" SET "status"='SKIPPED',"decisionNotes"='Workflow stopped after rejection',"updatedAt"=NOW()
           WHERE "organizationId"=$1 AND "requestId"=$2 AND "status"='PENDING'`,
          auth.organizationId,
          request.id,
        );
      }
      await logEvent(auth.organizationId, request.id, auth.userId, `REQUEST_${nextStatus}`, { approvalId: approval.id, sequence: approval.sequence, notes: input.notes });
      const updated = await advanceRequest(auth.organizationId, request.id, auth.userId);
      await audit?.(auth, `EMPLOYEE_REQUEST_${nextStatus}`, 'EmployeeWorkflowRequest', request.id, { approvalId: approval.id, notes: input.notes });
      res.json({ data: updated });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-collaboration/requests/:requestId/comments', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await requireWritableManager(auth);
      const request = await requestById(auth.organizationId, req.params.requestId);
      await assertEmployeeScope(auth, request.employeeId);
      const input = commentSchema.parse(req.body);
      const identity = await actorIdentity(auth);
      if (input.visibility === 'HR_CONFIDENTIAL' && !identity.isOwner && auth.role !== UserRole.HR_MANAGER && auth.role !== UserRole.ADMINISTRATOR) {
        return void res.status(403).json({ error: 'Only Human Resources, an Administrator, or the Enterprise Owner may create HR-confidential comments' });
      }
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeWorkflowComment" ("id","organizationId","requestId","authorUserId","visibility","body") VALUES ($1,$2,$3,$4,$5,$6)`,
        id, auth.organizationId, request.id, auth.userId, input.visibility, input.body,
      );
      await logEvent(auth.organizationId, request.id, auth.userId, 'MANAGER_COMMENT_ADDED', { commentId: id, visibility: input.visibility });
      if (input.visibility === 'EMPLOYEE_VISIBLE') {
        const employee = await employeeById(auth.organizationId, request.employeeId);
        await notifyEmployee(request, employee, `New comment on: ${request.title}`, 'A manager added a comment to your Employee 360 request.', `request-comment:${id}`);
      }
      await audit?.(auth, 'ADD_MANAGER_REQUEST_COMMENT', 'EmployeeWorkflowRequest', request.id, { commentId: id, visibility: input.visibility });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employees/:employeeId/collaboration', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await assertEmployeeScope(auth, req.params.employeeId);
      const employee = await employeeById(auth.organizationId, req.params.employeeId);
      const permissions = await managerPermissions(auth);
      const feedbackVisibility: FeedbackVisibility[] = ['EMPLOYEE_VISIBLE', 'MANAGEMENT_ONLY'];
      if (permissions.canViewHrConfidential) feedbackVisibility.push('HR_CONFIDENTIAL');
      const [requests, feedback, recognition] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "EmployeeWorkflowRequest" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC LIMIT 250`,
          auth.organizationId,
          employee.id,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT f.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",f."authorUserId") AS "authorName"
           FROM "EmployeeTeamFeedback" f
           LEFT JOIN "User" u ON u."id"=f."authorUserId"
           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
           WHERE f."organizationId"=$1 AND f."employeeId"=$2 AND f."status"='ACTIVE' AND f."visibility"=ANY($3::text[])
           ORDER BY f."createdAt" DESC LIMIT 300`,
          auth.organizationId,
          employee.id,
          feedbackVisibility,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT r.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",r."nominatorUserId") AS "nominatorName"
           FROM "EmployeeRecognition" r
           LEFT JOIN "User" u ON u."id"=r."nominatorUserId"
           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
           WHERE r."organizationId"=$1 AND r."employeeId"=$2 AND r."status"='ACTIVE'
           ORDER BY r."awardDate" DESC,r."createdAt" DESC LIMIT 300`,
          auth.organizationId,
          employee.id,
        ),
      ]);
      res.json({ data: { employee, permissions, requests: requests.map((row) => ({ ...row, payload: asObject(row.payload) })), feedback, recognition } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:employeeId/feedback', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await requireWritableManager(auth);
      const identity = await actorIdentity(auth);
      if (!identity.isOwner && !feedbackRoles.has(auth.role)) return void res.status(403).json({ error: 'You are not authorized to add employee feedback' });
      await assertEmployeeScope(auth, req.params.employeeId);
      const input = feedbackSchema.parse(req.body);
      if (input.visibility === 'HR_CONFIDENTIAL' && !identity.isOwner && auth.role !== UserRole.HR_MANAGER && auth.role !== UserRole.ADMINISTRATOR) {
        return void res.status(403).json({ error: 'Only Human Resources, an Administrator, or the Enterprise Owner may create HR-confidential feedback' });
      }
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeTeamFeedback"
          ("id","organizationId","employeeId","authorUserId","kind","subject","body","visibility","requiresAcknowledgment","followUpDate")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        id, auth.organizationId, req.params.employeeId, auth.userId, input.kind, input.subject, input.body, input.visibility,
        input.requiresAcknowledgment, input.followUpDate ?? null,
      );
      if (input.visibility === 'EMPLOYEE_VISIBLE') {
        await createNotification({
          organizationId: auth.organizationId,
          userId: req.params.employeeId,
          notificationType: 'FEEDBACK',
          title: input.subject,
          message: input.requiresAcknowledgment ? 'New manager feedback is available and requires your acknowledgment.' : 'New manager feedback is available in My Workplace.',
          actionUrl: PORTAL_URL,
          relatedType: 'EmployeeTeamFeedback',
          relatedId: id,
          dedupeKey: `feedback:${id}`,
          email: true,
        });
      }
      await audit?.(auth, 'CREATE_EMPLOYEE_FEEDBACK', 'EmployeeTeamFeedback', id, { employeeId: req.params.employeeId, kind: input.kind, visibility: input.visibility });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employees/:employeeId/feedback/:feedbackId/archive', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await requireWritableManager(auth);
      await assertEmployeeScope(auth, req.params.employeeId);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "EmployeeTeamFeedback" SET "status"='ARCHIVED',"updatedAt"=NOW()
         WHERE "id"=$1 AND "organizationId"=$2 AND "employeeId"=$3 RETURNING "id"`,
        req.params.feedbackId, auth.organizationId, req.params.employeeId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Feedback record was not found' });
      await audit?.(auth, 'ARCHIVE_EMPLOYEE_FEEDBACK', 'EmployeeTeamFeedback', req.params.feedbackId, { employeeId: req.params.employeeId });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:employeeId/recognition', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await requireWritableManager(auth);
      const identity = await actorIdentity(auth);
      if (!identity.isOwner && !feedbackRoles.has(auth.role)) return void res.status(403).json({ error: 'You are not authorized to recognize employees' });
      await assertEmployeeScope(auth, req.params.employeeId);
      const input = recognitionSchema.parse(req.body);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeRecognition"
          ("id","organizationId","employeeId","nominatorUserId","category","title","message","visibility","points","awardDate")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        id, auth.organizationId, req.params.employeeId, auth.userId, input.category, input.title, input.message, input.visibility, input.points, input.awardDate,
      );
      if (input.visibility !== 'MANAGEMENT_ONLY') {
        await createNotification({
          organizationId: auth.organizationId,
          userId: req.params.employeeId,
          notificationType: 'RECOGNITION',
          title: `Recognition: ${input.title}`,
          message: input.message,
          actionUrl: PORTAL_URL,
          relatedType: 'EmployeeRecognition',
          relatedId: id,
          dedupeKey: `recognition:${id}`,
          email: true,
        });
      }
      await audit?.(auth, 'CREATE_EMPLOYEE_RECOGNITION', 'EmployeeRecognition', id, { employeeId: req.params.employeeId, category: input.category, visibility: input.visibility, points: input.points });
      res.status(201).json({ data: { id } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employees/:employeeId/recognition/:recognitionId/archive', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await requireWritableManager(auth);
      await assertEmployeeScope(auth, req.params.employeeId);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "EmployeeRecognition" SET "status"='ARCHIVED',"updatedAt"=NOW()
         WHERE "id"=$1 AND "organizationId"=$2 AND "employeeId"=$3 RETURNING "id"`,
        req.params.recognitionId, auth.organizationId, req.params.employeeId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Recognition record was not found' });
      await audit?.(auth, 'ARCHIVE_EMPLOYEE_RECOGNITION', 'EmployeeRecognition', req.params.recognitionId, { employeeId: req.params.employeeId });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employee-collaboration/workflows', managerGate, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await ensureDefaults(auth.organizationId, auth.userId);
      const permissions = await managerPermissions(auth);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "EmployeeWorkflowDefinition" WHERE "organizationId"=$1 ORDER BY "name"`,
        auth.organizationId,
      );
      res.json({ data: { permissions, workflows: rows.map((row) => ({ ...row, steps: asSteps(row.steps) })) } });
    } catch (error) { next(error); }
  });

  app.put('/api/admin/employee-collaboration/workflows/:requestType', managerGate, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await requireWritableManager(auth);
      await requireWorkflowManager(auth);
      const requestType = z.enum(REQUEST_TYPES as [RequestType, ...RequestType[]]).parse(req.params.requestType);
      const input = workflowDefinitionSchema.parse(req.body);
      const id = randomUUID();
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO "EmployeeWorkflowDefinition"
          ("id","organizationId","requestType","name","description","steps","enabled","employeeCanSubmit","createdById","updatedById")
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$9)
         ON CONFLICT ("organizationId","requestType") DO UPDATE SET
          "name"=EXCLUDED."name","description"=EXCLUDED."description","steps"=EXCLUDED."steps",
          "enabled"=EXCLUDED."enabled","employeeCanSubmit"=EXCLUDED."employeeCanSubmit","updatedById"=EXCLUDED."updatedById","updatedAt"=NOW()
         RETURNING *`,
        id,
        auth.organizationId,
        requestType,
        input.name,
        input.description ?? null,
        JSON.stringify(input.steps.sort((a, b) => a.sequence - b.sequence)),
        input.enabled,
        input.employeeCanSubmit,
        auth.userId,
      );
      await audit?.(auth, 'UPSERT_EMPLOYEE_WORKFLOW_DEFINITION', 'EmployeeWorkflowDefinition', rows[0]?.id, { requestType, steps: input.steps });
      res.json({ data: { ...rows[0], steps: asSteps(rows[0]?.steps) } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee-collaboration/workflows/reset-defaults', managerGate, async (_req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await requireWritableManager(auth);
      await requireWorkflowManager(auth);
      for (const definition of defaultDefinitions) {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmployeeWorkflowDefinition" SET "name"=$1,"description"=$2,"steps"=$3::jsonb,"enabled"=TRUE,"employeeCanSubmit"=TRUE,"updatedById"=$4,"updatedAt"=NOW()
           WHERE "organizationId"=$5 AND "requestType"=$6`,
          definition.name,
          definition.description,
          JSON.stringify(definition.steps),
          auth.userId,
          auth.organizationId,
          definition.requestType,
        );
      }
      await audit?.(auth, 'RESET_EMPLOYEE_WORKFLOW_DEFAULTS', 'EmployeeWorkflowDefinition');
      res.json({ data: { reset: true } });
    } catch (error) { next(error); }
  });
}
