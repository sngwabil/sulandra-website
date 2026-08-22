import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;legalEntityId?:string;enterpriseOwner?:boolean};
type Deps={authOf:(response:express.Response)=>AuthContext};

type DriverProfile={
  id:string;
  active:boolean;
  userId:string|null;
  displayName:string;
};

type Qualification={
  active:boolean;
  licenseNumber:string|null;
  licenseState:string|null;
  licenseVerifiedAt:Date|string|null;
  licenseExpiresAt:Date|string|null;
  bmvCheckedAt:Date|string|null;
  bmvPoints:number|null;
  insuranceStatus:string;
  insuranceVerifiedAt:Date|string|null;
  insuranceExpiresAt:Date|string|null;
  backgroundStatus:string;
  backgroundVerifiedAt:Date|string|null;
  postAccidentRestricted:boolean;
  postAccidentClearanceAt:Date|string|null;
};

export type NmtDriverEligibility={eligible:boolean;blockers:string[];profile:DriverProfile|null;qualification:Qualification|null};

const adminRoles=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.HR_MANAGER,UserRole.ADMINISTRATIVE_ASSISTANT,UserRole.SCHEDULER,UserRole.CEO,UserRole.DOO]);
const owner=(a:AuthContext)=>a.enterpriseOwner===true||String(a.email||'').trim().toLowerCase()==='admin@sulandrahealth.com';
const httpError=(status:number,message:string,details?:unknown)=>Object.assign(new Error(message),{status,details});
const entity=(a:AuthContext)=>{if(!a.legalEntityId)throw httpError(409,'Select Sulandra NMT Services first');return a.legalEntityId;};
const ensureAdmin=(a:AuthContext)=>{if(!adminRoles.has(a.role)&&!owner(a))throw httpError(403,'NMT workforce qualification administration access is required');entity(a);};
const asDate=(value:Date|string|null|undefined)=>value?new Date(value):null;
const validDate=(value:Date|null)=>Boolean(value&&!Number.isNaN(value.getTime()));

const qualificationSchema=z.object({
  active:z.boolean().default(true),
  licenseNumber:z.string().trim().min(1).max(120),
  licenseState:z.string().trim().min(2).max(40),
  licenseVerifiedAt:z.string().datetime(),
  licenseExpiresAt:z.string().datetime(),
  bmvCheckedAt:z.string().datetime(),
  bmvPoints:z.number().int().min(0).max(99),
  insuranceStatus:z.enum(['VERIFIED','PENDING','FAILED','EXPIRED']),
  insuranceVerifiedAt:z.string().datetime(),
  insuranceExpiresAt:z.string().datetime(),
  backgroundStatus:z.enum(['VERIFIED','PENDING','FAILED','EXPIRED']),
  backgroundVerifiedAt:z.string().datetime(),
  postAccidentRestricted:z.boolean().default(false),
  postAccidentClearanceAt:z.string().datetime().optional().nullable(),
  reviewerNote:z.string().trim().max(4000).optional().nullable(),
});

export async function ensureNmtDriverQualificationSchema(prisma:PrismaClient){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NmtDriverQualification"(
    "id" TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "licenseNumber" TEXT,
    "licenseState" TEXT,
    "licenseVerifiedAt" TIMESTAMPTZ,
    "licenseExpiresAt" TIMESTAMPTZ,
    "bmvCheckedAt" TIMESTAMPTZ,
    "bmvPoints" INTEGER,
    "insuranceStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "insuranceVerifiedAt" TIMESTAMPTZ,
    "insuranceExpiresAt" TIMESTAMPTZ,
    "backgroundStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "backgroundVerifiedAt" TIMESTAMPTZ,
    "postAccidentRestricted" BOOLEAN NOT NULL DEFAULT FALSE,
    "postAccidentClearanceAt" TIMESTAMPTZ,
    "reviewerNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "NmtDriverQualification" ADD COLUMN IF NOT EXISTS "licenseNumber" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "NmtDriverQualification" ADD COLUMN IF NOT EXISTS "licenseState" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "NmtDriverQualification" ADD COLUMN IF NOT EXISTS "licenseExpiresAt" TIMESTAMPTZ`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "NmtDriverQualification_scope_driver_uq" ON "NmtDriverQualification"("organizationId","legalEntityId","driverId")`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "NmtDispatchQualificationDecision"(
    "id" TEXT PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "orderId" TEXT,
    "driverId" TEXT NOT NULL,
    "serviceDate" TIMESTAMPTZ NOT NULL,
    "decision" TEXT NOT NULL,
    "blockers" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "decidedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "NmtDispatchQualificationDecision_lookup_idx" ON "NmtDispatchQualificationDecision"("organizationId","legalEntityId","driverId","createdAt" DESC)`);
}

