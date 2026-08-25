import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { validateNormalizedOasisE2Spec } from './oasis-e2-spec-contract.mjs';

const EXPECTED_PACKAGE_SHA256='b848a1f33efb77406124f02bfd50dbb48c6efb841c4e4bf3c68719c1e8d9f6ca';
const EXPECTED_NORMALIZED_SHA256='bf01dced0972a5a2629c084de87e4071dd855de3e46d315db53252562af432ee';
const ITEM_SET='E2-042026';
const SPEC_VERSION='3.02';
const node=process.execPath;

if(!process.env.DATABASE_URL)throw new Error('[oasis:promote] DATABASE_URL is required');

function run(command,args){
  console.log(`[oasis:promote] ${command} ${args.join(' ')}`);
  const result=spawnSync(command,args,{stdio:'inherit',env:process.env});
  if(result.status!==0)throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status??'unknown'}`);
}

const prisma=new PrismaClient({datasourceUrl:process.env.DATABASE_URL});
let workdir;
try{
  const rows=await prisma.$queryRawUnsafe(`
    SELECT "id","status","sourcePackageSha256","normalizedDefinitionSha256"
      FROM "HomeHealthOasisSpecVersion"
     WHERE "itemSetVersionCode"=$1 AND "submissionSpecVersion"=$2
     LIMIT 1
  `,ITEM_SET,SPEC_VERSION);
  const current=rows[0];
  if(!current)throw new Error('[oasis:promote] registered OASIS-E2 3.02 row is missing after migrations');
  if(current.status==='VALIDATED'){
    if(current.sourcePackageSha256===EXPECTED_PACKAGE_SHA256&&current.normalizedDefinitionSha256===EXPECTED_NORMALIZED_SHA256){
      console.log('[oasis:promote] PASS: pinned CMS OASIS-E2 3.02.0 definition is already VALIDATED; no import needed.');
      process.exitCode=0;
    }else{
      throw new Error(`[oasis:promote] refusing automatic overwrite of an existing VALIDATED OASIS specification. package=${current.sourcePackageSha256||'null'} normalized=${current.normalizedDefinitionSha256||'null'}`);
    }
  }else{
    workdir=await mkdtemp(path.join(tmpdir(),'sulandra-oasis-e2-'));
    const root=path.join(workdir,'official');
    const extracted=path.join(root,'extracted');
    const csv=path.join(root,'csv');
    const html=path.join(root,'html');
    await mkdir(extracted,{recursive:true});await mkdir(csv,{recursive:true});await mkdir(html,{recursive:true});
    run(node,['scripts/fetch-official-oasis-e2-package.mjs',root]);
    const outer=path.join(root,'oasis-e2-data-specs-v3.02.0-final.zip');
    run('unzip',['-q',outer,'-d',extracted]);
    run('unzip',['-q',path.join(extracted,'OASIS E2 Data Specs CSV Files V3.02.0 FINAL 10-13-2025.zip'),'-d',csv]);
    run('unzip',['-q',path.join(extracted,'OASIS E2 Data Specs HTML Files V3.02.0 FINAL 10-13-2025.zip'),'-d',html]);
    const normalized=path.join(root,'oasis-e2-v3.02.0.normalized.json');
    run(node,['scripts/normalize-official-oasis-e2-package.mjs',root,normalized]);
    const input=JSON.parse(await readFile(normalized,'utf8'));
    const validation=validateNormalizedOasisE2Spec(input);
    if(!validation.valid)throw new Error(`[oasis:promote] normalized official CMS package failed contract validation: ${JSON.stringify(validation.findings)}`);
    if(input.sourcePackage?.sha256!==EXPECTED_PACKAGE_SHA256)throw new Error('[oasis:promote] normalized package source fingerprint mismatch');
    if(validation.normalizedDefinitionSha256!==EXPECTED_NORMALIZED_SHA256)throw new Error(`[oasis:promote] deterministic definition fingerprint mismatch. expected=${EXPECTED_NORMALIZED_SHA256} actual=${validation.normalizedDefinitionSha256}`);
    console.log(`[oasis:promote] validation-only PASS: package=${EXPECTED_PACKAGE_SHA256} normalized=${EXPECTED_NORMALIZED_SHA256}`);
    run(node,['scripts/import-oasis-e2-spec.mjs',normalized]);
    const confirmed=await prisma.$queryRawUnsafe(`
      SELECT "status","sourcePackageSha256","normalizedDefinitionSha256",
             jsonb_array_length("itemDefinitions")::int AS "itemCount",
             jsonb_array_length("editRules")::int AS "editCount",
             jsonb_object_length("valueSets")::int AS "valueSetCount",
             jsonb_array_length(COALESCE("submissionDefinition"->'fields','[]'::jsonb))::int AS "mappingCount"
        FROM "HomeHealthOasisSpecVersion"
       WHERE "itemSetVersionCode"=$1 AND "submissionSpecVersion"=$2
       LIMIT 1
    `,ITEM_SET,SPEC_VERSION);
    const after=confirmed[0];
    if(!after||after.status!=='VALIDATED'||after.sourcePackageSha256!==EXPECTED_PACKAGE_SHA256||after.normalizedDefinitionSha256!==EXPECTED_NORMALIZED_SHA256||after.itemCount!==420||after.editCount!==233||after.valueSetCount!==367||after.mappingCount!==420){
      throw new Error(`[oasis:promote] database verification failed after import: ${JSON.stringify(after??null)}`);
    }
    console.log('[oasis:promote] IMPORT PASS: official CMS OASIS-E2 3.02.0 is VALIDATED in the database (420 items, 233 edits, 367 value sets, 420 mappings).');
  }
}finally{
  await prisma.$disconnect();
  if(workdir)await rm(workdir,{recursive:true,force:true});
}
