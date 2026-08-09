import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { entityAccessOf } from './entity-access.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Helpers = {
  authOf: (response: express.Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
  audit: (auth: Partial<AuthContext>, action: string, resourceType: string, resourceId?: string, metadata?: object) => Promise<void>;
};

const IRS_W4_URL = 'https://www.irs.gov/pub/irs-pdf/fw4.pdf';
const IRS_W4_REVISION = '2026';
const MAX_PDF_BYTES = 8_000_000;

const w4DataSchema = z.object({
  firstNameMiddleInitial: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  address: z.string().trim().min(3).max(180),
  cityStateZip: z.string().trim().min(3).max(180),
  ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/),
  filingStatus: z.enum(['single', 'married', 'head']),
  multipleJobs: z.boolean().default(false),
  qualifyingChildrenAmount: z.number().min(0).max(99999999).default(0),
  otherDependentsAmount: z.number().min(0).max(99999999).default(0),
  otherCreditsAmount: z.number().min(0).max(99999999).default(0),
  totalCredits: z.number().min(0).max(99999999).default(0),
  otherIncome: z.number().min(0).max(999999999).default(0),
  deductions: z.number().min(0).max(999999999).default(0),
  extraWithholding: z.number().min(0).max(999999999).default(0),
  exempt: z.boolean().default(false),
  signature: z.string().trim().min(2).max(180),
  signedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeAttestation: z.literal(true),
});

const submitSchema = z.object({
  formRevision: z.literal(IRS_W4_REVISION),
  data: w4DataSchema,
  pdfBase64: z.string().min(1000),
  reviewedAndApproved: z.literal(true),
});

