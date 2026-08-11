import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api/src/client-intake-routes.ts');
const marker = 'CLIENT_INTAKE_AUTOMATIC_SPIRE_PROMOTION_V2';
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

await writeFile(target, source, 'utf8');
console.log('Client Intake automatic SPIRE promotion installed: approval seeds the DRAFT care plan first, then maps the full admission summary, medication reconciliation/eMAR-ready orders, intake documents, coded service authorizations, and promotion audit trail.');
