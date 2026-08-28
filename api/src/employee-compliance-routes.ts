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

type RequirementType = 'DOCUMENT' | 'EDUCATION' | 'ATTESTATION' | 'MANUAL';
type ComplianceStatus = 'NOT_STARTED' | 'MISSING' | 'IN_PROGRESS' | 'DUE_SOON' | 'OVERDUE' | 'COMPLIANT' | 'EXEMPT' | 'NOT_APPLICABLE';
type RecipientType = 'EMPLOYEE' | 'SUPERVISOR' | 'LOCATION_MANAGER' | 'HR';
type RunTrigger = 'MANUAL' | 'SCHEDULED' | 'STARTUP';

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
const PORTAL_URL = 'https://www.sulandrahealth.com/employee-portal.html#myCompliance';
const EDUCATION_URL = 'https://www.sulandrahealth.com/education-portal.html';
const DAY_MS = 86_400_000;

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

const requirementManagers = new Set<UserRole>([UserRole.ADMINISTRATOR, UserRole.HR_MANAGER]);
const allUsersGateRoles = Object.values(UserRole) as UserRole[];

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const dateOnly = (value: Date | string | null | undefined) => value ? new Date(value).toISOString().slice(0, 10) : null;
const startOfToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const daysUntil = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const target = new Date(`${dateOnly(value)}T00:00:00.000Z`);
  return Math.round((target.getTime() - startOfToday().getTime()) / DAY_MS);
};
const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const campaignSchema = z.object({
  year: z.number().int().min(2024).max(2100),
  activate: z.literal(true),
  senderName: z.string().trim().min(2).max(160).optional(),
});

const attestSchema = z.object({
  typedName: z.string().trim().min(2).max(200),
  accepted: z.literal(true),
});

const FALL_REQUIREMENT_CODE = 'WORKPLACE-FALL-PREVENTION-ANNUAL';
const FALL_TITLE = 'Workplace Fall Prevention Training';
const FALL_ATTEST = 'I reviewed the workplace safety Fall Prevention training material and will follow applicable workplace safety practices.';

