import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  getITSpecialistGateState,
  getITSpecialistKnowledgeContext,
  mergeITSpecialistPullRequest,
  syncITSpecialistKnowledge,
  verifyITSpecialistProductionCommit,
} from './it-specialist-knowledge.js';

type Json=Record<string,unknown>;
type AuthLike={userId:string;organizationId:string;role:unknown};
type WorkerLike={prNumber:number;prUrl:string;commitSha:string;branch:string};
type ReleaseRow={
  id:string;organizationId:string;actionId:string;conversationId:string;requestedByUserId:string;
  status:string;summary:string;resumeRequest:string;prNumber:number;prUrl:string;headSha:string;
  mergeSha:string|null;phaseStartedAt:Date|string;nextRunAt:Date|string|null;leaseUntil:Date|string|null;
};

const clean=(value:unknown,max=12000)=>String(value??'').trim().slice(0,max);
const obj=(value:unknown):Json=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Json;if(typeof value==='string'){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}}return{}};
const boolEnv=(name:string)=>String(process.env[name]||'').trim().toLowerCase()==='true';
const safeError=(error:unknown)=>clean(error instanceof Error?error.message:error,1800).replace(/ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+/g,'[REDACTED]');
const openAIKey=()=>process.env.OPENAI_API_KEY?.trim()||'';
const model=()=>clean(process.env.IT_AGENT_OPENAI_MODEL||process.env.SIA_OPENAI_MODEL||'gpt-5.6-terra',120);
const releaseTicket=(actionId:string)=>`ITAGENT-${actionId.replace(/-/g,'').slice(0,10).toUpperCase()}`;

export function ownerAutoExecutionEnabled(auth:AuthLike){
  if(!boolEnv('IT_AGENT_OWNER_AUTO_EXECUTION_ENABLED'))return false;
  const role=String(auth.role||'').toUpperCase();
  return role==='ADMINISTRATOR'||role==='CEO';
}

async function ensureSchema(prisma:PrismaClient){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentReleaseRun" (
    "id" TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "resumeRequest" TEXT NOT NULL DEFAULT '',
    "prNumber" INTEGER NOT NULL,
    "prUrl" TEXT NOT NULL DEFAULT '',
    "headSha" TEXT NOT NULL,
    "mergeSha" TEXT,
    "gateEvidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "productionEvidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "lastError" TEXT NOT NULL DEFAULT '',
    "nextRunAt" TIMESTAMPTZ,
    "leaseUntil" TIMESTAMPTZ,
    "phaseStartedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ITAgentReleaseRun_action_uq" ON "ITAgentReleaseRun"("organizationId","actionId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITAgentReleaseRun_due_idx" ON "ITAgentReleaseRun"("status","nextRunAt","leaseUntil")`);
}

async function patchAction(prisma:PrismaClient,input:{organizationId:string;actionId:string;status?:string;patch:Json;executedByUserId?:string;executed?:boolean}){
  const statusSql=input.status?`,"status"=$4`:'';
  const params:any[]=[JSON.stringify(input.patch),input.organizationId,input.actionId];
  if(input.status)params.push(input.status);
  let sql=`UPDATE "ITAgentAction" SET "result"=COALESCE("result",'{}'::jsonb)||$1::jsonb${statusSql},"updatedAt"=NOW()`;
  if(input.executed){params.push(input.executedByUserId||'');sql+=`,"executedByUserId"=$${params.length},"executedAt"=NOW()`}
  sql+=` WHERE "organizationId"=$2 AND "id"=$3`;
  await prisma.$executeRawUnsafe(sql,...params);
}

async function appendAssistant(prisma:PrismaClient,row:ReleaseRow,text:string){
  const content=clean(text,12000);if(!content)return;
  await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage" ("id","organizationId","conversationId","userId","role","content","model") VALUES ($1,$2,$3,$4,'assistant',$5,$6)`,randomUUID(),row.organizationId,row.conversationId,row.requestedByUserId,content,'it-agent-release-orchestrator');
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentConversation" SET "updatedAt"=NOW() WHERE "id"=$1 AND "organizationId"=$2`,row.conversationId,row.organizationId).catch(()=>{});
}

