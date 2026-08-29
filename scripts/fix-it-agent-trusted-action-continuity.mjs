import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const marker='IT_AGENT_TRUSTED_ACTION_CONTINUITY_V1';

const routePath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let route=await readFile(routePath,'utf8');

if(!route.includes(marker)){
  const contextSignature="const context=async(auth:AuthContext,knowledge:KnowledgeContext)=>{const [tickets,approvals,handoffs,actions,worker]=await Promise.all([";
  const contextSignatureFixed="const context=async(auth:AuthContext,knowledge:KnowledgeContext,conversationId='')=>{const [tickets,approvals,handoffs,actions,recentConversationActions,worker]=await Promise.all([";
  if(route.includes(contextSignature))route=route.replace(contextSignature,contextSignatureFixed);
  else if(!route.includes(contextSignatureFixed))throw new Error('IT Agent trusted-context signature anchor changed');

  const actionAggregate='    prisma.$queryRawUnsafe<any[]>(`SELECT "actionType","status",COUNT(*)::int AS count FROM "ITAgentAction" WHERE "organizationId"=$1 GROUP BY "actionType","status"`,auth.organizationId).catch(()=>[]),\n    probeITCodingWorker().catch(error=>({configured:false,enabled:false,authenticated:false,baseBranchReachable:false,error:safeError(error)})),';
  const actionAggregateFixed='    prisma.$queryRawUnsafe<any[]>(`SELECT "actionType","status",COUNT(*)::int AS count FROM "ITAgentAction" WHERE "organizationId"=$1 GROUP BY "actionType","status"`,auth.organizationId).catch(()=>[]),\n    conversationId?prisma.$queryRawUnsafe<any[]>(`SELECT "id","actionType","status","summary","result","createdAt","executedAt" FROM "ITAgentAction" WHERE "organizationId"=$1 AND "conversationId"=$2 ORDER BY "createdAt" DESC LIMIT 12`,auth.organizationId,conversationId).catch(()=>[]):Promise.resolve([]),\n    probeITCodingWorker().catch(error=>({configured:false,enabled:false,authenticated:false,baseBranchReachable:false,error:safeError(error)})),';
  if(route.includes(actionAggregate))route=route.replace(actionAggregate,actionAggregateFixed);
  else if(!route.includes('recentConversationActions'))throw new Error('IT Agent recent-action evidence query anchor changed');

  const contextPayload='agentActions:actions,codingWorker:worker,';
  const contextPayloadFixed="agentActions:actions,recentConversationActions:recentConversationActions.map(row=>({id:row.id,actionType:row.actionType,status:row.status,summary:row.summary,result:obj(row.result),destination:row.actionType==='SEND_ANNOUNCEMENT'?'Sulandra in-app Employee Communications / Announcements':row.actionType==='PUBLISH_INTRAnet_CONTENT'||row.actionType==='GENERATE_INTRAnet_MEME'?'Sulandra intranet':row.actionType==='SEND_NOTIFICATION'?'Sulandra in-app employee notifications':row.actionType==='SEND_EMAIL'?'Sulandra employee email':null,createdAt:row.createdAt,executedAt:row.executedAt})),codingWorker:worker,";
  if(route.includes(contextPayload))route=route.replace(contextPayload,contextPayloadFixed);
  else if(!route.includes('recentConversationActions:recentConversationActions.map'))throw new Error('IT Agent trusted-context payload anchor changed');

  const instruction='Never say code was fixed, a PR was opened, an email was sent, content was published, or production changed until a trusted execution result proves it.';
  const instructionFixed=`${instruction} Recent conversation actions supplied in the trusted context are authoritative execution evidence. For follow-up questions about where or whether something was published, sent, created, generated, or opened, match the relevant recent action and answer from its stored status, result, resource metadata, and destination. Never claim there is no trusted result when a matching EXECUTED recent action provides one. /* ${marker} */`;
  if(route.includes(instruction)&&!route.includes(marker))route=route.replace(instruction,instructionFixed);
  else if(!route.includes(marker))throw new Error('IT Agent trusted-evidence instruction anchor changed');

  const artifactContextCall='askOpenAI(history,await context(auth,knowledge),attachmentParts)';
  const artifactContextCallFixed='askOpenAI(history,await context(auth,knowledge,conversationId as string),attachmentParts)';
  if(route.includes(artifactContextCall))route=route.replace(artifactContextCall,artifactContextCallFixed);
  const basicContextCall='askOpenAI(history,await context(auth,knowledge))';
  const basicContextCallFixed='askOpenAI(history,await context(auth,knowledge,conversationId as string))';
  if(route.includes(basicContextCall))route=route.replace(basicContextCall,basicContextCallFixed);
  if(!route.includes('context(auth,knowledge,conversationId as string)'))throw new Error('IT Agent conversation-scoped trusted-context call anchor changed');
}
await writeFile(routePath,route,'utf8');

const executorPath=path.join(root,'api','src','it-agent-routine-executor.ts');
let executor=await readFile(executorPath,'utf8');
const announcementResult="result={resourceType:'EmployeeAnnouncement',resourceId:id,published:true,message:";
const announcementResultFixed="result={resourceType:'EmployeeAnnouncement',resourceId:id,published:true,channel:'IN_APP_EMPLOYEE_ANNOUNCEMENTS',destination:'Sulandra in-app Employee Communications / Announcements',audience:clean(payload.audience,40)||'ALL_EMPLOYEES',priority:clean(payload.priority,40)||'NORMAL',message:";
if(executor.includes(announcementResult))executor=executor.replace(announcementResult,announcementResultFixed);
else if(!executor.includes("channel:'IN_APP_EMPLOYEE_ANNOUNCEMENTS'"))throw new Error('IT Agent announcement destination metadata anchor changed');

const announcementMessage="message:`Published the employee announcement “${clean(payload.title,180)}”.`};";
const announcementMessageFixed="message:`Published the employee announcement “${clean(payload.title,180)}” in Sulandra’s in-app Employee Communications / Announcements area.`};";
if(executor.includes(announcementMessage))executor=executor.replace(announcementMessage,announcementMessageFixed);
else if(!executor.includes('in-app Employee Communications / Announcements area'))throw new Error('IT Agent announcement location message anchor changed');
await writeFile(executorPath,executor,'utf8');

await import('./verify-it-agent-trusted-action-continuity.mjs');
console.log('IT Agent trusted action continuity repaired: recent conversation execution evidence is authoritative on follow-up turns and announcement results identify their in-app destination.');
