import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import type { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;legalEntityId?:string|null};
type Dependencies={app:Express;prisma:PrismaClient;authOf:(response:Response)=>AuthContext;requireRoles:(...roles:UserRole[])=>RequestHandler;adminRoles:readonly UserRole[]};
type Json=Record<string,unknown>;
type GitTreeItem={path:string;mode:string;type:string;sha:string;size?:number};
type WorkerAction={id:string;conversationId:string;payload:Json|string;result:Json|string;status:string};

type WorkerResult={
  runId:string;status:'PR_OPEN';repository:string;baseBranch:string;branch:string;baseSha:string;commitSha:string;
  prNumber:number;prUrl:string;model:string;summary:string;files:string[];
};

const approveSchema=z.object({note:z.string().trim().max(3000).optional().default('')});
const clean=(value:unknown,max=12000)=>String(value??'').trim().slice(0,max);
const obj=(value:unknown):Json=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Json;if(typeof value==='string'){try{const p=JSON.parse(value);return p&&typeof p==='object'&&!Array.isArray(p)?p:{}}catch{return{}}}return{}};
const safeError=(error:unknown)=>clean(error instanceof Error?error.message:error,1600).replace(/ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+/g,'[REDACTED]');
const httpError=(status:number,message:string,details?:unknown)=>Object.assign(new Error(message),{status,details});
const boolEnv=(name:string)=>String(process.env[name]||'').trim().toLowerCase()==='true';
const repoName=()=>clean(process.env.SULANDRA_GITHUB_REPOSITORY||'sngwabil/sulandra-website',200);
const baseBranch=()=>clean(process.env.IT_AGENT_GITHUB_BASE_BRANCH||'release/sulandra-1.0',200);
const branchPrefix=()=>clean(process.env.IT_AGENT_GITHUB_BRANCH_PREFIX||'it-agent/',80);
const mode=()=>clean(process.env.IT_AGENT_CODING_WORKER_MODE||'PR_ONLY',40).toUpperCase();
const codexModel=()=>clean(process.env.IT_AGENT_CODEX_MODEL||'gpt-5.3-codex',120);
const githubToken=()=>process.env.SULANDRA_GITHUB_TOKEN?.trim()||'';
const openAIKey=()=>process.env.OPENAI_API_KEY?.trim()||'';

export function itCodingWorkerStatus(){
  const repository=repoName();
  return{
    configured:Boolean(githubToken()&&openAIKey()&&repository&&baseBranch()),
    enabled:boolEnv('IT_AGENT_CODING_WORKER_ENABLED'),
    mode:mode(),repository,baseBranch:baseBranch(),branchPrefix:branchPrefix(),model:codexModel(),
    githubCredentialPresent:Boolean(githubToken()),openAICredentialPresent:Boolean(openAIKey()),
  };
}

const splitRepo=()=>{const [owner,repo]=repoName().split('/');if(!owner||!repo||repoName().split('/').length!==2)throw httpError(500,'SULANDRA_GITHUB_REPOSITORY must be owner/repo');return{owner,repo}};
const refPath=(branch:string)=>branch.split('/').map(encodeURIComponent).join('/');
const filePath=(path:string)=>path.split('/').map(encodeURIComponent).join('/');

