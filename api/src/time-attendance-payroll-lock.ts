import { createHash, randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import type { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';
import { entityAccessOf, requireEntityManageAccess } from './entity-access.js';

type AuthContext = { userId: string; organizationId: string; role: UserRole; email?: string };
type RegisterInput = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  admin: RequestHandler;
  ready: () => Promise<void>;
};
type PayrollScope = { organizationId: string; legalEntityId: string; periodStart: string; periodEnd: string };
type PayrollReadiness = {
  ready: boolean; blockers: string[]; warnings: string[]; fingerprint: string;
  entryCount: number; totalHours: number; pendingCorrectionCount: number;
  entries: Array<Record<string, unknown>>; corrections: Array<Record<string, unknown>>;
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lockSchema = z.object({periodStart:dateSchema,periodEnd:dateSchema,notes:z.string().trim().max(5000).optional().default('')})
  .refine((value)=>value.periodEnd>=value.periodStart,{message:'periodEnd must be on or after periodStart'});
const reopenSchema = z.object({ reason: z.string().trim().min(5).max(5000) });
const clean = (value: unknown, max = 5000) => String(value ?? '').trim().slice(0, max);
const httpError = (status: number, message: string, details?: unknown) => Object.assign(new Error(message), { status, details });
const csvCell = (value: unknown) => { const text=String(value??''); return /[",\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text; };
const payrollAuthority = (auth: AuthContext) => {
  const role=clean(auth.role,80).toUpperCase();
  return ['ADMINISTRATOR','HR_MANAGER','CEO','DOO','COO'].includes(role)||clean(auth.email,320).toLowerCase()==='admin@sulandrahealth.com';
};
const requirePayrollAuthority = (auth: AuthContext) => { if(!payrollAuthority(auth)) throw httpError(403,'Payroll period lock authority is required'); };
const stable = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>[key,stable(child)]));
  return value;
};
const fingerprintOf=(value:unknown)=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

export async function ensureTimeAttendancePayrollLockSchema(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendancePayrollPeriod" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"periodStart" DATE NOT NULL,"periodEnd" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',"fingerprint" TEXT,"notes" TEXT NOT NULL DEFAULT '',"lockedAt" TIMESTAMPTZ,"lockedById" TEXT,
    "exportedAt" TIMESTAMPTZ,"exportedById" TEXT,"reopenedAt" TIMESTAMPTZ,"reopenedById" TEXT,"reopenReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK ("periodEnd">="periodStart"))`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "TimeAttendancePayrollPeriod_exact_range_key" ON "TimeAttendancePayrollPeriod"("organizationId","legalEntityId","periodStart","periodEnd")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimeAttendancePayrollPeriod_entity_status_idx" ON "TimeAttendancePayrollPeriod"("organizationId","legalEntityId","status","periodStart","periodEnd")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendancePayrollDecision" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"legalEntityId" TEXT NOT NULL,"periodId" TEXT NOT NULL,"action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,"fingerprint" TEXT,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TimeAttendancePayrollDecision_period_idx" ON "TimeAttendancePayrollDecision"("organizationId","legalEntityId","periodId","createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "spire_payroll_decision_immutable"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'PAYROLL_DECISION_IMMUTABLE'; END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "TimeAttendancePayrollDecision_immutable" ON "TimeAttendancePayrollDecision"`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "TimeAttendancePayrollDecision_immutable" BEFORE UPDATE OR DELETE ON "TimeAttendancePayrollDecision" FOR EACH ROW EXECUTE FUNCTION "spire_payroll_decision_immutable"()`);

  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "spire_time_attendance_payroll_lock_guard"() RETURNS trigger AS $$
    DECLARE old_locked BOOLEAN := FALSE; new_locked BOOLEAN := FALSE;
    BEGIN
      IF TG_OP IN ('UPDATE','DELETE') THEN SELECT EXISTS(SELECT 1 FROM "TimeAttendancePayrollPeriod" p WHERE p."organizationId"=OLD."organizationId" AND p."legalEntityId"=OLD."legalEntityId" AND p."status" IN ('LOCKED','EXPORTED') AND OLD."clockIn"::date BETWEEN p."periodStart" AND p."periodEnd") INTO old_locked; END IF;
      IF TG_OP IN ('INSERT','UPDATE') THEN SELECT EXISTS(SELECT 1 FROM "TimeAttendancePayrollPeriod" p WHERE p."organizationId"=NEW."organizationId" AND p."legalEntityId"=NEW."legalEntityId" AND p."status" IN ('LOCKED','EXPORTED') AND NEW."clockIn"::date BETWEEN p."periodStart" AND p."periodEnd") INTO new_locked; END IF;
      IF old_locked OR new_locked THEN RAISE EXCEPTION 'PAYROLL_PERIOD_LOCKED'; END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "TimeAttendanceClockEntry_payroll_lock_guard" ON "TimeAttendanceClockEntry"`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "TimeAttendanceClockEntry_payroll_lock_guard" BEFORE INSERT OR UPDATE OR DELETE ON "TimeAttendanceClockEntry" FOR EACH ROW EXECUTE FUNCTION "spire_time_attendance_payroll_lock_guard"()`);

  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "spire_clock_correction_payroll_lock_guard"() RETURNS trigger AS $$
    DECLARE row_org TEXT; row_entity TEXT; row_type TEXT; row_start TIMESTAMPTZ; row_end TIMESTAMPTZ; is_locked BOOLEAN := FALSE;
    BEGIN
      row_org := CASE WHEN TG_OP='DELETE' THEN OLD."organizationId" ELSE NEW."organizationId" END;
      row_entity := CASE WHEN TG_OP='DELETE' THEN OLD."legalEntityId" ELSE NEW."legalEntityId" END;
      row_type := CASE WHEN TG_OP='DELETE' THEN OLD."type" ELSE NEW."type" END;
      row_start := CASE WHEN TG_OP='DELETE' THEN OLD."startAt" ELSE NEW."startAt" END;
      row_end := CASE WHEN TG_OP='DELETE' THEN OLD."endAt" ELSE NEW."endAt" END;
      IF row_type='CLOCK_CORRECTION' THEN
        SELECT EXISTS(SELECT 1 FROM "TimeAttendancePayrollPeriod" p WHERE p."organizationId"=row_org AND p."legalEntityId"=row_entity AND p."status" IN ('LOCKED','EXPORTED') AND row_start::date<=p."periodEnd" AND row_end::date>=p."periodStart") INTO is_locked;
        IF is_locked THEN RAISE EXCEPTION 'PAYROLL_PERIOD_LOCKED'; END IF;
      END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "TimeAttendanceRequest_payroll_lock_guard" ON "TimeAttendanceRequest"`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "TimeAttendanceRequest_payroll_lock_guard" BEFORE INSERT OR UPDATE OR DELETE ON "TimeAttendanceRequest" FOR EACH ROW EXECUTE FUNCTION "spire_clock_correction_payroll_lock_guard"()`);
}

