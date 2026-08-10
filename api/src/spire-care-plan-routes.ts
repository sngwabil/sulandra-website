import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;ipAddress?:string;userAgent?:string;legalEntityId?:string;enterpriseOwner?:boolean};
type Deps={authOf:(response:express.Response)=>AuthContext};
const clinical=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.AUDITOR,UserRole.DSP,UserRole.DELEGATING_NURSE,UserRole.LPN,UserRole.RN,UserRole.HOUSE_MANAGER,UserRole.CEO,UserRole.DOO]);
const writers=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.DSP,UserRole.DELEGATING_NURSE,UserRole.LPN,UserRole.RN,UserRole.HOUSE_MANAGER,UserRole.CEO,UserRole.DOO]);
const elevatedRoles=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.AUDITOR,UserRole.CEO,UserRole.DOO]);
const httpError=(status:number,message:string)=>Object.assign(new Error(message),{status});
const selectedEntity=(a:AuthContext)=>{if(!a.legalEntityId)throw httpError(409,'Select a Sulandra company before opening Care Plan / ISP');return a.legalEntityId;};
const elevated=(a:AuthContext)=>a.enterpriseOwner===true||elevatedRoles.has(a.role)||String(a.email||'').trim().toLowerCase()==='admin@sulandrahealth.com';
const ensure=(a:AuthContext)=>{if(!clinical.has(a.role)&&a.enterpriseOwner!==true)throw httpError(403,'SPIRE clinical access is required');selectedEntity(a);};
const ensureWrite=(a:AuthContext)=>{ensure(a);if(!writers.has(a.role)&&a.enterpriseOwner!==true)throw httpError(403,'This SPIRE role is read-only');};
const text=(v:unknown,m=20000)=>typeof v==='string'?v.trim().slice(0,m):'';

