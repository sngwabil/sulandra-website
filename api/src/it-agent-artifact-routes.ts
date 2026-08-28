import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Express, RequestHandler, Response } from 'express';
import type { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';
import {
  deleteSecureObject,
  decryptClientEncryptedObject,
  getSecureObject,
  putSecureObject,
  scanBufferForMalware,
} from './secure-object-storage.js';

const require=createRequire(import.meta.url);
const nodemailer=require('nodemailer') as typeof import('nodemailer');

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;legalEntityId?:string|null};
type Dependencies={app:Express;prisma:PrismaClient;authOf:(response:Response)=>AuthContext;requireRoles:(...roles:UserRole[])=>RequestHandler;adminRoles:readonly UserRole[]};
type Json=Record<string,unknown>;
type RoutineInput={auth:{userId:string;organizationId:string};actionId:string;actionType:string;payload:Json|string};
type ArtifactRow={
  id:string;organizationId:string;conversationId:string;uploadedByUserId:string;fileName:string;mimeType:string;sizeBytes:number;sha256:string;
  objectKey:string;storageEncryption:string;storageIvBase64:string|null;storageAuthTagBase64:string|null;scanStatus:string;scanEngine:string|null;
  sourceType:string;status:string;purpose:string;createdAt:Date|string;deletedAt?:Date|string|null;
};

const clean=(value:unknown,max=12000)=>String(value??'').trim().slice(0,max);
const obj=(value:unknown):Json=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Json;if(typeof value==='string'){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}}return{}};
const httpError=(status:number,message:string)=>Object.assign(new Error(message),{status});
const sha256=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const maxUploadBytes=()=>Math.min(40*1024*1024,Math.max(1024*1024,Number(process.env.IT_AGENT_UPLOAD_MAX_BYTES||25*1024*1024)));
const maxAttachmentBytes=()=>Math.min(40*1024*1024,Math.max(1024*1024,Number(process.env.IT_AGENT_MODEL_ATTACHMENT_MAX_BYTES||20*1024*1024)));
const requireScan=()=>String(process.env.IT_AGENT_REQUIRE_MALWARE_SCAN||'').trim().toLowerCase()==='true';
const externalEmailHourlyLimit=()=>Math.max(1,Math.min(100,Number(process.env.IT_AGENT_EXTERNAL_EMAIL_HOURLY_LIMIT||20)));
const externalRecipientDailyLimit=()=>Math.max(1,Math.min(5000,Number(process.env.IT_AGENT_EXTERNAL_RECIPIENT_DAILY_LIMIT||250)));
const openAIKey=()=>process.env.OPENAI_API_KEY?.trim()||'';

const blockedExtensions=new Set(['exe','dll','msi','com','scr','bat','cmd','ps1','vbs','apk','dmg','pkg','deb','rpm','iso']);
const safeExtensions=new Set([
  'pdf','txt','csv','tsv','md','markdown','json','xml','yaml','yml','toml','ini','log','sql','rtf',
  'doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','zip',
  'png','jpg','jpeg','webp','gif','heic','heif','bmp',
  'js','mjs','cjs','ts','tsx','jsx','css','html','htm','py','java','go','rs','rb','php','sh',
]);
const inlineMimes=new Set(['application/pdf','image/png','image/jpeg','image/webp','image/gif']);
const imageMimes=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const modelFileExtensions=new Set(['pdf','txt','csv','tsv','md','markdown','json','xml','yaml','yml','rtf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','js','mjs','cjs','ts','tsx','jsx','css','html','htm','py','java','go','rs','rb','php','sh','sql']);

const uploadSchema=z.object({
  conversationId:z.string().uuid().optional(),
  fileName:z.string().trim().min(1).max(220),
  mimeType:z.string().trim().min(1).max(160).optional().default('application/octet-stream'),
  fileDataBase64:z.string().min(1),
  purpose:z.string().trim().max(240).optional().default('IT_AGENT_CHAT_ATTACHMENT'),
});
const externalEmailSchema=z.object({
  recipients:z.array(z.string().trim().email().max(320)).min(1).max(50),
  subject:z.string().trim().min(1).max(240),
  message:z.string().trim().min(1).max(12000),
});
const pdfSchema=z.object({
  title:z.string().trim().min(1).max(240),
  fileName:z.string().trim().min(1).max(180).optional().default('sulandra-document.pdf'),
  content:z.string().min(1).max(80000),
});
const imageSchema=z.object({
  prompt:z.string().trim().min(1).max(5000),
  fileName:z.string().trim().min(1).max(180).optional().default('sulandra-image.png'),
  size:z.enum(['1024x1024','1536x1024','1024x1536']).optional().default('1024x1024'),
});

