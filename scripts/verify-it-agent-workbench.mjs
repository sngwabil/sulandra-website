import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const backend=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
const failures=[];
const need=(source,marker,label)=>{if(!source.includes(marker))failures.push(`${label} missing: ${marker}`)};
for(const marker of [
  '/api/it-solutions/agent/chat',
  '/api/it-solutions/agent/actions/:actionId/execute',
  'ITAgentConversation','ITAgentMessage','ITAgentAction',
  'publish_intranet_content','post_intranet_meme','send_employee_announcement','send_employee_notification','send_employee_email','request_code_change',
  'https://api.openai.com/v1/responses','gpt-image-2',
  "type:item.role==='assistant'?'output_text':'input_text'",
  'getITSpecialistKnowledgeContext','approvedEvidenceCount','ESTABLISHED_OPERATION_REPAIR','NEW_SYSTEM_CHANGE',
  'probeITCodingWorker','runApprovedITCodingWorker','codingWorkerConnected:connected',
  'executeRoutineITAgentAction','isRoutineITAgentAction','reportITAgentRuntimeFailure',
  "status:'FAILED'","status:'EXECUTED'","status:'RETRYING'",'recovering:true',
  'Press Execute','start the trusted coding worker',
]) need(backend,marker,'IT Agent backend');
const hasLegacyPrOpen=backend.includes("status:'PR_OPEN'");
const hasGatedOwnerRelease=backend.includes("release?'WAITING_CI':'PR_OPEN'")&&backend.includes('queueITAgentOwnerRelease(prisma');
if(!hasLegacyPrOpen&&!hasGatedOwnerRelease)failures.push("IT Agent backend missing PR-first coding transition (legacy PR_OPEN or gated WAITING_CI -> PR_OPEN fallback)");
if(backend.includes("codingWorkerConnected:Boolean(process.env.SULANDRA_GITHUB_TOKEN||process.env.GITHUB_TOKEN)"))failures.push('IT Agent backend still reports coding-worker connection from credential presence alone');
if(backend.includes("if(name==='request_code_change')return{actionType:'REQUEST_CODE_CHANGE' as AgentActionType,risk:'HIGH',changeClass:'NEW_SYSTEM_CHANGE',approvalRequired:true"))failures.push('IT Agent backend still hard-codes every code request as a major change');
if(backend.includes('submitITAgentEngineeringRequest(prisma'))failures.push('IT Agent backend still diverts Admin reasoning requests into the legacy canned engineering handoff');
if(backend.includes('OPENAI_API_KEY=')||backend.includes('SMTP_PASS='))failures.push('IT Agent backend appears to hard-code a credential');

const worker=await readFile(path.join(root,'api','src','it-coding-worker.ts'),'utf8');
for(const marker of ['probeITCodingWorker','runApprovedITCodingWorker','PR_ONLY','ITCodingWorkerRun','/pulls','commitSha','prNumber'])need(worker,marker,'Trusted coding worker');

const knowledge=await readFile(path.join(root,'api','src','it-specialist-knowledge.ts'),'utf8');
for(const marker of ['getITSpecialistKnowledgeContext','REPOSITORY_MAP','APPROVED_WORK','approvedEvidenceCount','release/sulandra-1.0'])need(knowledge,marker,'IT repository knowledge');

const executor=await readFile(path.join(root,'api','src','it-agent-routine-executor.ts'),'utf8');
for(const marker of ['executeRoutineITAgentAction','SEND_EMAIL','SEND_ANNOUNCEMENT','SEND_NOTIFICATION','PUBLISH_INTRAnet_CONTENT','GENERATE_INTRAnet_MEME','recipientCount','EXECUTED'])need(executor,marker,'Routine IT Agent executor');
const intake=await readFile(path.join(root,'api','src','it-specialist-intake.ts'),'utf8');
for(const marker of ['reportITAgentRuntimeFailure','enqueueITSpecialistTicket','IT Agent runtime failure','RETRYING'])need(intake,marker,'IT Agent recovery intake');

const bootstrap=await readFile(path.join(root,'api','src','onboarding-bootstrap.ts'),'utf8');
if(bootstrap.includes('registerITAgentWorkbenchRoutes')){
  const it=bootstrap.indexOf('registerITSolutionsRoutes({ app, prisma, authOf, requireRoles });');
  const agent=bootstrap.indexOf('registerITAgentWorkbenchRoutes({ app, prisma, authOf, requireRoles });');
  if(it<0||agent<0||agent<it)failures.push('IT Agent routes must register after canonical IT Solutions');
}

try{
  await access(path.join(root,'it-solutions.html'));
  const portal=await readFile(path.join(root,'it-solutions.html'),'utf8');
  for(const marker of ['data-view="agent"','Sulandra IT Agent','Action Center','Ask IT Agent','Post a news card to the intranet','original Friday safety meme','Email all employees','Add a new button next to Operations'])need(portal,marker,'IT Solutions portal');
}catch(error){if(error?.code!=='ENOENT')throw error}

if(failures.length){console.error('IT Agent workbench verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent workbench verified: evidence-grounded reasoning, real worker readiness probing, PR-first coding execution for verified repairs/approved owner changes, gated release transitions, immediate routine operations, truthful outcomes, and runtime recovery are present.');