async function allowed(prisma:PrismaClient,a:AuthContext,pid:string){
  const entityId=selectedEntity(a);
  const enrolled=await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(`SELECT EXISTS(SELECT 1 FROM "ClientEnrollment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clientId"=$3 AND "status" IN ('PENDING','ACTIVE','PAUSED')) AS allowed`,a.organizationId,entityId,pid);
  if(enrolled[0]?.allowed!==true)return false;
  if(elevated(a))return true;
  const assigned=await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(`SELECT EXISTS(
    SELECT 1 FROM "SpireEmployeeClientAssignment" x WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."userId"=$3 AND x."clientId"=$4
    UNION ALL
    SELECT 1 FROM "SpirePatientHomeAssignment" p JOIN "SpireEmployeeHomeAssignment" h ON h."organizationId"=p."organizationId" AND h."legalEntityId"=p."legalEntityId" AND h."homeId"=p."homeId" WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND h."userId"=$3 AND p."patientId"=$4 AND (p."endsAt" IS NULL OR p."endsAt">NOW())
    UNION ALL
    SELECT 1 FROM "UserEntityAccessGrant" g WHERE g."organizationId"=$1 AND g."legalEntityId"=$2 AND g."userId"=$3 AND g."scopeType"='CLIENT' AND g."clientId"=$4 AND g."active"=TRUE AND g."effectiveFrom"<=NOW() AND (g."effectiveTo" IS NULL OR g."effectiveTo">NOW())
  ) AS allowed`,a.organizationId,entityId,a.userId,pid);
  return assigned[0]?.allowed===true;
}
async function requirePatient(prisma:PrismaClient,a:AuthContext,pid:string,write=false){write?ensureWrite(a):ensure(a);if(!(await allowed(prisma,a,pid)))throw httpError(403,'This client is outside your authorized Care Plan / ISP scope for the selected company');}
async function requireOwnedPlan(prisma:PrismaClient,a:AuthContext,pid:string,carePlanId:string){const rows=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "SpireCarePlan" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 LIMIT 1`,a.organizationId,selectedEntity(a),pid,carePlanId);if(!rows[0])throw httpError(404,'Care Plan / ISP was not found in the selected company');}
async function requireOwnedGoal(prisma:PrismaClient,a:AuthContext,pid:string,carePlanId:string,goalId:string){const rows=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "SpireCarePlanGoal" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "carePlanId"=$4 AND "id"=$5 LIMIT 1`,a.organizationId,selectedEntity(a),pid,carePlanId,goalId);if(!rows[0])throw httpError(404,'Care Plan goal was not found in the selected company');}
async function audit(prisma:PrismaClient,a:AuthContext,pid:string,action:string,type:string,id:string,after:unknown){await prisma.$executeRawUnsafe(`INSERT INTO "SpireClinicalAuditEvent"("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent") VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,a.organizationId,selectedEntity(a),a.userId,a.email??null,pid,action,type,id,JSON.stringify(after??{}),a.ipAddress??null,a.userAgent??null);}

export const registerSpireCarePlanRoutes=(app:express.Express,prisma:PrismaClient,deps:Deps)=>{const{authOf}=deps;
 app.get('/api/spire/patients/:patientId/care-plan/overview',async(req,res,next)=>{try{
   const a=authOf(res),pid=req.params.patientId;await requirePatient(prisma,a,pid);const entityId=selectedEntity(a);
   const plans=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT p.*,e."code" AS "companyCode",e."displayName" AS "companyName" FROM "SpireCarePlan" p LEFT JOIN "LegalEntity" e ON e."organizationId"=p."organizationId" AND e."id"=p."legalEntityId" WHERE p."organizationId"=$1 AND p."patientId"=$2 ORDER BY CASE WHEN p."legalEntityId"=$3 THEN 0 ELSE 1 END,COALESCE(p."effectiveDate",p."createdAt"::date) DESC,p."createdAt" DESC`,a.organizationId,pid,entityId);
   const current=plans.find(p=>String(p.legalEntityId||'')===entityId)??null;const planId=current?String(current.id):'';
   const q=async(table:string,order:string)=>planId?prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "${table}" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "carePlanId"=$4 ORDER BY ${order}`,a.organizationId,entityId,pid,planId):[];
   const[goals,interventions,risks,signatures,services,assessments]=await Promise.all([
     q('SpireCarePlanGoal','"createdAt"'),q('SpireCarePlanIntervention','"createdAt"'),q('SpireCarePlanRisk','"riskLevel","createdAt"'),q('SpireCarePlanSignature','"signedAt"'),q('SpireCarePlanServiceLink','"startsAt"'),
     prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT r.*,t."title" AS "templateTitle",t."category" FROM "SpireAssessmentResponse" r LEFT JOIN "SpireAssessmentTemplate" t ON t."id"=r."templateId" AND t."organizationId"=r."organizationId" WHERE r."organizationId"=$1 AND r."patientId"=$2 ORDER BY r."completedAt" DESC LIMIT 50`,a.organizationId,pid)
   ]);
   res.json({data:{current,history:plans,sharedHistory:plans.filter(p=>String(p.legalEntityId||'')!==entityId),selectedLegalEntityId:entityId,goals,interventions,risks,signatures,services,assessments}});
 }catch(e){next(e);}});

 app.post('/api/spire/patients/:patientId/care-plans',async(req,res,next)=>{try{
   const a=authOf(res),pid=req.params.patientId;await requirePatient(prisma,a,pid,true);const entityId=selectedEntity(a);const title=text(req.body?.title,250)||'Individual Service Plan';
   const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireCarePlan"("organizationId","legalEntityId","patientId","title","planType","effectiveDate","annualReviewDate","personCenteredSummary","importantTo","importantFor","communicationPlan","transportationPlan","mealPlan","behaviorSupportPlan","emergencyPlan","rightsModifications","restrictiveMeasures","nursingDelegationInstructions","status","createdById") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'DRAFT',$19) RETURNING *`,a.organizationId,entityId,pid,title,text(req.body?.planType,40)||'ISP',req.body?.effectiveDate||null,req.body?.annualReviewDate||null,text(req.body?.personCenteredSummary),text(req.body?.importantTo),text(req.body?.importantFor),text(req.body?.communicationPlan),text(req.body?.transportationPlan),text(req.body?.mealPlan),text(req.body?.behaviorSupportPlan),text(req.body?.emergencyPlan),text(req.body?.rightsModifications),text(req.body?.restrictiveMeasures),text(req.body?.nursingDelegationInstructions),a.userId);
   const row=rows[0];await prisma.$executeRawUnsafe(`INSERT INTO "SpireCarePlanVersion"("id","organizationId","carePlanId","version","snapshot","reason","createdById") VALUES(gen_random_uuid()::text,$1,$2,1,$3::jsonb,'Initial draft created in SPIRE',$4)`,a.organizationId,String(row.id),JSON.stringify(row),a.userId);await audit(prisma,a,pid,'CREATE_CARE_PLAN','CARE_PLAN',String(row.id),row);res.status(201).json({data:row});
 }catch(e){next(e);}});

 app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/goals',async(req,res,next)=>{try{
   const a=authOf(res),pid=req.params.patientId;await requirePatient(prisma,a,pid,true);await requireOwnedPlan(prisma,a,pid,req.params.carePlanId);const title=text(req.body?.title,250);if(!title)throw httpError(400,'Goal title is required');const entityId=selectedEntity(a);
   const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireCarePlanGoal"("organizationId","legalEntityId","patientId","carePlanId","title","baseline","desiredOutcome","targetValue","targetUnit","frequency","responsibleDiscipline","progressPercent","startsAt","dueDate","reviewDate","createdById") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,a.organizationId,entityId,pid,req.params.carePlanId,title,text(req.body?.baseline),text(req.body?.desiredOutcome),req.body?.targetValue??null,text(req.body?.targetUnit,80)||null,text(req.body?.frequency,120)||null,text(req.body?.responsibleDiscipline,120)||null,Number(req.body?.progressPercent??0),req.body?.startsAt||null,req.body?.dueDate||null,req.body?.reviewDate||null,a.userId);const row=rows[0];await audit(prisma,a,pid,'CREATE_GOAL','CARE_PLAN_GOAL',String(row.id),row);res.status(201).json({data:row});
 }catch(e){next(e);}});

 app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/interventions',async(req,res,next)=>{try{
   const a=authOf(res),pid=req.params.patientId;await requirePatient(prisma,a,pid,true);await requireOwnedPlan(prisma,a,pid,req.params.carePlanId);const title=text(req.body?.title,250),instructions=text(req.body?.instructions);if(!title||!instructions)throw httpError(400,'Intervention title and instructions are required');const entityId=selectedEntity(a);
   const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireCarePlanIntervention"("organizationId","legalEntityId","patientId","carePlanId","goalId","title","instructions","frequency","responsibleRole","serviceType","createdById") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,a.organizationId,entityId,pid,req.params.carePlanId,text(req.body?.goalId,100)||null,title,instructions,text(req.body?.frequency,120)||null,text(req.body?.responsibleRole,120)||null,text(req.body?.serviceType,120)||null,a.userId);const row=rows[0];await audit(prisma,a,pid,'CREATE_INTERVENTION','CARE_PLAN_INTERVENTION',String(row.id),row);res.status(201).json({data:row});
 }catch(e){next(e);}});

 app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/progress',async(req,res,next)=>{try{
   const a=authOf(res),pid=req.params.patientId;await requirePatient(prisma,a,pid,true);await requireOwnedPlan(prisma,a,pid,req.params.carePlanId);const goalId=text(req.body?.goalId,100);if(!goalId)throw httpError(400,'Goal is required');await requireOwnedGoal(prisma,a,pid,req.params.carePlanId,goalId);const entityId=selectedEntity(a);
   const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireGoalProgressEntry"("organizationId","legalEntityId","patientId","goalId","encounterId","noteId","interventionId","assessmentId","incidentId","appointmentId","medicationOrderId","value","unit","progressPercent","narrative","recordedById") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,a.organizationId,entityId,pid,goalId,text(req.body?.encounterId,100)||null,text(req.body?.noteId,100)||null,text(req.body?.interventionId,100)||null,text(req.body?.assessmentId,100)||null,text(req.body?.incidentId,100)||null,text(req.body?.appointmentId,100)||null,text(req.body?.medicationOrderId,100)||null,req.body?.value??null,text(req.body?.unit,80)||null,req.body?.progressPercent??null,text(req.body?.narrative),a.userId);if(req.body?.progressPercent!=null)await prisma.$executeRawUnsafe(`UPDATE "SpireCarePlanGoal" SET "progressPercent"=$1,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "patientId"=$4 AND "id"=$5`,Number(req.body.progressPercent),a.organizationId,entityId,pid,goalId);const row=rows[0];await audit(prisma,a,pid,'DOCUMENT_GOAL_PROGRESS','GOAL_PROGRESS',String(row.id),row);res.status(201).json({data:row});
 }catch(e){next(e);}});

 app.post('/api/spire/patients/:patientId/care-plans/:carePlanId/signatures',async(req,res,next)=>{try{
   const a=authOf(res),pid=req.params.patientId;await requirePatient(prisma,a,pid,true);await requireOwnedPlan(prisma,a,pid,req.params.carePlanId);const signerRole=text(req.body?.signerRole,80),signerName=text(req.body?.signerName,250);if(!signerRole||!signerName)throw httpError(400,'Signer role and name are required');const entityId=selectedEntity(a);
   const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireCarePlanSignature"("organizationId","legalEntityId","patientId","carePlanId","signerRole","signerName","signerUserId","signatureMethod","ipAddress","userAgent","attestation") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,a.organizationId,entityId,pid,req.params.carePlanId,signerRole,signerName,a.userId,text(req.body?.signatureMethod,40)||'ELECTRONIC',a.ipAddress??null,a.userAgent??null,text(req.body?.attestation));const row=rows[0];await audit(prisma,a,pid,'SIGN_CARE_PLAN','CARE_PLAN_SIGNATURE',String(row.id),row);res.status(201).json({data:row});
 }catch(e){next(e);}});
};