function extensionOf(fileName:string){const name=clean(fileName,220);const index=name.lastIndexOf('.');return index>=0?name.slice(index+1).toLowerCase():''}
function safeFileName(fileName:string,fallback='attachment.bin'){
  const value=clean(fileName,220).replace(/[\u0000-\u001f\u007f]/g,'').replace(/[\\/]+/g,'-').replace(/[^A-Za-z0-9._()\- ]+/g,'_').replace(/\s+/g,' ').trim();
  return value&&value!=='.'&&value!=='..'?value.slice(0,180):fallback;
}
function normalizeMime(value:string){return clean(value,160).split(';')[0].trim().toLowerCase()||'application/octet-stream'}
function decodeBase64(value:string){
  const raw=value.replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'');
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(raw))throw httpError(400,'Attachment data is not valid base64.');
  const buffer=Buffer.from(raw,'base64');if(!buffer.length)throw httpError(400,'Attachment is empty.');return buffer;
}
function validateFile(fileName:string,mimeType:string,buffer:Buffer){
  const ext=extensionOf(fileName);if(!ext||blockedExtensions.has(ext)||!safeExtensions.has(ext))throw httpError(415,`File type .${ext||'unknown'} is not permitted in IT Agent chat.`);
  if(buffer.length>maxUploadBytes())throw httpError(413,`Attachment exceeds the ${Math.floor(maxUploadBytes()/1024/1024)} MB limit.`);
  const mime=normalizeMime(mimeType);
  const starts=(bytes:number[])=>bytes.every((b,i)=>buffer[i]===b);
  if(ext==='pdf'&&!buffer.subarray(0,5).equals(Buffer.from('%PDF-')))throw httpError(415,'The uploaded PDF does not have a valid PDF signature.');
  if(ext==='png'&&!starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))throw httpError(415,'The uploaded PNG does not have a valid PNG signature.');
  if(['jpg','jpeg'].includes(ext)&&!starts([0xff,0xd8,0xff]))throw httpError(415,'The uploaded JPEG does not have a valid JPEG signature.');
  if(ext==='gif'&&!['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString('ascii')))throw httpError(415,'The uploaded GIF does not have a valid GIF signature.');
  if(ext==='webp'&&!(buffer.subarray(0,4).toString('ascii')==='RIFF'&&buffer.subarray(8,12).toString('ascii')==='WEBP'))throw httpError(415,'The uploaded WebP does not have a valid WebP signature.');
  if(['docx','xlsx','pptx','odt','ods','odp','zip'].includes(ext)&&!starts([0x50,0x4b]))throw httpError(415,'The uploaded archive/Office file does not have a valid ZIP container signature.');
  if(['txt','csv','tsv','md','markdown','json','xml','yaml','yml','toml','ini','log','sql','js','mjs','cjs','ts','tsx','jsx','css','html','htm','py','java','go','rs','rb','php','sh'].includes(ext)&&buffer.includes(0))throw httpError(415,'Text/code attachments cannot contain binary NUL bytes.');
  return mime;
}

async function ensureSchema(prisma:PrismaClient){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentConversation" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"userId" TEXT NOT NULL,"title" TEXT NOT NULL DEFAULT 'IT Agent session',"status" TEXT NOT NULL DEFAULT 'OPEN',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentArtifact" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"conversationId" TEXT NOT NULL,"uploadedByUserId" TEXT NOT NULL,"fileName" TEXT NOT NULL,"mimeType" TEXT NOT NULL,"sizeBytes" INTEGER NOT NULL,"sha256" TEXT NOT NULL,"objectKey" TEXT NOT NULL,"storageEncryption" TEXT NOT NULL,"storageIvBase64" TEXT,"storageAuthTagBase64" TEXT,"scanStatus" TEXT NOT NULL,"scanEngine" TEXT,"scanSignature" TEXT,"scanDetail" TEXT NOT NULL DEFAULT '',"sourceType" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'AVAILABLE',"purpose" TEXT NOT NULL DEFAULT '',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"deletedAt" TIMESTAMPTZ)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITAgentArtifact_conversation_idx" ON "ITAgentArtifact"("organizationId","conversationId","createdAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentArtifactEvent" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"artifactId" TEXT NOT NULL,"actorUserId" TEXT NOT NULL,"eventType" TEXT NOT NULL,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITAgentArtifactEvent_artifact_idx" ON "ITAgentArtifactEvent"("organizationId","artifactId","createdAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentExternalEmailAudit" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"actorUserId" TEXT NOT NULL,"actionId" TEXT NOT NULL,"recipientCount" INTEGER NOT NULL,"recipients" JSONB NOT NULL DEFAULT '[]'::jsonb,"subject" TEXT NOT NULL,"messageSha256" TEXT NOT NULL,"status" TEXT NOT NULL,"providerMessageId" TEXT,"error" TEXT NOT NULL DEFAULT '',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"sentAt" TIMESTAMPTZ)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITAgentExternalEmailAudit_rate_idx" ON "ITAgentExternalEmailAudit"("organizationId","actorUserId","createdAt" DESC)`);
}

