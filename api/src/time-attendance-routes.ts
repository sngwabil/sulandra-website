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
}).refine(v=>v.endTime>v.startTime,{message:'End must be after start'});

const ensureSchema=async(prisma:PrismaClient)=>{
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceShift" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT,
    "startTime" TIMESTAMPTZ NOT NULL,"endTime" TIMESTAMPTZ NOT NULL,"code" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT '',"location" TEXT NOT NULL DEFAULT '',"notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',"createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
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
};

export const registerTimeAttendanceRoutes=({app,prisma,authOf,requireRoles}:RouteDependencies)=>{
  let schemaReady:Promise<void>|null=null;
  const ready=()=>schemaReady??=(ensureSchema(prisma).catch(error=>{schemaReady=null;throw error;}));
  const admin=requireRoles(UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.HR_MANAGER,UserRole.SCHEDULER,UserRole.CEO,UserRole.COO);

  app.get('/api/time-attendance/clock/status',async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockOut" IS NULL ORDER BY "clockIn" DESC LIMIT 1`,a.organizationId,a.userId);res.json({data:{clockedIn:Boolean(rows[0]),...(rows[0]||{})}})}catch(e){next(e)}});
  app.post('/api/time-attendance/clock/in',async(req,res,next)=>{try{await ready();const a=authOf(res);const open=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockOut" IS NULL LIMIT 1`,a.organizationId,a.userId);if(open[0])return res.status(409).json({error:'You are already clocked in'});const id=randomUUID();const source=typeof req.body?.source==='string'?req.body.source.slice(0,40):'PORTAL';await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceClockEntry" ("id","organizationId","employeeId","clockIn","source") VALUES ($1,$2,$3,NOW(),$4)`,id,a.organizationId,a.userId,source);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceClockEntry" WHERE "id"=$1`,id);res.status(201).json({data:rows[0]})}catch(e){next(e)}});
  app.post('/api/time-attendance/clock/out',async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE "TimeAttendanceClockEntry" SET "clockOut"=NOW(),"status"='COMPLETED',"updatedAt"=NOW() WHERE "id"=(SELECT "id" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockOut" IS NULL ORDER BY "clockIn" DESC LIMIT 1) RETURNING *`,a.organizationId,a.userId);if(!rows[0])return res.status(409).json({error:'You are not clocked in'});res.json({data:rows[0]})}catch(e){next(e)}});
  app.get('/api/time-attendance/schedule',async(req,res,next)=>{try{await ready();const a=authOf(res);const start=new Date(String(req.query.start||new Date().toISOString().slice(0,10)));const end=new Date(String(req.query.end||new Date(Date.now()+14*86400000).toISOString().slice(0,10)));end.setHours(23,59,59,999);const shifts=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceShift" WHERE "organizationId"=$1 AND ("employeeId"=$2 OR "employeeId" IS NULL) AND "startTime">=$3 AND "startTime"<=$4 AND "status" IN ('PUBLISHED','DRAFT') ORDER BY "startTime"`,a.organizationId,a.userId,start,end);res.json({data:{shifts}})}catch(e){next(e)}});
  app.get('/api/time-attendance/timecard',async(req,res,next)=>{try{await ready();const a=authOf(res);const start=new Date(String(req.query.start||new Date(Date.now()-14*86400000).toISOString()));const end=new Date(String(req.query.end||new Date().toISOString()));const entries=await prisma.$queryRawUnsafe<any[]>(`SELECT *,ROUND((EXTRACT(EPOCH FROM (COALESCE("clockOut",NOW())-"clockIn"))/3600)::numeric,2)::float8 AS "hours" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockIn">=$3 AND "clockIn"<=$4 ORDER BY "clockIn" DESC`,a.organizationId,a.userId,start,end);res.json({data:{entries}})}catch(e){next(e)}});
  app.get('/api/time-attendance/requests',async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceRequest" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC`,a.organizationId,a.userId);res.json({data:rows})}catch(e){next(e)}});
  app.post('/api/time-attendance/requests',async(req,res,next)=>{try{await ready();const a=authOf(res);const input=requestSchema.parse(req.body);const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceRequest" ("id","organizationId","employeeId","type","startAt","endAt","reason") VALUES ($1,$2,$3,$4,$5,$6,$7)`,id,a.organizationId,a.userId,input.type,input.startAt,input.endAt,input.reason);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceRequest" WHERE "id"=$1`,id);res.status(201).json({data:rows[0]})}catch(e){next(e)}});

  app.get('/api/admin/time-attendance/dashboard',admin,async(_req,res,next)=>{try{await ready();const a=authOf(res);const [employees,clocked,openShifts,pending,shifts]=await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "User" WHERE "organizationId"=$1`,a.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "clockOut" IS NULL`,a.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "TimeAttendanceShift" WHERE "organizationId"=$1 AND "employeeId" IS NULL AND "startTime">=NOW()`,a.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS count FROM "TimeAttendanceRequest" WHERE "organizationId"=$1 AND "status"='PENDING'`,a.organizationId),
    prisma.$queryRawUnsafe<any[]>(`SELECT s.*,COALESCE(c."displayName",u."email",'Open shift') AS "employeeName",u."role"::text AS role FROM "TimeAttendanceShift" s LEFT JOIN "User" u ON u."id"=s."employeeId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" WHERE s."organizationId"=$1 AND s."startTime">=NOW()-INTERVAL '7 days' ORDER BY s."startTime" LIMIT 250`,a.organizationId),
  ]);res.json({data:{employeeCount:employees[0]?.count||0,clockedInCount:clocked[0]?.count||0,openShiftCount:openShifts[0]?.count||0,pendingRequestCount:pending[0]?.count||0,shifts}})}catch(e){next(e)}});
  app.post('/api/admin/time-attendance/shifts',admin,async(req,res,next)=>{try{await ready();const a=authOf(res);const input=shiftSchema.parse(req.body);const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceShift" ("id","organizationId","employeeId","startTime","endTime","code","department","location","notes","createdById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,id,a.organizationId,input.employeeId||null,input.startTime,input.endTime,input.code,input.department,input.location,input.notes,a.userId);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceShift" WHERE "id"=$1`,id);res.status(201).json({data:rows[0]})}catch(e){next(e)}});
  app.post('/api/admin/time-attendance/publish',admin,async(_req,res,next)=>{try{await ready();const a=authOf(res);const changed=await prisma.$executeRawUnsafe(`UPDATE "TimeAttendanceShift" SET "status"='PUBLISHED',"updatedAt"=NOW() WHERE "organizationId"=$1 AND "status"='DRAFT'`,a.organizationId);res.json({data:{published:changed}})}catch(e){next(e)}});
  app.patch('/api/admin/time-attendance/requests/:id',admin,async(req,res,next)=>{try{await ready();const a=authOf(res);const status=z.enum(['APPROVED','DENIED']).parse(req.body?.status);const notes=z.string().max(2000).optional().default('').parse(req.body?.reviewNotes);const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE "TimeAttendanceRequest" SET "status"=$1,"reviewedById"=$2,"reviewedAt"=NOW(),"reviewNotes"=$3,"updatedAt"=NOW() WHERE "id"=$4 AND "organizationId"=$5 RETURNING *`,status,a.userId,notes,req.params.id,a.organizationId);if(!rows[0])return res.status(404).json({error:'Request not found'});res.json({data:rows[0]})}catch(e){next(e)}});
};
