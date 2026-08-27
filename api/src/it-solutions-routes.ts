import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;legalEntityId?:string|null;ipAddress?:string;userAgent?:string;sessionId?:string};
type Dependencies={app:Express;prisma:PrismaClient;authOf:(response:Response)=>AuthContext;requireRoles:(...roles:UserRole[])=>RequestHandler};

const adminRoles=[UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.HR_MANAGER,UserRole.CEO,UserRole.DOO];
const gateAll=(requireRoles:(...roles:UserRole[])=>RequestHandler)=>requireRoles(...(Object.values(UserRole) as UserRole[]));
const gateAdmin=(requireRoles:(...roles:UserRole[])=>RequestHandler)=>requireRoles(...adminRoles);

const consentSchema=z.object({ticketId:z.string().trim().min(1).max(120).optional(),shareScope:z.enum(['TAB','WINDOW','SCREEN']).default('TAB'),purpose:z.string().trim().min(3).max(500),consent:z.literal(true)});
const sessionUpdateSchema=z.object({status:z.enum(['ACTIVE','ENDED','REVOKED']),reason:z.string().trim().max(500).optional().default('')});
const screenshotSchema=z.object({sessionId:z.string().uuid(),ticketId:z.string().trim().min(1).max(120).optional(),name:z.string().trim().min(1).max(180),mimeType:z.enum(['image/png','image/jpeg','image/webp']),dataUrl:z.string().max(7_000_000).refine(v=>/^data:image\/(png|jpeg|webp);base64,/.test(v),'Screenshot must be an image data URL'),purpose:z.string().trim().min(3).max(500),consent:z.literal(true)});
const evidenceSchema=z.object({ticketId:z.string().trim().min(1).max(120),source:z.enum(['WORKFLOW','BROWSER','API','GITHUB','RAILWAY','INTEGRATION','SECURITY','REMOTE_ASSIST','OTHER']),application:z.string().trim().max(160).optional(),page:z.string().trim().max(240).optional(),workflow:z.string().trim().max(240).optional(),step:z.string().trim().max(240).optional(),action:z.string().trim().max(240).optional(),outcome:z.string().trim().max(240).optional(),statusCode:z.number().int().min(100).max(599).optional(),correlationId:z.string().trim().max(240).optional(),detail:z.string().trim().max(4000).optional()});
const approvalSchema=z.object({ticketId:z.string().trim().min(1).max(120),actionType:z.string().trim().min(3).max(160),summary:z.string().trim().min(5).max(3000),risk:z.enum(['LOW','MEDIUM','HIGH','CRITICAL']),requiresApproval:z.boolean().default(true)});
const approvalDecisionSchema=z.object({decision:z.enum(['APPROVED','DENIED']),note:z.string().trim().max(3000).optional().default('')});

const redact=(value:string)=>value
  .replace(/\bBearer\s+[A-Za-z0-9._~-]{12,}\b/gi,'Bearer [REDACTED_TOKEN]')
  .replace(/\b(api[_ -]?key|access[_ -]?token|secret|password|mfa|otp)\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]')
  .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g,'[REDACTED_KEY]')
  .replace(/\b\d{3}-\d{2}-\d{4}\b/g,'[REDACTED_SSN]');