async function payrollReadiness(prisma: PrismaClient, scope: PayrollScope): Promise<PayrollReadiness> {
  const entries=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT e."id",e."employeeId",e."clockIn",e."clockOut",e."source",e."status",e."notes",e."updatedAt",COALESCE(c."displayName",u."email",e."employeeId") AS "employeeName",CASE WHEN e."clockOut" IS NULL THEN NULL ELSE ROUND((EXTRACT(EPOCH FROM (e."clockOut"-e."clockIn"))/3600.0)::numeric,4)::float8 END AS "hours" FROM "TimeAttendanceClockEntry" e LEFT JOIN "User" u ON u."organizationId"=e."organizationId" AND u."id"=e."employeeId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" WHERE e."organizationId"=$1 AND e."legalEntityId"=$2 AND e."clockIn"::date BETWEEN $3::date AND $4::date ORDER BY e."clockIn",e."employeeId",e."id"`,scope.organizationId,scope.legalEntityId,scope.periodStart,scope.periodEnd);
  const corrections=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "id","employeeId","type","startAt","endAt","reason","status","reviewedById","reviewedAt","reviewNotes","updatedAt" FROM "TimeAttendanceRequest" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "type"='CLOCK_CORRECTION' AND "startAt"::date<=$4::date AND "endAt"::date>=$3::date ORDER BY "startAt","employeeId","id"`,scope.organizationId,scope.legalEntityId,scope.periodStart,scope.periodEnd);
  const blockers:string[]=[],warnings:string[]=[];
  const open=entries.filter((row)=>!row.clockOut); if(open.length)blockers.push(`${open.length} clock entr${open.length===1?'y is':'ies are'} still open in this payroll period.`);
  const invalid=entries.filter((row)=>row.clockOut&&Number(row.hours)<=0); if(invalid.length)blockers.push(`${invalid.length} clock entr${invalid.length===1?'y has':'ies have'} a zero or negative duration.`);
  const excessive=entries.filter((row)=>Number(row.hours)>24); if(excessive.length)blockers.push(`${excessive.length} clock entr${excessive.length===1?'y exceeds':'ies exceed'} 24 hours and requires correction before payroll lock.`);
  const pending=corrections.filter((row)=>clean(row.status,40).toUpperCase()==='PENDING'); if(pending.length)blockers.push(`${pending.length} clock correction request${pending.length===1?' is':'s are'} still pending.`);
  if(!entries.length)warnings.push('No clock entries exist in the selected payroll period.');
  const totalHours=entries.reduce((sum,row)=>sum+(Number.isFinite(Number(row.hours))?Number(row.hours):0),0);
  const evidence={organizationId:scope.organizationId,legalEntityId:scope.legalEntityId,periodStart:scope.periodStart,periodEnd:scope.periodEnd,entries:entries.map((row)=>({id:row.id,employeeId:row.employeeId,clockIn:row.clockIn,clockOut:row.clockOut,source:row.source,status:row.status,notes:row.notes,updatedAt:row.updatedAt})),corrections:corrections.map((row)=>({id:row.id,employeeId:row.employeeId,startAt:row.startAt,endAt:row.endAt,status:row.status,reviewedById:row.reviewedById,reviewedAt:row.reviewedAt,reviewNotes:row.reviewNotes,updatedAt:row.updatedAt}))};
  return{ready:blockers.length===0,blockers,warnings,fingerprint:fingerprintOf(evidence),entryCount:entries.length,totalHours:Number(totalHours.toFixed(4)),pendingCorrectionCount:pending.length,entries,corrections};
}

