import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { evaluateSpireDoddBilling, recordSpireDoddBillingDecision } from './spire-dodd-billing-rules.js';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;legalEntityId?:string;enterpriseOwner?:boolean};
type Deps={authOf:(response:express.Response)=>AuthContext};
type DecisionSummary={serviceEventId:string;ruleVersionId:string|null;blockers:string[];warnings:string[];details:Record<string,unknown>};
const readers=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.BILLING_SPECIALIST,UserRole.AUDITOR,UserRole.CEO,UserRole.DOO]);
const writers=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.BILLING_SPECIALIST,UserRole.CEO,UserRole.DOO]);
const ruleAdmins=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.BILLING_SPECIALIST,UserRole.CEO,UserRole.DOO]);
const owner=(a:AuthContext)=>a.enterpriseOwner===true||String(a.email||'').trim().toLowerCase()==='admin@sulandrahealth.com';
const httpError=(status:number,message:string,details?:unknown)=>Object.assign(new Error(message),{status,details});
const entity=(a:AuthContext)=>{if(!a.legalEntityId)throw httpError(409,'Select a Sulandra company before DODD billing validation');return a.legalEntityId;};
const ensureRead=(a:AuthContext)=>{entity(a);if(!readers.has(a.role)&&!owner(a))throw httpError(403,'DODD billing validation access is required');};
const ensureWrite=(a:AuthContext)=>{ensureRead(a);if(!writers.has(a.role)&&!owner(a))throw httpError(403,'DODD billing validation write access is required');};
const ensureRuleAdmin=(a:AuthContext)=>{ensureRead(a);if(!ruleAdmins.has(a.role)&&!owner(a))throw httpError(403,'DODD billing-rule configuration access is required');};
const clean=(value:unknown,max=5000)=>String(value??'').trim().slice(0,max);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ruleSchema=z.object({
  ruleCode:z.string().trim().min(2).max(160),name:z.string().trim().min(2).max(300),serviceFamily:z.string().trim().min(1).max(160),
  serviceCode:z.string().trim().max(120).optional().nullable(),effectiveFrom:date,effectiveTo:date.optional().nullable(),priority:z.coerce.number().int().min(0).max(10000).default(500),
  unitMethod:z.enum(['CONFIGURED','FIFTEEN_MINUTE_DAILY_AGGREGATE','FIFTEEN_MINUTE','DAILY','PER_TRIP','PER_MILE','PER_JOB']).default('CONFIGURED'),
  requiresAuthorization:z.boolean().default(true),requiresSignedServiceDocument:z.boolean().default(true),requiresEvv:z.boolean().default(false),requiresGroupSize:z.boolean().default(false),
  ruleConfig:z.record(z.unknown()).default({}),authority:z.string().trim().min(2).max(1000),authorityUrl:z.string().trim().url().max(2000).optional().nullable(),reviewedOn:date,
}).refine((v)=>!v.effectiveTo||v.effectiveTo>=v.effectiveFrom,{message:'effectiveTo must be on or after effectiveFrom'});

async function eventRow(p:PrismaClient,a:AuthContext,id:string){const rows=await p.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "RevenueCycleServiceEvent" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,a.organizationId,entity(a),id);if(!rows[0])throw httpError(404,'Revenue service event was not found');return rows[0];}