async function ensureConversation(prisma:PrismaClient,auth:{userId:string;organizationId:string},conversationId?:string){
  await ensureSchema(prisma);
  if(conversationId){const rows=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "ITAgentConversation" WHERE "organizationId"=$1 AND "userId"=$2 AND "id"=$3 LIMIT 1`,auth.organizationId,auth.userId,conversationId);if(!rows[0])throw httpError(404,'IT Agent conversation was not found.');return conversationId}
  const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentConversation" ("id","organizationId","userId","title") VALUES ($1,$2,$3,'IT Agent attachment session')`,id,auth.organizationId,auth.userId);return id;
}

async function logArtifactEvent(prisma:PrismaClient,artifactId:string,auth:{userId:string;organizationId:string},eventType:string,details:Json={}){
  await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentArtifactEvent" ("id","organizationId","artifactId","actorUserId","eventType","details") VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,randomUUID(),auth.organizationId,artifactId,auth.userId,eventType,JSON.stringify(details));
}

async function storeArtifact(prisma:PrismaClient,input:{auth:{userId:string;organizationId:string};conversationId:string;fileName:string;mimeType:string;body:Buffer;sourceType:'UPLOAD'|'GENERATED_PDF'|'GENERATED_IMAGE';purpose:string;scanUploaded?:boolean}){
  await ensureSchema(prisma);
  const fileName=safeFileName(input.fileName,input.sourceType==='GENERATED_PDF'?'sulandra-document.pdf':input.sourceType==='GENERATED_IMAGE'?'sulandra-image.png':'attachment.bin');
  const mimeType=normalizeMime(input.mimeType);let scanStatus='GENERATED',scanEngine='sulandra-generated',scanSignature:null|string=null,scanDetail='Generated inside the authenticated IT Agent workbench.';
  if(input.scanUploaded){const scan=await scanBufferForMalware(input.body);scanStatus=scan.status;scanEngine=scan.engine;scanSignature=scan.signature;scanDetail=clean(scan.detail,1000);if(scan.status==='INFECTED')throw httpError(422,`Upload blocked by malware scanning${scan.signature?`: ${scan.signature}`:''}.`);if(scan.status==='UNAVAILABLE'&&requireScan())throw httpError(503,'Malware scanning is required for IT Agent uploads but is currently unavailable.');}
  const id=randomUUID();const objectKey=`it-agent/${input.auth.organizationId}/${input.conversationId}/${id}/${fileName}`;
  const stored=await putSecureObject({key:objectKey,body:input.body,contentType:mimeType,metadata:{purpose:input.purpose,source:input.sourceType,artifactId:id}});
  await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentArtifact" ("id","organizationId","conversationId","uploadedByUserId","fileName","mimeType","sizeBytes","sha256","objectKey","storageEncryption","storageIvBase64","storageAuthTagBase64","scanStatus","scanEngine","scanSignature","scanDetail","sourceType","status","purpose") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'AVAILABLE',$18)`,id,input.auth.organizationId,input.conversationId,input.auth.userId,fileName,mimeType,input.body.length,stored.sha256,stored.key,stored.encryption,stored.ivBase64,stored.authTagBase64,scanStatus,scanEngine,scanSignature,scanDetail,input.sourceType,input.purpose);
  await logArtifactEvent(prisma,id,input.auth,input.sourceType==='UPLOAD'?'UPLOADED':'GENERATED',{fileName,mimeType,sizeBytes:input.body.length,scanStatus});
  return{id,conversationId:input.conversationId,fileName,mimeType,sizeBytes:input.body.length,sha256:stored.sha256,scanStatus,sourceType:input.sourceType,status:'AVAILABLE',url:`/api/it-solutions/agent/artifacts/${id}/content`,downloadUrl:`/api/it-solutions/agent/artifacts/${id}/content?download=1`};
}