async function answerResumeRequest(prisma:PrismaClient,row:ReleaseRow){
  const request=clean(row.resumeRequest,12000);if(!request||!openAIKey())return'';
  try{
    const knowledge=await getITSpecialistKnowledgeContext(prisma,request);
    const trusted={
      repository:knowledge.repository,baseBranch:knowledge.baseBranch,headSha:knowledge.headSha,
      fileCount:(knowledge as any).fileCount||0,extensionCounts:(knowledge as any).extensionCounts||{},topLevelCounts:(knowledge as any).topLevelCounts||{},
      fileMatches:(knowledge.fileMatches||[]).slice(0,120),sourceMatches:((knowledge as any).sourceMatches||[]).slice(0,12),
      approvedWorkMatches:(knowledge.approvedWorkMatches||[]).slice(0,40),services:knowledge.services||[],
    };
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${openAIKey()}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:model(),
      instructions:'Answer the Administrator read-only Sulandra repository/deployment question from the trusted context only. Be exact. If the context contains an exact count, report it as exact. Do not invent code, PR, CI, Railway, file, or history facts. Do not request another code change in this retry step.',
      input:[{role:'user',content:[{type:'input_text',text:`REQUEST\n${request}\n\nTRUSTED CONTEXT\n${JSON.stringify(trusted).slice(0,120000)}`}]}],
    }),signal:AbortSignal.timeout(120000)});
    const payload=await response.json() as any;if(!response.ok)return'';
    const chunks:string[]=[];for(const item of payload?.output||[])if(item?.type==='message')for(const part of item?.content||[])if(part?.type==='output_text'&&part?.text)chunks.push(part.text);
    return clean(chunks.join('\n')||payload?.output_text||'',10000);
  }catch{return''}
}

export async function queueITAgentOwnerRelease(prisma:PrismaClient,input:{auth:AuthLike;actionId:string;conversationId:string;summary:string;resumeRequest?:string;worker:WorkerLike}){
  await ensureSchema(prisma);
  const id=randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentReleaseRun" ("id","organizationId","actionId","conversationId","requestedByUserId","status","summary","resumeRequest","prNumber","prUrl","headSha","nextRunAt") VALUES ($1,$2,$3,$4,$5,'WAITING_CI',$6,$7,$8,$9,$10,NOW()) ON CONFLICT ("organizationId","actionId") DO UPDATE SET "status"='WAITING_CI',"summary"=EXCLUDED."summary","resumeRequest"=EXCLUDED."resumeRequest","prNumber"=EXCLUDED."prNumber","prUrl"=EXCLUDED."prUrl","headSha"=EXCLUDED."headSha","mergeSha"=NULL,"lastError"='',"nextRunAt"=NOW(),"leaseUntil"=NULL,"phaseStartedAt"=NOW(),"updatedAt"=NOW()`,id,input.auth.organizationId,input.actionId,input.conversationId,input.auth.userId,clean(input.summary,1000),clean(input.resumeRequest,12000),Number(input.worker.prNumber),clean(input.worker.prUrl,1000),clean(input.worker.commitSha,100));
  const release={phase:'WAITING_CI',prNumber:input.worker.prNumber,prUrl:input.worker.prUrl,headSha:input.worker.commitSha,branch:input.worker.branch,message:`PR #${input.worker.prNumber} opened. Sulandra is checking required GitHub gates before merge.`};
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentAction" SET "status"='WAITING_CI',"approvalRequired"=FALSE,"result"=COALESCE("result",'{}'::jsonb)||$1::jsonb,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "id"=$3`,JSON.stringify({ownerAuthorization:{authorized:true,authorizedByUserId:input.auth.userId,source:'AUTHENTICATED_OWNER_REQUEST'},release}),input.auth.organizationId,input.actionId);
  return release;
}

async function claimNext(prisma:PrismaClient){
  await ensureSchema(prisma);
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentReleaseRun" SET "leaseUntil"=NULL,"updatedAt"=NOW() WHERE "leaseUntil"<NOW() AND "status" IN ('WAITING_CI','DEPLOYING')`).catch(()=>{});
  const rows=await prisma.$queryRawUnsafe<ReleaseRow[]>(`WITH candidate AS (SELECT "id" FROM "ITAgentReleaseRun" WHERE "status" IN ('WAITING_CI','DEPLOYING') AND COALESCE("nextRunAt",NOW())<=NOW() AND ("leaseUntil" IS NULL OR "leaseUntil"<NOW()) ORDER BY "updatedAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE "ITAgentReleaseRun" r SET "leaseUntil"=NOW()+INTERVAL '4 minutes',"updatedAt"=NOW() FROM candidate c WHERE r."id"=c."id" RETURNING r.*`);
  return rows[0]||null;
}

async function failRelease(prisma:PrismaClient,row:ReleaseRow,message:string,phase:string){
  const error=clean(message,1800);
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentReleaseRun" SET "status"='FAILED',"lastError"=$1,"nextRunAt"=NULL,"leaseUntil"=NULL,"updatedAt"=NOW() WHERE "id"=$2`,error,row.id);
  const finalReply=`Sulandra IT stopped the release before production success. ${error}`;
  await patchAction(prisma,{organizationId:row.organizationId,actionId:row.actionId,status:'FAILED',patch:{release:{phase:'FAILED',failedPhase:phase,error},finalReply}}).catch(()=>{});
  await appendAssistant(prisma,row,finalReply).catch(()=>{});
}

