import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(root, 'api/src/applicant-workflow.ts');
let source = await readFile(workflowPath, 'utf8');

// Keep every applicant-facing email on the actual published portal page.
source = source.replace(
`const configuredPortalUrl = (
  process.env.CAREERS_PORTAL_URL
  ?? 'https://www.sulandrahealth.com/applicant'
).replace(/\\/$/, '');
export const careersPortalUrl = configuredPortalUrl.replace(
  /\\/applicant-portal(?:\\.html)?$/i,
  '/applicant',
);`,
`const configuredPortalUrl = (
  process.env.CAREERS_PORTAL_URL
  ?? 'https://www.sulandrahealth.com/applicant-portal.html'
).replace(/\\/$/, '');
export const careersPortalUrl = configuredPortalUrl.replace(
  /\\/applicant(?:-portal)?(?:\\.html)?$/i,
  '/applicant-portal.html',
);`,
);

// Expose the role so the portal can render the position-specific document checklist.
source = source.replace(
`        \`SELECT a."id",a."referenceNumber",a."firstName",a."middleName",a."lastName",
                a."email",a."phone",a."workflowStatus",a."submittedAt",
                a."assessmentScore",a."assessmentMaxScore",a."assessmentPercent",
                j."title" AS "jobTitle"`,
`        \`SELECT a."id",a."referenceNumber",a."firstName",a."middleName",a."lastName",
                a."email",a."phone",a."workflowStatus",a."submittedAt",a."appliedRole",
                a."assessmentScore",a."assessmentMaxScore",a."assessmentPercent",
                j."title" AS "jobTitle"`,
);

const oldUpload = `      const input = z.object({
        documentId: z.string().trim().min(1),
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(160),
        fileDataBase64: z.string().min(1),
      }).parse(req.body);
      const data = Buffer.from(input.fileDataBase64, 'base64');
      if (!data.length || data.length > 20_000_000) {
        res.status(400).json({ error: 'Document must be between 1 byte and 20 MB.' });
        return;
      }
      const result = await prisma.$executeRawUnsafe(
        \`UPDATE "ApplicantDocument"
            SET "status"='RECEIVED',"fileName"=$1,"mimeType"=$2,"sizeBytes"=$3,
                "fileData"=$4,"contentSha256"=$5,"uploadedByType"='APPLICANT',
                "uploadedAt"=NOW(),"reviewNotes"=NULL,"reviewedAt"=NULL,"updatedAt"=NOW()
          WHERE "id"=$6 AND "applicationId"=$7\`,
        input.fileName,
        input.mimeType,
        data.length,
        data,
        createHash('sha256').update(data).digest('hex'),
        input.documentId,
        auth.applicationId,
      );
      if (!result) return res.status(404).json({ error: 'Requested document was not found.' });
      res.status(201).json({ data: { uploaded: true } });`;

const newUpload = `      /* APPLICANT_DOCUMENT_UPLOAD_V2 */
      const uploadCategory = z.enum([
        'APPLICATION', 'RESUME', 'COVER_LETTER', 'CPR', 'FIRST_AID',
        'LPN_LICENSE', 'RN_LICENSE', 'DRIVER_LICENSE', 'AUTO_INSURANCE',
        'TB_TEST', 'PHYSICAL', 'BACKGROUND_CHECK', 'SOCIAL_SECURITY_CARD',
        'REFERENCES', 'OTHER',
      ]);
      const input = z.object({
        documentId: z.string().trim().min(1).optional(),
        category: uploadCategory.optional(),
        label: z.string().trim().min(2).max(120).optional(),
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(160),
        fileDataBase64: z.string().min(1),
      }).refine((value) => Boolean(value.documentId || value.label), {
        message: 'Choose a requested document or provide a document type.',
      }).parse(req.body);
      const data = Buffer.from(input.fileDataBase64, 'base64');
      if (!data.length || data.length > 20_000_000) {
        res.status(400).json({ error: 'Document must be between 1 byte and 20 MB.' });
        return;
      }
      const digest = createHash('sha256').update(data).digest('hex');
      let documentId = input.documentId ?? null;
      let documentCategory = input.category ?? 'OTHER';
      let documentLabel = input.label ?? 'Other document';

      if (documentId) {
        const existing = await prisma.$queryRawUnsafe<any[]>(
          \`SELECT "id","category","label" FROM "ApplicantDocument"
             WHERE "id"=$1 AND "applicationId"=$2 LIMIT 1\`,
          documentId,
          auth.applicationId,
        );
        if (!existing[0]) return res.status(404).json({ error: 'Requested document was not found.' });
        documentCategory = existing[0].category;
        documentLabel = existing[0].label;
      } else {
        const matching = await prisma.$queryRawUnsafe<any[]>(
          \`SELECT "id","category","label" FROM "ApplicantDocument"
             WHERE "applicationId"=$1
               AND ("category"=$2::"ApplicantDocumentCategory" OR LOWER("label")=LOWER($3))
             ORDER BY "updatedAt" DESC LIMIT 1\`,
          auth.applicationId,
          documentCategory,
          documentLabel,
        );
        documentId = matching[0]?.id ?? null;
        if (matching[0]) {
          documentCategory = matching[0].category;
          documentLabel = matching[0].label;
        }
      }

      if (documentId) {
        const result = await prisma.$executeRawUnsafe(
          \`UPDATE "ApplicantDocument"
              SET "status"='RECEIVED',"fileName"=$1,"mimeType"=$2,"sizeBytes"=$3,
                  "fileData"=$4,"contentSha256"=$5,"uploadedByType"='APPLICANT',
                  "uploadedAt"=NOW(),"reviewNotes"=NULL,"reviewedAt"=NULL,"updatedAt"=NOW()
            WHERE "id"=$6 AND "applicationId"=$7\`,
          input.fileName,
          input.mimeType,
          data.length,
          data,
          digest,
          documentId,
          auth.applicationId,
        );
        if (!result) return res.status(404).json({ error: 'Requested document was not found.' });
      } else {
        documentId = randomUUID();
        await prisma.$executeRawUnsafe(
          \`INSERT INTO "ApplicantDocument"
            ("id","applicationId","category","label","status","fileName","mimeType","sizeBytes",
             "fileData","contentSha256","uploadedByType","uploadedAt","createdAt","updatedAt")
           VALUES ($1,$2,$3::"ApplicantDocumentCategory",$4,'RECEIVED',$5,$6,$7,$8,$9,'APPLICANT',NOW(),NOW(),NOW())\`,
          documentId,
          auth.applicationId,
          documentCategory,
          documentLabel,
          input.fileName,
          input.mimeType,
          data.length,
          data,
          digest,
        );
      }
      res.status(201).json({ data: { uploaded: true, documentId, category: documentCategory, label: documentLabel } });`;

if (!source.includes('APPLICANT_DOCUMENT_UPLOAD_V2')) {
  if (!source.includes(oldUpload)) throw new Error('Applicant document upload v1 anchor was not found');
  source = source.replace(oldUpload, newUpload);
}

if (!source.includes('APPLICANT_DOCUMENT_UPLOAD_V2')) {
  throw new Error('Applicant document upload v2 was not installed');
}
if (!source.includes('a."appliedRole"')) {
  throw new Error('Applicant role was not exposed to the applicant workspace');
}
if (!source.includes("'/applicant-portal.html'")) {
  throw new Error('Applicant portal email URL is not canonical');
}

await writeFile(workflowPath, source, 'utf8');
console.log('Applicant Portal v2 backend installed: role-aware checklists, categorized uploads, case-specific Other documents, and repeat uploads are enabled.');
