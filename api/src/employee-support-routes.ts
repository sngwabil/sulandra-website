import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;ipAddress?:string;userAgent?:string;sessionId?:string};
type Dependencies={app:Express;prisma:PrismaClient;authOf:(response:Response)=>AuthContext;requireRoles:(...roles:UserRole[])=>RequestHandler};

const createSchema=z.object({category:z.enum(['ACCOUNT','PASSWORD','MFA','PORTAL','DEVICE','NETWORK','SCHEDULING','PAYROLL','BENEFITS','DOCUMENTS','TRAINING','OTHER']).default('OTHER'),subject:z.string().trim().min(3).max(240),description:z.string().trim().min(5).max(12000),priority:z.enum(['LOW','NORMAL','HIGH','URGENT']).default('NORMAL')});
const updateSchema=z.object({status:z.enum(['OPEN','IN_PROGRESS','WAITING_ON_EMPLOYEE','RESOLVED','CLOSED']),resolution:z.string().trim().max(8000).optional().default('')});

export function registerEmployeeSupportRoutes({app,prisma,authOf,requireRoles}:Dependencies){
  let readyPromise:Promise<void>|null=null;
  const ready=()=>readyPromise??=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeSupportRequest" ("id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"category" TEXT NOT NULL,"subject" TEXT NOT NULL,"description" TEXT NOT NULL,"priority" TEXT NOT NULL DEFAULT 'NORMAL',"status" TEXT NOT NULL DEFAULT 'OPEN',"resolution" TEXT NOT NULL DEFAULT '',"assignedToUserId" TEXT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"resolvedAt" TIMESTAMPTZ)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeSupportRequest_employee_idx" ON "EmployeeSupportRequest"("organizationId","employeeId","status","createdAt" DESC)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeSupportRequest_admin_idx" ON "EmployeeSupportRequest"("organizationId","status","priority","createdAt" DESC)`);
  })().catch(error=>{readyPromise=null;throw error});

  app.get('/api/employee/me/support',async(_req,res,next)=>{try{await ready();const auth=authOf(res);const requests=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeSupportRequest" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC LIMIT 200`,auth.organizationId,auth.userId);res.json({data:{requests,metrics:{open:requests.filter(r=>!['RESOLVED','CLOSED'].includes(r.status)).length,resolved:requests.filter(r=>['RESOLVED','CLOSED'].includes(r.status)).length}}})}catch(error){next(error)}});

  app.post('/api/employee/me/support',async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=createSchema.parse(req.body);const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeSupportRequest" ("id","organizationId","employeeId","category","subject","description","priority") VALUES ($1,$2,$3,$4,$5,$6,$7)`,id,auth.organizationId,auth.userId,input.category,input.subject,input.description,input.priority);res.status(201).json({data:{id,status:'OPEN'}})}catch(error){next(error)}});

  app.post('/api/employee/me/security/revoke-other-sessions',async(_req,res,next)=>{try{await ready();const auth=authOf(res);await prisma.$executeRawUnsafe(`UPDATE "EmployeeAuthSession" SET "revokedAt"=NOW(),"revokedById"=$1,"revocationReason"='Employee revoked other active sessions' WHERE "organizationId"=$2 AND "userId"=$1 AND "revokedAt" IS NULL AND ($3::text IS NULL OR "id"<>$3)`,auth.userId,auth.organizationId,auth.sessionId??null);res.json({data:{revoked:true}})}catch(error){next(error)}});

  const gate=requireRoles(UserRole.ADMINISTRATOR,UserRole.HR_MANAGER,UserRole.CEO,UserRole.COO);
  app.get('/api/admin/employee-support',gate,async(_req,res,next)=>{try{await ready();const auth=authOf(res);const requests=await prisma.$queryRawUnsafe<any[]>(`SELECT r.*,COALESCE(NULLIF(p."displayName",''),NULLIF(c."displayName",''),u."email",r."employeeId") AS "employeeName",u."email" AS "employeeEmail" FROM "EmployeeSupportRequest" r LEFT JOIN "User" u ON u."id"=r."employeeId" AND u."organizationId"=r."organizationId" LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=r."employeeId" AND p."organizationId"=r."organizationId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=r."employeeId" WHERE r."organizationId"=$1 ORDER BY CASE r."priority" WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,r."createdAt" DESC LIMIT 500`,auth.organizationId);res.json({data:{requests}})}catch(error){next(error)}});

  app.patch('/api/admin/employee-support/:requestId',gate,async(req,res,next)=>{try{await ready();const auth=authOf(res);const input=updateSchema.parse(req.body);await prisma.$executeRawUnsafe(`UPDATE "EmployeeSupportRequest" SET "status"=$1,"resolution"=$2,"assignedToUserId"=COALESCE("assignedToUserId",$3),"resolvedAt"=CASE WHEN $1 IN ('RESOLVED','CLOSED') THEN COALESCE("resolvedAt",NOW()) ELSE NULL END,"updatedAt"=NOW() WHERE "organizationId"=$4 AND "id"=$5`,input.status,input.resolution,auth.userId,auth.organizationId,req.params.requestId);res.json({data:{id:req.params.requestId,status:input.status}})}catch(error){next(error)}});
}