export function registerEmployeeComplianceRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  const managerGate = requireRoles(...managerRoles);
  const allUsersGate = requireRoles(...allUsersGateRoles);

  const ensureSchema = async () => {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeComplianceCampaign" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "campaignType" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "dueDate" DATE NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT FALSE,
      "activatedById" TEXT,
      "activatedAt" TIMESTAMPTZ,
      "senderName" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE("organizationId","campaignType","year")
    )`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeComplianceAssignment" ADD COLUMN IF NOT EXISTS "campaignType" TEXT`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeComplianceAssignment" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMPTZ`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeComplianceAssignment" ADD COLUMN IF NOT EXISTS "reminderEscalationStatus" TEXT NOT NULL DEFAULT 'NONE'`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`ALTER TABLE "EmployeeComplianceAssignment" ADD COLUMN IF NOT EXISTS "auditTrail" JSONB NOT NULL DEFAULT '[]'::jsonb`).catch(() => undefined);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeComplianceAssignmentLink" (
      "id" TEXT PRIMARY KEY,
      "organizationId" TEXT NOT NULL,
      "assignmentId" TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ,
      "usedAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE("organizationId","token")
    )`);
  };

  const requireRequirementManager = async (auth: AuthContext) => {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "email" FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`, auth.userId, auth.organizationId);
    const email = normalizeEmail(rows[0]?.email || auth.email);
    if (!requirementManagers.has(auth.role) && email !== OWNER_EMAIL) throw Object.assign(new Error('Only HR/Administrator may activate this campaign'), { status: 403 });
  };

  const ensureFallRequirement = async (organizationId: string, actorId: string) => {
    const existing = await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "EmployeeComplianceRequirement" WHERE "organizationId"=$1 AND LOWER("code")=LOWER($2) LIMIT 1`, organizationId, FALL_REQUIREMENT_CODE);
    if (existing[0]) return existing[0].id as string;
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeComplianceRequirement" (
      "id","organizationId","code","title","description","requirementType","attestationText","requiredForAll","employmentStatuses","dueDaysAfterHire","warningWindowDays","reminderDays","managerEscalationDays","hrEscalationDays","notifyEmployee","notifySupervisor","notifyLocationManager","notifyHR","autoAssignEducation","allowEmployeeUpload","allowEmployeeAttestation","active","createdById","updatedById"
    ) VALUES (
      $1,$2,$3,$4,$5,'ATTESTATION',$6,TRUE,'["ACTIVE","LEAVE","SUSPENDED"]'::jsonb,0,30,'[30,14,7,1,0,-1,-7,-14]'::jsonb,'[-1,-7,-14]'::jsonb,'[-1,-7,-14]'::jsonb,TRUE,TRUE,TRUE,TRUE,FALSE,FALSE,TRUE,TRUE,$7,$7
    )`, id, organizationId, FALL_REQUIREMENT_CODE, FALL_TITLE, 'Approved general workplace safety training focused on preventing workplace slips, trips, and falls. Excludes patient/clinical fall-prevention content.', FALL_ATTEST, actorId);
    return id;
  };

  app.post('/api/admin/compliance/campaigns/fall-prevention/activate', managerGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      await requireRequirementManager(auth);
      const input = campaignSchema.parse(req.body);
      const dueDate = `${input.year}-09-30`;
      const requirementId = await ensureFallRequirement(auth.organizationId, auth.userId);
      const campaignId = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeComplianceCampaign" ("id","organizationId","campaignType","year","dueDate","active","activatedById","activatedAt","senderName")
        VALUES ($1,$2,'WORKPLACE_FALL_PREVENTION',$3,$4,TRUE,$5,NOW(),$6)
        ON CONFLICT ("organizationId","campaignType","year") DO UPDATE SET "dueDate"=EXCLUDED."dueDate","active"=TRUE,"activatedById"=EXCLUDED."activatedById","activatedAt"=NOW(),"senderName"=EXCLUDED."senderName","updatedAt"=NOW()`,
      campaignId, auth.organizationId, input.year, dueDate, auth.userId, input.senderName || 'Sulandra Health Human Resources Department');

      const employees = await prisma.$queryRawUnsafe<any[]>(`SELECT "id","email" FROM "User" WHERE "organizationId"=$1`, auth.organizationId);
      for (const employee of employees) {
        const assignmentId = randomUUID();
        await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeComplianceAssignment" ("id","organizationId","requirementId","employeeId","status","source","dueDate","campaignType","assignedAt","auditTrail")
          VALUES ($1,$2,$3,$4,'NOT_STARTED','AUTOMATIC',$5,'WORKPLACE_FALL_PREVENTION',NOW(),'[]'::jsonb)
          ON CONFLICT ("organizationId","requirementId","employeeId") DO UPDATE SET "dueDate"=EXCLUDED."dueDate","campaignType"='WORKPLACE_FALL_PREVENTION',"assignedAt"=COALESCE("EmployeeComplianceAssignment"."assignedAt",NOW()),"updatedAt"=NOW()`,
        assignmentId, auth.organizationId, requirementId, employee.id, dueDate);

        const row = await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "EmployeeComplianceAssignment" WHERE "organizationId"=$1 AND "requirementId"=$2 AND "employeeId"=$3 LIMIT 1`, auth.organizationId, requirementId, employee.id);
        const token = randomUUID();
        await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeComplianceAssignmentLink" ("id","organizationId","assignmentId","employeeId","token","expiresAt") VALUES ($1,$2,$3,$4,$5,$6)`, randomUUID(), auth.organizationId, row[0].id, employee.id, token, `${input.year}-10-31T23:59:59.000Z`);

        if (employee.email) {
          const host = process.env.SMTP_HOST?.trim();
          const user = process.env.SMTP_USER?.trim();
          const pass = process.env.SMTP_PASS;
          const port = Number(process.env.SMTP_PORT || 587);
          if (host && user && pass) {
            const transport = createTransport({ host, port, secure: port === 465, auth: { user, pass }, tls: { minVersion: 'TLSv1.2' } });
            const link = `${PORTAL_URL}&complianceToken=${encodeURIComponent(token)}`;
            const subject = `Required: Workplace Fall Prevention Training (${input.year})`;
            const text = `You are assigned required workplace-safety Fall Prevention training due ${dueDate}.\n\nCorrective action may occur for non-completion. Consistent with HR/management policy, employees may be removed from the schedule if not completed by the deadline. No automatic schedule removal occurs in this system.\n\nComplete & Attest: ${link}`;
            const html = `<p>You are assigned required workplace-safety Fall Prevention training due <strong>${dueDate}</strong>.</p><p>Corrective action may occur for non-completion. Consistent with HR/management policy, employees may be removed from the schedule if not completed by the deadline. No automatic schedule removal occurs in this system.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 14px;background:#075493;color:#fff;text-decoration:none;border-radius:6px">Complete &amp; Attest</a></p>`;
            await transport.sendMail({ from: `"${input.senderName || 'Sulandra Health Human Resources Department'}" <${user}>`, to: employee.email, subject, text, html }).catch(() => undefined);
          }
        }
      }
      await audit?.(auth, 'ACTIVATE_FALL_PREVENTION_CAMPAIGN', 'EmployeeComplianceCampaign', undefined, { year: input.year, dueDate });
      res.status(201).json({ data: { year: input.year, dueDate, activated: true } });
    } catch (error) { next(error); }
  });

  app.get('/api/employee/me/compliance/fall-prevention', allUsersGate, async (_req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const row = (await prisma.$queryRawUnsafe<any[]>(`SELECT a."id",a."status",a."dueDate",a."assignedAt",r."attestationText" FROM "EmployeeComplianceAssignment" a JOIN "EmployeeComplianceRequirement" r ON r."id"=a."requirementId" WHERE a."organizationId"=$1 AND a."employeeId"=$2 AND a."campaignType"='WORKPLACE_FALL_PREVENTION' ORDER BY a."updatedAt" DESC LIMIT 1`, auth.organizationId, auth.userId))[0];
      if (!row) return void res.status(404).json({ error: 'No active fall prevention assignment found' });
      res.json({ data: { ...row, content: { title: FALL_TITLE, sections: ['Use approved ladders/step-stools and maintain three points of contact.', 'Keep walkways clear and promptly report/address spills, cords, and uneven flooring.', 'Wear appropriate slip-resistant footwear for assigned work environments.', 'Use handrails where provided and avoid rushing, especially during transfers between work areas.', 'Report hazards, near-misses, and incidents promptly to supervisor/management per policy.'], nonClinicalNotice: 'This training is workplace-safety-only and does not include patient or clinical fall-prevention guidance.' } } });
    } catch (error) { next(error); }
  });

  app.post('/api/employee/me/compliance/fall-prevention/:assignmentId/attest', allUsersGate, async (req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const input = attestSchema.parse(req.body);
      const assignment = (await prisma.$queryRawUnsafe<any[]>(`SELECT a.*,r."attestationText",r."id" AS "requirementId" FROM "EmployeeComplianceAssignment" a JOIN "EmployeeComplianceRequirement" r ON r."id"=a."requirementId" WHERE a."organizationId"=$1 AND a."id"=$2 LIMIT 1`, auth.organizationId, req.params.assignmentId))[0];
      if (!assignment || assignment.employeeId !== auth.userId || assignment.campaignType !== 'WORKPLACE_FALL_PREVENTION') return void res.status(403).json({ error: 'Not authorized for this assignment' });
      const attestationId = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeComplianceAttestation" ("id","organizationId","assignmentId","employeeId","requirementId","statement","typedName","ipAddress","userAgent") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, attestationId, auth.organizationId, assignment.id, auth.userId, assignment.requirementId, assignment.attestationText || FALL_ATTEST, input.typedName, auth.ipAddress || req.ip || null, auth.userAgent || req.get('user-agent') || null);
      await prisma.$executeRawUnsafe(`UPDATE "EmployeeComplianceAssignment" SET "status"='COMPLIANT',"completedAt"=NOW(),"evidenceType"='ATTESTATION',"evidenceId"=$1,"evidenceSummary"=$2,"updatedAt"=NOW() WHERE "id"=$3 AND "organizationId"=$4`, attestationId, `Attested by ${input.typedName}`, assignment.id, auth.organizationId);
      await audit?.(auth, 'EMPLOYEE_FALL_PREVENTION_ATTEST', 'EmployeeComplianceAssignment', assignment.id, { attestationId });
      res.status(201).json({ data: { assignmentId: assignment.id, status: 'COMPLIANT' } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/compliance/campaigns/fall-prevention/report', managerGate, async (_req, res, next) => {
    try {
      await ensureSchema();
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT a."id",a."employeeId",a."status",a."dueDate",a."assignedAt",a."completedAt",a."reminderEscalationStatus",u."email" FROM "EmployeeComplianceAssignment" a JOIN "User" u ON u."id"=a."employeeId" AND u."organizationId"=a."organizationId" WHERE a."organizationId"=$1 AND a."campaignType"='WORKPLACE_FALL_PREVENTION'`, auth.organizationId);
      const now = startOfToday();
      const report = {
        incomplete: rows.filter((r) => ['NOT_STARTED', 'MISSING', 'IN_PROGRESS', 'DUE_SOON'].includes(r.status)),
        completed: rows.filter((r) => r.status === 'COMPLIANT'),
        overdue: rows.filter((r) => r.dueDate && new Date(r.dueDate).getTime() < now.getTime() && r.status !== 'COMPLIANT'),
        escalated: rows.filter((r) => String(r.reminderEscalationStatus || '').toUpperCase().includes('ESCALATED')),
      };
      res.json({ data: report });
    } catch (error) { next(error); }
  });
}
