import { randomUUID } from 'node:crypto';
import type { Express, Request, RequestHandler, Response } from 'express';
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

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';

const CAPABILITIES = [
  'VIEW_DIRECTORY',
  'VIEW_PROFILE',
  'VIEW_PRIVATE_PROFILE',
  'VIEW_HR_NOTES',
  'MANAGE_PROFILE',
  'MANAGE_PRIVATE_PROFILE',
  'MANAGE_EMPLOYMENT',
  'VIEW_DOCUMENTS',
  'MANAGE_DOCUMENTS',
  'VIEW_DOC_HR',
  'VIEW_DOC_MEDICAL',
  'VIEW_DOC_BACKGROUND',
  'VIEW_DOC_DISCIPLINARY',
  'VIEW_DOC_IDENTITY',
  'VIEW_DOC_COMPENSATION',
  'VIEW_ATTENDANCE',
  'MANAGE_ATTENDANCE',
  'VIEW_EDUCATION',
  'MANAGE_EDUCATION',
  'VIEW_COMMUNICATIONS',
  'SEND_COMMUNICATIONS',
  'VIEW_ACCOUNT',
  'MANAGE_ACCOUNT',
  'VIEW_AUDIT',
  'EXPORT_EMPLOYEE_FOLDER',
  'MANAGE_ACCESS_GRANTS',
  'MANAGE_SYSTEM_ROLE',
] as const;

type Capability = (typeof CAPABILITIES)[number];
type ScopeType = 'GLOBAL' | 'LOCATION' | 'EMPLOYEE';
type Sensitivity = 'GENERAL' | 'HR_CONFIDENTIAL' | 'MEDICAL' | 'BACKGROUND' | 'DISCIPLINARY' | 'IDENTITY' | 'COMPENSATION';

type AccessProfile = {
  label: string;
  description: string;
  capabilities: readonly Capability[];
  defaultScope: ScopeType;
};

type Policy = {
  source: 'OWNER' | 'ROLE' | 'GRANT';
  profile: string;
  label: string;
  capabilities: Set<Capability>;
  scopeType: ScopeType;
  locationId: string | null;
  employeeId: string | null;
  grantId: string | null;
  expiresAt: Date | string | null;
};

type TargetContext = {
  id: string;
  email: string | null;
  displayName: string;
  isOwner: boolean;
  locationIds: string[];
};

const ALL_CAPABILITIES = [...CAPABILITIES] as readonly Capability[];
const BASIC_PROFILE: readonly Capability[] = ['VIEW_DIRECTORY', 'VIEW_PROFILE'];
const CONTACT_PROFILE: readonly Capability[] = [...BASIC_PROFILE, 'VIEW_PRIVATE_PROFILE'];
const OPERATIONS_READ: readonly Capability[] = [
  ...CONTACT_PROFILE,
  'VIEW_DOCUMENTS',
  'VIEW_ATTENDANCE',
  'VIEW_EDUCATION',
  'VIEW_COMMUNICATIONS',
  'VIEW_ACCOUNT',
  'VIEW_AUDIT',
  'EXPORT_EMPLOYEE_FOLDER',
];

