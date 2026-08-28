import type express from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer') as typeof import('nodemailer');

type CampaignAuth = {
  userId: string;
  organizationId: string;
  role: UserRole;
  ipAddress?: string;
  userAgent?: string;
};

type CampaignHelpers = {
  authOf: (response: express.Response) => CampaignAuth;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
  audit: (
    auth: Partial<CampaignAuth>,
    action: string,
    resourceType: string,
    resourceId?: string,
    metadata?: object,
  ) => Promise<void>;
};

type CampaignRow = {
  id: string;
  organizationId: string;
  conversationId: string | null;
  createdById: string;
  courseCode: string;
  title: string;
  summary: string;
  content: string;
  status: 'DRAFT' | 'READY_TO_SEND' | 'ACTIVE' | 'CLOSED';
  audience: 'ALL_EMPLOYEES' | 'MANAGERS' | 'HR_ADMIN' | 'CUSTOM';
  recipientUserIds: unknown;
  dueDate: Date | string | null;
  emailSubject: string;
  emailMessage: string;
  version: number;
  sentAt: Date | string | null;
  deliverySummary: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type AgentCampaignInput = {
  organizationId: string;
  userId: string;
  conversationId: string;
  campaignId?: string | null;
};

type DraftInput = AgentCampaignInput & {
  title: string;
  summary?: string;
  content: string;
  audience?: string;
  recipientUserIds?: string[];
  dueDate?: string | Date | null;
  emailSubject?: string;
  emailMessage?: string;
};

type RevisionInput = AgentCampaignInput & {
  title?: string;
  summary?: string;
  content?: string;
  dueDate?: string | Date | null;
  emailSubject?: string;
  emailMessage?: string;
  changeNote?: string;
};

const adminRoles = [UserRole.ADMINISTRATOR, UserRole.CEO, UserRole.DOO, UserRole.HR_MANAGER] as const;
const adminRoleNames = new Set(['ADMINISTRATOR', 'CEO', 'COO', 'DOO', 'HR_MANAGER', 'PROGRAM_MANAGER']);
const managerRoleNames = new Set(['ADMINISTRATOR', 'PROGRAM_MANAGER', 'HR_MANAGER', 'HOUSE_MANAGER', 'CEO', 'COO', 'DOO']);
const hrRoleNames = new Set(['ADMINISTRATOR', 'HR_MANAGER', 'CEO', 'COO', 'DOO']);
const audienceValues = new Set(['ALL_EMPLOYEES', 'MANAGERS', 'HR_ADMIN', 'CUSTOM']);
const clean = (value: unknown, max = 12000) => String(value ?? '').trim().slice(0, max);
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const safeArray = (value: unknown) => Array.isArray(value) ? value.map((item) => clean(item, 160)).filter(Boolean) : [];
const isoOrNull = (value: unknown) => {
  const text = clean(value, 80);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw httpError(400, 'The education due date is invalid.');
  return date;
};
const html = (value: unknown) => clean(value, 12000).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character] || character));
const publicBase = () => {
  const configured = clean(process.env.CLIENT_ORIGIN?.split(',')[0], 1000);
  return (configured && /^https?:\/\//i.test(configured) ? configured : 'https://www.sulandrahealth.com').replace(/\/$/, '');
};
export const educationCampaignReviewUrl = (campaignId: string) => `${publicBase()}/education-campaign.html?id=${encodeURIComponent(campaignId)}`;
const courseCode = () => `SUL-IT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
const certificateNumber = (completedAt: Date) => `SUL-${completedAt.getUTCFullYear()}-${randomBytes(6).toString('hex').toUpperCase()}`;

async function campaignById(prisma: PrismaClient, organizationId: string, campaignId: string) {
  const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
    `SELECT * FROM "EducationCampaign" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    campaignId,
  );
  return rows[0] ?? null;
}

async function currentCampaign(prisma: PrismaClient, input: AgentCampaignInput) {
  const explicit = clean(input.campaignId, 160);
  if (explicit) return campaignById(prisma, input.organizationId, explicit);
  const rows = await prisma.$queryRawUnsafe<CampaignRow[]>(
    `SELECT * FROM "EducationCampaign"
      WHERE "organizationId"=$1 AND "conversationId"=$2
      ORDER BY CASE WHEN "status" IN ('DRAFT','READY_TO_SEND') THEN 0 WHEN "status"='ACTIVE' THEN 1 ELSE 2 END,
               "updatedAt" DESC
      LIMIT 1`,
    input.organizationId,
    input.conversationId,
  );
  return rows[0] ?? null;
}

