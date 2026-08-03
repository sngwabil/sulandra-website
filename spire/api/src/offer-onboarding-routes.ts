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
  requiredDocuments: z.array(z.string().trim().min(2).max(120)).max(50).optional(),
});

const acceptSchema = z.object({
  fullLegalName: z.string().trim().min(2).max(180),
  signature: z.string().trim().min(2).max(500),
  acceptedTerms: z.literal(true),
});

const onboardingCompleteSchema = z.object({
  fullLegalName: z.string().trim().min(2).max(180),
  signature: z.string().trim().min(2).max(500),
});

const DEFAULT_ONBOARDING_DOCUMENTS = [
  'Form W-4',
  'Form I-9',
  'Direct Deposit Authorization',
  'Emergency Contact Form',
  'Confidentiality Agreement',
  'HIPAA Acknowledgment',
  'Non-Disclosure Agreement',
  'Employee Handbook Acknowledgment',
  'Drug-Free Workplace Policy',
  'Background Check Authorization',
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
  await smtpTransporter().sendMail({ from: `Human Resources <${sender}>`, to, subject, html, text });
}

function slug(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
}

async function uniqueUsername(prisma: PrismaClient, firstName: string, lastName: string) {
  const base = `${slug(firstName).slice(0, 1)}${slug(lastName)}` || `employee${randomBytes(2).toString('hex')}`;
  for (let index = 0; index < 1000; index += 1) {
    const local = index === 0 ? base : `${base}${index + 1}`;
    const username = `${local}@sulandrahealth.com`;
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id" FROM "User" WHERE lower(COALESCE(to_jsonb("User")->>'username',to_jsonb("User")->>'email',''))=lower($1) LIMIT 1`,
      username,
    );
    if (!rows[0]) return username;
  }
  throw new Error('Unable to generate a unique employee username.');
}

function temporaryPassword() {
  return `Scl$${randomBytes(9).toString('base64url')}9a`;
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
  return { documents, completed, total: documents.length, allComplete: documents.length > 0 && completed === documents.length };
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

async function provisionEmployee(prisma: PrismaClient, offer: any) {
  if (offer.employeeId) return { employeeId: offer.employeeId, username: null, temporaryPassword: null };
  if (offer.status !== 'OFFER_ACCEPTED') throw new Error('The applicant must accept and sign the conditional offer before they can be hired.');

  const username = await uniqueUsername(prisma, offer.firstName, offer.lastName);
  const password = temporaryPassword();
  const passwordHash = createHash('sha256').update(password).digest('hex');
  const employeeId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "User" ("id","organizationId","email","username","personalEmail","firstName","lastName","phone","role","passwordHash","isActive","mustChangePassword","createdAt","updatedAt")
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,true,true,NOW(),NOW())`,
      employeeId,
      offer.organizationId,
      username,
      offer.email,
      offer.firstName,
      offer.lastName,
      offer.phone ?? null,
      offer.appliedRole || UserRole.DSP,
      passwordHash,
    );
    await tx.$executeRawUnsafe(
      `UPDATE "EmploymentOffer" SET "status"='EMPLOYEE_CREATED',"employeeId"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
      employeeId,
      offer.id,
    );
    await tx.$executeRawUnsafe(
      `UPDATE "EmployeeApplication" SET "workflowStatus"='HIRED',"employeeId"=$1,"updatedAt"=NOW() WHERE "id"=$2`,
      employeeId,
      offer.applicationId,
    );
  });

  return { employeeId, username, temporaryPassword: password };
}

