import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const careersPath = path.join(root, 'api/src/careers-routes.ts');
let source = await readFile(careersPath, 'utf8');

const importAnchor = "import { registerInterviewSchedulingRoutes } from './interview-scheduling-routes.js';";
const secureImport = "import { putSecureObject, scanBufferForMalware } from './secure-object-storage.js';";
if (!source.includes(secureImport)) {
  if (!source.includes(importAnchor)) throw new Error('Unable to locate Careers import anchor');
  source = source.replace(importAnchor, `${importAnchor}\n${secureImport}`);
}

const markerStart = '      for (const document of documentsToCreate) {';
const markerEnd = '\n\n      let workflow:';
const start = source.indexOf(markerStart);
const end = source.indexOf(markerEnd, start);
if (start < 0 || end < 0) throw new Error('Unable to locate Careers document persistence block');

const replacement = `      for (const document of documentsToCreate) {
        const fileData = document.fileDataBase64
          ? Buffer.from(document.fileDataBase64, 'base64')
          : null;
        if (fileData && fileData.length > 20_000_000) {
          await prisma.$executeRawUnsafe(
            \`DELETE FROM "EmployeeApplication" WHERE "id"=$1\`,
            id,
          );
          createdApplicationId = null;
          res.status(400).json({ error: \`\${document.label} exceeds the 20 MB limit.\` });
          return;
        }

        const documentId = randomUUID();
        let storagePath = document.storagePath ?? null;
        let downloadUrl = document.downloadUrl ?? null;
        let fileDataForDatabase: Buffer | null = null;
        let contentSha256 = fileData ? createHash('sha256').update(fileData).digest('hex') : null;
        let status: string = fileData || downloadUrl ? 'RECEIVED' : 'MISSING';
        let scanStatus: 'CLEAN' | 'PENDING' | 'INFECTED' | null = null;
        let scanDetail: string | null = null;

        if (fileData?.length) {
          const scan = await scanBufferForMalware(fileData);
          scanDetail = scan.detail;
          if (scan.status === 'INFECTED') {
            await prisma.$executeRawUnsafe(
              \`DELETE FROM "EmployeeApplication" WHERE "id"=$1\`,
              id,
            );
            createdApplicationId = null;
            res.status(400).json({ error: \`\${document.label} could not be accepted because a security threat was detected.\` });
            return;
          }

          if (scan.status === 'CLEAN') {
            try {
              const object = await putSecureObject({
                key: \`careers/\${organizationId}/\${id}/\${documentId}/\${document.fileName || 'upload'}\`,
                body: fileData,
                contentType: document.mimeType || 'application/octet-stream',
                metadata: { applicationId: id, documentId, category: document.category, scanStatus: 'clean' },
              });
              storagePath = object.key;
              downloadUrl = null;
              contentSha256 = object.sha256;
              scanStatus = 'CLEAN';
              fileDataForDatabase = null;
            } catch (storageError) {
              console.warn('[careers] secure object storage unavailable after clean malware scan; preserving encrypted migration fallback', {
                applicationId: id,
                documentId,
                error: storageError,
              });
              fileDataForDatabase = fileData;
              scanStatus = 'PENDING';
              status = 'RECEIVED';
              scanDetail = 'Secure object storage temporarily unavailable; upload retained for migration and HR access remains restricted.';
            }
          } else {
            // Do not fail the applicant workflow when ClamAV is temporarily unavailable.
            // Preserve the bytes as a quarantined pending-scan record and do not expose the file to HR until rescanned.
            fileDataForDatabase = fileData;
            scanStatus = 'PENDING';
            status = 'RECEIVED';
          }
        }

        const hasFile = Boolean(fileData?.length || downloadUrl || storagePath);
        const applicationDataWithScan = {
          scanStatus,
          scanDetail,
          securityHold: scanStatus === 'PENDING',
        };
        await prisma.$executeRawUnsafe(
          \`INSERT INTO "ApplicantDocument"
            ("id","applicationId","category","label","status","fileName","storagePath","downloadUrl",
             "mimeType","sizeBytes","fileData","contentSha256","uploadedByType","uploadedAt","createdAt","updatedAt")
           VALUES ($1,$2,$3::"ApplicantDocumentCategory",$4,$5::"ApplicantDocumentStatus",
                   $6,$7,$8,$9,$10,$11,$12,$13::text,
                   CASE WHEN $13::text IS NOT NULL THEN NOW() ELSE NULL END,NOW(),NOW())\`,
          documentId,
          id,
          document.category,
          document.label,
          hasFile ? status : 'MISSING',
          document.fileName ?? null,
          storagePath,
          downloadUrl,
          document.mimeType ?? null,
          fileData?.length ?? document.sizeBytes ?? null,
          fileDataForDatabase,
          contentSha256,
          hasFile ? 'APPLICANT' : null,
        );

        if (scanStatus) {
          try {
            await prisma.$executeRawUnsafe(
              \`UPDATE "EmployeeApplication"
                  SET "applicationData" = COALESCE("applicationData", '{}'::jsonb) || $2::jsonb,
                      "updatedAt" = NOW()
                WHERE "id"=$1\`,
              id,
              JSON.stringify({ uploadSecurity: { [documentId]: applicationDataWithScan } }),
            );
          } catch (metadataError) {
            console.warn('[careers] unable to persist upload security metadata', { applicationId: id, documentId, error: metadataError });
          }
        }
      }`;

source = source.slice(0, start) + replacement + source.slice(end);

const successAnchor = '      let workflow: Awaited<ReturnType<typeof provisionApplicantWorkflow>> | null = null;';
if (!source.includes(successAnchor)) throw new Error('Unable to verify Careers continuation after document persistence');

await writeFile(careersPath, source, 'utf8');
console.log('Careers uploads now defer unavailable malware scans instead of rejecting the application; infected files remain blocked.');
