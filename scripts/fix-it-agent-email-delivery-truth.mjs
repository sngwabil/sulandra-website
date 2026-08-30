import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function replaceFunction(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker);
  if(start<0)throw new Error(`${label} start anchor changed`);
  const end=source.indexOf(endMarker,start);
  if(end<0)throw new Error(`${label} end anchor changed`);
  return source.slice(0,start)+replacement.trimEnd()+'\n'+source.slice(end);
}

function replaceSection(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker);
  if(start<0)throw new Error(`${label} start anchor changed`);
  const end=source.indexOf(endMarker,start);
  if(end<0)throw new Error(`${label} end anchor changed`);
  return source.slice(0,start)+replacement.trimEnd()+'\n'+source.slice(end);
}

const educationPath=path.join(root,'api','src','education-campaign-routes.ts');
let education=await readFile(educationPath,'utf8');
if(!education.includes('IT_AGENT_EDUCATION_EMAIL_DELIVERY_TRUTH_V1')){
  const template=await readFile(path.join(root,'scripts','templates','it-agent-education-send-training.ts.txt'),'utf8');
  education=replaceFunction(education,'export async function sendTrainingCampaign','\nexport async function getTrainingCampaignStatus',template,'Education email delivery');
  await writeFile(educationPath,education,'utf8');
}

const artifactPath=path.join(root,'api','src','it-agent-artifact-routes.ts');
let artifact=await readFile(artifactPath,'utf8');
if(!artifact.includes('IT_AGENT_EXTERNAL_EMAIL_DELIVERY_TRUTH_V1')){
  const template=await readFile(path.join(root,'scripts','templates','it-agent-external-email.ts.txt'),'utf8');
  artifact=replaceFunction(artifact,'async function sendExternalEmail','\nasync function createPdf',template,'External email delivery');
  await writeFile(artifactPath,artifact,'utf8');
}

const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let workbench=await readFile(workbenchPath,'utf8');
if(!workbench.includes('IT_AGENT_GENERAL_EMAIL_DELIVERY_TRUTH_V1')){
  const helper=await readFile(path.join(root,'scripts','templates','it-agent-general-email-helper.ts.txt'),'utf8');
  const executeBlock=await readFile(path.join(root,'scripts','templates','it-agent-general-email-execute-block.ts.txt'),'utf8');
  const registerAnchor='export function registerITAgentWorkbenchRoutes({app,prisma,authOf,requireRoles}:Dependencies){';
  if(!workbench.includes(registerAnchor))throw new Error('General employee email helper anchor changed');
  workbench=workbench.replace(registerAnchor,helper.trimEnd()+'\n\n'+registerAnchor);
  workbench=replaceSection(
    workbench,
    "    } else if(action.actionType==='SEND_EMAIL'){",
    '\n    await prisma.$executeRawUnsafe(`UPDATE ',
    executeBlock,
    'General employee email execution',
  );
  const instructionAnchor='Never say code was fixed, a PR was opened, an email was sent, content was published, or production changed until a trusted execution result proves it.';
  if(!workbench.includes(instructionAnchor))throw new Error('IT Agent email truth instruction anchor changed');
  workbench=workbench.replace(
    instructionAnchor,
    instructionAnchor+' For email execution results, smtpAccepted or smtpAcceptedCount proves only SMTP handoff, not inbox delivery. Describe it as accepted by SMTP and explicitly state that mailbox delivery is unconfirmed; never say delivered or imply the recipient saw it unless mailboxDeliveryConfirmed is true.',
  );
  await writeFile(workbenchPath,workbench,'utf8');
}

// IT_AGENT_ROUTINE_OPERATIONAL_FAILURE_BOUNDARY_V1
// A mail-provider rejection, timeout, rate limit, or SMTP configuration problem is an
// execution outcome, not evidence that the Sulandra IT application itself crashed.
// Preserve self-ticketing for unexpected programming/runtime faults only.
if(!workbench.includes('IT_AGENT_ROUTINE_OPERATIONAL_FAILURE_BOUNDARY_V1')){
  const legacyRoutineFailure="catch(actionError){const incident=await reportITAgentRuntimeFailure(prisma,{organizationId:auth.organizationId,userId:auth.userId,conversationId,request:policy.summary,error:actionError instanceof Error?actionError.message:String(actionError),actionId});proposals.push({id:actionId,...policy,payload:args,status:'RETRYING',result:incident});trustedEvents.push(incident.message)}";
  const boundedRoutineFailure=String.raw`catch(actionError){/* IT_AGENT_ROUTINE_OPERATIONAL_FAILURE_BOUNDARY_V1 */const actionStatus=Number((actionError as any)?.status||0);const transportCode=clean((actionError as any)?.code,40).toUpperCase();const providerResponseCode=Number((actionError as any)?.responseCode||0);const expectedExternalEmailFailure=policy.actionType==='SEND_EXTERNAL_EMAIL'&&((actionError as any)?.itAgentOperationalFailure===true||(actionStatus>=400&&actionStatus<500)||actionStatus===502||actionStatus===503||['EAUTH','ETIMEDOUT','ECONNECTION','ESOCKET','EENVELOPE','EMESSAGE','ESTREAM','EDNS'].includes(transportCode)||providerResponseCode>=400);if(expectedExternalEmailFailure){const safeReason=clean(actionError instanceof Error?actionError.message:String(actionError),600).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b(?:Bearer\s+[A-Za-z0-9._~-]{12,}|(?:api[_ -]?key|access[_ -]?token|secret|password|mfa|otp)\s*[:=]\s*[^\s,;]+|sk-[A-Za-z0-9_-]{12,})\b/gi,'[REDACTED]');const failureResult={sent:false,smtpAccepted:false,mailboxDeliveryConfirmed:false,operationalFailure:true,statusCode:actionStatus||null,transportCode:transportCode||null,providerResponseCode:providerResponseCode||null,message:'External email was not sent. '+(safeReason||'The mail service did not accept the SMTP handoff.')};await prisma.$executeRawUnsafe("UPDATE \"ITAgentAction\" SET \"status\"='FAILED',\"result\"=$1::jsonb,\"updatedAt\"=NOW() WHERE \"organizationId\"=$2 AND \"id\"=$3",JSON.stringify(failureResult),auth.organizationId,actionId).catch(()=>{});proposals.push({id:actionId,...policy,payload:args,status:'FAILED',result:failureResult});trustedEvents.push(failureResult.message)}else{const incident=await reportITAgentRuntimeFailure(prisma,{organizationId:auth.organizationId,userId:auth.userId,conversationId,request:policy.summary,error:actionError instanceof Error?actionError.message:String(actionError),actionId});proposals.push({id:actionId,...policy,payload:args,status:'RETRYING',result:incident});trustedEvents.push(incident.message)}}`;
  if(!workbench.includes(legacyRoutineFailure))throw new Error('IT Agent routine operational-failure boundary anchor changed');
  workbench=workbench.replace(legacyRoutineFailure,boundedRoutineFailure);
  await writeFile(workbenchPath,workbench,'utf8');
}

console.log('IT Agent email delivery truth installed: education, external email, and general employee email separate SMTP acceptance from final inbox delivery; expected external-email transport failures remain action failures instead of false runtime incidents.');
