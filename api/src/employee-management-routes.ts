import type { Express, RequestHandler, Response } from 'express';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
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

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const PORTAL_URL = 'https://www.sulandrahealth.com/employee-portal.html';
const ROLE_VALUES = new Set(Object.values(UserRole).map(String));

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  employeeNumber: z.string().trim().max(80).optional().nullable(),
  personalEmail: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  alternatePhone: z.string().trim().max(60).optional().nullable(),
  department: z.string().trim().max(160).optional().nullable(),
  jobTitle: z.string().trim().max(160).optional().nullable(),
  employmentStatus: z.enum(['ACTIVE', 'LEAVE', 'SUSPENDED', 'TERMINATED']).default('ACTIVE'),
  hireDate: z.coerce.date().optional().nullable(),
  terminationDate: z.coerce.date().optional().nullable(),
  supervisorId: z.string().trim().max(200).optional().nullable(),
  streetAddress: z.string().trim().max(240).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(40).optional().nullable(),
  zipCode: z.string().trim().max(20).optional().nullable(),
  emergencyContactName: z.string().trim().max(160).optional().nullable(),
  emergencyContactPhone: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(20_000).optional().nullable(),
});

const documentSchema = z.object({
  category: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(240),
  fileName: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().min(1).max(180),
  contentBase64: z.string().min(1).max(25_000_000),
  issueDate: z.coerce.date().optional().nullable(),
  expirationDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(4_000).optional().default(''),
});

const documentPatchSchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  issueDate: z.coerce.date().optional().nullable(),
  expirationDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(4_000).optional(),
});

const emailSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(50_000),
});

const resetSchema = z.object({ sendEmail: z.boolean().optional().default(true) });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'LEAVE', 'SUSPENDED', 'TERMINATED']) });
const roleSchema = z.object({ role: z.string().trim().refine((value) => ROLE_VALUES.has(value), 'Invalid employee role') });
const educationSchema = z.object({
  courseCode: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(300),
  dueDate: z.coerce.date().optional().nullable(),
  reason: z.string().trim().max(1_000).optional().default('Assigned from Employee 360'),
});

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const hashPortalPassword = (password: string) => {
  const salt = randomBytes(24);
  const derived = scryptSync(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1_024 * 1_024,
  });
  return ['scrypt', 16_384, 8, 1, salt.toString('base64url'), derived.toString('base64url')].join('$');
};

const temporaryPassword = () => `${randomBytes(9).toString('base64url')}Aa1!`;
const cleanFileName = (value: string) => value.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'employee-document';
const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const isOwnerEmail = (value: unknown) => normalizeEmail(value) === OWNER_EMAIL;
const displayNameFor = (row: any) => isOwnerEmail(row?.email)
  ? OWNER_NAME
  : String(row?.displayName || row?.profileDisplayName || row?.email || 'Employee');

