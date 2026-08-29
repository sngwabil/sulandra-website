import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'api','src','it-agent-workbench-routes.ts');
const marker='IT_AGENT_LIVE_PROGRESS_V1';
let source=await readFile(file,'utf8');
const must=(ok,label)=>{if(!ok)throw new Error(`IT Agent live progress v2 anchor changed: ${label}`)};

if(!source.includes('requestId:z.string().uuid().optional()')){
  const start=source.indexOf('const chatSchema=z.object({');
  const field='conversationId:z.string().uuid().optional(),';
  const at=source.indexOf(field,start);
  must(start>=0&&at>=start,'chat schema');
  source=source.slice(0,at+field.length)+'requestId:z.string().uuid().optional(),'+source.slice(at+field.length);
}
if(!source.includes(marker))source=source.replace('const chatSchema=z.object({',`/* ${marker} */\nconst chatSchema=z.object({`);

if(!source.includes('CREATE TABLE IF NOT EXISTS "ITAgentProgressEvent"')){
  const anchor='    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITAgentMessage_conversation_idx" ON "ITAgentMessage"("organizationId","conversationId","createdAt")`);';
  must(source.includes(anchor),'progress table');
  source=source.replace(anchor,`${anchor}\n    await prisma.$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS "ITAgentProgressEvent" ("id" TEXT PRIMARY KEY,"sequence" BIGSERIAL UNIQUE,"organizationId" TEXT NOT NULL,"userId" TEXT NOT NULL,"conversationId" TEXT,"requestId" TEXT NOT NULL,"phase" TEXT NOT NULL,"status" TEXT NOT NULL,"label" TEXT NOT NULL,"detail" TEXT NOT NULL DEFAULT '',"meta" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())\`);\n    await prisma.$executeRawUnsafe(\`CREATE INDEX IF NOT EXISTS "ITAgentProgressEvent_request_idx" ON "ITAgentProgressEvent"("organizationId","userId","requestId","sequence")\`);`);
}

if(!source.includes('const progress=async(auth:AuthContext,requestId:string')){
  const anchor='  const knowledgeFor=async(query:string):Promise<KnowledgeContext>=>{try{return await getITSpecialistKnowledgeContext(prisma,redact(query))}catch(error){return{approvedEvidenceCount:0,error:safeError(error)}}};';
  must(source.includes(anchor),'progress helper');
  source=source.replace(anchor,`${anchor}\n  const progress=async(auth:AuthContext,requestId:string,conversationId:string|undefined,phase:string,status:string,label:string,detail='',meta:Record<string,unknown>={})=>{if(!requestId)return;const safeDetail=redact(clean(detail,1400));const safeMeta=JSON.stringify(meta&&typeof meta==='object'?meta:{});await prisma.$executeRawUnsafe(\`INSERT INTO "ITAgentProgressEvent" ("id","organizationId","userId","conversationId","requestId","phase","status","label","detail","meta") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)\`,randomUUID(),auth.organizationId,auth.userId,conversationId||null,requestId,clean(phase,80),clean(status,40),clean(label,240),safeDetail,safeMeta).catch(()=>{})};`);
}

if(!source.includes("app.get('/api/it-solutions/agent/progress/:requestId'")){
  const anchor="  app.get('/api/it-solutions/agent/actions',gate,async(_req,res,next)=>";
  must(source.includes(anchor),'progress endpoint');
  const route=`  app.get('/api/it-solutions/agent/progress/:requestId',gate,async(req,res,next)=>{try{await ready();const auth=authOf(res);const requestId=clean(req.params.requestId,80);const rows=await prisma.$queryRawUnsafe<Array<{sequence:number|string;conversationId:string|null;phase:string;status:string;label:string;detail:string;meta:Record<string,unknown>|string;createdAt:Date|string}>>(\`SELECT "sequence","conversationId","phase","status","label","detail","meta","createdAt" FROM "ITAgentProgressEvent" WHERE "organizationId"=$1 AND "userId"=$2 AND "requestId"=$3 ORDER BY "sequence" ASC LIMIT 200\`,auth.organizationId,auth.userId,requestId);res.json({data:{requestId,events:rows.map(row=>({...row,meta:obj(row.meta)}))}})}catch(error){next(error)}});\n\n`;
  source=source.replace(anchor,route+anchor);
}

const chatStart=source.indexOf("app.post('/api/it-solutions/agent/chat'");
must(chatStart>=0,'chat route');
if(!source.includes('const requestId=input.requestId||randomUUID();')){
  const anchor='const input=chatSchema.parse(req.body);';const at=source.indexOf(anchor,chatStart);must(at>=chatStart,'request id');source=source.slice(0,at+anchor.length)+'const requestId=input.requestId||randomUUID();'+source.slice(at+anchor.length);
}

