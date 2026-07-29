import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  provisionApplicantWorkflow,
  recordAndDeliver,
  registerApplicantWorkflowRoutes,
} from './applicant-workflow.js';

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
const applicantRole = z.enum(['DSP', 'LPN', 'RN', 'DELEGATING_NURSE', 'DRIVER', 'GENERAL']);
const communicationChannel = z.enum(['EMAIL', 'SMS']);
const documentCategory = z.enum([
  'APPLICATION', 'RESUME', 'COVER_LETTER', 'CPR', 'FIRST_AID',
  'LPN_LICENSE', 'RN_LICENSE', 'DRIVER_LICENSE', 'AUTO_INSURANCE',
  'TB_TEST', 'PHYSICAL', 'BACKGROUND_CHECK', 'SOCIAL_SECURITY_CARD',
  'REFERENCES', 'OTHER',
]);

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
  category: documentCategory,
  label: z.string().trim().min(1).max(120),
  fileName: z.string().max(255).optional(),
  downloadUrl: z.string().url().optional(),
  storagePath: z.string().max(1000).optional(),
  mimeType: z.string().max(160).optional(),
  sizeBytes: z.number().int().nonnegative().max(20_000_000).optional(),
  fileDataBase64: z.string().optional(),
});

const publicApplicationSchema = z.object({
  jobOpeningId: z.string().optional(),
  jobSlug: z.string().optional(),
  sourceExternalId: z.string().trim().max(200).optional(),
  firstName: z.string().trim().min(1).max(80),
  middleName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().min(1).max(80),
  email: z.union([z.string().trim().email(), z.literal('')]).optional(),
  phone: z.string().trim().max(30).optional(),
  preferredCommunication: communicationChannel.default('EMAIL'),
  appliedRole: applicantRole.default('DSP'),
  notes: z.string().max(12000).optional(),
  applicationData: z.record(z.string(), z.unknown()).default({}),
  assessmentAnswers: z.record(z.string(), z.unknown()).optional(),
  documents: z.array(documentSchema).max(30).default([]),
}).refine((value) => Boolean(value.email || (value.phone && value.phone.length >= 7)), {
  message: 'An email address or phone number is required.',
  path: ['email'],
}).refine((value) => value.preferredCommunication !== 'EMAIL' || Boolean(value.email), {
  message: 'Email is required when email is the preferred communication method.',
  path: ['preferredCommunication'],
}).refine((value) => value.preferredCommunication !== 'SMS' || Boolean(value.phone), {
  message: 'Phone is required when SMS is the preferred communication method.',
  path: ['preferredCommunication'],
});

type ApplicantRole = z.infer<typeof applicantRole>;
type ApplicantDocument = z.infer<typeof documentSchema>;
type DocumentCategory = z.infer<typeof documentCategory>;