async function processWaitingCi(prisma:PrismaClient,row:ReleaseRow){
  const gates=await getITSpecialistGateState(row.headSha);
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentReleaseRun" SET "gateEvidence"=$1::jsonb,"updatedAt"=NOW() WHERE "id"=$2`,JSON.stringify(gates),row.id);
  if(gates.state==='PENDING'){
    await prisma.$executeRawUnsafe(`UPDATE "ITAgentReleaseRun" SET "nextRunAt"=NOW()+INTERVAL '25 seconds',"leaseUntil"=NULL,"updatedAt"=NOW() WHERE "id"=$1`,row.id);
    await patchAction(prisma,{organizationId:row.organizationId,actionId:row.actionId,status:'WAITING_CI',patch:{release:{phase:'WAITING_CI',prNumber:row.prNumber,prUrl:row.prUrl,headSha:row.headSha,gateReason:gates.reason,gateEvidence:gates.evidence}}});
    return;
  }
  if(gates.state==='FAILED')return failRelease(prisma,row,`PR #${row.prNumber} failed required validation: ${gates.reason}`,'CI');
  const merged=await mergeITSpecialistPullRequest(row.prNumber,row.headSha,releaseTicket(row.actionId));
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentReleaseRun" SET "status"='DEPLOYING',"mergeSha"=$1,"nextRunAt"=NOW()+INTERVAL '20 seconds',"leaseUntil"=NULL,"phaseStartedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=$2`,merged.mergeSha,row.id);
  await patchAction(prisma,{organizationId:row.organizationId,actionId:row.actionId,status:'DEPLOYING',patch:{release:{phase:'DEPLOYING',prNumber:row.prNumber,prUrl:row.prUrl,headSha:row.headSha,mergeSha:merged.mergeSha,gateReason:gates.reason,gateEvidence:gates.evidence,message:'Required GitHub gates passed. PR merged to release/sulandra-1.0; Railway production verification is now active.'}}});
}

async function processDeploying(prisma:PrismaClient,row:ReleaseRow){
  if(!row.mergeSha)return failRelease(prisma,row,'Release state is missing the merge commit.','DEPLOYMENT');
  const verification=await verifyITSpecialistProductionCommit(row.mergeSha);
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentReleaseRun" SET "productionEvidence"=$1::jsonb,"updatedAt"=NOW() WHERE "id"=$2`,JSON.stringify(verification),row.id);
  if(verification.state!=='GREEN'){
    if(Date.now()-new Date(row.phaseStartedAt).getTime()>25*60*1000)return failRelease(prisma,row,'The exact merged commit did not converge on all three production services within 25 minutes.','DEPLOYMENT');
    await prisma.$executeRawUnsafe(`UPDATE "ITAgentReleaseRun" SET "nextRunAt"=NOW()+INTERVAL '25 seconds',"leaseUntil"=NULL,"updatedAt"=NOW() WHERE "id"=$1`,row.id);
    await patchAction(prisma,{organizationId:row.organizationId,actionId:row.actionId,status:'DEPLOYING',patch:{release:{phase:'DEPLOYING',prNumber:row.prNumber,prUrl:row.prUrl,headSha:row.headSha,mergeSha:row.mergeSha,productionEvidence:verification,message:'Railway has the merged release; Sulandra is waiting until the Static Website and both APIs report the exact commit.'}}});
    return;
  }
  await syncITSpecialistKnowledge(prisma,true).catch(()=>null);
  const retryAnswer=await answerResumeRequest(prisma,row);
  const base=`Sulandra IT completed the approved change. PR #${row.prNumber} passed the required GitHub gates, merged as ${row.mergeSha.slice(0,12)}, and the exact commit is verified on the Static Website and both backend services.`;
  const finalReply=retryAnswer?`${base}\n\nRetried the previously blocked request:\n\n${retryAnswer}`:base;
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentReleaseRun" SET "status"='PRODUCTION_GREEN',"nextRunAt"=NULL,"leaseUntil"=NULL,"updatedAt"=NOW() WHERE "id"=$1`,row.id);
  await patchAction(prisma,{organizationId:row.organizationId,actionId:row.actionId,status:'EXECUTED',executed:true,executedByUserId:row.requestedByUserId,patch:{release:{phase:'PRODUCTION_GREEN',prNumber:row.prNumber,prUrl:row.prUrl,headSha:row.headSha,mergeSha:row.mergeSha,productionEvidence:verification,message:'All three production services are green on the exact merged commit.'},finalReply}});
  await appendAssistant(prisma,row,finalReply);
}

async function workOnce(prisma:PrismaClient){
  const row=await claimNext(prisma);if(!row)return;
  try{if(row.status==='WAITING_CI')await processWaitingCi(prisma,row);else if(row.status==='DEPLOYING')await processDeploying(prisma,row)}catch(error){await failRelease(prisma,row,safeError(error),row.status).catch(()=>{})}
}

let releaseTimer:ReturnType<typeof setInterval>|null=null;
export async function startITAgentOwnerReleaseWorker(prisma:PrismaClient){
  await ensureSchema(prisma);if(releaseTimer)return;
  const run=()=>void workOnce(prisma).catch(()=>{});
  setTimeout(run,1500);
  releaseTimer=setInterval(run,12000);
  releaseTimer.unref?.();
}