async function artifactRow(prisma:PrismaClient,organizationId:string,artifactId:string){const rows=await prisma.$queryRawUnsafe<ArtifactRow[]>(`SELECT * FROM "ITAgentArtifact" WHERE "organizationId"=$1 AND "id"=$2 AND "status"='AVAILABLE' LIMIT 1`,organizationId,artifactId);return rows[0]||null}
async function readArtifactBody(row:ArtifactRow){let body=await getSecureObject(row.objectKey);if(row.storageEncryption==='CLIENT-AES-256-GCM'){if(!row.storageIvBase64||!row.storageAuthTagBase64)throw httpError(500,'Artifact encryption metadata is incomplete.');body=decryptClientEncryptedObject(body,row.storageIvBase64,row.storageAuthTagBase64)}return body}

function pdfText(value:string){return value.replace(/\r/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/\u2026/g,'...').replace(/[^\u0009\u000a\u0020-\u00ff]/g,'?')}
function wrapLine(line:string,width=88){const words=line.trim().split(/\s+/).filter(Boolean);if(!words.length)return [''];const lines:string[]=[];let current='';for(const word of words){if(!current){current=word;continue}if((current+' '+word).length<=width)current+=' '+word;else{lines.push(current);current=word}}if(current)lines.push(current);return lines}
function pdfEscape(value:string){return value.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')}
function buildPdf(title:string,content:string){
  const all=[title,'',...pdfText(content).split('\n').flatMap(line=>wrapLine(line))];const pages:string[][]=[];for(let i=0;i<all.length;i+=46)pages.push(all.slice(i,i+46));if(!pages.length)pages.push(['']);
  const pageRefs=pages.map((_,index)=>4+index*2);const contentRefs=pages.map((_,index)=>5+index*2);const objects=new Map<number,Buffer>();
  objects.set(1,Buffer.from('<< /Type /Catalog /Pages 2 0 R >>','latin1'));objects.set(2,Buffer.from(`<< /Type /Pages /Kids [${pageRefs.map(n=>`${n} 0 R`).join(' ')}] /Count ${pages.length} >>`,'latin1'));objects.set(3,Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','latin1'));
  pages.forEach((lines,index)=>{const stream=['BT','/F1 11 Tf','54 756 Td','14 TL',...lines.map((line,i)=>`${i?'T* ':''}(${pdfEscape(line)}) Tj`),'ET'].join('\n');const content=Buffer.from(stream,'latin1');objects.set(pageRefs[index],Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentRefs[index]} 0 R >>`,'latin1'));objects.set(contentRefs[index],Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`,'latin1'),content,Buffer.from('\nendstream','latin1')]));});
  const maxObj=Math.max(...objects.keys());const chunks:Buffer[]=[Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1')];const offsets:number[]=[0];let offset=chunks[0].length;for(let n=1;n<=maxObj;n++){const body=objects.get(n)||Buffer.from('<<>>','latin1');offsets[n]=offset;const chunk=Buffer.concat([Buffer.from(`${n} 0 obj\n`,'latin1'),body,Buffer.from('\nendobj\n','latin1')]);chunks.push(chunk);offset+=chunk.length}const xrefOffset=offset;let xref=`xref\n0 ${maxObj+1}\n0000000000 65535 f \n`;for(let n=1;n<=maxObj;n++)xref+=`${String(offsets[n]).padStart(10,'0')} 00000 n \n`;xref+=`trailer\n<< /Size ${maxObj+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;chunks.push(Buffer.from(xref,'latin1'));return Buffer.concat(chunks);
}

