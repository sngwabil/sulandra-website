import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'client-intake-routes.ts');
const marker = 'CLIENT_INTAKE_MASTER_DATA_NORMALIZATION_V1';

let source = await readFile(target, 'utf8');
if (source.includes(marker)) {
  console.log(`${marker} already installed`);
  process.exit(0);
}

const anchor = 'return patientId;}';
const occurrences = source.split(anchor).length - 1;
if (occurrences !== 1) {
  throw new Error(`Expected exactly one client-intake patient return anchor, found ${occurrences}`);
}

const patch = `// ${marker}: normalize explicit payer/member identifiers into first-class Spire master data without guessing from free text.
const payer=p.get('insurance_medicaid')||{};
const persistIdentifier=async(type:string,valueRaw:unknown,issuerRaw:unknown)=>{const value=clean(valueRaw,120);if(!value)return;const existing=await prisma.$queryRawUnsafe<Array<{id:string;patientId:string}>>(\`SELECT "id","patientId" FROM "SpirePatientIdentifier" WHERE "organizationId"=$1 AND "type"=$2 AND "value"=$3 LIMIT 2\`,a.organizationId,type,value);if(existing[0]&&existing[0].patientId!==patientId)throw httpError(409,\`\${type.replaceAll('_',' ')} is already linked to another SPIRE patient. Resolve the duplicate identity before approval.\`,{identifierType:type,identifierValue:value,existingPatientId:existing[0].patientId});if(!existing[0])await prisma.$executeRawUnsafe(\`INSERT INTO "SpirePatientIdentifier"("id","organizationId","patientId","type","value","issuer","active") VALUES($1,$2,$3,$4,$5,$6,TRUE)\`,randomUUID(),a.organizationId,patientId,type,value,clean(issuerRaw,160)||null);};
const eligibilityRaw=clean(payer.eligibilityStatus,40).toUpperCase();
const coverageStatus=eligibilityRaw==='ACTIVE'?'ACTIVE':eligibilityRaw==='PENDING'?'PENDING':eligibilityRaw==='NOT APPLICABLE'?'INACTIVE':'UNKNOWN';
const persistCoverage=async(payerNameRaw:unknown,memberIdRaw:unknown,coverageType:string)=>{const payerName=clean(payerNameRaw,200),memberId=clean(memberIdRaw,120);if(!payerName||!memberId)return;const existing=await prisma.$queryRawUnsafe<Array<{id:string;patientId:string}>>(\`SELECT "id","patientId" FROM "SpirePayerMemberCoverage" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND lower("payerName")=lower($3) AND "memberId"=$4 ORDER BY "createdAt" DESC LIMIT 2\`,a.organizationId,entity,payerName,memberId);if(existing[0]&&existing[0].patientId!==patientId)throw httpError(409,'This payer/member identifier is already linked to another SPIRE patient. Resolve the duplicate identity before approval.',{payerName,memberId,existingPatientId:existing[0].patientId});const benefits=JSON.stringify({source:'CLIENT_INTAKE',sourceIntakeCaseId:String(caseRow.id),primaryInsurance:clean(payer.primaryInsurance,3000)||null,secondaryInsurance:clean(payer.secondaryInsurance,3000)||null,coverageNotes:clean(payer.coverageNotes,3000)||null});if(existing[0])await prisma.$executeRawUnsafe(\`UPDATE "SpirePayerMemberCoverage" SET "status"=$1,"coverageType"=$2,"benefits"=$3::jsonb,"verifiedAt"=NOW(),"verifiedById"=$4,"updatedAt"=NOW() WHERE "organizationId"=$5 AND "legalEntityId"=$6 AND "id"=$7 AND "patientId"=$8\`,coverageStatus,coverageType,benefits,a.userId,a.organizationId,entity,existing[0].id,patientId);else await prisma.$executeRawUnsafe(\`INSERT INTO "SpirePayerMemberCoverage"("id","organizationId","legalEntityId","patientId","payerName","memberId","coverageType","status","benefits","verifiedAt","verifiedById") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW(),$10)\`,randomUUID(),a.organizationId,entity,patientId,payerName,memberId,coverageType,coverageStatus,benefits,a.userId);};
const medicaidId=clean(payer.medicaidId,120),medicareId=clean(payer.medicareId,120),structuredMemberId=clean(payer.memberId||payer.payerMemberId,120),structuredPayerName=clean(payer.payerName,200);
await persistIdentifier('MEDICAID_ID',medicaidId,'Ohio Medicaid');
await persistIdentifier('MEDICARE_ID',medicareId,'Medicare');
if(structuredMemberId)await persistIdentifier('PAYER_MEMBER_ID',structuredMemberId,structuredPayerName||'Client Intake');
await persistCoverage('Ohio Medicaid',medicaidId,'MEDICAID');
await persistCoverage('Medicare',medicareId,'MEDICARE');
if(structuredPayerName&&structuredMemberId)await persistCoverage(structuredPayerName,structuredMemberId,'PRIMARY');
return patientId;}`;

source = source.replace(anchor, patch);
await writeFile(target, source, 'utf8');
console.log(`${marker} installed in ${path.relative(root, target)}`);
