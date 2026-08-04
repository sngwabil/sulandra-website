import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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

const openingStatus = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']);
const communicationMethod = z.enum(['EMAIL', 'SMS']);

const openingSchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(120),
  department: z.string().trim().max(120).optional(),
  employmentType: z.string().trim().max(120).optional(),
  locationText: z.string().trim().max(180).optional(),
  payRange: z.string().trim().max(120).optional(),
  summary: z.string().trim().min(10).max(1000),
  description: z.string().trim().min(20).max(20000),
  requirements: z.string().trim().max(10000).optional(),
  benefits: z.string().trim().max(10000).optional(),
  applicationPath: z.string().trim().max(300).optional(),
  status: openingStatus.default('DRAFT'),
  opensAt: z.coerce.date().optional(),
  closesAt: z.coerce.date().optional(),
});

const documentSchema = z.object({
  category: z.enum([
    'APPLICATION', 'RESUME', 'COVER_LETTER', 'CPR', 'FIRST_AID',
    'LPN_LICENSE', 'RN_LICENSE', 'DRIVER_LICENSE', 'AUTO_INSURANCE',
    'TB_TEST', 'PHYSICAL', 'BACKGROUND_CHECK', 'SOCIAL_SECURITY_CARD',
    'REFERENCES', 'OTHER',
  ]),
  label: z.string().trim().min(1).max(120),
  fileName: z.string().max(255).optional(),
  downloadUrl: z.string().url().optional(),
  storagePath: z.string().max(1000).optional(),
  mimeType: z.string().max(160).optional(),
  sizeBytes: z.number().int().nonnegative().max(50_000_000).optional(),
  fileDataBase64: z.string().max(70_000_000).optional(),
}).superRefine((document, ctx) => {
  if (!document.downloadUrl && !document.storagePath && !document.fileDataBase64) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Document content is required.' });
  }
});

const publicApplicationSchema = z.object({
  jobOpeningId: z.string().optional(),
  jobSlug: z.string().optional(),
  sourceExternalId: z.string().trim().max(200).optional(),
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().min(1).max(80),
  email: z.union([z.string().trim().email(), z.literal('')]).optional(),
  phone: z.union([z.string().trim().min(7).max(30), z.literal('')]).optional(),
  preferredCommunication: communicationMethod.default('EMAIL'),
  appliedRole: z.nativeEnum(UserRole).default(UserRole.DSP),
  notes: z.string().max(12000).nullish(),
  source: z.string().trim().max(60).default('CAREERS'),
  applicationData: z.unknown().optional(),
  assessmentAnswers: z.unknown().optional(),
  documents: z.array(documentSchema).max(30).default([]),
}).superRefine((input, ctx) => {
  if (!input.email && !input.phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'Email or phone is required.' });
  }
  if (input.preferredCommunication === 'EMAIL' && !input.email) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: 'Email is required for email communication.' });
  }
  if (input.preferredCommunication === 'SMS' && !input.phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Phone is required for SMS communication.' });
  }
});

function referenceNumber() {
  return `SCLS-APP-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function requiredCategories(role: UserRole): string[] {
  switch (role) {
    case UserRole.DSP:
      return ['RESUME', 'DRIVER_LICENSE'];
    case UserRole.DRIVER:
      return ['RESUME', 'DRIVER_LICENSE', 'AUTO_INSURANCE', 'BACKGROUND_CHECK'];
    case UserRole.LPN:
      return ['RESUME', 'LPN_LICENSE'];
    case UserRole.RN:
    case UserRole.DELEGATING_NURSE:
      return ['RESUME', 'RN_LICENSE'];
    case UserRole.COO:
    case UserRole.GENERAL:
    default:
      return ['RESUME'];
  }
}

function contentStoragePath(applicationId: string, document: z.infer<typeof documentSchema>) {
  const safeName = (document.fileName || `${document.category.toLowerCase()}.bin`).replace(/[^a-zA-Z0-9._-]/g, '_');
  return `database://applicant-documents/${applicationId}/${randomUUID()}-${safeName}`;
}

