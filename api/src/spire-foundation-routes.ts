import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';

type AuthContext = { userId:string; organizationId:string; role:UserRole; email?:string; ipAddress?:string; userAgent?:string };
type Deps = { authOf:(response:express.Response)=>AuthContext };

const clinicalRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.AUDITOR,UserRole.DSP,UserRole.DELEGATING_NURSE,
  UserRole.LPN,UserRole.RN,UserRole.HOUSE_MANAGER,UserRole.CEO,UserRole.DOO,
]);
const adminRoles = new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.CEO,UserRole.DOO]);
const ensureClinical = (auth:AuthContext) => { if(!clinicalRoles.has(auth.role)) throw Object.assign(new Error('Spire clinical access is required'),{status:403}); };
const isAdmin = (auth:AuthContext) => adminRoles.has(auth.role) || String(auth.email||'').toLowerCase()==='admin@sulandrahealth.com';

async function patientAllowed(prisma:PrismaClient,auth:AuthContext,patientId:string){
  if(isAdmin(auth)||auth.role===UserRole.AUDITOR) return true;
  const rows=await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeClientAssignment" a WHERE a."organizationId"=$1 AND a."userId"=$2 AND a."clientId"=$3
       UNION ALL
       SELECT 1 FROM "SpirePatientHomeAssignment" p JOIN "SpireEmployeeHomeAssignment" h ON h."organizationId"=p."organizationId" AND h."homeId"=p."homeId"
       WHERE p."organizationId"=$1 AND h."userId"=$2 AND p."patientId"=$3 AND (p."endsAt" IS NULL OR p."endsAt">NOW())
     ) AS allowed`,auth.organizationId,auth.userId,patientId);
  return rows[0]?.allowed===true;
}
async function requirePatient(prisma:PrismaClient,auth:AuthContext,patientId:string){ ensureClinical(auth); if(!(await patientAllowed(prisma,auth,patientId))) throw Object.assign(new Error('This chart is outside your authorized clinical scope'),{status:403}); }
async function logAccess(prisma:PrismaClient,auth:AuthContext,patientId:string,action:string,resourceType?:string,resourceId?:string){
  await prisma.$executeRawUnsafe(`INSERT INTO "SpireChartAccessEvent"("organizationId","patientId","actorUserId","actorEmail","action","resourceType","resourceId","ipAddress","userAgent") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,auth.organizationId,patientId,auth.userId,auth.email??null,action,resourceType??null,resourceId??null,auth.ipAddress??null,auth.userAgent??null);
}
const patientDisplay = (row:Record<string,unknown>) => ({
  id:String(row.id), patientId:String(row.id), medicalRecordNumber:row.medicalRecordNumber??null,
  name:[row.preferredName||row.firstName,row.lastName].filter(Boolean).join(' '), firstName:row.firstName,lastName:row.lastName,
  dateOfBirth:row.dateOfBirth,homeName:row.homeName??null,programName:row.programName??null,flags:row.flags??[],allergies:row.allergies??[],diagnoses:row.diagnoses??[],
});