async function gh(path:string,init:RequestInit={}){
  const token=githubToken();if(!token)throw httpError(503,'GitHub coding-worker credential is not configured');
  const {owner,repo}=splitRepo();
  const response=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`,{
    ...init,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Sulandra-IT-Coding-Worker',...(init.headers||{})},
    signal:AbortSignal.timeout(60000),
  });
  const text=await response.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={message:text.slice(0,500)}}
  if(!response.ok)throw httpError(response.status,`GitHub worker request failed (${response.status}): ${clean(data?.message||'Unknown GitHub error',500)}`);
  return data;
}

export async function probeITCodingWorker(){
  const status=itCodingWorkerStatus();
  if(!status.configured)return{...status,authenticated:false,baseBranchReachable:false};
  try{
    await gh('');
    await gh(`/git/ref/heads/${refPath(status.baseBranch)}`);
    return{...status,authenticated:true,baseBranchReachable:true};
  }catch(error){return{...status,authenticated:false,baseBranchReachable:false,error:safeError(error)}}
}

function parseModelJson(text:string){
  const trimmed=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const start=trimmed.indexOf('{'),end=trimmed.lastIndexOf('}');if(start<0||end<start)throw httpError(502,'Codex worker returned no JSON object');
  try{return JSON.parse(trimmed.slice(start,end+1)) as Json}catch{throw httpError(502,'Codex worker returned invalid JSON')}
}
function responseText(payload:any){const chunks:string[]=[];for(const item of payload?.output||[])if(item?.type==='message')for(const part of item?.content||[])if(part?.type==='output_text'&&part?.text)chunks.push(part.text);return clean(chunks.join('\n')||payload?.output_text||'',1000000)}
async function codex(instructions:string,input:string){
  const key=openAIKey();if(!key)throw httpError(503,'OPENAI_API_KEY is not configured for the coding worker');
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:codexModel(),instructions,input}),signal:AbortSignal.timeout(180000)});
  const payload=await response.json() as any;if(!response.ok)throw httpError(502,clean(payload?.error?.message||`Codex request failed (${response.status})`,800));
  return parseModelJson(responseText(payload));
}

const forbiddenPath=(path:string)=>{
  const p=path.toLowerCase();
  return !path||path.startsWith('/')||path.includes('..')||path.includes('\\')||p.includes('/node_modules/')||p.startsWith('node_modules/')||p.startsWith('dist-web/')||p.startsWith('api/dist/')||p.includes('.env')||p.includes('credential')||p.includes('secret')||p.endsWith('.pem')||p.endsWith('.key')||p.endsWith('.p12')||p.endsWith('.pfx');
};
const textPath=(path:string)=>/\.(?:ts|tsx|js|mjs|cjs|json|html|css|md|sql|prisma|yml|yaml|toml|txt)$/i.test(path)||['Dockerfile','package.json'].includes(path);
const tokens=(text:string)=>[...new Set(clean(text,5000).toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>=3))].slice(0,80);
function inventoryForModel(tree:GitTreeItem[],request:string,target:string){
  const terms=tokens(`${request} ${target}`);
  return tree.filter(item=>item.type==='blob'&&textPath(item.path)&&!forbiddenPath(item.path)).map(item=>{
    const p=item.path.toLowerCase();let score=0;for(const term of terms)if(p.includes(term))score+=8;if(/admin|it-solutions|sia|intranet|employee|api\/src|assets|scripts/.test(p))score+=2;if(p.split('/').length<=2)score+=1;return{path:item.path,score,size:item.size||0};
  }).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,450);
}
async function readBaseFile(path:string,branch:string){
  const data=await gh(`/contents/${filePath(path)}?ref=${encodeURIComponent(branch)}`);if(data.type!=='file'||!data.content)throw httpError(409,`Worker could not read ${path}`);
  const content=Buffer.from(String(data.content).replace(/\n/g,''),'base64').toString('utf8');if(content.length>350000)throw httpError(409,`Worker selected ${path}, but it is too large for a safe full-file edit. Use a smaller integration point.`);return{content,sha:String(data.sha||'')};
}
function slug(value:string){return clean(value,80).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'change'}
function branchName(summary:string){const prefix=branchPrefix().replace(/[^A-Za-z0-9._/-]/g,'').replace(/^\/+|\/+$/g,'');return`${prefix?`${prefix}/`:''}${slug(summary)}-${Date.now().toString(36)}`.replace(/\/+/g,'/').slice(0,120)}

async function ensureWorkerSchema(prisma:PrismaClient){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITCodingWorkerRun" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"approvalId" TEXT NOT NULL,"actionId" TEXT NOT NULL,"ticketId" TEXT NOT NULL,"status" TEXT NOT NULL,"model" TEXT NOT NULL,"repository" TEXT NOT NULL,"baseBranch" TEXT NOT NULL,"branchName" TEXT,"baseSha" TEXT,"commitSha" TEXT,"prNumber" INTEGER,"prUrl" TEXT,"summary" TEXT NOT NULL DEFAULT '',"files" JSONB NOT NULL DEFAULT '[]'::jsonb,"error" TEXT NOT NULL DEFAULT '',"requestedByUserId" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ITCodingWorkerRun_approval_uq" ON "ITCodingWorkerRun"("organizationId","approvalId")`);
}

