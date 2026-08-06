import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = { userId:string; organizationId:string; role:UserRole; email?:string; ipAddress?:string; userAgent?:string };
type AuditFn = (auth:Partial<AuthContext>,action:string,resourceType:string,resourceId?:string,metadata?:object)=>Promise<void>;
type Dependencies = { app:Express; prisma:PrismaClient; authOf:(response:Response)=>AuthContext; requireRoles:(...roles:UserRole[])=>RequestHandler; audit?:AuditFn };

const OWNER_EMAIL='admin@sulandrahealth.com';
const managerRoles=[UserRole.ADMINISTRATOR,UserRole.HR_MANAGER,UserRole.CEO,UserRole.COO,UserRole.AUDITOR] as const;
const writableRoles=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.HR_MANAGER,UserRole.CEO,UserRole.COO]);
const payrollRoles=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.HR_MANAGER,UserRole.CEO,UserRole.COO]);

const compensationSchema=z.object({
  payType:z.enum(['HOURLY','SALARY','STIPEND','CONTRACT']),
  baseRate:z.number().nonnegative(),
  currency:z.string().trim().length(3).default('USD'),
  annualizedAmount:z.number().nonnegative().optional().nullable(),
  standardHoursPerWeek:z.number().min(0).max(168).optional().default(40),
  overtimeEligible:z.boolean().optional().default(true),
  overtimeMultiplier:z.number().min(1).max(5).optional().default(1.5),
  effectiveDate:z.coerce.date(),
  endDate:z.coerce.date().optional().nullable(),
  reason:z.string().trim().min(2).max(4000),
  notes:z.string().trim().max(8000).optional().default(''),
});

const payrollProfileSchema=z.object({
  payrollStatus:z.enum(['ACTIVE','ON_HOLD','EXEMPT','TERMINATED']).default('ACTIVE'),
  payFrequency:z.enum(['WEEKLY','BIWEEKLY','SEMIMONTHLY','MONTHLY']).default('BIWEEKLY'),
  workState:z.string().trim().length(2).default('OH'),
  taxFilingStatus:z.enum(['SINGLE','MARRIED_FILING_JOINTLY','MARRIED_FILING_SEPARATELY','HEAD_OF_HOUSEHOLD','EXEMPT']).default('SINGLE'),
  additionalFederalWithholding:z.number().nonnegative().default(0),
  additionalStateWithholding:z.number().nonnegative().default(0),
  directDepositEnabled:z.boolean().default(false),
  bankName:z.string().trim().max(200).optional().default(''),
  accountLast4:z.string().trim().regex(/^\d{4}$/).optional().or(z.literal('')).default(''),
  routingLast4:z.string().trim().regex(/^\d{4}$/).optional().or(z.literal('')).default(''),
  notes:z.string().trim().max(8000).optional().default(''),
});

const deductionSchema=z.object({
  name:z.string().trim().min(2).max(240),
  category:z.enum(['PRE_TAX','POST_TAX','GARNISHMENT','LOAN','OTHER']),
  calculationType:z.enum(['FLAT','PERCENT']),
  amount:z.number().nonnegative(),
  effectiveDate:z.coerce.date(),
  endDate:z.coerce.date().optional().nullable(),
  active:z.boolean().default(true),
  priority:z.number().int().min(1).max(999).default(100),
  notes:z.string().trim().max(4000).optional().default(''),
});

const benefitPlanSchema=z.object({
  name:z.string().trim().min(2).max(240),
  planType:z.enum(['MEDICAL','DENTAL','VISION','LIFE','DISABILITY','RETIREMENT','HSA','FSA','EAP','OTHER']),
  carrier:z.string().trim().max(240).optional().default(''),
  policyNumber:z.string().trim().max(240).optional().default(''),
  description:z.string().trim().max(8000).optional().default(''),
  employeeCost:z.number().nonnegative().default(0),
  employerCost:z.number().nonnegative().default(0),
  costFrequency:z.enum(['WEEKLY','BIWEEKLY','SEMIMONTHLY','MONTHLY','ANNUAL']).default('MONTHLY'),
  eligibilityWaitingDays:z.number().int().min(0).max(3650).default(0),
  active:z.boolean().default(true),
});

const enrollmentSchema=z.object({
  benefitPlanId:z.string().trim().min(1),
  coverageTier:z.enum(['EMPLOYEE_ONLY','EMPLOYEE_SPOUSE','EMPLOYEE_CHILDREN','FAMILY','WAIVED']),
  status:z.enum(['PENDING','ACTIVE','WAIVED','TERMINATED']).default('ACTIVE'),
  effectiveDate:z.coerce.date(),
  endDate:z.coerce.date().optional().nullable(),
  employeeContribution:z.number().nonnegative().default(0),
  employerContribution:z.number().nonnegative().default(0),
  dependentCount:z.number().int().min(0).max(50).default(0),
  notes:z.string().trim().max(4000).optional().default(''),
});