export function registerEmployeeManagementRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  let readyPromise: Promise<void> | null = null;
  const ready = () => readyPromise ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeManagementProfile" (
      "userId" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "displayName" TEXT,
      "employeeNumber" TEXT,
      "personalEmail" TEXT,
      "phone" TEXT,
      "alternatePhone" TEXT,
      "department" TEXT,
      "jobTitle" TEXT,
      "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
      "hireDate" DATE,
      "terminationDate" DATE,
      "supervisorId" TEXT,
      "streetAddress" TEXT,
      "city" TEXT,
      "state" TEXT,
      "zipCode" TEXT,
      "emergencyContactName" TEXT,
      "emergencyContactPhone" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeManagementProfile_org_idx" ON "EmployeeManagementProfile"("organizationId")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeDocument" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "mimeType" TEXT NOT NULL,
      "contentBase64" TEXT NOT NULL,
      "fileSizeBytes" INTEGER NOT NULL,
      "issueDate" DATE,
      "expirationDate" DATE,
      "notes" TEXT NOT NULL DEFAULT '',
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "uploadedById" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeDocument_employee_idx" ON "EmployeeDocument"("organizationId","employeeId","status")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeDocument_expiration_idx" ON "EmployeeDocument"("organizationId","expirationDate")`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeCommunication" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "channel" TEXT NOT NULL DEFAULT 'EMAIL',
      "kind" TEXT NOT NULL DEFAULT 'CUSTOM',
      "recipient" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "providerMessageId" TEXT,
      "errorMessage" TEXT,
      "sentById" TEXT NOT NULL,
      "sentAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeCommunication_employee_idx" ON "EmployeeCommunication"("organizationId","employeeId","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeAccountAction" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "actorId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeAccountAction_employee_idx" ON "EmployeeAccountAction"("organizationId","employeeId","createdAt" DESC)`);
  })().catch((error) => {
    readyPromise = null;
    throw error;
  });

  const manager = requireRoles(
    UserRole.ADMINISTRATOR,
    UserRole.PROGRAM_MANAGER,
    UserRole.HR_MANAGER,
    UserRole.CEO,
    UserRole.COO,
  );

  const tableExists = async (name: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
      `SELECT to_regclass($1::text)::text AS "name"`,
      `public."${name}"`,
    );
    return Boolean(rows[0]?.name);
  };

  const actorIdentity = async (auth: AuthContext) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string | null }>>(
      `SELECT "email" FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,
      auth.userId,
      auth.organizationId,
    );
    const email = normalizeEmail(rows[0]?.email || auth.email);
    return { email, isOwner: email === OWNER_EMAIL };
  };

  const targetUser = async (auth: AuthContext, employeeId: string) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT u."id",u."organizationId",u."email",u."role"::text AS "role",
              COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName",
              c."username",c."mustChangePassword",c."failedLoginAttempts",c."lockedUntil",c."lastSignedInAt",
              p."employeeNumber",p."personalEmail",p."phone",p."alternatePhone",p."department",p."jobTitle",
              COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus",p."hireDate",p."terminationDate",
              p."supervisorId",p."streetAddress",p."city",p."state",p."zipCode",
              p."emergencyContactName",p."emergencyContactPhone",p."notes"
       FROM "User" u
       LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
       WHERE u."id"=$1 AND u."organizationId"=$2 LIMIT 1`,
      employeeId,
      auth.organizationId,
    );
    const row = rows[0];
    if (!row) throw Object.assign(new Error('Employee was not found'), { status: 404 });
    row.displayName = displayNameFor(row);
    row.isOwner = isOwnerEmail(row.email);
    return row;
  };

  const ensureTargetManageable = async (auth: AuthContext, employeeId: string, allowOwnerSelf = false) => {
    const [actor, target] = await Promise.all([actorIdentity(auth), targetUser(auth, employeeId)]);
    if (target.isOwner && !(allowOwnerSelf && actor.isOwner && auth.userId === employeeId)) {
      throw Object.assign(new Error('The enterprise owner account cannot be managed by another user'), { status: 403 });
    }
    return { actor, target };
  };

  const accountAction = async (auth: AuthContext, employeeId: string, action: string, details: object = {}) => {
    await ready();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeeAccountAction" ("id","organizationId","employeeId","action","details","actorId")
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      randomUUID(),
      auth.organizationId,
      employeeId,
      action,
      JSON.stringify(details),
      auth.userId,
    );
    await audit?.(auth, action, 'Employee', employeeId, details);
  };

  const mailTransport = () => {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    const port = Number(process.env.SMTP_PORT || 587);
    if (!host || !user || !pass) {
      throw Object.assign(new Error('Employee email delivery is not configured'), { status: 503 });
    }
    return {
      user,
      transport: createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { minVersion: 'TLSv1.2' },
      }),
    };
  };

  const sendAndLog = async (
    auth: AuthContext,
    employee: any,
    kind: string,
    subject: string,
    body: string,
  ) => {
    await ready();
    const recipient = normalizeEmail(employee.email);
    if (!recipient) throw Object.assign(new Error('The employee does not have an email address'), { status: 409 });
    const id = randomUUID();
    try {
      const { user, transport } = mailTransport();
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#182533">
        <p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>
        <p style="margin-top:28px"><strong><em style="color:#159bd3">Sulandra Health Human Resources Department</em></strong></p>
        <p style="font-size:12px;color:#637080">This message was sent from the Sulandra Health employee management system. Please do not reply to automated access messages.</p>
      </div>`;
      const result = await transport.sendMail({
        from: `"Sulandra Health Human Resources Department" <${user}>`,
        to: recipient,
        subject,
        text: `${body}\n\nSulandra Health Human Resources Department`,
        html,
      });
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeCommunication" ("id","organizationId","employeeId","kind","recipient","subject","body","status","providerMessageId","sentById","sentAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'SENT',$8,$9,NOW())`,
        id, auth.organizationId, employee.id, kind, recipient, subject, body, String(result.messageId || ''), auth.userId,
      );
      await accountAction(auth, employee.id, 'SEND_EMPLOYEE_EMAIL', { communicationId: id, kind, subject, recipient });
      return { id, status: 'SENT', recipient, providerMessageId: result.messageId || null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email delivery failed';
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeCommunication" ("id","organizationId","employeeId","kind","recipient","subject","body","status","errorMessage","sentById")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'FAILED',$8,$9)`,
        id, auth.organizationId, employee.id, kind, recipient, subject, body, message, auth.userId,
      ).catch(() => undefined);
      throw Object.assign(new Error(message), { status: 502 });
    }
  };

  const resetPortalAccess = async (auth: AuthContext, employee: any, sendEmail: boolean, kind: string) => {
    const password = temporaryPassword();
    const hash = hashPortalPassword(password);
    const username = String(employee.username || employee.email || employee.id);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeePortalCredential"
         ("userId","username","passwordHash","displayName","mustChangePassword","failedLoginAttempts","lockedUntil","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,TRUE,0,NULL,NOW(),NOW())
       ON CONFLICT ("userId") DO UPDATE SET
         "username"=COALESCE(NULLIF("EmployeePortalCredential"."username",''),EXCLUDED."username"),
         "passwordHash"=EXCLUDED."passwordHash",
         "displayName"=EXCLUDED."displayName",
         "mustChangePassword"=TRUE,
         "failedLoginAttempts"=0,
         "lockedUntil"=NULL,
         "updatedAt"=NOW()`,
      employee.id,
      username,
      hash,
      displayNameFor(employee),
    );
    await accountAction(auth, employee.id, kind, { username, emailSent: sendEmail });
    if (sendEmail) {
      const body = `Hello ${displayNameFor(employee)},\n\nYour Sulandra Health Employee Portal access has been updated.\n\nPortal: ${PORTAL_URL}\nUsername: ${username}\nTemporary password: ${password}\n\nYou will be required to create a new password when you sign in.`;
      await sendAndLog(auth, employee, kind, 'Sulandra Health Employee Portal Access', body);
    }
    return { username, temporaryPassword: password, mustChangePassword: true, emailSent: sendEmail };
  };

  app.get('/api/admin/employees', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT u."id",u."email",u."role"::text AS "role",
                COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName",
                c."username",c."mustChangePassword",c."failedLoginAttempts",c."lockedUntil",c."lastSignedInAt",
                COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus",p."department",p."jobTitle",p."employeeNumber",p."hireDate",
                (SELECT COUNT(*)::int FROM "EmployeeDocument" d WHERE d."organizationId"=u."organizationId" AND d."employeeId"=u."id" AND d."status"='ACTIVE') AS "documentCount",
                (SELECT COUNT(*)::int FROM "EmployeeDocument" d WHERE d."organizationId"=u."organizationId" AND d."employeeId"=u."id" AND d."status"='ACTIVE' AND d."expirationDate"<CURRENT_DATE) AS "expiredDocumentCount",
                (SELECT COUNT(*)::int FROM "EmployeeDocument" d WHERE d."organizationId"=u."organizationId" AND d."employeeId"=u."id" AND d."status"='ACTIVE' AND d."expirationDate">=CURRENT_DATE AND d."expirationDate"<=CURRENT_DATE+60) AS "expiringDocumentCount"
         FROM "User" u
         LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
         LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
         WHERE u."organizationId"=$1 AND LOWER(COALESCE(u."email",'')) NOT LIKE '%@demo.spire.local'
         ORDER BY CASE WHEN LOWER(COALESCE(u."email",''))=LOWER($2) THEN 0 ELSE 1 END,
                  COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email")`,
        auth.organizationId,
        OWNER_EMAIL,
      );
      const query = String(req.query.q || '').trim().toLowerCase();
      const data = rows
        .map((row) => ({ ...row, displayName: displayNameFor(row), isOwner: isOwnerEmail(row.email) }))
        .filter((row) => !query || [row.displayName, row.email, row.role, row.department, row.jobTitle, row.employeeNumber]
          .some((value) => String(value || '').toLowerCase().includes(query)));
      res.json({ data });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employees/:id', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const employee = await targetUser(auth, req.params.id);
      const [documents, communications, actions] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","category","title","fileName","mimeType","fileSizeBytes","issueDate","expirationDate","notes","status","createdAt","updatedAt",
                  CASE WHEN "expirationDate" IS NULL THEN NULL ELSE ("expirationDate"-CURRENT_DATE)::int END AS "daysUntilExpiration"
           FROM "EmployeeDocument" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"<>'ARCHIVED' ORDER BY "expirationDate" ASC NULLS LAST,"createdAt" DESC`,
          auth.organizationId, employee.id,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","kind","recipient","subject","body","status","providerMessageId","errorMessage","sentAt","createdAt"
           FROM "EmployeeCommunication" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC LIMIT 250`,
          auth.organizationId, employee.id,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","action","details","actorId","createdAt" FROM "EmployeeAccountAction"
           WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC LIMIT 250`,
          auth.organizationId, employee.id,
        ),
      ]);

      let homes: any[] = [];
      let education: any[] = [];
      let shifts: any[] = [];
      let timecards: any[] = [];
      let requests: any[] = [];
      if (await tableExists('TimeAttendanceLocationAssignment')) {
        homes = await prisma.$queryRawUnsafe<any[]>(
          `SELECT l."id",l."name",l."address",x."isManager"
           FROM "TimeAttendanceLocationAssignment" x JOIN "TimeAttendanceLocation" l ON l."id"=x."locationId"
           WHERE x."organizationId"=$1 AND x."employeeId"=$2 AND x."active"=TRUE AND l."active"=TRUE ORDER BY l."name"`,
          auth.organizationId, employee.id,
        ).catch(() => []);
      }
      if (await tableExists('EducationAssignment')) {
        education = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","courseCode","title","packageCode","status","dueDate","assignedAt","startedAt","completedAt","expiresAt","reason"
           FROM "EducationAssignment" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY COALESCE("dueDate","completedAt","assignedAt") DESC NULLS LAST LIMIT 300`,
          auth.organizationId, employee.id,
        ).catch(() => []);
      }
      if (await tableExists('TimeAttendanceShift')) {
        shifts = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","startTime","endTime","code","location","status","payCode"
           FROM "TimeAttendanceShift" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "endTime">=NOW()-INTERVAL '14 days' ORDER BY "startTime" LIMIT 200`,
          auth.organizationId, employee.id,
        ).catch(() => []);
      }
      if (await tableExists('TimeAttendanceClockEntry')) {
        timecards = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","clockIn","clockOut","source","status","notes",
                  ROUND((EXTRACT(EPOCH FROM (COALESCE("clockOut",NOW())-"clockIn"))/3600)::numeric,2)::float8 AS "hours"
           FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "clockIn" DESC LIMIT 100`,
          auth.organizationId, employee.id,
        ).catch(() => []);
      }
      if (await tableExists('TimeAttendanceRequest')) {
        requests = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","type","startAt","endAt","reason","status","reviewNotes","createdAt"
           FROM "TimeAttendanceRequest" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC LIMIT 100`,
          auth.organizationId, employee.id,
        ).catch(() => []);
      }

      const actor = await actorIdentity(auth);
      const diagnostics = {
        portalCredentialExists: Boolean(employee.username),
        username: employee.username || null,
        mustChangePassword: Boolean(employee.mustChangePassword),
        failedLoginAttempts: Number(employee.failedLoginAttempts || 0),
        lockedUntil: employee.lockedUntil || null,
        lastSignedInAt: employee.lastSignedInAt || null,
        assignedHomeCount: homes.length,
        upcomingShiftCount: shifts.filter((shift) => new Date(shift.startTime).getTime() > Date.now()).length,
        pendingTimeRequestCount: requests.filter((request) => request.status === 'PENDING').length,
        assignedEducationCount: education.filter((item) => ['ASSIGNED', 'IN_PROGRESS'].includes(String(item.status))).length,
        overdueEducationCount: education.filter((item) => item.dueDate && new Date(item.dueDate).getTime() < Date.now() && item.status !== 'COMPLETED').length,
        expiredDocumentCount: documents.filter((document) => Number(document.daysUntilExpiration) < 0).length,
        expiringDocumentCount: documents.filter((document) => Number(document.daysUntilExpiration) >= 0 && Number(document.daysUntilExpiration) <= 60).length,
      };
      res.json({
        data: {
          employee,
          documents,
          communications,
          actions,
          homes,
          education,
          shifts,
          timecards,
          requests,
          diagnostics,
          permissions: {
            actorIsOwner: actor.isOwner,
            targetIsOwner: employee.isOwner,
            canManageIdentity: !employee.isOwner || actor.isOwner,
            canChangeRole: actor.isOwner && !employee.isOwner,
            canResetAccess: !employee.isOwner,
          },
        },
      });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employees/:id/profile', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const { target } = await ensureTargetManageable(auth, req.params.id, true);
      const input = profileSchema.parse(req.body);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeManagementProfile"
          ("userId","organizationId","displayName","employeeNumber","personalEmail","phone","alternatePhone","department","jobTitle","employmentStatus","hireDate","terminationDate","supervisorId","streetAddress","city","state","zipCode","emergencyContactName","emergencyContactPhone","notes","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),NOW())
         ON CONFLICT ("userId") DO UPDATE SET
          "displayName"=EXCLUDED."displayName","employeeNumber"=EXCLUDED."employeeNumber","personalEmail"=EXCLUDED."personalEmail",
          "phone"=EXCLUDED."phone","alternatePhone"=EXCLUDED."alternatePhone","department"=EXCLUDED."department","jobTitle"=EXCLUDED."jobTitle",
          "employmentStatus"=EXCLUDED."employmentStatus","hireDate"=EXCLUDED."hireDate","terminationDate"=EXCLUDED."terminationDate",
          "supervisorId"=EXCLUDED."supervisorId","streetAddress"=EXCLUDED."streetAddress","city"=EXCLUDED."city","state"=EXCLUDED."state","zipCode"=EXCLUDED."zipCode",
          "emergencyContactName"=EXCLUDED."emergencyContactName","emergencyContactPhone"=EXCLUDED."emergencyContactPhone","notes"=EXCLUDED."notes","updatedAt"=NOW()`,
        target.id, auth.organizationId, input.displayName, input.employeeNumber ?? null, input.personalEmail ?? null,
        input.phone ?? null, input.alternatePhone ?? null, input.department ?? null, input.jobTitle ?? null,
        input.employmentStatus, input.hireDate ?? null, input.terminationDate ?? null, input.supervisorId ?? null,
        input.streetAddress ?? null, input.city ?? null, input.state ?? null, input.zipCode ?? null,
        input.emergencyContactName ?? null, input.emergencyContactPhone ?? null, input.notes ?? null,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeePortalCredential" SET "displayName"=$1,"updatedAt"=NOW() WHERE "userId"=$2`,
        target.isOwner ? OWNER_NAME : input.displayName,
        target.id,
      ).catch(() => undefined);
      await accountAction(auth, target.id, 'UPDATE_EMPLOYEE_PROFILE', { displayName: input.displayName, employmentStatus: input.employmentStatus });
      res.json({ data: await targetUser(auth, target.id) });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employees/:id/role', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const actor = await actorIdentity(auth);
      if (!actor.isOwner) return void res.status(403).json({ error: 'Only the enterprise owner may assign system roles' });
      const target = await targetUser(auth, req.params.id);
      if (target.isOwner) return void res.status(409).json({ error: 'The enterprise owner role is immutable' });
      const input = roleSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "User" SET "role"=$1::"UserRole" WHERE "id"=$2 AND "organizationId"=$3 RETURNING "id","email","role"::text AS "role"`,
        input.role, target.id, auth.organizationId,
      );
      await accountAction(auth, target.id, 'CHANGE_EMPLOYEE_ROLE', { previousRole: target.role, role: input.role });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:id/documents', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const { target } = await ensureTargetManageable(auth, req.params.id, true);
      const input = documentSchema.parse(req.body);
      const content = input.contentBase64.includes(',') ? input.contentBase64.split(',').pop() || '' : input.contentBase64;
      const buffer = Buffer.from(content, 'base64');
      if (!buffer.length) return void res.status(400).json({ error: 'The selected file is empty or invalid' });
      if (buffer.length > MAX_DOCUMENT_BYTES) return void res.status(413).json({ error: 'Employee documents are limited to 15 MB each' });
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeDocument"
          ("id","organizationId","employeeId","category","title","fileName","mimeType","contentBase64","fileSizeBytes","issueDate","expirationDate","notes","uploadedById")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        id, auth.organizationId, target.id, input.category, input.title, cleanFileName(input.fileName), input.mimeType,
        content, buffer.length, input.issueDate ?? null, input.expirationDate ?? null, input.notes, auth.userId,
      );
      await accountAction(auth, target.id, 'UPLOAD_EMPLOYEE_DOCUMENT', { documentId: id, category: input.category, title: input.title, expirationDate: input.expirationDate ?? null });
      res.status(201).json({ data: { id, fileName: cleanFileName(input.fileName), fileSizeBytes: buffer.length } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employees/:employeeId/documents/:documentId', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await ensureTargetManageable(auth, req.params.employeeId, true);
      const input = documentPatchSchema.parse(req.body);
      const current = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "EmployeeDocument" WHERE "id"=$1 AND "employeeId"=$2 AND "organizationId"=$3 LIMIT 1`,
        req.params.documentId, req.params.employeeId, auth.organizationId,
      );
      if (!current[0]) return void res.status(404).json({ error: 'Document was not found' });
      const merged = { ...current[0], ...input };
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "EmployeeDocument" SET "category"=$1,"title"=$2,"issueDate"=$3,"expirationDate"=$4,"notes"=$5,"updatedAt"=NOW()
         WHERE "id"=$6 AND "employeeId"=$7 AND "organizationId"=$8 RETURNING "id","category","title","issueDate","expirationDate","notes","updatedAt"`,
        merged.category, merged.title, merged.issueDate ?? null, merged.expirationDate ?? null, merged.notes ?? '',
        req.params.documentId, req.params.employeeId, auth.organizationId,
      );
      await accountAction(auth, req.params.employeeId, 'UPDATE_EMPLOYEE_DOCUMENT', { documentId: req.params.documentId });
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employees/:employeeId/documents/:documentId/download', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "fileName","mimeType","contentBase64" FROM "EmployeeDocument"
         WHERE "id"=$1 AND "employeeId"=$2 AND "organizationId"=$3 AND "status"<>'ARCHIVED' LIMIT 1`,
        req.params.documentId, req.params.employeeId, auth.organizationId,
      );
      const document = rows[0];
      if (!document) return void res.status(404).json({ error: 'Document was not found' });
      const buffer = Buffer.from(String(document.contentBase64), 'base64');
      res.setHeader('Content-Type', String(document.mimeType || 'application/octet-stream'));
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFileName(String(document.fileName))}"`);
      res.send(buffer);
    } catch (error) { next(error); }
  });

  app.delete('/api/admin/employees/:employeeId/documents/:documentId', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      await ensureTargetManageable(auth, req.params.employeeId, true);
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeDocument" SET "status"='ARCHIVED',"updatedAt"=NOW() WHERE "id"=$1 AND "employeeId"=$2 AND "organizationId"=$3`,
        req.params.documentId, req.params.employeeId, auth.organizationId,
      );
      await accountAction(auth, req.params.employeeId, 'ARCHIVE_EMPLOYEE_DOCUMENT', { documentId: req.params.documentId });
      res.status(204).end();
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:id/email', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const employee = await targetUser(auth, req.params.id);
      const input = emailSchema.parse(req.body);
      res.status(201).json({ data: await sendAndLog(auth, employee, 'CUSTOM', input.subject, input.body) });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:id/communications/:communicationId/resend', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const employee = await targetUser(auth, req.params.id);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "subject","body","kind" FROM "EmployeeCommunication" WHERE "id"=$1 AND "employeeId"=$2 AND "organizationId"=$3 LIMIT 1`,
        req.params.communicationId, employee.id, auth.organizationId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Email record was not found' });
      res.status(201).json({ data: await sendAndLog(auth, employee, `RESEND_${rows[0].kind || 'EMAIL'}`, rows[0].subject, rows[0].body) });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:id/access/reset', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const { target } = await ensureTargetManageable(auth, req.params.id);
      const input = resetSchema.parse(req.body);
      res.json({ data: await resetPortalAccess(auth, target, input.sendEmail, 'FORCE_PASSWORD_RESET') });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:id/access/resend', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const { target } = await ensureTargetManageable(auth, req.params.id);
      res.json({ data: await resetPortalAccess(auth, target, true, 'RESEND_PORTAL_ACCESS') });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:id/access/unlock', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const { target } = await ensureTargetManageable(auth, req.params.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeePortalCredential" SET "failedLoginAttempts"=0,"lockedUntil"=NULL,"updatedAt"=NOW() WHERE "userId"=$1`,
        target.id,
      );
      await accountAction(auth, target.id, 'UNLOCK_EMPLOYEE_PORTAL_ACCOUNT');
      res.json({ data: { unlocked: true } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:id/access/sync', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const { target } = await ensureTargetManageable(auth, req.params.id, true);
      const name = displayNameFor(target);
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeePortalCredential" SET "displayName"=$1,"updatedAt"=NOW() WHERE "userId"=$2`,
        name, target.id,
      );
      await accountAction(auth, target.id, 'SYNC_EMPLOYEE_IDENTITY', { displayName: name });
      res.json({ data: { synced: true, displayName: name } });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employees/:id/status', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const { target } = await ensureTargetManageable(auth, req.params.id);
      const input = statusSchema.parse(req.body);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeManagementProfile" ("userId","organizationId","displayName","employmentStatus","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,NOW(),NOW())
         ON CONFLICT ("userId") DO UPDATE SET "employmentStatus"=EXCLUDED."employmentStatus","updatedAt"=NOW()`,
        target.id, auth.organizationId, displayNameFor(target), input.status,
      );
      if (input.status === 'ACTIVE') {
        await prisma.$executeRawUnsafe(`UPDATE "EmployeePortalCredential" SET "lockedUntil"=NULL,"failedLoginAttempts"=0,"updatedAt"=NOW() WHERE "userId"=$1`, target.id);
      } else if (input.status === 'SUSPENDED' || input.status === 'TERMINATED') {
        await prisma.$executeRawUnsafe(`UPDATE "EmployeePortalCredential" SET "lockedUntil"='9999-12-31'::timestamptz,"updatedAt"=NOW() WHERE "userId"=$1`, target.id);
      }
      await accountAction(auth, target.id, 'CHANGE_EMPLOYMENT_STATUS', { status: input.status });
      res.json({ data: { employmentStatus: input.status } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employees/:id/education', manager, async (req, res, next) => {
    try {
      await ready();
      const auth = authOf(res);
      const employee = await targetUser(auth, req.params.id);
      const input = educationSchema.parse(req.body);
      if (!(await tableExists('EducationAssignment'))) {
        return void res.status(503).json({ error: 'The Education service is not initialized yet' });
      }
      const existing = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "EducationAssignment" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "courseCode"=$3 AND "status" IN ('ASSIGNED','IN_PROGRESS') LIMIT 1`,
        auth.organizationId, employee.id, input.courseCode,
      );
      if (existing[0]) return void res.status(409).json({ error: 'This course is already assigned to the employee' });
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EducationAssignment"
          ("id","organizationId","employeeId","courseCode","title","packageCode","status","dueDate","reason","assignedById","assignedAt","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,'CUSTOM','ASSIGNED',$6,$7,$8,NOW(),NOW(),NOW())`,
        id, auth.organizationId, employee.id, input.courseCode, input.title, input.dueDate ?? null, input.reason, auth.userId,
      );
      await accountAction(auth, employee.id, 'ASSIGN_EMPLOYEE_EDUCATION', { assignmentId: id, courseCode: input.courseCode, dueDate: input.dueDate ?? null });
      res.status(201).json({ data: { id, status: 'ASSIGNED' } });
    } catch (error) { next(error); }
  });
}