export const registerSpireDoddBillingRuleRoutes=(app:express.Express,p:PrismaClient,deps:Deps)=>{const{authOf}=deps;
  app.get('/api/revenue-cycle/dodd-rules',async(req,res,next)=>{try{const a=authOf(res);ensureRead(a);const at=clean(req.query.at,20)||null,family=clean(req.query.serviceFamily,160),code=clean(req.query.serviceCode,120);const rows=await p.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "SpireDoddBillingRuleVersion" WHERE ("scope"='SYSTEM' OR ("scope"='ENTITY' AND "organizationId"=$1 AND "legalEntityId"=$2)) AND ($3::date IS NULL OR ("effectiveFrom"<=$3::date AND ("effectiveTo" IS NULL OR "effectiveTo">=$3::date))) AND ($4::text='' OR "serviceFamily"='*' OR "serviceFamily"=$4) AND ($5::text='' OR "serviceCode" IS NULL OR "serviceCode"=$5) ORDER BY CASE WHEN "scope"='ENTITY' THEN 0 ELSE 1 END,"serviceFamily","ruleCode","effectiveFrom" DESC,"version" DESC`,a.organizationId,entity(a),at,family,code);res.json({data:rows});}catch(e){next(e);}});

  app.post('/api/revenue-cycle/dodd-rules',async(req,res,next)=>{try{const a=authOf(res);ensureRuleAdmin(a);const i=ruleSchema.parse(req.body);const versions=await p.$queryRawUnsafe<Array<{version:number}>>(`SELECT COALESCE(max("version"),0)::int+1 AS version FROM "SpireDoddBillingRuleVersion" WHERE "scope"='ENTITY' AND "organizationId"=$1 AND "legalEntityId"=$2 AND "ruleCode"=$3`,a.organizationId,entity(a),i.ruleCode);const version=Number(versions[0]?.version||1);const rows=await p.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireDoddBillingRuleVersion"("organizationId","legalEntityId","scope","ruleCode","version","name","serviceFamily","serviceCode","effectiveFrom","effectiveTo","priority","unitMethod","requiresAuthorization","requiresSignedServiceDocument","requiresEvv","requiresGroupSize","ruleConfig","authority","authorityUrl","reviewedOn","createdByUserId") VALUES($1,$2,'ENTITY',$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19::date,$20) RETURNING *`,a.organizationId,entity(a),i.ruleCode,version,i.name,i.serviceFamily,i.serviceCode??null,i.effectiveFrom,i.effectiveTo??null,i.priority,i.unitMethod,i.requiresAuthorization,i.requiresSignedServiceDocument,i.requiresEvv,i.requiresGroupSize,JSON.stringify(i.ruleConfig),i.authority,i.authorityUrl??null,i.reviewedOn,a.userId);res.status(201).json({data:rows[0]});}catch(e){next(e);}});

  app.get('/api/revenue-cycle/events/:eventId/dodd-readiness',async(req,res,next)=>{try{const a=authOf(res);ensureRead(a);const event=await eventRow(p,a,req.params.eventId);res.json({data:await evaluateSpireDoddBilling(p,{organizationId:a.organizationId,legalEntityId:entity(a),event})});}catch(e){next(e);}});

  app.get('/api/revenue-cycle/events/:eventId/dodd-validation-history',async(req,res,next)=>{try{const a=authOf(res);ensureRead(a);await eventRow(p,a,req.params.eventId);const rows=await p.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT d.*,r."ruleCode",r."version" AS "ruleVersion",r."name" AS "ruleName",r."authority",r."reviewedOn" FROM "SpireDoddBillingValidationDecision" d LEFT JOIN "SpireDoddBillingRuleVersion" r ON r."id"=d."ruleVersionId" WHERE d."organizationId"=$1 AND d."legalEntityId"=$2 AND d."serviceEventId"=$3 ORDER BY d."createdAt" DESC`,a.organizationId,entity(a),req.params.eventId);res.json({data:rows});}catch(e){next(e);}});

  // EVV gate runs first. This DODD rule gate runs second. Both must pass before
  // the existing Revenue Cycle READY owner is allowed to mutate billable status.
  app.post('/api/revenue-cycle/events/:eventId/action',async(req,res,next)=>{if(clean(req.body?.action,40).toUpperCase()!=='READY')return void next();try{const a=authOf(res);ensureWrite(a);const event=await eventRow(p,a,req.params.eventId);const decision=await evaluateSpireDoddBilling(p,{organizationId:a.organizationId,legalEntityId:entity(a),event});if(decision.required)await recordSpireDoddBillingDecision(p,{organizationId:a.organizationId,legalEntityId:entity(a),actorUserId:a.userId,action:'READY',decision});if(decision.required&&!decision.ready)throw httpError(409,'DODD billing validation failed. This service cannot be marked READY.',{code:'DODD_BILLING_RULE_FAILED',doddBilling:decision});next();}catch(e){next(e);}});

  // Re-evaluate at batch boundary so later rule versions, signed-document changes,
  // authorization corrections or same-day conflicts cannot bypass the hard stop.
  app.post('/api/revenue-cycle/batches',async(req,res,next)=>{if(!Array.isArray(req.body?.serviceEventIds)||!req.body.serviceEventIds.length)return void next();try{const a=authOf(res);ensureWrite(a);const ids=[...new Set(req.body.serviceEventIds.map((value:unknown)=>clean(value,160)).filter(Boolean))];if(!ids.length)return void next();const rows=await p.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "RevenueCycleServiceEvent" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=ANY($3::text[])`,a.organizationId,entity(a),ids);if(rows.length!==ids.length)return void next();const failed:DecisionSummary[]=[];for(const event of rows){const decision=await evaluateSpireDoddBilling(p,{organizationId:a.organizationId,legalEntityId:entity(a),event});if(!decision.required)continue;await recordSpireDoddBillingDecision(p,{organizationId:a.organizationId,legalEntityId:entity(a),actorUserId:a.userId,action:'BATCH',decision});if(!decision.ready)failed.push(decision);}if(failed.length)throw httpError(409,'DODD billing validation failed. One or more services cannot enter a billing batch.',{code:'DODD_BILLING_BATCH_BLOCKED',failed});next();}catch(e){next(e);}});
};