export function computeNmtDriverQualificationBlockers(profile:DriverProfile|null,qualification:Qualification|null,serviceDate:Date){
  const blockers:string[]=[];
  if(!profile)return['DRIVER_PROFILE_MISSING'];
  if(!profile.active)blockers.push('DRIVER_PROFILE_INACTIVE');

  if(!qualification)return[...blockers,'DRIVER_QUALIFICATION_EVIDENCE_MISSING'];
  if(!qualification.active)blockers.push('DRIVER_QUALIFICATION_INACTIVE');
  if(!qualification.licenseNumber)blockers.push('DRIVER_LICENSE_NUMBER_MISSING');
  if(!qualification.licenseState)blockers.push('DRIVER_LICENSE_STATE_MISSING');
  if(!qualification.licenseVerifiedAt)blockers.push('DRIVER_LICENSE_NOT_VERIFIED');
  const licenseExpiresAt=asDate(qualification.licenseExpiresAt);
  if(!validDate(licenseExpiresAt))blockers.push('DRIVER_LICENSE_EXPIRATION_MISSING');
  else if(licenseExpiresAt!.getTime()<serviceDate.getTime())blockers.push('DRIVER_LICENSE_EXPIRED_FOR_SERVICE_DATE');

  const bmvCheckedAt=asDate(qualification.bmvCheckedAt);
  if(!validDate(bmvCheckedAt))blockers.push('BMV_RECORD_CHECK_MISSING');
  else{
    const oldestAllowed=new Date(serviceDate);
    oldestAllowed.setUTCFullYear(oldestAllowed.getUTCFullYear()-3);
    if(bmvCheckedAt!.getTime()<oldestAllowed.getTime())blockers.push('BMV_RECORD_CHECK_OUTDATED');
    if(bmvCheckedAt!.getTime()>serviceDate.getTime())blockers.push('BMV_RECORD_CHECK_AFTER_SERVICE_DATE');
  }
  if(qualification.bmvPoints===null||qualification.bmvPoints===undefined)blockers.push('BMV_POINTS_MISSING');
  else if(qualification.bmvPoints>=6)blockers.push('BMV_POINTS_DISQUALIFY_DRIVER');

  if(qualification.insuranceStatus!=='VERIFIED')blockers.push('DRIVER_INSURANCE_NOT_VERIFIED');
  if(!qualification.insuranceVerifiedAt)blockers.push('DRIVER_INSURANCE_VERIFICATION_DATE_MISSING');
  const insuranceExpiresAt=asDate(qualification.insuranceExpiresAt);
  if(!validDate(insuranceExpiresAt))blockers.push('DRIVER_INSURANCE_EXPIRATION_MISSING');
  else if(insuranceExpiresAt!.getTime()<serviceDate.getTime())blockers.push('DRIVER_INSURANCE_EXPIRED_FOR_SERVICE_DATE');

  if(qualification.backgroundStatus!=='VERIFIED')blockers.push('DRIVER_BACKGROUND_NOT_VERIFIED');
  if(!qualification.backgroundVerifiedAt)blockers.push('DRIVER_BACKGROUND_VERIFICATION_DATE_MISSING');
  if(qualification.postAccidentRestricted)blockers.push('POST_ACCIDENT_CLEARANCE_REQUIRED');

  return [...new Set(blockers)];
}

export async function evaluateNmtDriverEligibility(prisma:PrismaClient,input:{organizationId:string;legalEntityId:string;driverId:string;serviceDate:Date}):Promise<NmtDriverEligibility>{
  await ensureNmtDriverQualificationSchema(prisma);
  const profiles=await prisma.$queryRawUnsafe<DriverProfile[]>(`SELECT "id","active","userId","displayName" FROM "NmtDriverAssignmentProfile" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,input.organizationId,input.legalEntityId,input.driverId);
  const qualifications=await prisma.$queryRawUnsafe<Qualification[]>(`SELECT "active","licenseNumber","licenseState","licenseVerifiedAt","licenseExpiresAt","bmvCheckedAt","bmvPoints","insuranceStatus","insuranceVerifiedAt","insuranceExpiresAt","backgroundStatus","backgroundVerifiedAt","postAccidentRestricted","postAccidentClearanceAt" FROM "NmtDriverQualification" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "driverId"=$3 LIMIT 1`,input.organizationId,input.legalEntityId,input.driverId);
  const profile=profiles[0]||null,qualification=qualifications[0]||null;
  const blockers=computeNmtDriverQualificationBlockers(profile,qualification,input.serviceDate);
  return{eligible:blockers.length===0,blockers,profile,qualification};
}

async function recordDecision(prisma:PrismaClient,input:{organizationId:string;legalEntityId:string;orderId?:string;driverId:string;serviceDate:Date;decision:'ALLOW'|'DENY';blockers:string[];actorUserId:string}){
  await prisma.$executeRawUnsafe(`INSERT INTO "NmtDispatchQualificationDecision"("id","organizationId","legalEntityId","orderId","driverId","serviceDate","decision","blockers","decidedById") VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,randomUUID(),input.organizationId,input.legalEntityId,input.orderId??null,input.driverId,input.serviceDate,input.decision,JSON.stringify(input.blockers),input.actorUserId);
}