export async function runApprovedITCodingWorker(prisma:PrismaClient,input:{organizationId:string;approvalId:string;actorUserId:string}):Promise<WorkerResult>{
  const config=itCodingWorkerStatus();if(!config.enabled)throw httpError(409,'Trusted coding worker is configured but disabled');if(!config.configured)throw httpError(503,'Trusted coding worker credentials are incomplete');if(config.mode!=='PR_ONLY')throw httpError(409,'Coding worker must remain in PR_ONLY mode');if(config.repository!=='sngwabil/sulandra-website')throw httpError(409,'Coding worker repository is outside the approved Sulandra repository');if(config.baseBranch!=='release/sulandra-1.0')throw httpError(409,'Coding worker base branch is not the approved release/sulandra-1.0 line');
  await ensureWorkerSchema(prisma);
  const prior=await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM "ITCodingWorkerRun" WHERE "organizationId"=$1 AND "approvalId"=$2 LIMIT 1`,input.organizationId,input.approvalId);
  if(prior[0]?.status==='PR_OPEN'&&prior[0]?.prNumber)return{runId:prior[0].id,status:'PR_OPEN',repository:prior[0].repository,baseBranch:prior[0].baseBranch,branch:prior[0].branchName,baseSha:prior[0].baseSha,commitSha:prior[0].commitSha,prNumber:Number(prior[0].prNumber),prUrl:prior[0].prUrl,model:prior[0].model,summary:prior[0].summary,files:Array.isArray(prior[0].files)?prior[0].files:[]};
  if(prior[0]&&prior[0].status==='RUNNING')throw httpError(409,'Coding worker is already running for this approval');
  const approvals=await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM "ITRemediationApproval" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,input.organizationId,input.approvalId);const approval=approvals[0];if(!approval)throw httpError(404,'Remediation approval was not found');if(String(approval.status)!=='APPROVED')throw httpError(409,'Code change must be APPROVED before the coding worker can run');if(String(approval.actionType)!=='CODE_CHANGE')throw httpError(409,'Selected approval is not a CODE_CHANGE request');
  const actions=await prisma.$queryRawUnsafe<WorkerAction[]>(`SELECT "id","conversationId","payload","result","status" FROM "ITAgentAction" WHERE "organizationId"=$1 AND "actionType"='REQUEST_CODE_CHANGE' AND "result"->>'approvalId'=$2 ORDER BY "createdAt" DESC LIMIT 1`,input.organizationId,input.approvalId);const action=actions[0];if(!action)throw httpError(404,'Associated IT Agent code-change action was not found');const payload=obj(action.payload);const request=clean(payload.request||approval.summary,8000),summary=clean(payload.summary||approval.summary,500),target=clean(payload.target,1200),reason=clean(payload.reason,3000),ticketId=clean(obj(action.result).ticketId||approval.ticketId,160);
  const runId=prior[0]?.id||randomUUID();if(prior[0])await prisma.$executeRawUnsafe(`UPDATE "ITCodingWorkerRun" SET "status"='RUNNING',"error"='',"updatedAt"=NOW() WHERE "id"=$1`,runId);else await prisma.$executeRawUnsafe(`INSERT INTO "ITCodingWorkerRun" ("id","organizationId","approvalId","actionId","ticketId","status","model","repository","baseBranch","summary","requestedByUserId") VALUES ($1,$2,$3,$4,$5,'RUNNING',$6,$7,$8,$9,$10)`,runId,input.organizationId,input.approvalId,action.id,ticketId,codexModel(),repoName(),baseBranch(),summary,input.actorUserId);
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentHandoff" SET "status"='IN_PROGRESS',"updatedAt"=NOW() WHERE "organizationId"=$1 AND "ticketId"=$2`,input.organizationId,ticketId);
  try{
    const commit=await gh(`/commits/${encodeURIComponent(baseBranch())}`);const baseSha=String(commit.sha),baseTreeSha=String(commit.commit?.tree?.sha||'');if(!baseSha||!baseTreeSha)throw httpError(502,'GitHub base commit metadata is incomplete');const treeData=await gh(`/git/trees/${encodeURIComponent(baseTreeSha)}?recursive=1`);if(treeData.truncated)throw httpError(409,'Repository tree is too large for a safe coding-worker inventory');const tree=(treeData.tree||[]) as GitTreeItem[];const inventory=inventoryForModel(tree,request,target);
    const selection=await codex('Return JSON only. Select the smallest set of existing repository files needed to implement the requested Sulandra change safely. Do not select generated build output, secrets, credential files, or .env files. Prefer existing integration points and preserve the separate Employee/Admin login architecture, SIA-first IT boundary, release/sulandra-1.0 semantics, and current production workflows. Schema: {"files":["path"],"summary":"short reason"}. Maximum 10 files.',`REQUEST\n${request}\n\nTARGET\n${target}\n\nREASON\n${reason}\n\nCANDIDATE REPOSITORY PATHS\n${inventory.map(x=>`${x.path}\t${x.size}`).join('\n')}`);
    const chosen=[...new Set(Array.isArray(selection.files)?selection.files.map(v=>clean(v,500)):[])].filter(path=>inventory.some(item=>item.path===path)).slice(0,10);if(!chosen.length)throw httpError(409,'Codex worker could not identify a safe existing integration point');
    const snapshots:Record<string,{content:string;sha:string}>={};let total=0;for(const path of chosen){const snap=await readBaseFile(path,baseBranch());total+=snap.content.length;if(total>1200000)throw httpError(409,'Selected source set is too large for one safe coding-worker run');snapshots[path]=snap}
    const sources=chosen.map(path=>`\n===== FILE: ${path} =====\n${snapshots[path].content}\n===== END FILE =====`).join('\n');
    const patch=await codex('You are a repository coding worker. Return JSON only and never include markdown fences. Produce the smallest correct full-file replacements needed for the approved request. You may update only files whose full source was supplied. You may create new UTF-8 text files when necessary. Never delete files. Never create or modify secrets, credentials, .env files, generated dist output, node_modules, or binary files. Do not weaken authentication, authorization, audit, approval, clinical-safety, tenant isolation, CI, or rollback controls. Preserve the separate Employee/Admin login architecture and SIA-first IT architecture. New code/system changes must remain PR-only; never write directly to release/sulandra-1.0. Schema: {"summary":"what changed","commitMessage":"imperative commit message","files":[{"path":"...","operation":"update|create","content":"complete UTF-8 file contents"}],"tests":["recommended checks"]}. Maximum 12 changed files.',`APPROVED REQUEST\n${request}\n\nTARGET\n${target}\n\nREASON\n${reason}\n\nBASE BRANCH\n${baseBranch()}\n\nFULL SOURCE SNAPSHOTS${sources}`);
    const proposed=Array.isArray(patch.files)?patch.files as Array<any>:[];if(!proposed.length)throw httpError(409,'Codex worker proposed no file changes');const allowedUpdates=new Set(chosen);const changes:Array<{path:string;mode:string;type:'blob';content:string}>=[];let bytes=0;for(const file of proposed.slice(0,12)){const path=clean(file.path,500),operation=clean(file.operation,20);const content=typeof file.content==='string'?file.content:'';if(forbiddenPath(path)||!textPath(path))throw httpError(409,`Codex proposed a forbidden path: ${path}`);if(operation==='update'&&!allowedUpdates.has(path))throw httpError(409,`Codex attempted to update an unread file: ${path}`);if(!['update','create'].includes(operation))throw httpError(409,`Unsupported Codex file operation for ${path}`);if(operation==='create'&&tree.some(item=>item.path===path))throw httpError(409,`Codex marked existing file as create: ${path}`);if(operation==='update'&&content===snapshots[path]?.content)continue;bytes+=Buffer.byteLength(content,'utf8');if(bytes>1600000)throw httpError(409,'Codex change set exceeds the safe size limit');changes.push({path,mode:tree.find(item=>item.path===path)?.mode||'100644',type:'blob',content})}if(!changes.length)throw httpError(409,'Codex worker produced no effective source changes');
    const branch=branchName(summary);await gh('/git/refs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:baseSha})});const treeEntries=[] as Array<any>;for(const change of changes){const blob=await gh('/git/blobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:change.content,encoding:'utf-8'})});treeEntries.push({path:change.path,mode:change.mode,type:'blob',sha:blob.sha})}const newTree=await gh('/git/trees',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base_tree:baseTreeSha,tree:treeEntries})});const commitMessage=clean(patch.commitMessage||`Implement ${summary}`,180)||`Implement ${summary}`;const newCommit=await gh('/git/commits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:commitMessage,tree:newTree.sha,parents:[baseSha]})});await gh(`/git/refs/heads/${refPath(branch)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha:newCommit.sha,force:false})});const pr=await gh('/pulls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:`IT Agent: ${summary}`,head:branch,base:baseBranch(),body:`Automated Sulandra IT coding-worker change.\n\nTicket: ${ticketId}\nApproval: ${input.approvalId}\nRequest: ${request}\n\nWorker summary: ${clean(patch.summary,3000)}\n\nChanged files:\n${changes.map(c=>`- ${c.path}`).join('\n')}\n\nSafety boundary: PR-only. No direct production branch write or Railway mutation was performed. Merge only after required CI/checks and administrator review.`})});
    const result:WorkerResult={runId,status:'PR_OPEN',repository:repoName(),baseBranch:baseBranch(),branch,baseSha,commitSha:String(newCommit.sha),prNumber:Number(pr.number),prUrl:String(pr.html_url),model:codexModel(),summary:clean(patch.summary||summary,3000),files:changes.map(c=>c.path)};
    await prisma.$executeRawUnsafe(`UPDATE "ITCodingWorkerRun" SET "status"='PR_OPEN',"branchName"=$1,"baseSha"=$2,"commitSha"=$3,"prNumber"=$4,"prUrl"=$5,"summary"=$6,"files"=$7::jsonb,"updatedAt"=NOW() WHERE "id"=$8`,branch,baseSha,result.commitSha,result.prNumber,result.prUrl,result.summary,JSON.stringify(result.files),runId);await prisma.$executeRawUnsafe(`UPDATE "ITAgentAction" SET "status"='PR_OPEN',"result"=COALESCE("result",'{}'::jsonb)||$1::jsonb,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "id"=$3`,JSON.stringify({codingWorker:result}),input.organizationId,action.id);return result;
  }catch(error){const message=safeError(error);await prisma.$executeRawUnsafe(`UPDATE "ITCodingWorkerRun" SET "status"='FAILED',"error"=$1,"updatedAt"=NOW() WHERE "id"=$2`,message,runId).catch(()=>{});await prisma.$executeRawUnsafe(`UPDATE "ITAgentAction" SET "status"='FAILED',"result"=COALESCE("result",'{}'::jsonb)||$1::jsonb,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "id"=$3`,JSON.stringify({codingWorker:{status:'FAILED',error:message}}),input.organizationId,action.id).catch(()=>{});await prisma.$executeRawUnsafe(`UPDATE "ITAgentHandoff" SET "status"='FAILED',"resolution"=$1,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "ticketId"=$3`,message,input.organizationId,ticketId).catch(()=>{});throw error}
}

