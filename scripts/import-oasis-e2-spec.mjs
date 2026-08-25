import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OASIS_E2_CONTRACT_VERSION, validateNormalizedOasisE2Spec } from './oasis-e2-spec-contract.mjs';

const args=process.argv.slice(2);
const validateOnly=args.includes('--validate-only');
const fileArg=args.find((arg)=>!arg.startsWith('--'))||process.env.OASIS_E2_SPEC_FILE;
const importedById=process.env.OASIS_SPEC_IMPORTED_BY?.trim()||null;
const validatorVersion=OASIS_E2_CONTRACT_VERSION;

if(!fileArg){
  console.error('Usage: node scripts/import-oasis-e2-spec.mjs <normalized-spec.json> [--validate-only]');
  process.exit(2);
}

let input;
try{
  input=JSON.parse(await readFile(fileArg,'utf8'));
}catch(error){
  console.error(`[oasis-spec-import] unable to read/parse ${fileArg}:`,error);
  process.exit(2);
}

const result=validateNormalizedOasisE2Spec(input);
console.log(`[oasis-spec-import] contract=${validatorVersion}; valid=${result.valid}; items=${result.counts.items}; edits=${result.counts.edits}; valueSets=${result.counts.valueSets}; mappings=${result.counts.submissionMappings}`);
for(const entry of result.findings)console.log(`[oasis-spec-import] ${entry.severity} ${entry.code} ${entry.path}: ${entry.message}`);
if(!result.valid){
  console.error('[oasis-spec-import] specification rejected; database was not changed.');
  process.exit(1);
}
if(validateOnly){
  console.log(`[oasis-spec-import] validate-only PASS; normalizedDefinitionSha256=${result.normalizedDefinitionSha256}`);
  process.exit(0);
}
if(!process.env.DATABASE_URL){
  console.error('[oasis-spec-import] DATABASE_URL is required unless --validate-only is used.');
  process.exit(2);
}

const { PrismaClient }=await import('@prisma/client');
const prisma=new PrismaClient({datasourceUrl:process.env.DATABASE_URL});
try{
  await prisma.$transaction(async(tx)=>{
    const rows=await tx.$queryRawUnsafe(`
      SELECT "id","status"
        FROM "HomeHealthOasisSpecVersion"
       WHERE "itemSetVersionCode"=$1 AND "submissionSpecVersion"=$2
       LIMIT 1
       FOR UPDATE
    `,input.itemSetVersionCode,input.submissionSpecVersion);
    if(!rows[0])throw new Error('Registered OASIS-E2 3.02 specification row is missing; apply the regulated-core migration first.');
    const specVersionId=rows[0].id;
    const packageName=String(input.sourcePackage.name).trim();
    const packageSha=String(input.sourcePackage.sha256).trim().toLowerCase();
    const manifest=input.sourceManifest??{};
    const valueSets=input.valueSets??{};
    const submissionDefinition=input.submissionDefinition??{};
    const findings=result.findings??[];

    await tx.$executeRawUnsafe(`
      UPDATE "HomeHealthOasisSpecVersion"
         SET "itemDefinitions"=$1::jsonb,
             "editRules"=$2::jsonb,
             "valueSets"=$3::jsonb,
             "submissionDefinition"=$4::jsonb,
             "sourcePackageName"=$5,
             "sourcePackageSha256"=$6,
             "sourceManifest"=$7::jsonb,
             "definitionSha256"=$8,
             "normalizedDefinitionSha256"=$8,
             "loadedAt"=NOW(),
             "loadedById"=$9,
             "validatedAt"=NOW(),
             "validatedById"=$9,
             "validatorVersion"=$10,
             "status"='VALIDATED',
             "updatedAt"=NOW()
       WHERE "id"=$11
    `,
      JSON.stringify(input.itemDefinitions),JSON.stringify(input.editRules),JSON.stringify(valueSets),JSON.stringify(submissionDefinition),
      packageName,packageSha,JSON.stringify(manifest),result.normalizedDefinitionSha256,importedById,validatorVersion,specVersionId,
    );

    await tx.$executeRawUnsafe(`
      INSERT INTO "HomeHealthOasisSpecImport"(
        "id","specVersionId","sourcePackageName","sourcePackageSha256","normalizedDefinitionSha256",
        "sourceManifest","validatorVersion","validationStatus","validationFindings",
        "itemDefinitionCount","editRuleCount","valueSetCount","submissionMappingCount","importedById"
      ) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'PASS',$8::jsonb,$9,$10,$11,$12,$13)
    `,
      randomUUID(),specVersionId,packageName,packageSha,result.normalizedDefinitionSha256,JSON.stringify(manifest),validatorVersion,
      JSON.stringify(findings),result.counts.items,result.counts.edits,result.counts.valueSets,result.counts.submissionMappings,importedById,
    );
  },{maxWait:30000,timeout:120000});
  console.log(`[oasis-spec-import] IMPORT PASS; status=VALIDATED; normalizedDefinitionSha256=${result.normalizedDefinitionSha256}`);
}catch(error){
  console.error('[oasis-spec-import] import failed; transaction rolled back:',error);
  process.exitCode=1;
}finally{
  await prisma.$disconnect();
}
