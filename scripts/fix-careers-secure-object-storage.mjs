import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api/src/careers-routes.ts');
let source=await readFile(target,'utf8');
const zodImport="import { z } from 'zod';";
const storageImport="import { putSecureObject, scanBufferForMalware } from './secure-object-storage.js';";
if(!source.includes(storageImport))source=source.replace(zodImport,`${zodImport}\n${storageImport}`);
const start='      for (const document of documentsToCreate) {';
const end='\n\n      let workflow:';
const startIndex=source.indexOf(start);
const endIndex=source.indexOf(end,startIndex);
if(startIndex<0||endIndex<0)throw new Error('Unable to locate applicant document persistence block');
const replacement=`      for (const document of documentsToCreate) {
        const applicantDocumentId = randomUUID();
        const fileData = document.fileDataBase64 ? Buffer.from(document.fileDataBase64, 'base64') : null;
        if (fileData && fileData.length > 20_000_000) {
          await prisma.$executeRawUnsafe(\`DELETE FROM "EmployeeApplication" WHERE "id"=$1\`, id);
          createdApplicationId = null;
          res.status(400).json({ error: \`\${document.label} exceeds the 20 MB limit.\` });
          return;
        }
        let secureObject = null;
        let malwareStatus = null;
        if (fileData?.length) {
          const scan = await scanBufferForMalware(fileData);
          if (scan.status === 'INFECTED') throw Object.assign(new Error(\`Upload blocked: malware detected in \${document.label}\`), { status: 422 });
          if (scan.status === 'UNAVAILABLE' && process.env.ALLOW_UPLOAD_WHEN_MALWARE_SCANNER_UNAVAILABLE !== 'true') throw Object.assign(new Error('Upload blocked because malware scanning is unavailable'), { status: 503 });
          malwareStatus = scan;
          const objectKey = \`organizations/\${organizationId}/applicants/\${id}/\${applicantDocumentId}-\${String(document.fileName || document.label || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-')}\`;
          secureObject = await putSecureObject({ key: objectKey, body: fileData, contentType: document.mimeType || 'application/octet-stream', metadata: { application: id, applicantDocument: applicantDocumentId, category: document.category } });
        }
        const hasFile = Boolean(secureObject || document.downloadUrl);
        await prisma.$executeRawUnsafe(
          \`INSERT INTO "ApplicantDocument"
            ("id","applicationId","category","label","status","fileName","storagePath","downloadUrl",
             "mimeType","sizeBytes","fileData","contentSha256","uploadedByType","uploadedAt","createdAt","updatedAt")
           VALUES ($1,$2,$3::"ApplicantDocumentCategory",$4,$5::"ApplicantDocumentStatus",
                   $6,$7,$8,$9,$10,NULL,$11,$12::text,
                   CASE WHEN $12::text IS NOT NULL THEN NOW() ELSE NULL END,NOW(),NOW())\`,
          applicantDocumentId,
          id,
          document.category,
          document.label,
          hasFile ? 'RECEIVED' : 'MISSING',
          document.fileName ?? null,
          secureObject ? \`object://\${secureObject.bucket}/\${secureObject.key}\` : document.storagePath ?? null,
          secureObject ? null : document.downloadUrl ?? null,
          document.mimeType ?? null,
          secureObject?.sizeBytes ?? document.sizeBytes ?? null,
          secureObject?.sha256 ?? null,
          hasFile ? 'APPLICANT' : null,
        );
        if (secureObject && malwareStatus) {
          await prisma.$executeRawUnsafe(
            \`INSERT INTO "ApplicantSecureDocumentObject" ("id","applicationId","applicantDocumentId","organizationId","bucket","objectKey","sha256","etag","encryption","kmsKeyId","ivBase64","authTagBase64","malwareStatus","malwareEngine","malwareSignature","malwareDetail") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)\`,
            randomUUID(), id, applicantDocumentId, organizationId, secureObject.bucket, secureObject.key, secureObject.sha256, secureObject.etag, secureObject.encryption, secureObject.kmsKeyId, secureObject.ivBase64, secureObject.authTagBase64, malwareStatus.status, malwareStatus.engine, malwareStatus.signature, malwareStatus.detail,
          );
        }
      }`;
source=source.slice(0,startIndex)+replacement+source.slice(endIndex);
if(!source.includes('ApplicantSecureDocumentObject'))throw new Error('Secure applicant object persistence was not installed');
await writeFile(target,source,'utf8');
console.log('New applicant uploads are malware-scanned and stored as encrypted objects instead of PostgreSQL Base64 blobs.');