export function registerITCodingWorkerRoutes({app,prisma,authOf,requireRoles,adminRoles}:Dependencies){
  const admin=requireRoles(...adminRoles);
  app.get('/api/it-solutions/coding-worker/status',admin,async(_req,res,next)=>{try{res.json({data:await probeITCodingWorker()})}catch(error){next(error)}});
  app.get('/api/it-solutions/coding-worker/remediations',admin,async(req,res,next)=>{try{const auth=authOf(res),status=clean(req.query.status||'PENDING',30);const rows=await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM "ITRemediationApproval" WHERE "organizationId"=$1 AND "actionType"='CODE_CHANGE' AND ($2='' OR "status"=$2) ORDER BY "createdAt" DESC LIMIT 100`,auth.organizationId,status);res.json({data:{remediations:rows}})}catch(error){next(error)}});
  app.post('/api/it-solutions/coding-worker/remediations/:approvalId/approve-and-run',admin,async(req,res,next)=>{try{const auth=authOf(res),input=approveSchema.parse(req.body);const rows=await prisma.$queryRawUnsafe<Array<any>>(`SELECT * FROM "ITRemediationApproval" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.approvalId),approval=rows[0];if(!approval)throw httpError(404,'Remediation approval was not found');if(String(approval.actionType)!=='CODE_CHANGE')throw httpError(409,'Approval is not a code-change request');if(String(approval.status)==='PENDING')await prisma.$executeRawUnsafe(`UPDATE "ITRemediationApproval" SET "status"='APPROVED',"decidedByUserId"=$1,"decisionNote"=$2,"decidedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4 AND "status"='PENDING'`,auth.userId,clean(input.note,3000),auth.organizationId,req.params.approvalId);else if(String(approval.status)!=='APPROVED')throw httpError(409,`Approval is ${approval.status}, not PENDING or APPROVED`);const worker=await runApprovedITCodingWorker(prisma,{organizationId:auth.organizationId,approvalId:req.params.approvalId,actorUserId:auth.userId});res.json({data:{approvalId:req.params.approvalId,status:'APPROVED',worker}})}catch(error){next(error)}});
  app.post('/api/it-solutions/coding-worker/remediations/:approvalId/deny',admin,async(req,res,next)=>{try{const auth=authOf(res),input=approveSchema.parse(req.body);const changed=await prisma.$executeRawUnsafe(`UPDATE "ITRemediationApproval" SET "status"='DENIED',"decidedByUserId"=$1,"decisionNote"=$2,"decidedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4 AND "status"='PENDING'`,auth.userId,clean(input.note,3000),auth.organizationId,req.params.approvalId);if(!changed)throw httpError(409,'Approval is no longer pending');res.json({data:{approvalId:req.params.approvalId,status:'DENIED'}})}catch(error){next(error)}});
}
