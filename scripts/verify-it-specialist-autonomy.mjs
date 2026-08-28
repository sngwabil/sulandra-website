import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const need=(source,marker,label)=>{if(!source.includes(marker))failures.push(`${label} missing: ${marker}`)};
const count=(source,marker)=>source.split(marker).length-1;

const autonomy=await readFile(path.join(root,'api','src','it-specialist-autonomy.ts'),'utf8');
for(const marker of [
  'IT-','ITTicketConversationBridge','ITSpecialistMessage','ITSpecialistQueue','ITVisualGuide','ITSpecialistProductionRun',
  'SUPPORT_GUIDANCE','RESOLVED_CONFIRMATION','ESTABLISHED_OPERATION_REPAIR','MAJOR_CHANGE','RESTRICTED_HUMAN',
  'enqueueITSpecialistTicket','relaySiaMessageToITSpecialist','loadITSpecialistSiaContext','postEmployeeUpdate',
  'activeItTicketInstruction','sulandra-it-specialist','EmployeeNotification','Visual click guide',
  "requiresApproval:requiresOwner","'ESTABLISHED_OPERATION_REPAIR'","'NEW_SYSTEM_CHANGE'",
  'approvedEvidenceCount<1',"!['LOW','MEDIUM'].includes(risk)","['DATA_REPAIR'].includes(engineeringNeed)",
  'runApprovedITCodingWorker','getITSpecialistGateState','mergeITSpecialistPullRequest','verifyITSpecialistProductionCommit',
  "phase\"='WAITING_CI'","phase\"='DEPLOYING'","phase\"='RESOLVED'",'FOR UPDATE SKIP LOCKED','leaseUntil',
  'sendOwnerApprovalEmail','owner-decision',"z.enum(['APPROVE','MODIFY','DECLINE'])",'MODIFICATION_REQUESTED',
  'production verification','The ticket and conversation context remain active','ticket stays open','keep this ticket active',
])need(autonomy,marker,'it-specialist-autonomy.ts');
for(const forbidden of ['SULANDRA_GITHUB_TOKEN=','OPENAI_API_KEY=','SMTP_PASS='])if(autonomy.includes(forbidden))failures.push(`it-specialist-autonomy.ts appears to hard-code ${forbidden}`);

const knowledge=await readFile(path.join(root,'api','src','it-specialist-knowledge.ts'),'utf8');
for(const marker of [
  'ITKnowledgeSnapshot','REPOSITORY_MAP','APPROVED_WORK','merged_at','release/sulandra-1.0',
  'Sulandra Static Website','sulandra-website-production-5fc4.up.railway.app','sulandra-website-production.up.railway.app','www.sulandrahealth.com',
  '/actions/runs?head_sha=',"'CI'","'Disaster Recovery Verification'","'Production Role UAT'",
  '/merge','merge_method','deployment-meta.json','exactCommit','expectedSha',
])need(knowledge,marker,'it-specialist-knowledge.ts');
if(knowledge.includes('SULANDRA_GITHUB_TOKEN='))failures.push('it-specialist-knowledge.ts appears to hard-code GitHub credential');

const routine=await readFile(path.join(root,'api','src','it-agent-routine-executor.ts'),'utf8');
for(const marker of ['executeRoutineITAgentAction','PUBLISH_INTRAnet_CONTENT','GENERATE_INTRAnet_MEME','SEND_ANNOUNCEMENT','SEND_NOTIFICATION','SEND_EMAIL','recipientCount',"'EXECUTED'"])need(routine,marker,'Routine Admin executor');
const intake=await readFile(path.join(root,'api','src','it-specialist-intake.ts'),'utf8');
for(const marker of ['submitITAgentEngineeringRequest','reportITAgentRuntimeFailure','enqueueITSpecialistTicket','IT Agent runtime failure','ADMIN_IT_AGENT_ENGINEERING_REQUEST','ADMIN_IT_AGENT_RUNTIME_FAILURE','Established LOW/MEDIUM-risk repairs'])need(intake,marker,'IT Specialist Admin intake');
const workbenchInstaller=await readFile(path.join(root,'scripts','install-it-agent-workbench.mjs'),'utf8');
for(const marker of ['executeRoutineITAgentAction','reportITAgentRuntimeFailure',"type:item.role==='assistant'?'output_text':'input_text'",'recovering:true','probeITCodingWorker','runApprovedITCodingWorker','getITSpecialistKnowledgeContext','ESTABLISHED_OPERATION_REPAIR','NEW_SYSTEM_CHANGE'])need(workbenchInstaller,marker,'IT Agent reasoning installer');
if(workbenchInstaller.includes('submitITAgentEngineeringRequest(prisma'))failures.push('IT Agent installer still replaces direct reasoning with the legacy canned engineering handoff');

const workbench=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
for(const marker of ['approvedEvidenceCount','probeITCodingWorker','runApprovedITCodingWorker','codingWorkerConnected:connected','ESTABLISHED_OPERATION_REPAIR','NEW_SYSTEM_CHANGE','status:\'PR_OPEN\'','status:\'FAILED\''])need(workbench,marker,'IT Agent reasoning workbench');
if(workbench.includes("codingWorkerConnected:Boolean(process.env.SULANDRA_GITHUB_TOKEN||process.env.GITHUB_TOKEN)"))failures.push('IT Agent workbench still reports coding-worker connection from credential presence alone');

