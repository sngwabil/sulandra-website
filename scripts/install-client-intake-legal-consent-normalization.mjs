import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'client-intake-routes.ts');
const marker = 'CLIENT_INTAKE_LEGAL_CONSENT_NORMALIZATION_V1';

let source = await readFile(target, 'utf8');
if (source.includes(marker)) {
  console.log(`${marker} already installed`);
  process.exit(0);
}

const anchor = 'return patientId;}';
const occurrences = source.split(anchor).length - 1;
if (occurrences !== 1) throw new Error(`Expected exactly one client-intake patient return anchor, found ${occurrences}`);

const patch = `// ${marker}: normalize explicit structured guardian and signature evidence into first-class Spire records while preserving intake as source evidence.
const legalDecision=p.get('legal_decision_maker')||{};
const guardianFlag=clean(legalDecision.hasGuardian,40).toUpperCase();
const guardianName=clean(legalDecision.guardianName,240),guardianRelationship=clean(legalDecision.guardianRelationship,160);
const guardianVerification=\`CLIENT_INTAKE_GUARDIANSHIP:\${String(caseRow.id)}\`;
const existingGuardian=await prisma.$queryRawUnsafe<Array<{id:string}>>(\`SELECT "id" FROM "SpirePatientProxyRelationship" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "verificationMethod"=$4 ORDER BY "createdAt" DESC LIMIT 1\`,a.organizationId,entity,patientId,guardianVerification);
if(guardianFlag==='YES'&&guardianName&&guardianRelationship){
  const guardianEmail=clean(legalDecision.guardianEmail,240)||null,guardianPhone=clean(legalDecision.guardianPhone,120)||null;
  if(existingGuardian[0])await prisma.$executeRawUnsafe(\`UPDATE "SpirePatientProxyRelationship" SET "proxyName"=$1,"relationship"=$2,"email"=$3,"phone"=$4,"status"='ACTIVE',"endsAt"=NULL,"verifiedById"=$5 WHERE "organizationId"=$6 AND "legalEntityId"=$7 AND "patientId"=$8 AND "id"=$9\`,guardianName,guardianRelationship,guardianEmail,guardianPhone,a.userId,a.organizationId,entity,patientId,existingGuardian[0].id);
  else await prisma.$executeRawUnsafe(\`INSERT INTO "SpirePatientProxyRelationship"("id","organizationId","legalEntityId","patientId","proxyName","relationship","email","phone","status","permissions","verifiedById","verificationMethod") VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE','[]'::jsonb,$9,$10)\`,randomUUID(),a.organizationId,entity,patientId,guardianName,guardianRelationship,guardianEmail,guardianPhone,a.userId,guardianVerification);
}else if(guardianFlag==='NO'&&existingGuardian[0]){
  await prisma.$executeRawUnsafe(\`UPDATE "SpirePatientProxyRelationship" SET "status"='INACTIVE',"endsAt"=COALESCE("endsAt",NOW()),"verifiedById"=$1 WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "patientId"=$4 AND "id"=$5\`,a.userId,a.organizationId,entity,patientId,existingGuardian[0].id);
}
// POA and representative-payee intake fields remain source documentation only until a distinct structured person/authority record exists; never infer a proxy identity from those free-text fields.
const intakeSignatures=await prisma.$queryRawUnsafe<Array<{id:string;signatureType:string;signerName:string;signerRelationship:string|null;signerEmail:string|null;signatureMethod:string;attestation:string;signedByUserId:string|null;signedAt:Date;ipAddress:string|null;userAgent:string|null;revokedAt:Date|null;revokedById:string|null;revocationReason:string|null}>>(\`SELECT "id","signatureType","signerName","signerRelationship","signerEmail","signatureMethod","attestation","signedByUserId","signedAt","ipAddress","userAgent","revokedAt","revokedById","revocationReason" FROM "ClientIntakeSignature" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "intakeCaseId"=$3 ORDER BY "signedAt" ASC\`,a.organizationId,entity,String(caseRow.id));
for(const signature of intakeSignatures){
  const directiveStatus=signature.revokedAt?'REVOKED':'ACTIVE';
  const existingDirective=await prisma.$queryRawUnsafe<Array<{id:string}>>(\`SELECT "id" FROM "SpireConsentDirective" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "source"='CLIENT_INTAKE_SIGNATURE' AND "documentId"=$4 LIMIT 1\`,a.organizationId,entity,patientId,signature.id);
  if(existingDirective[0])await prisma.$executeRawUnsafe(\`UPDATE "SpireConsentDirective" SET "consentType"=$1,"scope"='CLIENT_INTAKE',"status"=$2,"effectiveAt"=$3,"revokedAt"=$4,"recordedById"=$5,"updatedAt"=NOW() WHERE "organizationId"=$6 AND "legalEntityId"=$7 AND "patientId"=$8 AND "id"=$9\`,signature.signatureType,directiveStatus,signature.signedAt,signature.revokedAt,signature.signedByUserId||a.userId,a.organizationId,entity,patientId,existingDirective[0].id);
  else await prisma.$executeRawUnsafe(\`INSERT INTO "SpireConsentDirective"("id","organizationId","legalEntityId","patientId","consentType","scope","status","effectiveAt","revokedAt","source","documentId","restrictions","recordedById") VALUES($1,$2,$3,$4,$5,'CLIENT_INTAKE',$6,$7,$8,'CLIENT_INTAKE_SIGNATURE',$9,'{}'::jsonb,$10)\`,randomUUID(),a.organizationId,entity,patientId,signature.signatureType,directiveStatus,signature.signedAt,signature.revokedAt,signature.id,signature.signedByUserId||a.userId);
}
return patientId;}`;

source = source.replace(anchor, patch);
await writeFile(target, source, 'utf8');
console.log(`${marker} installed in ${path.relative(root, target)}`);