async function offerByToken(prisma: PrismaClient, rawToken: string) {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT o.*,a."firstName",a."middleName",a."lastName",a."email",a."applicationData",
            entity."legalName" AS "employerLegalName"
       FROM "EmploymentOffer" o
       JOIN "EmployeeApplication" a ON a."id"=o."applicationId" AND a."legalEntityId"=o."legalEntityId"
       JOIN "LegalEntity" entity ON entity."organizationId"=o."organizationId" AND entity."id"=o."legalEntityId"
      WHERE o."tokenHash"=$1 AND o."tokenExpiresAt">NOW()
      LIMIT 1`,
    tokenHash,
  );
  return rows[0] || null;
}

export function registerW4Routes(app: express.Express, prisma: PrismaClient, helpers: Helpers) {
  const { authOf, requireRoles, audit } = helpers;

  app.get('/public/careers/w4/current.pdf', async (_req, res, next) => {
    try {
      const response = await fetch(IRS_W4_URL, { headers: { 'User-Agent': 'SulandraHealth-HR/1.0' } });
      if (!response.ok) throw new Error(`IRS Form W-4 download failed (${response.status}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="IRS-Form-W-4-${IRS_W4_REVISION}.pdf"`);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-W4-Revision', IRS_W4_REVISION);
      res.send(bytes);
    } catch (error) { next(error); }
  });

  app.get('/public/careers/offers/:token/w4', async (req, res, next) => {
    try {
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      const [document] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id","status","completedAt","formRevision" FROM "EmploymentOfferDocument"
          WHERE "offerId"=$1 AND "name"='Form W-4' LIMIT 1`,
        offer.id,
      );
      if (!document) return res.status(404).json({ error: 'Form W-4 is not required for this offer.' });
      const applicationData = offer.applicationData || {};
      res.json({ data: {
        revision: IRS_W4_REVISION,
        officialPdfUrl: '/public/careers/w4/current.pdf',
        document,
        employee: {
          firstName: offer.firstName || '', middleName: offer.middleName || '', lastName: offer.lastName || '',
          address: applicationData.address || applicationData.streetAddress || '',
          cityStateZip: applicationData.cityStateZip || '',
        },
        employer: {
          name: offer.employerLegalName,
          address: process.env.ORGANIZATION_ADDRESS || 'Dayton, Ohio',
          ein: process.env.EMPLOYER_EIN || '',
          firstDateOfEmployment: offer.startDate,
        },
      } });
    } catch (error) { next(error); }
  });

  app.post('/public/careers/offers/:token/w4/submit', async (req, res, next) => {
    try {
      const offer = await offerByToken(prisma, String(req.params.token));
      if (!offer) return res.status(404).json({ error: 'Offer not found or expired.' });
      const input = submitSchema.parse(req.body);
      const pdf = Buffer.from(input.pdfBase64, 'base64');
      if (!pdf.length || pdf.length > MAX_PDF_BYTES || pdf.subarray(0, 4).toString() !== '%PDF') {
        return res.status(400).json({ error: 'The generated W-4 PDF is invalid or exceeds the size limit.' });
      }
      const [document] = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id" FROM "EmploymentOfferDocument" WHERE "offerId"=$1 AND "name"='Form W-4' LIMIT 1`,
        offer.id,
      );
      if (!document) return res.status(404).json({ error: 'Form W-4 is not required for this offer.' });
      const safeData = { ...input.data, ssnLast4: input.data.ssn.replace(/\D/g, '').slice(-4), ssn: undefined };
      const fileName = `Form-W-4-${IRS_W4_REVISION}-${offer.lastName || 'Employee'}.pdf`;
      const sha256 = createHash('sha256').update(pdf).digest('hex');
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE "EmploymentOfferDocument" SET "status"='COMPLETED',"signature"=$1,"signedByName"=$2,
             "completedAt"=NOW(),"attestedAt"=NOW(),"formData"=$3::jsonb,"formRevision"=$4,
             "generatedPdf"=$5,"fileName"=$6,"mimeType"='application/pdf',"sizeBytes"=$7,"contentSha256"=$8,
             "reviewedAt"=NOW(),"submittedAt"=NOW(),"ipAddress"=$9,"userAgent"=$10,"updatedAt"=NOW()
           WHERE "id"=$11`,
          input.data.signature, `${input.data.firstNameMiddleInitial} ${input.data.lastName}`,
          JSON.stringify(safeData), IRS_W4_REVISION, pdf, fileName, pdf.length, sha256,
          req.ip || req.socket.remoteAddress || null, req.get('user-agent') || null, document.id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "ApplicantDocument" ("id","applicationId","category","label","status","fileName","mimeType","sizeBytes","fileData","contentSha256","uploadedByType","uploadedAt","createdAt","updatedAt")
           VALUES ($1,$2,'OTHER'::"ApplicantDocumentCategory",'Signed Form W-4','RECEIVED'::"ApplicantDocumentStatus",$3,'application/pdf',$4,$5,$6,'APPLICANT',NOW(),NOW(),NOW())`,
          randomUUID(), offer.applicationId, fileName, pdf.length, pdf, sha256,
        );
      });
      await audit({}, 'SUBMIT_SIGNED_W4', 'EmploymentOfferDocument', document.id, { applicationId: offer.applicationId, revision: IRS_W4_REVISION, sha256 });
      res.json({ data: { status: 'COMPLETED', fileName, revision: IRS_W4_REVISION } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/applications/:id/w4/download', requireRoles(UserRole.ADMINISTRATOR, UserRole.COO), async (req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT d."generatedPdf",d."fileName",d."mimeType"
           FROM "EmploymentOfferDocument" d
           JOIN "EmploymentOffer" o ON o."id"=d."offerId"
          WHERE o."applicationId"=$1 AND o."organizationId"=$2 AND o."legalEntityId"=$3
            AND ($4::text IS NULL OR o."departmentId"=$4)
            AND d."name"='Form W-4' AND d."generatedPdf" IS NOT NULL
          ORDER BY d."completedAt" DESC LIMIT 1`,
        String(req.params.id), auth.organizationId, access.legalEntityId, access.departmentId,
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ error: 'A completed Form W-4 was not found.' });
      res.setHeader('Content-Type', row.mimeType || 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${String(row.fileName || 'Form-W-4.pdf').replace(/[\r\n"]/g, '')}"`);
      res.send(row.generatedPdf);
    } catch (error) { next(error); }
  });
}
