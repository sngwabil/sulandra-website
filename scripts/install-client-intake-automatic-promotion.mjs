import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api/src/client-intake-routes.ts');
const marker = 'CLIENT_INTAKE_AUTOMATIC_SPIRE_PROMOTION_V2';
const retryRouteMarker = 'CLIENT_INTAKE_APPROVED_REPROMOTION_ROUTE_V1';
const correctionMarker = 'APPROVED_INTAKE_CORRECTION_REOPEN_V1';
const oldMarker = 'CLIENT_INTAKE_AUTOMATIC_SPIRE_PROMOTION_V1';
const importLine = "import { promoteApprovedIntakeToSpire } from './client-intake-promotion.js';";
let source = await readFile(target, 'utf8');

if (!source.includes(importLine)) {
  const importAnchor = "import { z } from 'zod';";
  if (!source.includes(importAnchor)) throw new Error('Client Intake promotion import anchor was not found');
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

// Capture the actual billing/service code when it exists. We never infer a code from a service name.
if (!source.includes("f('serviceCode','Service / billing code')")) {
  const authorizationAnchor = "f('authorizationNumber','Authorization number'),f('authorizedService','Authorized service','text',{required:true})";
  if (!source.includes(authorizationAnchor)) throw new Error('Client Intake service authorization field anchor was not found');
  source = source.replace(
    authorizationAnchor,
    "f('authorizationNumber','Authorization number'),f('serviceCode','Service / billing code'),f('authorizedService','Authorized service','text',{required:true})",
  );
}

// Make medication input deterministic enough for safe eMAR promotion while preserving legacy/free-text rows for reconciliation.
source = source.replace(
  "f('medications','Medication list — name | dose | route | frequency | times | prescriber, one per line','textarea')",
  "f('medications','Medication list — name | dose | route | frequency | times | prescriber | start date | end date, one per line','textarea',{help:'Use YYYY-MM-DD for start/end dates when known. Times may be comma-separated, such as 08:00,20:00.'})",
);
source = source.replace(
  "f('prnMedications','PRN medications and indications','textarea')",
  "f('prnMedications','PRN medications — name | dose | route | frequency | times | prescriber | start date | end date | indication, one per line','textarea')",
);

// V1 ran promotion inside upsertPatientFromCase, before the APPROVED update. Remove it if a dev/build workspace was already mutated.
const oldBlock = `/* ${oldMarker}: approval must promote the completed intake into the live SPIRE chart before the case is marked APPROVED. */\nawait promoteApprovedIntakeToSpire(prisma,a,String(caseRow.id),patientId);\nreturn patientId;`;
if (source.includes(oldBlock)) source = source.replace(oldBlock, 'return patientId;');

if (!source.includes(marker)) {
  // Run after the APPROVED update. The synchronous database approval trigger has now
  // seeded the DRAFT ISP/care plan, so the promotion service can link complete service
  // authorizations to that plan without creating a duplicate plan.
  const approvalAnchor = `patientId,input.reviewNotes??null,a.userId,a.organizationId,selectedEntity(a),req.params.caseId);await event(prisma,a,req.params.caseId,'INTAKE_APPROVED',{patientId,existingPatientId:input.existingPatientId??null});`;
  if (!source.includes(approvalAnchor)) throw new Error('Client Intake approval completion anchor was not found');
  const replacement = `patientId,input.reviewNotes??null,a.userId,a.organizationId,selectedEntity(a),req.params.caseId);/* ${marker}: approval trigger has seeded the DRAFT plan; now finish retry-safe native SPIRE mapping. */const promotion=await promoteApprovedIntakeToSpire(prisma,a,req.params.caseId,patientId);await event(prisma,a,req.params.caseId,'INTAKE_APPROVED',{patientId,existingPatientId:input.existingPatientId??null,promotion});`;
  source = source.replace(approvalAnchor, replacement);
}

// Return the mapping result to the standalone H&P/master workstation as part of the
// approval response. The UI can immediately show which permanent chart resources
// were created or linked without making a second best-effort promotion request.
const approvalResponse = "res.json({data:{status:'APPROVED',patientId}});";
const promotedApprovalResponse = "res.json({data:{status:'APPROVED',patientId,promotion}});";
if (!source.includes(promotedApprovalResponse)) {
  if (!source.includes(approvalResponse)) throw new Error('Client Intake approval response anchor was not found');
  source = source.replace(approvalResponse, promotedApprovalResponse);
}

// Existing APPROVED training/client intakes may predate automatic promotion. Expose
// an authorized, retry-safe repair endpoint so those approved records can be pushed
// through the exact same permanent-chart mapping without reopening or mutating the
// signed intake packet. promoteApprovedIntakeToSpire uses stable IDs, so retrying is
// deliberate and does not create duplicate native chart resources.
if (!source.includes(retryRouteMarker)) {
  const retryAnchor = "  app.get('/api/admin/client-intakes/:caseId/duplicate-candidates'";
  if (!source.includes(retryAnchor)) throw new Error('Client Intake duplicate-candidate route anchor was not found');
  const retryRoute = `  /* ${retryRouteMarker}: repair/refresh an already-approved intake into the permanent SPIRE chart without reopening the immutable intake. */\n  app.post('/api/admin/client-intakes/:caseId/promote-to-spire',async(req,res,next)=>{try{const a=authOf(res);ensureReview(a);const caseRow=await requireCase(prisma,a,req.params.caseId),patientId=clean(caseRow.patientId,120);if(String(caseRow.status)!=='APPROVED'||!patientId)throw httpError(409,'Only an approved intake linked to a SPIRE patient can be promoted to the permanent chart');const promotion=await promoteApprovedIntakeToSpire(prisma,a,req.params.caseId,patientId);await event(prisma,a,req.params.caseId,'INTAKE_REPROMOTED_TO_SPIRE',{patientId,promotion});await audit?.(a,'REPROMOTE_CLIENT_INTAKE_TO_SPIRE','ClientIntakeCase',req.params.caseId,{patientId,legalEntityId:selectedEntity(a),promotion});res.json({data:{status:'APPROVED',patientId,promotion}});}catch(e){next(e);}});\n\n`;
  source = source.replace(retryAnchor, `${retryRoute}${retryAnchor}`);
}

/*
 * APPROVED intake correction workflow.
 *
 * The permanent chart remains linked to the same patient. The first authorized
 * correction to an APPROVED intake automatically opens an audit-tracked
 * REVIEW_REQUIRED correction cycle instead of returning the old 409 lock error.
 * SUBMITTED/CLOSED/WITHDRAWN records remain locked. Only a review-capable role may
 * reopen an approved record. Reapproval reuses the existing patient ID so the
 * correction can never create a duplicate chart identity.
 */
if (!source.includes(correctionMarker)) {
  const reviewGuardAnchor = "const ensureReview=(a:AuthContext)=>{ensureWrite(a);if(!reviewRoles.has(a.role)&&!owner(a))throw httpError(403,'Clinical or program intake review permission is required');};";
  if (!source.includes(reviewGuardAnchor)) throw new Error('Client Intake review guard anchor was not found');

  const correctionHelper = `${reviewGuardAnchor}\n/* ${correctionMarker}: approved intakes enter an audit-tracked correction cycle on the first authorized edit. */\nasync function reopenApprovedForCorrection(prisma:PrismaClient,a:AuthContext,caseId:string,caseRow:Record<string,unknown>,reason:string,audit?:Deps['audit']){if(String(caseRow.status)!=='APPROVED')return false;ensureReview(a);const previousApprovedAt=caseRow.approvedAt??null,previousApprovedById=caseRow.approvedById??null,patientId=clean(caseRow.patientId,120)||null;await prisma.$executeRawUnsafe(\`UPDATE \\\"ClientIntakeCase\\\" SET \\\"status\\\"='REVIEW_REQUIRED',\\\"reviewNotes\\\"=$1,\\\"reviewedAt\\\"=NOW(),\\\"reviewedById\\\"=$2,\\\"updatedAt\\\"=NOW() WHERE \\\"organizationId\\\"=$3 AND \\\"legalEntityId\\\"=$4 AND \\\"id\\\"=$5\`,reason,a.userId,a.organizationId,selectedEntity(a),caseId);await event(prisma,a,caseId,'INTAKE_REOPENED_FOR_CORRECTION',{reason,patientId,previousStatus:'APPROVED',previousApprovedAt,previousApprovedById});await audit?.(a,'REOPEN_CLIENT_INTAKE_FOR_CORRECTION','ClientIntakeCase',caseId,{reason,patientId,legalEntityId:selectedEntity(a),previousApprovedAt,previousApprovedById});caseRow.status='REVIEW_REQUIRED';return true;}`;
  source = source.replace(reviewGuardAnchor, correctionHelper);

  const patchLock = "if(['APPROVED','CLOSED','WITHDRAWN'].includes(String(current.status)))throw httpError(409,'This intake case is no longer editable');";
  const patchReplacement = "if(String(current.status)==='APPROVED')await reopenApprovedForCorrection(prisma,a,req.params.caseId,current,'Approved intake case details were corrected after approval.',audit);else if(['CLOSED','WITHDRAWN'].includes(String(current.status)))throw httpError(409,'This intake case is no longer editable');";
  if (!source.includes(patchLock)) throw new Error('Approved Client Intake case edit lock anchor was not found');
  source = source.replace(patchLock, patchReplacement);

  const sectionLock = "if(['SUBMITTED','APPROVED','CLOSED','WITHDRAWN'].includes(String(caseRow.status)))throw httpError(409,'This intake is locked for editing');";
  const sectionReplacement = "if(String(caseRow.status)==='APPROVED')await reopenApprovedForCorrection(prisma,a,req.params.caseId,caseRow,`Approved intake section ${req.params.sectionKey} was corrected after approval.`,audit);else if(['SUBMITTED','CLOSED','WITHDRAWN'].includes(String(caseRow.status)))throw httpError(409,'This intake is locked for editing');";
  if (!source.includes(sectionLock)) throw new Error('Approved Client Intake section edit lock anchor was not found');
  source = source.replace(sectionLock, sectionReplacement);

  const attachmentLock = "if(['APPROVED','CLOSED','WITHDRAWN'].includes(String(caseRow.status)))throw httpError(409,'This intake is no longer accepting attachments');";
  const attachmentReplacement = "if(String(caseRow.status)==='APPROVED')await reopenApprovedForCorrection(prisma,a,req.params.caseId,caseRow,'An admission attachment was added or corrected after approval.',audit);else if(['CLOSED','WITHDRAWN'].includes(String(caseRow.status)))throw httpError(409,'This intake is no longer accepting attachments');";
  if (!source.includes(attachmentLock)) throw new Error('Approved Client Intake attachment lock anchor was not found');
  source = source.replace(attachmentLock, attachmentReplacement);

  const signatureLock = "if(['APPROVED','CLOSED','WITHDRAWN'].includes(String(caseRow.status)))throw httpError(409,'This intake is no longer accepting signatures');";
  const signatureReplacement = "if(String(caseRow.status)==='APPROVED')await reopenApprovedForCorrection(prisma,a,req.params.caseId,caseRow,'An intake signature or attestation was added after approval.',audit);else if(['CLOSED','WITHDRAWN'].includes(String(caseRow.status)))throw httpError(409,'This intake is no longer accepting signatures');";
  if (!source.includes(signatureLock)) throw new Error('Approved Client Intake signature lock anchor was not found');
  source = source.replace(signatureLock, signatureReplacement);

  const patientAnchor = "const patientId=await upsertPatientFromCase(prisma,a,caseRow,input.existingPatientId??null,life);";
  const patientReplacement = "const existingPatientId=input.existingPatientId??(clean(caseRow.patientId,120)||null);const patientId=await upsertPatientFromCase(prisma,a,caseRow,existingPatientId,life);";
  if (!source.includes(patientAnchor)) throw new Error('Client Intake approval patient-link anchor was not found');
  source = source.replace(patientAnchor, patientReplacement);

  source = source.replace(
    "existingPatientId:input.existingPatientId??null,promotion",
    'existingPatientId,promotion',
  );
}

await writeFile(target, source, 'utf8');
console.log('Client Intake automatic SPIRE promotion installed: approval seeds the DRAFT care plan first, then maps the full admission summary, medication reconciliation/eMAR-ready orders, intake documents, coded service authorizations, promotion audit trail, returns the promotion result to the H&P client, exposes a retry-safe promotion endpoint for previously approved intakes, and allows review-authorized staff to reopen approved intakes automatically for audit-tracked corrections without creating a duplicate patient chart.');
