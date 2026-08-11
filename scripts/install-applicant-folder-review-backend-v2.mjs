import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(root, 'api/src/applicant-workflow.ts');
let workflow = await readFile(workflowPath, 'utf8');

// Allow authenticated administrators to preview a submitted document inline.
workflow = workflow.replace(
  "res.setHeader('content-disposition', `attachment; filename=\"${safeName}\"`);",
  "const disposition = req.query.inline === '1' ? 'inline' : 'attachment';\n        res.setHeader('content-disposition', `${disposition}; filename=\"${safeName}\"`);",
);

// Resend-access must return the new one-time credential to the authorized admin
// in addition to sending it through the applicant notification workflow.
workflow = workflow.replace(
  "res.json({ data: { deliveryStatus } });",
  "res.json({ data: { deliveryStatus, username, temporaryPassword, applicantPortalUrl: careersPortalUrl } });",
);

const routeAnchor = "  app.patch(\n    '/api/admin/applications/:id/status',";
if (!workflow.includes('APPLICANT_INTERVIEW_EVALUATION_V2')) {
  const route = `  /* APPLICANT_INTERVIEW_EVALUATION_V2 */\n  app.put(\n    '/api/admin/applications/:id/interview-evaluation',\n    requireRoles(UserRole.ADMINISTRATOR, UserRole.DOO),\n    async (req, res, next) => {\n      try {\n        const auth = authOf(res);\n        const access = entityAccessOf(res);\n        requireEntityManageAccess(access);\n        const applicationId = String(req.params.id);\n        const input = z.object({\n          interviewDate: z.string().trim().max(40).optional(),\n          interviewerName: z.string().trim().min(2).max(160),\n          recommendation: z.enum(['STRONG_YES','YES','HOLD','NO','STRONG_NO']),\n          overallRating: z.coerce.number().int().min(1).max(5),\n          observations: z.record(z.string(), z.enum(['MET','NOT_MET','NOT_OBSERVED'])),\n          answers: z.array(z.object({\n            question: z.string().trim().min(2).max(600),\n            response: z.string().trim().max(5000),\n            rating: z.coerce.number().int().min(1).max(5).optional(),\n          })).max(30),\n          strengths: z.string().trim().max(5000).optional(),\n          concerns: z.string().trim().max(5000).optional(),\n          availabilityNotes: z.string().trim().max(3000).optional(),\n          referenceNotes: z.string().trim().max(3000).optional(),\n          credentialNotes: z.string().trim().max(3000).optional(),\n          hiringNotes: z.string().trim().max(5000).optional(),\n          preHireChecks: z.record(z.string(), z.enum(['COMPLETE','PENDING','NOT_APPLICABLE'])).optional(),\n        }).parse(req.body);\n        const rows = await prisma.$queryRawUnsafe<any[]>(\n          \`SELECT \"applicationData\" FROM \"EmployeeApplication\"\n            WHERE \"id\"=$1 AND \"organizationId\"=$2 AND \"legalEntityId\"=$3\n              AND ($4::text IS NULL OR \"departmentId\"=$4) LIMIT 1\`,\n          applicationId, auth.organizationId, access.legalEntityId, access.departmentId,\n        );\n        if (!rows[0]) return res.status(404).json({ error: 'Application not found.' });\n        const current = rows[0].applicationData && typeof rows[0].applicationData === 'object' ? rows[0].applicationData : {};\n        const evaluation = {\n          ...input,\n          savedAt: new Date().toISOString(),\n          savedByUserId: auth.userId,\n        };\n        await prisma.$executeRawUnsafe(\n          \`UPDATE \"EmployeeApplication\" SET \"applicationData\"=$1::jsonb,\"updatedAt\"=NOW() WHERE \"id\"=$2\`,\n          JSON.stringify({ ...current, interviewEvaluation: evaluation }),\n          applicationId,\n        );\n        await audit(auth, 'SAVE_APPLICANT_INTERVIEW_EVALUATION', 'EmployeeApplication', applicationId, {\n          recommendation: input.recommendation, overallRating: input.overallRating,\n        });\n        res.json({ data: evaluation });\n      } catch (error) { next(error); }\n    },\n  );\n\n`;
  if (!workflow.includes(routeAnchor)) throw new Error('Applicant status-route anchor missing');
  workflow = workflow.replace(routeAnchor, route + routeAnchor);
}

await writeFile(workflowPath, workflow, 'utf8');
console.log('Applicant folder review backend v2 installed: inline preview, resend access details, and interview evaluation persistence.');
