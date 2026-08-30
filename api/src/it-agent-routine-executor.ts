import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { putSecureObject } from './secure-object-storage.js';

const require=createRequire(import.meta.url);
const nodemailer=require('nodemailer') as typeof import('nodemailer');

type Json=Record<string,unknown>;
type RoutineActionType='PUBLISH_INTRAnet_CONTENT'|'GENERATE_INTRAnet_MEME'|'SEND_ANNOUNCEMENT'|'SEND_NOTIFICATION'|'SEND_EMAIL';
type AuthContext={userId:string;organizationId:string};
type Input={auth:AuthContext;actionId:string;actionType:string;payload:Json|string};

const clean=(value:unknown,max=12000)=>String(value??'').trim().slice(0,max);
const obj=(value:unknown):Json=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Json;if(typeof value==='string'){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}}return{}};
const httpError=(status:number,message:string)=>Object.assign(new Error(message),{status});
const openAIKey=()=>process.env.OPENAI_API_KEY?.trim()||'';
const routineActionTypes:RoutineActionType[]=['PUBLISH_INTRAnet_CONTENT','GENERATE_INTRAnet_MEME','SEND_ANNOUNCEMENT','SEND_NOTIFICATION','SEND_EMAIL'];
export const isRoutineITAgentAction=(value:string)=>routineActionTypes.includes(value as RoutineActionType);

// IT_AGENT_AUTHENTICATED_SMTP_SENDER_V1
async function sendMail(recipients:string[],subject:string,message:string){
  const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||587),user=process.env.SMTP_USER,pass=process.env.SMTP_PASS;
  if(!host||!user||!pass)throw httpError(503,'Sulandra SMTP is not configured on this API deployment.');
  const addresses=[...new Set(recipients.map(value=>clean(value,320).toLowerCase()).filter(Boolean))];
  if(!addresses.length)throw httpError(409,'No eligible employee email recipients were found.');
  const transporter=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});
  const safeSubject=clean(subject,240),safeMessage=clean(message,12000),fromAddress=user.trim();
  const normalizedAddress=(value:unknown)=>{if(typeof value==='string')return clean(value,320).toLowerCase();if(value&&typeof value==='object'&&'address' in value)return clean((value as {address?:unknown}).address,320).toLowerCase();return''};
  try{
    const info=await transporter.sendMail({from:{name:'Sulandra Health IT Solutions',address:fromAddress},replyTo:fromAddress,to:addresses,subject:safeSubject,text:safeMessage,html:`<div style="font-family:Segoe UI,Arial,sans-serif;color:#18324a;line-height:1.6"><h2 style="color:#082f5b">${safeSubject.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}</h2><p>${safeMessage.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c)).replace(/\n/g,'<br>')}</p><p style="color:#64748b;font-size:12px">Sent by Sulandra Health IT Solutions.</p></div>`});
    const acceptedSet=new Set((Array.isArray(info.accepted)?info.accepted:[]).map(normalizedAddress).filter(Boolean));
    const rejectedSet=new Set((Array.isArray(info.rejected)?info.rejected:[]).map(normalizedAddress).filter(Boolean));
    const smtpAcceptedCount=addresses.filter(email=>acceptedSet.has(email)).length;
    const smtpRejectedCount=addresses.filter(email=>rejectedSet.has(email)).length;
    const smtpUnconfirmedCount=Math.max(0,addresses.length-smtpAcceptedCount-smtpRejectedCount);
    if(!smtpAcceptedCount)throw Object.assign(new Error('SMTP did not accept any intended employee recipients.'),{status:502,itAgentOperationalFailure:true,itAgentActionType:'SEND_EMAIL'});
    return{smtpAttemptedCount:addresses.length,smtpAcceptedCount,smtpRejectedCount,smtpUnconfirmedCount,mailboxDeliveryConfirmed:false,deliveryBasis:'SMTP_ACCEPTANCE_ONLY' as const};
  }catch(error){
    const source=error as any;
    const safeTransportMessage=clean(error instanceof Error?error.message:error,800).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b(?:Bearer\s+[A-Za-z0-9._~-]{12,}|(?:api[_ -]?key|access[_ -]?token|secret|password|mfa|otp)\s*[:=]\s*[^\s,;]+|sk-[A-Za-z0-9_-]{12,})\b/gi,'[REDACTED]');
    const transportCode=clean(source?.code,40).toUpperCase(),responseCode=Number(source?.responseCode||0)||null,command=clean(source?.command,80)||null;
    console.error('[it-agent-employee-email] SMTP handoff failed',JSON.stringify({actionType:'SEND_EMAIL',recipientCount:addresses.length,transportCode:transportCode||null,responseCode,command,fromMatchesSmtpUser:true,message:safeTransportMessage||'SMTP handoff failed.'}));
    throw Object.assign(new Error(safeTransportMessage||'Employee email SMTP handoff failed.'),{status:Number(source?.status||0)||502,code:transportCode||undefined,responseCode:responseCode||undefined,command:command||undefined,itAgentOperationalFailure:true,itAgentActionType:'SEND_EMAIL'});
  }
}

