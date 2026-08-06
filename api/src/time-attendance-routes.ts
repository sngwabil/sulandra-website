import type { Express, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext = { userId:string; organizationId:string; role:UserRole; email?:string };
type RouteDependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
};

const requestSchema=z.object({
  type:z.enum(['TIME_OFF','AVAILABILITY','SHIFT_TRADE','CLOCK_CORRECTION']),
  startAt:z.coerce.date(),
  endAt:z.coerce.date(),
  reason:z.string().trim().max(2000).optional().default(''),
}).refine(v=>v.endAt>v.startAt,{message:'End must be after start'});

const shiftSchema=z.object({
  employeeId:z.string().trim().nullable().optional(),
  startTime:z.coerce.date(),
  endTime:z.coerce.date(),
  code:z.string().trim().min(1).max(30),
  department:z.string().trim().max(120).optional().default(''),
  location:z.string().trim().max(200).optional().default(''),
  notes:z.string().trim().max(2000).optional().default(''),
  clientId:z.string().trim().nullable().optional(),
  payCode:z.string().trim().max(40).optional().default('REG'),
  repeatWeeks:z.number().int().min(1).max(52).optional().default(1),
}).refine(v=>v.endTime>v.startTime,{message:'End must be after start'});

const ensureSchema=async(prisma:PrismaClient)=>{
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceShift" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT,
    "startTime" TIMESTAMPTZ NOT NULL,"endTime" TIMESTAMPTZ NOT NULL,"code" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT '',"location" TEXT NOT NULL DEFAULT '',"notes" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,"payCode" TEXT NOT NULL DEFAULT 'REG',"status" TEXT NOT NULL DEFAULT 'DRAFT',"createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "clientId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "payCode" TEXT NOT NULL DEFAULT 'REG'`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimeAttendanceShift_org_start_idx" ON "TimeAttendanceShift"("organizationId","startTime")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceClockEntry" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,
    "clockIn" TIMESTAMPTZ NOT NULL,"clockOut" TIMESTAMPTZ,"source" TEXT NOT NULL DEFAULT 'PORTAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',"notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TimeAttendanceClockEntry_one_open" ON "TimeAttendanceClockEntry"("organizationId","employeeId") WHERE "clockOut" IS NULL`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceRequest" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"type" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,"endAt" TIMESTAMPTZ NOT NULL,"reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',"reviewedById" TEXT,"reviewedAt" TIMESTAMPTZ,"reviewNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimeAttendanceRequest_org_status_idx" ON "TimeAttendanceRequest"("organizationId","status")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceAudit" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"actorId" TEXT NOT NULL,"action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,"resourceId" TEXT,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
};

