import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api/src/client-intake-promotion.ts');
const marker = 'CLIENT_INTAKE_MEDICATION_DUETIMES_JSONB_V1';
let source = await readFile(target, 'utf8');

const legacySql = "CASE WHEN $9='' THEN ARRAY[]::text[] ELSE string_to_array($9,',') END";
const jsonSql = '$9::jsonb';
const legacyArgument = "med.dueTimes.join(','), instructions, effectiveStart, med.endDate, auth.userId,";
const jsonArgument = 'JSON.stringify(med.dueTimes), instructions, effectiveStart, med.endDate, auth.userId,';

if (source.includes(legacySql)) source = source.replace(legacySql, jsonSql);
if (source.includes(legacyArgument)) source = source.replace(legacyArgument, jsonArgument);

if (source.includes(legacySql) || source.includes(legacyArgument)) {
  throw new Error('Legacy Client Intake medication dueTimes text-array persistence is still present');
}
if (!source.includes(jsonSql) || !source.includes(jsonArgument)) {
  throw new Error('Client Intake medication dueTimes jsonb persistence could not be verified');
}

if (!source.includes(marker)) {
  source = source.replace(
    "async function ensureMedications(\n",
    `/* ${marker}: SpireMedicationOrder.dueTimes is jsonb; persist parsed administration times as a parameterized JSON array. */\nasync function ensureMedications(\n`,
  );
}

await writeFile(target, source, 'utf8');
console.log('Client Intake medication dueTimes are persisted as parameterized jsonb arrays for SPIRE medication orders.');
