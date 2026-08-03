import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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

const careersFromEmail = (
  process.env.CAREERS_EMAIL_FROM
  ?? process.env.ADMIN_EMAIL
  ?? 'admin@sulandrahealth.com'
).trim().toLowerCase();
const careersHrDisplayName = 'Sulandra Health Human Resources Department';
const companyAddress = [
  process.env.SULANDRA_ADDRESS_LINE_1?.trim() || '822 Dalewood Place, Suite A',
  process.env.SULANDRA_ADDRESS_LINE_2?.trim() || 'Dayton, Ohio 45426',
];
const terminalActionInput = z.object({
  note: z.string().trim().max(4000).optional(),
  acknowledged: z.literal(true),
});

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function positionFor(application: any) {
  return application.jobTitle
    || application.positionTitle
    || application.appliedRole
    || 'the position';
}

function equalOpportunityParagraph() {
  return 'Sulandra Health is an equal opportunity employer. Employment decisions are based on legitimate business needs, the requirements of the position, qualifications, experience, performance during the selection process, and other lawful job-related considerations. Sulandra Health does not discriminate on the basis of race, color, religion, sex, pregnancy, national origin, age, disability, genetic information, military or veteran status, or any other status protected by applicable federal, state, or local law.';
}

function notSelectedText(application: any, note?: string) {
  const position = positionFor(application);
  return [
    `Dear ${application.firstName || 'Applicant'},`,
    '',
    `Thank you for your interest in ${position} and for the time and effort you invested in the Sulandra Health hiring process.`,
    '',
    'After careful consideration, we regret to inform you that you were not selected to move forward in the hiring process for this opportunity. We appreciate the opportunity to review your qualifications and learn more about your interest in joining our organization.',
    '',
    'This decision relates only to the current opening. You are welcome to submit a new application for other Sulandra Health opportunities for which you meet the stated qualifications and requirements.',
    note ? `Additional message from Human Resources: ${note}` : '',
    '',
    `Application reference: ${application.referenceNumber}`,
    '',
    equalOpportunityParagraph(),
    '',
    `Questions may be sent to ${careersFromEmail}. Please include your application reference number in all correspondence.`,
    '',
    'Sincerely,',
    careersHrDisplayName,
    'Sulandra Health',
    ...companyAddress,
  ].filter((line, index, values) => line !== '' || values[index - 1] !== '').join('\n');
}

function positionFilledText(application: any, note?: string) {
  const position = positionFor(application);
  return [
    `Dear ${application.firstName || 'Applicant'},`,
    '',
    `Thank you for your interest in ${position} and for the time and effort you invested in the Sulandra Health hiring process.`,
    '',
    `The ${position} opening connected to your application has been filled. Although we will not be moving your application forward for this specific opening, we were pleased to receive your information and appreciate your interest in Sulandra Health.`,
    '',
    'We will keep your application on file in our archived applicant records and may contact you if a similar position becomes available and your qualifications appear to match the needs of that opportunity. Retaining your application does not guarantee future consideration, an interview, or an offer of employment. You may also submit a new application for other posted positions that interest you.',
    note ? `Additional message from Human Resources: ${note}` : '',
    '',
    `Application reference: ${application.referenceNumber}`,
    '',
    equalOpportunityParagraph(),
    '',
    `Questions may be sent to ${careersFromEmail}. Please include your application reference number in all correspondence.`,
    '',
    'Sincerely,',
    careersHrDisplayName,
    'Sulandra Health',
    ...companyAddress,
  ].filter((line, index, values) => line !== '' || values[index - 1] !== '').join('\n');
}

