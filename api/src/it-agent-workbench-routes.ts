import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';
import { putSecureObject, scanBufferForMalware } from './secure-object-storage.js';
import { probeITCodingWorker, runApprovedITCodingWorker } from './it-coding-worker.js';
import { getITSpecialistKnowledgeContext } from './it-specialist-knowledge.js';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer') as typeof import('nodemailer');

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;legalEntityId?:string|null};
type Dependencies={app:Express;prisma:PrismaClient;authOf:(response:Response)=>AuthContext;requireRoles:(...roles:UserRole[])=>RequestHandler};
type AgentActionType='PUBLISH_INTRAnet_CONTENT'|'GENERATE_INTRAnet_MEME'|'SEND_ANNOUNCEMENT'|'SEND_NOTIFICATION'|'SEND_EMAIL'|'REQUEST_CODE_CHANGE';
// ... existing unchanged types/helpers omitted for brevity in this replacement context

const adminRoles=[UserRole.ADMINISTRATOR,UserRole.CEO,UserRole.DOO,UserRole.COO,UserRole.HR_MANAGER] as const;
const chatSchema=z.object({conversationId:z.string().uuid().optional(),message:z.string().trim().min(1).max(12000)});
const actionDecisionSchema=z.object({note:z.string().trim().max(2000).optional().default('')});
const uploadSchema=z.object({conversationId:z.string().uuid(),fileName:z.string().trim().min(1).max(200),mimeType:z.string().trim().min(1).max(120),fileDataBase64:z.string().min(1),purpose:z.string().trim().max(240).optional().default('IT_AGENT_ATTACHMENT')});
const externalEmailSchema=z.object({conversationId:z.string().uuid().optional(),subject:z.string().trim().min(1).max(240),message:z.string().trim().min(1).max(12000),recipients:z.array(z.string().trim().email().max(320)).min(1).max(100)});
const allowedUploadTypes=new Set(['application/pdf','text/plain','text/csv','application/json','image/png','image/jpeg','image/webp','application/zip']);
const maxUploadBytes=Math.max(1024,Number(process.env.IT_AGENT_UPLOAD_MAX_BYTES||10*1024*1024));

const clean=(value:unknown,max=12000)=>String(value??'').trim().slice(0,max);
const httpError=(status:number,message:string,details?:unknown)=>Object.assign(new Error(message),{status,details});
const obj=(value:unknown):Record<string,unknown>=>{if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>;if(typeof value==='string'){try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}}return{}};

function normalizeEmail(v:string){return clean(v,320).toLowerCase();}
function maskEmail(v:string){const [u,d]=normalizeEmail(v).split('@');if(!u||!d)return '[invalid]';return `${u.slice(0,2)}***@${d}`;}

async function sendMail(recipients:string[],subject:string,message:string){
  const host=process.env.SMTP_HOST;const port=Number(process.env.SMTP_PORT||587);const user=process.env.SMTP_USER;const pass=process.env.SMTP_PASS;
  if(!host||!user||!pass)throw httpError(503,'Sulandra SMTP is not configured on this API deployment.');
  if(!recipients.length)throw httpError(409,'No eligible email recipients were found.');
  const transporter=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});
  const info=await transporter.sendMail({from:{name:'Sulandra Health IT Solutions',address:(process.env.FROM_EMAIL||process.env.SMTP_FROM||user).trim()},replyTo:user.trim(),to:recipients,subject:clean(subject,240),text:clean(message,12000)});
  return {messageId:info.messageId||'',accepted:Array.isArray(info.accepted)?info.accepted.length:0,rejected:Array.isArray(info.rejected)?info.rejected.length:0};
}