export const registerSpireFoundationRoutes = (app:express.Express,prisma:PrismaClient,deps:Deps) => {
  const {authOf}=deps;
  app.get('/api/spire/patients',async(_req,res,next)=>{try{
    const auth=authOf(res); ensureClinical(auth);
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT p.*,
      (SELECT h."homeId" FROM "SpirePatientHomeAssignment" h WHERE h."organizationId"=p."organizationId" AND h."patientId"=p."id" AND (h."endsAt" IS NULL OR h."endsAt">NOW()) ORDER BY h."primary" DESC,h."startsAt" DESC LIMIT 1) AS "homeName",
      (SELECT e."programId" FROM "SpirePatientProgramEnrollment" e WHERE e."organizationId"=p."organizationId" AND e."patientId"=p."id" AND e."status"='ACTIVE' ORDER BY e."startsAt" DESC LIMIT 1) AS "programName",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('label',f."label",'severity',f."severity")) FROM "SpirePatientFlag" f WHERE f."organizationId"=p."organizationId" AND f."patientId"=p."id" AND f."active"=TRUE),'[]'::jsonb) AS flags
      FROM "SpirePatient" p WHERE p."organizationId"=$1 AND p."active"=TRUE ORDER BY p."lastName",p."firstName"`,auth.organizationId);
    const allowed=[]; for(const row of rows) if(await patientAllowed(prisma,auth,String(row.id))) allowed.push(patientDisplay(row)); res.json({data:allowed});
  }catch(e){next(e);}});

  app.get('/api/spire/patients/:patientId',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatient(prisma,auth,req.params.patientId);
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT p.*,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('substance',a."substance",'reaction',a."reaction",'severity',a."severity")) FROM "SpirePatientAllergy" a WHERE a."organizationId"=p."organizationId" AND a."patientId"=p."id" AND a."status"='ACTIVE'),'[]'::jsonb) AS allergies,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('display',d."display",'code',d."code")) FROM "SpirePatientDiagnosis" d WHERE d."organizationId"=p."organizationId" AND d."patientId"=p."id" AND d."status"='ACTIVE'),'[]'::jsonb) AS diagnoses,
      (SELECT h."homeId" FROM "SpirePatientHomeAssignment" h WHERE h."organizationId"=p."organizationId" AND h."patientId"=p."id" AND (h."endsAt" IS NULL OR h."endsAt">NOW()) ORDER BY h."primary" DESC,h."startsAt" DESC LIMIT 1) AS "homeName",
      (SELECT e."programId" FROM "SpirePatientProgramEnrollment" e WHERE e."organizationId"=p."organizationId" AND e."patientId"=p."id" AND e."status"='ACTIVE' ORDER BY e."startsAt" DESC LIMIT 1) AS "programName"
      FROM "SpirePatient" p WHERE p."organizationId"=$1 AND p."id"=$2`,auth.organizationId,req.params.patientId);
    if(!rows[0]) throw Object.assign(new Error('Patient not found'),{status:404}); await logAccess(prisma,auth,req.params.patientId,'VIEW_CHART','PATIENT',req.params.patientId); res.json({data:patientDisplay(rows[0])});
  }catch(e){next(e);}});

  app.get('/api/spire/schedule',async(_req,res,next)=>{try{
    const auth=authOf(res); ensureClinical(auth);
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT a."id",a."patientId",a."startsAt",a."endsAt",a."status",a."appointmentType",a."locationId",a."providerUserId",p."firstName",p."preferredName",p."lastName" FROM "SpireAppointment" a JOIN "SpirePatient" p ON p."id"=a."patientId" AND p."organizationId"=a."organizationId" WHERE a."organizationId"=$1 AND a."startsAt">=date_trunc('day',NOW()) AND a."startsAt"<date_trunc('day',NOW())+INTERVAL '1 day' ORDER BY a."startsAt"`,auth.organizationId);
    const out=[]; for(const r of rows){if(await patientAllowed(prisma,auth,String(r.patientId))) out.push({id:r.id,patientId:r.patientId,patientName:[r.preferredName||r.firstName,r.lastName].filter(Boolean).join(' '),time:new Date(String(r.startsAt)).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),status:r.status,type:r.appointmentType,provider:r.providerUserId,location:r.locationId});} res.json({data:out});
  }catch(e){next(e);}});

  app.get('/api/spire/inbasket',async(_req,res,next)=>{try{
    const auth=authOf(res); ensureClinical(auth);
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT i.*,p."firstName",p."preferredName",p."lastName" FROM "SpireInBasketItem" i LEFT JOIN "SpirePatient" p ON p."id"=i."patientId" AND p."organizationId"=i."organizationId" WHERE i."organizationId"=$1 AND i."assignedToUserId"=$2 AND i."status"<>'DONE' ORDER BY CASE i."priority" WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,i."createdAt" DESC LIMIT 250`,auth.organizationId,auth.userId);
    res.json({data:rows.map(r=>({...r,patientName:[r.preferredName||r.firstName,r.lastName].filter(Boolean).join(' ')}))});
  }catch(e){next(e);}});

  app.get('/api/spire/patients/:patientId/chart-review',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatient(prisma,auth,req.params.patientId); await logAccess(prisma,auth,req.params.patientId,'VIEW_CHART_REVIEW','CHART_REVIEW');
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM (
      SELECT e."startedAt" AS date,'Encounter'::text AS type,COALESCE(e."chiefComplaint",e."encounterType") AS description,e."status",COALESCE(e."signedById",e."createdById") AS author FROM "SpireEncounter" e WHERE e."organizationId"=$1 AND e."patientId"=$2
      UNION ALL SELECT n."createdAt",'Note',COALESCE(n."title",n."noteType"),n."status",n."authorUserId" FROM "SpireClinicalNote" n WHERE n."organizationId"=$1 AND n."patientId"=$2
      UNION ALL SELECT r."resultedAt",r."category",r."testName",r."status",r."source" FROM "SpireResult" r WHERE r."organizationId"=$1 AND r."patientId"=$2
      UNION ALL SELECT o."orderedAt",'Order',o."name",o."status",o."orderedById" FROM "SpireOrder" o WHERE o."organizationId"=$1 AND o."patientId"=$2
      UNION ALL SELECT d."createdAt",'Document',d."title",d."status",d."createdById" FROM "SpireClinicalDocument" d WHERE d."organizationId"=$1 AND d."patientId"=$2
    ) x ORDER BY date DESC LIMIT 500`,auth.organizationId,req.params.patientId); res.json({data:{items:rows}});
  }catch(e){next(e);}});

  app.get('/api/spire/patients/:patientId/results-review',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatient(prisma,auth,req.params.patientId); await logAccess(prisma,auth,req.params.patientId,'VIEW_RESULTS','RESULT');
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT r."id",r."testName",r."resultedAt",c."name",COALESCE(c."value",c."numericValue"::text) AS value,c."unit",c."referenceRange",c."abnormalFlag" FROM "SpireResult" r LEFT JOIN "SpireResultComponent" c ON c."resultId"=r."id" AND c."organizationId"=r."organizationId" WHERE r."organizationId"=$1 AND r."patientId"=$2 ORDER BY r."resultedAt" DESC,c."sortOrder" LIMIT 1000`,auth.organizationId,req.params.patientId); res.json({data:{items:rows.map(r=>({...r,name:r.name||r.testName}))}});
  }catch(e){next(e);}});

  app.get('/api/spire/patients/:patientId/notes',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatient(prisma,auth,req.params.patientId); await logAccess(prisma,auth,req.params.patientId,'VIEW_NOTES','NOTE');
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT n."id",n."noteType",n."title",n."status",n."authorUserId" AS author,n."createdAt",n."signedAt" FROM "SpireClinicalNote" n WHERE n."organizationId"=$1 AND n."patientId"=$2 ORDER BY n."createdAt" DESC LIMIT 250`,auth.organizationId,req.params.patientId); res.json({data:{items:rows}});
  }catch(e){next(e);}});

  const simpleMap:Record<string,string>={
    'plan':'SpireCarePlan','medications':'SpireMedicationOrder','mar':'SpireMedicationAdministration','orders':'SpireOrder','care-plan':'SpireCarePlan','assessments':'SpireAssessment','vitals':'SpireVitalSign','incidents':'SpireIncident','authorizations':'SpireServiceAuthorization','documents':'SpireClinicalDocument','external':'SpireExternalRecord','communications':'SpireClinicalMessage','timeline':'SpireClinicalAuditEvent'
  };
  app.get('/api/spire/patients/:patientId/:section',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatient(prisma,auth,req.params.patientId); const table=simpleMap[req.params.section]; if(!table){res.json({data:{items:[]}});return;}
    const patientColumn=table==='SpireClinicalAuditEvent'?'clientId':'patientId';
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "${table}" WHERE "organizationId"=$1 AND "${patientColumn}"=$2 ORDER BY COALESCE("createdAt",NOW()) DESC LIMIT 500`,auth.organizationId,req.params.patientId).catch(()=>[]); await logAccess(prisma,auth,req.params.patientId,'VIEW_SECTION',req.params.section); res.json({data:{items:rows}});
  }catch(e){next(e);}});
};
