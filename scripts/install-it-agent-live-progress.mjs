import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'api','src','it-agent-workbench-routes.ts');
const marker='IT_AGENT_LIVE_PROGRESS_V1';
let source=await readFile(file,'utf8');

const must=(condition,label)=>{if(!condition)throw new Error(`IT Agent live progress anchor changed: ${label}`)};
const insertAfter=(anchor,text,label)=>{
  if(source.includes(text.trim()))return;
  const index=source.indexOf(anchor);must(index>=0,label);
  const at=index+anchor.length;source=source.slice(0,at)+text+source.slice(at);
};
const insertBefore=(anchor,text,label)=>{
  if(source.includes(text.trim()))return;
  const index=source.indexOf(anchor);must(index>=0,label);
  source=source.slice(0,index)+text+source.slice(index);
};

if(!source.includes('requestId:z.string().uuid().optional()')){
  const schemaStart=source.indexOf('const chatSchema=z.object({');
  const conversationField='conversationId:z.string().uuid().optional(),';
  const fieldIndex=source.indexOf(conversationField,schemaStart);
  must(schemaStart>=0&&fieldIndex>=schemaStart,'chat schema');
  const at=fieldIndex+conversationField.length;
  source=source.slice(0,at)+'requestId:z.string().uuid().optional(),'+source.slice(at);
}
if(!source.includes(marker)){
  must(source.includes('const chatSchema=z.object({'),'chat schema marker');
  source=source.replace('const chatSchema=z.object({',`/* ${marker} */\nconst chatSchema=z.object({`);
}

if(!source.includes('CREATE TABLE IF NOT EXISTS "ITAgentProgressEvent"')){
  const messageIndex='    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITAgentMessage_conversation_idx" ON "ITAgentMessage"("organizationId","conversationId","createdAt")`);';
  insertAfter(messageIndex,`\n    await prisma.$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS "ITAgentProgressEvent" ("id" TEXT PRIMARY KEY,"sequence" BIGSERIAL UNIQUE,"organizationId" TEXT NOT NULL,"userId" TEXT NOT NULL,"conversationId" TEXT,"requestId" TEXT NOT NULL,"phase" TEXT NOT NULL,"status" TEXT NOT NULL,"label" TEXT NOT NULL,"detail" TEXT NOT NULL DEFAULT '',"meta" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())\`);\n    await prisma.$executeRawUnsafe(\`CREATE INDEX IF NOT EXISTS "ITAgentProgressEvent_request_idx" ON "ITAgentProgressEvent"("organizationId","userId","requestId","sequence")\`);`,'progress schema');
}

if(!source.includes('const progress=async(auth:AuthContext,requestId:string')){
  const knowledgeLine='  const knowledgeFor=async(query:string):Promise<KnowledgeContext>=>{try{return await getITSpecialistKnowledgeContext(prisma,redact(query))}catch(error){return{approvedEvidenceCount:0,error:safeError(error)}}};';
  insertAfter(knowledgeLine,`\n  const progress=async(auth:AuthContext,requestId:string,conversationId:string|undefined,phase:string,status:string,label:string,detail='',meta:Record<string,unknown>={})=>{\n    if(!requestId)return;\n    const safeDetail=redact(clean(detail,1400));\n    const safeMeta=JSON.stringify(meta&&typeof meta==='object'?meta:{});\n    await prisma.$executeRawUnsafe(\`INSERT INTO "ITAgentProgressEvent" ("id","organizationId","userId","conversationId","requestId","phase","status","label","detail","meta") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)\`,randomUUID(),auth.organizationId,auth.userId,conversationId||null,requestId,clean(phase,80),clean(status,40),clean(label,240),safeDetail,safeMeta).catch(()=>{});\n  };`,'progress helper');
}

if(!source.includes("app.get('/api/it-solutions/agent/progress/:requestId'")){
  const actionRoute="  app.get('/api/it-solutions/agent/actions',gate,async(_req,res,next)=>";
  const progressRoute=`  app.get('/api/it-solutions/agent/progress/:requestId',gate,async(req,res,next)=>{try{await ready();const auth=authOf(res);const requestId=clean(req.params.requestId,80);const rows=await prisma.$queryRawUnsafe<Array<{sequence:number|string;conversationId:string|null;phase:string;status:string;label:string;detail:string;meta:Record<string,unknown>|string;createdAt:Date|string}>>(\`SELECT "sequence","conversationId","phase","status","label","detail","meta","createdAt" FROM "ITAgentProgressEvent" WHERE "organizationId"=$1 AND "userId"=$2 AND "requestId"=$3 ORDER BY "sequence" ASC LIMIT 200\`,auth.organizationId,auth.userId,requestId);res.json({data:{requestId,events:rows.map(row=>({...row,meta:obj(row.meta)}))}})}catch(error){next(error)}});\n\n`;
  insertBefore(actionRoute,progressRoute,'progress endpoint');
}

