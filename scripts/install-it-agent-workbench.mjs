import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const routeTarget=path.join(root,'api','src','it-agent-workbench-routes.ts');
let routeSource=await readFile(routeTarget,'utf8');

const storageImport="import { putSecureObject } from './secure-object-storage.js';";
const executorImport="import { executeRoutineITAgentAction, isRoutineITAgentAction } from './it-agent-routine-executor.js';";
const specialistImport="import { reportITAgentRuntimeFailure, submitITAgentEngineeringRequest } from './it-specialist-intake.js';";
if(!routeSource.includes(executorImport)||!routeSource.includes(specialistImport)){
  if(!routeSource.includes(storageImport))throw new Error('IT Agent action-executor import anchor changed');
  const additions=[executorImport,specialistImport].filter(line=>!routeSource.includes(line)).join('\n');
  routeSource=routeSource.replace(storageImport,`${storageImport}\n${additions}`);
}

const brokenHistory="input:history.map(item=>({role:item.role,content:[{type:'input_text',text:redact(item.content)}]})),";
const fixedHistory="input:history.map(item=>({role:item.role,content:[{type:item.role==='assistant'?'output_text':'input_text',text:redact(item.content)}]})),";
if(routeSource.includes(brokenHistory))routeSource=routeSource.replace(brokenHistory,fixedHistory);
else if(!routeSource.includes(fixedHistory))throw new Error('IT Agent Responses API history anchor changed');

routeSource=routeSource
  .replace('You can propose real tool actions for intranet content, original memes/cards, employee announcements, targeted notifications, employee email, and controlled code/system-change requests.','You can execute real routine operational actions for intranet content, original memes/cards, employee announcements, targeted notifications, and employee email, and you can hand engineering work directly to the Sulandra IT Specialist.')
  .replace('Tool calls create reviewable proposals; never say a side effect happened until a trusted execution result says it did.','The authenticated administrator’s explicit request is authorization for routine content and communications actions, so those tool calls execute immediately without a second confirmation. Never say a side effect happened until a trusted execution result says it did.')
  .replace('New system/code changes require approval and a trusted coding worker; never fabricate a commit, PR, or deployment.','Code/system requests go to the IT Specialist. Broken already-approved behavior may be repaired autonomously after required gates; major/new/security/permission/data-meaning changes stop for owner approval. Never fabricate a commit, PR, deployment, email, or publication result.')
  .replace('Propose publishing a real card, message, resource, hero, or news item to the Sulandra intranet.','Publish a real card, message, resource, hero, or news item to the Sulandra intranet when the authenticated administrator requests it.')
  .replace('Propose generating an original workplace-safe image/meme with GPT Image 2 and publishing it as an intranet news or side card.','Generate an original workplace-safe image/meme with GPT Image 2 and publish it as an intranet news or side card when requested.')
  .replace('Propose a real in-app employee announcement using the existing Sulandra communications system.','Publish a real in-app employee announcement using the existing Sulandra communications system when requested.')
  .replace('Propose a real targeted in-app notification to one employee.','Send a real targeted in-app notification to one employee when requested.')
  .replace('Propose sending a real email through Sulandra SMTP.','Send a real email through Sulandra SMTP when requested.')
  .replace('This always waits for the administrator to press Execute in the workbench.','The authenticated administrator’s explicit request authorizes this routine operation; execute it immediately and report the recipient count.');

const legacyProposalTail="proposals.push({id:actionId,...policy,payload:args,status:'PROPOSED'});}";
const autonomousProposalTail="if(item.name==='request_code_change'){const result=await submitITAgentEngineeringRequest(prisma,{organizationId:auth.organizationId,userId:auth.userId,conversationId,summary:policy.summary,request:clean(args.request,8000),target:clean(args.target,1500),reason:clean(args.reason,3000),actionId});proposals.push({id:actionId,...policy,payload:args,status:'IN_PROGRESS',result});}else if(!policy.approvalRequired&&isRoutineITAgentAction(policy.actionType)){try{const result=await executeRoutineITAgentAction(prisma,{auth,actionId,actionType:policy.actionType,payload:{...args,toolName:item.name}});proposals.push({id:actionId,...policy,payload:args,status:'EXECUTED',result})}catch(actionError){const incident=await reportITAgentRuntimeFailure(prisma,{organizationId:auth.organizationId,userId:auth.userId,conversationId,request:policy.summary,error:actionError instanceof Error?actionError.message:String(actionError),actionId});proposals.push({id:actionId,...policy,payload:args,status:'RETRYING',result:incident})}}else{proposals.push({id:actionId,...policy,payload:args,status:'PROPOSED'});}}";
if(routeSource.includes(legacyProposalTail))routeSource=routeSource.replace(legacyProposalTail,autonomousProposalTail);
else if(!routeSource.includes("submitITAgentEngineeringRequest(prisma"))throw new Error('IT Agent action execution anchor changed');

const legacyReply="let reply=extractText(payload);if(!reply&&proposals.length)reply=`I prepared ${proposals.length} action${proposals.length===1?'':'s'} for your review. Nothing has been executed yet.`;if(!reply)reply='I reviewed the request but did not create an executable action. Tell me the exact Sulandra target and desired result.';";
const autonomousReply="let reply=extractText(payload);const outcomeMessages=proposals.map(item=>clean(item?.result?.message||'',1200)).filter(Boolean);if(outcomeMessages.length)reply=clean((reply?reply+'\\n\\n':'')+outcomeMessages.join('\\n'),12000);if(!reply&&proposals.length)reply='I routed the requested work into Sulandra IT execution. Routine operations run immediately; engineering work stays active under its IT ticket and only major changes stop for owner approval.';if(!reply)reply='I could not identify an executable Sulandra action from that request. Tell me the exact target and desired result.';";
if(routeSource.includes(legacyReply))routeSource=routeSource.replace(legacyReply,autonomousReply);
else if(!routeSource.includes('const outcomeMessages=proposals.map'))throw new Error('IT Agent outcome reply anchor changed');

const legacyCatch="res.json({data:{conversationId,reply,proposals,model:model()}})}catch(error){next(error)}});";
const recoveringCatch="res.json({data:{conversationId,reply,proposals,model:model()}})}catch(error){const status=Number((error as any)?.status||500);if(status<500)return next(error);try{const auth=authOf(res);const incident=await reportITAgentRuntimeFailure(prisma,{organizationId:auth.organizationId,userId:auth.userId,conversationId:clean(req.body?.conversationId,120)||null,request:clean(req.body?.message,4000),error:error instanceof Error?error.message:String(error)});return void res.status(202).json({data:{conversationId:incident.conversationId||clean(req.body?.conversationId,120),reply:incident.message,proposals:[],model:model(),ticketNumber:incident.ticketNumber,recovering:true}})}catch(recoveryError){next(error)}}});";
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
console.log('IT Agent workbench registered after canonical IT Solutions: role-correct multi-turn history, immediate routine Admin execution, engineering handoff to the autonomous specialist, and self-ticketing runtime recovery are installed.');