async function addRevision(
  prisma: PrismaClient,
  campaign: Pick<CampaignRow, 'id' | 'organizationId' | 'version' | 'title' | 'summary' | 'content' | 'dueDate' | 'emailSubject' | 'emailMessage'>,
  userId: string,
  changeNote: string,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "EducationCampaignRevision"
      ("id","organizationId","campaignId","version","title","summary","content","dueDate","emailSubject","emailMessage","changedById","changeNote","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
    randomUUID(),
    campaign.organizationId,
    campaign.id,
    campaign.version,
    campaign.title,
    campaign.summary,
    campaign.content,
    campaign.dueDate,
    campaign.emailSubject,
    campaign.emailMessage,
    userId,
    clean(changeNote, 2000),
  );
}

export async function createTrainingDraft(prisma: PrismaClient, input: DraftInput) {
  const title = clean(input.title, 300);
  const content = clean(input.content, 30000);
  if (!title || !content) throw httpError(400, 'Training title and education content are required.');
  const audience = clean(input.audience, 40).toUpperCase() || 'ALL_EMPLOYEES';
  if (!audienceValues.has(audience)) throw httpError(400, 'Unsupported education audience.');
  const recipients = safeArray(input.recipientUserIds);
  if (audience === 'CUSTOM' && !recipients.length) throw httpError(400, 'Select at least one employee for a custom education audience.');

  const existing = await currentCampaign(prisma, input);
  if (existing && ['DRAFT', 'READY_TO_SEND'].includes(existing.status) && existing.title.toLowerCase() === title.toLowerCase()) {
    return {
      campaignId: existing.id,
      status: existing.status,
      version: existing.version,
      reviewUrl: educationCampaignReviewUrl(existing.id),
      message: `The existing “${existing.title}” education draft is still open for review. Review it here: ${educationCampaignReviewUrl(existing.id)}. Ask for changes, or say “send” when it is ready.`,
      reused: true,
    };
  }

  const id = randomUUID();
  const row: CampaignRow = {
    id,
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    createdById: input.userId,
    courseCode: courseCode(),
    title,
    summary: clean(input.summary, 4000),
    content,
    status: 'DRAFT',
    audience: audience as CampaignRow['audience'],
    recipientUserIds: recipients,
    dueDate: isoOrNull(input.dueDate),
    emailSubject: clean(input.emailSubject, 240) || `${title} — Sulandra Health Education`,
    emailMessage: clean(input.emailMessage, 12000) || `A new required Sulandra Health education item, “${title},” has been assigned to you. Open the secure link below, review the education, and complete the attestation by the due date.`,
    version: 1,
    sentAt: null,
    deliverySummary: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await prisma.$executeRawUnsafe(
    `INSERT INTO "EducationCampaign"
      ("id","organizationId","conversationId","createdById","courseCode","title","summary","content","status","audience","recipientUserIds","dueDate","emailSubject","emailMessage","version","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9,$10::jsonb,$11,$12,$13,1,NOW(),NOW())`,
    row.id,
    row.organizationId,
    row.conversationId,
    row.createdById,
    row.courseCode,
    row.title,
    row.summary,
    row.content,
    row.audience,
    JSON.stringify(recipients),
    row.dueDate,
    row.emailSubject,
    row.emailMessage,
  );
  await addRevision(prisma, row, input.userId, 'Initial IT Agent education draft');
  return {
    campaignId: id,
    status: 'DRAFT',
    version: 1,
    reviewUrl: educationCampaignReviewUrl(id),
    message: `I created the “${title}” education draft. Nothing has been sent yet. Review it here: ${educationCampaignReviewUrl(id)}. Tell me what to change; I will revise this same draft. When it is ready, say “send”.`,
  };
}

export async function reviseTrainingDraft(prisma: PrismaClient, input: RevisionInput) {
  const current = await currentCampaign(prisma, input);
  if (!current) throw httpError(404, 'No education draft is active in this IT conversation.');
  if (current.status === 'ACTIVE' || current.status === 'CLOSED') {
    throw httpError(409, 'That education was already sent. Create a new campaign instead of rewriting sent employee education.');
  }
  const nextVersion = Number(current.version) + 1;
  const revised: CampaignRow = {
    ...current,
    title: clean(input.title, 300) || current.title,
    summary: input.summary === undefined ? current.summary : clean(input.summary, 4000),
    content: input.content === undefined ? current.content : clean(input.content, 30000),
    dueDate: input.dueDate === undefined ? current.dueDate : isoOrNull(input.dueDate),
    emailSubject: input.emailSubject === undefined ? current.emailSubject : clean(input.emailSubject, 240),
    emailMessage: input.emailMessage === undefined ? current.emailMessage : clean(input.emailMessage, 12000),
    version: nextVersion,
    status: 'DRAFT',
    updatedAt: new Date(),
  };
  if (!revised.content) throw httpError(400, 'Education content cannot be empty.');
  await prisma.$executeRawUnsafe(
    `UPDATE "EducationCampaign"
        SET "title"=$1,"summary"=$2,"content"=$3,"dueDate"=$4,"emailSubject"=$5,"emailMessage"=$6,
            "version"=$7,"status"='DRAFT',"updatedAt"=NOW()
      WHERE "organizationId"=$8 AND "id"=$9 AND "status" IN ('DRAFT','READY_TO_SEND')`,
    revised.title,
    revised.summary,
    revised.content,
    revised.dueDate,
    revised.emailSubject,
    revised.emailMessage,
    revised.version,
    input.organizationId,
    current.id,
  );
  await addRevision(prisma, revised, input.userId, clean(input.changeNote, 2000) || 'Revised after Administrator review');
  return {
    campaignId: current.id,
    status: 'DRAFT',
    version: nextVersion,
    reviewUrl: educationCampaignReviewUrl(current.id),
    message: `I revised the same “${revised.title}” education draft to version ${nextVersion}. Nothing has been sent. Review the updated draft here: ${educationCampaignReviewUrl(current.id)}.`,
  };
}

export async function markTrainingReady(prisma: PrismaClient, input: AgentCampaignInput) {
  const current = await currentCampaign(prisma, input);
  if (!current) throw httpError(404, 'No education draft is active in this IT conversation.');
  if (current.status === 'ACTIVE' || current.status === 'CLOSED') return getTrainingCampaignStatus(prisma, input);
  await prisma.$executeRawUnsafe(
    `UPDATE "EducationCampaign" SET "status"='READY_TO_SEND',"updatedAt"=NOW()
      WHERE "organizationId"=$1 AND "id"=$2 AND "status" IN ('DRAFT','READY_TO_SEND')`,
    input.organizationId,
    current.id,
  );
  return {
    campaignId: current.id,
    status: 'READY_TO_SEND',
    version: current.version,
    reviewUrl: educationCampaignReviewUrl(current.id),
    message: `“${current.title}” is marked ready to send. I have not distributed it yet. If you want it distributed now, say “send”.`,
  };
}

type RecipientRow = {
  userId: string;
  legalEntityId: string;
  departmentId: string | null;
  email: string | null;
  role: string;
};

async function eligibleRecipients(prisma: PrismaClient, campaign: CampaignRow) {
  const rows = await prisma.$queryRawUnsafe<RecipientRow[]>(
    `SELECT DISTINCT employment."userId" AS "userId",employment."legalEntityId",employment."departmentId",
            usr."email",usr."role"::text AS "role"
       FROM "Employment" employment
       JOIN "User" usr ON usr."organizationId"=employment."organizationId" AND usr."id"=employment."userId"
      WHERE employment."organizationId"=$1 AND employment."status"<>'TERMINATED'
      ORDER BY employment."userId",employment."legalEntityId"`,
    campaign.organizationId,
  );
  const custom = new Set(safeArray(campaign.recipientUserIds));
  return rows.filter((row) => {
    const role = clean(row.role, 80).toUpperCase();
    if (campaign.audience === 'CUSTOM') return custom.has(row.userId);
    if (campaign.audience === 'MANAGERS') return managerRoleNames.has(role);
    if (campaign.audience === 'HR_ADMIN') return hrRoleNames.has(role);
    return true;
  });
}

export async function sendTrainingCampaign(prisma: PrismaClient, input: AgentCampaignInput) {
  const campaign = await currentCampaign(prisma, input);
  if (!campaign) throw httpError(404, 'No education draft is active in this IT conversation.');
  if (campaign.status === 'ACTIVE' || campaign.status === 'CLOSED') {
    const status = await getTrainingCampaignStatus(prisma, { ...input, campaignId: campaign.id });
    return { ...status, message: `“${campaign.title}” was already sent. I did not create duplicate assignments or resend it.` };
  }
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw httpError(503, 'Sulandra SMTP is not configured on this API deployment, so the education was not distributed.');

  const recipients = await eligibleRecipients(prisma, campaign);
  if (!recipients.length) throw httpError(409, 'No active employees match this education audience.');
  const uniqueEmployees = [...new Set(recipients.map((row) => row.userId))];
  const reviewUrl = educationCampaignReviewUrl(campaign.id);
  let assignmentCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of recipients) {
      const existing = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "EducationAssignment"
          WHERE "organizationId"=$1 AND "campaignId"=$2 AND "employeeId"=$3 AND "legalEntityId"=$4
          LIMIT 1`,
        campaign.organizationId,
        campaign.id,
        row.userId,
        row.legalEntityId,
      );
      if (existing[0]) continue;
      await tx.$executeRawUnsafe(
        `INSERT INTO "EducationAssignment"
          ("id","organizationId","legalEntityId","departmentId","employeeId","courseCode","title","packageCode","status","dueDate","reason","assignedById","assignedAt","completionEvidence","campaignId","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,'CUSTOM','ASSIGNED',$8,$9,$10,NOW(),$11::jsonb,$12,NOW(),NOW())`,
        randomUUID(),
        campaign.organizationId,
        row.legalEntityId,
        row.departmentId,
        row.userId,
        campaign.courseCode,
        campaign.title,
        campaign.dueDate,
        `Required Sulandra employee education distributed through IT Solutions: ${campaign.title}`,
        input.userId,
        JSON.stringify({
          source: 'IT_AGENT_EDUCATION_CAMPAIGN',
          campaignId: campaign.id,
          campaignVersion: campaign.version,
          assignedAt: new Date().toISOString(),
          attested: false,
        }),
        campaign.id,
      );
      assignmentCount += 1;
    }
  });

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  const from = (process.env.FROM_EMAIL || process.env.SMTP_FROM || user).trim();
  const emailByUser = new Map<string, string>();
  for (const row of recipients) {
    const email = clean(row.email, 320).toLowerCase();
    if (email && !emailByUser.has(row.userId)) emailByUser.set(row.userId, email);
  }
  let emailSentCount = 0;
  let emailFailedCount = 0;
  for (const [employeeId, email] of emailByUser) {
    try {
      const dueText = campaign.dueDate ? new Date(campaign.dueDate).toLocaleDateString('en-US') : 'the assigned due date';
      const text = `${campaign.emailMessage}\n\nDue: ${dueText}\nReview and attest: ${reviewUrl}`;
      await transporter.sendMail({
        from: { name: 'Sulandra Health Education', address: from },
        replyTo: user.trim(),
        to: email,
        subject: campaign.emailSubject || `${campaign.title} — Sulandra Health Education`,
        text,
        html: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#18324a;line-height:1.6"><h2 style="color:#082f5b">${html(campaign.title)}</h2><p>${html(campaign.emailMessage).replace(/\n/g, '<br>')}</p><p><strong>Due:</strong> ${html(dueText)}</p><p><a href="${html(reviewUrl)}" style="display:inline-block;background:#0b6fb8;color:white;text-decoration:none;padding:10px 16px;border-radius:8px">Review education and attest</a></p><p style="color:#64748b;font-size:12px">Assigned by Sulandra Health Education through IT Solutions.</p></div>`,
      });
      emailSentCount += 1;
    } catch {
      emailFailedCount += 1;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeeNotification" ("id","organizationId","employeeId","title","message","category","actionUrl","createdById")
       VALUES ($1,$2,$3,$4,$5,'COMPLIANCE',$6,$7)`,
      randomUUID(),
      campaign.organizationId,
      employeeId,
      `Required education: ${campaign.title}`,
      campaign.dueDate
        ? `Review and attest by ${new Date(campaign.dueDate).toLocaleDateString('en-US')}.`
        : 'Review this required education and complete the attestation.',
      reviewUrl,
      input.userId,
    ).catch(() => undefined);
  }

  const deliverySummary = {
    assignedEmployees: uniqueEmployees.length,
    assignmentRows: recipients.length,
    newAssignmentRows: assignmentCount,
    emailEligibleCount: emailByUser.size,
    emailSentCount,
    emailFailedCount,
    sentAt: new Date().toISOString(),
  };
  await prisma.$executeRawUnsafe(
    `UPDATE "EducationCampaign"
        SET "status"='ACTIVE',"sentAt"=COALESCE("sentAt",NOW()),"deliverySummary"=$1::jsonb,"updatedAt"=NOW()
      WHERE "organizationId"=$2 AND "id"=$3 AND "status" IN ('DRAFT','READY_TO_SEND')`,
    JSON.stringify(deliverySummary),
    campaign.organizationId,
    campaign.id,
  );
  return {
    campaignId: campaign.id,
    status: 'ACTIVE',
    version: campaign.version,
    reviewUrl,
    ...deliverySummary,
    message: `Sent “${campaign.title}” to ${uniqueEmployees.length} employee${uniqueEmployees.length === 1 ? '' : 's'} and created ${recipients.length} company-scoped education assignment${recipients.length === 1 ? '' : 's'}. Email delivery: ${emailSentCount} sent${emailFailedCount ? `, ${emailFailedCount} failed` : ''}. Completion and attestation are now being tracked in each employee’s EducationAssignment record.`,
  };
}

export async function getTrainingCampaignStatus(prisma: PrismaClient, input: AgentCampaignInput) {
  const campaign = await currentCampaign(prisma, input);
  if (!campaign) throw httpError(404, 'No education campaign is available in this IT conversation.');
  const rows = await prisma.$queryRawUnsafe<Array<{
    employeeId: string;
    email: string | null;
    role: string;
    status: string;
    completedAt: Date | string | null;
    legalEntityId: string;
  }>>(
    `SELECT assignment."employeeId",usr."email",usr."role"::text AS "role",assignment."status",assignment."completedAt",assignment."legalEntityId"
       FROM "EducationAssignment" assignment
       JOIN "User" usr ON usr."organizationId"=assignment."organizationId" AND usr."id"=assignment."employeeId"
      WHERE assignment."organizationId"=$1 AND assignment."campaignId"=$2
      ORDER BY usr."email" NULLS LAST,assignment."legalEntityId"`,
    campaign.organizationId,
    campaign.id,
  );
  const employees = new Map<string, { employeeId: string; email: string | null; role: string; statuses: string[]; completedAt: string | null }>();
  for (const row of rows) {
    const current = employees.get(row.employeeId) ?? {
      employeeId: row.employeeId,
      email: row.email,
      role: row.role,
      statuses: [],
      completedAt: null,
    };
    current.statuses.push(row.status);
    if (row.completedAt) current.completedAt = new Date(row.completedAt).toISOString();
    employees.set(row.employeeId, current);
  }
  const people = [...employees.values()].map((person) => ({
    employeeId: person.employeeId,
    email: person.email,
    role: person.role,
    status: person.statuses.length && person.statuses.every((status) => status === 'COMPLETED') ? 'COMPLETED' : 'OUTSTANDING',
    completedAt: person.completedAt,
  }));
  const completed = people.filter((person) => person.status === 'COMPLETED').length;
  const assigned = people.length;
  const outstanding = Math.max(0, assigned - completed);
  return {
    campaignId: campaign.id,
    title: campaign.title,
    status: campaign.status,
    version: campaign.version,
    dueDate: campaign.dueDate,
    sentAt: campaign.sentAt,
    reviewUrl: educationCampaignReviewUrl(campaign.id),
    assigned,
    completed,
    outstanding,
    completionPercent: assigned ? Math.round((completed / assigned) * 100) : 0,
    employees: people,
    message: `“${campaign.title}” status: ${completed} completed, ${outstanding} outstanding, ${assigned} assigned (${assigned ? Math.round((completed / assigned) * 100) : 0}% complete).`,
  };
}

export async function executeTrainingAgentAction(
  prisma: PrismaClient,
  input: {
    auth: { userId: string; organizationId: string };
    conversationId: string;
    actionId: string;
    toolName: string;
    payload: Record<string, unknown>;
  },
) {
  const base = {
    organizationId: input.auth.organizationId,
    userId: input.auth.userId,
    conversationId: input.conversationId,
    campaignId: clean(input.payload.campaignId, 160) || null,
  };
  let result: Record<string, unknown>;
  if (input.toolName === 'create_training_draft') {
    result = await createTrainingDraft(prisma, {
      ...base,
      title: clean(input.payload.title, 300),
      summary: clean(input.payload.summary, 4000),
      content: clean(input.payload.content, 30000),
      audience: clean(input.payload.audience, 40),
      recipientUserIds: safeArray(input.payload.recipientUserIds),
      dueDate: clean(input.payload.dueDate, 80) || null,
      emailSubject: clean(input.payload.emailSubject, 240),
      emailMessage: clean(input.payload.emailMessage, 12000),
    });
  } else if (input.toolName === 'revise_training_draft') {
    result = await reviseTrainingDraft(prisma, {
      ...base,
      title: clean(input.payload.title, 300) || undefined,
      summary: input.payload.summary === undefined ? undefined : clean(input.payload.summary, 4000),
      content: input.payload.content === undefined ? undefined : clean(input.payload.content, 30000),
      dueDate: input.payload.dueDate === undefined ? undefined : (clean(input.payload.dueDate, 80) || null),
      emailSubject: input.payload.emailSubject === undefined ? undefined : clean(input.payload.emailSubject, 240),
      emailMessage: input.payload.emailMessage === undefined ? undefined : clean(input.payload.emailMessage, 12000),
      changeNote: clean(input.payload.changeNote, 2000),
    });
  } else if (input.toolName === 'mark_training_ready') {
    result = await markTrainingReady(prisma, base);
  } else if (input.toolName === 'send_training') {
    result = await sendTrainingCampaign(prisma, base);
  } else if (input.toolName === 'get_training_status') {
    result = await getTrainingCampaignStatus(prisma, base);
  } else {
    throw httpError(409, `Unsupported education campaign tool: ${input.toolName}`);
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "ITAgentAction"
        SET "status"='EXECUTED',"result"=$1::jsonb,"executedByUserId"=$2,"executedAt"=NOW(),"updatedAt"=NOW()
      WHERE "organizationId"=$3 AND "id"=$4`,
    JSON.stringify(result),
    input.auth.userId,
    input.auth.organizationId,
    input.actionId,
  );
  return result;
}