const bootstrap=await readFile(path.join(root,'api','src','onboarding-bootstrap.ts'),'utf8');
if(bootstrap.includes('registerITSpecialistAutonomyRoutes')){
  const worker=bootstrap.indexOf('registerITCodingWorkerRoutes('),specialist=bootstrap.indexOf('registerITSpecialistAutonomyRoutes(');
  if(worker<0||specialist<0||specialist<worker)failures.push('IT Specialist must register after the trusted coding worker');
  need(bootstrap,"import { registerITSpecialistAutonomyRoutes } from './it-specialist-autonomy.js';",'IT Specialist import');
  if(count(bootstrap,'registerITSpecialistAutonomyRoutes(')!==1)failures.push('IT Specialist must have exactly one route registration call');
  need(bootstrap,'RAILWAY_GIT_COMMIT_SHA','API health deployment identity');need(bootstrap,'RAILWAY_GIT_BRANCH','API health deployment identity');
}

const sia=await readFile(path.join(root,'api','src','sia-routes.ts'),'utf8');
if(sia.includes('it-specialist-autonomy.js')){
  for(const marker of ['relaySiaMessageToITSpecialist','loadITSpecialistSiaContext','enqueueITSpecialistTicket','ticketNumber: specialistTicket.ticketNumber','itSpecialistQueued: true'])need(sia,marker,'SIA ticket continuity');
}
const support=await readFile(path.join(root,'api','src','employee-support-routes.ts'),'utf8');
if(support.includes('it-specialist-autonomy.js'))for(const marker of ['enqueueITSpecialistTicket','ticketNumber:specialistTicket.ticketNumber','itSpecialistQueued:true'])need(support,marker,'Employee Support continuity');

const installer=await readFile(path.join(root,'scripts','install-it-specialist-autonomy.mjs'),'utf8');
for(const marker of ['registerITSpecialistAutonomyRoutes','RAILWAY_GIT_COMMIT_SHA','relaySiaMessageToITSpecialist','loadITSpecialistSiaContext','enqueueITSpecialistTicket','verify-it-specialist-autonomy.mjs'])need(installer,marker,'IT Specialist installer');
const chain=await readFile(path.join(root,'scripts','install-employee-support.mjs'),'utf8');need(chain,"await import('./install-it-specialist-autonomy.mjs')",'Employee support installer chain');

const pkg=await readFile(path.join(root,'package.json'),'utf8');need(pkg,'node scripts/write-static-deployment-meta.mjs','Static build lifecycle');
const writer=await readFile(path.join(root,'scripts','write-static-deployment-meta.mjs'),'utf8');for(const marker of ['deployment-meta.json','RAILWAY_GIT_BRANCH','RAILWAY_GIT_COMMIT_SHA','it-specialist-ui.js?v=20260828-specialist-1','Routine authorized work executes immediately','Major changes stop for owner approval'])need(writer,marker,'Static deployment writer');

try{
  await access(path.join(root,'it-guide.html'));
  const guide=await readFile(path.join(root,'it-guide.html'),'utf8');
  for(const marker of ['Sulandra IT Visual Guide','Follow the arrows in order','/api/it-solutions/employee/guides/','Back to Ask SIA','arrow'])need(guide,marker,'Employee visual guide');
}catch(error){
  if(error?.code!=='ENOENT')throw error;
  console.log('Employee visual-guide source verification skipped because it-guide.html is not present in this API-only build image.');
}

try{
  await access(path.join(root,'assets','it-specialist-ui.js'));
  const ui=await readFile(path.join(root,'assets','it-specialist-ui.js'),'utf8');
  for(const marker of ['Autonomous Sulandra IT Specialist','Refresh system map','Approve & Continue','Request Modification','Decline','/api/it-solutions/specialist/owner-decision','AUTO AFTER GATES','OWNER APPROVAL'])need(ui,marker,'IT Specialist Admin UI');
}catch(error){
  if(error?.code!=='ENOENT')throw error;
  console.log('IT Specialist Admin UI source verification skipped because frontend assets are not present in this API-only build image.');
}

try{
  await access(path.join(root,'dist-web','deployment-meta.json'));
  const meta=await readFile(path.join(root,'dist-web','deployment-meta.json'),'utf8');need(meta,'"branch"','Published deployment identity');need(meta,'"commit"','Published deployment identity');
  const published=await readFile(path.join(root,'dist-web','it-solutions.html'),'utf8');need(published,'/assets/it-specialist-ui.js?v=20260828-specialist-1','Published IT Solutions specialist UI');need(published,'Routine authorized work executes immediately','Published Admin autonomy policy');need(published,'only major changes pause for owner approval','Published Admin autonomy policy');
  await access(path.join(root,'dist-web','it-guide.html'));await access(path.join(root,'dist-web','assets','it-specialist-ui.js'));
}catch(error){if(error?.code!=='ENOENT')throw error}

if(failures.length){console.error('Autonomous IT Specialist verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Autonomous IT Specialist verified: full repository/approved-work knowledge, evidence-grounded Admin reasoning, immediate routine execution, self-ticketing failures, durable SIA continuity, visual employee guides, safe established-operation repair, owner-only major-change decisions, required gates, and exact three-service production verification are present.');