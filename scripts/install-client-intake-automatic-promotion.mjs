import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api/src/client-intake-routes.ts');
const marker = 'CLIENT_INTAKE_AUTOMATIC_SPIRE_PROMOTION_V1';
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

// Make the medication intake syntax explicit enough for deterministic eMAR promotion while preserving legacy lines.
source = source.replace(
  "f('medications','Medication list — name | dose | route | frequency | times | prescriber, one per line','textarea')",
  "f('medications','Medication list — name | dose | route | frequency | times | prescriber | start date | end date, one per line','textarea',{help:'Use YYYY-MM-DD for start/end dates when known. Times may be comma-separated, such as 08:00,20:00.'})",
);
source = source.replace(
  "f('prnMedications','PRN medications and indications','textarea')",
  "f('prnMedications','PRN medications — name | dose | route | frequency | times | prescriber | start date | end date | indication, one per line','textarea')",
);

if (!source.includes(marker)) {
  const returnAnchor = 'return patientId;}\n\nexport const registerClientIntakeRoutes=';
  if (!source.includes(returnAnchor)) throw new Error('Client Intake patient-promotion return anchor was not found');
  const promotion = `/* ${marker}: approval must promote the completed intake into the live SPIRE chart before the case is marked APPROVED. */\nawait promoteApprovedIntakeToSpire(prisma,a,String(caseRow.id),patientId);\nreturn patientId;}\n\nexport const registerClientIntakeRoutes=`;
  source = source.replace(returnAnchor, promotion);
}

await writeFile(target, source, 'utf8');
console.log('Client Intake automatic SPIRE promotion installed: admission note, draft ISP, medication reconciliation/eMAR mapping, intake documents, and coded service authorizations are wired to approval.');
