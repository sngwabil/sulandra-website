import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

// Register the campaign routes beside canonical Education routes.
const careersPath=path.join(root,'api','src','careers-routes.ts');
let careers=await readFile(careersPath,'utf8');
const educationImport="import { registerEducationRoutes } from './education-routes.js';";
const campaignImport="import { registerEducationCampaignRoutes } from './education-campaign-routes.js';";
const educationRegister='registerEducationRoutes(app, prisma, helpers);';
const campaignRegister='registerEducationCampaignRoutes(app, prisma, helpers);';
if(!careers.includes(campaignImport)){
  if(!careers.includes(educationImport))throw new Error('Education route import anchor changed');
  careers=careers.replace(educationImport,`${educationImport}\n${campaignImport}`);
}
careers=careers.replace(new RegExp(`\\n?\\s*${campaignRegister.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
if(!careers.includes(educationRegister))throw new Error('Education route registration anchor changed');
careers=careers.replace(educationRegister,`${educationRegister}\n  ${campaignRegister}`);
await writeFile(careersPath,careers,'utf8');

const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let workbench=await readFile(workbenchPath,'utf8');
for(const marker of ['getITSpecialistKnowledgeContext','probeITCodingWorker','runApprovedITCodingWorker','ESTABLISHED_OPERATION_REPAIR']){
  if(!workbench.includes(marker))throw new Error(`IT Agent reasoning anchor missing before education install: ${marker}`);
}

const campaignExecutorImport="import { executeTrainingAgentAction } from './education-campaign-routes.js';";
if(!workbench.includes(campaignExecutorImport)){
  const anchors=[
    "import { reportITAgentRuntimeFailure } from './it-specialist-intake.js';",
    "import { getITSpecialistKnowledgeContext } from './it-specialist-knowledge.js';",
  ];
  const anchor=anchors.find(value=>workbench.includes(value));
  if(!anchor)throw new Error('IT Agent education import anchor changed');
  workbench=workbench.replace(anchor,`${anchor}\n${campaignExecutorImport}`);
}

const legacyActionUnion="type AgentActionType='PUBLISH_INTRAnet_CONTENT'|'GENERATE_INTRAnet_MEME'|'SEND_ANNOUNCEMENT'|'SEND_NOTIFICATION'|'SEND_EMAIL'|'REQUEST_CODE_CHANGE';";
const campaignActionUnion="type AgentActionType='PUBLISH_INTRAnet_CONTENT'|'GENERATE_INTRAnet_MEME'|'SEND_ANNOUNCEMENT'|'SEND_NOTIFICATION'|'SEND_EMAIL'|'CREATE_TRAINING_DRAFT'|'REVISE_TRAINING_DRAFT'|'MARK_TRAINING_READY'|'SEND_TRAINING'|'GET_TRAINING_STATUS'|'REQUEST_CODE_CHANGE';";
if(workbench.includes(legacyActionUnion))workbench=workbench.replace(legacyActionUnion,campaignActionUnion);
else if(!workbench.includes("'CREATE_TRAINING_DRAFT'"))throw new Error('IT Agent action type union anchor changed');

if(!workbench.includes("name==='create_training_draft'")){
  const codePolicyAnchor="const actionPolicy=(name:string,args:Record<string,unknown>,knowledge:KnowledgeContext)=>{\n  if(name==='request_code_change'){";
  if(!workbench.includes(codePolicyAnchor))throw new Error('IT Agent evidence-backed policy anchor changed');
  const trainingPolicies=[
    "  if(name==='create_training_draft')return{actionType:'CREATE_TRAINING_DRAFT' as AgentActionType,risk:'LOW',changeClass:'EDUCATION_CONTENT',approvalRequired:false,summary:`Create education draft: ${clean(args.title,180)}`,evidenceCount:0,safetyEscalated:false};",
    "  if(name==='revise_training_draft')return{actionType:'REVISE_TRAINING_DRAFT' as AgentActionType,risk:'LOW',changeClass:'EDUCATION_CONTENT',approvalRequired:false,summary:`Revise current education draft: ${clean(args.title||args.changeNote,180)}`,evidenceCount:0,safetyEscalated:false};",
    "  if(name==='mark_training_ready')return{actionType:'MARK_TRAINING_READY' as AgentActionType,risk:'LOW',changeClass:'EDUCATION_CONTENT',approvalRequired:false,summary:'Mark current education draft ready to send',evidenceCount:0,safetyEscalated:false};",
    "  if(name==='send_training')return{actionType:'SEND_TRAINING' as AgentActionType,risk:'MEDIUM',changeClass:'ADMIN_EDUCATION_DISTRIBUTION',approvalRequired:false,summary:'Send the reviewed education campaign',evidenceCount:0,safetyEscalated:false};",
    "  if(name==='get_training_status')return{actionType:'GET_TRAINING_STATUS' as AgentActionType,risk:'LOW',changeClass:'EDUCATION_REPORTING',approvalRequired:false,summary:'Report education completion and attestation status',evidenceCount:0,safetyEscalated:false};",
  ].join('\n');
  workbench=workbench.replace(codePolicyAnchor,`const actionPolicy=(name:string,args:Record<string,unknown>,knowledge:KnowledgeContext)=>{\n${trainingPolicies}\n  if(name==='request_code_change'){`);
}

if(!workbench.includes("name:'create_training_draft'")){
  const toolAnchor="  {type:'function',name:'request_code_change'";
  if(!workbench.includes(toolAnchor))throw new Error('IT Agent request_code_change tool anchor changed');
  const trainingTools=[
    "  {type:'function',name:'create_training_draft',description:'Create a reviewable employee education draft inside the existing Sulandra education system. Use this for training, safety education, policy education, attestations, and compliance education. Creating a draft never sends it and never requires a code-change approval.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string'},summary:{type:'string'},content:{type:'string'},audience:{type:'string',enum:['ALL_EMPLOYEES','MANAGERS','HR_ADMIN','CUSTOM']},recipientUserIds:{type:'array',items:{type:'string'}},dueDate:{type:'string'},emailSubject:{type:'string'},emailMessage:{type:'string'}},required:['title','summary','content','audience','recipientUserIds','dueDate','emailSubject','emailMessage']}},",
    "  {type:'function',name:'revise_training_draft',description:'Revise the same current education draft after Administrator review. Do not create a new campaign for requested edits. campaignId may be empty to use the current campaign in this conversation.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{campaignId:{type:'string'},title:{type:'string'},summary:{type:'string'},content:{type:'string'},dueDate:{type:'string'},emailSubject:{type:'string'},emailMessage:{type:'string'},changeNote:{type:'string'}},required:['campaignId','title','summary','content','dueDate','emailSubject','emailMessage','changeNote']}},",
    "  {type:'function',name:'mark_training_ready',description:'Use when the Administrator says the current education draft is approved, looks good, or is ready. This marks the same draft ready but does not distribute it. campaignId may be empty to use the current campaign.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{campaignId:{type:'string'}},required:['campaignId']}},",
    "  {type:'function',name:'send_training',description:'Distribute the current reviewed education when the Administrator explicitly says send, distribute, release, or assign it. The send instruction itself is authorization; never create another approval card. campaignId may be empty to use the current campaign.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{campaignId:{type:'string'}},required:['campaignId']}},",
    "  {type:'function',name:'get_training_status',description:'Report the current education campaign completion, attestation, outstanding count, percentage, and employee-level status. campaignId may be empty to use the current or most recent campaign.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{campaignId:{type:'string'}},required:['campaignId']}},",
  ].join('\n');
  workbench=workbench.replace(toolAnchor,`${trainingTools}\n${toolAnchor}`);
}

const codeInstruction='For code/system work, reason explicitly about whether this is an ESTABLISHED_OPERATION_REPAIR or a NEW_SYSTEM_CHANGE.';
const educationInstruction='For employee training/education, never use request_code_change merely because a new training item is being created. Use one persistent campaign: create_training_draft -> Administrator review -> revise_training_draft as many times as requested -> mark_training_ready when the Administrator says it is approved/looks good -> send_training only when the Administrator explicitly says send/distribute/release/assign. Saying send is the authorization; do not ask for a second approval. Use get_training_status for completion counts or employee status.';
if(!workbench.includes('create_training_draft -> Administrator review')){
  if(!workbench.includes(codeInstruction))throw new Error('IT Agent reasoning instruction anchor changed');
  workbench=workbench.replace(codeInstruction,`${educationInstruction}\\n\\n${codeInstruction}`);
}

const codeExecutionBranch="      if(policy.actionType==='REQUEST_CODE_CHANGE'){";
if(!workbench.includes("['create_training_draft','revise_training_draft','mark_training_ready','send_training','get_training_status'].includes(item.name)")){
  if(!workbench.includes(codeExecutionBranch))throw new Error('IT Agent reasoning execution branch anchor changed');
  const trainingBranch="      if(['create_training_draft','revise_training_draft','mark_training_ready','send_training','get_training_status'].includes(item.name)){try{const result=await executeTrainingAgentAction(prisma,{auth:{userId:auth.userId,organizationId:auth.organizationId},conversationId:conversationId!,actionId,toolName:item.name!,payload:args});proposals.push({id:actionId,...policy,payload:args,status:'EXECUTED',result});trustedEvents.push(clean((result as any).message,2000))}catch(actionError){const incident=await reportITAgentRuntimeFailure(prisma,{organizationId:auth.organizationId,userId:auth.userId,conversationId,request:policy.summary,error:actionError instanceof Error?actionError.message:String(actionError),actionId});proposals.push({id:actionId,...policy,payload:args,status:'RETRYING',result:incident});trustedEvents.push(incident.message)}}else if(policy.actionType==='REQUEST_CODE_CHANGE'){";
  workbench=workbench.replace(codeExecutionBranch,trainingBranch);
}

// Manual approval execution remains part of the same conversation, so the next
// reasoning turn sees the trusted result instead of regenerating an approval.
const executeResponse="res.json({data:{id:action.id,status:finalStatus,result}})";
if(!workbench.includes('ACTION_EXECUTION_RECORDED_IN_CONVERSATION')){
  if(!workbench.includes(executeResponse))throw new Error('IT Agent execute response anchor changed');
  const continuity="const executionMessage=`ACTION_EXECUTION_RECORDED_IN_CONVERSATION\\nAction ${action.id} (${action.actionType}) is now ${finalStatus}. ${clean((result as any)?.message||action.summary,1200)}`;await prisma.$executeRawUnsafe(`INSERT INTO \"ITAgentMessage\" (\"id\",\"organizationId\",\"conversationId\",\"userId\",\"role\",\"content\",\"model\") VALUES ($1,$2,$3,$4,'assistant',$5,$6)`,randomUUID(),auth.organizationId,action.conversationId,auth.userId,executionMessage,model());";
  workbench=workbench.replace(executeResponse,`${continuity}${executeResponse}`);
}

if(!workbench.includes('educationCampaigns:true'))workbench=workbench.replace(
  'codeChangeRequests:true,codingWorkerConnected:',
  'codeChangeRequests:true,educationCampaigns:true,codingWorkerConnected:',
);
await writeFile(workbenchPath,workbench,'utf8');

// Frontend publication rewrite is optional in the API-only image.
const portalPath=path.join(root,'it-solutions.html');
try{
  await access(portalPath);
  let portal=await readFile(portalPath,'utf8');
  portal=portal
    .replace('Ask for a real operational action or a system change. Side effects appear as reviewable action cards before execution.','Ask for a real operational action, reviewable employee education, or a system change. Routine operations execute from your instruction; only consequential system changes pause for approval.')
    .replace("<button class=\"example\">Add a new button next to Operations in the Admin Command Center.</button>","<button class=\"example\">Create a fall-prevention education for all employees with a September 30 deadline. Let me review it before sending.</button><button class=\"example\">Add a new button next to Operations in the Admin Command Center.</button>")
    .replace('I’m the Administrator IT Agent workbench. I can prepare and execute intranet cards/messages, original meme cards, employee announcements, targeted notifications, and employee emails. For code/UI/deployment changes I create a controlled engineering action and approval record rather than pretending the change happened.','I’m the Administrator IT Agent workbench. I execute authorized routine operations and manage employee education as one durable draft → review → revise → send → completion workflow. Training drafts are never sent until you say “send.” Major code/security/permission changes retain the controlled approval boundary.')
    .replace('The agent proposes; you decide. Executed actions retain evidence.','Routine work executes from your instruction. Education stays in one reviewable campaign until you say “send.” Only approval-required system changes show decision buttons.')
    .replace('<div class="cap"><span>GitHub code execution</span><strong id="capCode">—</strong></div>','<div class="cap"><span>Employee education campaigns</span><strong class="ok">REAL</strong></div><div class="cap"><span>GitHub code execution</span><strong id="capCode">—</strong></div>')
    .replace("const pending=a.status==='PROPOSED';return", "const pending=a.status==='PROPOSED'&&a.approvalRequired===true;const reviewLink=result.reviewUrl?`<div class=\"action-buttons\"><a class=\"btn secondary\" target=\"_blank\" rel=\"noopener\" href=\"${esc(result.reviewUrl)}\">Review education</a></div>`:'';return")
    .replace('</pre>${pending?`<div class="action-buttons">','</pre>${reviewLink}${pending?`<div class="action-buttons">')
    .replace('>Execute</button><button class="btn danger"','>Approve &amp; Continue</button><button class="btn danger"')
    .replace("bubble('agent',data.reply||'I prepared the requested action for review.');", "bubble('agent',data.reply||'I completed the requested IT operation or moved the current workflow to its next state.');");
  await writeFile(portalPath,portal,'utf8');
}catch(error){
  if(error?.code!=='ENOENT')throw error;
  console.log('IT Agent education portal rewrite skipped because frontend sources are not present in this API-only build image.');
}

await import('./verify-it-agent-training-workflow.mjs');
console.log('IT Agent education lifecycle installed on the reasoning workbench: one draft survives review/revision, explicit send distributes without a second approval, completion is tracked in EducationAssignment, and manual approval execution is written back into conversation history.');