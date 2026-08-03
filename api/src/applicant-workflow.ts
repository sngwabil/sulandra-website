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
  version: number;
  exp: number;
};

const configuredPortalUrl = (
  process.env.CAREERS_PORTAL_URL
  ?? 'https://www.sulandrahealth.com/applicant'
).replace(/\/$/, '');
export const careersPortalUrl = configuredPortalUrl.replace(
  /\/applicant-portal(?:\.html)?$/i,
  '/applicant',
);
const careersFromEmail = (
  process.env.CAREERS_EMAIL_FROM
  ?? process.env.ADMIN_EMAIL
  ?? 'admin@sulandrahealth.com'
).trim().toLowerCase();
export const careersHrDisplayName = 'Sulandra Health Human Resources Department';

function escapeEmailHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function emailLineHtml(line: string) {
  const linkPrefixes: Array<[string, string]> = [
    ['Portal:', 'Open Applicant Portal'],
    ['Applicant portal:', 'Open Applicant Portal'],
    ['Upload requested document:', 'Upload Requested Document'],
    ['Schedule your interview:', 'Choose Interview Appointment'],
    ['Review your appointment:', 'Review Interview Appointment'],
    ['Reset password:', 'Reset Applicant Password'],
  ];
  for (const [prefix, label] of linkPrefixes) {
    if (line.startsWith(prefix)) {
      const href = line.slice(prefix.length).trim();
      return `<div style="margin:15px 0"><a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:13px 20px;background:#075985;color:#ffffff;text-decoration:none;border-radius:9px;font-weight:800">${label}</a></div>`;
    }
  }
  const detail = /^(Applicant username|Username|Temporary password|Application reference|Selection deadline):\s*(.*)$/.exec(line);
  if (detail) {
    return `<div style="margin:5px 0"><strong>${escapeEmailHtml(detail[1])}:</strong> ${escapeEmailHtml(detail[2])}</div>`;
  }
  return `<div>${escapeEmailHtml(line)}</div>`;
}

function brandedEmailHtml(body: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => `<div style="margin:0 0 17px;line-height:1.65">${paragraph.split('\n').map(emailLineHtml).join('')}</div>`)
    .join('');
  return `<div style="margin:0;background:#eef5fa;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#102448"><div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d8e5ef;border-radius:18px;overflow:hidden"><div style="padding:25px 30px;background:linear-gradient(135deg,#dceffc,#8ec4e8)"><div style="font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#075985">Sulandra Health</div><h1 style="margin:8px 0 0;font-size:27px;line-height:1.2">Human Resources Department</h1></div><div style="padding:30px">${paragraphs}<p style="margin:26px 0 0;padding-top:17px;border-top:1px solid #d8e5ef;font-size:12px;line-height:1.55;color:#64748b">This message concerns your employment application with Sulandra Health. Please protect your applicant-portal credentials and include your application reference number when contacting Human Resources.</p></div></div></div>`;
}

function normalizePhone(value?: string | null) {
  return (value ?? '').replace(/[^\d+]/g, '');
}

