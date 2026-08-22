import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const revenuePath=path.join(root,'api','src','revenue-cycle-routes.ts');
const exchangePath=path.join(root,'api','src','revenue-cycle-claim-exchange-routes.ts');

const injectImport=(source,anchor,statement,label)=>{
  if(source.includes(statement))return source;
  if(!source.includes(anchor))throw new Error(`Prebill hard-stop installer could not find ${label}`);
  return source.replace(anchor,`${anchor}\n${statement}`);
};

let revenue=await readFile(revenuePath,'utf8');
revenue=injectImport(revenue,"import { z } from 'zod';","import { assertRevenuePrebillBatch } from './spire-prebill-hard-stop.js';",'Revenue Cycle import anchor');

const finalizeAnchor="if(String(batch.status)!=='DRAFT')throw httpError(409,'Only DRAFT batches can be finalized or voided');if(action==='FINALIZE'){";
const finalizeReplacement="if(String(batch.status)!=='DRAFT')throw httpError(409,'Only DRAFT batches can be finalized or voided');if(action==='FINALIZE'){await assertRevenuePrebillBatch(prisma,{organizationId:a.organizationId,legalEntityId:entity(a),batchId:req.params.batchId,stage:'BATCH_FINALIZE',actorUserId:a.userId,recordDecisions:true});";
if(!revenue.includes("stage:'BATCH_FINALIZE'")){
  if(!revenue.includes(finalizeAnchor))throw new Error('Prebill hard-stop installer could not find Revenue Cycle FINALIZE anchor');
  revenue=revenue.replace(finalizeAnchor,finalizeReplacement);
}

const csvAnchor="if(!['FINALIZED','EXPORTED'].includes(String(batch.status)))throw httpError(409,'Finalize the revenue batch before export');const rows=";
const csvReplacement="if(!['FINALIZED','EXPORTED'].includes(String(batch.status)))throw httpError(409,'Finalize the revenue batch before export');await assertRevenuePrebillBatch(prisma,{organizationId:a.organizationId,legalEntityId:entity(a),batchId:req.params.batchId,stage:'CSV_EXPORT',actorUserId:a.userId,recordDecisions:true});const rows=";
if(!revenue.includes("stage:'CSV_EXPORT'")){
  if(!revenue.includes(csvAnchor))throw new Error('Prebill hard-stop installer could not find Revenue Cycle CSV export anchor');
  revenue=revenue.replace(csvAnchor,csvReplacement);
}
await writeFile(revenuePath,revenue,'utf8');

let exchange=await readFile(exchangePath,'utf8');
exchange=injectImport(exchange,"import { buildRevenueClaimCandidate, parseBasic835, type ClaimFormat } from './revenue-cycle-x12.js';","import { assertRevenuePrebillBatch } from './spire-prebill-hard-stop.js';",'claim exchange import anchor');

const generateAnchor="if(clean(profile.environment,20)==='PRODUCTION'&&(profile.productionEnabled!==true||clean(profile.externalVerificationStatus,30)!=='VERIFIED'))throw httpError(409,'Production-format generation is blocked until the selected profile is externally VERIFIED and production-enabled. Direct electronic submission is still not configured.');const controls=";
const generateReplacement="if(clean(profile.environment,20)==='PRODUCTION'&&(profile.productionEnabled!==true||clean(profile.externalVerificationStatus,30)!=='VERIFIED'))throw httpError(409,'Production-format generation is blocked until the selected profile is externally VERIFIED and production-enabled. Direct electronic submission is still not configured.');const prebill=await assertRevenuePrebillBatch(p,{organizationId:a.organizationId,legalEntityId:entity(a),batchId:req.params.batchId,stage:'CLAIM_GENERATE',actorUserId:a.userId,recordDecisions:true});const controls=";
if(!exchange.includes("stage:'CLAIM_GENERATE'")){
  if(!exchange.includes(generateAnchor))throw new Error('Prebill hard-stop installer could not find X12 generation anchor');
  exchange=exchange.replace(generateAnchor,generateReplacement);
}