function referenceNumber() {
  return `SCLS-APP-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function requiredCategories(role: ApplicantRole): DocumentCategory[] {
  if (role === 'RN' || role === 'DELEGATING_NURSE') {
    return ['RESUME', 'CPR', 'RN_LICENSE'];
  }
  if (role === 'LPN') return ['RESUME', 'CPR', 'LPN_LICENSE'];
  if (role === 'DRIVER') return ['RESUME', 'DRIVER_LICENSE', 'AUTO_INSURANCE', 'BACKGROUND_CHECK'];
  if (role === 'DSP') return ['RESUME', 'CPR', 'DRIVER_LICENSE'];
  return ['RESUME', 'COVER_LETTER', 'REFERENCES'];
}

function roleForOpening(title: string, department?: string | null): ApplicantRole {
  const value = `${title} ${department ?? ''}`.toLowerCase();
  if (/delegating nurse/.test(value)) return 'DELEGATING_NURSE';
  if (/\brn\b|registered nurse|nursing/.test(value)) return 'RN';
  if (/\blpn\b|licensed practical nurse/.test(value)) return 'LPN';
  if (/nemt|transportation specialist|van driver|\bdriver\b/.test(value)) return 'DRIVER';
  if (/\bdsp\b|direct support|aide|caregiver/.test(value)) return 'DSP';
  return 'GENERAL';
}

function applicationPathForOpening(row: any) {
  if (row.applicationPath) {
    const path = String(row.applicationPath).trim();
    if (/[?&]opening=/.test(path)) return path;
    return `${path}${path.includes('?') ? '&' : '?'}opening=${encodeURIComponent(row.slug)}`;
  }
  const role = roleForOpening(row.title, row.department);
  if (role === 'DSP') return `/applydsp.html?opening=${encodeURIComponent(row.slug)}`;
  if (role === 'LPN' || role === 'RN' || role === 'DELEGATING_NURSE') {
    return `/applylpn.html?opening=${encodeURIComponent(row.slug)}&role=${role}`;
  }
  if (role === 'DRIVER') return `/applydriver.html?opening=${encodeURIComponent(row.slug)}`;
  return `/applygeneral.html?opening=${encodeURIComponent(row.slug)}`;
}

export function registerCareersRoutes(
  app: express.Express,
  prisma: PrismaClient,
  helpers: Helpers,
) {
  const { authOf, requireRoles, audit } = helpers;

  let cachedCareersOrganizationId: string | null = null;
  let careersOrganizationLookup: Promise<string | null> | null = null;

  async function resolveCareersOrganizationId(): Promise<string | null> {
    const configuredOrganizationId = process.env.CAREERS_ORGANIZATION_ID?.trim();
    if (configuredOrganizationId) return configuredOrganizationId;
    if (cachedCareersOrganizationId) return cachedCareersOrganizationId;

    if (!careersOrganizationLookup) {
      const administratorEmail = (
        process.env.ADMIN_EMAIL ?? 'admin@sulandrahealth.com'
      ).trim().toLowerCase();
      careersOrganizationLookup = prisma.$queryRawUnsafe<Array<{ organizationId: string }>>(
        `SELECT "organizationId"
           FROM "User"
          WHERE LOWER("email")=LOWER($1)
            AND "role"::text='ADMINISTRATOR'
          ORDER BY "createdAt" ASC
          LIMIT 1`,
        administratorEmail,
      ).then((rows) => {
        const organizationId = rows[0]?.organizationId?.trim() || null;
        if (organizationId) cachedCareersOrganizationId = organizationId;
        return organizationId;
      }).finally(() => {
        careersOrganizationLookup = null;
      });
    }
    return careersOrganizationLookup;
  }

  app.get('/public/careers/openings', async (_req, res, next) => {
    try {
      const organizationId = await resolveCareersOrganizationId();
      if (!organizationId) {
        res.status(503).json({ error: 'Careers intake is not configured.' });
        return;
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","title","slug","department","employmentType","locationText","payRange",
                "summary","description","requirements","benefits","applicationPath","opensAt","closesAt"
           FROM "JobOpening"
          WHERE "organizationId"=$1
            AND "status"='PUBLISHED'
            AND ("opensAt" IS NULL OR "opensAt"<=NOW())
            AND ("closesAt" IS NULL OR "closesAt">NOW())
          ORDER BY "publishedAt" DESC NULLS LAST, "createdAt" DESC`,
        organizationId,
      );
      res.json({
        data: rows.map((row) => ({
          ...row,
          appliedRole: roleForOpening(row.title, row.department),
          applicationPath: applicationPathForOpening(row),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/public/careers/applications', async (req, res, next) => {
    let createdApplicationId: string | null = null;
    try {
      const input = publicApplicationSchema.parse(req.body);
      const organizationId = await resolveCareersOrganizationId();
      if (!organizationId) {
        res.status(503).json({ error: 'Careers intake is not configured.' });
        return;
      }

      let opening: { id: string; title: string; department?: string | null } | null = null;
      if (input.jobOpeningId) {
        [opening] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","title","department" FROM "JobOpening"
            WHERE "id"=$1 AND "organizationId"=$2 AND "status"='PUBLISHED'`,
          input.jobOpeningId,
          organizationId,
        );
      } else if (input.jobSlug) {
        [opening] = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","title","department" FROM "JobOpening"
            WHERE "slug"=$1 AND "organizationId"=$2 AND "status"='PUBLISHED'
            ORDER BY "publishedAt" DESC LIMIT 1`,
          input.jobSlug,
          organizationId,
        );
      }
      if ((input.jobOpeningId || input.jobSlug) && !opening) {
        res.status(404).json({ error: 'Published job opening not found.' });
        return;
      }

      if (input.sourceExternalId) {
        const existing = await prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","referenceNumber","workflowStatus" AS "status"
             FROM "EmployeeApplication"
            WHERE "sourceExternalId"=$1 AND "organizationId"=$2 LIMIT 1`,
          input.sourceExternalId,
          organizationId,
        );
        if (existing[0]) {
          res.json({ data: existing[0], duplicate: true });
          return;
        }
      }

      const id = randomUUID();
      const ref = referenceNumber();
      const email = input.email?.trim().toLowerCase() || null;
      const phone = input.phone?.trim() || null;
      const derivedRole = opening
        ? roleForOpening(opening.title, opening.department)
        : input.appliedRole;
      const appliedRole = input.appliedRole === 'GENERAL' ? derivedRole : input.appliedRole;
      const jobTitle = opening?.title || String(input.applicationData.position || appliedRole);

      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeApplication"
          ("id","organizationId","jobOpeningId","firstName","middleName","lastName","email","phone",
           "appliedRole","notes","source","sourceExternalId","referenceNumber","folderCreatedAt",
           "workflowStatus","preferredCommunication","applicationData","submittedAt","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::"UserRole",$10,'CAREERS',$11,$12,NOW(),
                 'RECEIVED',$13,$14::jsonb,NOW(),NOW(),NOW())`,
        id,
        organizationId,
        opening?.id ?? null,
        input.firstName,
        input.middleName ?? null,
        input.lastName,
        email,
        phone,
        appliedRole,
        input.notes ?? null,
        input.sourceExternalId ?? null,
        ref,
        input.preferredCommunication,
        JSON.stringify(input.applicationData),
      );
      createdApplicationId = id;

      const documentsToCreate: ApplicantDocument[] = [];
      const consumedDocumentIndexes = new Set<number>();
      const placeholderCategories = [
        ...requiredCategories(appliedRole),
        'APPLICATION' as DocumentCategory,
      ];

      for (const category of new Set<DocumentCategory>(placeholderCategories)) {
        const providedIndex = input.documents.findIndex(
          (document, index) => document.category === category && !consumedDocumentIndexes.has(index),
        );
        if (providedIndex >= 0) {
          documentsToCreate.push(input.documents[providedIndex]);
          consumedDocumentIndexes.add(providedIndex);
        } else {
          documentsToCreate.push({
            category,
            label: category.replaceAll('_', ' '),
          });
        }
      }

      input.documents.forEach((document, index) => {
        if (!consumedDocumentIndexes.has(index)) documentsToCreate.push(document);
      });

      for (const document of documentsToCreate) {
        const fileData = document.fileDataBase64
          ? Buffer.from(document.fileDataBase64, 'base64')
          : null;
        if (fileData && fileData.length > 20_000_000) {
          await prisma.$executeRawUnsafe(
            `DELETE FROM "EmployeeApplication" WHERE "id"=$1`,
            id,
          );
          createdApplicationId = null;
          res.status(400).json({ error: `${document.label} exceeds the 20 MB limit.` });
          return;
        }
        const hasFile = Boolean(fileData?.length || document.downloadUrl);
        await prisma.$executeRawUnsafe(
          `INSERT INTO "ApplicantDocument"
            ("id","applicationId","category","label","status","fileName","storagePath","downloadUrl",
             "mimeType","sizeBytes","fileData","contentSha256","uploadedByType","uploadedAt","createdAt","updatedAt")
           VALUES ($1,$2,$3::"ApplicantDocumentCategory",$4,$5::"ApplicantDocumentStatus",
                   $6,$7,$8,$9,$10,$11,$12,$13::text,
                   CASE WHEN $13::text IS NOT NULL THEN NOW() ELSE NULL END,NOW(),NOW())`,
          randomUUID(),
          id,
          document.category,
          document.label,
          hasFile ? 'RECEIVED' : 'MISSING',
          document.fileName ?? null,
          document.storagePath ?? null,
          document.downloadUrl ?? null,
          document.mimeType ?? null,
          fileData?.length ?? document.sizeBytes ?? null,
          fileData,
          fileData ? createHash('sha256').update(fileData).digest('hex') : null,
          hasFile ? 'APPLICANT' : null,
        );
      }

      let workflow: Awaited<ReturnType<typeof provisionApplicantWorkflow>> | null = null;
      let workflowSetupPending = false;
      try {
        workflow = await provisionApplicantWorkflow(prisma, {
          applicationId: id,
          referenceNumber: ref,
          organizationId,
          jobTitle,
          appliedRole,
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
          email,
          phone,
          preferredCommunication: input.preferredCommunication,
          notes: input.notes,
          applicationData: {
            ...input.applicationData,
            jobTitle,
            appliedRole,
          },
          assessmentAnswers: input.assessmentAnswers,
        });
      } catch (workflowError) {
        workflowSetupPending = true;
        console.error('[careers] applicant lifecycle setup failed', {
          applicationId: id,
          referenceNumber: ref,
          error: workflowError instanceof Error ? workflowError.message : String(workflowError),
        });
      }

      // The application and its submitted documents are authoritative at this point.
      // A profile, PDF, or notification failure must not tell the applicant that the
      // submission failed or delete an application that HR can already process.
      createdApplicationId = null;
      res.status(201).json({
        data: {
          id,
          referenceNumber: ref,
          status: 'RECEIVED',
          applicantUsername: workflow?.username ?? email ?? phone,
          notificationStatus: workflow?.deliveryStatus ?? 'FAILED',
          assessment: workflow?.assessment ?? null,
          workflowSetupPending,
          applicantPortalUrl: process.env.CAREERS_PORTAL_URL
            ?? 'https://www.sulandrahealth.com/applicant-portal.html',
        },
      });
    } catch (error) {
      if (createdApplicationId) {
        const cleanupStatements = [
          `DELETE FROM "ApplicantMessage" WHERE "applicationId"=$1`,
          `DELETE FROM "ApplicantStatusHistory" WHERE "applicationId"=$1`,
          `DELETE FROM "ApplicantPortalAccount" WHERE "applicationId"=$1`,
          `DELETE FROM "ApplicantDocument" WHERE "applicationId"=$1`,
          `DELETE FROM "EmployeeApplication" WHERE "id"=$1`,
        ];

        for (const statement of cleanupStatements) {
          try {
            await prisma.$executeRawUnsafe(statement, createdApplicationId);
          } catch {
            // Continue so one absent lifecycle table cannot roll back all cleanup.
          }
        }
      }
      next(error);
    }
  });

  app.get('/api/admin/job-openings', requireRoles(UserRole.ADMINISTRATOR), async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT j.*, COUNT(a."id")::int AS "applicantCount"
           FROM "JobOpening" j
           LEFT JOIN "EmployeeApplication" a ON a."jobOpeningId"=j."id"
          WHERE j."organizationId"=$1
          GROUP BY j."id"
          ORDER BY j."createdAt" DESC`,
        auth.organizationId,
      );
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/job-openings', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = openingSchema.parse(req.body);
      const id = randomUUID();
      const [identity] = await prisma.$queryRawUnsafe<Array<{
        organizationExists: boolean;
        userExists: boolean;
      }>>(
        `SELECT
           EXISTS(SELECT 1 FROM "Organization" WHERE "id"=$1) AS "organizationExists",
           EXISTS(SELECT 1 FROM "User" WHERE "id"=$2) AS "userExists"`,
        auth.organizationId,
        auth.userId,
      );
      if (!identity?.organizationExists) {
        res.status(409).json({
          error: 'The configured careers organization does not exist in the SPIRE database.',
        });
        return;
      }
      const createdById = identity.userExists ? auth.userId : null;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "JobOpening"
          ("id","organizationId","title","slug","department","employmentType","locationText","payRange",
           "summary","description","requirements","benefits","applicationPath","status","opensAt","closesAt",
           "publishedAt","createdById","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::"JobOpeningStatus",$15,$16,
                 CASE WHEN $14='PUBLISHED' THEN NOW() ELSE NULL END,$17,NOW(),NOW())`,
        id,
        auth.organizationId,
        input.title,
        input.slug,
        input.department ?? null,
        input.employmentType ?? null,
        input.locationText ?? null,
        input.payRange ?? null,
        input.summary,
        input.description,
        input.requirements ?? null,
        input.benefits ?? null,
        input.applicationPath ?? null,
        input.status,
        input.opensAt ?? null,
        input.closesAt ?? null,
        createdById,
      );
      await audit(
        { ...auth, userId: createdById ?? undefined },
        'CREATE_JOB_OPENING',
        'JobOpening',
        id,
        { status: input.status, title: input.title },
      );
      res.status(201).json({ data: { id, ...input } });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/admin/job-openings/:id', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const id = String(req.params.id);
      const input = openingSchema.partial().parse(req.body);
      const [current] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "JobOpening" WHERE "id"=$1 AND "organizationId"=$2`,
        id,
        auth.organizationId,
      );
      if (!current) return res.status(404).json({ error: 'Opening not found' });
      const merged = { ...current, ...input };
      await prisma.$executeRawUnsafe(
        `UPDATE "JobOpening" SET
           "title"=$1,"slug"=$2,"department"=$3,"employmentType"=$4,"locationText"=$5,"payRange"=$6,
           "summary"=$7,"description"=$8,"requirements"=$9,"benefits"=$10,"applicationPath"=$11,
           "status"=$12::"JobOpeningStatus","opensAt"=$13,"closesAt"=$14,
           "publishedAt"=CASE WHEN $12='PUBLISHED' AND "publishedAt" IS NULL THEN NOW() ELSE "publishedAt" END,
           "updatedAt"=NOW()
         WHERE "id"=$15 AND "organizationId"=$16`,
        merged.title,
        merged.slug,
        merged.department,
        merged.employmentType,
        merged.locationText,
        merged.payRange,
        merged.summary,
        merged.description,
        merged.requirements,
        merged.benefits,
        merged.applicationPath,
        merged.status,
        merged.opensAt,
        merged.closesAt,
        id,
        auth.organizationId,
      );
      await audit(auth, 'UPDATE_JOB_OPENING', 'JobOpening', id, { status: merged.status });
      res.json({ data: { id, ...merged } });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/applications', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const query = z.object({
        q: z.string().trim().max(160).optional(),
        status: z.string().trim().max(60).optional(),
        jobOpeningId: z.string().trim().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }).parse(req.query);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT
           a.*,
           a."workflowStatus" AS "status",
           j."title" AS "jobTitle",
           (SELECT COUNT(*)::int FROM "ApplicantDocument" d
             WHERE d."applicationId"=a."id") AS "documentCount",
           (SELECT COUNT(*)::int FROM "ApplicantDocument" d
             WHERE d."applicationId"=a."id" AND d."status" IN ('RECEIVED','APPROVED'))
             AS "receivedDocumentCount",
           (SELECT COUNT(*)::int FROM "ApplicantDocument" d
             WHERE d."applicationId"=a."id"
               AND d."status" IN ('MISSING','REQUESTED','REJECTED','EXPIRED','RENEWAL_REQUESTED'))
             AS "outstandingDocumentCount"
         FROM "EmployeeApplication" a
         LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
         WHERE a."organizationId"=$1
           AND ($2::text IS NULL OR CONCAT_WS(' ',a."firstName",a."middleName",a."lastName",
                a."email",a."phone",a."referenceNumber") ILIKE '%' || $2::text || '%')
           AND ($3::text IS NULL OR a."workflowStatus"=$3::text)
           AND ($4::text IS NULL OR a."jobOpeningId"=$4::text)
         ORDER BY a."submittedAt" DESC NULLS LAST, a."createdAt" DESC
         LIMIT $5`,
        auth.organizationId,
        query.q || null,
        query.status || null,
        query.jobOpeningId || null,
        query.limit,
      );
      res.json({ data: rows, statuses: [
        'RECEIVED', 'REVIEWING', 'DOCUMENTS_NEEDED', 'INTERVIEW', 'OFFER_PENDING',
        'HIRED', 'NOT_SELECTED', 'WITHDRAWN', 'TERMINATED', 'POSITION_FILLED',
      ] });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/admin/applications/:id/folder', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const id = String(req.params.id);
      const applications = await prisma.$queryRawUnsafe<any[]>(
        `SELECT a.*,a."workflowStatus" AS "status",j."title" AS "jobTitle"
           FROM "EmployeeApplication" a
           LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId"
          WHERE a."id"=$1 AND a."organizationId"=$2`,
        id,
        auth.organizationId,
      );
      if (!applications[0]) return res.status(404).json({ error: 'Application not found' });
      const [documents, messages, history] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT "id","applicationId","category","label","status","version","fileName","mimeType",
                  "sizeBytes","uploadedByType","requestedAt","uploadedAt","reviewNotes","reviewedAt",
                  "createdAt","updatedAt"
             FROM "ApplicantDocument" WHERE "applicationId"=$1 ORDER BY "category","version" DESC`,
          id,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "ApplicantMessage" WHERE "applicationId"=$1 ORDER BY "createdAt" DESC`,
          id,
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM "ApplicantStatusHistory" WHERE "applicationId"=$1 ORDER BY "createdAt" DESC`,
          id,
        ),
      ]);
      res.json({
        data: {
          application: applications[0],
          documents,
          messages,
          interviews: [],
          history,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/admin/applications/:id/request-document', requireRoles(UserRole.ADMINISTRATOR), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const id = String(req.params.id);
      const input = z.object({
        category: documentCategory,
        label: z.string().min(2).max(120),
        message: z.string().max(4000).optional(),
      }).parse(req.body);
      const [application] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "EmployeeApplication" WHERE "id"=$1 AND "organizationId"=$2`,
        id,
        auth.organizationId,
      );
      if (!application) return res.status(404).json({ error: 'Application not found' });
      await prisma.$transaction(async (tx) => {
        const changed = await tx.$executeRawUnsafe(
          `UPDATE "ApplicantDocument"
              SET "status"='REQUESTED',"requestedAt"=NOW(),"updatedAt"=NOW()
            WHERE "applicationId"=$1 AND "category"=$2::"ApplicantDocumentCategory"`,
          id,
          input.category,
        );
        if (!changed) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "ApplicantDocument"
              ("id","applicationId","category","label","status","requestedAt","createdAt","updatedAt")
             VALUES ($1,$2,$3::"ApplicantDocumentCategory",$4,'REQUESTED',NOW(),NOW(),NOW())`,
            randomUUID(),
            id,
            input.category,
            input.label,
          );
        }
      });
      const portal = process.env.CAREERS_PORTAL_URL
        ?? 'https://www.sulandrahealth.com/applicant-portal.html';
      const deliveryStatus = await recordAndDeliver(
        prisma,
        application,
        'DOCUMENT_REQUEST',
        `Document requested: ${input.label}`,
        [
          `Dear ${application.firstName || 'Applicant'},`,
          '',
          input.message ?? `Please upload your ${input.label} through the applicant portal.`,
          `Portal: ${portal}`,
          `Application reference: ${application.referenceNumber}`,
          '',
          'Regards,',
          'Sulandra Health',
        ].join('\n'),
        auth.userId,
      );
      await audit(auth, 'REQUEST_APPLICANT_DOCUMENT', 'EmployeeApplication', id, {
        category: input.category,
        deliveryStatus,
      });
      res.status(201).json({
        data: {
          deliveryStatus,
          applicantPortalUrl: portal,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  registerApplicantWorkflowRoutes(app, prisma, helpers);
}