export function registerITSolutionsRoutes({app,prisma,authOf,requireRoles}:Dependencies){
  let readyPromise:Promise<void>|null=null;
  const ready=()=>readyPromise??=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITRemoteAssistSession" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT,"employeeId" TEXT NOT NULL,"ticketId" TEXT,"shareScope" TEXT NOT NULL,"purpose" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'ACTIVE',"consentedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"endedAt" TIMESTAMPTZ,"endedReason" TEXT NOT NULL DEFAULT '',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITRemoteAssistSession_owner_idx" ON "ITRemoteAssistSession"("organizationId","employeeId","status","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITDiagnosticEvidence" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT,"ticketId" TEXT NOT NULL,"actorUserId" TEXT NOT NULL,"source" TEXT NOT NULL,"application" TEXT,"page" TEXT,"workflow" TEXT,"step" TEXT,"action" TEXT,"outcome" TEXT,"statusCode" INTEGER,"correlationId" TEXT,"detail" TEXT NOT NULL DEFAULT '',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITDiagnosticEvidence_ticket_idx" ON "ITDiagnosticEvidence"("organizationId","ticketId","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITSupportScreenshot" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT,"employeeId" TEXT NOT NULL,"ticketId" TEXT,"remoteSessionId" TEXT NOT NULL,"name" TEXT NOT NULL,"mimeType" TEXT NOT NULL,"dataUrl" TEXT NOT NULL,"purpose" TEXT NOT NULL,"consentedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITSupportScreenshot_ticket_idx" ON "ITSupportScreenshot"("organizationId","ticketId","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITRemediationApproval" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT,"ticketId" TEXT NOT NULL,"requestedByUserId" TEXT NOT NULL,"actionType" TEXT NOT NULL,"summary" TEXT NOT NULL,"risk" TEXT NOT NULL,"requiresApproval" BOOLEAN NOT NULL DEFAULT TRUE,"status" TEXT NOT NULL DEFAULT 'PENDING',"decidedByUserId" TEXT,"decisionNote" TEXT NOT NULL DEFAULT '',"decidedAt" TIMESTAMPTZ,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ITRemediationApproval_queue_idx" ON "ITRemediationApproval"("organizationId","status","risk","createdAt" DESC)`);
  })().catch(error=>{readyPromise=null;throw error});

  const all=gateAll(requireRoles); const admin=gateAdmin(requireRoles);

  app.get('/api/it-solutions/overview',admin,async(_req,res,next)=>{try{await ready();const auth=authOf(res);const [tickets,sessions,approvals]=await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT "status","priority",COUNT(*)::int AS count FROM "EmployeeSupportRequest" WHERE "organizationId"=$1 GROUP BY "status","priority"`,auth.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT "status",COUNT(*)::int AS count FROM "ITRemoteAssistSession" WHERE "organizationId"=$1 GROUP BY "status"`,auth.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT "status","risk",COUNT(*)::int AS count FROM "ITRemediationApproval" WHERE "organizationId"=$1 GROUP BY "status","risk"`,auth.organizationId)
  ]);res.json({data:{tickets,sessions,approvals}})}catch(error){next(error)}});

  app.post('/api/it-solutions/remote-assist/sessions',all,async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=consentSchema.parse(req.body);const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "ITRemoteAssistSession" ("id","organizationId","legalEntityId","employeeId","ticketId","shareScope","purpose") VALUES ($1,$2,$3,$4,$5,$6,$7)`,id,auth.organizationId,auth.legalEntityId??null,auth.userId,input.ticketId??null,input.shareScope,redact(input.purpose));res.status(201).json({data:{id,status:'ACTIVE',shareScope:input.shareScope,consentRequired:true,employeeCanStop:true}})}catch(error){next(error)}});

  app.patch('/api/it-solutions/remote-assist/sessions/:sessionId',all,async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=sessionUpdateSchema.parse(req.body);await prisma.$executeRawUnsafe(`UPDATE "ITRemoteAssistSession" SET "status"=$1,"endedAt"=CASE WHEN $1='ACTIVE' THEN NULL ELSE NOW() END,"endedReason"=$2,"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4 AND ("employeeId"=$5 OR $6::boolean=TRUE)`,input.status,redact(input.reason),auth.organizationId,req.params.sessionId,auth.userId,adminRoles.includes(auth.role));res.json({data:{id:req.params.sessionId,status:input.status}})}catch(error){next(error)}});

  app.post('/api/it-solutions/screenshots',all,async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=screenshotSchema.parse(req.body);const sessions=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ITRemoteAssistSession" WHERE "organizationId"=$1 AND "id"=$2 AND "employeeId"=$3 AND "status"='ACTIVE' LIMIT 1`,auth.organizationId,input.sessionId,auth.userId);if(!sessions.length)return void res.status(403).json({error:'An active employee-consented remote-assistance session is required'});const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "ITSupportScreenshot" ("id","organizationId","legalEntityId","employeeId","ticketId","remoteSessionId","name","mimeType","dataUrl","purpose") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,id,auth.organizationId,auth.legalEntityId??null,auth.userId,input.ticketId??sessions[0].ticketId??null,input.sessionId,input.name,input.mimeType,input.dataUrl,redact(input.purpose));res.status(201).json({data:{id,sessionId:input.sessionId,consented:true}})}catch(error){next(error)}});

  app.post('/api/it-solutions/evidence',all,async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=evidenceSchema.parse(req.body);const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "ITDiagnosticEvidence" ("id","organizationId","legalEntityId","ticketId","actorUserId","source","application","page","workflow","step","action","outcome","statusCode","correlationId","detail") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,id,auth.organizationId,auth.legalEntityId??null,input.ticketId,auth.userId,input.source,input.application??null,input.page??null,input.workflow??null,input.step??null,input.action??null,input.outcome??null,input.statusCode??null,input.correlationId??null,redact(input.detail??''));res.status(201).json({data:{id}})}catch(error){next(error)}});

  app.get('/api/it-solutions/tickets/:ticketId/evidence',admin,async(req,res,next)=>{try{await ready();const auth=authOf(res);const [evidence,screenshots]=await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ITDiagnosticEvidence" WHERE "organizationId"=$1 AND "ticketId"=$2 ORDER BY "createdAt" DESC LIMIT 500`,auth.organizationId,req.params.ticketId),
    prisma.$queryRawUnsafe<any[]>(`SELECT "id","employeeId","ticketId","remoteSessionId","name","mimeType","purpose","consentedAt","createdAt" FROM "ITSupportScreenshot" WHERE "organizationId"=$1 AND "ticketId"=$2 ORDER BY "createdAt" DESC LIMIT 100`,auth.organizationId,req.params.ticketId)
  ]);res.json({data:{evidence,screenshots}})}catch(error){next(error)}});

  app.post('/api/it-solutions/remediations',admin,async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=approvalSchema.parse(req.body);const id=randomUUID();const status=input.requiresApproval?'PENDING':'APPROVED';await prisma.$executeRawUnsafe(`INSERT INTO "ITRemediationApproval" ("id","organizationId","legalEntityId","ticketId","requestedByUserId","actionType","summary","risk","requiresApproval","status") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,id,auth.organizationId,auth.legalEntityId??null,input.ticketId,auth.userId,input.actionType,redact(input.summary),input.risk,input.requiresApproval,status);res.status(201).json({data:{id,status}})}catch(error){next(error)}});

  app.patch('/api/it-solutions/remediations/:approvalId',admin,async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=approvalDecisionSchema.parse(req.body);await prisma.$executeRawUnsafe(`UPDATE "ITRemediationApproval" SET "status"=$1,"decidedByUserId"=$2,"decisionNote"=$3,"decidedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=$4 AND "id"=$5 AND "status"='PENDING'`,input.decision,auth.userId,redact(input.note),auth.organizationId,req.params.approvalId);res.json({data:{id:req.params.approvalId,status:input.decision}})}catch(error){next(error)}});
}
