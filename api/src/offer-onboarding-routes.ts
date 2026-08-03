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
  requiredDocuments: z.array(z.string()).optional(),
});

const acceptSchema = z.object({
  fullLegalName: z.string().trim().min(2).max(180),
  signature: z.string().trim().min(2).max(500),
  acceptedTerms: z.literal(true),
});

function smtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('SMTP is not configured.');
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function sendMail(to: string, subject: string, html: string, text: string) {
  const senderAddress = (process.env.SMTP_USER || 'admin@sulandrahealth.com').trim();
  await smtpTransporter().sendMail({
    from: { name: 'Sulandra Human Resources Department', address: senderAddress },
    sender: { name: 'Sulandra Human Resources Department', address: senderAddress },
    replyTo: { name: 'Sulandra Human Resources Department', address: senderAddress },
    to,
    subject,
    html,
    text,
    headers: {
      'X-Sulandra-Message-Type': 'employment-offer',
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
    },
  });
}

async function documentProgress(prisma: PrismaClient, offerId: string) {
  const documents = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id","name","status","signedByName","completedAt","fileName"
       FROM "EmploymentOfferDocument"
      WHERE "offerId"=$1
      ORDER BY "createdAt","name"`,
    offerId,
  );
  const completed = documents.filter((document) => document.status === 'COMPLETED').length;
  return { documents, completed, total: 1, allComplete: completed >= 1, readyForAdminReview: completed >= 1 };
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

export function registerOfferOnboardingRoutes(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;

  app.post('/api/admin/applications/:id/offers', requireRoles(UserRole.ADMINISTRATOR, UserRole.COO), async (req, res, next) => {
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
      const requiredDocuments = ['Offer Letter'];

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "EmploymentOffer"
            ("id","organizationId","applicationId","status","positionTitle","department","supervisorName",
             "employmentType","compensationType","payAmount","shift","startDate","orientationDate","workLocation",
             "ptoEligible","benefitsEligible","probationDays","bonusAmount","notes","requiredDocuments","tokenHash",
             "tokenExpiresAt","createdById","createdAt","updatedAt")
           VALUES ($1,$2,$3,'OFFER_SENT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,
                   NOW()+INTERVAL '14 days',$21,NOW(),NOW())`,
          offerId, auth.organizationId, applicationId, input.positionTitle, input.department ?? null,
          input.supervisorName ?? null, input.employmentType, input.compensationType, input.payAmount,
          input.shift ?? null, input.startDate, input.orientationDate ?? null, input.workLocation ?? null,
          input.ptoEligible, input.benefitsEligible, input.probationDays, input.bonusAmount ?? null,
          input.notes ?? null, JSON.stringify(requiredDocuments), tokenHash, auth.userId,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "EmployeeApplication" SET "workflowStatus"='OFFER_PENDING',"updatedAt"=NOW() WHERE "id"=$1`,
          applicationId,
        );
      });

      const logoUrl = 'https://www.sulandrahealth.com/assets/mainlogo.png';
      const emailHtml = `<div style="margin:0;background:#f3f7fb;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#102448"><div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe6f2;border-radius:18px;overflow:hidden"><div style="padding:30px;background:linear-gradient(135deg,#dceffc,#8ec4e8)"><img src="${logoUrl}" alt="Sulandra Health" style="width:230px;max-width:75%;height:auto;display:block"><p style="margin:22px 0 4px;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Sulandra Community Living Services</p><h1 style="margin:8px 0;font-size:34px;line-height:1.15">Offer of Employment</h1><p style="margin:0;font-size:17px">A Division of Sulandra Health</p></div><div style="padding:34px"><p>Dear ${application.firstName},</p><p>We are pleased to offer you employment with <strong>Sulandra Community Living Services</strong> in the position of <strong>${input.positionTitle}</strong>. We appreciate the time you invested in our selection process and believe your experience, professionalism, and commitment to person-centered care will be valuable to our organization and the individuals we serve.</p><p>Your complete job terms, responsibilities, company commitments, and conditions of the offer are available through the secure link below.</p><p style="margin:28px 0"><a href="${offerUrl}" style="display:inline-block;padding:14px 22px;background:#075985;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:800">Review and Sign Offer of Employment</a></p><p>This link is personal to you. Please do not forward or share it. No tax, banking, identity-verification, or onboarding paperwork is requested during this offer stage.</p><p>After you accept the offer and the Sulandra Human Resources Department creates your employee profile, you will receive a separate welcome message with secure employee-portal access and onboarding instructions.</p><p style="margin-top:30px"><strong>Sulandra Human Resources Department</strong><br>Sulandra Community Living Services<br>A Division of Sulandra Health</p><p style="font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:16px">This offer remains subject to satisfactory completion of applicable job requirements, background screening, drug testing, credential verification, and other lawful pre-employment conditions.</p></div></div></div>`;

      await sendMail(
        application.email,
        `Offer of Employment — ${input.positionTitle}`,
        emailHtml,
        `Sulandra Human Resources Department is pleased to offer you the position of ${input.positionTitle}. Review and sign your offer here: ${offerUrl}`,
      );

      await audit(auth, 'SEND_EMPLOYMENT_OFFER', 'EmploymentOffer', offerId, { applicationId, positionTitle: input.positionTitle, payAmount: input.payAmount });
      res.status(201).json({ data: { offerId, status: 'OFFER_PENDING', applicationStatus: 'OFFER_PENDING', offerUrl, requiredDocuments } });
    } catch (error) { next(error); }
  });

  app.get('/public/careers/offers/:token', async (req, res, next) => {
    try {
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      if (offer.status === 'OFFER_SENT') {
        await prisma.$executeRawUnsafe(`UPDATE "EmploymentOffer" SET "status"='OFFER_VIEWED',"viewedAt"=COALESCE("viewedAt",NOW()),"updatedAt"=NOW() WHERE "id"=$1`, offer.id);
      }
      res.json({ data: { ...offer, tokenHash: undefined, documentProgress: await documentProgress(prisma, offer.id) } });
    } catch (error) { next(error); }
  });

  app.post('/public/careers/offers/:token/accept', async (req, res, next) => {
    try {
      const input = acceptSchema.parse(req.body);
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`UPDATE "EmploymentOffer" SET "status"='OFFER_ACCEPTED',"acceptedAt"=NOW(),"acceptedByName"=$1,"signature"=$2,"updatedAt"=NOW() WHERE "id"=$3`, input.fullLegalName, input.signature, offer.id);
        await tx.$executeRawUnsafe(`UPDATE "EmployeeApplication" SET "workflowStatus"='OFFER_ACCEPTED',"updatedAt"=NOW() WHERE "id"=$1`, offer.applicationId);
      });

      await audit({}, 'ACCEPT_EMPLOYMENT_OFFER', 'EmploymentOffer', offer.id, { applicationId: offer.applicationId, acceptedByName: input.fullLegalName });
      res.json({ data: { status: 'OFFER_ACCEPTED', applicationStatus: 'OFFER_ACCEPTED', message: 'Your signed offer of employment has been received. The Sulandra Human Resources Department will review it and contact you with the next steps.' } });
    } catch (error) { next(error); }
  });
}