function emailHtml(body: string) {
  const signatureName = escapeHtml(careersHrDisplayName);
  const companyName = 'Sulandra Health';
  const lines = body.split('\n');
  const sincerelyIndex = lines.findIndex((line) => line === 'Sincerely,');
  const contentLines = sincerelyIndex >= 0 ? lines.slice(0, sincerelyIndex) : lines;
  const paragraphs = contentLines
    .join('\n')
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => {
      const reference = /^Application reference:\s*(.*)$/i.exec(paragraph);
      if (reference) {
        return `<div style="margin:22px 0;padding:14px 16px;background:#f1f7fb;border-left:4px solid #075985;border-radius:8px"><strong>Application reference:</strong> ${escapeHtml(reference[1])}</div>`;
      }
      return `<p style="margin:0 0 18px;line-height:1.72;font-size:16px;color:#263b52">${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`;
    })
    .join('');
  const addressHtml = companyAddress.map((line) => escapeHtml(line)).join('<br>');
  return `<div style="margin:0;background:#eef5fa;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#102448">
    <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #d7e5ef;border-radius:20px;overflow:hidden;box-shadow:0 18px 48px rgba(15,57,86,.12)">
      <div style="padding:30px 36px;background:linear-gradient(135deg,#d9effb 0%,#88bfdf 100%);border-bottom:5px solid #c8a64b">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#075985">${companyName}</div>
        <div style="margin-top:8px;font-family:Georgia,'Times New Roman',serif;font-size:31px;line-height:1.2;font-weight:800;color:#102448">Human Resources Department</div>
      </div>
      <div style="padding:36px">${paragraphs}
        <div style="margin-top:30px;padding-top:24px;border-top:1px solid #d7e5ef">
          <div style="font-size:16px;color:#475569;margin-bottom:13px">Sincerely,</div>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:800;color:#075985">${signatureName}</div>
          <div style="margin-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:900;color:#a16207">${companyName}</div>
          <div style="margin-top:12px;font-size:14px;line-height:1.65;color:#52657d">${addressHtml}<br><a href="mailto:${escapeHtml(careersFromEmail)}" style="color:#075985;text-decoration:none;font-weight:700">${escapeHtml(careersFromEmail)}</a></div>
        </div>
        <div style="margin-top:28px;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:12px;line-height:1.6;color:#64748b">This message was sent by the Sulandra Health Human Resources Department concerning an employment application. This message is not an offer of employment.</div>
      </div>
    </div>
  </div>`;
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
  if (!response.ok) throw new Error(`Microsoft authentication returned ${response.status}`);
  const payload = await response.json() as { access_token?: string };
  return payload.access_token ?? null;
}

async function sendEmail(to: string, subject: string, text: string) {
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
        from: { name: careersHrDisplayName, address: smtpUser },
        sender: { name: careersHrDisplayName, address: smtpUser },
        to,
        replyTo: { name: careersHrDisplayName, address: careersFromEmail },
        subject,
        text,
        html: emailHtml(text),
      });
      return { status: 'SENT', providerMessageId: result.messageId || null };
    } catch (error) {
      smtpError = error;
    } finally {
      transporter.close();
    }
  }

  const token = await graphAccessToken();
  if (!token) {
    if (smtpError) throw smtpError;
    throw new Error('Human Resources email delivery is not configured. No applicant record was changed.');
  }
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(careersFromEmail)}/sendMail`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: emailHtml(text) },
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
  if (!response.ok) throw new Error(`Microsoft Graph returned ${response.status}. No applicant record was changed.`);
  return { status: 'SENT', providerMessageId: response.headers.get('request-id') };
}

async function applicationForAction(
  prisma: PrismaClient,
  applicationId: string,
  organizationId: string,
) {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT a.*,j."title" AS "jobTitle"
       FROM "EmployeeApplication" a
       LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
      WHERE a."id"=$1 AND a."organizationId"=$2`,
    applicationId,
    organizationId,
  );
  return rows[0] ?? null;
}

async function invalidatePortalAccess(prisma: PrismaClient, applicationId: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE "ApplicantPortalAccount"
        SET "sessionVersion"="sessionVersion"+1,
            "failedLoginAttempts"=0,
            "lockedUntil"=NOW()+INTERVAL '100 years',
            "passwordHash"=$1,
            "updatedAt"=NOW()
      WHERE "applicationId"=$2`,
    `disabled:${randomBytes(48).toString('hex')}`,
    applicationId,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE "ApplicantPasswordReset"
        SET "usedAt"=COALESCE("usedAt",NOW())
      WHERE "accountId" IN (SELECT "id" FROM "ApplicantPortalAccount" WHERE "applicationId"=$1)`,
    applicationId,
  );
}