export async function executeRoutineITAgentAction(prisma:PrismaClient,input:Input){
  if(!isRoutineITAgentAction(input.actionType))throw httpError(409,`Action ${input.actionType} is not a routine IT Specialist operation.`);
  const payload=obj(input.payload);let result:Json={};
  if(input.actionType==='PUBLISH_INTRAnet_CONTENT'||input.actionType==='GENERATE_INTRAnet_MEME'){
    const id=randomUUID();let imageObjectKey:string|null=null;let externalImageUrl=clean(payload.externalImageUrl,2000);
    if(input.actionType==='GENERATE_INTRAnet_MEME'){
      const key=openAIKey();if(!key)throw httpError(503,'OpenAI is required to generate an intranet meme image.');
      const imageResponse=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-image-2',prompt:`Create an original, workplace-safe internal-company meme/card image for Sulandra Health. No copyrighted characters, logos, or copied meme templates. ${clean(payload.imagePrompt,3000)}. Caption idea: ${clean(payload.caption,1000)}`,size:'1024x1024',quality:'medium',output_format:'png'})});
      const imagePayload=await imageResponse.json() as any;if(!imageResponse.ok)throw httpError(502,imagePayload?.error?.message||'Image generation failed');const base64=imagePayload?.data?.[0]?.b64_json;if(!base64)throw httpError(502,'Image generation returned no image data');const buffer=Buffer.from(base64,'base64');imageObjectKey=`intranet/${input.auth.organizationId}/${id}/it-agent-${Date.now()}.png`;await putSecureObject({key:imageObjectKey,body:buffer,contentType:'image/png',metadata:{purpose:'it-agent-intranet-content',actionId:input.actionId}});externalImageUrl='';
    }
    await prisma.$executeRawUnsafe(`INSERT INTO "IntranetContentItem" ("id","organizationId","slotKey","kind","eyebrow","title","body","imageObjectKey","imageMimeType","externalImageUrl","linkUrl","linkLabel","sortOrder","durationMs","active","createdById","updatedById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,8000,TRUE,$13,$13)`,id,input.auth.organizationId,clean(payload.slotKey,80)||`it-agent-${Date.now()}`,clean(payload.kind,20)||'NEWS',clean(payload.eyebrow,120)||'IT Specialist',clean(payload.title,300),clean(payload.body||payload.caption,8000),imageObjectKey,imageObjectKey?'image/png':null,externalImageUrl,clean(payload.linkUrl,2000),clean(payload.linkLabel,120),input.auth.userId);
    result={resourceType:'IntranetContentItem',resourceId:id,published:true,imageGenerated:Boolean(imageObjectKey),message:`Published ${clean(payload.title,180)||'the requested intranet content'}${imageObjectKey?' with a newly generated original image':''}.`};
  }else if(input.actionType==='SEND_ANNOUNCEMENT'){
    const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeAnnouncement" ("id","organizationId","title","message","audience","priority","requiresAcknowledgment","recipientUserIds","createdById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,id,input.auth.organizationId,clean(payload.title,240),clean(payload.message,12000),clean(payload.audience,40)||'ALL_EMPLOYEES',clean(payload.priority,40)||'NORMAL',payload.requiresAcknowledgment===true,JSON.stringify(Array.isArray(payload.recipientUserIds)?payload.recipientUserIds:[]),input.auth.userId);await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeCommunicationEvent" ("id","organizationId","actorUserId","eventType","resourceType","resourceId","details") VALUES ($1,$2,$3,'ANNOUNCEMENT_CREATED','ANNOUNCEMENT',$4,$5::jsonb)`,randomUUID(),input.auth.organizationId,input.auth.userId,id,JSON.stringify({source:'IT_SPECIALIST'}));result={resourceType:'EmployeeAnnouncement',resourceId:id,published:true,message:`Published the employee announcement “${clean(payload.title,180)}”.`};
  }else if(input.actionType==='SEND_NOTIFICATION'){
    const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeNotification" ("id","organizationId","employeeId","title","message","category","actionUrl","createdById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,id,input.auth.organizationId,clean(payload.employeeId,160),clean(payload.title,240),clean(payload.message,8000),clean(payload.category,40)||'GENERAL',clean(payload.actionUrl,1000),input.auth.userId);await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeCommunicationEvent" ("id","organizationId","employeeId","actorUserId","eventType","resourceType","resourceId","details") VALUES ($1,$2,$3,$4,'NOTIFICATION_CREATED','NOTIFICATION',$5,$6::jsonb)`,randomUUID(),input.auth.organizationId,clean(payload.employeeId,160),input.auth.userId,id,JSON.stringify({source:'IT_SPECIALIST'}));result={resourceType:'EmployeeNotification',resourceId:id,sent:true,message:`Sent the employee notification “${clean(payload.title,180)}”.`};
  }else if(input.actionType==='SEND_EMAIL'){
    const audience=clean(payload.audience,40),custom=Array.isArray(payload.recipientUserIds)?payload.recipientUserIds.map(v=>clean(v,160)).filter(Boolean):[];const managerRoleNames=['ADMINISTRATOR','PROGRAM_MANAGER','HR_MANAGER','HOUSE_MANAGER','CEO','COO','DOO'];const hrRoles=['ADMINISTRATOR','HR_MANAGER','CEO','COO','DOO'];let query=`SELECT "id","email","role"::text AS role FROM "User" WHERE "organizationId"=$1 AND COALESCE("email",'')<>''`;const args:any[]=[input.auth.organizationId];if(audience==='CUSTOM'){query+=' AND "id"=ANY($2::text[])';args.push(custom)}else if(audience==='MANAGERS'){query+=' AND "role"::text=ANY($2::text[])';args.push(managerRoleNames)}else if(audience==='HR_ADMIN'){query+=' AND "role"::text=ANY($2::text[])';args.push(hrRoles)}const recipients=await prisma.$queryRawUnsafe<Array<{email:string}>>(query,...args);const emails=[...new Set(recipients.map(row=>clean(row.email,320).toLowerCase()).filter(Boolean))];const delivery=await sendMail(emails,clean(payload.subject,240),clean(payload.message,12000));result={sent:delivery.smtpAcceptedCount>0,smtpAccepted:delivery.smtpAcceptedCount>0,mailboxDeliveryConfirmed:false,recipientCount:emails.length,acceptedCount:delivery.smtpAcceptedCount,rejectedCount:delivery.smtpRejectedCount,unconfirmedCount:delivery.smtpUnconfirmedCount,audience,deliveryBasis:delivery.deliveryBasis,message:`SMTP accepted the employee email for ${delivery.smtpAcceptedCount} of ${emails.length} recipient${emails.length===1?'':'s'}${delivery.smtpRejectedCount?`; ${delivery.smtpRejectedCount} rejected`:''}${delivery.smtpUnconfirmedCount?`; ${delivery.smtpUnconfirmedCount} unconfirmed`:''}. Final inbox delivery is not confirmed by SMTP.`};
  }
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentAction" SET "status"='EXECUTED',"result"=$1::jsonb,"executedByUserId"=$2,"executedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4`,JSON.stringify(result),input.auth.userId,input.auth.organizationId,input.actionId);
  return result;
}