export const isITAgentArtifactRoutineAction=(value:string)=>['SEND_EXTERNAL_EMAIL','CREATE_PDF','GENERATE_IMAGE'].includes(String(value||''));

async function sendExternalEmail(prisma:PrismaClient,input:RoutineInput){
  const payload=externalEmailSchema.parse(obj(input.payload));await ensureSchema(prisma);const recipients=[...new Set(payload.recipients.map(v=>v.toLowerCase()))];
  const [hourRows,dayRows]=await Promise.all([
    prisma.$queryRawUnsafe<Array<{count:number}>>(`SELECT COUNT(*)::int AS count FROM "ITAgentExternalEmailAudit" WHERE "organizationId"=$1 AND "actorUserId"=$2 AND "createdAt">NOW()-INTERVAL '1 hour'`,input.auth.organizationId,input.auth.userId),
    prisma.$queryRawUnsafe<Array<{count:number}>>(`SELECT COALESCE(SUM("recipientCount"),0)::int AS count FROM "ITAgentExternalEmailAudit" WHERE "organizationId"=$1 AND "actorUserId"=$2 AND "createdAt">NOW()-INTERVAL '24 hours'`,input.auth.organizationId,input.auth.userId),
  ]);
  if(Number(hourRows[0]?.count||0)>=externalEmailHourlyLimit())throw httpError(429,'External-email hourly safety limit reached. Try again later.');if(Number(dayRows[0]?.count||0)+recipients.length>externalRecipientDailyLimit())throw httpError(429,'External-email daily recipient safety limit reached.');
  const auditId=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentExternalEmailAudit" ("id","organizationId","actorUserId","actionId","recipientCount","recipients","subject","messageSha256","status") VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'SENDING')`,auditId,input.auth.organizationId,input.auth.userId,input.actionId,recipients.length,JSON.stringify(recipients),payload.subject,sha256(payload.message));
  const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||587),user=process.env.SMTP_USER,pass=process.env.SMTP_PASS;if(!host||!user||!pass)throw httpError(503,'Sulandra SMTP is not configured on this API deployment.');const fromAddress=(process.env.FROM_EMAIL||process.env.SMTP_FROM||user).trim();
  try{const transporter=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});const safeSubject=clean(payload.subject,240),safeMessage=clean(payload.message,12000);const info=await transporter.sendMail({from:{name:'Sulandra Health IT Solutions',address:fromAddress},replyTo:user.trim(),to:fromAddress,bcc:recipients,subject:safeSubject,text:safeMessage,html:`<div style="font-family:Segoe UI,Arial,sans-serif;color:#18324a;line-height:1.6"><h2 style="color:#082f5b">${safeSubject.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}</h2><p>${safeMessage.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c)).replace(/\n/g,'<br>')}</p><p style="color:#64748b;font-size:12px">Sent by Sulandra Health IT Solutions.</p></div>`});await prisma.$executeRawUnsafe(`UPDATE "ITAgentExternalEmailAudit" SET "status"='SENT',"providerMessageId"=$1,"sentAt"=NOW() WHERE "id"=$2`,clean(info.messageId,500),auditId);return{sent:true,recipientCount:recipients.length,audience:'EXTERNAL',auditId,message:`External email sent to ${recipients.length} recipient${recipients.length===1?'':'s'}.`};}catch(error){await prisma.$executeRawUnsafe(`UPDATE "ITAgentExternalEmailAudit" SET "status"='FAILED',"error"=$1 WHERE "id"=$2`,clean(error instanceof Error?error.message:error,1200),auditId).catch(()=>{});throw error}
}