export function registerApplicantTerminalRoutes(
  app: express.Express,
  prisma: PrismaClient,
  helpers: Helpers,
) {
  const { authOf, requireRoles, audit } = helpers;

  app.post(
    '/api/admin/applications/:id/reject',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const input = terminalActionInput.parse(req.body);
        const applicationId = String(req.params.id);
        const application = await applicationForAction(prisma, applicationId, auth.organizationId);
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        if (!application.email) {
          return res.status(400).json({ error: 'This applicant has no email address. The record was not deleted.' });
        }
        const subject = `Update regarding your employment application — ${application.referenceNumber}`;
        const text = notSelectedText(application, input.note);
        const delivery = await sendEmail(String(application.email).trim().toLowerCase(), subject, text);
        await audit(auth, 'NOT_SELECTED_DELETE_APPLICANT', 'EmployeeApplication', applicationId, {
          referenceNumber: application.referenceNumber,
          applicantEmailHash: createHash('sha256').update(String(application.email).trim().toLowerCase()).digest('hex'),
          position: positionFor(application),
          deliveryStatus: delivery.status,
        });
        await invalidatePortalAccess(prisma, applicationId);
        await prisma.$executeRawUnsafe(
          `DELETE FROM "EmployeeApplication" WHERE "id"=$1 AND "organizationId"=$2`,
          applicationId,
          auth.organizationId,
        );
        res.json({ data: { deleted: true, deliveryStatus: delivery.status } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/admin/applications/:id/archive',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const input = terminalActionInput.parse(req.body);
        const applicationId = String(req.params.id);
        const application = await applicationForAction(prisma, applicationId, auth.organizationId);
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        if (application.archivedAt) {
          return res.status(409).json({ error: 'This application is already archived.' });
        }
        if (!application.email) {
          return res.status(400).json({ error: 'This applicant has no email address. The application was not archived.' });
        }
        const subject = `The position connected to your application has been filled — ${application.referenceNumber}`;
        const text = positionFilledText(application, input.note);
        const delivery = await sendEmail(String(application.email).trim().toLowerCase(), subject, text);
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "ApplicantPortalAccount"
                SET "sessionVersion"="sessionVersion"+1,
                    "failedLoginAttempts"=0,
                    "lockedUntil"=NOW()+INTERVAL '100 years',
                    "passwordHash"=$1,
                    "updatedAt"=NOW()
              WHERE "applicationId"=$2`,
            `disabled:${randomBytes(48).toString('hex')}`,
            applicationId,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "ApplicantPasswordReset"
                SET "usedAt"=COALESCE("usedAt",NOW())
              WHERE "accountId" IN (SELECT "id" FROM "ApplicantPortalAccount" WHERE "applicationId"=$1)`,
            applicationId,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeApplication"
                SET "workflowStatus"='POSITION_FILLED',
                    "archivedAt"=NOW(),
                    "archivedById"=$1,
                    "archiveReason"='POSITION_FILLED',
                    "updatedAt"=NOW()
              WHERE "id"=$2 AND "organizationId"=$3`,
            auth.userId,
            applicationId,
            auth.organizationId,
          );
          await tx.$executeRawUnsafe(
            `INSERT INTO "ApplicantStatusHistory"
              ("id","applicationId","fromStatus","toStatus","note","visibleToApplicant","changedById","createdAt")
             VALUES ($1,$2,$3,'POSITION_FILLED',$4,FALSE,$5,NOW())`,
            randomUUID(),
            applicationId,
            application.workflowStatus || application.status || 'RECEIVED',
            input.note ?? 'Position filled; application retained in the archived applicant list.',
            auth.userId,
          );
        });
        await audit(auth, 'POSITION_FILLED_ARCHIVE_APPLICANT', 'EmployeeApplication', applicationId, {
          referenceNumber: application.referenceNumber,
          position: positionFor(application),
          deliveryStatus: delivery.status,
        });
        res.json({ data: { archived: true, deliveryStatus: delivery.status } });
      } catch (error) {
        next(error);
      }
    },
  );
}