const attestationSchema = z.object({ attested: z.literal(true) });

export function registerEducationCampaignRoutes(app: express.Express, prisma: PrismaClient, helpers: CampaignHelpers) {
  const { authOf, requireRoles, audit } = helpers;
  const adminGate = requireRoles(...adminRoles);

  app.get('/api/admin/education/campaigns/:id/status', adminGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const data = await getTrainingCampaignStatus(prisma, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        conversationId: '',
        campaignId: String(req.params.id),
      });
      res.json({ data });
    } catch (error) { next(error); }
  });

  app.get('/api/education/campaigns/:id', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const campaign = await campaignById(prisma, auth.organizationId, String(req.params.id));
      if (!campaign) return void res.status(404).json({ error: 'Education campaign not found.' });
      const isAdmin = adminRoleNames.has(String(auth.role));
      const assignments = await prisma.$queryRawUnsafe<Array<{ status: string; completedAt: Date | string | null }>>(
        `SELECT "status","completedAt" FROM "EducationAssignment"
          WHERE "organizationId"=$1 AND "campaignId"=$2 AND "employeeId"=$3`,
        auth.organizationId,
        campaign.id,
        auth.userId,
      );
      if (!isAdmin && !assignments.length) return void res.status(403).json({ error: 'This education is not assigned to your employee account.' });
      if (!isAdmin && !['ACTIVE', 'CLOSED'].includes(campaign.status)) return void res.status(409).json({ error: 'This education has not been distributed yet.' });
      const status = await getTrainingCampaignStatus(prisma, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        conversationId: campaign.conversationId ?? '',
        campaignId: campaign.id,
      });
      res.json({
        data: {
          campaign: {
            id: campaign.id,
            title: campaign.title,
            summary: campaign.summary,
            content: campaign.content,
            status: campaign.status,
            audience: campaign.audience,
            dueDate: campaign.dueDate,
            version: campaign.version,
            sentAt: campaign.sentAt,
          },
          isAdmin,
          assignmentStatus: assignments.length && assignments.every((row) => row.status === 'COMPLETED') ? 'COMPLETED' : assignments.length ? 'ASSIGNED' : null,
          completedAt: assignments.find((row) => row.completedAt)?.completedAt ?? null,
          tracking: isAdmin ? status : undefined,
        },
      });
    } catch (error) { next(error); }
  });

  app.post('/api/education/campaigns/:id/attest', async (req, res, next) => {
    try {
      const auth = authOf(res);
      attestationSchema.parse(req.body);
      const campaign = await campaignById(prisma, auth.organizationId, String(req.params.id));
      if (!campaign) return void res.status(404).json({ error: 'Education campaign not found.' });
      if (!['ACTIVE', 'CLOSED'].includes(campaign.status)) return void res.status(409).json({ error: 'This education has not been distributed yet.' });
      const assignments = await prisma.$queryRawUnsafe<Array<{ id: string; status: string; legalEntityId: string }>>(
        `SELECT "id","status","legalEntityId" FROM "EducationAssignment"
          WHERE "organizationId"=$1 AND "campaignId"=$2 AND "employeeId"=$3`,
        auth.organizationId,
        campaign.id,
        auth.userId,
      );
      if (!assignments.length) return void res.status(403).json({ error: 'This education is not assigned to your employee account.' });
      if (assignments.every((assignment) => assignment.status === 'COMPLETED')) {
        return void res.json({ data: { campaignId: campaign.id, status: 'COMPLETED', alreadyCompleted: true } });
      }
      const completedAt = new Date();
      const contentSha256 = createHash('sha256').update(campaign.content).digest('hex');
      for (const assignment of assignments.filter((row) => row.status !== 'COMPLETED')) {
        const evidence = {
          source: 'IT_AGENT_EDUCATION_CAMPAIGN',
          campaignId: campaign.id,
          campaignVersion: campaign.version,
          courseCode: campaign.courseCode,
          title: campaign.title,
          contentSha256,
          attested: true,
          attestationStatement: 'I reviewed and understand this assigned Sulandra Health education.',
          attestedAt: completedAt.toISOString(),
          ipAddress: auth.ipAddress ?? null,
          userAgent: auth.userAgent ?? null,
        };
        await prisma.$executeRawUnsafe(
          `UPDATE "EducationAssignment"
              SET "status"='COMPLETED',"startedAt"=COALESCE("startedAt",NOW()),"completedAt"=$1,
                  "certificateNumber"=COALESCE("certificateNumber",$2),"attemptCount"="attemptCount"+1,
                  "completionEvidence"=$3::jsonb,"updatedAt"=NOW()
            WHERE "organizationId"=$4 AND "id"=$5 AND "employeeId"=$6 AND "status"<>'COMPLETED'`,
          completedAt,
          certificateNumber(completedAt),
          JSON.stringify(evidence),
          auth.organizationId,
          assignment.id,
          auth.userId,
        );
      }
      const [{ remaining }] = await prisma.$queryRawUnsafe<Array<{ remaining: number }>>(
        `SELECT COUNT(DISTINCT "employeeId")::int AS remaining
           FROM "EducationAssignment"
          WHERE "organizationId"=$1 AND "campaignId"=$2 AND "status"<>'COMPLETED'`,
        auth.organizationId,
        campaign.id,
      );
      if (Number(remaining ?? 0) === 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE "EducationCampaign" SET "status"='CLOSED',"updatedAt"=NOW() WHERE "organizationId"=$1 AND "id"=$2`,
          auth.organizationId,
          campaign.id,
        );
      }
      await audit(auth, 'ATTEST_EDUCATION_CAMPAIGN', 'EducationCampaign', campaign.id, {
        version: campaign.version,
        courseCode: campaign.courseCode,
        employeeId: auth.userId,
        assignmentCount: assignments.length,
        contentSha256,
      });
      res.json({
        data: {
          campaignId: campaign.id,
          title: campaign.title,
          status: 'COMPLETED',
          completedAt,
          employeeFileEvidence: 'EducationAssignment.completionEvidence',
        },
      });
    } catch (error) { next(error); }
  });
}