const ACCESS_PROFILES: Record<string, AccessProfile> = {
  HR_FULL: {
    label: 'Human Resources — Full Personnel Access',
    description: 'Global personnel, employment, confidential documents, communications, education, attendance, account support, and audit access.',
    defaultScope: 'GLOBAL',
    capabilities: ALL_CAPABILITIES.filter((capability) => !['MANAGE_ACCESS_GRANTS', 'MANAGE_SYSTEM_ROLE'].includes(capability)),
  },
  ADMIN_GLOBAL: {
    label: 'Administrator — Global Operations',
    description: 'Global employee operations without automatic access to medical, compensation, identity, background, disciplinary, or HR-confidential files.',
    defaultScope: 'GLOBAL',
    capabilities: [
      ...OPERATIONS_READ,
      'MANAGE_PROFILE',
      'MANAGE_PRIVATE_PROFILE',
      'MANAGE_EMPLOYMENT',
      'MANAGE_DOCUMENTS',
      'MANAGE_ATTENDANCE',
      'MANAGE_EDUCATION',
      'SEND_COMMUNICATIONS',
      'MANAGE_ACCOUNT',
    ],
  },
  EXECUTIVE_GLOBAL: {
    label: 'Executive — Global Oversight',
    description: 'Global operational oversight, HR notes, background and disciplinary records, without automatic medical or identity-document access.',
    defaultScope: 'GLOBAL',
    capabilities: [
      ...OPERATIONS_READ,
      'VIEW_HR_NOTES',
      'VIEW_DOC_HR',
      'VIEW_DOC_BACKGROUND',
      'VIEW_DOC_DISCIPLINARY',
      'VIEW_DOC_COMPENSATION',
      'MANAGE_PROFILE',
      'MANAGE_EMPLOYMENT',
      'MANAGE_ATTENDANCE',
      'MANAGE_EDUCATION',
      'SEND_COMMUNICATIONS',
    ],
  },
  PROGRAM_MANAGER: {
    label: 'Program Manager — Assigned Locations',
    description: 'Employees assigned to the same service locations or programs; operational records, scheduling, education, and communications only.',
    defaultScope: 'LOCATION',
    capabilities: [
      ...OPERATIONS_READ,
      'MANAGE_PROFILE',
      'MANAGE_ATTENDANCE',
      'MANAGE_EDUCATION',
      'SEND_COMMUNICATIONS',
    ],
  },
  HOUSE_MANAGER: {
    label: 'House Manager — Managed Homes',
    description: 'Employees assigned to homes where this user is the designated Home Manager; no confidential HR, medical, identity, or disciplinary records.',
    defaultScope: 'LOCATION',
    capabilities: [
      ...BASIC_PROFILE,
      'VIEW_DOCUMENTS',
      'VIEW_ATTENDANCE',
      'MANAGE_ATTENDANCE',
      'VIEW_EDUCATION',
      'MANAGE_EDUCATION',
      'VIEW_COMMUNICATIONS',
      'SEND_COMMUNICATIONS',
    ],
  },
  SCHEDULER: {
    label: 'Scheduler — Assigned Locations',
    description: 'Minimum employee identity plus schedules, timecards, requests, and attendance exceptions for assigned locations.',
    defaultScope: 'LOCATION',
    capabilities: [...BASIC_PROFILE, 'VIEW_ATTENDANCE', 'MANAGE_ATTENDANCE'],
  },
  EDUCATION_MANAGER: {
    label: 'Education Manager',
    description: 'Employee identity, general credential documents, course assignments, completion records, and training compliance.',
    defaultScope: 'GLOBAL',
    capabilities: [...BASIC_PROFILE, 'VIEW_DOCUMENTS', 'VIEW_EDUCATION', 'MANAGE_EDUCATION', 'EXPORT_EMPLOYEE_FOLDER'],
  },
  AUDITOR_READ_ONLY: {
    label: 'Auditor — Read Only',
    description: 'Global read-only compliance and audit visibility, including HR, background, disciplinary, and identity records; no medical or compensation access.',
    defaultScope: 'GLOBAL',
    capabilities: [
      ...OPERATIONS_READ,
      'VIEW_HR_NOTES',
      'VIEW_DOC_HR',
      'VIEW_DOC_BACKGROUND',
      'VIEW_DOC_DISCIPLINARY',
      'VIEW_DOC_IDENTITY',
    ],
  },
  ADMIN_SUPPORT: {
    label: 'Administrative Support',
    description: 'Global employee directory, contact details, general documents, communications, and portal-access support.',
    defaultScope: 'GLOBAL',
    capabilities: [
      ...CONTACT_PROFILE,
      'VIEW_DOCUMENTS',
      'MANAGE_DOCUMENTS',
      'VIEW_COMMUNICATIONS',
      'SEND_COMMUNICATIONS',
      'VIEW_ACCOUNT',
      'MANAGE_ACCOUNT',
    ],
  },
  BILLING: {
    label: 'Billing and Payroll Time Review',
    description: 'Global employee identity and read-only timecard/attendance information for payroll reconciliation.',
    defaultScope: 'GLOBAL',
    capabilities: [...BASIC_PROFILE, 'VIEW_ATTENDANCE', 'EXPORT_EMPLOYEE_FOLDER'],
  },
  CLINICAL_MANAGER: {
    label: 'Clinical Manager — Assigned Locations',
    description: 'Assigned-location employee identity, medical/clinical credentials, education, and schedule visibility.',
    defaultScope: 'LOCATION',
    capabilities: [
      ...BASIC_PROFILE,
      'VIEW_DOCUMENTS',
      'VIEW_DOC_MEDICAL',
      'VIEW_EDUCATION',
      'MANAGE_EDUCATION',
      'VIEW_ATTENDANCE',
    ],
  },
};

const ROLE_PROFILE: Partial<Record<UserRole, keyof typeof ACCESS_PROFILES>> = {
  [UserRole.ADMINISTRATOR]: 'ADMIN_GLOBAL',
  [UserRole.HR_MANAGER]: 'HR_FULL',
  [UserRole.CEO]: 'EXECUTIVE_GLOBAL',
  [UserRole.COO]: 'EXECUTIVE_GLOBAL',
  [UserRole.PROGRAM_MANAGER]: 'PROGRAM_MANAGER',
  [UserRole.HOUSE_MANAGER]: 'HOUSE_MANAGER',
  [UserRole.SCHEDULER]: 'SCHEDULER',
  [UserRole.AUDITOR]: 'AUDITOR_READ_ONLY',
  [UserRole.ADMINISTRATIVE_ASSISTANT]: 'ADMIN_SUPPORT',
  [UserRole.BILLING_SPECIALIST]: 'BILLING',
  [UserRole.DELEGATING_NURSE]: 'CLINICAL_MANAGER',
};

const GLOBAL_BASE_ROLES = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.HR_MANAGER,
  UserRole.CEO,
  UserRole.COO,
  UserRole.AUDITOR,
  UserRole.ADMINISTRATIVE_ASSISTANT,
  UserRole.BILLING_SPECIALIST,
]);

const LOCATION_BASE_ROLES = new Set<UserRole>([
  UserRole.PROGRAM_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.SCHEDULER,
  UserRole.DELEGATING_NURSE,
]);

const ALL_EMPLOYEE_360_ROLES = [
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.AUDITOR,
  UserRole.HOUSE_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.SCHEDULER,
  UserRole.BILLING_SPECIALIST,
  UserRole.ADMINISTRATIVE_ASSISTANT,
  UserRole.DELEGATING_NURSE,
  UserRole.CEO,
  UserRole.COO,
] as const;

const ALL_USER_ROLES = Object.values(UserRole) as UserRole[];
const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const isOwnerEmail = (value: unknown) => normalizeEmail(value) === OWNER_EMAIL;
const sensitivityValues: Sensitivity[] = ['GENERAL', 'HR_CONFIDENTIAL', 'MEDICAL', 'BACKGROUND', 'DISCIPLINARY', 'IDENTITY', 'COMPENSATION'];

