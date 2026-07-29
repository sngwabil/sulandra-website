import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import nodemailer from 'nodemailer';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
};

type Helpers = {
  authOf: (response: express.Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
  audit: (
    auth: Partial<AuthContext>,
    action: string,
    resourceType: string,
    resourceId?: string,
    metadata?: object,
  ) => Promise<void>;
};

export const applicationStatuses = [
  'RECEIVED',
  'REVIEWING',
  'DOCUMENTS_NEEDED',
  'INTERVIEW',
  'OFFER_PENDING',
  'HIRED',
  'NOT_SELECTED',
  'WITHDRAWN',
  'TERMINATED',
  'POSITION_FILLED',
] as const;

const applicationStatus = z.enum(applicationStatuses);
const communicationChannel = z.enum(['EMAIL', 'SMS']);
const documentDecision = z.enum(['APPROVED', 'REJECTED']);

export type ApplicationStatus = z.infer<typeof applicationStatus>;
export type CommunicationChannel = z.infer<typeof communicationChannel>;

type AssessmentResult = {
  score: number;
  maxScore: number;
  percent: number;
  breakdown: Record<string, boolean>;
};

export type ProvisionApplicantInput = {
  applicationId: string;
  referenceNumber: string;
  organizationId: string;
  jobTitle: string;
  appliedRole: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  preferredCommunication: CommunicationChannel;
  notes?: string | null;
  applicationData: Record<string, unknown>;
  assessmentAnswers?: Record<string, unknown>;
};

type ApplicantToken = {
  accountId: string;
  applicationId: string;
  exp: number;
};

const portalUrl = (
  process.env.CAREERS_PORTAL_URL
  ?? 'https://www.sulandrahealth.com/applicant-portal.html'
).replace(/\/$/, '');
const careersFromEmail = (
  process.env.CAREERS_EMAIL_FROM
  ?? process.env.ADMIN_EMAIL
  ?? 'admin@sulandrahealth.com'
).trim().toLowerCase();

function normalizePhone(value?: string | null) {
  return (value ?? '').replace(/[^\d+]/g, '');
}

async function resolveApplicantUsername(
  prisma: PrismaClient,
  preferredUsername: string,
  applicationId: string,
  referenceNumber: string,
) {
  const accounts = await prisma.$queryRawUnsafe<Array<{ applicationId: string }>>(
    `SELECT "applicationId"
       FROM "ApplicantPortalAccount"
      WHERE LOWER("username")=LOWER($1)
      LIMIT 1`,
    preferredUsername,
  );
  if (!accounts[0] || accounts[0].applicationId === applicationId) {
    return preferredUsername;
  }

  const suffix = referenceNumber.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toLowerCase();
  return `${preferredUsername}-${suffix || applicationId.slice(0, 8)}`;
}

function generateTemporaryPassword() {
  return `Su!${randomBytes(9).toString('base64url')}9a`;
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltHex, hashHex] = encoded.split(':');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenSecret() {
  return process.env.APPLICANT_PORTAL_SECRET?.trim()
    || process.env.JWT_SECRET?.trim()
    || '';
}

function createApplicantToken(payload: ApplicantToken) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', tokenSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function readApplicantToken(value: string): ApplicantToken | null {
  const [encoded, suppliedSignature] = value.split('.');
  if (!encoded || !suppliedSignature || !tokenSecret()) return null;
  const expectedSignature = createHmac('sha256', tokenSecret()).update(encoded).digest();
  const supplied = Buffer.from(suppliedSignature, 'base64url');
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ApplicantToken;
    if (!payload.accountId || !payload.applicationId || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function applicantAuth(req: express.Request): ApplicantToken | null {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? readApplicantToken(match[1]) : null;
}

function pdfEscape(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function wrapText(value: string, width = 88) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildApplicationPdf(input: ProvisionApplicantInput) {
  const submitted = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const fullName = [input.firstName, input.middleName, input.lastName].filter(Boolean).join(' ');
  const details = [
    'SULANDRA HEALTH',
    'EMPLOYMENT APPLICATION',
    '',
    `Application reference: ${input.referenceNumber}`,
    `Submitted: ${submitted} ET`,
    `Position: ${input.jobTitle}`,
    `Applicant category: ${input.appliedRole}`,
    '',
    `Applicant: ${fullName}`,
    `Email: ${input.email || 'Not provided'}`,
    `Phone: ${input.phone || 'Not provided'}`,
    `Preferred communication: ${input.preferredCommunication}`,
    '',
    'APPLICATION RESPONSES',
    ...Object.entries(input.applicationData).flatMap(([key, value]) => {
      if (value === undefined || value === null || value === '') return [];
      const label = key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ').trim();
      const rendered = Array.isArray(value) ? value.join(', ') : String(value);
      return wrapText(`${label}: ${rendered}`);
    }),
    '',
    'MESSAGE OR RELEVANT EXPERIENCE',
    ...wrapText(input.notes || 'Not provided'),
    '',
    'This record was generated from the applicant submission received by Sulandra Health.',
  ];

  const pages: string[][] = [];
  for (let index = 0; index < details.length; index += 48) {
    pages.push(details.slice(index, index + 48));
  }
  if (!pages.length) pages.push(['SULANDRA HEALTH EMPLOYMENT APPLICATION']);

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  const fontObjectId = 3 + pages.length * 2;

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  for (let i = 0; i < pages.length; i += 1) {
    pageObjectIds.push(3 + i * 2);
    contentObjectIds.push(4 + i * 2);
  }
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  pages.forEach((lines, index) => {
    const pageId = pageObjectIds[index];
    const contentId = contentObjectIds[index];
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    const streamLines = [
      'BT',
      '/F1 10 Tf',
      '48 744 Td',
      '13 TL',
      ...lines.map((line, lineIndex) => `${lineIndex ? 'T* ' : ''}(${pdfEscape(line)}) Tj`),
      'ET',
    ];
    const stream = streamLines.join('\n');
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontObjectId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id <= fontObjectId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf);
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${fontObjectId + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let id = 1; id <= fontObjectId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${fontObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.toLowerCase());
  if (typeof value === 'string') return value.split(/[,|]/).map((item) => item.trim().toLowerCase());
  return [];
}

function exactSet(value: unknown, expected: string[]) {
  const actual = new Set(stringArray(value));
  return expected.length === actual.size && expected.every((item) => actual.has(item));
}

export function scoreDspAssessment(answers?: Record<string, unknown>): AssessmentResult | null {
  if (!answers || !Object.keys(answers).length) return null;
  const breakdown: Record<string, boolean> = {
    mc1: String(answers.mc1 ?? '').toLowerCase() === 'b',
    mc2: String(answers.mc2 ?? '').toLowerCase() === 'b',
    mc3: String(answers.mc3 ?? '').toLowerCase() === 'b',
    mc4: String(answers.mc4 ?? '').toLowerCase() === 'b',
    mc5: String(answers.mc5 ?? '').toLowerCase() === 'b',
    sa1: exactSet(answers.sa1, ['bathing', 'dressing', 'toileting', 'eating']),
    sa2: exactSet(answers.sa2, ['handwashing', 'gloves', 'cleaning', 'covercough']),
    sa3: exactSet(answers.sa3, ['askpref', 'plainlang', 'privacy']),
    sa4: exactSet(answers.sa4, ['injury', 'mederror', 'abuse', 'missing']),
    sa5: exactSet(answers.sa5, ['times', 'quotes', 'observed']),
  };
  const score = Object.values(breakdown).filter(Boolean).length;
  const maxScore = Object.keys(breakdown).length;
  return { score, maxScore, percent: Math.round((score / maxScore) * 10_000) / 100, breakdown };
}

async function graphAccessToken() {
  const tenant = process.env.MICROSOFT_TENANT_ID?.trim();
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
  if (!tenant || !clientId || !clientSecret) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Microsoft authentication returned ${response.status}: ${detail}`);
  }
  const payload = await response.json() as { access_token?: string };
  return payload.access_token ?? null;
}

type EmailContent = string | { text: string; html: string };

function emailText(content: EmailContent) {
  return typeof content === 'string' ? content : content.text;
}

function emailHtml(content: EmailContent) {
  return typeof content === 'string'
    ? content.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')
    : content.html;
}

async function sendEmail(to: string, subject: string, content: EmailContent) {
  const token = await graphAccessToken();
  if (token) {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(careersFromEmail)}/sendMail`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'HTML', content: emailHtml(content) },
            toRecipients: [{ emailAddress: { address: to } }],
            replyTo: [{ emailAddress: { address: careersFromEmail } }],
          },
          saveToSentItems: true,
        }),
      },
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Microsoft Graph returned ${response.status}: ${detail}`);
    }
    return { status: 'SENT', providerMessageId: response.headers.get('request-id') };
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  if (!smtpHost || !smtpUser || !smtpPass) {
    return { status: 'QUEUED', providerMessageId: null };
  }
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: smtpPort !== 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM?.trim() || careersFromEmail || smtpUser,
    to,
    replyTo: careersFromEmail,
    subject,
    text: emailText(content),
    html: emailHtml(content),
  });
  return { status: 'SENT', providerMessageId: result.messageId || null };
}

function notificationProvider(channel: CommunicationChannel) {
  if (channel === 'SMS') return 'TWILIO';
  if (
    process.env.MICROSOFT_TENANT_ID?.trim()
    && process.env.MICROSOFT_CLIENT_ID?.trim()
    && process.env.MICROSOFT_CLIENT_SECRET?.trim()
  ) {
    return 'MICROSOFT_GRAPH';
  }
  if (
    process.env.SMTP_HOST?.trim()
    && process.env.SMTP_USER?.trim()
    && process.env.SMTP_PASS?.trim()
  ) {
    return 'SMTP';
  }
  return 'NOT_CONFIGURED';
}

function safeDeliveryError(error: unknown) {
  const value = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    responseCode?: unknown;
    command?: unknown;
    response?: unknown;
  };
  return {
    name: String(value?.name || 'Error'),
    message: String(value?.message || 'Delivery failed').slice(0, 1000),
    code: value?.code == null ? undefined : String(value.code),
    responseCode: value?.responseCode == null ? undefined : String(value.responseCode),
    command: value?.command == null ? undefined : String(value.command),
    response: value?.response == null ? undefined : String(value.response).slice(0, 1000),
  };
}

async function sendSms(to: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !from) return { status: 'QUEUED', providerMessageId: null };
  const payload = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: payload,
    },
  );
  if (!response.ok) throw new Error(`SMS provider returned ${response.status}`);
  const result = await response.json() as { sid?: string };
  return { status: 'SENT', providerMessageId: result.sid ?? null };
}

export async function recordAndDeliver(
  prisma: PrismaClient,
  application: {
    id: string;
    email?: string | null;
    phone?: string | null;
    preferredCommunication?: string | null;
  },
  type: string,
  subject: string,
  body: EmailContent,
  createdById?: string | null,
) {
  const email = application.email?.trim().toLowerCase() || null;
  const phone = normalizePhone(application.phone);
  const requested = application.preferredCommunication === 'SMS' ? 'SMS' : 'EMAIL';
  const channel: CommunicationChannel = requested === 'SMS' && phone ? 'SMS' : 'EMAIL';
  const messageId = randomUUID();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ApplicantMessage"
        ("id","applicationId","type","subject","body","recipientEmail","recipientPhone","channel","replyToEmail","deliveryStatus","createdById","createdAt","updatedAt")
       VALUES ($1,$2,$3::"ApplicantMessageType",$4,$5,$6,$7,$8,$9,'QUEUED',$10,NOW(),NOW())`,
      messageId,
      application.id,
      type,
      subject,
      emailText(body),
      email,
      phone || null,
      channel,
      careersFromEmail,
      createdById ?? null,
    );
  } catch {
    // Notification persistence must never turn a completed application into a 500 response.
    return 'FAILED';
  }

  try {
    const delivery = channel === 'SMS'
      ? await sendSms(phone, emailText(body).replace(/\s+/g, ' ').slice(0, 1500))
      : email
        ? await sendEmail(email, subject, body)
        : { status: 'FAILED', providerMessageId: null };
    await prisma.$executeRawUnsafe(
      `UPDATE "ApplicantMessage"
          SET "deliveryStatus"=$1,"providerMessageId"=$2,"sentAt"=CASE WHEN $1='SENT' THEN NOW() ELSE "sentAt" END,"updatedAt"=NOW()
        WHERE "id"=$3`,
      delivery.status,
      delivery.providerMessageId,
      messageId,
    );
    return delivery.status;
  } catch (error) {
    const safeError = safeDeliveryError(error);
    console.error('[careers] notification delivery failed', {
      applicationId: application.id,
      messageId,
      channel,
      provider: notificationProvider(channel),
      error: safeError,
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "ApplicantMessage" SET "deliveryStatus"='FAILED',"errorMessage"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
      safeError.message,
      messageId,
    );
    return 'FAILED';
  }
}