async function createPdf(prisma:PrismaClient,input:RoutineInput){const payload=pdfSchema.parse(obj(input.payload));const actionRows=await prisma.$queryRawUnsafe<Array<{conversationId:string}>>(`SELECT "conversationId" FROM "ITAgentAction" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,input.auth.organizationId,input.actionId);const conversationId=actionRows[0]?.conversationId;if(!conversationId)throw httpError(404,'IT Agent action conversation was not found.');let fileName=safeFileName(payload.fileName,'sulandra-document.pdf');if(!fileName.toLowerCase().endsWith('.pdf'))fileName+='.pdf';const artifact=await storeArtifact(prisma,{auth:input.auth,conversationId,fileName,mimeType:'application/pdf',body:buildPdf(payload.title,payload.content),sourceType:'GENERATED_PDF',purpose:'IT_AGENT_GENERATED_PDF'});return{...artifact,artifactId:artifact.id,message:`Created PDF “${artifact.fileName}”.`};}

async function generateImage(prisma:PrismaClient,input:RoutineInput){const payload=imageSchema.parse(obj(input.payload));const key=openAIKey();if(!key)throw httpError(503,'OpenAI image generation is not configured.');const actionRows=await prisma.$queryRawUnsafe<Array<{conversationId:string}>>(`SELECT "conversationId" FROM "ITAgentAction" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,input.auth.organizationId,input.actionId);const conversationId=actionRows[0]?.conversationId;if(!conversationId)throw httpError(404,'IT Agent action conversation was not found.');const response=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-image-2',prompt:`Create an original image for Sulandra Health internal/business use. ${payload.prompt}`,size:payload.size,quality:'medium',output_format:'png'}),signal:AbortSignal.timeout(180000)});const data=await response.json() as any;if(!response.ok)throw httpError(502,clean(data?.error?.message||`Image generation failed (${response.status})`,800));const base64=data?.data?.[0]?.b64_json;if(!base64)throw httpError(502,'Image generation returned no image data.');let fileName=safeFileName(payload.fileName,'sulandra-image.png');if(!fileName.toLowerCase().endsWith('.png'))fileName+='.png';const artifact=await storeArtifact(prisma,{auth:input.auth,conversationId,fileName,mimeType:'image/png',body:Buffer.from(base64,'base64'),sourceType:'GENERATED_IMAGE',purpose:'IT_AGENT_GENERATED_IMAGE'});return{...artifact,artifactId:artifact.id,message:`Created image “${artifact.fileName}”.`};}

export async function executeITAgentArtifactRoutineAction(prisma:PrismaClient,input:RoutineInput){if(input.actionType==='SEND_EXTERNAL_EMAIL')return sendExternalEmail(prisma,input);if(input.actionType==='CREATE_PDF')return createPdf(prisma,input);if(input.actionType==='GENERATE_IMAGE')return generateImage(prisma,input);throw httpError(409,`Action ${input.actionType} is not an IT Agent artifact routine action.`)}

export async function buildITAgentAttachmentContent(prisma:PrismaClient,input:{organizationId:string;conversationId:string;artifactIds:string[]}){
  await ensureSchema(prisma);const ids=[...new Set(input.artifactIds)].slice(0,8);if(!ids.length)return[] as Json[];const rows=await prisma.$queryRawUnsafe<ArtifactRow[]>(`SELECT * FROM "ITAgentArtifact" WHERE "organizationId"=$1 AND "conversationId"=$2 AND "id"=ANY($3::text[]) AND "status"='AVAILABLE' ORDER BY "createdAt"`,input.organizationId,input.conversationId,ids);if(rows.length!==ids.length)throw httpError(404,'One or more selected IT Agent attachments are unavailable for this conversation.');let total=0;const parts:Json[]=[];for(const row of rows){if(row.sizeBytes>maxAttachmentBytes())throw httpError(413,`Attachment ${row.fileName} exceeds the model-input size limit.`);total+=row.sizeBytes;if(total>35*1024*1024)throw httpError(413,'Selected attachments exceed the combined model-input size limit.');const body=await readArtifactBody(row);const ext=extensionOf(row.fileName);if(imageMimes.has(row.mimeType)){parts.push({type:'input_image',image_url:`data:${row.mimeType};base64,${body.toString('base64')}`,detail:'auto'});}else if(modelFileExtensions.has(ext)){parts.push({type:'input_file',filename:row.fileName,file_data:body.toString('base64')});}else{parts.push({type:'input_text',text:`Attachment available in Sulandra secure storage but not sent directly to the model: ${row.fileName} (${row.mimeType}, ${row.sizeBytes} bytes), artifact ${row.id}.`});}await logArtifactEvent(prisma,row.id,{userId:row.uploadedByUserId,organizationId:row.organizationId},'ATTACHED_TO_MODEL',{conversationId:row.conversationId});}return parts;
}

export function registerITAgentArtifactRoutes({app,prisma,authOf,requireRoles,adminRoles}:Dependencies){const gate=requireRoles(...adminRoles);
  app.post('/api/it-solutions/agent/artifacts/upload',gate,async(req,res,next)=>{try{const auth=authOf(res);const input=uploadSchema.parse(req.body);const conversationId=await ensureConversation(prisma,auth,input.conversationId);const fileName=safeFileName(input.fileName);const buffer=decodeBase64(input.fileDataBase64);const mimeType=validateFile(fileName,input.mimeType,buffer);const artifact=await storeArtifact(prisma,{auth,conversationId,fileName,mimeType,body:buffer,sourceType:'UPLOAD',purpose:input.purpose,scanUploaded:true});res.status(201).json({data:{...artifact,conversationId}})}catch(error){next(error)}});
  app.get('/api/it-solutions/agent/artifacts',gate,async(req,res,next)=>{try{const auth=authOf(res);await ensureSchema(prisma);const conversationId=clean(req.query.conversationId,120);if(!conversationId)return void res.json({data:{artifacts:[]}});const conversations=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "ITAgentConversation" WHERE "organizationId"=$1 AND "userId"=$2 AND "id"=$3 LIMIT 1`,auth.organizationId,auth.userId,conversationId);if(!conversations[0])return void res.status(404).json({error:'IT Agent conversation was not found.'});const rows=await prisma.$queryRawUnsafe<ArtifactRow[]>(`SELECT * FROM "ITAgentArtifact" WHERE "organizationId"=$1 AND "conversationId"=$2 AND "status"='AVAILABLE' ORDER BY "createdAt" DESC LIMIT 100`,auth.organizationId,conversationId);res.json({data:{artifacts:rows.map(row=>({id:row.id,fileName:row.fileName,mimeType:row.mimeType,sizeBytes:row.sizeBytes,sha256:row.sha256,scanStatus:row.scanStatus,sourceType:row.sourceType,status:row.status,createdAt:row.createdAt,url:`/api/it-solutions/agent/artifacts/${row.id}/content`,downloadUrl:`/api/it-solutions/agent/artifacts/${row.id}/content?download=1`}))}})}catch(error){next(error)}});
  app.get('/api/it-solutions/agent/artifacts/:artifactId/content',gate,async(req,res,next)=>{try{const auth=authOf(res);await ensureSchema(prisma);const row=await artifactRow(prisma,auth.organizationId,req.params.artifactId);if(!row)return void res.status(404).json({error:'IT Agent artifact was not found.'});const conversations=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "ITAgentConversation" WHERE "organizationId"=$1 AND "userId"=$2 AND "id"=$3 LIMIT 1`,auth.organizationId,auth.userId,row.conversationId);if(!conversations[0])return void res.status(404).json({error:'IT Agent artifact was not found.'});const body=await readArtifactBody(row);await logArtifactEvent(prisma,row.id,auth,'DOWNLOADED',{download:String(req.query.download||'')==='1'});const download=String(req.query.download||'')==='1'||!inlineMimes.has(row.mimeType);res.setHeader('Content-Type',row.mimeType||'application/octet-stream');res.setHeader('Content-Length',String(body.length));res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Disposition',`${download?'attachment':'inline'}; filename="${row.fileName.replace(/["\\]/g,'_')}"`);res.send(body)}catch(error){next(error)}});
  app.delete('/api/it-solutions/agent/artifacts/:artifactId',gate,async(req,res,next)=>{try{const auth=authOf(res);await ensureSchema(prisma);const row=await artifactRow(prisma,auth.organizationId,req.params.artifactId);if(!row)return void res.status(404).json({error:'IT Agent artifact was not found.'});const conversations=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "ITAgentConversation" WHERE "organizationId"=$1 AND "userId"=$2 AND "id"=$3 LIMIT 1`,auth.organizationId,auth.userId,row.conversationId);if(!conversations[0])return void res.status(404).json({error:'IT Agent artifact was not found.'});await deleteSecureObject(row.objectKey);await prisma.$executeRawUnsafe(`UPDATE "ITAgentArtifact" SET "status"='DELETED',"deletedAt"=NOW() WHERE "organizationId"=$1 AND "id"=$2`,auth.organizationId,row.id);await logArtifactEvent(prisma,row.id,auth,'DELETED');res.json({data:{id:row.id,status:'DELETED'}})}catch(error){next(error)}});
}