const grantSchema = z.object({
  actorUserId: z.string().trim().min(1).max(200),
  profile: z.string().trim().refine((value) => value in ACCESS_PROFILES, 'Unknown access profile'),
  scopeType: z.enum(['GLOBAL', 'LOCATION', 'EMPLOYEE']),
  locationId: z.string().trim().max(200).optional().nullable(),
  employeeId: z.string().trim().max(200).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  reason: z.string().trim().min(3).max(2_000),
}).superRefine((value, context) => {
  if (value.scopeType === 'LOCATION' && !value.locationId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['locationId'], message: 'Select a service location' });
  if (value.scopeType === 'EMPLOYEE' && !value.employeeId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['employeeId'], message: 'Select an employee' });
  if (value.profile === 'HR_FULL' && value.scopeType !== 'GLOBAL') context.addIssue({ code: z.ZodIssueCode.custom, path: ['scopeType'], message: 'HR Full Access must use global scope' });
});

const accessEventSchema = z.object({
  employeeId: z.string().trim().optional(),
  actorId: z.string().trim().optional(),
  decision: z.enum(['ALLOW', 'DENY']).optional(),
  limit: z.coerce.number().int().min(1).max(1_000).default(250),
});

const categoryDefaultSensitivity = (category: unknown): Sensitivity => {
  const value = String(category || '').toLowerCase();
  if (value.includes('medical') || value.includes('health')) return 'MEDICAL';
  if (value.includes('background')) return 'BACKGROUND';
  if (value.includes('corrective') || value.includes('disciplinary')) return 'DISCIPLINARY';
  if (value.includes('identification') || value.includes('i-9') || value.includes('passport')) return 'IDENTITY';
  if (value.includes('compensation') || value.includes('payroll') || value.includes('tax') || value.includes('direct deposit')) return 'COMPENSATION';
  if (value.includes('employment') || value.includes('performance')) return 'HR_CONFIDENTIAL';
  return 'GENERAL';
};

const sensitivityCapability = (sensitivity: Sensitivity): Capability | null => ({
  GENERAL: null,
  HR_CONFIDENTIAL: 'VIEW_DOC_HR',
  MEDICAL: 'VIEW_DOC_MEDICAL',
  BACKGROUND: 'VIEW_DOC_BACKGROUND',
  DISCIPLINARY: 'VIEW_DOC_DISCIPLINARY',
  IDENTITY: 'VIEW_DOC_IDENTITY',
  COMPENSATION: 'VIEW_DOC_COMPENSATION',
}[sensitivity] as Capability | null);

const safeSensitivity = (value: unknown, category?: unknown): Sensitivity => {
  const normalized = String(value || '').toUpperCase() as Sensitivity;
  return sensitivityValues.includes(normalized) ? normalized : categoryDefaultSensitivity(category);
};

