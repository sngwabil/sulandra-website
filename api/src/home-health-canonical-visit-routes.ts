import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;legalEntityId?:string;enterpriseOwner?:boolean};
type Deps={authOf:(response:express.Response)=>AuthContext;audit?:(auth:Partial<AuthContext>,action:string,resourceType:string,resourceId?:string,metadata?:object)=>Promise<void>};
const managers=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.RN,UserRole.DELEGATING_NURSE,UserRole.SCHEDULER,UserRole.CEO,UserRole.DOO]);
const httpError=(status:number,message:string,details?:unknown)=>Object.assign(new Error(message),{status,details});
const clean=(v:unknown,max=5000)=>typeof v==='string'?v.trim().slice(0,max):'';
const owner=(a:AuthContext)=>a.enterpriseOwner===true||String(a.email||'').trim().toLowerCase()==='admin@sulandrahealth.com';
const entity=(a:AuthContext)=>{if(!a.legalEntityId)throw httpError(409,'Select Sulandra Home Health before scheduling Home Health visits');return a.legalEntityId;};
async function ensureWrite(prisma:PrismaClient,a:AuthContext){
  const rows=await prisma.$queryRawUnsafe<Array<{code:string}>>(`SELECT "code" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,a.organizationId,entity(a));
  if(!rows[0])throw httpError(404,'Selected company was not found');
  if(rows[0].code!=='HOME_HEALTH')throw httpError(409,'Select Sulandra Home Health to use Home Health visit scheduling');
  if(!managers.has(a.role)&&!owner(a))throw httpError(403,'Home Health scheduling or licensed clinical management access is required');
}
async function appendEvent(prisma:PrismaClient,a:AuthContext,episodeId:string,eventType:string,resourceType:string,resourceId:string,details:Record<string,unknown>={}){
  await prisma.$executeRawUnsafe(`INSERT INTO "HomeHealthEpisodeEvent"("id","organizationId","legalEntityId","episodeId","actorUserId","eventType","resourceType","resourceId","details") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,randomUUID(),a.organizationId,entity(a),episodeId,a.userId,eventType,resourceType,resourceId,JSON.stringify(details));
}
const orderCodeSchema=z.object({evvServiceCode:z.string().trim().min(1).max(80)});
const visitSchema=z.object({
  disciplineOrderId:z.string().trim().min(1).max(160),
  discipline:z.enum(['SN','PT','OT','ST','RT','HHA','MSW','OTHER']),
  visitType:z.string().trim().min(1).max(160),
  assignedUserId:z.string().trim().max(160).optional().nullable(),
  scheduledStart:z.string().datetime(),
  scheduledEnd:z.string().datetime().optional().nullable(),
  evvRequired:z.boolean().default(false),
  locationAddress:z.string().trim().max(1000).optional().nullable(),
});

