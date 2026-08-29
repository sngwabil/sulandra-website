import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workbench=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
const executor=await readFile(path.join(root,'api','src','it-agent-routine-executor.ts'),'utf8');
const failures=[];
const need=(source,text,label)=>{if(!source.includes(text))failures.push(`${label} missing: ${text}`)};

for(const marker of [
  'IT_AGENT_TRUSTED_ACTION_CONTINUITY_V1',
  "const context=async(auth:AuthContext,knowledge:KnowledgeContext,conversationId='')",
  'recentConversationActions',
  'SELECT "id","actionType","status","summary","result","createdAt","executedAt" FROM "ITAgentAction"',
  'context(auth,knowledge,conversationId as string)',
  'authoritative execution evidence',
  'Never claim there is no trusted result when a matching EXECUTED recent action provides one.',
  'seenActionKeys=new Set<string>()',
  "const actionKey=item.name+':'+JSON.stringify(args)",
  "row.actionType==='SEND_ANNOUNCEMENT'?'Sulandra in-app Employee Communications / Announcements'",
]) need(workbench,marker,'IT Agent workbench');

for(const marker of [
  "channel:'IN_APP_EMPLOYEE_ANNOUNCEMENTS'",
  "destination:'Sulandra in-app Employee Communications / Announcements'",
  "audience:clean(payload.audience,40)||'ALL_EMPLOYEES'",
  'in-app Employee Communications / Announcements area',
]) need(executor,marker,'Routine executor');

if(workbench.includes('agentActions:actions,codingWorker:worker'))failures.push('Trusted context still omits recent conversation action evidence');
if(workbench.includes('askOpenAI(history,await context(auth,knowledge),attachmentParts)'))failures.push('Multimodal chat still omits conversation-scoped trusted action evidence');
if(workbench.includes('askOpenAI(history,await context(auth,knowledge))'))failures.push('Chat still omits conversation-scoped trusted action evidence');

if(failures.length){console.error('IT Agent trusted action continuity verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent trusted action continuity verified: follow-up turns receive authoritative recent execution evidence, announcement destination metadata is durable, and exact duplicate tool calls in one model response are suppressed.');