function welcomeMessage(input: ProvisionApplicantInput, username: string, temporaryPassword: string) {
  return [
    `Dear ${input.firstName},`,
    '',
    `Thank you for considering Sulandra Health. We received your application for ${input.jobTitle}.`,
    `Application reference: ${input.referenceNumber}`,
    '',
    'To view and monitor your application, upload requested documents, and see status updates, sign in using:',
    `Portal: ${portalUrl}`,
    `Username: ${username}`,
    `Temporary password: ${temporaryPassword}`,
    '',
    'You will be asked to create a permanent password after your first sign-in. Please monitor your application periodically for updates.',
    `If you have questions, email ${careersFromEmail} and include application reference ${input.referenceNumber}. A member of HR Services will reach out to guide you.`,
    '',
    'Regards,',
    'Sulandra Health',
  ].join('\n');
}

export async function provisionApplicantWorkflow(
  prisma: PrismaClient,
  input: ProvisionApplicantInput,
) {
  const preferredUsername = (input.email?.trim().toLowerCase() || normalizePhone(input.phone)).toLowerCase();
  if (!preferredUsername) throw new Error('An email address or phone number is required for applicant access.');
  const username = await resolveApplicantUsername(
    prisma,
    preferredUsername,
    input.applicationId,
    input.referenceNumber,
  );
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = hashPassword(temporaryPassword);
  const pdf = buildApplicationPdf(input);
  const assessment = input.appliedRole === 'DSP'
    ? scoreDspAssessment(input.assessmentAnswers)
    : null;

  // Profile credentials and the core application update are the only atomic
  // lifecycle operation. History/PDF generation are recoverable enhancements and
  // must not roll back a valid account or a submitted application.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "EmployeeApplication"
          SET "workflowStatus"='RECEIVED',
              "preferredCommunication"=$1,
              "applicantUsername"=$2,
              "assessmentScore"=$3,
              "assessmentMaxScore"=$4,
              "assessmentPercent"=$5,
              "assessmentBreakdown"=$6::jsonb,
              "applicationData"=$7::jsonb,
              "updatedAt"=NOW()
        WHERE "id"=$8`,
      input.preferredCommunication,
      username,
      assessment?.score ?? null,
      assessment?.maxScore ?? null,
      assessment?.percent ?? null,
      JSON.stringify(assessment?.breakdown ?? null),
      JSON.stringify(input.applicationData),
      input.applicationId,
    );
    await tx.$executeRawUnsafe(
      `INSERT INTO "ApplicantPortalAccount"
        ("id","applicationId","username","passwordHash","mustChangePassword","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,TRUE,NOW(),NOW())
       ON CONFLICT ("applicationId") DO UPDATE SET
         "username"=EXCLUDED."username",
         "passwordHash"=EXCLUDED."passwordHash",
         "mustChangePassword"=TRUE,
         "failedLoginAttempts"=0,
         "lockedUntil"=NULL,
         "updatedAt"=NOW()`,
      randomUUID(),
      input.applicationId,
      username,
      passwordHash,
    );
  });

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ApplicantStatusHistory"
        ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","createdAt")
       VALUES ($1,$2,NULL,'RECEIVED','Application received by Sulandra Health.',TRUE,NOW())`,
      randomUUID(),
      input.applicationId,
    );
  } catch (historyError) {
    console.error('[careers] initial status history could not be recorded', {
      applicationId: input.applicationId,
      error: historyError instanceof Error ? historyError.message : String(historyError),
    });
  }

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "ApplicantDocument"
          SET "label"='Application PDF',
              "status"='RECEIVED',
              "fileName"=$1,
              "mimeType"='application/pdf',
              "sizeBytes"=$2,
              "fileData"=$3,
              "contentSha256"=$4,
              "uploadedByType"='SYSTEM',
              "uploadedAt"=NOW(),
              "updatedAt"=NOW()
        WHERE "applicationId"=$5 AND "category"='APPLICATION'`,
      `${input.referenceNumber}.pdf`,
      pdf.length,
      pdf,
      createHash('sha256').update(pdf).digest('hex'),
      input.applicationId,
    );
  } catch (pdfError) {
    console.error('[careers] application PDF could not be generated', {
      applicationId: input.applicationId,
      error: pdfError instanceof Error ? pdfError.message : String(pdfError),
    });
  }

  const deliveryStatus = await recordAndDeliver(
    prisma,
    {
      id: input.applicationId,
      email: input.email,
      phone: input.phone,
      preferredCommunication: input.preferredCommunication,
    },
    'GENERAL',
    `Sulandra Health application received — ${input.referenceNumber}`,
    welcomeMessage(input, username, temporaryPassword),
  );

  return {
    username,
    temporaryPasswordIssued: true,
    deliveryStatus,
    assessment,
  };
}

function statusMessage(application: any, status: ApplicationStatus, note?: string) {
  const friendly: Record<ApplicationStatus, string> = {
    RECEIVED: 'Received',
    REVIEWING: 'Reviewing',
    DOCUMENTS_NEEDED: 'Documents needed',
    INTERVIEW: 'Interview',
    OFFER_PENDING: 'Offer pending',
    HIRED: 'Hired',
    NOT_SELECTED: 'Not selected',
    WITHDRAWN: 'Withdrawn',
    TERMINATED: 'Terminated',
    POSITION_FILLED: 'Position filled',
  };
  return [
    `Dear ${application.firstName},`,
    '',
    `Your Sulandra Health application ${application.referenceNumber} is now: ${friendly[status]}.`,
    note ? `Update from HR Services: ${note}` : '',
    '',
    `View your application: ${portalUrl}`,
    `Questions may be sent to ${careersFromEmail}. Please include your application reference number.`,
    '',
    'Regards,',
    'Sulandra Health',
  ].filter(Boolean).join('\n');
}

function careersDecisionEmail(
  application: any,
  kind: 'ARCHIVED' | 'REJECTED' | 'RESTORED',
): EmailContent {
  const name = application.firstName || 'Applicant';
  const position = application.jobTitle || application.positionTitle || application.appliedRole || 'position';
  const reference = application.referenceNumber || application.id;
  const isArchived = kind === 'ARCHIVED';
  const isRestored = kind === 'RESTORED';
  const headline = isRestored
    ? 'A new opportunity is available'
    : isArchived
      ? 'Application retained for future opportunities'
      : 'Update regarding your application';
  const decision = isRestored
    ? `A new opening is available for the ${position} position. We would be pleased to revisit your application.`
    : isArchived
      ? `We regret to inform you that the ${position} position you applied for is now full.`
      : `After careful consideration, we will not be moving forward with your application for the ${position} position.`;
  const future = isArchived
    ? 'We appreciate your interest in working with Sulandra Health. We will keep your application on file and may reach out when another opening becomes available for this position.'
    : isRestored
      ? `Please sign in to the applicant portal to review your application, or reply to this email if you would like to be considered.`
      : 'We sincerely appreciate the time and interest you invested in applying to Sulandra Health, and we wish you every success in your career search.';
  const eeo = 'Sulandra Health is an equal opportunity employer. Employment decisions are based on legitimate, job-related considerations and are made without unlawful discrimination based on race, color, religion, sex (including pregnancy, sexual orientation, and gender identity), national origin, age, disability, genetic information, veteran status, or any other status protected by applicable law.';
  const safeName = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const safeDecision = decision.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const safeFuture = future.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const safeReference = String(reference).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const text = [
    `Dear ${name},`,
    '',
    decision,
    '',
    future,
    isRestored ? `Applicant portal: ${portalUrl}` : '',
    '',
    eeo,
    '',
    `Application reference: ${reference}`,
    '',
    'Best regards,',
    'Sulandra Health',
  ].filter(Boolean).join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#eef5fb;font-family:Arial,sans-serif;color:#17324d">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef5fb;padding:30px 12px"><tr><td align="center">
      <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px rgba(11,75,121,.14)">
        <tr><td style="background:linear-gradient(135deg,#075c99,#0b78bb);padding:28px 34px;border-bottom:6px solid #e8b94f">
          <div style="font-size:27px;font-weight:800;color:#fff"><span style="font-style:italic">Sulandra</span> Health</div>
          <div style="color:#d8efff;margin-top:5px;font-size:14px">Careers &amp; Onboarding</div>
        </td></tr>
        <tr><td style="padding:34px">
          <div style="font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#0b78bb;font-weight:800">Application update</div>
          <h1 style="font-size:25px;line-height:1.25;color:#12345a;margin:8px 0 24px">${headline}</h1>
          <p style="font-size:16px;line-height:1.7;margin:0 0 17px">Dear <strong>${safeName}</strong>,</p>
          <p style="font-size:16px;line-height:1.7;margin:0 0 17px">${safeDecision}</p>
          <p style="font-size:16px;line-height:1.7;margin:0 0 22px"><strong><em>${safeFuture}</em></strong></p>
          ${isRestored ? `<p style="margin:0 0 24px"><a href="${portalUrl}" style="display:inline-block;background:#0b6fac;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px">Open applicant portal</a></p>` : ''}
          <div style="background:#f4f8fc;border-left:4px solid #e8b94f;padding:15px 17px;color:#536b80;font-size:13px;line-height:1.55">${eeo}</div>
          <p style="color:#657c90;font-size:13px;margin:22px 0">Application reference: <strong>${safeReference}</strong></p>
          <p style="font-size:15px;line-height:1.6;margin:0">Best regards,<br><strong style="color:#075c99"><em>Sulandra Health</em></strong></p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
  return { text, html };
}

export function registerApplicantWorkflowRoutes(
  app: express.Express,
  prisma: PrismaClient,
  helpers: Helpers,
) {
  const { authOf, requireRoles, audit } = helpers;

  app.post('/public/careers/applicant/login', async (req, res, next) => {
    try {
      if (!tokenSecret()) {
        res.status(503).json({ error: 'Applicant portal sign-in is not configured.' });
        return;
      }
      const input = z.object({
        username: z.string().trim().min(3).max(320),
        password: z.string().min(8).max(256),
      }).parse(req.body);
      const accounts = await prisma.$queryRawUnsafe<any[]>(
        `SELECT p.*, a."referenceNumber"
           FROM "ApplicantPortalAccount" p
           JOIN "EmployeeApplication" a ON a."id"=p."applicationId"
          WHERE LOWER(p."username")=LOWER($1)
          LIMIT 1`,
        input.username,
      );
      const account = accounts[0];
      const locked = account?.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now();
      if (!account || locked || !verifyPassword(input.password, account.passwordHash)) {
        if (account && !locked) {
          await prisma.$executeRawUnsafe(
            `UPDATE "ApplicantPortalAccount"
                SET "failedLoginAttempts"="failedLoginAttempts"+1,
                    "lockedUntil"=CASE WHEN "failedLoginAttempts"+1>=5 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END,
                    "updatedAt"=NOW()
              WHERE "id"=$1`,
            account.id,
          );
        }
        res.status(401).json({ error: 'Invalid username or password.' });
        return;
      }
      await prisma.$executeRawUnsafe(
        `UPDATE "ApplicantPortalAccount"
            SET "failedLoginAttempts"=0,"lockedUntil"=NULL,"lastLoginAt"=NOW(),"updatedAt"=NOW()
          WHERE "id"=$1`,
        account.id,
      );
      const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
      res.json({
        data: {
          token: createApplicantToken({
            accountId: account.id,
            applicationId: account.applicationId,
            exp: expiresAt,
          }),
          expiresAt,
          mustChangePassword: account.mustChangePassword,
          referenceNumber: account.referenceNumber,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/public/careers/applicant/me', async (req, res, next) => {
    try {
      const auth = applicantAuth(req);
      if (!auth) return res.status(401).json({ error: 'Applicant authentication required.' });
      const applications = await prisma.$queryRawUnsafe<any[]>(
        `SELECT a."id",a."referenceNumber",a."firstName",a."middleName",a."lastName",
                a."email",a."phone",a."workflowStatus",a."submittedAt",
                a."assessmentScore",a."assessmentMaxScore",a."assessmentPercent",
                j."title" AS "jobTitle"
           FROM "EmployeeApplication" a
           LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
          WHERE a."id"=$1`,
        auth.applicationId,
      );
      if (!applications[0]) return res.status(404).json({ error: 'Application not found.' });
      const [documents, history, messages] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","category","label","status","fileName","mimeType","sizeBytes","requestedAt","uploadedAt","reviewNotes","updatedAt"
             FROM "ApplicantDocument" WHERE "applicationId"=$1 ORDER BY "category","version" DESC`,
          auth.applicationId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "fromStatus","toStatus","note","createdAt"
             FROM "ApplicantStatusHistory"
            WHERE "applicationId"=$1 AND "visibleToApplicant"=TRUE ORDER BY "createdAt" DESC`,
          auth.applicationId,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "type","subject","body","createdAt"
             FROM "ApplicantMessage" WHERE "applicationId"=$1 ORDER BY "createdAt" DESC LIMIT 50`,
          auth.applicationId,
        ),
      ]);
      res.json({ data: { application: applications[0], documents, history, messages } });
    } catch (error) {
      next(error);
    }
  });

  app.post('/public/careers/applicant/change-password', async (req, res, next) => {
    try {
      const auth = applicantAuth(req);
      if (!auth) return res.status(401).json({ error: 'Applicant authentication required.' });
      const input = z.object({ password: z.string().min(12).max(256) }).parse(req.body);
      await prisma.$executeRawUnsafe(
        `UPDATE "ApplicantPortalAccount"
            SET "passwordHash"=$1,"mustChangePassword"=FALSE,"updatedAt"=NOW()
          WHERE "id"=$2 AND "applicationId"=$3`,
        hashPassword(input.password),
        auth.accountId,
        auth.applicationId,
      );
      res.json({ data: { changed: true } });
    } catch (error) {
      next(error);
    }
  });

  app.post('/public/careers/applicant/documents', async (req, res, next) => {
    try {
      const auth = applicantAuth(req);
      if (!auth) return res.status(401).json({ error: 'Applicant authentication required.' });
      const input = z.object({
        documentId: z.string().trim().min(1),
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(160),
        fileDataBase64: z.string().min(1),
      }).parse(req.body);
      const data = Buffer.from(input.fileDataBase64, 'base64');
      if (!data.length || data.length > 20_000_000) {
        res.status(400).json({ error: 'Document must be between 1 byte and 20 MB.' });
        return;
      }
      const result = await prisma.$executeRawUnsafe(
        `UPDATE "ApplicantDocument"
            SET "status"='RECEIVED',"fileName"=$1,"mimeType"=$2,"sizeBytes"=$3,
                "fileData"=$4,"contentSha256"=$5,"uploadedByType"='APPLICANT',
                "uploadedAt"=NOW(),"reviewNotes"=NULL,"reviewedAt"=NULL,"updatedAt"=NOW()
          WHERE "id"=$6 AND "applicationId"=$7`,
        input.fileName,
        input.mimeType,
        data.length,
        data,
        createHash('sha256').update(data).digest('hex'),
        input.documentId,
        auth.applicationId,
      );
      if (!result) return res.status(404).json({ error: 'Requested document was not found.' });
      res.status(201).json({ data: { uploaded: true } });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/admin/applications/:id/resend-access',
    requireRoles(UserRole.ADMINISTRATOR),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const applicationId = String(req.params.id);
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT a.*,j."title" AS "jobTitle"
             FROM "EmployeeApplication" a
             LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
            WHERE a."id"=$1 AND a."organizationId"=$2`,
          applicationId,
          auth.organizationId,
        );
        const application = rows[0];
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        if (!application.email) {
          return res.status(400).json({ error: 'This applicant does not have an email address.' });
        }

        const username = application.applicantUsername || application.email.trim().toLowerCase();
        const temporaryPassword = generateTemporaryPassword();
        const changed = await prisma.$executeRawUnsafe(
          `UPDATE "ApplicantPortalAccount"
              SET "username"=$1,"passwordHash"=$2,"mustChangePassword"=TRUE,
                  "failedLoginAttempts"=0,"lockedUntil"=NULL,"updatedAt"=NOW()
            WHERE "applicationId"=$3`,
          username,
          hashPassword(temporaryPassword),
          applicationId,
        );
        if (!changed) {
          return res.status(409).json({ error: 'Applicant portal access has not been created yet.' });
        }

        const body = [
          `Dear ${application.firstName},`,
          '',
          'Your Sulandra Health applicant-portal access has been reset.',
          `Portal: ${portalUrl}`,
          `Username: ${username}`,
          `Temporary password: ${temporaryPassword}`,
          '',
          'You will be asked to create a permanent password after signing in.',
          `Application reference: ${application.referenceNumber}`,
          '',
          'Regards,',
          'Sulandra Health',
        ].join('\n');
        const deliveryStatus = await recordAndDeliver(
          prisma,
          application,
          'GENERAL',
          `Sulandra Health applicant portal access — ${application.referenceNumber}`,
          body,
          auth.userId,
        );
        await audit(auth, 'RESEND_APPLICANT_ACCESS', 'EmployeeApplication', applicationId, {
          deliveryStatus,
        });
        res.json({ data: { deliveryStatus } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch(
    '/api/admin/applications/:id/status',
    requireRoles(UserRole.ADMINISTRATOR),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const applicationId = String(req.params.id);
        const input = z.object({
          status: applicationStatus,
          note: z.string().trim().max(4000).optional(),
          visibleToApplicant: z.boolean().default(true),
          notifyApplicant: z.boolean().default(true),
        }).parse(req.body);
        if (input.status === 'NOT_SELECTED' || input.status === 'POSITION_FILLED') {
          return res.status(400).json({
            error: input.status === 'NOT_SELECTED'
              ? 'Use the reject action so the regret email is sent before permanent deletion.'
              : 'Use the archive action so the position-filled email and retention workflow are applied.',
          });
        }
        const applications = await prisma.$queryRawUnsafe<any[]>(
          `SELECT a.*,j."title" AS "jobTitle"
             FROM "EmployeeApplication" a
             LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
            WHERE a."id"=$1 AND a."organizationId"=$2`,
          applicationId,
          auth.organizationId,
        );
        const application = applications[0];
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        const previousStatus = application.workflowStatus || application.status || 'RECEIVED';
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeApplication" SET "workflowStatus"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
            input.status,
            applicationId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "ApplicantStatusHistory"
              ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","changedById","createdAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
            randomUUID(),
            applicationId,
            previousStatus,
            input.status,
            input.note ?? null,
            input.visibleToApplicant,
            auth.userId,
          );
          if (input.status === 'DOCUMENTS_NEEDED') {
            await tx.$executeRawUnsafe(
              `UPDATE "ApplicantDocument"
                  SET "status"='REQUESTED',"requestedAt"=COALESCE("requestedAt",NOW()),"updatedAt"=NOW()
                WHERE "applicationId"=$1 AND "status" IN ('MISSING','REJECTED')`,
              applicationId,
            );
          }
        });
        if (input.notifyApplicant && input.visibleToApplicant) {
          await recordAndDeliver(
            prisma,
            application,
            'STATUS_UPDATE',
            `Application update — ${application.referenceNumber}`,
            statusMessage(application, input.status, input.note),
            auth.userId,
          );
        }
        await audit(auth, 'UPDATE_APPLICATION_STATUS', 'EmployeeApplication', applicationId, {
          fromStatus: previousStatus,
          toStatus: input.status,
        });
        res.json({ data: { id: applicationId, workflowStatus: input.status } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/admin/applications/:id/archive',
    requireRoles(UserRole.ADMINISTRATOR),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const applicationId = String(req.params.id);
        const [application] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT a.*,j."title" AS "jobTitle"
             FROM "EmployeeApplication" a
             LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
            WHERE a."id"=$1 AND a."organizationId"=$2`,
          applicationId,
          auth.organizationId,
        );
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        const previousStatus = application.workflowStatus || application.status || 'RECEIVED';
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeApplication" SET "workflowStatus"='POSITION_FILLED',"updatedAt"=NOW() WHERE "id"=$1`,
            applicationId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "ApplicantStatusHistory"
              ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","changedById","createdAt")
             VALUES ($1,$2,$3,'POSITION_FILLED',$4,TRUE,$5,NOW())`,
            randomUUID(),
            applicationId,
            previousStatus,
            'The position has been filled. Your application will be retained for future openings.',
            auth.userId,
          );
        });
        const deliveryStatus = await recordAndDeliver(
          prisma,
          application,
          'STATUS_UPDATE',
          `Sulandra Health application update — ${application.referenceNumber}`,
          careersDecisionEmail(application, 'ARCHIVED'),
          auth.userId,
        );
        await audit(auth, 'ARCHIVE_APPLICATION', 'EmployeeApplication', applicationId, {
          fromStatus: previousStatus,
          deliveryStatus,
        });
        res.json({ data: { id: applicationId, workflowStatus: 'POSITION_FILLED', deliveryStatus } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/admin/applications/:id/restore',
    requireRoles(UserRole.ADMINISTRATOR),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const applicationId = String(req.params.id);
        const input = z.object({ notifyApplicant: z.boolean().default(true) }).parse(req.body ?? {});
        const [application] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT a.*,j."title" AS "jobTitle"
             FROM "EmployeeApplication" a
             LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
            WHERE a."id"=$1 AND a."organizationId"=$2`,
          applicationId,
          auth.organizationId,
        );
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        if (String(application.workflowStatus) !== 'POSITION_FILLED') {
          return res.status(409).json({ error: 'Only archived applications can be revisited.' });
        }
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeApplication" SET "workflowStatus"='REVIEWING',"updatedAt"=NOW() WHERE "id"=$1`,
            applicationId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "ApplicantStatusHistory"
              ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","changedById","createdAt")
             VALUES ($1,$2,'POSITION_FILLED','REVIEWING',$3,$4,$5,NOW())`,
            randomUUID(),
            applicationId,
            'Sulandra Health is revisiting this application for a new opening.',
            input.notifyApplicant,
            auth.userId,
          );
        });
        const deliveryStatus = input.notifyApplicant
          ? await recordAndDeliver(
            prisma,
            application,
            'STATUS_UPDATE',
            `A new Sulandra Health opportunity — ${application.referenceNumber}`,
            careersDecisionEmail(application, 'RESTORED'),
            auth.userId,
          )
          : 'NOT_REQUESTED';
        await audit(auth, 'RESTORE_ARCHIVED_APPLICATION', 'EmployeeApplication', applicationId, {
          deliveryStatus,
        });
        res.json({ data: { id: applicationId, workflowStatus: 'REVIEWING', deliveryStatus } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.delete(
    '/api/admin/applications/:id/reject',
    requireRoles(UserRole.ADMINISTRATOR),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const applicationId = String(req.params.id);
        const [application] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT a.*,j."title" AS "jobTitle"
             FROM "EmployeeApplication" a
             LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
            WHERE a."id"=$1 AND a."organizationId"=$2`,
          applicationId,
          auth.organizationId,
        );
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        const deliveryStatus = await recordAndDeliver(
          prisma,
          application,
          'STATUS_UPDATE',
          `Sulandra Health application decision — ${application.referenceNumber}`,
          careersDecisionEmail(application, 'REJECTED'),
          auth.userId,
        );
        if (deliveryStatus !== 'SENT') {
          return res.status(502).json({
            error: 'The rejection email could not be sent, so the applicant was not deleted. Please try again.',
          });
        }
        await prisma.$executeRawUnsafe(
          `DELETE FROM "EmployeeApplication" WHERE "id"=$1 AND "organizationId"=$2`,
          applicationId,
          auth.organizationId,
        );
        await audit(auth, 'REJECT_AND_DELETE_APPLICATION', 'EmployeeApplication', applicationId, {
          referenceNumber: application.referenceNumber,
          deliveryStatus,
        });
        res.json({ data: { id: applicationId, deleted: true, deliveryStatus } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch(
    '/api/admin/applications/:id/documents/:documentId',
    requireRoles(UserRole.ADMINISTRATOR),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const applicationId = String(req.params.id);
        const documentId = String(req.params.documentId);
        const input = z.object({
          status: documentDecision,
          reviewNotes: z.string().trim().max(4000).optional(),
          notifyApplicant: z.boolean().default(true),
        }).parse(req.body);
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT d.*,a."firstName",a."email",a."phone",a."preferredCommunication",a."referenceNumber"
             FROM "ApplicantDocument" d
             JOIN "EmployeeApplication" a ON a."id"=d."applicationId"
            WHERE d."id"=$1 AND d."applicationId"=$2 AND a."organizationId"=$3`,
          documentId,
          applicationId,
          auth.organizationId,
        );
        const document = rows[0];
        if (!document) return res.status(404).json({ error: 'Document not found.' });
        await prisma.$executeRawUnsafe(
          `UPDATE "ApplicantDocument"
              SET "status"=$1::"ApplicantDocumentStatus","reviewNotes"=$2,
                  "reviewedById"=$3,"reviewedAt"=NOW(),"updatedAt"=NOW()
            WHERE "id"=$4`,
          input.status,
          input.reviewNotes ?? null,
          auth.userId,
          documentId,
        );
        if (input.notifyApplicant && input.status === 'REJECTED') {
          const body = [
            `Dear ${document.firstName},`,
            '',
            `The ${document.label} document for application ${document.referenceNumber} needs to be replaced.`,
            input.reviewNotes ? `HR note: ${input.reviewNotes}` : '',
            `Upload a replacement at ${portalUrl}.`,
            '',
            'Regards,',
            'Sulandra Health',
          ].filter(Boolean).join('\n');
          await recordAndDeliver(prisma, document, 'DOCUMENT_REQUEST', 'Document update required', body, auth.userId);
        }
        await audit(auth, 'REVIEW_APPLICANT_DOCUMENT', 'ApplicantDocument', documentId, {
          applicationId,
          status: input.status,
        });
        res.json({ data: { id: documentId, status: input.status } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    '/api/admin/applications/:id/documents/:documentId/download',
    requireRoles(UserRole.ADMINISTRATOR),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT d."fileData",d."fileName",d."mimeType"
             FROM "ApplicantDocument" d
             JOIN "EmployeeApplication" a ON a."id"=d."applicationId"
            WHERE d."id"=$1 AND d."applicationId"=$2 AND a."organizationId"=$3`,
          String(req.params.documentId),
          String(req.params.id),
          auth.organizationId,
        );
        const document = rows[0];
        if (!document?.fileData) return res.status(404).json({ error: 'Document file is not available.' });
        const safeName = String(document.fileName || 'document').replace(/[^a-zA-Z0-9._ -]/g, '_');
        const file = Buffer.isBuffer(document.fileData)
          ? document.fileData
          : Buffer.from(document.fileData);
        res.setHeader('content-type', document.mimeType || 'application/octet-stream');
        res.setHeader('content-disposition', `attachment; filename="${safeName}"`);
        res.setHeader('content-length', String(file.length));
        res.send(file);
      } catch (error) {
        next(error);
      }
    },
  );
}