const payRunSchema=z.object({
  name:z.string().trim().min(2).max(240),
  periodStart:z.coerce.date(),
  periodEnd:z.coerce.date(),
  payDate:z.coerce.date(),
  status:z.enum(['DRAFT','PROCESSING','APPROVED','PAID','VOID']).default('DRAFT'),
  notes:z.string().trim().max(8000).optional().default(''),
}).refine(value=>value.periodEnd>=value.periodStart,{message:'Pay period end date must be on or after the start date'});

const payrollItemSchema=z.object({
  employeeId:z.string().trim().min(1),
  regularHours:z.number().nonnegative().default(0),
  overtimeHours:z.number().nonnegative().default(0),
  holidayHours:z.number().nonnegative().default(0),
  ptoHours:z.number().nonnegative().default(0),
  otherEarnings:z.number().nonnegative().default(0),
  bonus:z.number().nonnegative().default(0),
  reimbursement:z.number().nonnegative().default(0),
  taxes:z.number().nonnegative().default(0),
  deductions:z.number().nonnegative().default(0),
  notes:z.string().trim().max(4000).optional().default(''),
});

const normalizeEmail=(value:unknown)=>String(value??'').trim().toLowerCase();
const isOwnerEmail=(value:unknown)=>normalizeEmail(value)===OWNER_EMAIL;