async function recordDecision(prisma:PrismaClient,input:{organizationId:string;legalEntityId:string;periodId:string;action:string;actorUserId:string;fingerprint?:string|null;details?:Record<string,unknown>}){
  await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendancePayrollDecision"("id","organizationId","legalEntityId","periodId","action","actorUserId","fingerprint","details") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,randomUUID(),input.organizationId,input.legalEntityId,input.periodId,input.action,input.actorUserId,input.fingerprint??null,JSON.stringify(input.details??{}));
}

export const registerTimeAttendancePayrollLockRoutes=({app,prisma,authOf,admin,ready}:RegisterInput)=>{
  app.get('/api/admin/time-attendance/payroll-readiness',admin,async(req,res,next)=>{try{await ready();const auth=authOf(res);requirePayrollAuthority(auth);const access=entityAccessOf(res);requireEntityManageAccess(access);const periodStart=dateSchema.parse(req.query.start),periodEnd=dateSchema.parse(req.query.end);if(periodEnd<periodStart)throw httpError(400,'Payroll period end must be on or after start');res.json({data:await payrollReadiness(prisma,{organizationId:auth.organizationId,legalEntityId:access.legalEntityId,periodStart,periodEnd})});}catch(error){next(error);}});
  app.get('/api/admin/time-attendance/payroll-periods',admin,async(_req,res,next)=>{try{await ready();const auth=authOf(res);requirePayrollAuthority(auth);const access=entityAccessOf(res);requireEntityManageAccess(access);const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT p.*,COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d."createdAt") FROM "TimeAttendancePayrollDecision" d WHERE d."organizationId"=p."organizationId" AND d."legalEntityId"=p."legalEntityId" AND d."periodId"=p."id"),'[]'::jsonb) AS "decisions" FROM "TimeAttendancePayrollPeriod" p WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 ORDER BY p."periodStart" DESC,p."createdAt" DESC LIMIT 250`,auth.organizationId,access.legalEntityId);res.json({data:rows});}catch(error){next(error);}});
  app.post('/api/admin/time-attendance/payroll-periods/lock',admin,async(req,res,next)=>{try{await ready();const auth=authOf(res);requirePayrollAuthority(auth);const access=entityAccessOf(res);requireEntityManageAccess(access);const input=lockSchema.parse(req.body),scope={organizationId:auth.organizationId,legalEntityId:access.legalEntityId,periodStart:input.periodStart,periodEnd:input.periodEnd},readiness=await payrollReadiness(prisma,scope);if(!readiness.ready)throw httpError(409,'Payroll period cannot be locked until all time-attendance integrity blockers are resolved.',{code:'PAYROLL_PERIOD_NOT_READY',readiness});const overlap=await prisma.$queryRawUnsafe<Array<{id:string;status:string}>>(`SELECT "id","status" FROM "TimeAttendancePayrollPeriod" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "status" IN ('LOCKED','EXPORTED') AND "periodStart"<=$4::date AND "periodEnd">=$3::date LIMIT 1`,auth.organizationId,access.legalEntityId,input.periodStart,input.periodEnd);if(overlap[0])throw httpError(409,'The selected dates overlap an already locked or exported payroll period.',{code:'PAYROLL_PERIOD_OVERLAP',periodId:overlap[0].id,status:overlap[0].status});const existing=await prisma.$queryRawUnsafe<Array<{id:string;status:string}>>(`SELECT "id","status" FROM "TimeAttendancePayrollPeriod" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "periodStart"=$3::date AND "periodEnd"=$4::date LIMIT 1`,auth.organizationId,access.legalEntityId,input.periodStart,input.periodEnd),periodId=existing[0]?.id||randomUUID();if(existing[0]){if(existing[0].status!=='OPEN')throw httpError(409,'Only an OPEN payroll period can be locked.');await prisma.$executeRawUnsafe(`UPDATE "TimeAttendancePayrollPeriod" SET "status"='LOCKED',"fingerprint"=$1,"notes"=$2,"lockedAt"=NOW(),"lockedById"=$3,"updatedAt"=NOW() WHERE "id"=$4 AND "organizationId"=$5 AND "legalEntityId"=$6`,readiness.fingerprint,input.notes,auth.userId,periodId,auth.organizationId,access.legalEntityId);}else await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendancePayrollPeriod"("id","organizationId","legalEntityId","periodStart","periodEnd","status","fingerprint","notes","lockedAt","lockedById") VALUES($1,$2,$3,$4::date,$5::date,'LOCKED',$6,$7,NOW(),$8)`,periodId,auth.organizationId,access.legalEntityId,input.periodStart,input.periodEnd,readiness.fingerprint,input.notes,auth.userId);await recordDecision(prisma,{organizationId:auth.organizationId,legalEntityId:access.legalEntityId,periodId,action:'LOCK',actorUserId:auth.userId,fingerprint:readiness.fingerprint,details:{entryCount:readiness.entryCount,totalHours:readiness.totalHours,pendingCorrectionCount:readiness.pendingCorrectionCount,warnings:readiness.warnings}});res.status(201).json({data:{id:periodId,status:'LOCKED',fingerprint:readiness.fingerprint,readiness}});}catch(error){next(error);}});
  app.post('/api/admin/time-attendance/payroll-periods/:periodId/reopen',admin,async(req,res,next)=>{try{await ready();const auth=authOf(res);requirePayrollAuthority(auth);const access=entityAccessOf(res);requireEntityManageAccess(access);const input=reopenSchema.parse(req.body),rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "TimeAttendancePayrollPeriod" WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3 LIMIT 1`,req.params.periodId,auth.organizationId,access.legalEntityId),period=rows[0];if(!period)throw httpError(404,'Payroll period was not found');if(!['LOCKED','EXPORTED'].includes(clean(period.status,30)))throw httpError(409,'Only a LOCKED or EXPORTED payroll period can be reopened.');await prisma.$executeRawUnsafe(`UPDATE "TimeAttendancePayrollPeriod" SET "status"='OPEN',"fingerprint"=NULL,"reopenedAt"=NOW(),"reopenedById"=$1,"reopenReason"=$2,"updatedAt"=NOW() WHERE "id"=$3 AND "organizationId"=$4 AND "legalEntityId"=$5`,auth.userId,input.reason,req.params.periodId,auth.organizationId,access.legalEntityId);await recordDecision(prisma,{organizationId:auth.organizationId,legalEntityId:access.legalEntityId,periodId:req.params.periodId,action:'REOPEN',actorUserId:auth.userId,fingerprint:clean(period.fingerprint,128)||null,details:{reason:input.reason,priorStatus:period.status}});res.json({data:{id:req.params.periodId,status:'OPEN',reopenReason:input.reason}});}catch(error){next(error);}});
  app.get('/api/admin/time-attendance/payroll-periods/:periodId/export.csv',admin,async(req,res,next)=>{try{await ready();const auth=authOf(res);requirePayrollAuthority(auth);const access=entityAccessOf(res);requireEntityManageAccess(access);const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "TimeAttendancePayrollPeriod" WHERE "id"=$1 AND "organizationId"=$2 AND "legalEntityId"=$3 LIMIT 1`,req.params.periodId,auth.organizationId,access.legalEntityId),period=rows[0];if(!period)throw httpError(404,'Payroll period was not found');if(!['LOCKED','EXPORTED'].includes(clean(period.status,30)))throw httpError(409,'Payroll export requires a LOCKED payroll period.');const readiness=await payrollReadiness(prisma,{organizationId:auth.organizationId,legalEntityId:access.legalEntityId,periodStart:clean(period.periodStart,20).slice(0,10),periodEnd:clean(period.periodEnd,20).slice(0,10)});if(!readiness.ready)throw httpError(409,'Payroll evidence is no longer ready for export.',{code:'PAYROLL_EVIDENCE_CHANGED',readiness});const expected=clean(period.fingerprint,128);if(!expected||readiness.fingerprint!==expected)throw httpError(409,'Payroll evidence changed after lock. Reopen, review corrections, and lock the period again before export.',{code:'PAYROLL_FINGERPRINT_MISMATCH',expectedFingerprint:expected||null,currentFingerprint:readiness.fingerprint});if(clean(period.status,30)==='LOCKED'){await prisma.$executeRawUnsafe(`UPDATE "TimeAttendancePayrollPeriod" SET "status"='EXPORTED',"exportedAt"=NOW(),"exportedById"=$1,"updatedAt"=NOW() WHERE "id"=$2 AND "organizationId"=$3 AND "legalEntityId"=$4 AND "status"='LOCKED'`,auth.userId,req.params.periodId,auth.organizationId,access.legalEntityId);await recordDecision(prisma,{organizationId:auth.organizationId,legalEntityId:access.legalEntityId,periodId:req.params.periodId,action:'EXPORT',actorUserId:auth.userId,fingerprint:readiness.fingerprint,details:{entryCount:readiness.entryCount,totalHours:readiness.totalHours,format:'CSV',directPayrollProviderSubmission:false}});}const headers=['payrollPeriodId','periodStart','periodEnd','employeeId','employeeName','clockEntryId','clockIn','clockOut','hours','source','status','notes'];const csv=[headers.join(','),...readiness.entries.map((entry)=>[req.params.periodId,clean(period.periodStart,20).slice(0,10),clean(period.periodEnd,20).slice(0,10),entry.employeeId,entry.employeeName,entry.id,entry.clockIn,entry.clockOut,entry.hours,entry.source,entry.status,entry.notes].map(csvCell).join(','))].join('\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="payroll-${clean(period.periodStart,20).slice(0,10)}-${clean(period.periodEnd,20).slice(0,10)}.csv"`);res.setHeader('Cache-Control','private, no-store');res.send(csv);}catch(error){next(error);}});
};