export function registerEmployee360Permissions({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  let schemaPromise: Promise<void> | null = null;
  const ensureSchema = () => schemaPromise ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Employee360AccessGrant" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "actorUserId" TEXT NOT NULL,
      "profile" TEXT NOT NULL,
      "scopeType" TEXT NOT NULL,
      "locationId" TEXT,
      "employeeId" TEXT,
      "reason" TEXT NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT TRUE,
      "expiresAt" TIMESTAMPTZ,
      "createdById" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Employee360AccessGrant_scope_check" CHECK ("scopeType" IN ('GLOBAL','LOCATION','EMPLOYEE'))
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Employee360AccessGrant_actor_idx" ON "Employee360AccessGrant"("organizationId","actorUserId","active")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Employee360AccessGrant_scope_idx" ON "Employee360AccessGrant"("organizationId","scopeType","locationId","employeeId")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Employee360AccessEvent" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "actorUserId" TEXT NOT NULL,
      "targetEmployeeId" TEXT,
      "action" TEXT NOT NULL,
      "resourceType" TEXT NOT NULL,
      "resourceId" TEXT,
      "capability" TEXT,
      "sensitivity" TEXT,
      "decision" TEXT NOT NULL,
      "reason" TEXT,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "Employee360AccessEvent_decision_check" CHECK ("decision" IN ('ALLOW','DENY'))
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Employee360AccessEvent_target_idx" ON "Employee360AccessEvent"("organizationId","targetEmployeeId","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Employee360AccessEvent_actor_idx" ON "Employee360AccessEvent"("organizationId","actorUserId","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "sensitivity" TEXT NOT NULL DEFAULT 'GENERAL'`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "employeeVisible" BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeDocument_sensitivity_idx" ON "EmployeeDocument"("organizationId","employeeId","sensitivity","status")`).catch(() => undefined);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  const managerGate = requireRoles(...ALL_EMPLOYEE_360_ROLES);
  const allUsersGate = requireRoles(...ALL_USER_ROLES);

  const actorRecord = async (auth: AuthContext) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; email: string | null; role: string; displayName: string | null }>>(
      `SELECT u."id",u."email",u."role"::text AS "role",COALESCE(NULLIF(c."displayName",''),u."email") AS "displayName"
       FROM "User" u LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       WHERE u."id"=$1 AND u."organizationId"=$2 LIMIT 1`,
      auth.userId,
      auth.organizationId,
    );
    const row = rows[0];
    if (!row) throw Object.assign(new Error('Authenticated employee account was not found'), { status: 401 });
    return {
      ...row,
      email: normalizeEmail(row.email || auth.email),
      isOwner: isOwnerEmail(row.email || auth.email),
      displayName: isOwnerEmail(row.email || auth.email) ? OWNER_NAME : String(row.displayName || row.email || 'Employee'),
    };
  };

  const tableExists = async (name: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
      `SELECT to_regclass($1::text)::text AS "name"`,
      `public."${name}"`,
    );
    return Boolean(rows[0]?.name);
  };

  const locationIdsFor = async (auth: AuthContext) => {
    if (!(await tableExists('TimeAttendanceLocationAssignment'))) return [] as string[];
    const requireManager = auth.role === UserRole.HOUSE_MANAGER;
    const rows = await prisma.$queryRawUnsafe<Array<{ locationId: string }>>(
      `SELECT DISTINCT "locationId" FROM "TimeAttendanceLocationAssignment"
       WHERE "organizationId"=$1 AND "employeeId"=$2 AND "active"=TRUE ${requireManager ? 'AND "isManager"=TRUE' : ''}`,
      auth.organizationId,
      auth.userId,
    ).catch(() => []);
    return rows.map((row) => row.locationId);
  };

  const targetContext = async (auth: AuthContext, employeeId: string): Promise<TargetContext> => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; email: string | null; displayName: string | null }>>(
      `SELECT u."id",u."email",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName"
       FROM "User" u
       LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
       WHERE u."id"=$1 AND u."organizationId"=$2 LIMIT 1`,
      employeeId,
      auth.organizationId,
    );
    const row = rows[0];
    if (!row) throw Object.assign(new Error('Employee was not found'), { status: 404 });
    let locationIds: string[] = [];
    if (await tableExists('TimeAttendanceLocationAssignment')) {
      const locationRows = await prisma.$queryRawUnsafe<Array<{ locationId: string }>>(
        `SELECT DISTINCT "locationId" FROM "TimeAttendanceLocationAssignment"
         WHERE "organizationId"=$1 AND "employeeId"=$2 AND "active"=TRUE`,
        auth.organizationId,
        employeeId,
      ).catch(() => []);
      locationIds = locationRows.map((item) => item.locationId);
    }
    return {
      id: row.id,
      email: row.email,
      displayName: isOwnerEmail(row.email) ? OWNER_NAME : String(row.displayName || row.email || 'Employee'),
      isOwner: isOwnerEmail(row.email),
      locationIds,
    };
  };

  const policiesFor = async (auth: AuthContext): Promise<{ actor: Awaited<ReturnType<typeof actorRecord>>; policies: Policy[] }> => {
    await ensureSchema();
    const actor = await actorRecord(auth);
    if (actor.isOwner) {
      return {
        actor,
        policies: [{
          source: 'OWNER',
          profile: 'ENTERPRISE_OWNER',
          label: 'Enterprise Owner — Unrestricted',
          capabilities: new Set(ALL_CAPABILITIES),
          scopeType: 'GLOBAL',
          locationId: null,
          employeeId: null,
          grantId: null,
          expiresAt: null,
        }],
      };
    }

    const policies: Policy[] = [];
    const baseProfileName = ROLE_PROFILE[auth.role];
    if (baseProfileName) {
      const profile = ACCESS_PROFILES[baseProfileName];
      if (GLOBAL_BASE_ROLES.has(auth.role)) {
        policies.push({
          source: 'ROLE', profile: baseProfileName, label: profile.label,
          capabilities: new Set(profile.capabilities), scopeType: 'GLOBAL', locationId: null, employeeId: null, grantId: null, expiresAt: null,
        });
      } else if (LOCATION_BASE_ROLES.has(auth.role)) {
        for (const locationId of await locationIdsFor(auth)) {
          policies.push({
            source: 'ROLE', profile: baseProfileName, label: profile.label,
            capabilities: new Set(profile.capabilities), scopeType: 'LOCATION', locationId, employeeId: null, grantId: null, expiresAt: null,
          });
        }
      }
    }

    const grants = await prisma.$queryRawUnsafe<Array<{
      id: string; profile: string; scopeType: ScopeType; locationId: string | null; employeeId: string | null; expiresAt: Date | string | null;
    }>>(
      `SELECT "id","profile","scopeType","locationId","employeeId","expiresAt"
       FROM "Employee360AccessGrant"
       WHERE "organizationId"=$1 AND "actorUserId"=$2 AND "active"=TRUE AND ("expiresAt" IS NULL OR "expiresAt">NOW())
       ORDER BY "createdAt"`,
      auth.organizationId,
      auth.userId,
    );
    for (const grant of grants) {
      const profile = ACCESS_PROFILES[grant.profile];
      if (!profile) continue;
      policies.push({
        source: 'GRANT', profile: grant.profile, label: profile.label,
        capabilities: new Set(profile.capabilities), scopeType: grant.scopeType, locationId: grant.locationId,
        employeeId: grant.employeeId, grantId: grant.id, expiresAt: grant.expiresAt,
      });
    }
    return { actor, policies };
  };

  const scopeMatches = (policy: Policy, target: TargetContext) => {
    if (policy.scopeType === 'GLOBAL') return true;
    if (policy.scopeType === 'EMPLOYEE') return policy.employeeId === target.id;
    return Boolean(policy.locationId && target.locationIds.includes(policy.locationId));
  };

  const allows = (policies: Policy[], capability: Capability, target: TargetContext) =>
    policies.some((policy) => policy.capabilities.has(capability) && scopeMatches(policy, target));

  const capabilityMap = (policies: Policy[], target: TargetContext) => Object.fromEntries(
    CAPABILITIES.map((capability) => [capability, allows(policies, capability, target)]),
  ) as Record<Capability, boolean>;

  const logAccess = async (
    auth: AuthContext,
    req: Request,
    targetEmployeeId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    capability: Capability | null,
    sensitivity: Sensitivity | null,
    decision: 'ALLOW' | 'DENY',
    reason: string,
  ) => {
    await ensureSchema();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Employee360AccessEvent"
        ("id","organizationId","actorUserId","targetEmployeeId","action","resourceType","resourceId","capability","sensitivity","decision","reason","ipAddress","userAgent")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      randomUUID(), auth.organizationId, auth.userId, targetEmployeeId, action, resourceType, resourceId,
      capability, sensitivity, decision, reason, auth.ipAddress || req.ip || null,
      auth.userAgent || req.get('user-agent') || null,
    ).catch(() => undefined);
  };

  const deny = async (
    auth: AuthContext,
    req: Request,
    target: TargetContext | null,
    capability: Capability,
    reason: string,
    resourceType = 'Employee',
    resourceId: string | null = null,
    sensitivity: Sensitivity | null = null,
  ): Promise<never> => {
    await logAccess(auth, req, target?.id || null, req.method, resourceType, resourceId, capability, sensitivity, 'DENY', reason);
    throw Object.assign(new Error(reason), { status: 403 });
  };

  const requireCapability = async (
    auth: AuthContext,
    req: Request,
    policies: Policy[],
    target: TargetContext,
    capability: Capability,
    options: { write?: boolean; resourceType?: string; resourceId?: string | null; sensitivity?: Sensitivity | null } = {},
  ) => {
    if (options.write && target.isOwner && !isOwnerEmail((await actorRecord(auth)).email)) {
      return deny(auth, req, target, capability, 'The enterprise owner account cannot be managed by another user', options.resourceType, options.resourceId, options.sensitivity);
    }
    if (!allows(policies, capability, target)) {
      return deny(auth, req, target, capability, 'You do not have permission for this employee, location, or record type', options.resourceType, options.resourceId, options.sensitivity);
    }
    if (options.sensitivity) {
      const restricted = sensitivityCapability(options.sensitivity);
      if (restricted && !allows(policies, restricted, target)) {
        return deny(auth, req, target, restricted, `Access to ${options.sensitivity.toLowerCase().replaceAll('_', ' ')} employee records is restricted`, options.resourceType, options.resourceId, options.sensitivity);
      }
    }
    if (options.write || options.sensitivity && options.sensitivity !== 'GENERAL') {
      await logAccess(auth, req, target.id, req.method, options.resourceType || 'Employee', options.resourceId || target.id, capability, options.sensitivity || null, 'ALLOW', 'Authorized by Employee 360 policy');
    }
  };

  const documentRecord = async (auth: AuthContext, employeeId: string, documentId: string) => {
    await ensureSchema();
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; sensitivity: string; category: string }>>(
      `SELECT "id",COALESCE("sensitivity",'GENERAL') AS "sensitivity","category"
       FROM "EmployeeDocument" WHERE "id"=$1 AND "employeeId"=$2 AND "organizationId"=$3 AND "status"<>'ARCHIVED' LIMIT 1`,
      documentId,
      employeeId,
      auth.organizationId,
    );
    if (!rows[0]) throw Object.assign(new Error('Employee document was not found'), { status: 404 });
    return { ...rows[0], sensitivity: safeSensitivity(rows[0].sensitivity, rows[0].category) };
  };

  const maskEmployee = (employee: Record<string, unknown>, capabilities: Record<Capability, boolean>) => {
    const result = { ...employee };
    if (!capabilities.VIEW_PRIVATE_PROFILE) {
      for (const key of ['personalEmail', 'phone', 'alternatePhone', 'streetAddress', 'city', 'state', 'zipCode', 'emergencyContactName', 'emergencyContactPhone']) result[key] = null;
    }
    if (!capabilities.VIEW_HR_NOTES) result.notes = null;
    if (!capabilities.VIEW_ACCOUNT) {
      for (const key of ['username', 'mustChangePassword', 'failedLoginAttempts', 'lockedUntil', 'lastSignedInAt']) result[key] = null;
    }
    return result;
  };

  const transformDirectory = async (auth: AuthContext, policies: Policy[], body: any) => {
    const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    const transformed: any[] = [];
    for (const row of rows) {
      const target = await targetContext(auth, String(row.id));
      const capabilities = capabilityMap(policies, target);
      if (!capabilities.VIEW_DIRECTORY && !capabilities.VIEW_PROFILE) continue;
      const masked = maskEmployee(row, capabilities);
      if (!capabilities.VIEW_DOCUMENTS) {
        masked.documentCount = 0;
        masked.expiredDocumentCount = 0;
        masked.expiringDocumentCount = 0;
      }
      transformed.push({
        ...masked,
        employee360Access: {
          profileLabels: policies.filter((policy) => scopeMatches(policy, target)).map((policy) => policy.label),
          readOnly: !capabilities.MANAGE_PROFILE && !capabilities.MANAGE_ATTENDANCE && !capabilities.MANAGE_EDUCATION,
        },
      });
    }
    return body?.data ? { ...body, data: transformed } : transformed;
  };

  const transformDetail = async (auth: AuthContext, policies: Policy[], target: TargetContext, body: any) => {
    const wrapper = body?.data ? body : { data: body };
    const data = wrapper.data || {};
    const capabilities = capabilityMap(policies, target);
    const documents = capabilities.VIEW_DOCUMENTS
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","category","title","fileName","mimeType","fileSizeBytes","issueDate","expirationDate","notes","status","createdAt","updatedAt",
                  COALESCE("sensitivity",'GENERAL') AS "sensitivity",COALESCE("employeeVisible",FALSE) AS "employeeVisible",
                  CASE WHEN "expirationDate" IS NULL THEN NULL ELSE ("expirationDate"-CURRENT_DATE)::int END AS "daysUntilExpiration"
           FROM "EmployeeDocument" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"<>'ARCHIVED'
           ORDER BY "expirationDate" ASC NULLS LAST,"createdAt" DESC`,
          auth.organizationId,
          target.id,
        ).then((items) => items.filter((item) => {
          const sensitivity = safeSensitivity(item.sensitivity, item.category);
          const restricted = sensitivityCapability(sensitivity);
          return !restricted || capabilities[restricted];
        }))
      : [];

    const diagnostics = capabilities.VIEW_ACCOUNT ? (data.diagnostics || {}) : {
      assignedHomeCount: Number(data?.diagnostics?.assignedHomeCount || 0),
      upcomingShiftCount: capabilities.VIEW_ATTENDANCE ? Number(data?.diagnostics?.upcomingShiftCount || 0) : 0,
      assignedEducationCount: capabilities.VIEW_EDUCATION ? Number(data?.diagnostics?.assignedEducationCount || 0) : 0,
      overdueEducationCount: capabilities.VIEW_EDUCATION ? Number(data?.diagnostics?.overdueEducationCount || 0) : 0,
      expiredDocumentCount: documents.filter((item) => Number(item.daysUntilExpiration) < 0).length,
      expiringDocumentCount: documents.filter((item) => Number(item.daysUntilExpiration) >= 0 && Number(item.daysUntilExpiration) <= 60).length,
    };

    return {
      ...wrapper,
      data: {
        ...data,
        employee: maskEmployee(data.employee || {}, capabilities),
        documents,
        communications: capabilities.VIEW_COMMUNICATIONS ? (data.communications || []) : [],
        actions: capabilities.VIEW_AUDIT ? (data.actions || []) : [],
        homes: data.homes || [],
        education: capabilities.VIEW_EDUCATION ? (data.education || []) : [],
        shifts: capabilities.VIEW_ATTENDANCE ? (data.shifts || []) : [],
        timecards: capabilities.VIEW_ATTENDANCE ? (data.timecards || []) : [],
        requests: capabilities.VIEW_ATTENDANCE ? (data.requests || []) : [],
        diagnostics,
        permissions: {
          ...(data.permissions || {}),
          actorIsOwner: isOwnerEmail((await actorRecord(auth)).email),
          targetIsOwner: target.isOwner,
          canManageIdentity: capabilities.MANAGE_PROFILE,
          canChangeRole: capabilities.MANAGE_SYSTEM_ROLE && !target.isOwner,
          canResetAccess: capabilities.MANAGE_ACCOUNT && !target.isOwner,
          employee360: {
            capabilities,
            profileLabels: policies.filter((policy) => scopeMatches(policy, target)).map((policy) => policy.label),
            policies: policies.filter((policy) => scopeMatches(policy, target)).map((policy) => ({
              source: policy.source,
              profile: policy.profile,
              label: policy.label,
              scopeType: policy.scopeType,
              locationId: policy.locationId,
              employeeId: policy.employeeId,
              grantId: policy.grantId,
              expiresAt: policy.expiresAt,
            })),
            allowedDocumentSensitivities: sensitivityValues.filter((sensitivity) => {
              const restricted = sensitivityCapability(sensitivity);
              return !restricted || capabilities[restricted];
            }),
          },
        },
      },
    };
  };

  const requireOwner = async (auth: AuthContext) => {
    const actor = await actorRecord(auth);
    if (!actor.isOwner) throw Object.assign(new Error('Only the enterprise owner may manage Employee 360 access grants'), { status: 403 });
    return actor;
  };

  app.get('/api/admin/employee360/access-profiles', managerGate, async (_req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const actor = await actorRecord(auth);
      const mayView = actor.isOwner || auth.role === UserRole.HR_MANAGER || auth.role === UserRole.AUDITOR;
      if (!mayView) return void res.status(403).json({ error: 'Employee 360 permission definitions are restricted' });
      let locations: any[] = [];
      if (await tableExists('TimeAttendanceLocation')) {
        locations = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","name","address" FROM "TimeAttendanceLocation" WHERE "organizationId"=$1 AND "active"=TRUE ORDER BY "name"`,
          auth.organizationId,
        ).catch(() => []);
      }
      const employees = await prisma.$queryRawUnsafe<any[]>(
        `SELECT u."id",u."email",u."role"::text AS "role",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName"
         FROM "User" u
         LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE u."organizationId"=$1 AND LOWER(COALESCE(u."email",'')) NOT LIKE '%@demo.spire.local'
         ORDER BY COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email")`,
        auth.organizationId,
      );
      res.json({
        data: {
          actorIsOwner: actor.isOwner,
          profiles: Object.entries(ACCESS_PROFILES).map(([key, profile]) => ({ key, ...profile })),
          capabilities: CAPABILITIES,
          sensitivities: sensitivityValues,
          locations,
          employees: employees.map((employee) => ({
            ...employee,
            displayName: isOwnerEmail(employee.email) ? OWNER_NAME : employee.displayName,
            protectedOwner: isOwnerEmail(employee.email),
          })),
        },
      });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employee360/access-grants/:employeeId', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const actor = await actorRecord(auth);
      if (!actor.isOwner && auth.role !== UserRole.HR_MANAGER && auth.role !== UserRole.AUDITOR) {
        return void res.status(403).json({ error: 'Access-grant records are restricted' });
      }
      const target = await targetContext(auth, req.params.employeeId);
      const grants = await prisma.$queryRawUnsafe<any[]>(
        `SELECT g."id",g."profile",g."scopeType",g."locationId",g."employeeId",g."reason",g."active",g."expiresAt",g."createdById",g."createdAt",g."updatedAt",
                l."name" AS "locationName",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "employeeName"
         FROM "Employee360AccessGrant" g
         LEFT JOIN "TimeAttendanceLocation" l ON l."id"=g."locationId"
         LEFT JOIN "User" u ON u."id"=g."employeeId"
         LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE g."organizationId"=$1 AND g."actorUserId"=$2 ORDER BY g."active" DESC,g."createdAt" DESC`,
        auth.organizationId,
        target.id,
      );
      res.json({ data: { target, grants: grants.map((grant) => ({ ...grant, profileLabel: ACCESS_PROFILES[grant.profile]?.label || grant.profile })) } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employee360/access-grants', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireOwner(auth);
      const input = grantSchema.parse(req.body);
      const targetActor = await targetContext(auth, input.actorUserId);
      if (targetActor.isOwner) return void res.status(409).json({ error: 'The enterprise owner already has unrestricted immutable access' });
      if (input.scopeType === 'LOCATION') {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id" FROM "TimeAttendanceLocation" WHERE "id"=$1 AND "organizationId"=$2 AND "active"=TRUE LIMIT 1`,
          input.locationId,
          auth.organizationId,
        ).catch(() => []);
        if (!rows[0]) return void res.status(404).json({ error: 'The selected service location was not found' });
      }
      if (input.scopeType === 'EMPLOYEE') await targetContext(auth, String(input.employeeId));
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Employee360AccessGrant"
          ("id","organizationId","actorUserId","profile","scopeType","locationId","employeeId","reason","active","expiresAt","createdById")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10)`,
        id,
        auth.organizationId,
        input.actorUserId,
        input.profile,
        input.scopeType,
        input.scopeType === 'LOCATION' ? input.locationId : null,
        input.scopeType === 'EMPLOYEE' ? input.employeeId : null,
        input.reason,
        input.expiresAt ?? null,
        auth.userId,
      );
      await logAccess(auth, req, input.actorUserId, 'CREATE_ACCESS_GRANT', 'Employee360AccessGrant', id, 'MANAGE_ACCESS_GRANTS', null, 'ALLOW', input.reason);
      await audit?.(auth, 'CREATE_EMPLOYEE_360_ACCESS_GRANT', 'Employee', input.actorUserId, { grantId: id, ...input });
      res.status(201).json({ data: { id, active: true } });
    } catch (error) { next(error); }
  });

  app.delete('/api/admin/employee360/access-grants/:grantId', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireOwner(auth);
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string; actorUserId: string }>>(
        `UPDATE "Employee360AccessGrant" SET "active"=FALSE,"updatedAt"=NOW()
         WHERE "id"=$1 AND "organizationId"=$2 AND "active"=TRUE RETURNING "id","actorUserId"`,
        req.params.grantId,
        auth.organizationId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Access grant was not found' });
      await logAccess(auth, req, rows[0].actorUserId, 'REVOKE_ACCESS_GRANT', 'Employee360AccessGrant', rows[0].id, 'MANAGE_ACCESS_GRANTS', null, 'ALLOW', 'Access grant revoked by enterprise owner');
      await audit?.(auth, 'REVOKE_EMPLOYEE_360_ACCESS_GRANT', 'Employee', rows[0].actorUserId, { grantId: rows[0].id });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employee360/access-events', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const actor = await actorRecord(auth);
      if (!actor.isOwner && auth.role !== UserRole.HR_MANAGER && auth.role !== UserRole.AUDITOR) {
        return void res.status(403).json({ error: 'Access-event audit records are restricted' });
      }
      const input = accessEventSchema.parse(req.query);
      const events = await prisma.$queryRawUnsafe<any[]>(
        `SELECT e.*,COALESCE(NULLIF(ac."displayName",''),au."email") AS "actorName",COALESCE(NULLIF(tc."displayName",''),tu."email") AS "targetName"
         FROM "Employee360AccessEvent" e
         LEFT JOIN "User" au ON au."id"=e."actorUserId"
         LEFT JOIN "EmployeePortalCredential" ac ON ac."userId"=au."id"
         LEFT JOIN "User" tu ON tu."id"=e."targetEmployeeId"
         LEFT JOIN "EmployeePortalCredential" tc ON tc."userId"=tu."id"
         WHERE e."organizationId"=$1
           AND ($2::text IS NULL OR e."targetEmployeeId"=$2)
           AND ($3::text IS NULL OR e."actorUserId"=$3)
           AND ($4::text IS NULL OR e."decision"=$4)
         ORDER BY e."createdAt" DESC LIMIT $5`,
        auth.organizationId,
        input.employeeId || null,
        input.actorId || null,
        input.decision || null,
        input.limit,
      );
      res.json({ data: events });
    } catch (error) { next(error); }
  });

  app.get('/api/employee/me/360', allUsersGate, async (_req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const target = await targetContext(auth, auth.userId);
      const employeeRows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT u."id",u."email",u."role"::text AS "role",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName",
                p."employeeNumber",p."personalEmail",p."phone",p."alternatePhone",p."department",p."jobTitle",COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus",
                p."hireDate",p."streetAddress",p."city",p."state",p."zipCode",p."emergencyContactName",p."emergencyContactPhone"
         FROM "User" u
         LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE u."id"=$1 AND u."organizationId"=$2 LIMIT 1`,
        auth.userId,
        auth.organizationId,
      );
      const documents = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","category","title","fileName","mimeType","fileSizeBytes","issueDate","expirationDate","notes","createdAt",COALESCE("sensitivity",'GENERAL') AS "sensitivity",
                CASE WHEN "expirationDate" IS NULL THEN NULL ELSE ("expirationDate"-CURRENT_DATE)::int END AS "daysUntilExpiration"
         FROM "EmployeeDocument" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"<>'ARCHIVED' AND COALESCE("employeeVisible",FALSE)=TRUE
         ORDER BY "expirationDate" ASC NULLS LAST,"createdAt" DESC`,
        auth.organizationId,
        auth.userId,
      ).catch(() => []);
      let education: any[] = [];
      if (await tableExists('EducationAssignment')) {
        education = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","courseCode","title","status","dueDate","assignedAt","startedAt","completedAt","expiresAt"
           FROM "EducationAssignment" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY COALESCE("dueDate","completedAt","assignedAt") DESC NULLS LAST`,
          auth.organizationId,
          auth.userId,
        ).catch(() => []);
      }
      await logAccess(auth, { ip: undefined, get: () => undefined } as unknown as Request, target.id, 'SELF_VIEW', 'Employee', target.id, 'VIEW_PROFILE', null, 'ALLOW', 'Employee viewed approved self-service records');
      res.json({ data: { employee: { ...employeeRows[0], displayName: target.displayName }, documents, education } });
    } catch (error) { next(error); }
  });

  app.use('/api/admin/employees', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const { policies } = await policiesFor(auth);
      const segments = req.path.split('/').filter(Boolean);
      const method = req.method.toUpperCase();

      if (segments.length === 0) {
        if (method !== 'GET') return void next();
        if (!policies.some((policy) => policy.capabilities.has('VIEW_DIRECTORY'))) {
          return void await deny(auth, req, null, 'VIEW_DIRECTORY', 'You do not have Employee 360 directory access');
        }
        const originalJson = res.json.bind(res);
        res.json = ((body: any) => {
          void transformDirectory(auth, policies, body)
            .then((transformed) => originalJson(transformed))
            .catch((error) => originalJson({ error: error instanceof Error ? error.message : 'Employee directory authorization failed' }));
          return res;
        }) as typeof res.json;
        return void next();
      }

      const employeeId = segments[0];
      const target = await targetContext(auth, employeeId);
      const isDetail = segments.length === 1;
      const isProfile = segments[1] === 'profile';
      const isRole = segments[1] === 'role';
      const isDocument = segments[1] === 'documents';
      const documentId = isDocument && segments.length >= 3 ? segments[2] : null;
      const isDownload = isDocument && segments[3] === 'download';
      const isEmail = segments[1] === 'email' || segments[1] === 'communications';
      const isAccess = segments[1] === 'access';
      const isStatus = segments[1] === 'status';
      const isEducation = segments[1] === 'education';

      if (method === 'GET' && isDetail) {
        await requireCapability(auth, req, policies, target, 'VIEW_PROFILE');
        const originalJson = res.json.bind(res);
        res.json = ((body: any) => {
          void transformDetail(auth, policies, target, body)
            .then((transformed) => originalJson(transformed))
            .catch((error) => originalJson({ error: error instanceof Error ? error.message : 'Employee folder authorization failed' }));
          return res;
        }) as typeof res.json;
        return void next();
      }

      if (isProfile && method === 'PATCH') {
        await requireCapability(auth, req, policies, target, 'MANAGE_PROFILE', { write: true });
        const sensitiveFields = ['personalEmail', 'phone', 'alternatePhone', 'streetAddress', 'city', 'state', 'zipCode', 'emergencyContactName', 'emergencyContactPhone'];
        if (sensitiveFields.some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field))) {
          await requireCapability(auth, req, policies, target, 'MANAGE_PRIVATE_PROFILE', { write: true });
        }
        if (['employmentStatus', 'hireDate', 'terminationDate', 'supervisorId'].some((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field))) {
          await requireCapability(auth, req, policies, target, 'MANAGE_EMPLOYMENT', { write: true });
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {
          await requireCapability(auth, req, policies, target, 'VIEW_HR_NOTES', { write: true });
        }
        return void next();
      }

      if (isRole && method === 'PATCH') {
        await requireCapability(auth, req, policies, target, 'MANAGE_SYSTEM_ROLE', { write: true });
        return void next();
      }

      if (isDocument) {
        if (method === 'POST' && !documentId) {
          const sensitivity = safeSensitivity(req.body?.sensitivity, req.body?.category);
          req.body = { ...(req.body || {}), sensitivity, employeeVisible: Boolean(req.body?.employeeVisible) };
          await requireCapability(auth, req, policies, target, 'MANAGE_DOCUMENTS', { write: true, resourceType: 'EmployeeDocument', sensitivity });
          return void next();
        }
        if (documentId) {
          const current = await documentRecord(auth, target.id, documentId);
          const requestedSensitivity = method === 'PATCH'
            ? safeSensitivity(req.body?.sensitivity || current.sensitivity, req.body?.category || current.category)
            : current.sensitivity;
          const capability: Capability = method === 'GET' ? 'VIEW_DOCUMENTS' : 'MANAGE_DOCUMENTS';
          await requireCapability(auth, req, policies, target, capability, {
            write: method !== 'GET', resourceType: 'EmployeeDocument', resourceId: documentId, sensitivity: requestedSensitivity,
          });
          if (method === 'PATCH') req.body = { ...(req.body || {}), sensitivity: requestedSensitivity };
          if (isDownload) await logAccess(auth, req, target.id, 'DOWNLOAD', 'EmployeeDocument', documentId, 'VIEW_DOCUMENTS', requestedSensitivity, 'ALLOW', 'Authorized document download');
          return void next();
        }
      }

      if (isEmail) {
        await requireCapability(auth, req, policies, target, 'SEND_COMMUNICATIONS', { write: true, resourceType: 'EmployeeCommunication' });
        return void next();
      }
      if (isAccess) {
        await requireCapability(auth, req, policies, target, 'MANAGE_ACCOUNT', { write: true, resourceType: 'EmployeePortalCredential' });
        return void next();
      }
      if (isStatus) {
        await requireCapability(auth, req, policies, target, 'MANAGE_EMPLOYMENT', { write: true });
        return void next();
      }
      if (isEducation) {
        await requireCapability(auth, req, policies, target, 'MANAGE_EDUCATION', { write: true, resourceType: 'EducationAssignment' });
        return void next();
      }

      return void next();
    } catch (error) { next(error); }
  });
}
