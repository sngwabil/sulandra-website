import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { applicantUsernameFor, careersPortalUrl } from './applicant-workflow.js';
import { careerEntityById } from './careers-entity.js';
import { entityAccessOf, requireEntityManageAccess } from './entity-access.js';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer') as typeof import('nodemailer');

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Helpers = {
  authOf: (response: express.Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
  audit: (auth: Partial<AuthContext>, action: string, resourceType: string, resourceId?: string, metadata?: object) => Promise<void>;
};

const offerSchema = z.object({
  positionTitle: z.string().trim().min(2).max(160),
  department: z.string().trim().max(120).optional(),
  supervisorName: z.string().trim().max(160).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'PRN', 'CONTRACT']),
  compensationType: z.enum(['HOURLY', 'SALARY']),
  payAmount: z.number().positive().max(1_000_000),
  shift: z.string().trim().max(120).optional(),
  startDate: z.coerce.date(),
  orientationDate: z.coerce.date().optional(),
  workLocation: z.string().trim().max(240).optional(),
  ptoEligible: z.boolean().default(false),
  benefitsEligible: z.boolean().default(false),
  probationDays: z.number().int().min(0).max(365).default(90),
  bonusAmount: z.number().nonnegative().max(100_000).optional(),
  notes: z.string().trim().max(4000).optional(),
  requiredDocuments: z.array(z.string().trim().min(2).max(120)).max(50).optional(),
});

async function sendOfferEmail(to: string, subject: string, html: string, text: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return 'NOT_CONFIGURED' as const;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  await transporter.sendMail({
    from: {
      name: 'Sulandra Health Human Resources Department',
      address: user.trim(),
    },
    sender: {
      name: 'Sulandra Health Human Resources Department',
      address: user.trim(),
    },
    replyTo: {
      name: 'Sulandra Health Human Resources Department',
      address: user.trim(),
    },
    to,
    subject,
    html,
    text,
  });
  return 'SENT' as const;
}

