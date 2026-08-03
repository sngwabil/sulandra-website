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
  const sender = process.env.SMTP_FROM || user;
  await transporter.sendMail({ from: `Human Resources <${sender}>`, to, subject, html, text });
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
        if (!application.email) return res.status(400).json({ error: 'Applicant email is required before sending an offer.' });

        const offerId = randomUUID();
        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const offerUrlBase = process.env.OFFER_PORTAL_URL || 'https://www.sulandrahealth.com/offer-acceptance.html';
        const offerUrl = `${offerUrlBase}?token=${encodeURIComponent(rawToken)}`;

        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmploymentOffer" ("id","organizationId","applicationId","status","positionTitle","department","supervisorName","employmentType","compensationType","payAmount","shift","startDate","orientationDate","workLocation","ptoEligible","benefitsEligible","probationDays","bonusAmount","notes","requiredDocuments","tokenHash","tokenExpiresAt","createdById","createdAt","updatedAt") VALUES ($1,$2,$3,'OFFER_SENT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,NOW()+INTERVAL '14 days',$21,NOW(),NOW())`,
            offerId, auth.organizationId, applicationId, input.positionTitle,
            input.department ?? null, input.supervisorName ?? null, input.employmentType,
            input.compensationType, input.payAmount, input.shift ?? null, input.startDate,
            input.orientationDate ?? null, input.workLocation ?? null, input.ptoEligible,
            input.benefitsEligible, input.probationDays, input.bonusAmount ?? null,
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

        const emailHtml = `<p>Dear ${application.firstName},</p><p>We are pleased to offer you the position of <strong>${input.positionTitle}</strong> with Sulandra Community Living Services.</p><p>Please review your employment offer and complete the required onboarding paperwork using the secure link below:</p><p><a href="${offerUrl}">Review and accept your employment offer</a></p><p><strong>Human Resources</strong><br>Sulandra Community Living Services<br>A Division of Sulandra Health</p>`;
        let deliveryStatus: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' = 'FAILED';
        try {
          deliveryStatus = await sendOfferEmail(
            application.email,
            `Employment Offer — ${input.positionTitle}`,
            emailHtml,
            `Review and accept your employment offer: ${offerUrl}`,
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
