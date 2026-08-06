import { randomUUID } from 'node:crypto';
import type { Express, Request, RequestHandler, Response } from 'express';
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

type RequirementType = 'DOCUMENT' | 'EDUCATION' | 'ATTESTATION' | 'MANUAL';
type ComplianceStatus = 'NOT_STARTED' | 'MISSING' | 'IN_PROGRESS' | 'DUE_SOON' | 'OVERDUE' | 'COMPLIANT' | 'EXEMPT' | 'NOT_APPLICABLE';
type RecipientType = 'EMPLOYEE' | 'SUPERVISOR' | 'LOCATION_MANAGER' | 'HR';
type RunTrigger = 'MANUAL' | 'SCHEDULED' | 'STARTUP';

type RequirementRow = {
  id: string;
  organizationId: string;
  code: string;
  title: string;
  description: string | null;
  requirementType: RequirementType;
  documentCategory: string | null;
  documentTitleContains: string | null;
  documentSensitivity: string;
  courseCode: string | null;
  courseTitle: string | null;
  attestationText: string | null;
  requiredForAll: boolean;
  appliesToRoles: unknown;
  appliesToDepartments: unknown;
  appliesToJobTitles: unknown;
  appliesToLocationIds: unknown;
  employmentStatuses: unknown;
  dueDaysAfterHire: number;
  renewalDays: number | null;
  warningWindowDays: number;
  reminderDays: unknown;
  managerEscalationDays: unknown;
  hrEscalationDays: unknown;
  notifyEmployee: boolean;
  notifySupervisor: boolean;
  notifyLocationManager: boolean;
  notifyHR: boolean;
  autoAssignEducation: boolean;
  allowEmployeeUpload: boolean;
  allowEmployeeAttestation: boolean;
  active: boolean;
  createdById: string;
  updatedById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
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

type AssignmentRow = {
  id: string;
  organizationId: string;
  requirementId: string;
  employeeId: string;
  status: ComplianceStatus;
  source: string;
  dueDate: Date | string | null;
  completedAt: Date | string | null;
  expiresAt: Date | string | null;
  evidenceType: string | null;
  evidenceId: string | null;
  evidenceSummary: string | null;
  exemptReason: string | null;
  exemptUntil: Date | string | null;
  manuallyCompletedAt: Date | string | null;
  manualNotes: string | null;
  lastEvaluatedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
const PORTAL_URL = 'https://www.sulandrahealth.com/employee-portal.html#myCompliance';
const EDUCATION_URL = 'https://www.sulandrahealth.com/education-portal.html';
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const DAY_MS = 86_400_000;
const DEFAULT_REMINDER_DAYS = [60, 30, 14, 7, 1, 0, -1, -7, -14, -30];
const DEFAULT_MANAGER_ESCALATION_DAYS = [-1, -7, -14, -30];
const DEFAULT_HR_ESCALATION_DAYS = [-7, -14, -30];
const SENSITIVITIES = ['GENERAL', 'HR_CONFIDENTIAL', 'MEDICAL', 'BACKGROUND', 'DISCIPLINARY', 'IDENTITY', 'COMPENSATION'] as const;

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

const requirementManagers = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.HR_MANAGER,
]);

const reminderSenders = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.HR_MANAGER,
  UserRole.PROGRAM_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.CEO,
  UserRole.COO,
]);

const requirementSchema = z.object({
  code: z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use letters, numbers, periods, underscores, or hyphens'),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4_000).optional().nullable(),
  requirementType: z.enum(['DOCUMENT', 'EDUCATION', 'ATTESTATION', 'MANUAL']),
  documentCategory: z.string().trim().max(120).optional().nullable(),
  documentTitleContains: z.string().trim().max(200).optional().nullable(),
  documentSensitivity: z.enum(SENSITIVITIES).optional().default('GENERAL'),
  courseCode: z.string().trim().max(120).optional().nullable(),
  courseTitle: z.string().trim().max(300).optional().nullable(),
  attestationText: z.string().trim().max(10_000).optional().nullable(),
  requiredForAll: z.boolean().optional().default(false),
  appliesToRoles: z.array(z.string().trim().min(1).max(80)).max(100).optional().default([]),
  appliesToDepartments: z.array(z.string().trim().min(1).max(160)).max(100).optional().default([]),
  appliesToJobTitles: z.array(z.string().trim().min(1).max(160)).max(100).optional().default([]),
  appliesToLocationIds: z.array(z.string().trim().min(1).max(200)).max(500).optional().default([]),
  employmentStatuses: z.array(z.enum(['ACTIVE', 'LEAVE', 'SUSPENDED', 'TERMINATED'])).min(1).max(4).optional().default(['ACTIVE']),
  dueDaysAfterHire: z.number().int().min(0).max(3_650).optional().default(30),
  renewalDays: z.number().int().min(1).max(3_650).optional().nullable(),
  warningWindowDays: z.number().int().min(1).max(365).optional().default(60),
  reminderDays: z.array(z.number().int().min(-3_650).max(3_650)).max(50).optional().default(DEFAULT_REMINDER_DAYS),
  managerEscalationDays: z.array(z.number().int().min(-3_650).max(0)).max(50).optional().default(DEFAULT_MANAGER_ESCALATION_DAYS),
  hrEscalationDays: z.array(z.number().int().min(-3_650).max(0)).max(50).optional().default(DEFAULT_HR_ESCALATION_DAYS),
  notifyEmployee: z.boolean().optional().default(true),
  notifySupervisor: z.boolean().optional().default(true),
  notifyLocationManager: z.boolean().optional().default(true),
  notifyHR: z.boolean().optional().default(true),
  autoAssignEducation: z.boolean().optional().default(true),
  allowEmployeeUpload: z.boolean().optional().default(true),
  allowEmployeeAttestation: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true),
}).superRefine((value, context) => {
  if (!value.requiredForAll && value.appliesToRoles.length === 0 && value.appliesToDepartments.length === 0 && value.appliesToJobTitles.length === 0 && value.appliesToLocationIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['requiredForAll'], message: 'Choose Required for all or add at least one applicability filter' });
  }
  if (value.requirementType === 'DOCUMENT' && !value.documentCategory) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['documentCategory'], message: 'Document requirements need a document category' });
  }
  if (value.requirementType === 'EDUCATION' && !value.courseCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['courseCode'], message: 'Education requirements need a course code' });
  }
  if (value.requirementType === 'ATTESTATION' && !value.attestationText) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['attestationText'], message: 'Attestation requirements need an attestation statement' });
  }
});

const settingsSchema = z.object({
  enabled: z.boolean().optional().default(true),
  timezone: z.string().trim().min(1).max(100).optional().default('America/New_York'),
  scanHour: z.number().int().min(0).max(23).optional().default(8),
  hrRecipients: z.array(z.string().trim().email()).max(50).optional().default([]),
  portalUrl: z.string().trim().url().max(500).optional().default(PORTAL_URL),
  senderName: z.string().trim().min(2).max(160).optional().default('Sulandra Health Human Resources Department'),
});

const assignmentOverrideSchema = z.object({
  action: z.enum(['EXEMPT', 'CLEAR_EXEMPTION', 'MARK_COMPLETE', 'RESET', 'CHANGE_DUE_DATE']),
  reason: z.string().trim().max(4_000).optional().nullable(),
  exemptUntil: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
});

const attestationSchema = z.object({
  typedName: z.string().trim().min(2).max(200),
  accepted: z.literal(true),
});

const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().min(1).max(180),
  contentBase64: z.string().min(1).max(25_000_000),
  issueDate: z.coerce.date().optional().nullable(),
  expirationDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(4_000).optional().default('Submitted by employee for compliance review'),
});

const dashboardQuerySchema = z.object({
  status: z.string().trim().optional(),
  requirementId: z.string().trim().optional(),
  locationId: z.string().trim().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(5_000).default(1_000),
});

const logQuerySchema = z.object({
  employeeId: z.string().trim().optional(),
  requirementId: z.string().trim().optional(),
  status: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(1_000).default(250),
});

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();
const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const cleanFileName = (value: string) => value.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'employee-document';
const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
const asNumberArray = (value: unknown, fallback: number[]): number[] => {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.map(Number).filter(Number.isFinite).map(Math.trunc))].sort((a, b) => b - a);
};
const dateOnly = (value: Date | string | null | undefined) => value ? new Date(value).toISOString().slice(0, 10) : null;
const startOfToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const addDays = (value: Date | string, days: number) => new Date(new Date(value).getTime() + days * DAY_MS);
const daysUntil = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const target = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  return Math.round((target.getTime() - startOfToday().getTime()) / DAY_MS);
};
const ownerEmail = (value: unknown) => normalizeEmail(value) === OWNER_EMAIL;
const uniqueEmails = (values: unknown[]) => [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value]).map(normalizeEmail).filter(Boolean))];

