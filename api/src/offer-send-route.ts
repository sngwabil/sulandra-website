import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { z } from 'zod';

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
  requiredDocuments: z.array(z.string().trim().min(2).max(120)).min(1).max(50),
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
    from: `Human Resources <${process.env.SMTP_FROM || user}>`,
    to,
    subject,
    html,
    text,
  });
  return 'SENT' as const;
}

export function registerOfferSendRoute(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;

  app.post(
    '/api/admin/applications/:id/offers',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const applicationId = String(req.params.id);
        const input = offerSchema.parse(req.body);
        const [application] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "EmployeeApplication" WHERE "id"=$1 AND "organizationId"=$2`,
          applicationId,
          auth.organizationId,
        );
        if (!application) return res.status(404).json({ error: 'Application not found.' });
        if (!application.email) {
          return res.status(400).json({ error: 'Applicant email is required before sending an offer.' });
        }

        const offerId = randomUUID();
        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const base = process.env.OFFER_PORTAL_URL || 'https://www.sulandrahealth.com/offer-acceptance.html';
        const offerUrl = `${base}?token=${encodeURIComponent(rawToken)}`;

        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmploymentOffer"
              ("id","organizationId","applicationId","status","positionTitle","department",
               "supervisorName","employmentType","compensationType","payAmount","shift","startDate",
               "orientationDate","workLocation","ptoEligible","benefitsEligible","probationDays",
               "bonusAmount","notes","requiredDocuments","tokenHash","tokenExpiresAt","createdById",
               "createdAt","updatedAt")
             VALUES ($1,$2,$3,'OFFER_SENT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                     $18,$19::jsonb,$20,NOW()+INTERVAL '14 days',$21,NOW(),NOW())`,
            offerId,
            auth.organizationId,
            applicationId,
            input.positionTitle,
            input.department ?? null,
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
            JSON.stringify(input.requiredDocuments),
            tokenHash,
            auth.userId,
          );
          for (const name of input.requiredDocuments) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "EmploymentOfferDocument"
                ("id","offerId","name","status","createdAt","updatedAt")
               VALUES ($1,$2,$3,'PENDING',NOW(),NOW())`,
              randomUUID(),
              offerId,
              name,
            );
          }
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
        const requiredCount = input.requiredDocuments.length;

        const emailHtml = `
          <div style="font-family:Segoe UI,Arial,sans-serif;color:#183153;line-height:1.6;max-width:760px;margin:0 auto;border:1px solid #d8e3ed;border-radius:14px;overflow:hidden;background:#ffffff">
            <div style="background:#075985;color:#ffffff;padding:30px">
              <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;opacity:.9">Sulandra Community Living Services</div>
              <h1 style="margin:8px 0 0;font-size:30px">Offer of Employment</h1>
              <p style="margin:8px 0 0">A Division of Sulandra Health</p>
            </div>
            <div style="padding:30px">
              <p>Dear ${application.firstName},</p>
              <p>We are pleased to offer you employment with <strong>Sulandra Community Living Services</strong> in the position of <strong>${input.positionTitle}</strong>. We appreciate the time you invested in our selection process and believe your experience, professionalism, and commitment to person-centered care will be valuable to our organization and the individuals we serve.</p>

              <p>The principal terms of this offer are summarized below. The complete Offer of Employment letter, required disclosures, tax and payroll documents, acknowledgments, and signature pages are included in your secure onboarding packet.</p>

              <table style="width:100%;border-collapse:collapse;margin:22px 0;font-size:15px">
                <tr><td style="width:38%;padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Position</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${input.positionTitle}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Employment type</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${employmentType}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Compensation</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${compensation}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Shift</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${input.shift || 'As scheduled'}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Anticipated start date</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${startDate}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Orientation date</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${orientationDate}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Work location</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${input.workLocation || 'To be confirmed'}</td></tr>
                <tr><td style="padding:10px;border:1px solid #d8e3ed;background:#f7fafc"><strong>Supervisor</strong></td><td style="padding:10px;border:1px solid #d8e3ed">${input.supervisorName || 'To be assigned'}</td></tr>
              </table>

              <p>Your secure packet contains <strong>${requiredCount} required item${requiredCount === 1 ? '' : 's'}</strong>. Please open the packet, review the complete offer letter, complete each required form—including the guided current Form W-4 workflow where applicable—and electronically sign and submit the packet within 14 days.</p>

              <p style="margin:26px 0;text-align:center">
                <a href="${offerUrl}" style="display:inline-block;background:#087fb8;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:700">Open Secure Onboarding Packet</a>
              </p>

              <p>After you submit the packet, Human Resources will review the completed forms and supporting documentation. Final employee-portal access, orientation instructions, and reporting details will be provided after the review is complete.</p>

              <p><strong>Security notice:</strong> This link is personal to you. Do not forward it or share it with another person. Human Resources will never ask you to send your Social Security number, full bank account number, or password by ordinary email.</p>

              <p style="margin-top:28px">We are excited about the possibility of welcoming you to Sulandra Community Living Services and look forward to the contribution you can make to our mission.</p>

              <p style="margin-top:26px"><strong><em style="color:#0284c7">Human Resources</em></strong><br>Sulandra Community Living Services<br>A Division of Sulandra Health</p>

              <p style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:15px;margin-top:26px">This offer is contingent upon timely completion of all position requirements, satisfactory background screening, drug testing where required by policy or law, identity and employment-eligibility verification, credential verification, and completion of all required onboarding documentation. This email is a summary; the signed Offer of Employment letter in the secure packet controls. This mailbox may not be monitored for replies.</p>
            </div>
          </div>`;

        const emailText = [
          `Dear ${application.firstName},`,
          '',
          `We are pleased to offer you employment as ${input.positionTitle} with Sulandra Community Living Services, a division of Sulandra Health.`,
          '',
          `Employment type: ${employmentType}`,
          `Compensation: ${compensation}`,
          `Shift: ${input.shift || 'As scheduled'}`,
          `Anticipated start date: ${startDate}`,
          `Orientation date: ${orientationDate}`,
          `Work location: ${input.workLocation || 'To be confirmed'}`,
          '',
          `Open your secure onboarding packet to review the complete Offer of Employment letter and complete all required forms: ${offerUrl}`,
          '',
          'Please complete and submit the packet within 14 days.',
          '',
          'Human Resources',
          'Sulandra Community Living Services',
          'A Division of Sulandra Health',
          '',
          'This offer is contingent upon completion of all position requirements, satisfactory background screening, drug testing where required, identity and employment-eligibility verification, credential verification, and required onboarding documentation.',
        ].join('\n');

        let deliveryStatus: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' = 'FAILED';
        try {
          deliveryStatus = await sendOfferEmail(
            application.email,
            `Offer of Employment — ${input.positionTitle}`,
            emailHtml,
            emailText,
          );
        } catch (mailError) {
          console.error('[careers] offer email failed', { applicationId, offerId, error: mailError });
        }

        await audit(auth, 'SEND_EMPLOYMENT_OFFER', 'EmploymentOffer', offerId, {
          applicationId,
          positionTitle: input.positionTitle,
          payAmount: input.payAmount,
          deliveryStatus,
        });

        res.status(201).json({
          data: {
            offerId,
            status: 'OFFER_SENT',
            offerUrl,
            requiredDocuments: input.requiredDocuments,
            deliveryStatus,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );
}
