import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const campaignPath=path.join(root,'api','src','education-campaign-routes.ts');
const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');

let campaigns=await readFile(campaignPath,'utf8');
const statusAnchor="  if (!campaign) throw httpError(404, 'No education campaign is available in this IT conversation.');\n  const rows = await prisma.$queryRawUnsafe<Array<{";
const draftFastPath=`  if (!campaign) throw httpError(404, 'No education campaign is available in this IT conversation.');\n  if (campaign.status === 'DRAFT' || campaign.status === 'READY_TO_SEND') {\n    const ready = campaign.status === 'READY_TO_SEND';\n    return {\n      campaignId: campaign.id,\n      title: campaign.title,\n      status: campaign.status,\n      version: campaign.version,\n      dueDate: campaign.dueDate,\n      sentAt: campaign.sentAt,\n      reviewUrl: educationCampaignReviewUrl(campaign.id),\n      assigned: 0,\n      completed: 0,\n      outstanding: 0,\n      completionPercent: 0,\n      employees: [],\n      message: ready\n        ? \`No. “\${campaign.title}” has not been sent yet. It is ready to send.\`\n        : \`No. “\${campaign.title}” has not been sent yet. It is still a draft.\`,\n    };\n  }\n  const rows = await prisma.$queryRawUnsafe<Array<{`;
if(!campaigns.includes("has not been sent yet. It is still a draft.")){
  if(!campaigns.includes(statusAnchor))throw new Error('Education status fast-path anchor changed');
  campaigns=campaigns.replace(statusAnchor,draftFastPath);
}
const activeMessage="    message: `“${campaign.title}” status: ${completed} completed, ${outstanding} outstanding, ${assigned} assigned (${assigned ? Math.round((completed / assigned) * 100) : 0}% complete).`,";
const naturalActiveMessage="    message: `Yes. “${campaign.title}” was sent${campaign.sentAt ? ` on ${new Date(campaign.sentAt).toLocaleDateString('en-US')}` : ''}. ${completed} completed, ${outstanding} outstanding, ${assigned} assigned (${assigned ? Math.round((completed / assigned) * 100) : 0}% complete).`,";
if(campaigns.includes(activeMessage))campaigns=campaigns.replace(activeMessage,naturalActiveMessage);
else if(!campaigns.includes('Yes. “${campaign.title}” was sent'))throw new Error('Education active-status message anchor changed');
await writeFile(campaignPath,campaigns,'utf8');

let workbench=await readFile(workbenchPath,'utf8');
const oldImport="import { executeTrainingAgentAction } from './education-campaign-routes.js';";
const newImport="import { executeTrainingAgentAction, getTrainingCampaignStatus } from './education-campaign-routes.js';";
if(workbench.includes(oldImport))workbench=workbench.replace(oldImport,newImport);
else if(!workbench.includes(newImport))throw new Error('Read-only education-status import anchor changed');

const loopAnchor="for(const item of payload.output||[]){if(item.type!=='function_call'||!item.name)continue;let args:Record<string,unknown>={};try{args=JSON.parse(item.arguments||'{}')}catch{continue}const policy=actionPolicy(item.name,args,knowledge);";
const readOnlyLoop="for(const item of payload.output||[]){if(item.type!=='function_call'||!item.name)continue;let args:Record<string,unknown>={};try{args=JSON.parse(item.arguments||'{}')}catch{continue}if(item.name==='get_training_status'){try{const result=await getTrainingCampaignStatus(prisma,{organizationId:auth.organizationId,userId:auth.userId,conversationId:conversationId!,campaignId:clean(args.campaignId,160)||null});trustedEvents.push(clean(result.message,2000))}catch(actionError){console.warn('[it-agent] read-only education status failed:',safeError(actionError));trustedEvents.push('I could not verify the education status just now. Please try again.')}continue}const policy=actionPolicy(item.name,args,knowledge);";
if(!workbench.includes("if(item.name==='get_training_status'){try{const result=await getTrainingCampaignStatus")){
  if(!workbench.includes(loopAnchor))throw new Error('Read-only education-status reasoning anchor changed');
  workbench=workbench.replace(loopAnchor,readOnlyLoop);
}
await writeFile(workbenchPath,workbench,'utf8');

async function patchPortal(relativePath){
  const file=path.join(root,relativePath);
  try{await access(file)}catch(error){if(error?.code==='ENOENT')return;throw error}
  let html=await readFile(file,'utf8');
  const oldPrefix="function renderActions(actions){if(!Array.isArray(actions)||!actions.length){";
  const newPrefix="function renderActions(actions){actions=Array.isArray(actions)?actions.filter(a=>a?.actionType!=='GET_TRAINING_STATUS'):[];if(!actions.length){";
  if(html.includes(oldPrefix))html=html.replace(oldPrefix,newPrefix);
  else if(!html.includes("actions.filter(a=>a?.actionType!=='GET_TRAINING_STATUS')"))throw new Error(`${relativePath} read-only Action Center filter anchor changed`);
  await writeFile(file,html,'utf8');
}
await patchPortal('it-solutions.html');
await patchPortal(path.join('dist-web','it-solutions.html'));

console.log('IT Agent read-only education status fixed: draft/sent questions answer directly, status reads no longer create Action Center work items, and legacy status cards are hidden from the work queue.');
