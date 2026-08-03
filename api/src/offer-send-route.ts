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

const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const money = (amount: number, type: string) => type === 'SALARY'
  ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} per year`
  : `$${amount.toFixed(2)} per hour`;
const dateText = (value: Date | undefined) => value
  ? value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : 'To be confirmed';

async function sendOfferEmail(to: string, subject: string, html: string, text: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return 'NOT_CONFIGURED' as const;
  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  const sender = process.env.SMTP_FROM || user;
  await transporter.sendMail({ from: `Human Resources <${sender}>`, to, subject, html, text });
  return 'SENT' as const;
}

export function registerOfferSendRoute(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;
  app.post('/api/admin/applications/:id/offers', requireRoles(UserRole.ADMINISTRATOR, UserRole.COO), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const applicationId = String(req.params.id);
      const input = offerSchema.parse(req.body);
      const [application] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "EmployeeApplication" WHERE "id"=$1 AND "organizationId"=$2`,
        applicationId, auth.organizationId,
      );
      if (!application) return res.status(404).json({ error: 'Application not found.' });
      if (!application.email) return res.status(400).json({ error: 'Applicant email is required before sending an offer.' });

      const offerId = randomUUID();
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const offerUrlBase = process.env.OFFER_PORTAL_URL || 'https://www.sulandrahealth.com/offer-acceptance.html';
      const offerUrl = `${offerUrlBase}?token=${encodeURIComponent(rawToken)}`;

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "EmploymentOffer" ("id","organizationId","applicationId","status","positionTitle","department","supervisorName","employmentType","compensationType","payAmount","shift","startDate","orientationDate","workLocation","ptoEligible","benefitsEligible","probationDays","bonusAmount","notes","requiredDocuments","tokenHash","tokenExpiresAt","createdById","createdAt","updatedAt") VALUES ($1,$2,$3,'OFFER_SENT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,NOW()+INTERVAL '14 days',$21,NOW(),NOW())`,
          offerId, auth.organizationId, applicationId, input.positionTitle, input.department ?? null,
          input.supervisorName ?? null, input.employmentType, input.compensationType, input.payAmount,
          input.shift ?? null, input.startDate, input.orientationDate ?? null, input.workLocation ?? null,
          input.ptoEligible, input.benefitsEligible, input.probationDays, input.bonusAmount ?? null,
          input.notes ?? null, JSON.stringify(input.requiredDocuments), tokenHash, auth.userId,
        );
        for (const name of input.requiredDocuments) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmploymentOfferDocument" ("id","offerId","name","status","createdAt","updatedAt") VALUES ($1,$2,$3,'PENDING',NOW(),NOW())`,
            randomUUID(), offerId, name,
          );
        }
        await tx.$executeRawUnsafe(
          `UPDATE "EmployeeApplication" SET "workflowStatus"='OFFER_PENDING',"updatedAt"=NOW() WHERE "id"=$1`,
          applicationId,
        );
      });

      const deadline = new Date(Date.now() + 14 * 86400000);
      const terms = [
        ['Position', input.positionTitle],
        ['Employment classification', label(input.employmentType)],
        ['Compensation', money(input.payAmount, input.compensationType)],
        ['Shift', input.shift || 'As scheduled'],
        ['Anticipated start date', dateText(input.startDate)],
        ['Orientation date', dateText(input.orientationDate)],
        ['Work location', input.workLocation || 'To be assigned'],
        ['Supervisor', input.supervisorName || 'To be assigned'],
      ];
      const termRows = terms.map(([k, v]) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #dbe6f2;color:#52657d;font-weight:700;width:42%">${k}</td><td style="padding:10px 12px;border-bottom:1px solid #dbe6f2;color:#102448">${v}</td></tr>`).join('');
      const docs = input.requiredDocuments.map((name) => `<li style="margin:4px 0">${name}</li>`).join('');
      const emailHtml = `<!doctype html><html><body style="margin:0;background:#f3f6f9;font-family:Segoe UI,Arial,sans-serif;color:#102448"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f9;padding:28px 12px"><tr><td align="center"><table role="presentation" width="680" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dbe6f2"><tr><td style="background:#075985;padding:28px 34px;color:#fff"><div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:800">Sulandra Health</div><h1 style="margin:8px 0 0;font-size:28px">Conditional Employment Offer</h1><p style="margin:8px 0 0;color:#d9efff">Sulandra Community Living Services</p></td></tr><tr><td style="padding:34px"><p>Dear ${application.firstName},</p><p>We are pleased to extend to you a conditional offer of employment for the position of <strong>${input.positionTitle}</strong>. Your experience and interest in supporting individuals align with the mission and service standards of Sulandra Community Living Services.</p><p>This message summarizes the proposed employment terms. Please review every section carefully before completing the secure onboarding packet.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe6f2;border-radius:12px;overflow:hidden;margin:20px 0">${termRows}</table><h2 style="font-size:19px">Conditions of employment</h2><p>This offer is contingent upon successful completion and verification of all pre-employment requirements applicable to the position, which may include identity and work-authorization verification, background screening, reference checks, required licenses or credentials, health or safety requirements, training, and execution of company policies and agreements.</p><p>Employment is not final until Human Resources confirms that all conditions have been satisfied and issues final onboarding instructions. Nothing in this communication creates a contract for a fixed term or alters the at-will nature of employment where permitted by law.</p><h2 style="font-size:19px">Required onboarding packet</h2><p>Your secure portal contains the following items:</p><ul style="padding-left:22px">${docs}</ul><p>Each item includes the applicable disclosure, required information, acknowledgment, and electronic signature. Please answer accurately and do not submit information you know to be incomplete or false.</p><div style="background:#eef7ff;border:1px solid #b9d9ef;border-radius:12px;padding:18px;margin:22px 0"><strong>Action required by ${deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong><p style="margin:7px 0 0">Open the secure portal, review the offer terms, complete all required forms, and electronically accept or decline the offer.</p></div><p style="text-align:center;margin:28px 0"><a href="${offerUrl}" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:9px">Review Offer and Complete Onboarding Packet</a></p><h2 style="font-size:19px">Security and confidentiality</h2><p>This link is unique to you and expires after 14 days. Do not forward it. Sulandra Health will never ask you to send passwords or sensitive identity documents by ordinary email. Complete sensitive forms only inside the secure portal.</p><p>Questions about the offer or onboarding requirements may be directed to Human Resources using the contact information previously provided during the application process.</p><p style="margin-top:28px"><strong style="color:#00a9e0;font-style:italic">Human Resources</strong><br>Sulandra Community Living Services<br>A Division of Sulandra Health</p><p style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:16px">This communication is intended only for the named recipient. This is a conditional offer and not a guarantee of employment until all stated requirements are satisfied and final approval is issued.</p></td></tr></table></td></tr></table></body></html>`;
      const emailText = `Dear ${application.firstName},\n\nSulandra Community Living Services is pleased to extend a conditional offer for ${input.positionTitle}.\n\nPosition: ${input.positionTitle}\nEmployment classification: ${label(input.employmentType)}\nCompensation: ${money(input.payAmount, input.compensationType)}\nAnticipated start date: ${dateText(input.startDate)}\nWork location: ${input.workLocation || 'To be assigned'}\n\nThis offer is contingent upon completion and verification of all applicable pre-employment requirements. Complete the secure onboarding packet by ${deadline.toLocaleDateString('en-US')}:\n${offerUrl}\n\nDo not forward this unique link.\n\nHuman Resources\nSulandra Community Living Services\nA Division of Sulandra Health`;

      let deliveryStatus: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' = 'FAILED';
      try {
        deliveryStatus = await sendOfferEmail(application.email, `Conditional Employment Offer — ${input.positionTitle}`, emailHtml, emailText);
      } catch (mailError) {
        console.error('[careers] offer email failed', { applicationId, offerId, error: mailError });
      }
      await audit(auth, 'SEND_EMPLOYMENT_OFFER', 'EmploymentOffer', offerId, {
        applicationId, positionTitle: input.positionTitle, payAmount: input.payAmount, deliveryStatus,
      });
      res.status(201).json({ data: { offerId, status: 'OFFER_SENT', offerUrl, requiredDocuments: input.requiredDocuments, deliveryStatus } });
    } catch (error) {
      next(error);
    }
  });
}
