import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const [routes, promotion, carePlanMigration, alignmentMigration] = await Promise.all([
  read('api/src/client-intake-routes.ts'),
  read('api/src/client-intake-promotion.ts'),
  read('prisma/migrations/20260810020000_intake_seed_draft_care_plan/migration.sql'),
  read('prisma/migrations/20260811193500_client_intake_promotion_alignment/migration.sql'),
]);

const fail = message => { throw new Error(`Client Intake automatic promotion verification failed: ${message}`); };
const requireText = (source, needle, message) => { if (!source.includes(needle)) fail(message); };

requireText(routes, "import { promoteApprovedIntakeToSpire } from './client-intake-promotion.js';", 'promotion service import is missing from client-intake-routes.ts');
requireText(routes, 'CLIENT_INTAKE_AUTOMATIC_SPIRE_PROMOTION_V2', 'post-approval promotion marker is missing');
requireText(routes, `"status"='APPROVED'`, 'approval state transition is missing');
requireText(routes, 'const promotion=await promoteApprovedIntakeToSpire(prisma,a,req.params.caseId,patientId);', 'automatic promotion call is missing after approval');
requireText(routes, "res.json({data:{status:'APPROVED',patientId,promotion}});", 'approval response does not return the SPIRE promotion result to the H&P client');
requireText(routes, 'CLIENT_INTAKE_APPROVED_REPROMOTION_ROUTE_V1', 'retry-safe approved-intake promotion route is missing');
requireText(routes, "app.post('/api/admin/client-intakes/:caseId/promote-to-spire'", 'approved-intake promotion endpoint is missing');
requireText(routes, "'REPROMOTE_CLIENT_INTAKE_TO_SPIRE'", 'approved-intake repair promotion audit is missing');

const approvedIndex = routes.indexOf(`"status"='APPROVED'`);
const promotionIndex = routes.indexOf('CLIENT_INTAKE_AUTOMATIC_SPIRE_PROMOTION_V2');
if (approvedIndex < 0 || promotionIndex < 0 || promotionIndex <= approvedIndex) fail('promotion must run after the APPROVED update so the care-plan trigger has completed');
if (routes.includes('CLIENT_INTAKE_AUTOMATIC_SPIRE_PROMOTION_V1')) fail('obsolete pre-approval promotion marker is still present');

for (const table of [
  'SpireClinicalNote',
  'SpireMedicationReconciliation',
  'SpireMedicationReconciliationItem',
  'SpireMedicationOrder',
  'SpireMedicationSchedule',
  'SpireClinicalDocument',
  'SpireClinicalDocumentVersion',
  'SpireServiceAuthorization',
  'SpireCarePlanServiceLink',
  'SpireClinicalAuditEvent',
]) requireText(promotion, `\"${table}\"`, `${table} mapping is missing from the promotion service`);

requireText(promotion, "['RN', 'LPN', 'DELEGATING_NURSE']", 'licensed medication-review gate is missing');
requireText(promotion, 'if (isLicensedReviewer && med.completeForOrder)', 'active medication orders are not gated on licensed review plus complete data');
if (promotion.includes("'PENDING_VERIFICATION'")) fail('unverified intake medications must remain reconciliation items, not medication orders');
requireText(promotion, 'units == null || units <= 0', 'service authorization must reject missing/zero units instead of inventing billable authorization');
requireText(promotion, "status !== 'APPROVED'", 'promotion service must refuse to run before intake approval');
requireText(promotion, 'Every intake section is retained below', 'full-fidelity admission summary fallback is missing');
requireText(promotion, "scan.status === 'INFECTED'", 'intake attachment malware block is missing');
requireText(promotion, 'stableId(', 'retry-safe deterministic promotion IDs are missing');

requireText(carePlanMigration, 'ClientIntakeCase_seed_draft_care_plan', 'approval-triggered DRAFT care-plan seed is missing');
requireText(carePlanMigration, 'sourceIntakeCaseId', 'care-plan intake provenance is missing');
requireText(carePlanMigration, "'DRAFT'", 'intake-seeded care plan must remain DRAFT pending review/signature');
requireText(alignmentMigration, 'SpireMedicationReconciliation', 'medication reconciliation alignment migration is missing');
requireText(alignmentMigration, 'updatedAt', 'retry-safe medication reconciliation timestamp is missing');

console.log('Client Intake automatic promotion verification passed: approval-triggered DRAFT plan plus full SPIRE promotion mapping, safety gates, response payload, and retry-safe repair route for previously approved intakes are present.');
