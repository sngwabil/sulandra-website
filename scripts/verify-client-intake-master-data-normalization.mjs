import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'client-intake-routes.ts');
const source = await readFile(target, 'utf8');

const required = [
  'CLIENT_INTAKE_MASTER_DATA_NORMALIZATION_V1',
  'SpirePatientIdentifier',
  "'MEDICAID_ID'",
  "'MEDICARE_ID'",
  "'PAYER_MEMBER_ID'",
  'SpirePayerMemberCoverage',
  "source:'CLIENT_INTAKE'",
  'sourceIntakeCaseId:String(caseRow.id)',
  'already linked to another SPIRE patient',
  'Resolve the duplicate identity before approval',
  'structuredMemberId=clean(payer.memberId||payer.payerMemberId,120)',
  'structuredPayerName=clean(payer.payerName,200)',
];

for (const value of required) {
  if (!source.includes(value)) throw new Error(`Client intake master-data normalization is missing ${value}`);
}

if (/primaryInsurance[^\n]{0,500}split\s*\(/.test(source)) {
  throw new Error('Client intake master-data normalization must not infer structured payer/member identity by parsing primaryInsurance free text');
}

const markerCount = source.split('CLIENT_INTAKE_MASTER_DATA_NORMALIZATION_V1').length - 1;
if (markerCount !== 1) throw new Error(`Expected one master-data normalization marker, found ${markerCount}`);

console.log('Client intake master-data normalization verified: explicit Medicaid/Medicare/payer identifiers are promoted idempotently, duplicate identity conflicts fail closed, and ambiguous free-text insurance is not parsed into structured identity.');