const chatRouteStart=source.indexOf("app.post('/api/it-solutions/agent/chat'");
must(chatRouteStart>=0,'chat route');
if(!source.includes('const requestId=input.requestId||randomUUID();')){
  const parseAnchor='const input=chatSchema.parse(req.body);';
  const parseIndex=source.indexOf(parseAnchor,chatRouteStart);must(parseIndex>=chatRouteStart,'request id');
  const at=parseIndex+parseAnchor.length;
  source=source.slice(0,at)+'const requestId=input.requestId||randomUUID();'+source.slice(at);
}

if(!source.includes("'request','done','Request received'")){
  const userInsert='    await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage" ("id","organizationId","conversationId","userId","role","content") VALUES ($1,$2,$3,$4,\'user\',$5)`,randomUUID(),auth.organizationId,conversationId,auth.userId,redact(input.message));';
  insertBefore(userInsert,`    await progress(auth,requestId,conversationId,'request','done','Request received',\`User request: \${clean(input.message,320)}\`);\n    await progress(auth,requestId,conversationId,'conversation','running','Loading this chat','Reading the recent conversation messages needed to answer this request.');\n`,'request start');
}

if(!source.includes("'conversation','done','Chat context loaded'")){
  const historyEnd='const history=historyRows.reverse();';
  insertAfter(historyEnd,`await progress(auth,requestId,conversationId,'conversation','done','Chat context loaded',\`Loaded \${history.length} recent message\${history.length===1?'':'s'} from this conversation.\`);`,'conversation loaded');
}

if(!source.includes("'repository','running','Reading or refreshing the Sulandra repository map'")){
  const knowledgeCall='const knowledge=await knowledgeFor(input.message);';
  const knowledgeIndex=source.indexOf(knowledgeCall,chatRouteStart);must(knowledgeIndex>=chatRouteStart,'repository lookup');
  const before=`await progress(auth,requestId,conversationId,'repository','running','Reading or refreshing the Sulandra repository map','Searching the trusted GitHub repository map and approved-release evidence relevant to this request.');`;
  source=source.slice(0,knowledgeIndex)+before+source.slice(knowledgeIndex);
  const shifted=source.indexOf(knowledgeCall,knowledgeIndex+before.length);
  const at=shifted+knowledgeCall.length;
  const after=`const fileMatchCount=Array.isArray(knowledge.fileMatches)?knowledge.fileMatches.length:0;const workMatchCount=Array.isArray(knowledge.approvedWorkMatches)?knowledge.approvedWorkMatches.length:0;const repositoryDetail=[clean(knowledge.repository||'Sulandra repository',200),knowledge.baseBranch?\`branch \${clean(knowledge.baseBranch,160)}\`:'',knowledge.headSha?\`head \${clean(knowledge.headSha,18)}\`:'',\`\${fileMatchCount} candidate file match\${fileMatchCount===1?'':'es'}\`,\`\${workMatchCount} approved-work match\${workMatchCount===1?'':'es'}\`,knowledge.refreshedAt?\`map refreshed \${clean(knowledge.refreshedAt,120)}\`:''].filter(Boolean).join(' · ');await progress(auth,requestId,conversationId,'repository',knowledge.error?'error':'done',knowledge.error?'Repository context had a problem':'Repository context loaded',knowledge.error?clean(knowledge.error,1000):repositoryDetail,{repository:clean(knowledge.repository,200),branch:clean(knowledge.baseBranch,160),headSha:clean(knowledge.headSha,80),fileMatchCount,approvedWorkMatchCount:workMatchCount,refreshedAt:knowledge.refreshedAt||null});`;
  source=source.slice(0,at)+after+source.slice(at);
}

if(!source.includes("'system','running','Checking Sulandra IT system context'")){
  const modelRegex=/const payload=await askOpenAI\(history,await context\(auth,knowledge\)(,attachmentParts)?\);/;
  const match=source.slice(chatRouteStart).match(modelRegex);must(Boolean(match),'system/model stages');
  const full=match[0];const suffix=match[1]||'';
  const replacement=`await progress(auth,requestId,conversationId,'system','running','Checking Sulandra IT system context','Checking coding-worker connectivity, IT actions, approvals, handoffs, and the service/release evidence currently available to Sulandra.');const trustedContext=await context(auth,knowledge);await progress(auth,requestId,conversationId,'system','done','System context loaded',\`Connected context prepared for \${Array.isArray(knowledge.services)?knowledge.services.length:0} configured service target\${Array.isArray(knowledge.services)&&knowledge.services.length===1?'':'s'}. No live Railway check is claimed unless a real deployment verification step runs.\`);await progress(auth,requestId,conversationId,'agent','running','Evaluating the retrieved evidence','Sulandra IT is preparing a grounded answer or deciding whether a real action is required.');const payload=await askOpenAI(history,trustedContext${suffix});await progress(auth,requestId,conversationId,'agent','done','Evidence evaluation completed','The model returned a response plan and any requested tool actions. Private chain-of-thought is not exposed.');`;
  const absolute=chatRouteStart+match.index;
  source=source.slice(0,absolute)+source.slice(absolute).replace(full,replacement);
}