function htmlEscape(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function registerOfferSendRoute(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;

  app.post(
    '/api/admin/applications/:id/offers',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const access = entityAccessOf(res);
        requireEntityManageAccess(access);
        const applicationId = String(req.params.id);
        const input = offerSchema.parse(req.body);
        const [application] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT application.*,department."name" AS "hiringDepartment"
             FROM "EmployeeApplication" application
             LEFT JOIN "Department" department
               ON department."organizationId"=application."organizationId"
              AND department."legalEntityId"=application."legalEntityId"
              AND department."id"=application."departmentId"
            WHERE application."id"=$1 AND application."organizationId"=$2 AND application."legalEntityId"=$3
              AND ($4::text IS NULL OR application."departmentId"=$4)`,
          applicationId,
          auth.organizationId,
          access.legalEntityId,
          access.departmentId,
        );
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        if (!application.email) return res.status(400).json({ error: 'Applicant email is required before sending an offer.' });
        const hiringCompany = await careerEntityById(prisma, auth.organizationId, access.legalEntityId);
        if (hiringCompany.status !== 'ACTIVE' || !hiringCompany.isEmployer) {
          return res.status(409).json({ error: 'Employment offers cannot be sent until this company is an active employer.' });
        }
        const companyName = hiringCompany.displayName;
        const companyContext = companyName === 'Sulandra Health' ? '' : 'A Sulandra Health company';

        const offerId = randomUUID();
        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const configuredBase = process.env.OFFER_PORTAL_URL?.trim();
        const base = configuredBase && configuredBase.includes('offer-acceptance.html')
          ? configuredBase
          : 'https://www.sulandrahealth.com/offer-acceptance.html';
        const offerUrl = `${base}?token=${encodeURIComponent(rawToken)}`;
        const postHireDocuments = (input.requiredDocuments || []).filter((name) => name !== 'Offer Letter');

        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmploymentOffer"
              ("id","organizationId","legalEntityId","departmentId","applicationId","status","positionTitle","department",
               "supervisorName","employmentType","compensationType","payAmount","shift","startDate",
               "orientationDate","workLocation","ptoEligible","benefitsEligible","probationDays",
               "bonusAmount","notes","requiredDocuments","tokenHash","tokenExpiresAt","createdById",
               "createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,'OFFER_SENT',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                     $20,$21::jsonb,$22,NOW()+INTERVAL '14 days',$23,NOW(),NOW())`,
            offerId,
            auth.organizationId,
            access.legalEntityId,
            application.departmentId,
            applicationId,
            input.positionTitle,
            application.hiringDepartment ?? input.department ?? null,
            input.supervisorName ?? null,
            input.employmentType,
            input.compensationType,
            input.payAmount,
            input.shift ?? null,
            input.startDate,
            input.orientationDate ?? null,
            input.workLocation ?? null,
            input.ptoEligible,
            input.benefitsEligible,
            input.probationDays,
            input.bonusAmount ?? null,
            input.notes ?? null,
            JSON.stringify(postHireDocuments),
            tokenHash,
            auth.userId,
          );

          // The offer stage contains only the offer itself. Sensitive onboarding records
          // are created after the employee profile is provisioned.
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeApplication"
                SET "workflowStatus"='OFFER_PENDING',"updatedAt"=NOW()
              WHERE "id"=$1`,
            applicationId,
          );
        });

        const compensation = input.compensationType === 'SALARY'
          ? `$${Number(input.payAmount).toLocaleString()} per year`
          : `$${Number(input.payAmount).toFixed(2)} per hour`;
        const employmentType = input.employmentType.replaceAll('_', ' ');
        const startDate = input.startDate.toLocaleDateString('en-US');
        const orientationDate = input.orientationDate
          ? input.orientationDate.toLocaleDateString('en-US')
          : 'To be confirmed';
        const logoUrl = process.env.EMAIL_LOGO_URL || 'https://www.sulandrahealth.com/assets/mainlogo.png';

        const emailHtml = `
          <div style="font-family:Segoe UI,Arial,sans-serif;color:#183153;line-height:1.65;max-width:760px;margin:0 auto;border:1px solid #d8e3ed;border-radius:14px;overflow:hidden;background:#ffffff">
            <div style="background:#d9ecfb;padding:28px 30px;border-bottom:1px solid #bfd7e8">
              <img src="${htmlEscape(logoUrl)}" alt="Sulandra Health" width="220" style="display:block;max-width:70%;height:auto;margin:0 0 18px">
              <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#183153">${htmlEscape(companyName)}</div>
              <h1 style="margin:8px 0 0;font-size:30px;color:#102448">Offer of Employment</h1>
              ${companyContext ? `<p style="margin:8px 0 0;color:#183153">${htmlEscape(companyContext)}</p>` : ''}
            </div>
            <div style="padding:30px">
              <p>Dear ${htmlEscape(application.firstName)},</p>
              <p>We are pleased to offer you employment with <strong>${htmlEscape(companyName)}</strong> in the position of <strong>${htmlEscape(input.positionTitle)}</strong>. We appreciate the time you invested in our selection process and believe your experience, professionalism, and commitment to person-centered care will be valuable to our organization and the individuals we serve.</p>
              <p>The principal terms of this offer are summarized below. Use the secure link to review the complete Offer of Employment, confirm your agreement with the job terms, and electronically sign your acceptance.</p>
              <table style="width:100%;border-collapse:collapse;margin:22px 0;font-size:15px">
                <tr><td style="width:38%;padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Position</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${htmlEscape(input.positionTitle)}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Employment type</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${htmlEscape(employmentType)}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Compensation</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${htmlEscape(compensation)}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Shift</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${htmlEscape(input.shift || 'As scheduled')}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Anticipated start date</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${htmlEscape(startDate)}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Orientation date</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${htmlEscape(orientationDate)}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Work location</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${htmlEscape(input.workLocation || 'To be confirmed')}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Supervisor</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${htmlEscape(input.supervisorName || 'To be assigned')}</td></tr>
              </table>
              <p style="margin:26px 0;text-align:center"><a href="${htmlEscape(offerUrl)}" style="display:inline-block;background:#087fb8;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:700">Review and Sign Offer of Employment</a></p>
              <div style="margin:22px 0;padding:16px 18px;background:#f2f8fc;border:1px solid #cfe0ec;border-radius:10px"><strong>Applicant portal username:</strong> ${htmlEscape(applicantUsernameFor(application))}<br><a href="${htmlEscape(careersPortalUrl)}" style="display:inline-block;margin-top:10px;color:#075985;font-weight:700;text-decoration:none">Open Applicant Portal</a></div>
              <p>After you sign and submit the offer, the signed PDF will be delivered to the Sulandra Health Human Resources Department for review. If Human Resources proceeds with hiring, you will receive a separate welcome email and secure employee-portal access for your onboarding requirements.</p>
              <p><strong>Security notice:</strong> This link is personal to you. Do not forward or share it.</p>
              <p style="margin-top:28px">We appreciate your interest in joining ${htmlEscape(companyName)} and look forward to receiving your response.</p>
              <p style="margin-top:26px"><strong style="color:#0284c7">Sulandra Health Human Resources Department</strong><br>${htmlEscape(companyName)}${companyContext ? `<br>${htmlEscape(companyContext)}` : ''}</p>
              <p style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:15px;margin-top:26px">This offer remains conditional upon satisfactory completion of applicable job requirements, background screening, drug testing where required, identity and employment-eligibility verification, credential verification, and final Human Resources approval. This mailbox may not be monitored for replies.</p>
            </div>
          </div>`;

        const emailText = [
          `Dear ${application.firstName},`,
          '',
          `We are pleased to offer you employment as ${input.positionTitle} with ${companyName}${companyContext ? `, ${companyContext.toLowerCase()}` : ''}.`,
          '',
          `Employment type: ${employmentType}`,
          `Compensation: ${compensation}`,
          `Shift: ${input.shift || 'As scheduled'}`,
          `Anticipated start date: ${startDate}`,
          `Orientation date: ${orientationDate}`,
          `Work location: ${input.workLocation || 'To be confirmed'}`,
          '',
          `Review and sign your Offer of Employment: ${offerUrl}`,
          `Applicant username: ${applicantUsernameFor(application)}`,
          `Applicant portal: ${careersPortalUrl}`,
          '',
          'After you submit the signed offer, the Sulandra Health Human Resources Department will review it. Onboarding requirements will be assigned only after employee-profile creation.',
          '',
          'Sulandra Health Human Resources Department',
          companyName,
          companyContext,
        ].join('\n');

        let deliveryStatus: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' = 'FAILED';
        try {
          deliveryStatus = await sendOfferEmail(
            application.email,
            `Offer of Employment from ${companyName} — ${input.positionTitle}`,
            emailHtml,
            emailText,
          );
        } catch (mailError) {
          console.error('[careers] offer email failed', { applicationId, offerId, error: mailError });
        }

        await audit(auth, 'SEND_EMPLOYMENT_OFFER', 'EmploymentOffer', offerId, {
          applicationId,
          legalEntityId: access.legalEntityId,
          departmentId: application.departmentId,
          positionTitle: input.positionTitle,
          payAmount: input.payAmount,
          deliveryStatus,
        });

        res.status(201).json({
          data: {
            offerId,
            status: 'OFFER_PENDING',
            offerStatus: 'OFFER_SENT',
            offerUrl,
            requiredDocuments: [],
            deliveryStatus,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );
}
