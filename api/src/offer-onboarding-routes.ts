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

const documentCompleteSchema = z.object({
  fullLegalName: z.string().trim().min(2).max(180),
  signature: z.string().trim().min(2).max(500),
});
const acceptSchema = z.object({
  fullLegalName: z.string().trim().min(2).max(180),
  signature: z.string().trim().min(2).max(500),
  acceptedTerms: z.literal(true),
});
const DEFAULT_DOCUMENTS = [
  'Form W-4',
  'Form I-9',
  'Direct Deposit Authorization',
  'Confidentiality Agreement',
  'HIPAA Acknowledgment',
  'Non-Disclosure Agreement',
  'Employee Handbook Acknowledgment',
  'Drug-Free Workplace Policy',
  'Background Check Authorization',
  'Emergency Contact Form',
  'Technology Acceptable Use Policy',
];

function smtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('SMTP is not configured.');
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function sendMail(to: string, subject: string, html: string, text: string) {
  const sender = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@sulandrahealth.com';
  await smtpTransporter().sendMail({
    from: `Human Resources <${sender}>`,
    to,
    subject,
    html,
    text,
  });
}

async function documentProgress(prisma: PrismaClient, offerId: string) {
  const documents = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id","name","status","signedByName","completedAt"
       FROM "EmploymentOfferDocument"
      WHERE "offerId"=$1
      ORDER BY "createdAt","name"`,
    offerId,
  );
  const completed = documents.filter((document) => document.status === 'COMPLETED').length;
  return {
    documents,
    completed,
    total: documents.length,
    allComplete: documents.length > 0 && completed === documents.length,
  };
}

async function offerByToken(prisma: PrismaClient, rawToken: string) {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT o.*,a."firstName",a."lastName",a."email",a."phone",a."appliedRole",a."organizationId"
       FROM "EmploymentOffer" o
       JOIN "EmployeeApplication" a ON a."id"=o."applicationId"
      WHERE o."tokenHash"=$1 AND o."tokenExpiresAt">NOW()
      LIMIT 1`,
    tokenHash,
  );
  return rows[0] || null;
}

export function registerOfferOnboardingRoutes(
  app: express.Express,
  prisma: PrismaClient,
  helpers: Helpers,
) {
  const { authOf, requireRoles, audit } = helpers;

  app.post(
    '/api/admin/applications/:id/offers',
    requireRoles(UserRole.ADMINISTRATOR, UserRole.COO),
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const applicationId = String(req.params.id);
        const input = offerSchema.parse({
          ...req.body,
          requiredDocuments: req.body?.requiredDocuments?.length
            ? req.body.requiredDocuments.filter((name: string) => name !== 'Offer Letter')
            : DEFAULT_DOCUMENTS,
        });
        const [application] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "EmployeeApplication"
            WHERE "id"=$1 AND "organizationId"=$2`,
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
        const offerUrlBase = process.env.OFFER_PORTAL_URL
          || 'https://www.sulandrahealth.com/offer-acceptance.html';
        const offerUrl = `${offerUrlBase}?token=${encodeURIComponent(rawToken)}`;

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

        const emailHtml = `<p>Dear ${application.firstName},</p><p>We are pleased to offer you the position of <strong>${input.positionTitle}</strong> with Sulandra Community Living Services.</p><p>Please use the secure link below to review the employment terms and electronically sign the offer:</p><p><a href="${offerUrl}">Review and accept your employment offer</a></p><p>No W-4, I-9, direct-deposit, background-check, or other sensitive onboarding information is requested at this stage. After you accept the offer and Human Resources creates your employee profile, you will receive a separate welcome email with secure employee-portal access and onboarding instructions.</p><p><strong>Human Resources</strong><br>Sulandra Community Living Services<br>A Division of Sulandra Health</p>`;
        await sendMail(
          application.email,
          `Employment Offer — ${input.positionTitle}`,
          emailHtml,
          `We are pleased to offer you the position of ${input.positionTitle}. Review and accept your offer here: ${offerUrl}. Onboarding forms will be assigned after acceptance and employee-profile creation.`,
        );
        await audit(auth, 'SEND_EMPLOYMENT_OFFER', 'EmploymentOffer', offerId, {
          applicationId,
          positionTitle: input.positionTitle,
          payAmount: input.payAmount,
        });
        res.status(201).json({
          data: {
            offerId,
            status: 'OFFER_SENT',
            offerUrl,
            requiredDocuments: input.requiredDocuments,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get('/public/careers/offers/:token', async (req, res, next) => {
    try {
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      if (offer.status === 'OFFER_SENT') {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmploymentOffer"
              SET "status"='OFFER_VIEWED',"viewedAt"=COALESCE("viewedAt",NOW()),"updatedAt"=NOW()
            WHERE "id"=$1`,
          offer.id,
        );
      }
      const progress = await documentProgress(prisma, offer.id);
      res.json({ data: { ...offer, tokenHash: undefined, documentProgress: progress } });
    } catch (error) {
      next(error);
    }
  });

  app.post('/public/careers/offers/:token/documents/:documentId/complete', async (req, res, next) => {
    try {
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      if (!offer.employeeId) {
        return res.status(403).json({ error: 'Onboarding documents become available after Human Resources creates the employee profile.' });
      }
      const input = documentCompleteSchema.parse(req.body);
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE "EmploymentOfferDocument"
            SET "status"='COMPLETED',"signature"=$1,"signedByName"=$2,
                "completedAt"=NOW(),"updatedAt"=NOW()
          WHERE "id"=$3 AND "offerId"=$4`,
        input.signature,
        input.fullLegalName,
        String(req.params.documentId),
        offer.id,
      );
      if (!updated) return res.status(404).json({ error: 'Required document not found.' });
      const progress = await documentProgress(prisma, offer.id);
      if (progress.allComplete) {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmploymentOffer"
              SET "status"='DOCUMENTS_COMPLETE',"documentsCompletedAt"=NOW(),"updatedAt"=NOW()
            WHERE "id"=$1`,
          offer.id,
        );
      }
      res.json({ data: progress });
    } catch (error) {
      next(error);
    }
  });

  app.post('/public/careers/offers/:token/accept', async (req, res, next) => {
    try {
      const input = acceptSchema.parse(req.body);
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      await prisma.$executeRawUnsafe(
        `UPDATE "EmploymentOffer"
            SET "status"='OFFER_ACCEPTED',"acceptedAt"=NOW(),
                "acceptedByName"=$1,"signature"=$2,"updatedAt"=NOW()
          WHERE "id"=$3`,
        input.fullLegalName,
        input.signature,
        offer.id,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeApplication"
            SET "workflowStatus"='OFFER_ACCEPTED',"updatedAt"=NOW()
          WHERE "id"=$1`,
        offer.applicationId,
      );
      await audit({}, 'ACCEPT_EMPLOYMENT_OFFER', 'EmploymentOffer', offer.id, {
        applicationId: offer.applicationId,
        acceptedByName: input.fullLegalName,
      });
      res.json({
        data: {
          status: 'OFFER_ACCEPTED',
          message: 'Your signed employment offer has been received. Human Resources will review it and contact you with the next steps.',
        },
      });
    } catch (error) {
      next(error);
    }
  });
}