// Action/release events are best-effort additions on top of the mandatory read-only
// stages above. They are deliberately transform-tolerant because owner auto-release
// and artifact installers extend these branches before this installer runs.
if(!source.includes("'action','running',`Preparing ${actionName(policy.actionType)}`")){
  const policyNeedle="const policy=actionPolicy(item.name,args,knowledge);";
  const policyIndex=source.indexOf(policyNeedle,chatRouteStart);
  if(policyIndex>=chatRouteStart){const at=policyIndex+policyNeedle.length;source=source.slice(0,at)+"await progress(auth,requestId,conversationId,'action','running',`Preparing ${actionName(policy.actionType)}`,policy.summary,{actionType:policy.actionType,risk:policy.risk,changeClass:policy.changeClass,approvalRequired:policy.approvalRequired});"+source.slice(at)}
}
if(!source.includes("'action','done','Action record created'")){
  const actionRowNeedle="const action:AgentActionRow={id:actionId,conversationId,actionType:policy.actionType,status:'PROPOSED',risk:policy.risk,changeClass:policy.changeClass,approvalRequired:policy.approvalRequired,summary:policy.summary,payload:{...args,toolName:item.name},result:{},createdAt:new Date()};";
  const actionRowIndex=source.indexOf(actionRowNeedle,chatRouteStart);
  if(actionRowIndex>=chatRouteStart){const at=actionRowIndex+actionRowNeedle.length;source=source.slice(0,at)+"await progress(auth,requestId,conversationId,'action','done','Action record created',policy.summary,{actionId,actionType:policy.actionType,risk:policy.risk,approvalRequired:policy.approvalRequired});"+source.slice(at)}
}
if(!source.includes("'approval','waiting','Owner approval required'")){
  const approvalNeedle='const ids=await ensureCodeRemediation(action,auth,false);';
  const approvalIndex=source.indexOf(approvalNeedle,chatRouteStart);
  if(approvalIndex>=chatRouteStart){const at=approvalIndex+approvalNeedle.length;source=source.slice(0,at)+"await progress(auth,requestId,conversationId,'approval','waiting','Owner approval required',policy.summary,{actionId,approvalId:ids.approvalId,ticketId:ids.ticketId});"+source.slice(at)}
}
if(!source.includes("'coding-worker','running','Starting the trusted PR-only coding worker'")){
  const executionNeedle='const execution=await runCodeAction(action,auth,';
  const executionIndex=source.indexOf(executionNeedle,chatRouteStart);
  if(executionIndex>=chatRouteStart){source=source.slice(0,executionIndex)+"await progress(auth,requestId,conversationId,'coding-worker','running','Starting the trusted PR-only coding worker',policy.summary,{actionId});"+source.slice(executionIndex)}
}
if(!source.includes("'coding-worker',execution.status==='FAILED'?'error':'done'")){
  const executionEndRegex=/const execution=await runCodeAction\(action,auth,[^;]+\);/;
  const executionMatch=source.slice(chatRouteStart).match(executionEndRegex);
  if(executionMatch){const absolute=chatRouteStart+executionMatch.index+executionMatch[0].length;const event="await progress(auth,requestId,conversationId,'coding-worker',execution.status==='FAILED'?'error':'done',execution.status==='WAITING_CI'?'Pull request opened; release gates are running':execution.status==='PR_OPEN'?'Coding worker opened a pull request':execution.status==='FAILED'?'Coding worker did not complete':'Coding worker returned',clean((execution.result as any)?.message||execution.status,1000),{actionId,status:execution.status,result:execution.result as any});";source=source.slice(0,absolute)+event+source.slice(absolute)}
}

if(!source.includes("deferFinal?'waiting':'done',deferFinal?'Release workflow continues':'Answer ready'")){
  const deferredInsert='if(!deferFinal)await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage"';
  const deferredIndex=source.indexOf(deferredInsert,chatRouteStart);
  if(deferredIndex>=chatRouteStart){
    source=source.slice(0,deferredIndex)+"await progress(auth,requestId,conversationId,'response',deferFinal?'waiting':'done',deferFinal?'Release workflow continues':'Answer ready',deferFinal?'The final chat answer is deferred while the owner-authorized PR, CI, merge, and exact production verification continue.':'The grounded response is returning to the main chat.');"+source.slice(deferredIndex);
  }else if(!source.includes("'response','done','Answer ready'")){
    const assistantInsert='await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage" ("id","organizationId","conversationId","userId","role","content","model")';
    const assistantIndex=source.indexOf(assistantInsert,chatRouteStart);must(assistantIndex>=chatRouteStart,'response ready');
    source=source.slice(0,assistantIndex)+"await progress(auth,requestId,conversationId,'response','done','Answer ready','The grounded response is returning to the main chat.');"+source.slice(assistantIndex);
  }
}

await writeFile(file,source,'utf8');
console.log('IT Agent live progress installed: authenticated per-request observable request, repository, system, action, and response stages are persisted for Status Board without exposing private model reasoning.');
