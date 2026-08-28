import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ensureITSpecialistSchema, enqueueITSpecialistTicket } from './it-specialist-autonomy.js';

type Json=Record<string,unknown>;
type BaseInput={organizationId:string;userId:string;conversationId?:string|null;actionId?:string|null};
type EngineeringInput=BaseInput&{summary:string;request:string;target:string;reason:string};
type FailureInput=BaseInput&{request:string;error:string};

const clean=(value:unknown,max=12000)=>String(value??'').trim().slice(0,max);
const redact=(value:string)=>clean(value,12000)
  .replace(/\bBearer\s+[A-Za-z0-9._~-]{12,}\b/gi,'Bearer [REDACTED_TOKEN]')
  .replace(/\b(api[_ -]?key|access[_ -]?token|secret|password|mfa|otp)\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]')
  .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g,'[REDACTED_KEY]')
  .replace(/\b\d{3}-\d{2}-\d{4}\b/g,'[REDACTED_SSN]');

async function ensureSupportFoundation(prisma:PrismaClient){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeSupportRequest" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"category" TEXT NOT NULL,"subject" TEXT NOT NULL,"description" TEXT NOT NULL,"priority" TEXT NOT NULL DEFAULT 'NORMAL',"status" TEXT NOT NULL DEFAULT 'OPEN',"resolution" TEXT NOT NULL DEFAULT '',"assignedToUserId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"resolvedAt" TIMESTAMPTZ)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeSupportRequest_employee_idx" ON "EmployeeSupportRequest"("organizationId","employeeId","status","createdAt" DESC)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeSupportRequest_admin_idx" ON "EmployeeSupportRequest"("organizationId","status","priority","createdAt" DESC)`);
  await ensureITSpecialistSchema(prisma);
}

async function resolveConversation(prisma:PrismaClient,input:BaseInput){
  if(input.conversationId)return input.conversationId;
  const rows=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "ITAgentConversation" WHERE "organizationId"=$1 AND "userId"=$2 ORDER BY "updatedAt" DESC LIMIT 1`,input.organizationId,input.userId).catch(()=>[]);
  return rows[0]?.id||null;
}

async function openSpecialistTicket(prisma:PrismaClient,input:BaseInput&{category:string;subject:string;description:string;priority:string;sourceMessage:string;ownerNote?:string}){
  await ensureSupportFoundation(prisma);const conversationId=await resolveConversation(prisma,input),ticketId=randomUUID();
  await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeSupportRequest" ("id","organizationId","employeeId","category","subject","description","priority","status","assignedToUserId") VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',$3)`,ticketId,input.organizationId,input.userId,input.category,clean(input.subject,240),redact(input.description),input.priority);
  const queued=await enqueueITSpecialistTicket(prisma,{organizationId:input.organizationId,ticketId,employeeId:input.userId,conversationId});
  await prisma.$executeRawUnsafe(`INSERT INTO "ITSpecialistMessage" ("id","organizationId","ticketId","ticketNumber","conversationId","employeeId","direction","content") VALUES ($1,$2,$3,$4,$5,$6,'EMPLOYEE_TO_IT',$7)`,randomUUID(),input.organizationId,ticketId,queued.ticketNumber,conversationId,input.userId,redact(input.sourceMessage));
  if(input.ownerNote)await prisma.$executeRawUnsafe(`UPDATE "ITSpecialistQueue" SET "ownerNote"=$1,"nextRunAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=$2 AND "ticketId"=$3`,clean(input.ownerNote,4000),input.organizationId,ticketId);
  return{ticketId,ticketNumber:queued.ticketNumber,conversationId,status:'OPEN'};
}

async function updateAction(prisma:PrismaClient,input:BaseInput,status:string,result:Json){
  if(!input.actionId)return;
  await prisma.$executeRawUnsafe(`UPDATE "ITAgentAction" SET "status"=$1,"result"=$2::jsonb,"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4`,status,JSON.stringify(result),input.organizationId,input.actionId).catch(()=>{});
}