const metadataAnchor="JSON.stringify({...candidate.metadata,warnings:candidate.warnings})";
const metadataReplacement="JSON.stringify({...candidate.metadata,warnings:candidate.warnings,prebillHardStop:{fingerprint:prebill.fingerprint,checkedAt:new Date().toISOString(),eventCount:prebill.events.length}})";
if(!exchange.includes('prebillHardStop:{fingerprint:prebill.fingerprint')){
  if(!exchange.includes(metadataAnchor))throw new Error('Prebill hard-stop installer could not find X12 metadata anchor');
  exchange=exchange.replace(metadataAnchor,metadataReplacement);
}

const downloadAnchor="const submission=await submissionRow(p,a,req.params.submissionId);res.setHeader('Content-Type','application/edi-x12; charset=utf-8');";
const downloadReplacement="const submission=await submissionRow(p,a,req.params.submissionId);if(clean(submission.status,30)==='GENERATED'){const prebillMeta=obj(obj(submission.metadata).prebillHardStop),expected=clean(prebillMeta.fingerprint,128);if(!expected)throw httpError(409,'Claim candidate predates the current pre-bill snapshot requirement. Regenerate it before download.',{code:'REVENUE_PREBILL_SNAPSHOT_MISSING'});await assertRevenuePrebillBatch(p,{organizationId:a.organizationId,legalEntityId:entity(a),batchId:String(submission.batchId),stage:'CLAIM_DOWNLOAD',expectedFingerprint:expected});}res.setHeader('Content-Type','application/edi-x12; charset=utf-8');";
if(!exchange.includes("stage:'CLAIM_DOWNLOAD'")){
  if(!exchange.includes(downloadAnchor))throw new Error('Prebill hard-stop installer could not find claim download anchor');
  exchange=exchange.replace(downloadAnchor,downloadReplacement);
}

const handoffAnchor="if(clean(submission.status,30)!=='GENERATED')throw httpError(409,'Only a GENERATED claim candidate can be handed off externally.');if(clean(submission.environment,20)==='PRODUCTION'&&(profile.productionEnabled!==true||clean(profile.externalVerificationStatus,30)!=='VERIFIED'))throw httpError(409,'Production handoff is blocked until the immutable profile version contains verified external evidence.');await p.$transaction";
const handoffReplacement="if(clean(submission.status,30)!=='GENERATED')throw httpError(409,'Only a GENERATED claim candidate can be handed off externally.');if(clean(submission.environment,20)==='PRODUCTION'&&(profile.productionEnabled!==true||clean(profile.externalVerificationStatus,30)!=='VERIFIED'))throw httpError(409,'Production handoff is blocked until the immutable profile version contains verified external evidence.');const prebillMeta=obj(obj(submission.metadata).prebillHardStop),expected=clean(prebillMeta.fingerprint,128);if(!expected)throw httpError(409,'Claim candidate predates the current pre-bill snapshot requirement. Regenerate it before handoff.',{code:'REVENUE_PREBILL_SNAPSHOT_MISSING'});await assertRevenuePrebillBatch(p,{organizationId:a.organizationId,legalEntityId:entity(a),batchId:String(submission.batchId),stage:'CLAIM_HANDOFF',actorUserId:a.userId,recordDecisions:true,expectedFingerprint:expected});await p.$transaction";
if(!exchange.includes("stage:'CLAIM_HANDOFF'")){
  if(!exchange.includes(handoffAnchor))throw new Error('Prebill hard-stop installer could not find external handoff anchor');
  exchange=exchange.replace(handoffAnchor,handoffReplacement);
}

await writeFile(exchangePath,exchange,'utf8');
console.log('Revenue pre-bill hard stops installed at batch finalize, CSV export, X12 generation, generated-file download and external handoff.');