export const registerHomeHealthCanonicalVisitRoutes=(app:express.Express,prisma:PrismaClient,deps:Deps)=>{const{authOf,audit}=deps;
  app.patch('/api/home-health/episodes/:episodeId/orders/:orderId/evv-service-code',async(req,res,next)=>{try{
    const a=authOf(res);await ensureWrite(prisma,a);const i=orderCodeSchema.parse(req.body);const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`UPDATE "HomeHealthDisciplineOrder" SET "evvServiceCode"=$1,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "episodeId"=$4 AND "id"=$5 RETURNING *`,i.evvServiceCode,a.organizationId,entity(a),req.params.episodeId,req.params.orderId);if(!rows[0])throw httpError(404,'Home Health discipline order was not found');await appendEvent(prisma,a,req.params.episodeId,'EVV_SERVICE_CODE_CONFIGURED','HOME_HEALTH_DISCIPLINE_ORDER',req.params.orderId,{evvServiceCode:i.evvServiceCode});await audit?.(a,'CONFIGURE_HOME_HEALTH_EVV_SERVICE_CODE','HomeHealthDisciplineOrder',req.params.orderId,{episodeId:req.params.episodeId,evvServiceCode:i.evvServiceCode});res.json({data:rows[0]});
  }catch(e){next(e);}});

  app.post('/api/home-health/episodes/:episodeId/canonical-visits',async(req,res,next)=>{try{
    const a=authOf(res);await ensureWrite(prisma,a);const i=visitSchema.parse(req.body),eid=entity(a);
    const episodes=await prisma.$queryRawUnsafe<Array<{id:string;patientId:string;status:string;currentCertificationPeriodId:string|null}>>(`SELECT "id","patientId","status","currentCertificationPeriodId" FROM "HomeHealthEpisode" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,a.organizationId,eid,req.params.episodeId);const episode=episodes[0];if(!episode)throw httpError(404,'Home Health episode was not found');if(!episode.currentCertificationPeriodId)throw httpError(409,'Create/select the current Home Health certification period before scheduling visits');if(['DISCHARGED','CANCELLED'].includes(String(episode.status)))throw httpError(409,'Visits cannot be scheduled for a discharged or cancelled Home Health episode');
    const orders=await prisma.$queryRawUnsafe<Array<{id:string;discipline:string;status:string;evvServiceCode:string|null;certificationPeriodId:string|null}>>(`SELECT "id","discipline","status","evvServiceCode","certificationPeriodId" FROM "HomeHealthDisciplineOrder" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "episodeId"=$3 AND "id"=$4 LIMIT 1`,a.organizationId,eid,req.params.episodeId,i.disciplineOrderId);const order=orders[0];if(!order)throw httpError(409,'The visit must reference a Home Health discipline order from this episode');if(!['ORDERED','ACTIVE'].includes(String(order.status)))throw httpError(409,'The selected Home Health discipline order is not active');if(String(order.discipline)!==i.discipline)throw httpError(409,'Visit discipline must match the selected Home Health discipline order');if(order.certificationPeriodId&&order.certificationPeriodId!==episode.currentCertificationPeriodId)throw httpError(409,'The selected Home Health discipline order belongs to a different certification period');if(i.evvRequired&&!clean(order.evvServiceCode,80))throw httpError(409,'Configure the order EVV service/procedure code before scheduling an EVV-required visit');
    if(i.assignedUserId){const staff=await prisma.$queryRawUnsafe<Array<{status:string;discipline:string;licenseExpiresAt:string|null}>>(`SELECT "status","discipline","licenseExpiresAt"::text FROM "HomeHealthStaffProfile" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 LIMIT 1`,a.organizationId,eid,i.assignedUserId);if(!staff[0]||staff[0].status!=='ACTIVE')throw httpError(409,'Assigned staff must have an active Home Health staff profile');if(staff[0].licenseExpiresAt&&new Date(staff[0].licenseExpiresAt)<new Date())throw httpError(409,'Assigned staff Home Health license/profile is expired');}
    const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "HomeHealthVisit"("id","organizationId","legalEntityId","episodeId","patientId","disciplineOrderId","certificationPeriodId","discipline","visitType","status","assignedUserId","scheduledStart","scheduledEnd","evvRequired","evvServiceCode","locationAddress","createdById") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SCHEDULED',$10,$11::timestamptz,$12::timestamptz,$13,$14,$15,$16)`,id,a.organizationId,eid,req.params.episodeId,episode.patientId,order.id,episode.currentCertificationPeriodId,i.discipline,i.visitType,i.assignedUserId??null,i.scheduledStart,i.scheduledEnd??null,i.evvRequired,order.evvServiceCode??null,i.locationAddress??null,a.userId);
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT v.*,evv."id" "linkedEvvVisitId",evv."status" "evvStatus",evv."procedureCode" "evvProcedureCode" FROM "HomeHealthVisit" v LEFT JOIN "SpireEvvVisit" evv ON evv."homeHealthVisitId"=v."id" WHERE v."organizationId"=$1 AND v."legalEntityId"=$2 AND v."id"=$3 LIMIT 1`,a.organizationId,eid,id);await appendEvent(prisma,a,req.params.episodeId,'CANONICAL_HOME_HEALTH_VISIT_SCHEDULED','HOME_HEALTH_VISIT',id,{discipline:i.discipline,visitType:i.visitType,evvRequired:i.evvRequired,linkedEvvVisitId:rows[0]?.linkedEvvVisitId??null});await audit?.(a,'SCHEDULE_CANONICAL_HOME_HEALTH_VISIT','HomeHealthVisit',id,{episodeId:req.params.episodeId,evvRequired:i.evvRequired,linkedEvvVisitId:rows[0]?.linkedEvvVisitId??null});res.status(201).json({data:rows[0]});
  }catch(e){next(e);}});
};