export function registerITAgentWorkbenchRoutes({app,prisma,authOf,requireRoles}:Dependencies){
  const gate=requireRoles(...adminRoles);
  let init:Promise<void>|null=null;
  const ready=()=>init??=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentConversation" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"userId" TEXT NOT NULL,"title" TEXT NOT NULL DEFAULT 'IT Agent session',"status" TEXT NOT NULL DEFAULT 'OPEN',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentAction" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"conversationId" TEXT NOT NULL,"requestedByUserId" TEXT NOT NULL,"actionType" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'PROPOSED',"risk" TEXT NOT NULL,"changeClass" TEXT NOT NULL,"approvalRequired" BOOLEAN NOT NULL DEFAULT FALSE,"summary" TEXT NOT NULL,"payload" JSONB NOT NULL DEFAULT '{}'::jsonb,"result" JSONB NOT NULL DEFAULT '{}'::jsonb,"executedByUserId" TEXT,"executedAt" TIMESTAMPTZ,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentAttachment" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"conversationId" TEXT NOT NULL,"uploadedByUserId" TEXT NOT NULL,"fileName" TEXT NOT NULL,"mimeType" TEXT NOT NULL,"sizeBytes" INTEGER NOT NULL,"sha256" TEXT NOT NULL,"storageKey" TEXT NOT NULL,"scanStatus" TEXT NOT NULL DEFAULT 'UNAVAILABLE',"scanEngine" TEXT,"scanSignature" TEXT,"scanDetail" TEXT,"status" TEXT NOT NULL DEFAULT 'AVAILABLE',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITAgentAttachment_conversation_idx" ON "ITAgentAttachment"("organizationId","conversationId","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentExternalEmailEvent" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"conversationId" TEXT,"actionId" TEXT,"actorUserId" TEXT NOT NULL,"subject" TEXT NOT NULL,"recipientCount" INTEGER NOT NULL,"recipientsMasked" JSONB NOT NULL DEFAULT '[]'::jsonb,"deliveryStatus" TEXT NOT NULL,"providerMessageId" TEXT,"acceptedCount" INTEGER NOT NULL DEFAULT 0,"rejectedCount" INTEGER NOT NULL DEFAULT 0,"detail" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITAgentAbuseGuard" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"actorUserId" TEXT NOT NULL,"guardType" TEXT NOT NULL,"windowStart" TIMESTAMPTZ NOT NULL,"windowEnd" TIMESTAMPTZ NOT NULL,"count" INTEGER NOT NULL DEFAULT 0,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  })().catch(error=>{init=null;throw error});

  const ownedConversation=async(auth:AuthContext,id:string)=>{const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ITAgentConversation" WHERE "organizationId"=$1 AND "userId"=$2 AND "id"=$3 LIMIT 1`,auth.organizationId,auth.userId,id);return rows[0]||null};

  app.post('/api/it-solutions/agent/upload',gate,async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=uploadSchema.parse(req.body);const conversation=await ownedConversation(auth,input.conversationId);if(!conversation)return void res.status(404).json({error:'IT Agent conversation was not found'});
    const mime=clean(input.mimeType,120).toLowerCase();if(!allowedUploadTypes.has(mime))throw httpError(415,'Unsupported file type for IT Agent attachment');
    const buffer=Buffer.from(input.fileDataBase64,'base64');if(!buffer.length)throw httpError(400,'Attachment payload is empty');if(buffer.length>maxUploadBytes)throw httpError(413,`Attachment exceeds limit (${maxUploadBytes} bytes)`);
    const scan=await scanBufferForMalware(buffer);if(scan.status==='INFECTED')throw httpError(422,'Attachment blocked by malware scan',{engine:scan.engine,signature:scan.signature});
    const attachmentId=randomUUID();const storageKey=`it-agent/${auth.organizationId}/${input.conversationId}/${attachmentId}-${Date.now()}-${clean(input.fileName,120).replace(/[^A-Za-z0-9._-]/g,'_')}`;
    const stored=await putSecureObject({key:storageKey,body:buffer,contentType:mime,metadata:{purpose:'it-agent-attachment',conversationId:input.conversationId,uploadedBy:auth.userId}});
    const status=scan.status==='UNAVAILABLE'?'QUARANTINED':'AVAILABLE';
    await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentAttachment" ("id","organizationId","conversationId","uploadedByUserId","fileName","mimeType","sizeBytes","sha256","storageKey","scanStatus","scanEngine","scanSignature","scanDetail","status") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,attachmentId,auth.organizationId,input.conversationId,auth.userId,clean(input.fileName,200),mime,buffer.length,stored.sha256,storageKey,scan.status,scan.engine,scan.signature,scan.detail,status);
    await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentMessage" ("id","organizationId","conversationId","userId","role","content") VALUES ($1,$2,$3,$4,'assistant',$5)`,randomUUID(),auth.organizationId,input.conversationId,auth.userId,`Attachment received: ${clean(input.fileName,200)} (${buffer.length} bytes). Reference: ATTACH:${attachmentId}. Status: ${status}.`);
    res.status(201).json({data:{attachmentId,reference:`ATTACH:${attachmentId}`,fileName:clean(input.fileName,200),mimeType:mime,sizeBytes:buffer.length,scanStatus:scan.status,status}});
  }catch(error){next(error)}});

  app.post('/api/it-solutions/agent/email/external',gate,async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=externalEmailSchema.parse(req.body);
    const recipients=[...new Set(input.recipients.map(normalizeEmail))].filter(Boolean);if(!recipients.length)throw httpError(400,'At least one valid recipient is required');
    const windowStart=new Date(Date.now()-60*60*1000);const countRows=await prisma.$queryRawUnsafe<Array<{count:number}>>(`SELECT COUNT(*)::int AS count FROM "ITAgentExternalEmailEvent" WHERE "organizationId"=$1 AND "actorUserId"=$2 AND "createdAt">=$3`,auth.organizationId,auth.userId,windowStart);const sentInWindow=Number(countRows[0]?.count||0);const limit=Math.max(1,Number(process.env.IT_AGENT_EXTERNAL_EMAILS_PER_HOUR||20));if(sentInWindow>=limit)throw httpError(429,'External email rate limit exceeded for this administrator');
    const delivery=await sendMail(recipients,input.subject,input.message);
    const eventId=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "ITAgentExternalEmailEvent" ("id","organizationId","conversationId","actorUserId","subject","recipientCount","recipientsMasked","deliveryStatus","providerMessageId","acceptedCount","rejectedCount","detail") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'SENT',$8,$9,$10,$11::jsonb)`,eventId,auth.organizationId,input.conversationId||null,auth.userId,clean(input.subject,240),recipients.length,JSON.stringify(recipients.map(maskEmail)),clean(delivery.messageId,320),delivery.accepted,delivery.rejected,JSON.stringify({source:'IT_AGENT_EXTERNAL_EMAIL'}));
    res.status(201).json({data:{eventId,deliveryStatus:'SENT',recipientCount:recipients.length,acceptedCount:delivery.accepted,rejectedCount:delivery.rejected}});
  }catch(error){next(error)}});
}