export const registerTimeAttendanceRoutes=({app,prisma,authOf,requireRoles}:RouteDependencies)=>{
  let schemaReady:Promise<void>|null=null;
  const ready=()=>schemaReady??=(ensureSchema(prisma).catch(error=>{schemaReady=null;throw error;}));
  const admin=requireRoles(UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.HR_MANAGER,UserRole.SCHEDULER,UserRole.CEO,UserRole.COO);
  const log=async(a:AuthContext,action:string,resourceType:string,resourceId?:string,details:object={})=>{
    await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceAudit" ("id","organizationId","actorId","action","resourceType","resourceId","details") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,randomUUID(),a.organizationId,a.userId,action,resourceType,resourceId||null,JSON.stringify(details));
  };

  app.get('/api/time-attendance/clock/status',async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockOut" IS NULL ORDER BY "clockIn" DESC LIMIT 1`,a.organizationId,a.userId);res.json({data:{clockedIn:Boolean(rows[0]),...(rows[0]||{})}})}catch(e){next(e)}});
  app.post('/api/time-attendance/clock/in',async(req,res,next)=>{try{await ready();const a=authOf(res);const open=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockOut" IS NULL LIMIT 1`,a.organizationId,a.userId);if(open[0])return res.status(409).json({error:'You are already clocked in'});const id=randomUUID();const source=typeof req.body?.source==='string'?req.body.source.slice(0,40):'PORTAL';await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceClockEntry" ("id","organizationId","employeeId","clockIn","source") VALUES ($1,$2,$3,NOW(),$4)`,id,a.organizationId,a.userId,source);await log(a,'CLOCK_IN','CLOCK_ENTRY',id,{source});const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceClockEntry" WHERE "id"=$1`,id);res.status(201).json({data:rows[0]})}catch(e){next(e)}});
  app.post('/api/time-attendance/clock/out',async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE "TimeAttendanceClockEntry" SET "clockOut"=NOW(),"status"='COMPLETED',"updatedAt"=NOW() WHERE "id"=(SELECT "id" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockOut" IS NULL ORDER BY "clockIn" DESC LIMIT 1) RETURNING *`,a.organizationId,a.userId);if(!rows[0])return res.status(409).json({error:'You are not clocked in'});await log(a,'CLOCK_OUT','CLOCK_ENTRY',rows[0].id);res.json({data:rows[0]})}catch(e){next(e)}});
  app.get('/api/time-attendance/schedule',async(req,res,next)=>{try{await ready();const a=authOf(res);const start=new Date(String(req.query.start||new Date().toISOString().slice(0,10)));const end=new Date(String(req.query.end||new Date(Date.now()+14*86400000).toISOString().slice(0,10)));end.setHours(23,59,59,999);const shifts=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceShift" WHERE "organizationId"=$1 AND ("employeeId"=$2 OR "employeeId" IS NULL) AND "startTime">=$3 AND "startTime"<=$4 AND "status" IN ('PUBLISHED','DRAFT') ORDER BY "startTime"`,a.organizationId,a.userId,start,end);res.json({data:{shifts}})}catch(e){next(e)}});
  app.get('/api/time-attendance/timecard',async(req,res,next)=>{try{await ready();const a=authOf(res);const start=new Date(String(req.query.start||new Date(Date.now()-14*86400000).toISOString()));const end=new Date(String(req.query.end||new Date().toISOString()));const entries=await prisma.$queryRawUnsafe<any[]>(`SELECT *,ROUND((EXTRACT(EPOCH FROM (COALESCE("clockOut",NOW())-"clockIn"))/3600)::numeric,2)::float8 AS "hours" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockIn">=$3 AND "clockIn"<=$4 ORDER BY "clockIn" DESC`,a.organizationId,a.userId,start,end);res.json({data:{entries}})}catch(e){next(e)}});
  app.get('/api/time-attendance/requests',async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceRequest" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC`,a.organizationId,a.userId);res.json({data:rows})}catch(e){next(e)}});
  app.post('/api/time-attendance/requests',async(req,res,next)=>{try{await ready();const a=authOf(res);const input=requestSchema.parse(req.body);const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceRequest" ("id","organizationId","employeeId","type","startAt","endAt","reason") VALUES ($1,$2,$3,$4,$5,$6,$7)`,id,a.organizationId,a.userId,input.type,input.startAt,input.endAt,input.reason);await log(a,'CREATE_REQUEST','REQUEST',id,input);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceRequest" WHERE "id"=$1`,id);res.status(201).json({data:rows[0]})}catch(e){next(e)}});

  app.get('/api/admin/time-attendance/employees',admin,async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT u."id",COALESCE(c."displayName",u."email",u."id") AS "displayName",u."email",u."role"::text AS role,COALESCE(to_jsonb(u)->>'department','') AS department FROM "User" u LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" WHERE u."organizationId"=$1 ORDER BY "displayName"`,a.organizationId);res.json({data:rows})}catch(e){next(e)}});
  app.get('/api/admin/time-attendance/requests',admin,async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT r.*,COALESCE(c."displayName",u."email",r."employeeId") AS "employeeName" FROM "TimeAttendanceRequest" r LEFT JOIN "User" u ON u."id"=r."employeeId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" WHERE r."organizationId"=$1 ORDER BY r."createdAt" DESC LIMIT 500`,a.organizationId);res.json({data:rows})}catch(e){next(e)}});
  app.get('/api/admin/time-attendance/dashboard',admin,async(req,res,next)=>{try{await ready();const a=authOf(res);const start=req.query.start?new Date(String(req.query.start)):new Date(Date.now()-7*86400000);const end=req.query.end?new Date(String(req.query.end)):new Date(Date.now()+35*86400000);const department=typeof req.query.department==='string'?req.query.department:'';const location=typeof req.query.location==='string'?req.query.location:'';const [employees,clocked,openShifts,pending,shifts,overtime,missed]=await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "User" WHERE "organizationId"=$1`,a.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "clockOut" IS NULL`,a.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "TimeAttendanceShift" WHERE "organizationId"=$1 AND "employeeId" IS NULL AND "startTime">=NOW()`,a.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "TimeAttendanceRequest" WHERE "organizationId"=$1 AND "status"='PENDING'`,a.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT s.*,COALESCE(c."displayName",u."email",'Open shift') AS "employeeName",u."role"::text AS role FROM "TimeAttendanceShift" s LEFT JOIN "User" u ON u."id"=s."employeeId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" WHERE s."organizationId"=$1 AND s."startTime">=$2 AND s."startTime"<=$3 AND ($4='' OR s."department"=$4) AND ($5='' OR s."location"=$5) ORDER BY s."startTime" LIMIT 1000`,a.organizationId,start,end,department,location),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM (SELECT "employeeId",DATE_TRUNC('week',"clockIn") wk,SUM(EXTRACT(EPOCH FROM (COALESCE("clockOut",NOW())-"clockIn"))/3600) hrs FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "clockIn">=NOW()-INTERVAL '14 days' GROUP BY 1,2 HAVING SUM(EXTRACT(EPOCH FROM (COALESCE("clockOut",NOW())-"clockIn"))/3600)>40) q`,a.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "clockIn"<NOW()-INTERVAL '16 hours' AND "clockOut" IS NULL`,a.organizationId),
  ]);res.json({data:{employeeCount:employees[0]?.count||0,clockedInCount:clocked[0]?.count||0,openShiftCount:openShifts[0]?.count||0,pendingRequestCount:pending[0]?.count||0,overtimeCount:overtime[0]?.count||0,missedPunchCount:missed[0]?.count||0,shifts}})}catch(e){next(e)}});
  app.post('/api/admin/time-attendance/shifts',admin,async(req,res,next)=>{try{await ready();const a=authOf(res);const input=shiftSchema.parse(req.body);const ids:string[]=[];for(let i=0;i<input.repeatWeeks;i++){const start=new Date(input.startTime);const end=new Date(input.endTime);start.setDate(start.getDate()+i*7);end.setDate(end.getDate()+i*7);const conflicts=input.employeeId?await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "TimeAttendanceShift" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "startTime"<$4 AND "endTime">$3 LIMIT 1`,a.organizationId,input.employeeId,start,end):[];if(conflicts[0])return res.status(409).json({error:`Schedule conflict detected for week ${i+1}`});const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceShift" ("id","organizationId","employeeId","startTime","endTime","code","department","location","notes","clientId","payCode","createdById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,id,a.organizationId,input.employeeId||null,start,end,input.code,input.department,input.location,input.notes,input.clientId||null,input.payCode,a.userId);ids.push(id)}await log(a,'CREATE_SHIFT','SHIFT',ids[0],{ids,...input});res.status(201).json({data:{ids,count:ids.length}})}catch(e){next(e)}});
  app.patch('/api/admin/time-attendance/shifts/:id',admin,async(req,res,next)=>{try{await ready();const a=authOf(res);const input=shiftSchema.partial().parse(req.body);const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE "TimeAttendanceShift" SET "employeeId"=COALESCE($1,"employeeId"),"startTime"=COALESCE($2,"startTime"),"endTime"=COALESCE($3,"endTime"),"code"=COALESCE($4,"code"),"department"=COALESCE($5,"department"),"location"=COALESCE($6,"location"),"notes"=COALESCE($7,"notes"),"clientId"=COALESCE($8,"clientId"),"payCode"=COALESCE($9,"payCode"),"updatedAt"=NOW() WHERE "id"=$10 AND "organizationId"=$11 RETURNING *`,input.employeeId??null,input.startTime??null,input.endTime??null,input.code??null,input.department??null,input.location??null,input.notes??null,input.clientId??null,input.payCode??null,req.params.id,a.organizationId);if(!rows[0])return res.status(404).json({error:'Shift not found'});await log(a,'UPDATE_SHIFT','SHIFT',req.params.id,input);res.json({data:rows[0]})}catch(e){next(e)}});
  app.delete('/api/admin/time-attendance/shifts/:id',admin,async(req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`DELETE FROM "TimeAttendanceShift" WHERE "id"=$1 AND "organizationId"=$2 RETURNING *`,req.params.id,a.organizationId);if(!rows[0])return res.status(404).json({error:'Shift not found'});await log(a,'DELETE_SHIFT','SHIFT',req.params.id);res.json({data:rows[0]})}catch(e){next(e)}});
  app.post('/api/admin/time-attendance/publish',admin,async(_req,res,next)=>{try{await ready();const a=authOf(res);const changed=await prisma.$executeRawUnsafe(`UPDATE "TimeAttendanceShift" SET "status"='PUBLISHED',"updatedAt"=NOW() WHERE "organizationId"=$1 AND "status"='DRAFT'`,a.organizationId);await log(a,'PUBLISH_SCHEDULE','SCHEDULE',undefined,{published:changed});res.json({data:{published:changed}})}catch(e){next(e)}});
  app.patch('/api/admin/time-attendance/requests/:id',admin,async(req,res,next)=>{try{await ready();const a=authOf(res);const status=z.enum(['APPROVED','DENIED']).parse(req.body?.status);const notes=z.string().max(2000).optional().default('').parse(req.body?.reviewNotes);const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE "TimeAttendanceRequest" SET "status"=$1,"reviewedById"=$2,"reviewedAt"=NOW(),"reviewNotes"=$3,"updatedAt"=NOW() WHERE "id"=$4 AND "organizationId"=$5 RETURNING *`,status,a.userId,notes,req.params.id,a.organizationId);if(!rows[0])return res.status(404).json({error:'Request not found'});await log(a,'REVIEW_REQUEST','REQUEST',req.params.id,{status,notes});res.json({data:rows[0]})}catch(e){next(e)}});
  app.get('/api/admin/time-attendance/audit',admin,async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceAudit" WHERE "organizationId"=$1 ORDER BY "createdAt" DESC LIMIT 500`,a.organizationId);res.json({data:rows})}catch(e){next(e)}});
};