if(!source.includes("'request','done','Request received'")){
  const anchor='    await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage" ("id","organizationId","conversationId","userId","role","content") VALUES ($1,$2,$3,$4,\'user\',$5)`,randomUUID(),auth.organizationId,conversationId,auth.userId,redact(input.message));';
  const at=source.indexOf(anchor,chatStart);must(at>=chatStart,'request event');
  source=source.slice(0,at)+`    await progress(auth,requestId,conversationId,'request','done','Request received',\`User request: \${clean(input.message,320)}\`);\n    await progress(auth,requestId,conversationId,'conversation','running','Loading this chat','Reading the recent conversation messages needed to answer this request.');\n`+source.slice(at);
}
if(!source.includes("'conversation','done','Chat context loaded'")){
  const anchor='const history=historyRows.reverse();';const at=source.indexOf(anchor,chatStart);must(at>=chatStart,'conversation event');source=source.slice(0,at+anchor.length)+`await progress(auth,requestId,conversationId,'conversation','done','Chat context loaded',\`Loaded \${history.length} recent message\${history.length===1?'':'s'} from this conversation.\`);`+source.slice(at+anchor.length);
}

if(!source.includes("'repository','running','Reading or refreshing the Sulandra repository map'")){
  const anchor='const knowledge=await knowledgeFor(input.message);';const at=source.indexOf(anchor,chatStart);must(at>=chatStart,'repository lookup');
  const before="await progress(auth,requestId,conversationId,'repository','running','Reading or refreshing the Sulandra repository map','Searching the trusted GitHub repository map and approved-release evidence relevant to this request.');";
  source=source.slice(0,at)+before+source.slice(at);
  const shifted=source.indexOf(anchor,at+before.length);const end=shifted+anchor.length;
  const after=`const fileMatchCount=Array.isArray(knowledge.fileMatches)?knowledge.fileMatches.length:0;const workMatchCount=Array.isArray(knowledge.approvedWorkMatches)?knowledge.approvedWorkMatches.length:0;const repositoryDetail=[clean(knowledge.repository||'Sulandra repository',200),knowledge.baseBranch?\`branch \${clean(knowledge.baseBranch,160)}\`:'',knowledge.headSha?\`head \${clean(knowledge.headSha,18)}\`:'',\`\${fileMatchCount} candidate file match\${fileMatchCount===1?'':'es'}\`,\`\${workMatchCount} approved-work match\${workMatchCount===1?'':'es'}\`,knowledge.refreshedAt?\`map refreshed \${clean(knowledge.refreshedAt,120)}\`:''].filter(Boolean).join(' · ');await progress(auth,requestId,conversationId,'repository',knowledge.error?'error':'done',knowledge.error?'Repository context had a problem':'Repository context loaded',knowledge.error?clean(knowledge.error,1000):repositoryDetail,{repository:clean(knowledge.repository,200),branch:clean(knowledge.baseBranch,160),headSha:clean(knowledge.headSha,80),fileMatchCount,approvedWorkMatchCount:workMatchCount,refreshedAt:knowledge.refreshedAt||null});`;
  source=source.slice(0,end)+after+source.slice(end);
}

if(!source.includes("'system','running','Checking Sulandra IT system context'")){
  const tail=source.slice(chatStart);
  const regex=/const payload=await askOpenAI\(history,await (context\(auth,knowledge(?:,conversationId as string)?\))(,attachmentParts)?\);/;
  const match=tail.match(regex);must(Boolean(match),'system/model stages');
  const full=match[0],contextCall=match[1],suffix=match[2]||'';
  const replacement=`await progress(auth,requestId,conversationId,'system','running','Checking Sulandra IT system context','Checking coding-worker connectivity, IT actions, approvals, handoffs, and the service/release evidence currently available to Sulandra.');const trustedContext=await ${contextCall};await progress(auth,requestId,conversationId,'system','done','System context loaded',\`Connected context prepared for \${Array.isArray(knowledge.services)?knowledge.services.length:0} configured service target\${Array.isArray(knowledge.services)&&knowledge.services.length===1?'':'s'}. No live Railway check is claimed unless a real deployment verification step runs.\`);await progress(auth,requestId,conversationId,'agent','running','Evaluating the retrieved evidence','Sulandra IT is preparing a grounded answer or deciding whether a real action is required.');const payload=await askOpenAI(history,trustedContext${suffix});await progress(auth,requestId,conversationId,'agent','done','Evidence evaluation completed','The model returned a response plan and any requested tool actions. Private chain-of-thought is not exposed.');`;
  const absolute=chatStart+match.index;source=source.slice(0,absolute)+replacement+source.slice(absolute+full.length);
}

if(!source.includes("deferFinal?'waiting':'done',deferFinal?'Release workflow continues':'Answer ready'")&&!source.includes("'response','done','Answer ready'")){
  const deferred='if(!deferFinal)await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage"';
  const deferredAt=source.indexOf(deferred,chatStart);
  if(deferredAt>=chatStart)source=source.slice(0,deferredAt)+"await progress(auth,requestId,conversationId,'response',deferFinal?'waiting':'done',deferFinal?'Release workflow continues':'Answer ready',deferFinal?'The final chat answer is deferred while the owner-authorized PR, CI, merge, and exact production verification continue.':'The grounded response is returning to the main chat.');"+source.slice(deferredAt);
  else{
    const assistant='await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage" ("id","organizationId","conversationId","userId","role","content","model")';const at=source.indexOf(assistant,chatStart);must(at>=chatStart,'response event');source=source.slice(0,at)+"await progress(auth,requestId,conversationId,'response','done','Answer ready','The grounded response is returning to the main chat.');"+source.slice(at);
  }
}

await writeFile(file,source,'utf8');
console.log('IT Agent live progress v2 installed: per-request chat, repository, system, evidence-evaluation, response and authenticated progress-endpoint stages are available to Status Board.');
