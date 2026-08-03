import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const target = path.join(repositoryRoot, 'api', 'dist', 'onboarding-bootstrap.js');
let source = await readFile(target, 'utf8');

const importMarker = "import { registerCareersRoutes } from './careers-routes.js';";
const callMarker = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const clinicalImport = "import { registerClinicalRoutes } from './clinical-routes.js';";
const clinicalCall = 'registerClinicalRoutes(app, prisma, { authOf });';
const applicantFolderMarker = '// SULANDRA_APPLICANT_FOLDER_ROUTE';
const applicantFolderRoute = `${applicantFolderMarker}
app.get('/api/admin/applications/:id/folder', requireRoles(UserRole.ADMINISTRATOR, UserRole.COO), async (req, res, next) => {
  try {
    const auth = authOf(res);
    const applicationId = String(req.params.id);
    const applications = await prisma.$queryRawUnsafe(
      \`SELECT a.*, a."workflowStatus" AS "status", j."title" AS "jobTitle"
         FROM "EmployeeApplication" a
         LEFT JOIN "JobOpening" j ON j."id" = a."jobOpeningId"
        WHERE a."id" = $1 AND a."organizationId" = $2\`,
      applicationId,
      auth.organizationId,
    );
    if (!applications[0]) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    const [documents, messages, history] = await Promise.all([
      prisma.$queryRawUnsafe(
        \`SELECT "id","applicationId","category","label","status","version","fileName","mimeType",
                "sizeBytes","uploadedByType","requestedAt","uploadedAt","reviewNotes","reviewedAt",
                "createdAt","updatedAt"
           FROM "ApplicantDocument"
          WHERE "applicationId" = $1
          ORDER BY "category", "version" DESC\`,
        applicationId,
      ),
      prisma.$queryRawUnsafe(
        \`SELECT * FROM "ApplicantMessage" WHERE "applicationId" = $1 ORDER BY "createdAt" DESC\`,
        applicationId,
      ),
      prisma.$queryRawUnsafe(
        \`SELECT * FROM "ApplicantStatusHistory" WHERE "applicationId" = $1 ORDER BY "createdAt" DESC\`,
        applicationId,
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
});`;

if (!source.includes(importMarker)) {
  throw new Error(`Clinical route injection failed: import marker not found in ${target}`);
}
if (!source.includes(callMarker)) {
  throw new Error(`Clinical route injection failed: registration marker not found in ${target}`);
}

if (!source.includes(clinicalImport)) {
  source = source.replace(importMarker, `${importMarker}\n${clinicalImport}`);
}
if (!source.includes(clinicalCall)) {
  source = source.replace(callMarker, `${clinicalCall}\n${callMarker}`);
}
if (!source.includes(applicantFolderMarker)) {
  source = source.replace(callMarker, `${applicantFolderRoute}\n${callMarker}`);
}

await writeFile(target, source, 'utf8');
console.log(`Registered Spire clinical and applicant-folder routes in ${target}.`);