export function applicantUsernameFor(application: {
  applicantUsername?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  return application.applicantUsername?.trim()
    || application.email?.trim().toLowerCase()
    || normalizePhone(application.phone)
    || 'Contact Human Resources';
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
    if (
      !payload.accountId
      || !payload.applicationId
      || !Number.isInteger(payload.version)
      || payload.version < 0
      || payload.exp < Date.now()
    ) return null;
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

async function applicantSessionState(prisma: PrismaClient, auth: ApplicantToken) {
  const rows = await prisma.$queryRawUnsafe<Array<{
    mustChangePassword: boolean;
    sessionVersion: number;
  }>>(
    `SELECT "mustChangePassword","sessionVersion"
       FROM "ApplicantPortalAccount"
      WHERE "id"=$1 AND "applicationId"=$2
      LIMIT 1`,
    auth.accountId,
    auth.applicationId,
  );
  const account = rows[0];
  if (!account || Number(account.sessionVersion) !== auth.version) return null;
  return account;
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
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Microsoft authentication returned ${response.status}: ${detail}`);
  }
  const payload = await response.json() as { access_token?: string };
  return payload.access_token ?? null;
}

async function sendEmail(to: string, subject: string, body: string) {
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  let smtpError: unknown = null;
  if (smtpHost && smtpUser && smtpPass) {
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      requireTLS: smtpPort !== 465,
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 12_000,
    });
    try {
      const result = await transporter.sendMail({
        from: {
          name: careersHrDisplayName,
          address: smtpUser,
        },
        sender: {
          name: careersHrDisplayName,
          address: smtpUser,
        },
        to,
        replyTo: { name: careersHrDisplayName, address: careersFromEmail },
        subject,
        text: body,
        html: brandedEmailHtml(body),
      });
      return { status: 'SENT', providerMessageId: result.messageId || null };
    } catch (error) {
      smtpError = error;
      console.warn('[careers] SMTP delivery failed; attempting Microsoft Graph fallback', {
        error: safeDeliveryError(error),
      });
    } finally {
      transporter.close();
    }
  }

  let token: string | null = null;
  try {
    token = await graphAccessToken();
  } catch (error) {
    if (smtpError) throw smtpError;
    throw error;
  }
  if (!token) {
    if (smtpError) throw smtpError;
    return { status: 'QUEUED', providerMessageId: null };
  }
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(careersFromEmail)}/sendMail`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: brandedEmailHtml(body) },
          from: { emailAddress: { name: careersHrDisplayName, address: careersFromEmail } },
          sender: { emailAddress: { name: careersHrDisplayName, address: careersFromEmail } },
          toRecipients: [{ emailAddress: { address: to } }],
          replyTo: [{ emailAddress: { name: careersHrDisplayName, address: careersFromEmail } }],
        },
        saveToSentItems: true,
        }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Microsoft Graph returned ${response.status}: ${detail}`);
  }
  return { status: 'SENT', providerMessageId: response.headers.get('request-id') };
}

function notificationProvider(channel: CommunicationChannel) {
  if (channel === 'SMS') return 'TWILIO';
  if (
    process.env.SMTP_HOST?.trim()
    && process.env.SMTP_USER?.trim()
    && process.env.SMTP_PASS?.trim()
  ) {
    return 'SMTP';
  }
  if (
    process.env.MICROSOFT_TENANT_ID?.trim()
    && process.env.MICROSOFT_CLIENT_ID?.trim()
    && process.env.MICROSOFT_CLIENT_SECRET?.trim()
  ) {
    return 'MICROSOFT_GRAPH';
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
  body: string,
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
      body,
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
      ? await sendSms(phone, body.replace(/\s+/g, ' ').slice(0, 1500))
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
    'Your secure applicant portal account has been created. Use the credentials below to monitor your application, review Human Resources updates, and upload requested documents.',
    `Applicant username: ${username}`,
    `Temporary password: ${temporaryPassword}`,
    `Applicant portal: ${careersPortalUrl}`,
    '',
    'Required first step: when you sign in for the first time, you must create a permanent password before the applicant portal will open. This temporary password is for your first sign-in only and should not be shared.',
    'Please monitor your application periodically and keep an eye on your email for updates or requested documentation from Human Resources.',
    `If you have questions, email ${careersFromEmail} and include application reference ${input.referenceNumber}. A member of HR Services will reach out to guide you.`,
    '',
    'Sincerely,',
    careersHrDisplayName,
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
         "sessionVersion"="ApplicantPortalAccount"."sessionVersion"+1,
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
      preferredCommunication: input.email ? 'EMAIL' : input.preferredCommunication,
    },
    'GENERAL',
    `Application received and applicant portal access — ${input.referenceNumber}`,
    welcomeMessage(input, username, temporaryPassword),
  );

  return {
    username,
    temporaryPasswordIssued: true,
    deliveryStatus,
    assessment,
  };
}

function statusSubject(application: any, status: ApplicationStatus) {
  const subjects: Record<ApplicationStatus, string> = {
    RECEIVED: 'We received your employment application',
    REVIEWING: 'Human Resources is reviewing your application',
    DOCUMENTS_NEEDED: 'Action required: documents are needed for your application',
    INTERVIEW: 'Your application has advanced to the interview stage',
    OFFER_PENDING: 'Your employment application has advanced to the offer stage',
    HIRED: 'Welcome to Sulandra Health',
    NOT_SELECTED: 'Update regarding your employment application',
    WITHDRAWN: 'Your application withdrawal has been recorded',
    TERMINATED: 'Your application process has been closed',
    POSITION_FILLED: 'The position connected to your application has been filled',
  };
  return `${subjects[status]} — ${application.referenceNumber}`;
}

function statusMessage(application: any, status: ApplicationStatus, note?: string) {
  const position = application.jobTitle || application.positionTitle || application.appliedRole || 'the position';
  const details: Record<ApplicationStatus, string[]> = {
    RECEIVED: [
      `The ${careersHrDisplayName} has received your application for ${position}.`,
      'Your application and submitted documents are now part of our secure recruitment record. Please use the applicant portal to monitor your progress and respond promptly if Human Resources requests additional information.',
    ],
    REVIEWING: [
      `The ${careersHrDisplayName} is now reviewing your application for ${position}.`,
      'During this period, Human Resources will review your application, qualifications, assessment information, and all documents submitted. Please keep a close eye on your email for any request for additional documentation or clarification.',
      'Use the applicant portal to track your progress and securely submit all required documents. Prompt responses help prevent delays in the review process.',
    ],
    DOCUMENTS_NEEDED: [
      `The ${careersHrDisplayName} reviewed your application for ${position} and requires additional or corrected documentation before the review can continue.`,
      'Please sign in to the applicant portal, review every document marked Requested, Missing, or Rejected, and upload the requested file as soon as possible. Human Resources will resume the review after the required documentation is received.',
    ],
    INTERVIEW: [
      `Your application for ${position} has advanced to the interview stage.`,
      'Human Resources will provide available interview dates and times through a secure scheduling link. Select one available appointment promptly and keep the confirmation for your records.',
    ],
    OFFER_PENDING: [
      `Your application for ${position} has advanced to the employment-offer stage.`,
      'Please monitor your email for a secure Offer of Employment from the Sulandra Health Human Resources Department. Review all terms carefully and complete the electronic acceptance within the period stated in the offer.',
    ],
    HIRED: [
      `Congratulations. The ${careersHrDisplayName} has completed the hiring action associated with your application for ${position}.`,
      'Follow the instructions in your welcome and onboarding messages carefully. Your employment may remain subject to completion and verification of all applicable onboarding, credentialing, screening, and work-authorization requirements.',
    ],
    NOT_SELECTED: [
      `Thank you for your interest in ${position} and for the time you invested in the Sulandra Health selection process.`,
      'After careful consideration, Human Resources will not be moving your application forward for this opportunity. This decision applies to the current opening and does not prevent you from applying for other positions for which you are qualified.',
    ],
    WITHDRAWN: [
      `The ${careersHrDisplayName} has recorded your application for ${position} as withdrawn.`,
      'No further recruitment action will be taken on this application. If you believe this update was made in error, contact Human Resources and include your application reference number.',
    ],
    TERMINATED: [
      `The recruitment process associated with your application for ${position} has been closed.`,
      'If Human Resources provided specific instructions or requested a response, please follow those instructions. Questions should include your application reference number so the correct record can be located.',
    ],
    POSITION_FILLED: [
      `The ${position} opening connected to your application has been filled.`,
      'We appreciate your interest in Sulandra Health. Your application will not move forward for this opening, but you may review and apply for other available opportunities that match your qualifications.',
    ],
  };
  return [
    `Dear ${application.firstName},`,
    '',
    ...details[status].flatMap((paragraph) => [paragraph, '']),
    note ? `Additional message from Human Resources:\n${note}` : '',
    note ? '' : '',
    `Application reference: ${application.referenceNumber}`,
    `Applicant username: ${applicantUsernameFor(application)}`,
    `Applicant portal: ${careersPortalUrl}`,
    `Questions may be sent to ${careersFromEmail}. Please include your application reference number in all correspondence.`,
    '',
    'Sincerely,',
    careersHrDisplayName,
    'Sulandra Health',
  ].filter((line, index, values) => line !== '' || values[index - 1] !== '').join('\n');
}

export function registerApplicantWorkflowRoutes(
  app: express.Express,
  prisma: PrismaClient,
  helpers: Helpers,
) {
  const { authOf, requireRoles, audit } = helpers;

  app.post('/public/careers/applicant/forgot-password', async (req, res, next) => {
    try {
      const input = z.object({
        identifier: z.string().trim().min(3).max(320),
      }).parse(req.body);
      const genericMessage = 'If an applicant account matches that information, a secure password-reset link has been sent to the email address on file.';
      const accounts = await prisma.$queryRawUnsafe<any[]>(
        `SELECT p."id" AS "accountId",p."applicationId",p."username",
                a."email",a."firstName",a."referenceNumber"
           FROM "ApplicantPortalAccount" p
           JOIN "EmployeeApplication" a ON a."id"=p."applicationId"
          WHERE LOWER(p."username")=LOWER($1)
             OR LOWER(COALESCE(a."email",''))=LOWER($1)
          ORDER BY p."createdAt" DESC
          LIMIT 1`,
        input.identifier,
      );
      const account = accounts[0];
      if (account?.email) {
        const token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const resetId = randomUUID();
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "ApplicantPasswordReset"
                SET "usedAt"=NOW()
              WHERE "accountId"=$1 AND "usedAt" IS NULL`,
            account.accountId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "ApplicantPasswordReset"
              ("id","accountId","tokenHash","expiresAt","createdAt")
             VALUES ($1,$2,$3,NOW()+INTERVAL '30 minutes',NOW())`,
            resetId,
            account.accountId,
            tokenHash,
          );
        });

        const resetUrl = `${careersPortalUrl}#reset=${encodeURIComponent(token)}`;
        const body = [
          `Dear ${account.firstName || 'Applicant'},`,
          '',
          'We received a request to reset the password for your Sulandra Health applicant portal account.',
          `Applicant username: ${account.username}`,
          `Reset password: ${resetUrl}`,
          '',
          'This secure link expires in 30 minutes and can be used only once. If you did not request a password reset, you may safely ignore this message; your current password will remain unchanged.',
          `Application reference: ${account.referenceNumber}`,
          '',
          'Sincerely,',
          careersHrDisplayName,
          'Sulandra Health',
        ].join('\n');
        try {
          const delivery = await sendEmail(
            String(account.email).trim().toLowerCase(),
            `Secure applicant portal password reset — ${account.referenceNumber}`,
            body,
          );
          if (delivery.status !== 'SENT') {
            await prisma.$executeRawUnsafe(
              `UPDATE "ApplicantPasswordReset" SET "usedAt"=NOW() WHERE "id"=$1`,
              resetId,
            );
            console.warn('[careers] applicant password-reset email was not sent', {
              applicationId: account.applicationId,
              resetId,
              status: delivery.status,
            });
          }
        } catch (deliveryError) {
          await prisma.$executeRawUnsafe(
            `UPDATE "ApplicantPasswordReset" SET "usedAt"=NOW() WHERE "id"=$1`,
            resetId,
          );
          console.error('[careers] applicant password-reset delivery failed', {
            applicationId: account.applicationId,
            resetId,
            error: safeDeliveryError(deliveryError),
          });
        }
      }
      res.status(202).json({ data: { message: genericMessage } });
    } catch (error) {
      next(error);
    }
  });

  app.post('/public/careers/applicant/reset-password', async (req, res, next) => {
    try {
      const input = z.object({
        token: z.string().trim().min(32).max(512),
        password: z.string().min(12).max(256),
      }).parse(req.body);
      const tokenHash = createHash('sha256').update(input.token).digest('hex');
      const changed = await prisma.$transaction(async (tx) => {
        const resets = await tx.$queryRawUnsafe<any[]>(
          `SELECT r."id",r."accountId",p."applicationId",p."username",
                  a."email",a."firstName",a."referenceNumber"
             FROM "ApplicantPasswordReset" r
             JOIN "ApplicantPortalAccount" p ON p."id"=r."accountId"
             JOIN "EmployeeApplication" a ON a."id"=p."applicationId"
            WHERE r."tokenHash"=$1
              AND r."usedAt" IS NULL
              AND r."expiresAt">NOW()
            LIMIT 1
            FOR UPDATE OF r`,
          tokenHash,
        );
        const reset = resets[0];
        if (!reset) return null;
        await tx.$executeRawUnsafe(
          `UPDATE "ApplicantPortalAccount"
              SET "passwordHash"=$1,"mustChangePassword"=FALSE,
                  "failedLoginAttempts"=0,"lockedUntil"=NULL,
                  "sessionVersion"="sessionVersion"+1,"updatedAt"=NOW()
            WHERE "id"=$2`,
          hashPassword(input.password),
          reset.accountId,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "ApplicantPasswordReset"
              SET "usedAt"=NOW()
            WHERE "accountId"=$1 AND "usedAt" IS NULL`,
          reset.accountId,
        );
        return reset;
      });
      if (!changed) {
        return res.status(400).json({
          error: 'This password-reset link is invalid, expired, or has already been used. Request a new link from the applicant portal.',
          code: 'INVALID_RESET_TOKEN',
        });
      }

      if (changed.email) {
        const body = [
          `Dear ${changed.firstName || 'Applicant'},`,
          '',
          'The password for your Sulandra Health applicant portal account was changed successfully.',
          `Applicant username: ${changed.username}`,
          `Applicant portal: ${careersPortalUrl}`,
          '',
          'If you did not make this change, contact the Sulandra Health Human Resources Department immediately.',
          `Application reference: ${changed.referenceNumber}`,
          '',
          'Sincerely,',
          careersHrDisplayName,
          'Sulandra Health',
        ].join('\n');
        sendEmail(
          String(changed.email).trim().toLowerCase(),
          `Applicant portal password changed — ${changed.referenceNumber}`,
          body,
        ).catch((deliveryError) => {
          console.error('[careers] applicant password-change confirmation failed', {
            applicationId: changed.applicationId,
            error: safeDeliveryError(deliveryError),
          });
        });
      }
      res.json({ data: { changed: true, username: changed.username } });
    } catch (error) {
      next(error);
    }
  });

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
            version: Number(account.sessionVersion),
            exp: expiresAt,
          }),
          expiresAt,
          mustChangePassword: account.mustChangePassword,
          username: account.username,
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
      const session = await applicantSessionState(prisma, auth);
      if (!session) return res.status(401).json({ error: 'Applicant session expired. Please sign in again.' });
      if (session.mustChangePassword) {
        return res.status(403).json({
          error: 'Create a permanent password before accessing the applicant portal.',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
      }
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
      if (!await applicantSessionState(prisma, auth)) {
        return res.status(401).json({ error: 'Applicant session expired. Please sign in again.' });
      }
      const input = z.object({ password: z.string().min(12).max(256) }).parse(req.body);
      const accounts = await prisma.$queryRawUnsafe<Array<{ sessionVersion: number }>>(
        `UPDATE "ApplicantPortalAccount"
            SET "passwordHash"=$1,"mustChangePassword"=FALSE,
                "failedLoginAttempts"=0,"lockedUntil"=NULL,
                "sessionVersion"="sessionVersion"+1,"updatedAt"=NOW()
          WHERE "id"=$2 AND "applicationId"=$3
          RETURNING "sessionVersion"`,
        hashPassword(input.password),
        auth.accountId,
        auth.applicationId,
      );
      if (!accounts[0]) return res.status(401).json({ error: 'Applicant session expired. Please sign in again.' });
      const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
      res.json({
        data: {
          changed: true,
          token: createApplicantToken({
            accountId: auth.accountId,
            applicationId: auth.applicationId,
            version: Number(accounts[0].sessionVersion),
            exp: expiresAt,
          }),
          expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/public/careers/applicant/documents', async (req, res, next) => {
    try {
      const auth = applicantAuth(req);
      if (!auth) return res.status(401).json({ error: 'Applicant authentication required.' });
      const session = await applicantSessionState(prisma, auth);
      if (!session) return res.status(401).json({ error: 'Applicant session expired. Please sign in again.' });
      if (session.mustChangePassword) {
        return res.status(403).json({
          error: 'Create a permanent password before uploading applicant documents.',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
      }
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
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
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
                  "sessionVersion"="sessionVersion"+1,
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
          `Applicant username: ${username}`,
          `Temporary password: ${temporaryPassword}`,
          `Applicant portal: ${careersPortalUrl}`,
          '',
          'Required first step: you must create a new permanent password before the applicant portal will open. This temporary password is for your first sign-in only and should not be shared.',
          `Application reference: ${application.referenceNumber}`,
          '',
          'Sincerely,',
          careersHrDisplayName,
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
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
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
            statusSubject(application, input.status),
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

  app.patch(
    '/api/admin/applications/:id/documents/:documentId',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
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
          `SELECT d.*,a."firstName",a."email",a."phone",a."preferredCommunication",a."referenceNumber",a."applicantUsername"
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
            `Applicant username: ${applicantUsernameFor(document)}`,
            `Upload requested document: ${careersPortalUrl}`,
            '',
            'Sincerely,',
            careersHrDisplayName,
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
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
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