export function registerEmployeeCompensationRoutes({app,prisma,authOf,requireRoles,audit}:Dependencies){
  let readyPromise:Promise<void>|null=null;
  const ready=()=>readyPromise??=(async()=>{
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeCompensationHistory" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"payType" TEXT NOT NULL,"baseRate" NUMERIC(14,4) NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'USD',"annualizedAmount" NUMERIC(14,2),"standardHoursPerWeek" NUMERIC(6,2) NOT NULL DEFAULT 40,
      "overtimeEligible" BOOLEAN NOT NULL DEFAULT TRUE,"overtimeMultiplier" NUMERIC(5,2) NOT NULL DEFAULT 1.5,"effectiveDate" DATE NOT NULL,"endDate" DATE,
      "reason" TEXT NOT NULL,"notes" TEXT NOT NULL DEFAULT '',"createdById" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeCompensationHistory_employee_idx" ON "EmployeeCompensationHistory"("organizationId","employeeId","effectiveDate" DESC)`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePayrollProfile" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"payrollStatus" TEXT NOT NULL DEFAULT 'ACTIVE',"payFrequency" TEXT NOT NULL DEFAULT 'BIWEEKLY',
      "workState" TEXT NOT NULL DEFAULT 'OH',"taxFilingStatus" TEXT NOT NULL DEFAULT 'SINGLE',"additionalFederalWithholding" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "additionalStateWithholding" NUMERIC(12,2) NOT NULL DEFAULT 0,"directDepositEnabled" BOOLEAN NOT NULL DEFAULT FALSE,"bankName" TEXT NOT NULL DEFAULT '',
      "accountLast4" TEXT NOT NULL DEFAULT '',"routingLast4" TEXT NOT NULL DEFAULT '',"notes" TEXT NOT NULL DEFAULT '',"updatedById" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePayrollProfile_employee_unique" ON "EmployeePayrollProfile"("organizationId","employeeId")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePayrollDeduction" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"name" TEXT NOT NULL,"category" TEXT NOT NULL,
      "calculationType" TEXT NOT NULL,"amount" NUMERIC(12,4) NOT NULL,"effectiveDate" DATE NOT NULL,"endDate" DATE,"active" BOOLEAN NOT NULL DEFAULT TRUE,
      "priority" INTEGER NOT NULL DEFAULT 100,"notes" TEXT NOT NULL DEFAULT '',"createdById" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePayrollDeduction_employee_idx" ON "EmployeePayrollDeduction"("organizationId","employeeId","active","priority")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeBenefitPlan" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"name" TEXT NOT NULL,"planType" TEXT NOT NULL,"carrier" TEXT NOT NULL DEFAULT '',
      "policyNumber" TEXT NOT NULL DEFAULT '',"description" TEXT NOT NULL DEFAULT '',"employeeCost" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "employerCost" NUMERIC(12,2) NOT NULL DEFAULT 0,"costFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',"eligibilityWaitingDays" INTEGER NOT NULL DEFAULT 0,
      "active" BOOLEAN NOT NULL DEFAULT TRUE,"createdById" TEXT NOT NULL,"updatedById" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeBenefitPlan_org_idx" ON "EmployeeBenefitPlan"("organizationId","active","planType","name")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeBenefitEnrollment" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"benefitPlanId" TEXT NOT NULL,"coverageTier" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',"effectiveDate" DATE NOT NULL,"endDate" DATE,"employeeContribution" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "employerContribution" NUMERIC(12,2) NOT NULL DEFAULT 0,"dependentCount" INTEGER NOT NULL DEFAULT 0,"notes" TEXT NOT NULL DEFAULT '',
      "createdById" TEXT NOT NULL,"updatedById" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeBenefitEnrollment_employee_idx" ON "EmployeeBenefitEnrollment"("organizationId","employeeId","status","effectiveDate" DESC)`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePayRun" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"name" TEXT NOT NULL,"periodStart" DATE NOT NULL,"periodEnd" DATE NOT NULL,"payDate" DATE NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'DRAFT',"notes" TEXT NOT NULL DEFAULT '',"grossPayroll" NUMERIC(16,2) NOT NULL DEFAULT 0,"netPayroll" NUMERIC(16,2) NOT NULL DEFAULT 0,
      "approvedById" TEXT,"approvedAt" TIMESTAMPTZ,"paidAt" TIMESTAMPTZ,"createdById" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeePayRun_org_idx" ON "EmployeePayRun"("organizationId","payDate" DESC,"status")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeePayrollItem" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"payRunId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"regularHours" NUMERIC(8,2) NOT NULL DEFAULT 0,
      "overtimeHours" NUMERIC(8,2) NOT NULL DEFAULT 0,"holidayHours" NUMERIC(8,2) NOT NULL DEFAULT 0,"ptoHours" NUMERIC(8,2) NOT NULL DEFAULT 0,
      "regularEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,"overtimeEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,"holidayEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,
      "ptoEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,"otherEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,"bonus" NUMERIC(14,2) NOT NULL DEFAULT 0,
      "reimbursement" NUMERIC(14,2) NOT NULL DEFAULT 0,"grossPay" NUMERIC(14,2) NOT NULL DEFAULT 0,"taxes" NUMERIC(14,2) NOT NULL DEFAULT 0,
      "deductions" NUMERIC(14,2) NOT NULL DEFAULT 0,"netPay" NUMERIC(14,2) NOT NULL DEFAULT 0,"notes" TEXT NOT NULL DEFAULT '',
      "createdById" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePayrollItem_run_employee_unique" ON "EmployeePayrollItem"("organizationId","payRunId","employeeId")`);

    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EmployeeCompensationEvent" (
      "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT,"actorUserId" TEXT,"eventType" TEXT NOT NULL,
      "resourceType" TEXT NOT NULL,"resourceId" TEXT,"details" JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeCompensationEvent_org_idx" ON "EmployeeCompensationEvent"("organizationId","createdAt" DESC)`);
  })().catch(error=>{readyPromise=null;throw error});

  const gate=requireRoles(...managerRoles);
  const actorIdentity=async(auth:AuthContext)=>{
    const rows=await prisma.$queryRawUnsafe<Array<{email:string|null;role:string}>>(`SELECT "email","role"::text AS "role" FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,auth.userId,auth.organizationId);
    const email=normalizeEmail(rows[0]?.email||auth.email);
    return {email,role:String(rows[0]?.role||auth.role),isOwner:email===OWNER_EMAIL};
  };
  const requireWritable=async(auth:AuthContext)=>{
    if(auth.role===UserRole.AUDITOR) throw Object.assign(new Error('Auditor compensation access is read only'),{status:403});
    const identity=await actorIdentity(auth);
    if(!identity.isOwner&&!writableRoles.has(auth.role)) throw Object.assign(new Error('You are not authorized to modify compensation or benefits'),{status:403});
    return identity;
  };
  const employee=async(org:string,id:string)=>{
    const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT u."id",u."email",u."role"::text AS "role",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "displayName",p."jobTitle",p."department",COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus" FROM "User" u LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId" WHERE u."organizationId"=$1 AND u."id"=$2 LIMIT 1`,org,id);
    if(!rows[0]) throw Object.assign(new Error('Employee was not found'),{status:404});
    return rows[0];
  };
  const assertEmployee=async(auth:AuthContext,id:string)=>{const row=await employee(auth.organizationId,id);if(isOwnerEmail(row.email)&&!((await actorIdentity(auth)).isOwner)) throw Object.assign(new Error('The Enterprise Owner compensation profile cannot be changed by another user'),{status:403});return row};
  const event=async(auth:AuthContext,employeeId:string|null,eventType:string,resourceType:string,resourceId:string|null,details:object={})=>{
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeCompensationEvent" ("id","organizationId","employeeId","actorUserId","eventType","resourceType","resourceId","details") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,randomUUID(),auth.organizationId,employeeId,auth.userId,eventType,resourceType,resourceId,JSON.stringify(details));
  };
  const currentComp=async(org:string,employeeId:string)=>{
    const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeCompensationHistory" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "effectiveDate"<=CURRENT_DATE AND ("endDate" IS NULL OR "endDate">=CURRENT_DATE) ORDER BY "effectiveDate" DESC,"createdAt" DESC LIMIT 1`,org,employeeId);
    return rows[0]||null;
  };
  const totals=async(org:string,payRunId:string)=>{
    const rows=await prisma.$queryRawUnsafe<Array<{gross:number;net:number}>>(`SELECT COALESCE(SUM("grossPay"),0)::float8 AS "gross",COALESCE(SUM("netPay"),0)::float8 AS "net" FROM "EmployeePayrollItem" WHERE "organizationId"=$1 AND "payRunId"=$2`,org,payRunId);
    await prisma.$executeRawUnsafe(`UPDATE "EmployeePayRun" SET "grossPayroll"=$1,"netPayroll"=$2,"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4`,rows[0]?.gross||0,rows[0]?.net||0,org,payRunId);
  };

  app.get('/api/admin/employee-compensation/dashboard',gate,async(_req,res,next)=>{try{
    await ready();const auth=authOf(res);const identity=await actorIdentity(auth);
    const [employees,compensation,profiles,deductions,plans,enrollments,payRuns]=await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT u."id",u."email",u."role"::text AS "role",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "displayName",p."jobTitle",p."department",COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus" FROM "User" u LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId" WHERE u."organizationId"=$1 ORDER BY "displayName"`,auth.organizationId),
      prisma.$queryRawUnsafe<any[]>(`SELECT DISTINCT ON ("employeeId") * FROM "EmployeeCompensationHistory" WHERE "organizationId"=$1 AND "effectiveDate"<=CURRENT_DATE AND ("endDate" IS NULL OR "endDate">=CURRENT_DATE) ORDER BY "employeeId","effectiveDate" DESC,"createdAt" DESC`,auth.organizationId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePayrollProfile" WHERE "organizationId"=$1`,auth.organizationId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePayrollDeduction" WHERE "organizationId"=$1 AND "active"=TRUE`,auth.organizationId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeBenefitPlan" WHERE "organizationId"=$1 ORDER BY "active" DESC,"planType","name"`,auth.organizationId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeBenefitEnrollment" WHERE "organizationId"=$1 ORDER BY "effectiveDate" DESC`,auth.organizationId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePayRun" WHERE "organizationId"=$1 ORDER BY "payDate" DESC,"createdAt" DESC LIMIT 100`,auth.organizationId),
    ]);
    const employeeRows=employees.map(row=>{const comp=compensation.find(item=>item.employeeId===row.id)||null;const profile=profiles.find(item=>item.employeeId===row.id)||null;return {...row,currentCompensation:comp,payrollProfile:profile,activeDeductionCount:deductions.filter(item=>item.employeeId===row.id).length,activeBenefitCount:enrollments.filter(item=>item.employeeId===row.id&&item.status==='ACTIVE').length}});
    res.json({data:{permissions:{actorIsOwner:identity.isOwner,readOnly:auth.role===UserRole.AUDITOR,canManage:writableRoles.has(auth.role)||identity.isOwner,canApprovePayroll:payrollRoles.has(auth.role)||identity.isOwner},metrics:{employeeCount:employees.length,missingCompensationCount:employeeRows.filter(row=>!row.currentCompensation).length,payrollHoldCount:profiles.filter(row=>row.payrollStatus==='ON_HOLD').length,activeBenefitEnrollmentCount:enrollments.filter(row=>row.status==='ACTIVE').length,draftPayRunCount:payRuns.filter(row=>row.status==='DRAFT').length,totalLatestGross:Number(payRuns.find(row=>['APPROVED','PAID'].includes(row.status))?.grossPayroll||0)},employees:employeeRows,benefitPlans:plans,enrollments,payRuns}});
  }catch(error){next(error)}});

  app.get('/api/admin/employees/:employeeId/compensation',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);const row=await employee(auth.organizationId,req.params.employeeId);
    const [history,profiles,deductions,enrollments,payItems,events]=await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeCompensationHistory" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "effectiveDate" DESC,"createdAt" DESC`,auth.organizationId,row.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePayrollProfile" WHERE "organizationId"=$1 AND "employeeId"=$2 LIMIT 1`,auth.organizationId,row.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePayrollDeduction" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "active" DESC,"priority","createdAt" DESC`,auth.organizationId,row.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT e.*,p."name" AS "planName",p."planType",p."carrier" FROM "EmployeeBenefitEnrollment" e JOIN "EmployeeBenefitPlan" p ON p."id"=e."benefitPlanId" AND p."organizationId"=e."organizationId" WHERE e."organizationId"=$1 AND e."employeeId"=$2 ORDER BY e."effectiveDate" DESC`,auth.organizationId,row.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT i.*,r."name" AS "payRunName",r."payDate",r."status" AS "payRunStatus" FROM "EmployeePayrollItem" i JOIN "EmployeePayRun" r ON r."id"=i."payRunId" AND r."organizationId"=i."organizationId" WHERE i."organizationId"=$1 AND i."employeeId"=$2 ORDER BY r."payDate" DESC LIMIT 100`,auth.organizationId,row.id),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeCompensationEvent" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC LIMIT 500`,auth.organizationId,row.id),
    ]);
    res.json({data:{employee:row,currentCompensation:history[0]||null,compensationHistory:history,payrollProfile:profiles[0]||null,deductions,enrollments,payItems,events}});
  }catch(error){next(error)}});

  app.post('/api/admin/employees/:employeeId/compensation',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);const row=await assertEmployee(auth,req.params.employeeId);const input=compensationSchema.parse(req.body);const id=randomUUID();
    await prisma.$executeRawUnsafe(`UPDATE "EmployeeCompensationHistory" SET "endDate"=($1::date - INTERVAL '1 day')::date WHERE "organizationId"=$2 AND "employeeId"=$3 AND "endDate" IS NULL AND "effectiveDate"<$1::date`,input.effectiveDate,auth.organizationId,row.id);
    const annualized=input.annualizedAmount??(input.payType==='HOURLY'?input.baseRate*input.standardHoursPerWeek*52:input.baseRate);
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeCompensationHistory" ("id","organizationId","employeeId","payType","baseRate","currency","annualizedAmount","standardHoursPerWeek","overtimeEligible","overtimeMultiplier","effectiveDate","endDate","reason","notes","createdById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,id,auth.organizationId,row.id,input.payType,input.baseRate,input.currency.toUpperCase(),annualized,input.standardHoursPerWeek,input.overtimeEligible,input.overtimeMultiplier,input.effectiveDate,input.endDate??null,input.reason,input.notes,auth.userId);
    await event(auth,row.id,'COMPENSATION_CHANGED','COMPENSATION',id,{payType:input.payType,baseRate:input.baseRate,effectiveDate:input.effectiveDate,reason:input.reason});await audit?.(auth,'CHANGE_EMPLOYEE_COMPENSATION','EmployeeCompensationHistory',id,{employeeId:row.id,payType:input.payType,effectiveDate:input.effectiveDate,reason:input.reason});
    res.status(201).json({data:{id}});
  }catch(error){next(error)}});

  app.put('/api/admin/employees/:employeeId/payroll-profile',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);const row=await assertEmployee(auth,req.params.employeeId);const input=payrollProfileSchema.parse(req.body);const id=randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePayrollProfile" ("id","organizationId","employeeId","payrollStatus","payFrequency","workState","taxFilingStatus","additionalFederalWithholding","additionalStateWithholding","directDepositEnabled","bankName","accountLast4","routingLast4","notes","updatedById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT ("organizationId","employeeId") DO UPDATE SET "payrollStatus"=EXCLUDED."payrollStatus","payFrequency"=EXCLUDED."payFrequency","workState"=EXCLUDED."workState","taxFilingStatus"=EXCLUDED."taxFilingStatus","additionalFederalWithholding"=EXCLUDED."additionalFederalWithholding","additionalStateWithholding"=EXCLUDED."additionalStateWithholding","directDepositEnabled"=EXCLUDED."directDepositEnabled","bankName"=EXCLUDED."bankName","accountLast4"=EXCLUDED."accountLast4","routingLast4"=EXCLUDED."routingLast4","notes"=EXCLUDED."notes","updatedById"=EXCLUDED."updatedById","updatedAt"=NOW()`,id,auth.organizationId,row.id,input.payrollStatus,input.payFrequency,input.workState.toUpperCase(),input.taxFilingStatus,input.additionalFederalWithholding,input.additionalStateWithholding,input.directDepositEnabled,input.bankName,input.accountLast4,input.routingLast4,input.notes,auth.userId);
    await event(auth,row.id,'PAYROLL_PROFILE_UPDATED','PAYROLL_PROFILE',row.id,{payrollStatus:input.payrollStatus,payFrequency:input.payFrequency,directDepositEnabled:input.directDepositEnabled});await audit?.(auth,'UPDATE_EMPLOYEE_PAYROLL_PROFILE','EmployeePayrollProfile',row.id,{employeeId:row.id,payrollStatus:input.payrollStatus});res.json({data:{employeeId:row.id}});
  }catch(error){next(error)}});

  app.post('/api/admin/employees/:employeeId/deductions',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);const row=await assertEmployee(auth,req.params.employeeId);const input=deductionSchema.parse(req.body);const id=randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePayrollDeduction" ("id","organizationId","employeeId","name","category","calculationType","amount","effectiveDate","endDate","active","priority","notes","createdById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,id,auth.organizationId,row.id,input.name,input.category,input.calculationType,input.amount,input.effectiveDate,input.endDate??null,input.active,input.priority,input.notes,auth.userId);
    await event(auth,row.id,'PAYROLL_DEDUCTION_CREATED','DEDUCTION',id,{name:input.name,category:input.category,amount:input.amount});await audit?.(auth,'CREATE_EMPLOYEE_PAYROLL_DEDUCTION','EmployeePayrollDeduction',id,{employeeId:row.id,name:input.name});res.status(201).json({data:{id}});
  }catch(error){next(error)}});

  app.patch('/api/admin/employee-compensation/deductions/:deductionId',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);const current=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePayrollDeduction" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.deductionId);if(!current[0])return void res.status(404).json({error:'Payroll deduction was not found'});await assertEmployee(auth,current[0].employeeId);const input=deductionSchema.parse({...current[0],...req.body});
    await prisma.$executeRawUnsafe(`UPDATE "EmployeePayrollDeduction" SET "name"=$1,"category"=$2,"calculationType"=$3,"amount"=$4,"effectiveDate"=$5,"endDate"=$6,"active"=$7,"priority"=$8,"notes"=$9,"updatedAt"=NOW() WHERE "organizationId"=$10 AND "id"=$11`,input.name,input.category,input.calculationType,input.amount,input.effectiveDate,input.endDate??null,input.active,input.priority,input.notes,auth.organizationId,req.params.deductionId);
    await event(auth,current[0].employeeId,'PAYROLL_DEDUCTION_UPDATED','DEDUCTION',req.params.deductionId,{name:input.name,active:input.active});await audit?.(auth,'UPDATE_EMPLOYEE_PAYROLL_DEDUCTION','EmployeePayrollDeduction',req.params.deductionId,{employeeId:current[0].employeeId});res.json({data:{id:req.params.deductionId}});
  }catch(error){next(error)}});

  app.post('/api/admin/employee-compensation/benefit-plans',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);const input=benefitPlanSchema.parse(req.body);const id=randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeBenefitPlan" ("id","organizationId","name","planType","carrier","policyNumber","description","employeeCost","employerCost","costFrequency","eligibilityWaitingDays","active","createdById","updatedById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,id,auth.organizationId,input.name,input.planType,input.carrier,input.policyNumber,input.description,input.employeeCost,input.employerCost,input.costFrequency,input.eligibilityWaitingDays,input.active,auth.userId);
    await audit?.(auth,'CREATE_EMPLOYEE_BENEFIT_PLAN','EmployeeBenefitPlan',id,{name:input.name,planType:input.planType});res.status(201).json({data:{id}});
  }catch(error){next(error)}});

  app.patch('/api/admin/employee-compensation/benefit-plans/:planId',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);const current=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeBenefitPlan" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.planId);if(!current[0])return void res.status(404).json({error:'Benefit plan was not found'});const input=benefitPlanSchema.parse({...current[0],...req.body});
    await prisma.$executeRawUnsafe(`UPDATE "EmployeeBenefitPlan" SET "name"=$1,"planType"=$2,"carrier"=$3,"policyNumber"=$4,"description"=$5,"employeeCost"=$6,"employerCost"=$7,"costFrequency"=$8,"eligibilityWaitingDays"=$9,"active"=$10,"updatedById"=$11,"updatedAt"=NOW() WHERE "organizationId"=$12 AND "id"=$13`,input.name,input.planType,input.carrier,input.policyNumber,input.description,input.employeeCost,input.employerCost,input.costFrequency,input.eligibilityWaitingDays,input.active,auth.userId,auth.organizationId,req.params.planId);await audit?.(auth,'UPDATE_EMPLOYEE_BENEFIT_PLAN','EmployeeBenefitPlan',req.params.planId,{name:input.name});res.json({data:{id:req.params.planId}});
  }catch(error){next(error)}});

  app.post('/api/admin/employees/:employeeId/benefit-enrollments',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);const row=await assertEmployee(auth,req.params.employeeId);const input=enrollmentSchema.parse(req.body);const plan=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeBenefitPlan" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,input.benefitPlanId);if(!plan[0])return void res.status(404).json({error:'Benefit plan was not found'});const id=randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeeBenefitEnrollment" ("id","organizationId","employeeId","benefitPlanId","coverageTier","status","effectiveDate","endDate","employeeContribution","employerContribution","dependentCount","notes","createdById","updatedById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,id,auth.organizationId,row.id,input.benefitPlanId,input.coverageTier,input.status,input.effectiveDate,input.endDate??null,input.employeeContribution,input.employerContribution,input.dependentCount,input.notes,auth.userId);
    await event(auth,row.id,'BENEFIT_ENROLLMENT_CREATED','BENEFIT_ENROLLMENT',id,{planId:input.benefitPlanId,coverageTier:input.coverageTier,status:input.status});await audit?.(auth,'CREATE_EMPLOYEE_BENEFIT_ENROLLMENT','EmployeeBenefitEnrollment',id,{employeeId:row.id,benefitPlanId:input.benefitPlanId});res.status(201).json({data:{id}});
  }catch(error){next(error)}});

  app.patch('/api/admin/employee-compensation/enrollments/:enrollmentId',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);const current=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeBenefitEnrollment" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.enrollmentId);if(!current[0])return void res.status(404).json({error:'Benefit enrollment was not found'});await assertEmployee(auth,current[0].employeeId);const input=enrollmentSchema.parse({...current[0],...req.body});
    await prisma.$executeRawUnsafe(`UPDATE "EmployeeBenefitEnrollment" SET "benefitPlanId"=$1,"coverageTier"=$2,"status"=$3,"effectiveDate"=$4,"endDate"=$5,"employeeContribution"=$6,"employerContribution"=$7,"dependentCount"=$8,"notes"=$9,"updatedById"=$10,"updatedAt"=NOW() WHERE "organizationId"=$11 AND "id"=$12`,input.benefitPlanId,input.coverageTier,input.status,input.effectiveDate,input.endDate??null,input.employeeContribution,input.employerContribution,input.dependentCount,input.notes,auth.userId,auth.organizationId,req.params.enrollmentId);await event(auth,current[0].employeeId,'BENEFIT_ENROLLMENT_UPDATED','BENEFIT_ENROLLMENT',req.params.enrollmentId,{status:input.status,coverageTier:input.coverageTier});await audit?.(auth,'UPDATE_EMPLOYEE_BENEFIT_ENROLLMENT','EmployeeBenefitEnrollment',req.params.enrollmentId,{employeeId:current[0].employeeId});res.json({data:{id:req.params.enrollmentId}});
  }catch(error){next(error)}});

  app.post('/api/admin/employee-compensation/pay-runs',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);const input=payRunSchema.parse(req.body);const id=randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePayRun" ("id","organizationId","name","periodStart","periodEnd","payDate","status","notes","createdById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,id,auth.organizationId,input.name,input.periodStart,input.periodEnd,input.payDate,input.status,input.notes,auth.userId);await audit?.(auth,'CREATE_EMPLOYEE_PAY_RUN','EmployeePayRun',id,{name:input.name,payDate:input.payDate});res.status(201).json({data:{id}});
  }catch(error){next(error)}});

  app.get('/api/admin/employee-compensation/pay-runs/:payRunId',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);const runs=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePayRun" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.payRunId);if(!runs[0])return void res.status(404).json({error:'Pay run was not found'});const items=await prisma.$queryRawUnsafe<any[]>(`SELECT i.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "employeeName" FROM "EmployeePayrollItem" i JOIN "User" u ON u."id"=i."employeeId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId" WHERE i."organizationId"=$1 AND i."payRunId"=$2 ORDER BY "employeeName"`,auth.organizationId,req.params.payRunId);res.json({data:{payRun:runs[0],items}});
  }catch(error){next(error)}});

  app.put('/api/admin/employee-compensation/pay-runs/:payRunId/items/:employeeId',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);await requireWritable(auth);await assertEmployee(auth,req.params.employeeId);const input=payrollItemSchema.parse({...req.body,employeeId:req.params.employeeId});const run=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePayRun" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.payRunId);if(!run[0])return void res.status(404).json({error:'Pay run was not found'});if(!['DRAFT','PROCESSING'].includes(run[0].status))return void res.status(409).json({error:'Only draft or processing pay runs can be edited'});const comp=await currentComp(auth.organizationId,input.employeeId);if(!comp)return void res.status(409).json({error:'Employee has no active compensation record'});
    const hourly=comp.payType==='HOURLY'?Number(comp.baseRate):Number(comp.annualizedAmount||comp.baseRate)/(52*Number(comp.standardHoursPerWeek||40));const regularEarnings=input.regularHours*hourly;const overtimeEarnings=input.overtimeHours*hourly*Number(comp.overtimeMultiplier||1.5);const holidayEarnings=input.holidayHours*hourly;const ptoEarnings=input.ptoHours*hourly;const grossPay=regularEarnings+overtimeEarnings+holidayEarnings+ptoEarnings+input.otherEarnings+input.bonus;const netPay=Math.max(0,grossPay-input.taxes-input.deductions)+input.reimbursement;const id=randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "EmployeePayrollItem" ("id","organizationId","payRunId","employeeId","regularHours","overtimeHours","holidayHours","ptoHours","regularEarnings","overtimeEarnings","holidayEarnings","ptoEarnings","otherEarnings","bonus","reimbursement","grossPay","taxes","deductions","netPay","notes","createdById") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT ("organizationId","payRunId","employeeId") DO UPDATE SET "regularHours"=EXCLUDED."regularHours","overtimeHours"=EXCLUDED."overtimeHours","holidayHours"=EXCLUDED."holidayHours","ptoHours"=EXCLUDED."ptoHours","regularEarnings"=EXCLUDED."regularEarnings","overtimeEarnings"=EXCLUDED."overtimeEarnings","holidayEarnings"=EXCLUDED."holidayEarnings","ptoEarnings"=EXCLUDED."ptoEarnings","otherEarnings"=EXCLUDED."otherEarnings","bonus"=EXCLUDED."bonus","reimbursement"=EXCLUDED."reimbursement","grossPay"=EXCLUDED."grossPay","taxes"=EXCLUDED."taxes","deductions"=EXCLUDED."deductions","netPay"=EXCLUDED."netPay","notes"=EXCLUDED."notes","updatedAt"=NOW()`,id,auth.organizationId,req.params.payRunId,input.employeeId,input.regularHours,input.overtimeHours,input.holidayHours,input.ptoHours,regularEarnings,overtimeEarnings,holidayEarnings,ptoEarnings,input.otherEarnings,input.bonus,input.reimbursement,grossPay,input.taxes,input.deductions,netPay,input.notes,auth.userId);await totals(auth.organizationId,req.params.payRunId);await event(auth,input.employeeId,'PAYROLL_ITEM_UPDATED','PAYROLL_ITEM',req.params.payRunId,{grossPay,netPay});res.json({data:{grossPay,netPay}});
  }catch(error){next(error)}});

  app.post('/api/admin/employee-compensation/pay-runs/:payRunId/status',gate,async(req,res,next)=>{try{
    await ready();const auth=authOf(res);const identity=await requireWritable(auth);if(!identity.isOwner&&!payrollRoles.has(auth.role))return void res.status(403).json({error:'You are not authorized to approve payroll'});const status=z.enum(['PROCESSING','APPROVED','PAID','VOID']).parse(req.body?.status);const run=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeePayRun" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.payRunId);if(!run[0])return void res.status(404).json({error:'Pay run was not found'});await prisma.$executeRawUnsafe(`UPDATE "EmployeePayRun" SET "status"=$1,"approvedById"=CASE WHEN $1='APPROVED' THEN $2 ELSE "approvedById" END,"approvedAt"=CASE WHEN $1='APPROVED' THEN NOW() ELSE "approvedAt" END,"paidAt"=CASE WHEN $1='PAID' THEN NOW() ELSE "paidAt" END,"updatedAt"=NOW() WHERE "organizationId"=$3 AND "id"=$4`,status,auth.userId,auth.organizationId,req.params.payRunId);await audit?.(auth,'CHANGE_EMPLOYEE_PAY_RUN_STATUS','EmployeePayRun',req.params.payRunId,{status});res.json({data:{id:req.params.payRunId,status}});
  }catch(error){next(error)}});

  app.get('/api/employee/me/compensation',async(_req,res,next)=>{try{
    await ready();const auth=authOf(res);const row=await employee(auth.organizationId,auth.userId);const [history,profiles,deductions,enrollments,payItems]=await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeCompensationHistory" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "effectiveDate" DESC`,auth.organizationId,auth.userId),
      prisma.$queryRawUnsafe<any[]>(`SELECT "payrollStatus","payFrequency","workState","directDepositEnabled","bankName","accountLast4","routingLast4","updatedAt" FROM "EmployeePayrollProfile" WHERE "organizationId"=$1 AND "employeeId"=$2 LIMIT 1`,auth.organizationId,auth.userId),
      prisma.$queryRawUnsafe<any[]>(`SELECT "id","name","category","calculationType","amount","effectiveDate","endDate","active" FROM "EmployeePayrollDeduction" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "active" DESC,"priority"`,auth.organizationId,auth.userId),
      prisma.$queryRawUnsafe<any[]>(`SELECT e.*,p."name" AS "planName",p."planType",p."carrier",p."description" FROM "EmployeeBenefitEnrollment" e JOIN "EmployeeBenefitPlan" p ON p."id"=e."benefitPlanId" AND p."organizationId"=e."organizationId" WHERE e."organizationId"=$1 AND e."employeeId"=$2 ORDER BY e."effectiveDate" DESC`,auth.organizationId,auth.userId),
      prisma.$queryRawUnsafe<any[]>(`SELECT i."id",i."payRunId",i."regularHours",i."overtimeHours",i."holidayHours",i."ptoHours",i."regularEarnings",i."overtimeEarnings",i."holidayEarnings",i."ptoEarnings",i."otherEarnings",i."bonus",i."reimbursement",i."grossPay",i."taxes",i."deductions",i."netPay",r."name" AS "payRunName",r."payDate",r."periodStart",r."periodEnd",r."status" AS "payRunStatus" FROM "EmployeePayrollItem" i JOIN "EmployeePayRun" r ON r."id"=i."payRunId" AND r."organizationId"=i."organizationId" WHERE i."organizationId"=$1 AND i."employeeId"=$2 AND r."status" IN ('APPROVED','PAID') ORDER BY r."payDate" DESC LIMIT 100`,auth.organizationId,auth.userId),
    ]);
    res.json({data:{employee:row,currentCompensation:history[0]||null,compensationHistory:history,payrollProfile:profiles[0]||null,deductions,enrollments,payStatements:payItems,metrics:{yearToDateGross:payItems.filter(item=>new Date(item.payDate).getFullYear()===new Date().getFullYear()).reduce((sum,item)=>sum+Number(item.grossPay||0),0),yearToDateNet:payItems.filter(item=>new Date(item.payDate).getFullYear()===new Date().getFullYear()).reduce((sum,item)=>sum+Number(item.netPay||0),0),activeBenefits:enrollments.filter(item=>item.status==='ACTIVE').length,activeDeductions:deductions.filter(item=>item.active).length}}});
  }catch(error){next(error)}});
}