export async function assertNmtDriverEligible(prisma:PrismaClient,input:{organizationId:string;legalEntityId:string;driverId:string;serviceDate:Date;actorUserId:string;orderId?:string}){
  const result=await evaluateNmtDriverEligibility(prisma,input);
  await recordDecision(prisma,{...input,decision:result.eligible?'ALLOW':'DENY',blockers:result.blockers});
  if(!result.eligible)throw httpError(409,'DODD NMT ride assignment blocked because the selected driver does not have active, verified qualifications',{code:'NMT_DRIVER_NOT_ELIGIBLE',blockers:result.blockers});
  return result;
}

export const registerNmtDriverQualificationRoutes=(app:express.Express,prisma:PrismaClient,deps:Deps)=>{const{authOf}=deps;
  app.get('/api/admin/nmt/drivers/:driverId/qualification',async(req,res,next)=>{try{const a=authOf(res);ensureAdmin(a);await ensureNmtDriverQualificationSchema(prisma);const driverId=String(req.params.driverId||'').trim();const profile=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "id","active","userId","displayName" FROM "NmtDriverAssignmentProfile" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,a.organizationId,entity(a),driverId);if(!profile[0])throw httpError(404,'NMT driver was not found');const qualification=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "NmtDriverQualification" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "driverId"=$3 LIMIT 1`,a.organizationId,entity(a),driverId);res.json({data:{driver:profile[0],qualification:qualification[0]||null}});}catch(e){next(e);}});

  app.put('/api/admin/nmt/drivers/:driverId/qualification',async(req,res,next)=>{try{const a=authOf(res);ensureAdmin(a);await ensureNmtDriverQualificationSchema(prisma);const driverId=String(req.params.driverId||'').trim();const profile=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "NmtDriverAssignmentProfile" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,a.organizationId,entity(a),driverId);if(!profile[0])throw httpError(404,'NMT driver was not found');const i=qualificationSchema.parse(req.body);const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "NmtDriverQualification"("id","organizationId","legalEntityId","driverId","active","licenseNumber","licenseState","licenseVerifiedAt","licenseExpiresAt","bmvCheckedAt","bmvPoints","insuranceStatus","insuranceVerifiedAt","insuranceExpiresAt","backgroundStatus","backgroundVerifiedAt","postAccidentRestricted","postAccidentClearanceAt","reviewerNote","reviewedById","reviewedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::timestamptz,$11,$12,$13::timestamptz,$14::timestamptz,$15,$16::timestamptz,$17,$18::timestamptz,$19,$20,NOW()) ON CONFLICT("organizationId","legalEntityId","driverId") DO UPDATE SET "active"=EXCLUDED."active","licenseNumber"=EXCLUDED."licenseNumber","licenseState"=EXCLUDED."licenseState","licenseVerifiedAt"=EXCLUDED."licenseVerifiedAt","licenseExpiresAt"=EXCLUDED."licenseExpiresAt","bmvCheckedAt"=EXCLUDED."bmvCheckedAt","bmvPoints"=EXCLUDED."bmvPoints","insuranceStatus"=EXCLUDED."insuranceStatus","insuranceVerifiedAt"=EXCLUDED."insuranceVerifiedAt","insuranceExpiresAt"=EXCLUDED."insuranceExpiresAt","backgroundStatus"=EXCLUDED."backgroundStatus","backgroundVerifiedAt"=EXCLUDED."backgroundVerifiedAt","postAccidentRestricted"=EXCLUDED."postAccidentRestricted","postAccidentClearanceAt"=EXCLUDED."postAccidentClearanceAt","reviewerNote"=EXCLUDED."reviewerNote","reviewedById"=EXCLUDED."reviewedById","reviewedAt"=NOW(),"updatedAt"=NOW() RETURNING *`,randomUUID(),a.organizationId,entity(a),driverId,i.active,i.licenseNumber,i.licenseState,i.licenseVerifiedAt,i.licenseExpiresAt,i.bmvCheckedAt,i.bmvPoints,i.insuranceStatus,i.insuranceVerifiedAt,i.insuranceExpiresAt,i.backgroundStatus,i.backgroundVerifiedAt,i.postAccidentRestricted,i.postAccidentClearanceAt??null,i.reviewerNote??null,a.userId);res.json({data:rows[0]});}catch(e){next(e);}});

  app.get('/api/admin/nmt/drivers/:driverId/eligibility',async(req,res,next)=>{try{const a=authOf(res);ensureAdmin(a);const raw=String(req.query.serviceDate||'').trim();const serviceDate=raw?new Date(raw):new Date();if(Number.isNaN(serviceDate.getTime()))throw httpError(400,'A valid serviceDate is required');const result=await evaluateNmtDriverEligibility(prisma,{organizationId:a.organizationId,legalEntityId:entity(a),driverId:String(req.params.driverId||'').trim(),serviceDate});res.json({data:{driverId:req.params.driverId,serviceDate:serviceDate.toISOString(),...result}});}catch(e){next(e);}});
};
