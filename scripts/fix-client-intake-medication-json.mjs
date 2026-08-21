import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api/src/client-intake-promotion.ts');
const marker = 'CLIENT_INTAKE_MEDICATION_DUETIMES_JSONB_V2';
let source = await readFile(target, 'utf8');

const legacySql = "CASE WHEN $9='' THEN ARRAY[]::text[] ELSE string_to_array($9,',') END";
const modernJsonSql = '$9::jsonb';
const compatibleJsonSql = '$10::jsonb';
const legacyArgument = "med.dueTimes.join(','), instructions, effectiveStart, med.endDate, auth.userId,";
const jsonArgument = 'JSON.stringify(med.dueTimes), instructions, effectiveStart, med.endDate, auth.userId,';

if (source.includes(legacySql)) source = source.replace(legacySql, modernJsonSql);
if (source.includes(legacyArgument)) source = source.replace(legacyArgument, jsonArgument);

if (source.includes(legacySql) || source.includes(legacyArgument)) {
  throw new Error('Legacy Client Intake medication dueTimes text-array persistence is still present');
}
// The first transform uses $9 for dueTimes. Adding the required legacy clientId
// column below shifts dueTimes to $10. Accept both valid stages so a second build
// can verify the already-compatible output instead of rejecting its own rewrite.
if ((!source.includes(modernJsonSql) && !source.includes(compatibleJsonSql)) || !source.includes(jsonArgument)) {
  throw new Error('Client Intake medication dueTimes jsonb persistence could not be verified');
}

// SpireMedicationOrder still carries required legacy client/user columns used by the
// existing eMAR routes. The permanent SPIRE patient is the same durable person key
// used as clientId, so populate both generations of columns during intake promotion.
const modernColumns = '"id","organizationId","legalEntityId","patientId","name","dose","route","frequency","dueTimes","instructions","status","startDate","endDate","orderedById"';
const compatibleColumns = '"id","organizationId","clientId","legalEntityId","patientId","name","dose","route","frequency","dueTimes","instructions","status","startDate","endDate","orderedByUserId","lastModifiedByUserId","orderedById"';
const modernValues = "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'ACTIVE',$11::date,$12::date,$13)";
const compatibleValues = "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'ACTIVE',$12::date,$13::date,$14,$14,$14)";
const modernArgs = `orderId, auth.organizationId, entityId, patientId, med.name, med.dose, med.route, med.frequency,\n        JSON.stringify(med.dueTimes), instructions, effectiveStart, med.endDate, auth.userId,`;
const compatibleArgs = `orderId, auth.organizationId, patientId, entityId, patientId, med.name, med.dose, med.route, med.frequency,\n        JSON.stringify(med.dueTimes), instructions, effectiveStart, med.endDate, auth.userId,`;

if (source.includes(modernColumns)) source = source.replace(modernColumns, compatibleColumns);
if (source.includes(modernValues)) source = source.replace(modernValues, compatibleValues);
if (source.includes(modernArgs)) source = source.replace(modernArgs, compatibleArgs);

if (source.includes(modernColumns) || source.includes(modernValues) || source.includes(modernArgs)) {
  throw new Error('Client Intake medication promotion still omits required legacy SpireMedicationOrder columns');
}
if (!source.includes(compatibleColumns) || !source.includes(compatibleValues) || !source.includes(compatibleArgs)) {
  throw new Error('Client Intake medication promotion legacy-column compatibility could not be verified');
}

const conflictAnchor = 'ON CONFLICT("id") DO UPDATE SET "legalEntityId"=EXCLUDED."legalEntityId","name"=EXCLUDED."name"';
const compatibleConflict = 'ON CONFLICT("id") DO UPDATE SET "clientId"=EXCLUDED."clientId","legalEntityId"=EXCLUDED."legalEntityId","patientId"=EXCLUDED."patientId","lastModifiedByUserId"=EXCLUDED."lastModifiedByUserId","name"=EXCLUDED."name"';
if (source.includes(conflictAnchor)) source = source.replace(conflictAnchor, compatibleConflict);
if (!source.includes(compatibleConflict)) {
  throw new Error('Client Intake medication promotion idempotent legacy-column update could not be verified');
}

if (!source.includes(marker)) {
  source = source.replace(
    /\/\* CLIENT_INTAKE_MEDICATION_DUETIMES_JSONB_V1:[^*]*\*\/\nasync function ensureMedications\(\n|async function ensureMedications\(\n/,
    `/* ${marker}: persist dueTimes as jsonb and populate both durable patient and required legacy eMAR client/user columns. */\nasync function ensureMedications(\n`,
  );
}

await writeFile(target, source, 'utf8');
console.log('Client Intake medication promotion now persists jsonb dueTimes and populates required legacy eMAR client/user columns alongside permanent SPIRE patient columns.');
