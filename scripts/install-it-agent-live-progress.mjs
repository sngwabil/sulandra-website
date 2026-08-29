import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'api','src','it-agent-workbench-routes.ts');
const marker='IT_AGENT_LIVE_PROGRESS_V1';
let source=await readFile(file,'utf8');

const replaceOnce=(from,to,label)=>{
  if(source.includes(to))return;
  if(!source.includes(from))throw new Error(`IT Agent live progress anchor changed: ${label}`);
  source=source.replace(from,to);
};

if(!source.includes(marker)){
  replaceOnce(
    "const chatSchema=z.object({conversationId:z.string().uuid().optional(),message:z.string().trim().min(1).max(12000)});",
    "const chatSchema=z.object({conversationId:z.string().uuid().optional(),requestId:z.string().uuid().optional(),message:z.string().trim().min(1).max(12000)}); /* IT_AGENT_LIVE_PROGRESS_V1 */",
    'chat schema',
  );

  const messageIndex='    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITAgentMessage_conversation_idx" ON "ITAgentMessage"("organizationId","conversationId","createdAt")`);';
  replaceOnce(messageIndex,`${messageIndex}\n    await prisma.$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS "ITAgentProgressEvent" ("id" TEXT PRIMARY KEY,"sequence" BIGSERIAL UNIQUE,"organizationId" TEXT NOT NULL,"userId" TEXT NOT NULL,"conversationId" TEXT,"requestId" TEXT NOT NULL,"phase" TEXT NOT NULL,"status" TEXT NOT NULL,"label" TEXT NOT NULL,"detail" TEXT NOT NULL DEFAULT '',"meta" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())\`);\n    await prisma.$executeRawUnsafe(\`CREATE INDEX IF NOT EXISTS "ITAgentProgressEvent_request_idx" ON "ITAgentProgressEvent"("organizationId","userId","requestId","sequence")\`);`,'progress schema');

  const knowledgeLine='  const knowledgeFor=async(query:string):Promise<KnowledgeContext>=>{try{return await getITSpecialistKnowledgeContext(prisma,redact(query))}catch(error){return{approvedEvidenceCount:0,error:safeError(error)}}};';
  replaceOnce(knowledgeLine,`${knowledgeLine}\n  const progress=async(auth:AuthContext,requestId:string,conversationId:string|undefined,phase:string,status:string,label:string,detail='',meta:Record<string,unknown>={})=>{\n    if(!requestId)return;\n    const safeDetail=redact(clean(detail,1400));\n    const safeMeta=JSON.stringify(meta&&typeof meta==='object'?meta:{});\n    await prisma.$executeRawUnsafe(\`INSERT INTO "ITAgentProgressEvent" ("id","organizationId","userId","conversationId","requestId","phase","status","label","detail","meta") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)\`,randomUUID(),auth.organizationId,auth.userId,conversationId||null,requestId,clean(phase,80),clean(status,40),clean(label,240),safeDetail,safeMeta).catch(()=>{});\n  };`,'progress helper');

  const actionRoute="  app.get('/api/it-solutions/agent/actions',gate,async(_req,res,next)=>";
  const progressRoute=`  app.get('/api/it-solutions/agent/progress/:requestId',gate,async(req,res,next)=>{try{await ready();const auth=authOf(res);const requestId=clean(req.params.requestId,80);const rows=await prisma.$queryRawUnsafe<Array<{sequence:number|string;conversationId:string|null;phase:string;status:string;label:string;detail:string;meta:Record<string,unknown>|string;createdAt:Date|string}>>(\`SELECT "sequence","conversationId","phase","status","label","detail","meta","createdAt" FROM "ITAgentProgressEvent" WHERE "organizationId"=$1 AND "userId"=$2 AND "requestId"=$3 ORDER BY "sequence" ASC LIMIT 200\`,auth.organizationId,auth.userId,requestId);res.json({data:{requestId,events:rows.map(row=>({...row,meta:obj(row.meta)}))}})}catch(error){next(error)}});\n\n`;
  replaceOnce(actionRoute,`${progressRoute}${actionRoute}`,'progress endpoint');

  replaceOnce(
    'const input=chatSchema.parse(req.body);let conversationId=input.conversationId;',
    'const input=chatSchema.parse(req.body);const requestId=input.requestId||randomUUID();let conversationId=input.conversationId;',
    'request id',
  );

  const userInsert='    await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage" ("id","organizationId","conversationId","userId","role","content") VALUES ($1,$2,$3,$4,\'user\',$5)`,randomUUID(),auth.organizationId,conversationId,auth.userId,redact(input.message));';
  replaceOnce(userInsert,`    await progress(auth,requestId,conversationId,'request','done','Request received',\`User request: \${clean(input.message,320)}\`);\n    await progress(auth,requestId,conversationId,'conversation','running','Loading this chat','Reading the recent conversation messages needed to answer this request.');\n${userInsert}`,'request start');

  const historyEnd='const history=historyRows.reverse();';
  replaceOnce(historyEnd,`${historyEnd}await progress(auth,requestId,conversationId,'conversation','done','Chat context loaded',\`Loaded \${history.length} recent message\${history.length===1?'':'s'} from this conversation.\`);`,'conversation loaded');

  const knowledgeAndModel='    const knowledge=await knowledgeFor(input.message);const payload=await askOpenAI(history,await context(auth,knowledge));const proposals:any[]=[];const trustedEvents:string[]=[];';
  const stagedKnowledge=`    await progress(auth,requestId,conversationId,'repository','running','Reading or refreshing the Sulandra repository map','Searching trusted GitHub repository and approved-release evidence relevant to this request.');\n    const knowledge=await knowledgeFor(input.message);\n    const fileMatchCount=Array.isArray(knowledge.fileMatches)?knowledge.fileMatches.length:0;\n    const workMatchCount=Array.isArray(knowledge.approvedWorkMatches)?knowledge.approvedWorkMatches.length:0;\n    const repositoryDetail=[clean(knowledge.repository||'Sulandra repository',200),knowledge.baseBranch?\`branch \${clean(knowledge.baseBranch,160)}\`:'',knowledge.headSha?\`head \${clean(knowledge.headSha,18)}\`:'',\`\${fileMatchCount} candidate file match\${fileMatchCount===1?'':'es'}\`,\`\${workMatchCount} approved-work match\${workMatchCount===1?'':'es'}\`,knowledge.refreshedAt?\`map refreshed \${new Date(knowledge.refreshedAt).toLocaleString()}\`:''].filter(Boolean).join(' · ');\n    await progress(auth,requestId,conversationId,'repository',knowledge.error?'error':'done',knowledge.error?'Repository context had a problem':'Repository context loaded',knowledge.error?clean(knowledge.error,1000):repositoryDetail,{repository:clean(knowledge.repository,200),branch:clean(knowledge.baseBranch,160),headSha:clean(knowledge.headSha,80),fileMatchCount,approvedWorkMatchCount:workMatchCount,refreshedAt:knowledge.refreshedAt||null});\n    await progress(auth,requestId,conversationId,'system','running','Checking Sulandra IT system context','Checking coding-worker connectivity, IT actions, approvals, handoffs, and the service/release evidence already available to Sulandra.');\n    const trustedContext=await context(auth,knowledge);\n    await progress(auth,requestId,conversationId,'system','done','System context loaded',\`Connected context prepared for \${Array.isArray(knowledge.services)?knowledge.services.length:0} configured service target\${Array.isArray(knowledge.services)&&knowledge.services.length===1?'':'s'}. No live Railway check is claimed unless a real deployment verification step runs.\`);\n    await progress(auth,requestId,conversationId,'agent','running','Evaluating the retrieved evidence','Sulandra IT is preparing a grounded answer or deciding whether a real action is required.');\n    const payload=await askOpenAI(history,trustedContext);\n    await progress(auth,requestId,conversationId,'agent','done','Evidence evaluation completed','The model returned a response plan and any requested tool actions. Private chain-of-thought is not exposed.');\n    const proposals:any[]=[];const trustedEvents:string[]=[];`;
  replaceOnce(knowledgeAndModel,stagedKnowledge,'knowledge/model stages');

  const policyAnchor='let args:Record<string,unknown>={};try{args=JSON.parse(item.arguments||\'{}\')}catch{continue}const policy=actionPolicy(item.name,args,knowledge);const actionId=randomUUID();';
  replaceOnce(policyAnchor,`let args:Record<string,unknown>={};try{args=JSON.parse(item.arguments||'{}')}catch{continue}const policy=actionPolicy(item.name,args,knowledge);await progress(auth,requestId,conversationId,'action','running',\`Preparing \${actionName(policy.actionType)}\`,policy.summary,{actionType:policy.actionType,risk:policy.risk,changeClass:policy.changeClass,approvalRequired:policy.approvalRequired});const actionId=randomUUID();`,'tool action stage');

  const approvalBranch="if(policy.approvalRequired){const ids=await ensureCodeRemediation(action,auth,false);proposals.push({id:actionId,...policy,payload:args,status:'PROPOSED',result:{...ids,approvalRequired:true}});trustedEvents.push(policy.safetyEscalated?'I could not prove this as a bounded established-operation repair from trusted release evidence, so I escalated it to owner approval. Press Execute to approve it and start the trusted coding worker.':'This is a new/material code change. It is waiting for your approval; pressing Execute will start the trusted coding worker.');}";
  replaceOnce(approvalBranch,`if(policy.approvalRequired){const ids=await ensureCodeRemediation(action,auth,false);proposals.push({id:actionId,...policy,payload:args,status:'PROPOSED',result:{...ids,approvalRequired:true}});await progress(auth,requestId,conversationId,'approval','waiting','Owner approval required',policy.summary,{actionId,approvalId:ids.approvalId,ticketId:ids.ticketId});trustedEvents.push(policy.safetyEscalated?'I could not prove this as a bounded established-operation repair from trusted release evidence, so I escalated it to owner approval. Press Execute to approve it and start the trusted coding worker.':'This is a new/material code change. It is waiting for your approval; pressing Execute will start the trusted coding worker.');}`,'approval stage');

  const workerStart="else{const execution=await runCodeAction(action,auth,'Policy-approved established-operation repair backed by trusted release evidence');";
  replaceOnce(workerStart,`else{await progress(auth,requestId,conversationId,'coding-worker','running','Starting the trusted PR-only coding worker',policy.summary,{actionId});const execution=await runCodeAction(action,auth,'Policy-approved established-operation repair backed by trusted release evidence');`,'worker start');

  const workerSuccess="if(execution.status==='PR_OPEN'){const worker=(execution.result as any).codingWorker;trustedEvents.push(`I verified this as an established-operation repair and dispatched the real coding worker. It opened PR #${worker.prNumber} (${worker.branch}) at commit ${worker.commitSha}. The change is PR-only; production has not been bypassed.`)}else trustedEvents.push(clean((execution.result as any).message,2000));";
  replaceOnce(workerSuccess,`if(execution.status==='PR_OPEN'){const worker=(execution.result as any).codingWorker;await progress(auth,requestId,conversationId,'coding-worker','done','Coding worker opened a pull request',\`PR #\${worker.prNumber} · \${clean(worker.branch,180)} · commit \${clean(worker.commitSha,16)}\`,{actionId,prNumber:worker.prNumber,branch:clean(worker.branch,180),commitSha:clean(worker.commitSha,80)});trustedEvents.push(\`I verified this as an established-operation repair and dispatched the real coding worker. It opened PR #\${worker.prNumber} (\${worker.branch}) at commit \${worker.commitSha}. The change is PR-only; production has not been bypassed.\`)}else{await progress(auth,requestId,conversationId,'coding-worker','error','Coding worker did not complete',clean((execution.result as any).message,1000),{actionId});trustedEvents.push(clean((execution.result as any).message,2000));}`,'worker result');

  const proposalElse="      }else proposals.push({id:actionId,...policy,payload:args,status:'PROPOSED'});";
  replaceOnce(proposalElse,`      }else{proposals.push({id:actionId,...policy,payload:args,status:'PROPOSED'});await progress(auth,requestId,conversationId,'action',policy.approvalRequired?'waiting':'done',policy.approvalRequired?'Action prepared and waiting':'Action prepared',policy.summary,{actionId,actionType:policy.actionType,risk:policy.risk,approvalRequired:policy.approvalRequired});}`,'non-code proposal');

  const replyStore='    await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage" ("id","organizationId","conversationId","userId","role","content","model") VALUES ($1,$2,$3,$4,\'assistant\',$5,$6)`,randomUUID(),auth.organizationId,conversationId,auth.userId,reply,model());';
  replaceOnce(replyStore,`    await progress(auth,requestId,conversationId,'response','done','Answer ready','The grounded response is returning to the main chat.');\n${replyStore}`,'response ready');
}

await writeFile(file,source,'utf8');
console.log('IT Agent live progress installed: authenticated per-request observable stages are persisted for the Status Board without exposing private model reasoning.');
