import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string};
type AuditFn=(auth:Partial<AuthContext>,action:string,resourceType:string,resourceId?:string,metadata?:object)=>Promise<void>;
type Dependencies={app:Express;prisma:PrismaClient;authOf:(response:Response)=>AuthContext;requireRoles:(...roles:UserRole[])=>RequestHandler;audit?:AuditFn};

const managerRoles=[UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.HR_MANAGER,UserRole.HOUSE_MANAGER,UserRole.CEO] as const;
const serviceTypes=['HOMEMAKER_PERSONAL_CARE','SHARED_LIVING','RESPITE','TRANSPORTATION','NURSING','HOME_HEALTH','COMMUNITY_INTEGRATION','OTHER'] as const;
const statuses=['NEW','REVIEWING','CONTACTED','INTAKE_STARTED','ACCEPTED','DECLINED','CLOSED'] as const;
const requestSchema=z.object({
  requesterName:z.string().trim().min(2).max(200),
  requesterRelationship:z.string().trim().max(120).default('Self'),
  clientName:z.string().trim().min(2).max(200),
  clientDateOfBirth:z.string().trim().max(20).default(''),
  email:z.string().trim().email().max(320),
  phone:z.string().trim().min(7).max(40),
  preferredContact:z.enum(['EMAIL','PHONE','TEXT']).default('EMAIL'),
  streetAddress:z.string().trim().max(300).default(''),
  city:z.string().trim().max(120).default(''),
  state:z.string().trim().max(40).default('OH'),
  zipCode:z.string().trim().max(10).default(''),
  county:z.string().trim().max(120).default(''),
  fundingSource:z.string().trim().max(160).default(''),
  serviceTypes:z.array(z.enum(serviceTypes)).min(1).max(8),
  urgency:z.enum(['ROUTINE','SOON','URGENT']).default('ROUTINE'),
  currentProvider:z.string().trim().max(200).default(''),
  requestedStartDate:z.string().trim().max(20).default(''),
  notes:z.string().trim().max(8000).default(''),
  consent:z.literal(true),
});
const reviewSchema=z.object({
  status:z.enum(statuses).optional(),
  assignedToUserId:z.string().trim().optional().nullable(),
  serviceHomeId:z.string().trim().optional().nullable(),
  internalNotes:z.string().trim().max(12000).optional(),
  dispositionReason:z.string().trim().max(2000).optional(),
  nextFollowUpAt:z.coerce.date().optional().nullable(),
});