export async function submitITAgentEngineeringRequest(prisma:PrismaClient,input:EngineeringInput){
  const ticket=await openSpecialistTicket(prisma,{...input,category:'OTHER',subject:clean(input.summary||'Sulandra system change request',240),description:`Authenticated Admin IT Agent engineering request.\n\nRequested change: ${redact(input.request)}\nTarget: ${redact(input.target)}\nReason: ${redact(input.reason)}`,priority:'HIGH',sourceMessage:`ADMIN_IT_AGENT_ENGINEERING_REQUEST\nSummary: ${redact(input.summary)}\nRequest: ${redact(input.request)}\nTarget: ${redact(input.target)}\nReason: ${redact(input.reason)}`,ownerNote:'This request came from the authenticated Admin IT Agent. Determine whether it restores approved behavior or creates a major/new change. Established LOW/MEDIUM-risk repairs may proceed autonomously after gates. Major/new/security/permission/data-meaning changes require owner approval.'});
  const result={...ticket,message:`Engineering request accepted as ${ticket.ticketNumber}. Sulandra IT is analyzing the current code and approved work now. If this is an established-operation repair it can proceed automatically after validation; only a major or materially new change will stop for owner approval.`};await updateAction(prisma,input,'IN_PROGRESS',result);return result;
}

export async function reportITAgentRuntimeFailure(prisma:PrismaClient,input:FailureInput){
  await ensureSupportFoundation(prisma);const conversationId=await resolveConversation(prisma,input);
  const recent=await prisma.$queryRawUnsafe<Array<{id:string;ticketNumber:string|null}>>(`SELECT "id","ticketNumber" FROM "EmployeeSupportRequest" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "subject"='IT Agent runtime failure' AND "status" NOT IN ('RESOLVED','CLOSED') AND "createdAt">NOW()-INTERVAL '15 minutes' ORDER BY "createdAt" DESC LIMIT 1`,input.organizationId,input.userId).catch(()=>[]);
  let ticket:{ticketId:string;ticketNumber:string;conversationId:string|null;status:string};
  if(recent[0]){
    const queued=await enqueueITSpecialistTicket(prisma,{organizationId:input.organizationId,ticketId:recent[0].id,employeeId:input.userId,conversationId});ticket={ticketId:recent[0].id,ticketNumber:queued.ticketNumber,conversationId,status:'OPEN'};
    await prisma.$executeRawUnsafe(`INSERT INTO "ITSpecialistMessage" ("id","organizationId","ticketId","ticketNumber","conversationId","employeeId","direction","content") VALUES ($1,$2,$3,$4,$5,$6,'EMPLOYEE_TO_IT',$7)`,randomUUID(),input.organizationId,ticket.ticketId,ticket.ticketNumber,conversationId,input.userId,redact(`ADMIN_IT_AGENT_RUNTIME_FAILURE\nRequest: ${input.request}\nError: ${input.error}`));
  }else ticket=await openSpecialistTicket(prisma,{...input,conversationId,category:'PORTAL',subject:'IT Agent runtime failure',description:`The Admin IT Agent encountered an internal runtime failure while carrying out an authorized request.\n\nRequest: ${redact(input.request)}\nError: ${redact(input.error)}`,priority:'HIGH',sourceMessage:`ADMIN_IT_AGENT_RUNTIME_FAILURE\nRequest: ${redact(input.request)}\nError: ${redact(input.error)}`,ownerNote:'This is an internal IT Agent failure. Diagnose it as a Sulandra system incident. Repair automatically only when current code/merged work proves the intended behavior and the established-operation safety contract is satisfied; otherwise keep the ticket active and escalate appropriately.'});
  await prisma.$executeRawUnsafe(`INSERT INTO "ITDiagnosticEvidence" ("id","organizationId","ticketId","source","application","page","workflow","step","action","outcome","detail") VALUES ($1,$2,$3,'IT_AGENT_RUNTIME','IT Solutions','it-solutions.html','Admin IT Agent','command execution','PROCESS_ADMIN_COMMAND','ERROR',$4)`,randomUUID(),input.organizationId,ticket.ticketId,redact(input.error)).catch(()=>{});
  const result={...ticket,message:`Sulandra IT detected its own runtime problem and opened ${ticket.ticketNumber}. The specialist is diagnosing it automatically; this conversation and request remain active instead of ending at the error.`};await updateAction(prisma,input,'RETRYING',result);return result;
}