export function registerOfferOnboardingRoutes(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;

  app.get('/api/admin/applications/:id/offer-progress', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const applicationId = String(req.params.id);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT o.*,a."firstName",a."lastName",a."email",a."phone",a."appliedRole",a."organizationId"
           FROM "EmploymentOffer" o
           JOIN "EmployeeApplication" a ON a."id"=o."applicationId"
          WHERE o."applicationId"=$1 AND o."organizationId"=$2
          LIMIT 1`,
        applicationId,
        auth.organizationId,
      );
      const offer = rows[0];
      if (!offer) return res.json({ data: { offer: null, progress: null } });
      const progress = await documentProgress(prisma, offer.id);
      res.json({
        data: {
          offer: {
            id: offer.id,
            status: offer.status,
            positionTitle: offer.positionTitle,
            employmentType: offer.employmentType,
            compensationType: offer.compensationType,
            payAmount: offer.payAmount,
            supervisorName: offer.supervisorName,
            startDate: offer.startDate,
            orientationDate: offer.orientationDate,
            workLocation: offer.workLocation,
            viewedAt: offer.viewedAt,
            acceptedAt: offer.acceptedAt,
            employeeId: offer.employeeId,
            createdAt: offer.createdAt,
            tokenExpiresAt: offer.tokenExpiresAt,
          },
          progress,
        },
      });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/applications/:id/offers', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const applicationId = String(req.params.id);
      const input = offerSchema.parse(req.body);
      const onboardingDocuments = input.requiredDocuments?.length ? input.requiredDocuments : DEFAULT_ONBOARDING_DOCUMENTS;
      const [application] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "EmployeeApplication" WHERE "id"=$1 AND "organizationId"=$2`,
        applicationId,
        auth.organizationId,
      );
      if (!application) return res.status(404).json({ error: 'Application not found.' });

      const offerId = randomUUID();
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const offerUrlBase = process.env.OFFER_PORTAL_URL || 'https://www.sulandrahealth.com/offer-acceptance.html';
      const offerUrl = `${offerUrlBase}?token=${encodeURIComponent(rawToken)}`;

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "EmploymentOffer" ("id","organizationId","applicationId","status","positionTitle","department","supervisorName","employmentType","compensationType","payAmount","shift","startDate","orientationDate","workLocation","ptoEligible","benefitsEligible","probationDays","bonusAmount","notes","requiredDocuments","tokenHash","tokenExpiresAt","createdById","createdAt","updatedAt")
           VALUES ($1,$2,$3,'OFFER_SENT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,NOW()+INTERVAL '14 days',$21,NOW(),NOW())`,
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
          JSON.stringify(onboardingDocuments),
          tokenHash,
          auth.userId,
        );
        for (const name of onboardingDocuments) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "EmploymentOfferDocument" ("id","offerId","name","status","createdAt","updatedAt") VALUES ($1,$2,$3,'PENDING',NOW(),NOW())`,
            randomUUID(),
            offerId,
            name,
          );
        }
        await tx.$executeRawUnsafe(
          `UPDATE "EmployeeApplication" SET "workflowStatus"='OFFER_SENT',"updatedAt"=NOW() WHERE "id"=$1`,
          applicationId,
        );
      });

      const emailHtml = `<p>Dear ${application.firstName},</p><p>We are pleased to offer you the position of <strong>${input.positionTitle}</strong> with Sulandra Community Living Services.</p><p>Please use the secure link below to review the job terms and electronically sign the conditional employment offer:</p><p><a href="${offerUrl}">Review and accept your employment offer</a></p><p>No banking, Social Security, tax, identity-verification, background-check, or other sensitive onboarding information is requested at this stage. After you accept the offer and Human Resources creates your employee profile, you will receive a welcome email and complete the required onboarding package securely through the employee portal.</p><p><strong>Human Resources</strong><br>Sulandra Community Living Services<br>A Division of Sulandra Health</p>`;
      await sendMail(
        application.email,
        `Conditional Employment Offer — ${input.positionTitle}`,
        emailHtml,
        `We are pleased to offer you the position of ${input.positionTitle}. Review and sign your conditional offer here: ${offerUrl}. Onboarding paperwork will be provided later through the employee portal.`,
      );
      await audit(auth, 'SEND_EMPLOYMENT_OFFER', 'EmploymentOffer', offerId, { applicationId, positionTitle: input.positionTitle, payAmount: input.payAmount });
      res.status(201).json({ data: { offerId, status: 'OFFER_SENT', offerUrl, onboardingDocuments } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/applications/:id/hire', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const applicationId = String(req.params.id);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT o.*,a."firstName",a."lastName",a."email",a."phone",a."appliedRole",a."organizationId"
           FROM "EmploymentOffer" o
           JOIN "EmployeeApplication" a ON a."id"=o."applicationId"
          WHERE o."applicationId"=$1 AND o."organizationId"=$2
          LIMIT 1`,
        applicationId,
        auth.organizationId,
      );
      const offer = rows[0];
      if (!offer) return res.status(404).json({ error: 'A signed conditional employment offer is required before hiring.' });
      if (offer.employeeId) return res.json({ data: { status: 'EMPLOYEE_CREATED', employeeId: offer.employeeId } });

      const provisioned = await provisionEmployee(prisma, offer);
      const portalUrl = process.env.EMPLOYEE_PORTAL_URL || 'https://www.sulandrahealth.com/employee-login.html';
      const progress = await documentProgress(prisma, offer.id);
      const welcomeHtml = `<h1>Welcome to Sulandra Community Living Services</h1><p>Dear ${offer.firstName} ${offer.lastName},</p><p>Congratulations, and welcome to <strong>Sulandra Community Living Services (SCLS), a division of Sulandra Health.</strong></p><p>Your signed conditional offer has been received and Human Resources has created your employee profile.</p><h2>Your Employee Account</h2><p><strong>Employee Username:</strong><br>${provisioned.username}</p><p><strong>Temporary Password:</strong><br>${provisioned.temporaryPassword}</p><p><strong>Employee Portal:</strong><br><a href="${portalUrl}">${portalUrl}</a></p><p>You must change your temporary password after your first successful login.</p><h2>Your Onboarding Package</h2><p>${progress.total} required onboarding item(s) have been assigned to your employee portal. Log in to complete and submit your tax, identity-verification, direct-deposit, emergency-contact, background-check, policy, and role-specific requirements securely.</p><p>Your employment remains conditional until all required background screening, drug testing, identity and work-authorization verification, credential verification, and other applicable requirements are satisfactorily completed.</p><p>Your supervisor will contact you regarding orientation, work assignment, and first-day instructions.</p><p><strong>Human Resources</strong><br>Sulandra Community Living Services<br>A Division of Sulandra Health</p>`;
      await sendMail(
        offer.email,
        'Welcome to Sulandra Community Living Services — Complete Your Onboarding',
        welcomeHtml,
        `Welcome to Sulandra Community Living Services. Username: ${provisioned.username}. Temporary password: ${provisioned.temporaryPassword}. Portal: ${portalUrl}. Complete your assigned onboarding package in the employee portal. Employment remains conditional until all required clearances are completed.`,
      );
      await audit(auth, 'FINALIZE_HIRE_AND_CREATE_EMPLOYEE', 'EmploymentOffer', offer.id, { applicationId, employeeId: provisioned.employeeId, onboardingDocumentCount: progress.total });
      res.json({ data: { status: 'EMPLOYEE_CREATED', employeeId: provisioned.employeeId, username: provisioned.username, onboardingStatus: 'PENDING', onboardingDocumentCount: progress.total, welcomeDelivery: 'SENT' } });
    } catch (error) { next(error); }
  });

  app.get('/public/careers/offers/:token', async (req, res, next) => {
    try {
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      if (offer.status === 'OFFER_SENT') {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmploymentOffer" SET "status"='OFFER_VIEWED',"viewedAt"=COALESCE("viewedAt",NOW()),"updatedAt"=NOW() WHERE "id"=$1`,
          offer.id,
        );
      }
      const { tokenHash: _tokenHash, requiredDocuments: _requiredDocuments, ...publicOffer } = offer;
      res.json({ data: publicOffer });
    } catch (error) { next(error); }
  });

  app.post('/public/careers/offers/:token/accept', async (req, res, next) => {
    try {
      const input = acceptSchema.parse(req.body);
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      if (offer.employeeId) return res.json({ data: { status: 'EMPLOYEE_CREATED', employeeId: offer.employeeId } });
      await prisma.$executeRawUnsafe(
        `UPDATE "EmploymentOffer" SET "status"='OFFER_ACCEPTED',"acceptedAt"=COALESCE("acceptedAt",NOW()),"acceptedByName"=$1,"signature"=$2,"updatedAt"=NOW() WHERE "id"=$3`,
        input.fullLegalName,
        input.signature,
        offer.id,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeApplication" SET "workflowStatus"='OFFER_ACCEPTED',"updatedAt"=NOW() WHERE "id"=$1`,
        offer.applicationId,
      );
      res.json({ data: { status: 'OFFER_ACCEPTED', message: 'Your signed conditional offer has been received. Human Resources will create your employee profile and send your welcome and onboarding instructions separately.' } });
    } catch (error) { next(error); }
  });

  app.post('/public/careers/offers/:token/documents/:documentId/complete', async (_req, res) => {
    res.status(403).json({ error: 'Onboarding documents are available only after offer acceptance and employee-profile creation through the authenticated employee portal.' });
  });

  app.get('/api/employee/onboarding', async (_req, res) => {
    res.status(501).json({ error: 'Use the authenticated employee portal onboarding service configured for this deployment.' });
  });

  app.post('/api/employee/onboarding/:documentId/complete', async (req, res, next) => {
    try {
      const input = onboardingCompleteSchema.parse(req.body);
      const employeeId = String((res.locals as any)?.auth?.userId || '');
      if (!employeeId) return res.status(401).json({ error: 'Authentication required.' });
      const [offer] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "EmploymentOffer" WHERE "employeeId"=$1 LIMIT 1`,
        employeeId,
      );
      if (!offer) return res.status(404).json({ error: 'Employee onboarding package not found.' });
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE "EmploymentOfferDocument" SET "status"='COMPLETED',"signature"=$1,"signedByName"=$2,"completedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$3 AND "offerId"=$4`,
        input.signature,
        input.fullLegalName,
        String(req.params.documentId),
        offer.id,
      );
      if (!updated) return res.status(404).json({ error: 'Onboarding document not found.' });
      const progress = await documentProgress(prisma, offer.id);
      if (progress.allComplete) {
        await prisma.$executeRawUnsafe(
          `UPDATE "EmploymentOffer" SET "status"='DOCUMENTS_COMPLETE',"documentsCompletedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$1`,
          offer.id,
        );
      }
      res.json({ data: progress });
    } catch (error) { next(error); }
  });
}
