import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const routeTarget=path.join(root,'api','src','it-agent-workbench-routes.ts');
let routeSource=await readFile(routeTarget,'utf8');

// The committed workbench is now the canonical reasoning implementation. Build-time
// installation only adds the already-approved routine executor/recovery bridge and
// normalizes Responses API history; it must not replace reasoning with a canned
// engineering-ticket handoff.
const storageImport="import { putSecureObject } from './secure-object-storage.js';";
const executorImport="import { executeRoutineITAgentAction, isRoutineITAgentAction } from './it-agent-routine-executor.js';";
const recoveryImport="import { reportITAgentRuntimeFailure } from './it-specialist-intake.js';";
if(!routeSource.includes(executorImport)||!routeSource.includes(recoveryImport)){
  if(!routeSource.includes(storageImport))throw new Error('IT Agent action-executor import anchor changed');
  const additions=[executorImport,recoveryImport].filter(line=>!routeSource.includes(line)).join('\n');
  routeSource=routeSource.replace(storageImport,`${storageImport}\n${additions}`);
}

for(const marker of ['probeITCodingWorker','runApprovedITCodingWorker','getITSpecialistKnowledgeContext','ESTABLISHED_OPERATION_REPAIR','NEW_SYSTEM_CHANGE']){
  if(!routeSource.includes(marker))throw new Error(`Canonical reasoning workbench marker missing: ${marker}`);
}

const brokenHistory="input:history.map(item=>({role:item.role,content:[{type:'input_text',text:redact(item.content)}]})),";
const fixedHistory="input:history.map(item=>({role:item.role,content:[{type:item.role==='assistant'?'output_text':'input_text',text:redact(item.content)}]})),";
if(routeSource.includes(brokenHistory))routeSource=routeSource.replace(brokenHistory,fixedHistory);
else if(!routeSource.includes(fixedHistory))throw new Error('IT Agent Responses API history anchor changed');

routeSource=routeSource
  .replace('Propose publishing a real card, message, resource, hero, or news item to the Sulandra intranet.','Publish a real card, message, resource, hero, or news item to the Sulandra intranet when the authenticated administrator requests it.')
  .replace('Propose generating an original workplace-safe image/meme with GPT Image 2 and publishing it as an intranet news or side card.','Generate an original workplace-safe image/meme with GPT Image 2 and publish it as an intranet news or side card when requested.')
  .replace('Propose a real in-app employee announcement using the existing Sulandra communications system.','Publish a real in-app employee announcement using the existing Sulandra communications system when requested.')
  .replace('Propose a real targeted in-app notification to one employee.','Send a real targeted in-app notification to one employee when requested.')
  .replace('Propose sending a real email through Sulandra SMTP.','Send a real email through Sulandra SMTP when requested.')
  .replace('This waits for the administrator to press Execute in the workbench.','The authenticated administrator’s explicit request authorizes this routine operation; execute it immediately and report the trusted result.');

const proposalTail="      }else proposals.push({id:actionId,...policy,payload:args,status:'PROPOSED'});";
const routineTail="      }else if(!policy.approvalRequired&&isRoutineITAgentAction(policy.actionType)){try{const result=await executeRoutineITAgentAction(prisma,{auth,actionId,actionType:policy.actionType,payload:{...args,toolName:item.name}});proposals.push({id:actionId,...policy,payload:args,status:'EXECUTED',result});trustedEvents.push(clean((result as any).message,2000))}catch(actionError){const incident=await reportITAgentRuntimeFailure(prisma,{organizationId:auth.organizationId,userId:auth.userId,conversationId,request:policy.summary,error:actionError instanceof Error?actionError.message:String(actionError),actionId});proposals.push({id:actionId,...policy,payload:args,status:'RETRYING',result:incident});trustedEvents.push(incident.message)}}else proposals.push({id:actionId,...policy,payload:args,status:'PROPOSED'});";
if(routeSource.includes(proposalTail))routeSource=routeSource.replace(proposalTail,routineTail);
else if(!routeSource.includes('executeRoutineITAgentAction(prisma'))throw new Error('IT Agent routine execution anchor changed');

const legacyCatch="res.json({data:{conversationId,reply,proposals,model:model()}})}catch(error){next(error)}});";
const recoveringCatch="res.json({data:{conversationId,reply,proposals,model:model()}})}catch(error){const status=Number((error as any)?.status||500);if(status<500)return next(error);try{const auth=authOf(res);const incident=await reportITAgentRuntimeFailure(prisma,{organizationId:auth.organizationId,userId:auth.userId,conversationId:clean(req.body?.conversationId,120)||null,request:clean(req.body?.message,4000),error:error instanceof Error?error.message:String(error)});return void res.status(202).json({data:{conversationId:incident.conversationId||clean(req.body?.conversationId,120),reply:incident.message,proposals:[],model:model(),ticketNumber:incident.ticketNumber,recovering:true}})}catch(_recoveryError){next(error)}}});";
if(routeSource.includes(legacyCatch))routeSource=routeSource.replace(legacyCatch,recoveringCatch);
else if(!routeSource.includes('recovering:true'))throw new Error('IT Agent self-ticket recovery anchor changed');

await writeFile(routeTarget,routeSource,'utf8');

const target=path.join(root,'api','src','onboarding-bootstrap.ts');
const importLine="import { registerITAgentWorkbenchRoutes } from './it-agent-workbench-routes.js';";
const registerLine='registerITAgentWorkbenchRoutes({ app, prisma, authOf, requireRoles });';
const itImport="import { registerITSolutionsRoutes } from './it-solutions-routes.js';";
const itRegister='registerITSolutionsRoutes({ app, prisma, authOf, requireRoles });';
let source=await readFile(target,'utf8');
if(!source.includes(importLine)){
  if(!source.includes(itImport))throw new Error('IT Solutions import anchor missing for IT Agent workbench');
  source=source.replace(itImport,`${itImport}\n${importLine}`);
}
source=source.replace(new RegExp(`\\n?${registerLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
if(!source.includes(itRegister))throw new Error('IT Solutions registration anchor missing for IT Agent workbench');
source=source.replace(itRegister,`${itRegister}\n${registerLine}`);
await writeFile(target,source,'utf8');
await import('./verify-it-agent-workbench.mjs');
console.log('IT Agent workbench registered after canonical IT Solutions: evidence-grounded reasoning, immediate routine Admin execution, direct trusted PR-only coding-worker dispatch, truthful worker status, and self-ticketing runtime recovery are installed.');