const requestNumber=()=>`SR-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

export function registerClientServiceRequestRoutes({app,prisma,authOf,requireRoles,audit}:Dependencies){
  const gate=requireRoles(...managerRoles);
  const resolveOrganizationId=async()=>{
    const configured=String(process.env.SULANDRA_ORGANIZATION_ID||'').trim();
    if(configured)return configured;
    const rows=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "Organization" LIMIT 1`);
    if(!rows[0]?.id)throw Object.assign(new Error('Sulandra organization is not configured for service requests'),{status:503});
    return rows[0].id;
  };

  app.post('/public/client-service-requests',async(req,res,next)=>{try{
    const input=requestSchema.parse(req.body);
    const organizationId=await resolveOrganizationId();
    const id=randomUUID(),number=requestNumber();
    await prisma.$executeRawUnsafe(`INSERT INTO "ClientServiceRequest" ("id","organizationId","requestNumber","requesterName","requesterRelationship","clientName","clientDateOfBirth","email","phone","preferredContact","streetAddress","city","state","zipCode","county","fundingSource","serviceTypes","urgency","currentProvider","requestedStartDate","notes","status","consentAt") VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19,NULLIF($20,''),$21,'NEW',NOW())`,id,organizationId,number,input.requesterName,input.requesterRelationship,input.clientName,input.clientDateOfBirth,input.email,input.phone,input.preferredContact,input.streetAddress,input.city,input.state,input.zipCode,input.county,input.fundingSource,JSON.stringify(input.serviceTypes),input.urgency,input.currentProvider,input.requestedStartDate,input.notes);
    res.status(201).json({data:{id,requestNumber:number,status:'NEW'}});
  }catch(error){next(error)}});

  app.get('/api/admin/client-service-requests',gate,async(req,res,next)=>{try{
    const auth=authOf(res);const status=String(req.query.status||'').trim();
    const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT r.*,u."email" AS "assignedToEmail",sh."name" AS "serviceHomeName" FROM "ClientServiceRequest" r LEFT JOIN "User" u ON u."id"=r."assignedToUserId" LEFT JOIN "ServiceHome" sh ON sh."id"=r."serviceHomeId" WHERE r."organizationId"=$1 AND ($2='' OR r."status"=$2) ORDER BY CASE r."urgency" WHEN 'URGENT' THEN 0 WHEN 'SOON' THEN 1 ELSE 2 END,r."createdAt" DESC LIMIT 1000`,auth.organizationId,status);
    const metrics={total:rows.length,new:rows.filter(r=>r.status==='NEW').length,urgent:rows.filter(r=>r.urgency==='URGENT'&&!['ACCEPTED','DECLINED','CLOSED'].includes(r.status)).length,intakeStarted:rows.filter(r=>r.status==='INTAKE_STARTED').length};
    res.json({data:{requests:rows,metrics}});
  }catch(error){next(error)}});

  app.get('/api/admin/client-service-requests/:requestId',gate,async(req,res,next)=>{try{
    const auth=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ClientServiceRequest" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.requestId);if(!rows[0])return void res.status(404).json({error:'Service request was not found'});res.json({data:rows[0]});
  }catch(error){next(error)}});

  app.patch('/api/admin/client-service-requests/:requestId',gate,async(req,res,next)=>{try{
    const auth=authOf(res),input=reviewSchema.parse(req.body);const current=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ClientServiceRequest" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.requestId))[0];if(!current)return void res.status(404).json({error:'Service request was not found'});
    const status=input.status??current.status,assigned=input.assignedToUserId===undefined?current.assignedToUserId:input.assignedToUserId,home=input.serviceHomeId===undefined?current.serviceHomeId:input.serviceHomeId,notes=input.internalNotes===undefined?current.internalNotes:input.internalNotes,reason=input.dispositionReason===undefined?current.dispositionReason:input.dispositionReason,follow=input.nextFollowUpAt===undefined?current.nextFollowUpAt:input.nextFollowUpAt;
    await prisma.$executeRawUnsafe(`UPDATE "ClientServiceRequest" SET "status"=$1,"assignedToUserId"=$2,"serviceHomeId"=$3,"internalNotes"=$4,"dispositionReason"=$5,"nextFollowUpAt"=$6,"reviewedById"=$7,"reviewedAt"=COALESCE("reviewedAt",NOW()),"updatedAt"=NOW() WHERE "organizationId"=$8 AND "id"=$9`,status,assigned,home,notes,reason,follow,auth.userId,auth.organizationId,current.id);
    await audit?.(auth,'UPDATE_CLIENT_SERVICE_REQUEST','ClientServiceRequest',current.id,{requestNumber:current.requestNumber,before:{status:current.status,assignedToUserId:current.assignedToUserId,serviceHomeId:current.serviceHomeId},after:{status,assignedToUserId:assigned,serviceHomeId:home}});
    res.json({data:{id:current.id,status}});
  }catch(error){next(error)}});

  app.post('/api/admin/client-service-requests/:requestId/start-intake',gate,async(req,res,next)=>{try{
    const auth=authOf(res);const current=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ClientServiceRequest" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,req.params.requestId))[0];if(!current)return void res.status(404).json({error:'Service request was not found'});
    await prisma.$executeRawUnsafe(`UPDATE "ClientServiceRequest" SET "status"='INTAKE_STARTED',"reviewedById"=$1,"reviewedAt"=COALESCE("reviewedAt",NOW()),"updatedAt"=NOW() WHERE "organizationId"=$2 AND "id"=$3`,auth.userId,auth.organizationId,current.id);
    await audit?.(auth,'START_CLIENT_INTAKE','ClientServiceRequest',current.id,{requestNumber:current.requestNumber,clientName:current.clientName});
    res.json({data:{id:current.id,status:'INTAKE_STARTED',clientDraft:{name:current.clientName,dateOfBirth:current.clientDateOfBirth,address:{streetAddress:current.streetAddress,city:current.city,state:current.state,zipCode:current.zipCode,county:current.county},serviceTypes:current.serviceTypes,fundingSource:current.fundingSource}}});
  }catch(error){next(error)}});
}