export function registerCareersRoutes(
  app: express.Express,
  prisma: PrismaClient,
  helpers: Helpers,
) {
  const { authOf, requireRoles, audit } = helpers;

  app.get('/public/careers/openings', async (_req, res, next) => {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","title","slug","department","employmentType","locationText","payRange","summary","description","requirements","benefits","applicationPath","appliedRole","opensAt","closesAt"
         FROM "JobOpening"
         WHERE "status"='PUBLISHED'
           AND ("opensAt" IS NULL OR "opensAt"<=NOW())
           AND ("closesAt" IS NULL OR "closesAt">NOW())
         ORDER BY "publishedAt" DESC NULLS LAST, "createdAt" DESC`,
      );
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.post('/public/careers/applications', async (req, res, next) => {
    try {
      const input = publicApplicationSchema.parse(req.body);
      let opening: any = null;

      if (input.jobOpeningId) {
        [opening] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "JobOpening" WHERE "id"=$1 AND "status"='PUBLISHED'`,
          input.jobOpeningId,
        );
      } else if (input.jobSlug) {
        [opening] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "JobOpening" WHERE "slug"=$1 AND "status"='PUBLISHED' ORDER BY "publishedAt" DESC LIMIT 1`,
          input.jobSlug,
        );
      }

      if ((input.jobOpeningId || input.jobSlug) && !opening) {
        return res.status(404).json({ error: 'The selected job opening is no longer available.' });
      }

      const organizationId = opening?.organizationId || process.env.CAREERS_ORGANIZATION_ID;
      if (!organizationId) return res.status(503).json({ error: 'Careers intake is not configured.' });

      if (input.sourceExternalId) {
        const existing = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","referenceNumber","applicantUsername","notificationStatus" FROM "EmployeeApplication" WHERE "sourceExternalId"=$1 LIMIT 1`,
          input.sourceExternalId,
        );
        if (existing[0]) return res.json({ data: existing[0], duplicate: true });
      }

      const id = randomUUID();
      const ref = referenceNumber();
      const email = input.email?.toLowerCase() || null;
      const phone = input.phone || null;
      const applicantUsername = email || `applicant-${ref.toLowerCase()}`;
      const temporaryPassword = randomBytes(12).toString('base64url');
      const temporaryPasswordHash = createHash('sha256').update(temporaryPassword).digest('hex');
      const portalUrl = process.env.APPLICANT_PORTAL_URL || 'https://sulandrahealth.com/applicant-portal.html';
      const applicationPayload = JSON.stringify({
        applicationData: input.applicationData ?? null,
        assessmentAnswers: input.assessmentAnswers ?? null,
        preferredCommunication: input.preferredCommunication,
      });

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "EmployeeApplication"
           ("id","organizationId","jobOpeningId","firstName","middleName","lastName","email","phone","appliedRole","status","notes","source","sourceExternalId","referenceNumber","folderCreatedAt","submittedAt","applicantUsername","temporaryPasswordHash","mustChangePassword","preferredCommunication","applicationData","notificationStatus","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RECEIVED',$10,$11,$12,$13,NOW(),NOW(),$14,$15,TRUE,$16,$17,'QUEUED',NOW(),NOW())`,
          id, organizationId, opening?.id ?? null, input.firstName, input.middleName ?? null,
          input.lastName, email, phone, input.appliedRole, input.notes ?? null, input.source,
          input.sourceExternalId ?? null, ref, applicantUsername, temporaryPasswordHash,
          input.preferredCommunication, applicationPayload,
        );

        const provided = new Map(input.documents.map((document) => [document.category, document]));
        const categories = new Set<string>([
          ...requiredCategories(input.appliedRole),
          'APPLICATION',
          ...input.documents.map((document) => document.category),
        ]);

        for (const category of categories) {
          const document = provided.get(category as any);
          const hasContent = Boolean(document?.downloadUrl || document?.storagePath || document?.fileDataBase64);
          const storagePath = document?.storagePath || (document?.fileDataBase64 ? contentStoragePath(id, document) : null);
          await tx.$executeRawUnsafe(
            `INSERT INTO "ApplicantDocument"
             ("id","applicationId","category","label","status","fileName","storagePath","downloadUrl","mimeType","sizeBytes","fileDataBase64","uploadedByType","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
            randomUUID(), id, category, document?.label ?? category.replaceAll('_', ' '),
            hasContent ? 'RECEIVED' : 'MISSING', document?.fileName ?? null, storagePath,
            document?.downloadUrl ?? null, document?.mimeType ?? null, document?.sizeBytes ?? null,
            document?.fileDataBase64 ?? null, hasContent ? 'APPLICANT' : null,
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO "ApplicantMessage"
           ("id","applicationId","type","subject","body","recipientEmail","recipientPhone","deliveryStatus","createdAt")
           VALUES ($1,$2,'PORTAL_ACCESS',$3,$4,$5,$6,'QUEUED',NOW())`,
          randomUUID(), id,
          'Your Sulandra Health applicant portal access',
          `Welcome ${input.firstName}. Username: ${applicantUsername}. Temporary password: ${temporaryPassword}. Portal: ${portalUrl}. You must change your password at first login.`,
          email, phone,
        );
      });

      res.status(201).json({
        data: {
          id,
          referenceNumber: ref,
          status: 'RECEIVED',
          applicantUsername,
          applicantPortalUrl: portalUrl,
          notificationStatus: 'QUEUED',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/job-openings', requireRoles(UserRole.ADMINISTRATOR), async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT j.*, COUNT(a."id")::int AS "applicantCount"
         FROM "JobOpening" j LEFT JOIN "EmployeeApplication" a ON a."jobOpeningId"=j."id"
         WHERE j."organizationId"=$1 GROUP BY j."id" ORDER BY j."createdAt" DESC`,
        auth.organizationId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/job-openings', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = openingSchema.parse(req.body);
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "JobOpening"
         ("id","organizationId","title","slug","department","employmentType","locationText","payRange","summary","description","requirements","benefits","applicationPath","status","opensAt","closesAt","publishedAt","createdById","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,CASE WHEN $14='PUBLISHED' THEN NOW() ELSE NULL END,$17,NOW(),NOW())`,
        id, auth.organizationId, input.title, input.slug, input.department ?? null,
        input.employmentType ?? null, input.locationText ?? null, input.payRange ?? null,
        input.summary, input.description, input.requirements ?? null, input.benefits ?? null,
        input.applicationPath ?? null, input.status, input.opensAt ?? null, input.closesAt ?? null,
        auth.userId,
      );
      await audit(auth, 'CREATE_JOB_OPENING', 'JobOpening', id, { status: input.status, title: input.title });
      res.status(201).json({ data: { id, ...input } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/applications/:id/folder', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const id = String(req.params.id);
      const applications = await prisma.$queryRawUnsafe<any[]>(
        `SELECT a.*, j."title" AS "jobTitle" FROM "EmployeeApplication" a
         LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
         WHERE a."id"=$1 AND a."organizationId"=$2`, id, auth.organizationId,
      );
      if (!applications[0]) return res.status(404).json({ error: 'Application not found' });
      const [documents, messages, interviews] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ApplicantDocument" WHERE "applicationId"=$1 ORDER BY "category","version" DESC`, id),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ApplicantMessage" WHERE "applicationId"=$1 ORDER BY "createdAt" DESC`, id),
        prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "InterviewOption" WHERE "applicationId"=$1 ORDER BY "startsAt"`, id),
      ]);
      res.json({ data: { application: applications[0], documents, messages, interviews } });
    } catch (error) { next(error); }
  });
}