export function registerEmployeeComplianceRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  let schemaPromise: Promise<void> | null = null;
  let schedulerStarted = false;

  const ensureSchema = () => schemaPromise ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeComplianceSettings" (
      "organizationId" TEXT PRIMARY KEY,
      "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
      "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
      "scanHour" INTEGER NOT NULL DEFAULT 8,
      "hrRecipients" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "portalUrl" TEXT NOT NULL DEFAULT '${PORTAL_URL}',
      "senderName" TEXT NOT NULL DEFAULT 'Sulandra Health Human Resources Department',
      "lastScheduledRunDate" DATE,
      "lastRunAt" TIMESTAMPTZ,
      "updatedById" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeComplianceRequirement" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "requirementType" TEXT NOT NULL,
      "documentCategory" TEXT,
      "documentTitleContains" TEXT,
      "documentSensitivity" TEXT NOT NULL DEFAULT 'GENERAL',
      "courseCode" TEXT,
      "courseTitle" TEXT,
      "attestationText" TEXT,
      "requiredForAll" BOOLEAN NOT NULL DEFAULT FALSE,
      "appliesToRoles" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "appliesToDepartments" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "appliesToJobTitles" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "appliesToLocationIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "employmentStatuses" JSONB NOT NULL DEFAULT '["ACTIVE"]'::jsonb,
      "dueDaysAfterHire" INTEGER NOT NULL DEFAULT 30,
      "renewalDays" INTEGER,
      "warningWindowDays" INTEGER NOT NULL DEFAULT 60,
      "reminderDays" JSONB NOT NULL DEFAULT '[60,30,14,7,1,0,-1,-7,-14,-30]'::jsonb,
      "managerEscalationDays" JSONB NOT NULL DEFAULT '[-1,-7,-14,-30]'::jsonb,
      "hrEscalationDays" JSONB NOT NULL DEFAULT '[-7,-14,-30]'::jsonb,
      "notifyEmployee" BOOLEAN NOT NULL DEFAULT TRUE,
      "notifySupervisor" BOOLEAN NOT NULL DEFAULT TRUE,
      "notifyLocationManager" BOOLEAN NOT NULL DEFAULT TRUE,
      "notifyHR" BOOLEAN NOT NULL DEFAULT TRUE,
      "autoAssignEducation" BOOLEAN NOT NULL DEFAULT TRUE,
      "allowEmployeeUpload" BOOLEAN NOT NULL DEFAULT TRUE,
      "allowEmployeeAttestation" BOOLEAN NOT NULL DEFAULT TRUE,
      "active" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdById" TEXT NOT NULL,
      "updatedById" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "EmployeeComplianceRequirement_type_check" CHECK ("requirementType" IN ('DOCUMENT','EDUCATION','ATTESTATION','MANUAL')),
      CONSTRAINT "EmployeeComplianceRequirement_sensitivity_check" CHECK ("documentSensitivity" IN ('GENERAL','HR_CONFIDENTIAL','MEDICAL','BACKGROUND','DISCIPLINARY','IDENTITY','COMPENSATION'))
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeComplianceRequirement_code_unique" ON "EmployeeComplianceRequirement"("organizationId",LOWER("code"))`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeComplianceRequirement_active_idx" ON "EmployeeComplianceRequirement"("organizationId","active","requirementType")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeComplianceAssignment" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "requirementId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
      "source" TEXT NOT NULL DEFAULT 'AUTOMATIC',
      "dueDate" DATE,
      "completedAt" TIMESTAMPTZ,
      "expiresAt" DATE,
      "evidenceType" TEXT,
      "evidenceId" TEXT,
      "evidenceSummary" TEXT,
      "exemptReason" TEXT,
      "exemptUntil" DATE,
      "manuallyCompletedAt" TIMESTAMPTZ,
      "manualNotes" TEXT,
      "lastEvaluatedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "EmployeeComplianceAssignment_status_check" CHECK ("status" IN ('NOT_STARTED','MISSING','IN_PROGRESS','DUE_SOON','OVERDUE','COMPLIANT','EXEMPT','NOT_APPLICABLE'))
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeComplianceAssignment_unique" ON "EmployeeComplianceAssignment"("organizationId","requirementId","employeeId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeComplianceAssignment_status_idx" ON "EmployeeComplianceAssignment"("organizationId","status","dueDate")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeComplianceAssignment_employee_idx" ON "EmployeeComplianceAssignment"("organizationId","employeeId","status")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeComplianceAttestation" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "assignmentId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "requirementId" TEXT NOT NULL,
      "statement" TEXT NOT NULL,
      "typedName" TEXT NOT NULL,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "acceptedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeComplianceAttestation_assignment_idx" ON "EmployeeComplianceAttestation"("organizationId","assignmentId","acceptedAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeComplianceReminder" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "assignmentId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "requirementId" TEXT NOT NULL,
      "recipientType" TEXT NOT NULL,
      "recipient" TEXT NOT NULL,
      "stage" TEXT NOT NULL,
      "daysFromDue" INTEGER NOT NULL,
      "dedupeKey" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'QUEUED',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "providerMessageId" TEXT,
      "errorMessage" TEXT,
      "sentAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "EmployeeComplianceReminder_recipient_check" CHECK ("recipientType" IN ('EMPLOYEE','SUPERVISOR','LOCATION_MANAGER','HR')),
      CONSTRAINT "EmployeeComplianceReminder_status_check" CHECK ("status" IN ('QUEUED','SENT','FAILED','SKIPPED'))
    )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeComplianceReminder_dedupe_unique" ON "EmployeeComplianceReminder"("organizationId","dedupeKey")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeComplianceReminder_assignment_idx" ON "EmployeeComplianceReminder"("organizationId","assignmentId","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeComplianceReminder_status_idx" ON "EmployeeComplianceReminder"("organizationId","status","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeComplianceRun" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "trigger" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'RUNNING',
      "startedById" TEXT,
      "metrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "errorMessage" TEXT,
      "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "completedAt" TIMESTAMPTZ,
      CONSTRAINT "EmployeeComplianceRun_trigger_check" CHECK ("trigger" IN ('MANUAL','SCHEDULED','STARTUP')),
      CONSTRAINT "EmployeeComplianceRun_status_check" CHECK ("status" IN ('RUNNING','COMPLETED','FAILED','SKIPPED'))
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeComplianceRun_org_idx" ON "EmployeeComplianceRun"("organizationId","startedAt" DESC)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'APPROVED'`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeComplianceSettings" ("organizationId") SELECT "id" FROM "Organization" ON CONFLICT ("organizationId") DO NOTHING`).catch(() => undefined);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  const managerGate = requireRoles(...managerRoles);
  const allUsersGate = requireRoles(...Object.values(UserRole) as UserRole[]);

  const actor = async (auth: AuthContext) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","email","role"::text AS "role" FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,
      auth.userId,
      auth.organizationId,
    );
    const row = rows[0];
    if (!row) throw Object.assign(new Error('Authenticated employee account was not found'), { status: 401 });
    return { ...row, email: normalizeEmail(row.email || auth.email), isOwner: ownerEmail(row.email || auth.email) };
  };

  const tableExists = async (name: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(`SELECT to_regclass($1::text)::text AS "name"`, `public."${name}"`);
    return Boolean(rows[0]?.name);
  };

  const actorLocationIds = async (auth: AuthContext) => {
    if (!locationRoles.has(auth.role) || !(await tableExists('TimeAttendanceLocationAssignment'))) return [] as string[];
    const requireManager = auth.role === UserRole.HOUSE_MANAGER;
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT "locationId" FROM "TimeAttendanceLocationAssignment"
       WHERE "organizationId"=$1 AND "employeeId"=$2 AND "active"=TRUE ${requireManager ? 'AND "isManager"=TRUE' : ''}`,
      auth.organizationId,
      auth.userId,
    ).catch(() => []);
    return rows.map((row) => String(row.locationId));
  };

  const scopedEmployeeIds = async (auth: AuthContext) => {
    const identity = await actor(auth);
    if (identity.isOwner || globalRoles.has(auth.role)) return null as string[] | null;
    const locationIds = await actorLocationIds(auth);
    if (!locationIds.length || !(await tableExists('TimeAttendanceLocationAssignment'))) return [] as string[];
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT DISTINCT "employeeId" FROM "TimeAttendanceLocationAssignment"
       WHERE "organizationId"=$1 AND "active"=TRUE AND "locationId"=ANY($2::text[])`,
      auth.organizationId,
      locationIds,
    ).catch(() => []);
    return rows.map((row) => String(row.employeeId));
  };

  const requireEmployeeScope = async (auth: AuthContext, employeeId: string) => {
    const allowed = await scopedEmployeeIds(auth);
    if (allowed && !allowed.includes(employeeId)) throw Object.assign(new Error('This employee is outside your authorized service-location scope'), { status: 403 });
  };

  const requireRequirementManager = async (auth: AuthContext) => {
    const identity = await actor(auth);
    if (!identity.isOwner && !requirementManagers.has(auth.role)) throw Object.assign(new Error('Only the Enterprise Owner, Human Resources, or an Administrator may manage compliance requirements'), { status: 403 });
    return identity;
  };

  const requireReminderSender = async (auth: AuthContext) => {
    const identity = await actor(auth);
    if (!identity.isOwner && !reminderSenders.has(auth.role)) throw Object.assign(new Error('You do not have permission to send compliance reminders'), { status: 403 });
    return identity;
  };

  const settingsFor = async (organizationId: string) => {
    await ensureSchema();
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeComplianceSettings" ("organizationId") VALUES ($1) ON CONFLICT ("organizationId") DO NOTHING`, organizationId);
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeComplianceSettings" WHERE "organizationId"=$1 LIMIT 1`, organizationId);
    return rows[0];
  };

  const employeesForOrganization = async (organizationId: string): Promise<EmployeeRow[]> => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u."id",u."email",u."role"::text AS "role",
              COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName",
              p."department",p."jobTitle",COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus",p."hireDate",p."supervisorId"
       FROM "User" u
       LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
       WHERE u."organizationId"=$1 AND LOWER(COALESCE(u."email",'')) NOT LIKE '%@demo.spire.local'`,
      organizationId,
    );
    let assignments: any[] = [];
    if (await tableExists('TimeAttendanceLocationAssignment')) {
      assignments = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "employeeId","locationId" FROM "TimeAttendanceLocationAssignment" WHERE "organizationId"=$1 AND "active"=TRUE`,
        organizationId,
      ).catch(() => []);
    }
    const locations = new Map<string, string[]>();
    for (const item of assignments) {
      const list = locations.get(String(item.employeeId)) || [];
      list.push(String(item.locationId));
      locations.set(String(item.employeeId), list);
    }
    return rows.map((row) => ({
      ...row,
      displayName: ownerEmail(row.email) ? OWNER_NAME : String(row.displayName || row.email || 'Employee'),
      locationIds: [...new Set(locations.get(String(row.id)) || [])],
    }));
  };

  const requirementApplies = (requirement: RequirementRow, employee: EmployeeRow) => {
    const employmentStatuses = asStringArray(requirement.employmentStatuses);
    if (employmentStatuses.length && !employmentStatuses.includes(String(employee.employmentStatus))) return false;
    if (requirement.requiredForAll) return true;
    const roles = asStringArray(requirement.appliesToRoles).map(normalized);
    const departments = asStringArray(requirement.appliesToDepartments).map(normalized);
    const jobTitles = asStringArray(requirement.appliesToJobTitles).map(normalized);
    const locationIds = asStringArray(requirement.appliesToLocationIds);
    if (roles.length && !roles.includes(normalized(employee.role))) return false;
    if (departments.length && !departments.includes(normalized(employee.department))) return false;
    if (jobTitles.length && !jobTitles.some((title) => normalized(employee.jobTitle).includes(title))) return false;
    if (locationIds.length && !employee.locationIds.some((id) => locationIds.includes(id))) return false;
    return roles.length + departments.length + jobTitles.length + locationIds.length > 0;
  };

  const baseDueDate = (requirement: RequirementRow, employee: EmployeeRow, assignmentCreatedAt?: Date | string | null) => {
    const starting = employee.hireDate || assignmentCreatedAt || new Date();
    return addDays(starting, Number(requirement.dueDaysAfterHire || 0));
  };

  const statusFromDueDate = (dueDate: Date | string | null, warningWindowDays: number, missing = false): ComplianceStatus => {
    const remaining = daysUntil(dueDate);
    if (remaining == null) return missing ? 'MISSING' : 'NOT_STARTED';
    if (remaining < 0) return 'OVERDUE';
    if (remaining <= warningWindowDays) return missing ? 'DUE_SOON' : 'DUE_SOON';
    return missing ? 'MISSING' : 'IN_PROGRESS';
  };

  const latestDocument = async (organizationId: string, employeeId: string, requirement: RequirementRow) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","category","title","fileName","issueDate","expirationDate","reviewStatus","createdAt"
       FROM "EmployeeDocument"
       WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"<>'ARCHIVED' AND LOWER("category")=LOWER($3)
         AND ($4::text IS NULL OR LOWER("title") LIKE '%'||LOWER($4)||'%')
       ORDER BY COALESCE("expirationDate","issueDate","createdAt"::date) DESC NULLS LAST,"createdAt" DESC LIMIT 1`,
      organizationId,
      employeeId,
      requirement.documentCategory,
      requirement.documentTitleContains || null,
    ).catch(() => []);
    return rows[0] || null;
  };

  const latestEducation = async (organizationId: string, employeeId: string, requirement: RequirementRow) => {
    if (!(await tableExists('EducationAssignment'))) return { completed: null, open: null };
    const completedRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","courseCode","title","status","completedAt","expiresAt","dueDate"
       FROM "EducationAssignment" WHERE "organizationId"=$1 AND "employeeId"=$2 AND LOWER("courseCode")=LOWER($3) AND "status"='COMPLETED'
       ORDER BY "completedAt" DESC NULLS LAST,"updatedAt" DESC LIMIT 1`,
      organizationId,
      employeeId,
      requirement.courseCode,
    ).catch(() => []);
    const openRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","courseCode","title","status","assignedAt","startedAt","dueDate"
       FROM "EducationAssignment" WHERE "organizationId"=$1 AND "employeeId"=$2 AND LOWER("courseCode")=LOWER($3) AND "status" IN ('ASSIGNED','IN_PROGRESS')
       ORDER BY "assignedAt" DESC LIMIT 1`,
      organizationId,
      employeeId,
      requirement.courseCode,
    ).catch(() => []);
    return { completed: completedRows[0] || null, open: openRows[0] || null };
  };

  const ensureEducationAssignment = async (organizationId: string, employee: EmployeeRow, requirement: RequirementRow, dueDate: Date, actorId: string | null) => {
    if (!requirement.autoAssignEducation || !(await tableExists('EducationAssignment'))) return null;
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id" FROM "EducationAssignment" WHERE "organizationId"=$1 AND "employeeId"=$2 AND LOWER("courseCode")=LOWER($3) AND "status" IN ('ASSIGNED','IN_PROGRESS') LIMIT 1`,
      organizationId,
      employee.id,
      requirement.courseCode,
    ).catch(() => []);
    if (existing[0]) return existing[0].id as string;
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EducationAssignment"
       ("id","organizationId","employeeId","courseCode","title","packageCode","status","dueDate","reason","assignedById","assignedAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,'CUSTOM','ASSIGNED',$6,$7,$8,NOW(),NOW(),NOW())`,
      id,
      organizationId,
      employee.id,
      requirement.courseCode,
      requirement.courseTitle || requirement.title,
      dueDate,
      `Automatically assigned by compliance requirement ${requirement.code}`,
      actorId || employee.id,
    ).catch(() => undefined);
    return id;
  };

  const latestAttestation = async (organizationId: string, assignmentId: string) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","typedName","acceptedAt" FROM "EmployeeComplianceAttestation" WHERE "organizationId"=$1 AND "assignmentId"=$2 ORDER BY "acceptedAt" DESC LIMIT 1`,
      organizationId,
      assignmentId,
    );
    return rows[0] || null;
  };

  const evaluateAssignment = async (
    organizationId: string,
    employee: EmployeeRow,
    requirement: RequirementRow,
    assignment: AssignmentRow,
    runActorId: string | null,
  ) => {
    const today = startOfToday();
    if (assignment.exemptReason && (!assignment.exemptUntil || new Date(assignment.exemptUntil).getTime() >= today.getTime())) {
      return {
        status: 'EXEMPT' as ComplianceStatus,
        dueDate: assignment.dueDate,
        completedAt: assignment.completedAt,
        expiresAt: assignment.expiresAt,
        evidenceType: assignment.evidenceType,
        evidenceId: assignment.evidenceId,
        evidenceSummary: assignment.exemptReason,
      };
    }
    if (assignment.manuallyCompletedAt) {
      const expiresAt = requirement.renewalDays ? addDays(assignment.manuallyCompletedAt, requirement.renewalDays) : null;
      const remaining = daysUntil(expiresAt);
      return {
        status: remaining != null && remaining < 0 ? 'OVERDUE' as ComplianceStatus : remaining != null && remaining <= requirement.warningWindowDays ? 'DUE_SOON' as ComplianceStatus : 'COMPLIANT' as ComplianceStatus,
        dueDate: expiresAt,
        completedAt: assignment.manuallyCompletedAt,
        expiresAt,
        evidenceType: 'MANUAL',
        evidenceId: assignment.id,
        evidenceSummary: assignment.manualNotes || 'Manually marked complete',
      };
    }

    const initialDueDate = assignment.dueDate || baseDueDate(requirement, employee, assignment.createdAt);
    if (requirement.requirementType === 'DOCUMENT') {
      const document = await latestDocument(organizationId, employee.id, requirement);
      if (!document || String(document.reviewStatus || 'APPROVED') === 'REJECTED') {
        return {
          status: statusFromDueDate(initialDueDate, requirement.warningWindowDays, true),
          dueDate: initialDueDate,
          completedAt: null,
          expiresAt: null,
          evidenceType: null,
          evidenceId: null,
          evidenceSummary: document ? 'Latest submitted document was rejected' : 'Required document has not been approved',
        };
      }
      if (String(document.reviewStatus || 'APPROVED') === 'PENDING') {
        return {
          status: 'IN_PROGRESS' as ComplianceStatus,
          dueDate: initialDueDate,
          completedAt: null,
          expiresAt: document.expirationDate,
          evidenceType: 'DOCUMENT',
          evidenceId: document.id,
          evidenceSummary: `${document.title} is awaiting review`,
        };
      }
      const expiration = document.expirationDate || (requirement.renewalDays ? addDays(document.issueDate || document.createdAt, requirement.renewalDays) : null);
      const remaining = daysUntil(expiration);
      const status: ComplianceStatus = remaining == null ? 'COMPLIANT' : remaining < 0 ? 'OVERDUE' : remaining <= requirement.warningWindowDays ? 'DUE_SOON' : 'COMPLIANT';
      return {
        status,
        dueDate: expiration,
        completedAt: document.issueDate || document.createdAt,
        expiresAt: expiration,
        evidenceType: 'DOCUMENT',
        evidenceId: document.id,
        evidenceSummary: `${document.title} (${document.fileName})`,
      };
    }

    if (requirement.requirementType === 'EDUCATION') {
      let education = await latestEducation(organizationId, employee.id, requirement);
      if (education.completed) {
        const expiration = education.completed.expiresAt || (requirement.renewalDays ? addDays(education.completed.completedAt, requirement.renewalDays) : null);
        const remaining = daysUntil(expiration);
        const status: ComplianceStatus = remaining == null ? 'COMPLIANT' : remaining < 0 ? 'OVERDUE' : remaining <= requirement.warningWindowDays ? 'DUE_SOON' : 'COMPLIANT';
        return {
          status,
          dueDate: expiration,
          completedAt: education.completed.completedAt,
          expiresAt: expiration,
          evidenceType: 'EDUCATION',
          evidenceId: education.completed.id,
          evidenceSummary: `${education.completed.title || requirement.courseCode} completed`,
        };
      }
      if (!education.open) {
        await ensureEducationAssignment(organizationId, employee, requirement, new Date(initialDueDate), runActorId);
        education = await latestEducation(organizationId, employee.id, requirement);
      }
      const dueDate = education.open?.dueDate || initialDueDate;
      const remaining = daysUntil(dueDate);
      const status: ComplianceStatus = remaining != null && remaining < 0 ? 'OVERDUE' : education.open?.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : remaining != null && remaining <= requirement.warningWindowDays ? 'DUE_SOON' : 'NOT_STARTED';
      return {
        status,
        dueDate,
        completedAt: null,
        expiresAt: null,
        evidenceType: education.open ? 'EDUCATION_ASSIGNMENT' : null,
        evidenceId: education.open?.id || null,
        evidenceSummary: education.open ? `${education.open.title || requirement.courseCode} ${education.open.status.toLowerCase()}` : 'Required education has not been assigned',
      };
    }

    if (requirement.requirementType === 'ATTESTATION') {
      const attestation = await latestAttestation(organizationId, assignment.id);
      if (!attestation) {
        return {
          status: statusFromDueDate(initialDueDate, requirement.warningWindowDays, true),
          dueDate: initialDueDate,
          completedAt: null,
          expiresAt: null,
          evidenceType: null,
          evidenceId: null,
          evidenceSummary: 'Employee attestation is pending',
        };
      }
      const expiration = requirement.renewalDays ? addDays(attestation.acceptedAt, requirement.renewalDays) : null;
      const remaining = daysUntil(expiration);
      const status: ComplianceStatus = remaining == null ? 'COMPLIANT' : remaining < 0 ? 'OVERDUE' : remaining <= requirement.warningWindowDays ? 'DUE_SOON' : 'COMPLIANT';
      return {
        status,
        dueDate: expiration,
        completedAt: attestation.acceptedAt,
        expiresAt: expiration,
        evidenceType: 'ATTESTATION',
        evidenceId: attestation.id,
        evidenceSummary: `Attested by ${attestation.typedName}`,
      };
    }

    return {
      status: statusFromDueDate(initialDueDate, requirement.warningWindowDays, true),
      dueDate: initialDueDate,
      completedAt: null,
      expiresAt: null,
      evidenceType: null,
      evidenceId: null,
      evidenceSummary: 'Manual compliance verification is pending',
    };
  };

  const upsertAssignment = async (organizationId: string, requirement: RequirementRow, employee: EmployeeRow) => {
    const existing = await prisma.$queryRawUnsafe<AssignmentRow[]>(
      `SELECT * FROM "EmployeeComplianceAssignment" WHERE "organizationId"=$1 AND "requirementId"=$2 AND "employeeId"=$3 LIMIT 1`,
      organizationId,
      requirement.id,
      employee.id,
    );
    if (existing[0]) return existing[0];
    const id = randomUUID();
    const dueDate = baseDueDate(requirement, employee);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeeComplianceAssignment" ("id","organizationId","requirementId","employeeId","status","source","dueDate")
       VALUES ($1,$2,$3,$4,'NOT_STARTED','AUTOMATIC',$5)`,
      id,
      organizationId,
      requirement.id,
      employee.id,
      dueDate,
    );
    const rows = await prisma.$queryRawUnsafe<AssignmentRow[]>(`SELECT * FROM "EmployeeComplianceAssignment" WHERE "id"=$1 LIMIT 1`, id);
    return rows[0];
  };

  const saveEvaluation = async (assignmentId: string, evaluation: Awaited<ReturnType<typeof evaluateAssignment>>) => {
    await prisma.$executeRawUnsafe(
      `UPDATE "EmployeeComplianceAssignment" SET
        "status"=$1,"dueDate"=$2,"completedAt"=$3,"expiresAt"=$4,"evidenceType"=$5,"evidenceId"=$6,"evidenceSummary"=$7,"lastEvaluatedAt"=NOW(),"updatedAt"=NOW()
       WHERE "id"=$8`,
      evaluation.status,
      evaluation.dueDate || null,
      evaluation.completedAt || null,
      evaluation.expiresAt || null,
      evaluation.evidenceType || null,
      evaluation.evidenceId || null,
      evaluation.evidenceSummary || null,
      assignmentId,
    );
  };

  const mailTransport = () => {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    const port = Number(process.env.SMTP_PORT || 587);
    if (!host || !user || !pass) throw Object.assign(new Error('Compliance reminder email delivery is not configured'), { status: 503 });
    return {
      user,
      transport: createTransport({ host, port, secure: port === 465, auth: { user, pass }, tls: { minVersion: 'TLSv1.2' } }),
    };
  };

  const stageFor = (remaining: number) => remaining > 0 ? `DUE_IN_${remaining}_DAYS` : remaining === 0 ? 'DUE_TODAY' : `OVERDUE_${Math.abs(remaining)}_DAYS`;
  const statusLanguage = (remaining: number) => remaining > 0 ? `is due in ${remaining} day${remaining === 1 ? '' : 's'}` : remaining === 0 ? 'is due today' : `is overdue by ${Math.abs(remaining)} day${remaining === -1 ? '' : 's'}`;

  const reminderBody = (
    recipientType: RecipientType,
    employee: EmployeeRow,
    requirement: RequirementRow,
    assignment: AssignmentRow,
    remaining: number,
    portalUrl: string,
  ) => {
    const due = dateOnly(assignment.dueDate) || 'not specified';
    const opening = recipientType === 'EMPLOYEE'
      ? `Hello ${employee.displayName},`
      : `Compliance attention is required for ${employee.displayName}.`;
    const action = requirement.requirementType === 'EDUCATION'
      ? `Complete ${requirement.courseTitle || requirement.courseCode || requirement.title} in the Sulandra Health Learning Center.`
      : requirement.requirementType === 'DOCUMENT'
        ? `Submit or renew the required ${requirement.documentCategory || 'document'} in the Employee Portal.`
        : requirement.requirementType === 'ATTESTATION'
          ? 'Review and electronically attest to the required statement in the Employee Portal.'
          : 'Contact Human Resources to complete this requirement.';
    return `${opening}\n\n${requirement.title} (${requirement.code}) ${statusLanguage(remaining)}.\nDue date: ${due}\nCurrent status: ${assignment.status}\n\nRequired action: ${action}\n\nEmployee Portal: ${portalUrl}\n${requirement.requirementType === 'EDUCATION' ? `Learning Center: ${EDUCATION_URL}\n` : ''}\nThis automated reminder is recorded in Employee 360. Contact the Sulandra Health Human Resources Department if the record is incorrect or an exemption is needed.`;
  };

  const sendReminder = async (
    organizationId: string,
    assignment: AssignmentRow,
    employee: EmployeeRow,
    requirement: RequirementRow,
    recipientType: RecipientType,
    recipient: string,
    remaining: number,
    settings: any,
  ) => {
    const normalizedRecipient = normalizeEmail(recipient);
    if (!normalizedRecipient) return false;
    const stage = stageFor(remaining);
    const dueKey = dateOnly(assignment.dueDate) || 'NO_DUE_DATE';
    const dedupeKey = `${assignment.id}:${recipientType}:${normalizedRecipient}:${stage}:${dueKey}`;
    const subject = `${remaining < 0 ? 'Overdue' : remaining === 0 ? 'Due Today' : 'Compliance Reminder'}: ${requirement.title} — ${employee.displayName}`;
    const body = reminderBody(recipientType, employee, requirement, assignment, remaining, settings.portalUrl || PORTAL_URL);
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id","status","attempts" FROM "EmployeeComplianceReminder" WHERE "organizationId"=$1 AND "dedupeKey"=$2 LIMIT 1`,
      organizationId,
      dedupeKey,
    );
    if (existing[0]?.status === 'SENT' || Number(existing[0]?.attempts || 0) >= 3) return false;
    const id = existing[0]?.id || randomUUID();
    if (!existing[0]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeComplianceReminder"
          ("id","organizationId","assignmentId","employeeId","requirementId","recipientType","recipient","stage","daysFromDue","dedupeKey","subject","body","status","attempts")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'QUEUED',0)`,
        id,
        organizationId,
        assignment.id,
        employee.id,
        requirement.id,
        recipientType,
        normalizedRecipient,
        stage,
        remaining,
        dedupeKey,
        subject,
        body,
      );
    }
    try {
      const { user, transport } = mailTransport();
      const senderName = settings.senderName || 'Sulandra Health Human Resources Department';
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#182533;max-width:700px">
        <div style="background:#075493;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0"><h2 style="margin:0">Sulandra Health Employee Compliance</h2></div>
        <div style="border:1px solid #cbd7e1;border-top:0;padding:22px;border-radius:0 0 8px 8px">
          <p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>
          <p style="margin-top:28px"><strong><em style="color:#159bd3">${escapeHtml(senderName)}</em></strong></p>
          <p style="font-size:12px;color:#637080">This is an automated compliance notice from Employee 360. Please do not reply to this message.</p>
        </div>
      </div>`;
      const result = await transport.sendMail({
        from: `"${senderName}" <${user}>`,
        to: normalizedRecipient,
        subject,
        text: `${body}\n\n${senderName}`,
        html,
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeComplianceReminder" SET "status"='SENT',"attempts"="attempts"+1,"providerMessageId"=$1,"errorMessage"=NULL,"sentAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$2`,
        String(result.messageId || ''),
        id,
      );
      if (await tableExists('EmployeeCommunication')) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "EmployeeCommunication" ("id","organizationId","employeeId","kind","recipient","subject","body","status","providerMessageId","sentById","sentAt")
           VALUES ($1,$2,$3,'COMPLIANCE_REMINDER',$4,$5,$6,'SENT',$7,$8,NOW())`,
          randomUUID(),
          organizationId,
          employee.id,
          normalizedRecipient,
          subject,
          body,
          String(result.messageId || ''),
          assignment.employeeId,
        ).catch(() => undefined);
      }
      return true;
    } catch (error) {
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeComplianceReminder" SET "status"='FAILED',"attempts"="attempts"+1,"errorMessage"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
        error instanceof Error ? error.message : String(error),
        id,
      );
      return false;
    }
  };

  const recipientGroups = async (organizationId: string, employee: EmployeeRow, requirement: RequirementRow, remaining: number, settings: any) => {
    const groups: Array<{ type: RecipientType; emails: string[] }> = [];
    if (requirement.notifyEmployee && employee.email) groups.push({ type: 'EMPLOYEE', emails: [employee.email] });
    const managerDays = asNumberArray(requirement.managerEscalationDays, DEFAULT_MANAGER_ESCALATION_DAYS);
    if (managerDays.includes(remaining)) {
      if (requirement.notifySupervisor && employee.supervisorId) {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "email" FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,
          employee.supervisorId,
          organizationId,
        ).catch(() => []);
        groups.push({ type: 'SUPERVISOR', emails: rows.map((row) => row.email) });
      }
      if (requirement.notifyLocationManager && employee.locationIds.length && await tableExists('TimeAttendanceLocationAssignment')) {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT DISTINCT u."email" FROM "TimeAttendanceLocationAssignment" x JOIN "User" u ON u."id"=x."employeeId"
           WHERE x."organizationId"=$1 AND x."active"=TRUE AND x."isManager"=TRUE AND x."locationId"=ANY($2::text[])`,
          organizationId,
          employee.locationIds,
        ).catch(() => []);
        groups.push({ type: 'LOCATION_MANAGER', emails: rows.map((row) => row.email) });
      }
    }
    const hrDays = asNumberArray(requirement.hrEscalationDays, DEFAULT_HR_ESCALATION_DAYS);
    if (requirement.notifyHR && hrDays.includes(remaining)) {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "email" FROM "User" WHERE "organizationId"=$1 AND "role"::text IN ('HR_MANAGER','ADMINISTRATOR')`,
        organizationId,
      ).catch(() => []);
      groups.push({ type: 'HR', emails: uniqueEmails([asStringArray(settings.hrRecipients), rows.map((row) => row.email), OWNER_EMAIL]) });
    }
    return groups.map((group) => ({ ...group, emails: uniqueEmails(group.emails) })).filter((group) => group.emails.length);
  };

  const maybeSendReminders = async (organizationId: string, employee: EmployeeRow, requirement: RequirementRow, assignment: AssignmentRow, settings: any) => {
    if (!['MISSING', 'NOT_STARTED', 'IN_PROGRESS', 'DUE_SOON', 'OVERDUE'].includes(assignment.status) || !assignment.dueDate) return { sent: 0, attempted: 0 };
    const remaining = daysUntil(assignment.dueDate);
    if (remaining == null) return { sent: 0, attempted: 0 };
    const reminderDays = asNumberArray(requirement.reminderDays, DEFAULT_REMINDER_DAYS);
    const managerDays = asNumberArray(requirement.managerEscalationDays, DEFAULT_MANAGER_ESCALATION_DAYS);
    const hrDays = asNumberArray(requirement.hrEscalationDays, DEFAULT_HR_ESCALATION_DAYS);
    if (!reminderDays.includes(remaining) && !managerDays.includes(remaining) && !hrDays.includes(remaining)) return { sent: 0, attempted: 0 };
    const groups = await recipientGroups(organizationId, employee, requirement, remaining, settings);
    let sent = 0;
    let attempted = 0;
    for (const group of groups) {
      if (group.type === 'EMPLOYEE' && !reminderDays.includes(remaining)) continue;
      for (const email of group.emails) {
        attempted += 1;
        if (await sendReminder(organizationId, assignment, employee, requirement, group.type, email, remaining, settings)) sent += 1;
      }
    }
    return { sent, attempted };
  };

  const runEngine = async (organizationId: string, trigger: RunTrigger, startedById: string | null, sendNotifications = true) => {
    await ensureSchema();
    const lockName = `employee-compliance:${organizationId}`;
    const lockRows = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(`SELECT pg_try_advisory_lock(hashtext($1)) AS "locked"`, lockName);
    if (!lockRows[0]?.locked) return { status: 'SKIPPED', reason: 'Another compliance run is already active' };
    const runId = randomUUID();
    const metrics = {
      requirements: 0,
      employees: 0,
      applicableAssignments: 0,
      createdAssignments: 0,
      evaluatedAssignments: 0,
      compliant: 0,
      dueSoon: 0,
      overdue: 0,
      missing: 0,
      exempt: 0,
      notApplicable: 0,
      remindersAttempted: 0,
      remindersSent: 0,
    };
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeComplianceRun" ("id","organizationId","trigger","status","startedById") VALUES ($1,$2,$3,'RUNNING',$4)`,
        runId,
        organizationId,
        trigger,
        startedById,
      );
      const [requirements, employees, settings] = await Promise.all([
        prisma.$queryRawUnsafe<RequirementRow[]>(`SELECT * FROM "EmployeeComplianceRequirement" WHERE "organizationId"=$1 AND "active"=TRUE ORDER BY "title"`, organizationId),
        employeesForOrganization(organizationId),
        settingsFor(organizationId),
      ]);
      metrics.requirements = requirements.length;
      metrics.employees = employees.length;
      for (const requirement of requirements) {
        for (const employee of employees) {
          const applies = requirementApplies(requirement, employee);
          const existingRows = await prisma.$queryRawUnsafe<AssignmentRow[]>(
            `SELECT * FROM "EmployeeComplianceAssignment" WHERE "organizationId"=$1 AND "requirementId"=$2 AND "employeeId"=$3 LIMIT 1`,
            organizationId,
            requirement.id,
            employee.id,
          );
          if (!applies) {
            if (existingRows[0] && existingRows[0].status !== 'NOT_APPLICABLE') {
              await prisma.$executeRawUnsafe(`UPDATE "EmployeeComplianceAssignment" SET "status"='NOT_APPLICABLE',"lastEvaluatedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$1`, existingRows[0].id);
              metrics.notApplicable += 1;
            }
            continue;
          }
          metrics.applicableAssignments += 1;
          const assignment = existingRows[0] || await upsertAssignment(organizationId, requirement, employee);
          if (!existingRows[0]) metrics.createdAssignments += 1;
          const evaluation = await evaluateAssignment(organizationId, employee, requirement, assignment, startedById);
          await saveEvaluation(assignment.id, evaluation);
          const refreshed = { ...assignment, ...evaluation } as AssignmentRow;
          metrics.evaluatedAssignments += 1;
          if (refreshed.status === 'COMPLIANT') metrics.compliant += 1;
          if (refreshed.status === 'DUE_SOON') metrics.dueSoon += 1;
          if (refreshed.status === 'OVERDUE') metrics.overdue += 1;
          if (refreshed.status === 'MISSING' || refreshed.status === 'NOT_STARTED' || refreshed.status === 'IN_PROGRESS') metrics.missing += 1;
          if (refreshed.status === 'EXEMPT') metrics.exempt += 1;
          if (sendNotifications && settings.enabled) {
            const reminderResult = await maybeSendReminders(organizationId, employee, requirement, refreshed, settings);
            metrics.remindersAttempted += reminderResult.attempted;
            metrics.remindersSent += reminderResult.sent;
          }
        }
      }
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeComplianceRun" SET "status"='COMPLETED',"metrics"=$1::jsonb,"completedAt"=NOW() WHERE "id"=$2`,
        JSON.stringify(metrics),
        runId,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeComplianceSettings" SET "lastRunAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=$1`,
        organizationId,
      );
      await audit?.({ userId: startedById || undefined, organizationId }, 'RUN_EMPLOYEE_COMPLIANCE_ENGINE', 'EmployeeComplianceRun', runId, { trigger, ...metrics });
      return { status: 'COMPLETED', runId, metrics };
    } catch (error) {
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeComplianceRun" SET "status"='FAILED',"errorMessage"=$1,"completedAt"=NOW() WHERE "id"=$2`,
        error instanceof Error ? error.message : String(error),
        runId,
      ).catch(() => undefined);
      throw error;
    } finally {
      await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(hashtext($1))`, lockName).catch(() => undefined);
    }
  };

  const localClock = (timezone: string) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { date: `${map.year}-${map.month}-${map.day}`, hour: Number(map.hour) % 24 };
  };

  const runScheduledOrganizations = async (trigger: RunTrigger = 'SCHEDULED') => {
    await ensureSchema();
    const settingsRows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeComplianceSettings" WHERE "enabled"=TRUE`);
    for (const settings of settingsRows) {
      try {
        const clock = localClock(settings.timezone || 'America/New_York');
        if (trigger === 'SCHEDULED' && (clock.hour !== Number(settings.scanHour) || dateOnly(settings.lastScheduledRunDate) === clock.date)) continue;
        const result = await runEngine(settings.organizationId, trigger, null, true);
        if (result.status === 'COMPLETED') {
          await prisma.$executeRawUnsafe(
            `UPDATE "EmployeeComplianceSettings" SET "lastScheduledRunDate"=$1::date,"lastRunAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=$2`,
            clock.date,
            settings.organizationId,
          );
        }
      } catch (error) {
        console.error('Employee compliance scheduled run failed', settings.organizationId, error);
      }
    }
  };

  const startScheduler = () => {
    if (schedulerStarted) return;
    schedulerStarted = true;
    const startup = setTimeout(() => void runScheduledOrganizations('STARTUP'), 60_000);
    startup.unref?.();
    const interval = setInterval(() => void runScheduledOrganizations('SCHEDULED'), 60 * 60 * 1_000);
    interval.unref?.();
  };

  const requirementById = async (organizationId: string, id: string) => {
    const rows = await prisma.$queryRawUnsafe<RequirementRow[]>(`SELECT * FROM "EmployeeComplianceRequirement" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, organizationId, id);
    if (!rows[0]) throw Object.assign(new Error('Compliance requirement was not found'), { status: 404 });
    return rows[0];
  };

  const assignmentDetail = async (organizationId: string, assignmentId: string) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT a.*,r."code",r."title",r."description",r."requirementType",r."documentCategory",r."documentSensitivity",r."courseCode",r."courseTitle",r."attestationText",r."allowEmployeeUpload",r."allowEmployeeAttestation",r."warningWindowDays",
              u."email",u."role"::text AS "role",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName",p."department",p."jobTitle",p."supervisorId"
       FROM "EmployeeComplianceAssignment" a
       JOIN "EmployeeComplianceRequirement" r ON r."id"=a."requirementId" AND r."organizationId"=a."organizationId"
       JOIN "User" u ON u."id"=a."employeeId" AND u."organizationId"=a."organizationId"
       LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
       WHERE a."organizationId"=$1 AND a."id"=$2 LIMIT 1`,
      organizationId,
      assignmentId,
    );
    if (!rows[0]) throw Object.assign(new Error('Compliance assignment was not found'), { status: 404 });
    return rows[0];
  };

  app.get('/api/admin/compliance/health', managerGate, async (_req, res, next) => {
    try {
      await ensureSchema();
      res.json({ data: { service: 'employee-compliance', status: 'ready', scheduler: 'hourly', reminderEngine: true } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/compliance/settings', managerGate, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      res.json({ data: await settingsFor(auth.organizationId) });
    } catch (error) { next(error); }
  });

  app.put('/api/admin/compliance/settings', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireRequirementManager(auth);
      const input = settingsSchema.parse(req.body);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeComplianceSettings" ("organizationId","enabled","timezone","scanHour","hrRecipients","portalUrl","senderName","updatedById")
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
         ON CONFLICT ("organizationId") DO UPDATE SET "enabled"=EXCLUDED."enabled","timezone"=EXCLUDED."timezone","scanHour"=EXCLUDED."scanHour","hrRecipients"=EXCLUDED."hrRecipients","portalUrl"=EXCLUDED."portalUrl","senderName"=EXCLUDED."senderName","updatedById"=EXCLUDED."updatedById","updatedAt"=NOW()`,
        auth.organizationId,
        input.enabled,
        input.timezone,
        input.scanHour,
        JSON.stringify(input.hrRecipients),
        input.portalUrl,
        input.senderName,
        auth.userId,
      );
      await audit?.(auth, 'UPDATE_COMPLIANCE_SETTINGS', 'EmployeeComplianceSettings', auth.organizationId, input);
      res.json({ data: await settingsFor(auth.organizationId) });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/compliance/requirements', managerGate, async (_req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT r.*,
                (SELECT COUNT(*)::int FROM "EmployeeComplianceAssignment" a WHERE a."organizationId"=r."organizationId" AND a."requirementId"=r."id" AND a."status"<>'NOT_APPLICABLE') AS "assignmentCount",
                (SELECT COUNT(*)::int FROM "EmployeeComplianceAssignment" a WHERE a."organizationId"=r."organizationId" AND a."requirementId"=r."id" AND a."status"='COMPLIANT') AS "compliantCount",
                (SELECT COUNT(*)::int FROM "EmployeeComplianceAssignment" a WHERE a."organizationId"=r."organizationId" AND a."requirementId"=r."id" AND a."status"='OVERDUE') AS "overdueCount"
         FROM "EmployeeComplianceRequirement" r WHERE r."organizationId"=$1 ORDER BY r."active" DESC,r."title"`,
        auth.organizationId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/compliance/requirements', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireRequirementManager(auth);
      const input = requirementSchema.parse(req.body);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeComplianceRequirement"
          ("id","organizationId","code","title","description","requirementType","documentCategory","documentTitleContains","documentSensitivity","courseCode","courseTitle","attestationText","requiredForAll","appliesToRoles","appliesToDepartments","appliesToJobTitles","appliesToLocationIds","employmentStatuses","dueDaysAfterHire","renewalDays","warningWindowDays","reminderDays","managerEscalationDays","hrEscalationDays","notifyEmployee","notifySupervisor","notifyLocationManager","notifyHR","autoAssignEducation","allowEmployeeUpload","allowEmployeeAttestation","active","createdById","updatedById")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,$19,$20,$21,$22::jsonb,$23::jsonb,$24::jsonb,$25,$26,$27,$28,$29,$30,$31,$32,$33,$33)`,
        id, auth.organizationId, input.code.toUpperCase(), input.title, input.description || null, input.requirementType,
        input.documentCategory || null, input.documentTitleContains || null, input.documentSensitivity,
        input.courseCode || null, input.courseTitle || null, input.attestationText || null, input.requiredForAll,
        JSON.stringify(input.appliesToRoles), JSON.stringify(input.appliesToDepartments), JSON.stringify(input.appliesToJobTitles), JSON.stringify(input.appliesToLocationIds), JSON.stringify(input.employmentStatuses),
        input.dueDaysAfterHire, input.renewalDays || null, input.warningWindowDays, JSON.stringify(input.reminderDays), JSON.stringify(input.managerEscalationDays), JSON.stringify(input.hrEscalationDays),
        input.notifyEmployee, input.notifySupervisor, input.notifyLocationManager, input.notifyHR, input.autoAssignEducation, input.allowEmployeeUpload, input.allowEmployeeAttestation, input.active, auth.userId,
      );
      await audit?.(auth, 'CREATE_COMPLIANCE_REQUIREMENT', 'EmployeeComplianceRequirement', id, { code: input.code, title: input.title, requirementType: input.requirementType });
      res.status(201).json({ data: await requirementById(auth.organizationId, id) });
    } catch (error) { next(error); }
  });

  app.put('/api/admin/compliance/requirements/:id', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireRequirementManager(auth);
      await requirementById(auth.organizationId, req.params.id);
      const input = requirementSchema.parse(req.body);
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeComplianceRequirement" SET
          "code"=$1,"title"=$2,"description"=$3,"requirementType"=$4,"documentCategory"=$5,"documentTitleContains"=$6,"documentSensitivity"=$7,"courseCode"=$8,"courseTitle"=$9,"attestationText"=$10,"requiredForAll"=$11,
          "appliesToRoles"=$12::jsonb,"appliesToDepartments"=$13::jsonb,"appliesToJobTitles"=$14::jsonb,"appliesToLocationIds"=$15::jsonb,"employmentStatuses"=$16::jsonb,
          "dueDaysAfterHire"=$17,"renewalDays"=$18,"warningWindowDays"=$19,"reminderDays"=$20::jsonb,"managerEscalationDays"=$21::jsonb,"hrEscalationDays"=$22::jsonb,
          "notifyEmployee"=$23,"notifySupervisor"=$24,"notifyLocationManager"=$25,"notifyHR"=$26,"autoAssignEducation"=$27,"allowEmployeeUpload"=$28,"allowEmployeeAttestation"=$29,"active"=$30,"updatedById"=$31,"updatedAt"=NOW()
         WHERE "id"=$32 AND "organizationId"=$33`,
        input.code.toUpperCase(), input.title, input.description || null, input.requirementType, input.documentCategory || null, input.documentTitleContains || null, input.documentSensitivity,
        input.courseCode || null, input.courseTitle || null, input.attestationText || null, input.requiredForAll,
        JSON.stringify(input.appliesToRoles), JSON.stringify(input.appliesToDepartments), JSON.stringify(input.appliesToJobTitles), JSON.stringify(input.appliesToLocationIds), JSON.stringify(input.employmentStatuses),
        input.dueDaysAfterHire, input.renewalDays || null, input.warningWindowDays, JSON.stringify(input.reminderDays), JSON.stringify(input.managerEscalationDays), JSON.stringify(input.hrEscalationDays),
        input.notifyEmployee, input.notifySupervisor, input.notifyLocationManager, input.notifyHR, input.autoAssignEducation, input.allowEmployeeUpload, input.allowEmployeeAttestation, input.active, auth.userId,
        req.params.id, auth.organizationId,
      );
      await audit?.(auth, 'UPDATE_COMPLIANCE_REQUIREMENT', 'EmployeeComplianceRequirement', req.params.id, { code: input.code, title: input.title, active: input.active });
      res.json({ data: await requirementById(auth.organizationId, req.params.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/compliance/requirements/:id/archive', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireRequirementManager(auth);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "EmployeeComplianceRequirement" SET "active"=FALSE,"updatedById"=$1,"updatedAt"=NOW() WHERE "id"=$2 AND "organizationId"=$3 RETURNING "id"`,
        auth.userId,
        req.params.id,
        auth.organizationId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Compliance requirement was not found' });
      await audit?.(auth, 'ARCHIVE_COMPLIANCE_REQUIREMENT', 'EmployeeComplianceRequirement', req.params.id);
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.post('/api/admin/compliance/engine/run', managerGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      await requireRequirementManager(auth);
      const sendNotifications = req.body?.sendNotifications !== false;
      res.json({ data: await runEngine(auth.organizationId, 'MANUAL', auth.userId, sendNotifications) });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/compliance/dashboard', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const input = dashboardQuerySchema.parse(req.query);
      const allowed = await scopedEmployeeIds(auth);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT a."id",a."employeeId",a."requirementId",a."status",a."dueDate",a."completedAt",a."expiresAt",a."evidenceType",a."evidenceId",a."evidenceSummary",a."exemptReason",a."lastEvaluatedAt",
                r."code",r."title",r."requirementType",r."documentCategory",r."courseCode",r."warningWindowDays",
                u."email",u."role"::text AS "role",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName",p."department",p."jobTitle",COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus",
                COALESCE((SELECT jsonb_agg(DISTINCT x."locationId") FROM "TimeAttendanceLocationAssignment" x WHERE x."organizationId"=a."organizationId" AND x."employeeId"=a."employeeId" AND x."active"=TRUE),'[]'::jsonb) AS "locationIds"
         FROM "EmployeeComplianceAssignment" a
         JOIN "EmployeeComplianceRequirement" r ON r."id"=a."requirementId" AND r."organizationId"=a."organizationId"
         JOIN "User" u ON u."id"=a."employeeId" AND u."organizationId"=a."organizationId"
         LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE a."organizationId"=$1 AND a."status"<>'NOT_APPLICABLE'
           AND ($2::text IS NULL OR a."status"=$2)
           AND ($3::text IS NULL OR a."requirementId"=$3)
           AND ($4::text IS NULL OR LOWER(COALESCE(c."displayName",p."displayName",u."email",'')) LIKE '%'||LOWER($4)||'%' OR LOWER(COALESCE(u."email",'')) LIKE '%'||LOWER($4)||'%' OR LOWER(r."title") LIKE '%'||LOWER($4)||'%')
         ORDER BY CASE a."status" WHEN 'OVERDUE' THEN 0 WHEN 'MISSING' THEN 1 WHEN 'DUE_SOON' THEN 2 WHEN 'IN_PROGRESS' THEN 3 WHEN 'NOT_STARTED' THEN 4 ELSE 5 END,a."dueDate" ASC NULLS LAST
         LIMIT $5`,
        auth.organizationId,
        input.status || null,
        input.requirementId || null,
        input.q || null,
        input.limit,
      );
      const filtered = rows.filter((row) => {
        if (allowed && !allowed.includes(String(row.employeeId))) return false;
        const locations = asStringArray(row.locationIds);
        if (input.locationId && !locations.includes(input.locationId)) return false;
        row.displayName = ownerEmail(row.email) ? OWNER_NAME : row.displayName;
        row.daysUntilDue = daysUntil(row.dueDate);
        return true;
      });
      const summary = {
        total: filtered.length,
        compliant: filtered.filter((row) => row.status === 'COMPLIANT').length,
        dueSoon: filtered.filter((row) => row.status === 'DUE_SOON').length,
        overdue: filtered.filter((row) => row.status === 'OVERDUE').length,
        missing: filtered.filter((row) => ['MISSING', 'NOT_STARTED', 'IN_PROGRESS'].includes(row.status)).length,
        exempt: filtered.filter((row) => row.status === 'EXEMPT').length,
        compliancePercent: filtered.length ? Math.round(filtered.filter((row) => row.status === 'COMPLIANT' || row.status === 'EXEMPT').length / filtered.length * 100) : 100,
      };
      res.json({ data: { summary, assignments: filtered } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/compliance/employees/:employeeId', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireEmployeeScope(auth, req.params.employeeId);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT a.*,r."code",r."title",r."description",r."requirementType",r."documentCategory",r."documentSensitivity",r."courseCode",r."courseTitle",r."attestationText",r."allowEmployeeUpload",r."allowEmployeeAttestation",r."warningWindowDays"
         FROM "EmployeeComplianceAssignment" a JOIN "EmployeeComplianceRequirement" r ON r."id"=a."requirementId" AND r."organizationId"=a."organizationId"
         WHERE a."organizationId"=$1 AND a."employeeId"=$2 AND a."status"<>'NOT_APPLICABLE'
         ORDER BY CASE a."status" WHEN 'OVERDUE' THEN 0 WHEN 'MISSING' THEN 1 WHEN 'DUE_SOON' THEN 2 ELSE 3 END,a."dueDate" ASC NULLS LAST`,
        auth.organizationId,
        req.params.employeeId,
      );
      const reminders = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","assignmentId","recipientType","recipient","stage","daysFromDue","subject","status","attempts","errorMessage","sentAt","createdAt"
         FROM "EmployeeComplianceReminder" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC LIMIT 250`,
        auth.organizationId,
        req.params.employeeId,
      );
      res.json({ data: { assignments: rows.map((row) => ({ ...row, daysUntilDue: daysUntil(row.dueDate) })), reminders } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/compliance/assignments/:assignmentId', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireRequirementManager(auth);
      const assignment = await assignmentDetail(auth.organizationId, req.params.assignmentId);
      await requireEmployeeScope(auth, assignment.employeeId);
      const input = assignmentOverrideSchema.parse(req.body);
      if (input.action === 'EXEMPT') {
        if (!input.reason) return void res.status(400).json({ error: 'An exemption reason is required' });
        await prisma.$executeRawUnsafe(
          `UPDATE "EmployeeComplianceAssignment" SET "status"='EXEMPT',"exemptReason"=$1,"exemptUntil"=$2,"updatedAt"=NOW() WHERE "id"=$3 AND "organizationId"=$4`,
          input.reason,
          input.exemptUntil || null,
          assignment.id,
          auth.organizationId,
        );
      } else if (input.action === 'CLEAR_EXEMPTION') {
        await prisma.$executeRawUnsafe(`UPDATE "EmployeeComplianceAssignment" SET "exemptReason"=NULL,"exemptUntil"=NULL,"status"='NOT_STARTED',"updatedAt"=NOW() WHERE "id"=$1 AND "organizationId"=$2`, assignment.id, auth.organizationId);
      } else if (input.action === 'MARK_COMPLETE') {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmployeeComplianceAssignment" SET "manuallyCompletedAt"=NOW(),"manualNotes"=$1,"status"='COMPLIANT',"completedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$2 AND "organizationId"=$3`,
          input.reason || 'Marked complete by authorized administrator',
          assignment.id,
          auth.organizationId,
        );
      } else if (input.action === 'RESET') {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmployeeComplianceAssignment" SET "manuallyCompletedAt"=NULL,"manualNotes"=NULL,"exemptReason"=NULL,"exemptUntil"=NULL,"evidenceType"=NULL,"evidenceId"=NULL,"evidenceSummary"=NULL,"status"='NOT_STARTED',"updatedAt"=NOW() WHERE "id"=$1 AND "organizationId"=$2`,
          assignment.id,
          auth.organizationId,
        );
      } else if (input.action === 'CHANGE_DUE_DATE') {
        if (!input.dueDate) return void res.status(400).json({ error: 'A due date is required' });
        await prisma.$executeRawUnsafe(`UPDATE "EmployeeComplianceAssignment" SET "dueDate"=$1,"manualNotes"=$2,"updatedAt"=NOW() WHERE "id"=$3 AND "organizationId"=$4`, input.dueDate, input.reason || null, assignment.id, auth.organizationId);
      }
      await audit?.(auth, `COMPLIANCE_${input.action}`, 'EmployeeComplianceAssignment', assignment.id, { employeeId: assignment.employeeId, requirementId: assignment.requirementId, reason: input.reason || null });
      res.json({ data: await assignmentDetail(auth.organizationId, assignment.id) });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/compliance/assignments/:assignmentId/remind', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireReminderSender(auth);
      const detail = await assignmentDetail(auth.organizationId, req.params.assignmentId);
      await requireEmployeeScope(auth, detail.employeeId);
      const employees = await employeesForOrganization(auth.organizationId);
      const employee = employees.find((item) => item.id === detail.employeeId);
      if (!employee) return void res.status(404).json({ error: 'Employee was not found' });
      const requirement = await requirementById(auth.organizationId, detail.requirementId);
      const settings = await settingsFor(auth.organizationId);
      const assignment = detail as AssignmentRow;
      const remaining = daysUntil(assignment.dueDate) ?? 0;
      const groups = await recipientGroups(auth.organizationId, employee, requirement, remaining, settings);
      let sent = 0;
      for (const group of groups) for (const email of group.emails) {
        const manualStage = `MANUAL_${Date.now()}`;
        const manualAssignment = { ...assignment, id: `${assignment.id}:${manualStage}` };
        if (await sendReminder(auth.organizationId, manualAssignment, employee, requirement, group.type, email, remaining, settings)) sent += 1;
      }
      await audit?.(auth, 'SEND_MANUAL_COMPLIANCE_REMINDER', 'EmployeeComplianceAssignment', assignment.id, { sent });
      res.json({ data: { sent } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/compliance/reminders', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const input = logQuerySchema.parse(req.query);
      const allowed = await scopedEmployeeIds(auth);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT n.*,r."code",r."title",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName"
         FROM "EmployeeComplianceReminder" n
         JOIN "EmployeeComplianceRequirement" r ON r."id"=n."requirementId"
         JOIN "User" u ON u."id"=n."employeeId"
         LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE n."organizationId"=$1
           AND ($2::text IS NULL OR n."employeeId"=$2)
           AND ($3::text IS NULL OR n."requirementId"=$3)
           AND ($4::text IS NULL OR n."status"=$4)
         ORDER BY n."createdAt" DESC LIMIT $5`,
        auth.organizationId,
        input.employeeId || null,
        input.requirementId || null,
        input.status || null,
        input.limit,
      );
      res.json({ data: rows.filter((row) => !allowed || allowed.includes(String(row.employeeId))) });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/compliance/runs', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const limit = Math.min(250, Math.max(1, Number(req.query.limit || 100)));
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "EmployeeComplianceRun" WHERE "organizationId"=$1 ORDER BY "startedAt" DESC LIMIT $2`,
        auth.organizationId,
        limit,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/employee/me/compliance', allUsersGate, async (_req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT a."id",a."status",a."dueDate",a."completedAt",a."expiresAt",a."evidenceSummary",a."lastEvaluatedAt",
                r."code",r."title",r."description",r."requirementType",r."documentCategory",r."courseCode",r."courseTitle",r."attestationText",r."allowEmployeeUpload",r."allowEmployeeAttestation"
         FROM "EmployeeComplianceAssignment" a JOIN "EmployeeComplianceRequirement" r ON r."id"=a."requirementId" AND r."organizationId"=a."organizationId"
         WHERE a."organizationId"=$1 AND a."employeeId"=$2 AND a."status"<>'NOT_APPLICABLE' AND r."active"=TRUE
         ORDER BY CASE a."status" WHEN 'OVERDUE' THEN 0 WHEN 'MISSING' THEN 1 WHEN 'DUE_SOON' THEN 2 ELSE 3 END,a."dueDate" ASC NULLS LAST`,
        auth.organizationId,
        auth.userId,
      );
      const summary = {
        total: rows.length,
        compliant: rows.filter((row) => row.status === 'COMPLIANT').length,
        dueSoon: rows.filter((row) => row.status === 'DUE_SOON').length,
        overdue: rows.filter((row) => row.status === 'OVERDUE').length,
        actionRequired: rows.filter((row) => ['MISSING', 'NOT_STARTED', 'IN_PROGRESS', 'DUE_SOON', 'OVERDUE'].includes(row.status)).length,
      };
      res.json({ data: { summary, assignments: rows.map((row) => ({ ...row, daysUntilDue: daysUntil(row.dueDate), educationUrl: EDUCATION_URL })) } });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/compliance/:assignmentId/attest', allUsersGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const input = attestationSchema.parse(req.body);
      const assignment = await assignmentDetail(auth.organizationId, req.params.assignmentId);
      if (assignment.employeeId !== auth.userId) return void res.status(403).json({ error: 'You may attest only to your own compliance requirement' });
      if (assignment.requirementType !== 'ATTESTATION' || !assignment.allowEmployeeAttestation) return void res.status(409).json({ error: 'This requirement does not permit employee attestation' });
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeComplianceAttestation" ("id","organizationId","assignmentId","employeeId","requirementId","statement","typedName","ipAddress","userAgent")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        id,
        auth.organizationId,
        assignment.id,
        auth.userId,
        assignment.requirementId,
        assignment.attestationText,
        input.typedName,
        auth.ipAddress || req.ip || null,
        auth.userAgent || req.get('user-agent') || null,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeComplianceAssignment" SET "status"='COMPLIANT',"completedAt"=NOW(),"evidenceType"='ATTESTATION',"evidenceId"=$1,"evidenceSummary"=$2,"lastEvaluatedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$3`,
        id,
        `Attested by ${input.typedName}`,
        assignment.id,
      );
      await audit?.(auth, 'EMPLOYEE_COMPLIANCE_ATTESTATION', 'EmployeeComplianceAssignment', assignment.id, { requirementId: assignment.requirementId, attestationId: id });
      res.status(201).json({ data: { id, assignmentId: assignment.id, status: 'COMPLIANT', acceptedAt: new Date() } });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/compliance/:assignmentId/upload', allUsersGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const input = uploadSchema.parse(req.body);
      const assignment = await assignmentDetail(auth.organizationId, req.params.assignmentId);
      if (assignment.employeeId !== auth.userId) return void res.status(403).json({ error: 'You may upload documents only for your own compliance requirement' });
      if (assignment.requirementType !== 'DOCUMENT' || !assignment.allowEmployeeUpload) return void res.status(409).json({ error: 'This requirement does not permit employee document upload' });
      const content = input.contentBase64.includes(',') ? input.contentBase64.split(',').pop() || '' : input.contentBase64;
      const buffer = Buffer.from(content, 'base64');
      if (!buffer.length) return void res.status(400).json({ error: 'The selected file is empty or invalid' });
      if (buffer.length > MAX_DOCUMENT_BYTES) return void res.status(413).json({ error: 'Employee documents are limited to 15 MB each' });
      const documentId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeDocument"
          ("id","organizationId","employeeId","category","title","fileName","mimeType","contentBase64","fileSizeBytes","issueDate","expirationDate","notes","sensitivity","employeeVisible","reviewStatus","uploadedById")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,'PENDING',$3)`,
        documentId,
        auth.organizationId,
        auth.userId,
        assignment.documentCategory || 'Compliance',
        assignment.title,
        cleanFileName(input.fileName),
        input.mimeType,
        content,
        buffer.length,
        input.issueDate || null,
        input.expirationDate || null,
        input.notes,
        assignment.documentSensitivity || 'GENERAL',
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeComplianceAssignment" SET "status"='IN_PROGRESS',"evidenceType"='DOCUMENT',"evidenceId"=$1,"evidenceSummary"='Employee document is awaiting review',"updatedAt"=NOW() WHERE "id"=$2`,
        documentId,
        assignment.id,
      );
      await audit?.(auth, 'EMPLOYEE_COMPLIANCE_DOCUMENT_UPLOAD', 'EmployeeComplianceAssignment', assignment.id, { documentId, requirementId: assignment.requirementId, fileName: input.fileName });
      res.status(201).json({ data: { documentId, assignmentId: assignment.id, status: 'IN_PROGRESS', reviewStatus: 'PENDING' } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/compliance/documents/:documentId/review', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireRequirementManager(auth);
      const input = z.object({ status: z.enum(['APPROVED', 'REJECTED']), notes: z.string().trim().max(4_000).optional().nullable() }).parse(req.body);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "EmployeeDocument" SET "reviewStatus"=$1,"reviewedById"=$2,"reviewedAt"=NOW(),"notes"=CASE WHEN $3::text IS NULL THEN "notes" ELSE $3 END,"updatedAt"=NOW()
         WHERE "id"=$4 AND "organizationId"=$5 RETURNING "id","employeeId","reviewStatus"`,
        input.status,
        auth.userId,
        input.notes || null,
        req.params.documentId,
        auth.organizationId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Employee document was not found' });
      await requireEmployeeScope(auth, rows[0].employeeId);
      await audit?.(auth, `COMPLIANCE_DOCUMENT_${input.status}`, 'EmployeeDocument', req.params.documentId, { employeeId: rows[0].employeeId, notes: input.notes || null });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  void ensureSchema().then(startScheduler).catch((error) => console.error('Employee compliance initialization failed', error));
}
