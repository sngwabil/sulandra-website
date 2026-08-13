import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';

type AuthContext = { userId:string; organizationId:string; role:UserRole; email?:string; ipAddress?:string; userAgent?:string; legalEntityId?:string };
type Deps = { authOf:(response:express.Response)=>AuthContext };

const clinicalRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.AUDITOR,UserRole.DSP,UserRole.DELEGATING_NURSE,
  UserRole.LPN,UserRole.RN,UserRole.HOUSE_MANAGER,UserRole.CEO,UserRole.DOO,
]);
const chartWriteRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.DSP,UserRole.DELEGATING_NURSE,
  UserRole.LPN,UserRole.RN,UserRole.HOUSE_MANAGER,UserRole.CEO,UserRole.DOO,
]);
const adminRoles = new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.CEO,UserRole.DOO]);
const ensureClinical = (auth:AuthContext) => { if(!clinicalRoles.has(auth.role)) throw Object.assign(new Error('Spire clinical access is required'),{status:403}); };
const ensureWrite = (auth:AuthContext) => { ensureClinical(auth); if(!chartWriteRoles.has(auth.role)) throw Object.assign(new Error('This Spire role is read-only'),{status:403}); };
const isAdmin = (auth:AuthContext) => adminRoles.has(auth.role) || String(auth.email||'').toLowerCase()==='admin@sulandrahealth.com';
const selectedEntity = (auth:AuthContext) => { if(!auth.legalEntityId) throw Object.assign(new Error('Select a Sulandra company before using SPIRE'),{status:409}); return auth.legalEntityId; };
const text = (value:unknown,max=10000) => typeof value==='string' ? value.trim().slice(0,max) : '';
const safeDownloadName=(value:string)=>value.replace(/[\r\n"]/g,'_').replace(/[\\/]/g,'_').slice(0,300)||'intake-document';

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
async function requirePatient(prisma:PrismaClient,auth:AuthContext,patientId:string){ ensureClinical(auth); selectedEntity(auth); if(!(await patientAllowed(prisma,auth,patientId))) throw Object.assign(new Error('This chart is outside your authorized clinical scope'),{status:403}); }
async function requirePatientWrite(prisma:PrismaClient,auth:AuthContext,patientId:string){ ensureWrite(auth); await requirePatient(prisma,auth,patientId); }
async function logAccess(prisma:PrismaClient,auth:AuthContext,patientId:string,action:string,resourceType?:string,resourceId?:string){
  await prisma.$executeRawUnsafe(`INSERT INTO "SpireChartAccessEvent"("organizationId","legalEntityId","patientId","actorUserId","actorEmail","action","resourceType","resourceId","ipAddress","userAgent") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,auth.organizationId,selectedEntity(auth),patientId,auth.userId,auth.email??null,action,resourceType??null,resourceId??null,auth.ipAddress??null,auth.userAgent??null);
}
async function auditClinical(prisma:PrismaClient,auth:AuthContext,patientId:string,action:string,resourceType:string,resourceId:string,afterValue:unknown){
  await prisma.$executeRawUnsafe(`INSERT INTO "SpireClinicalAuditEvent"("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent") VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,auth.organizationId,selectedEntity(auth),auth.userId,auth.email??null,patientId,action,resourceType,resourceId,JSON.stringify(afterValue??{}),auth.ipAddress??null,auth.userAgent??null);
}
const patientDisplay = (row:Record<string,unknown>) => ({
  id:String(row.id), patientId:String(row.id), medicalRecordNumber:row.medicalRecordNumber??null,
  name:[row.preferredName||row.firstName,row.lastName].filter(Boolean).join(' '), firstName:row.firstName,lastName:row.lastName,
  dateOfBirth:row.dateOfBirth,homeName:row.homeName??null,programName:row.programName??null,flags:row.flags??[],allergies:row.allergies??[],diagnoses:row.diagnoses??[],
});

export const registerSpireFoundationRoutes = (app:express.Express,prisma:PrismaClient,deps:Deps) => {
  const {authOf}=deps;
  app.get('/api/spire/patients',async(_req,res,next)=>{try{
    const auth=authOf(res); ensureClinical(auth); selectedEntity(auth);
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
    const auth=authOf(res); ensureClinical(auth); selectedEntity(auth);
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT a."id",a."patientId",a."startsAt",a."endsAt",a."status",a."appointmentType",a."locationId",a."providerUserId",p."firstName",p."preferredName",p."lastName" FROM "SpireAppointment" a JOIN "SpirePatient" p ON p."id"=a."patientId" AND p."organizationId"=a."organizationId" WHERE a."organizationId"=$1 AND a."startsAt">=date_trunc('day',NOW()) AND a."startsAt"<date_trunc('day',NOW())+INTERVAL '1 day' ORDER BY a."startsAt"`,auth.organizationId);
    const out=[]; for(const r of rows){if(await patientAllowed(prisma,auth,String(r.patientId))) out.push({id:r.id,patientId:r.patientId,patientName:[r.preferredName||r.firstName,r.lastName].filter(Boolean).join(' '),time:new Date(String(r.startsAt)).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),status:r.status,type:r.appointmentType,provider:r.providerUserId,location:r.locationId});} res.json({data:out});
  }catch(e){next(e);}});

  app.get('/api/spire/inbasket',async(_req,res,next)=>{try{
    const auth=authOf(res); ensureClinical(auth); selectedEntity(auth);
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
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT n."id",n."legalEntityId",n."noteType",n."title",n."status",n."authorUserId" AS author,n."createdAt",n."signedAt",v."body" FROM "SpireClinicalNote" n LEFT JOIN LATERAL (SELECT "body" FROM "SpireClinicalNoteVersion" v WHERE v."noteId"=n."id" ORDER BY v."version" DESC LIMIT 1) v ON TRUE WHERE n."organizationId"=$1 AND n."patientId"=$2 ORDER BY n."createdAt" DESC LIMIT 250`,auth.organizationId,req.params.patientId); res.json({data:{items:rows}});
  }catch(e){next(e);}});

  app.get('/api/spire/patients/:patientId/admission-history',async(req,res,next)=>{try{
    const auth=authOf(res),patientId=req.params.patientId; await requirePatient(prisma,auth,patientId);
    const cases=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT intake."id",intake."legalEntityId",entity."code" AS "companyCode",entity."displayName" AS "companyName",intake."serviceType",intake."programCode",intake."referralSource",intake."referralDate",intake."approvedAt",intake."approvedById",intake."reviewNotes",intake."createdAt" FROM "ClientIntakeCase" intake JOIN "LegalEntity" entity ON entity."organizationId"=intake."organizationId" AND entity."id"=intake."legalEntityId" WHERE intake."organizationId"=$1 AND intake."patientId"=$2 AND intake."status"='APPROVED' ORDER BY intake."approvedAt" DESC NULLS LAST,intake."createdAt" DESC`,auth.organizationId,patientId);
    const admissions=[]; for(const c of cases){const caseId=String(c.id);const[sections,attachments,signatures]=await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "sectionKey","sectionTitle","sectionGroup","status","payload","completedAt","reviewState","reviewComment","updatedAt" FROM "ClientIntakeSection" WHERE "organizationId"=$1 AND "intakeCaseId"=$2 AND "status" IN ('COMPLETE','NOT_APPLICABLE') ORDER BY "createdAt","sectionKey"`,auth.organizationId,caseId),
      prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "id","sectionKey","documentType","title","originalFileName","mimeType","sizeBytes","sha256","expirationDate","notes","createdAt" FROM "ClientIntakeAttachment" WHERE "organizationId"=$1 AND "intakeCaseId"=$2 AND "status"='ACTIVE' ORDER BY "createdAt" DESC`,auth.organizationId,caseId),
      prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "signatureType","signerName","signerRelationship","signatureMethod","attestation","signedAt" FROM "ClientIntakeSignature" WHERE "organizationId"=$1 AND "intakeCaseId"=$2 AND "revokedAt" IS NULL ORDER BY "signedAt" DESC`,auth.organizationId,caseId)
    ]);admissions.push({...c,sections,attachments,signatures});}
    await logAccess(prisma,auth,patientId,'VIEW_ADMISSION_HISTORY','ADMISSION_HISTORY'); res.json({data:{patientId,selectedLegalEntityId:selectedEntity(auth),admissions}});
  }catch(e){next(e);}});

  app.get('/api/spire/patients/:patientId/admission-history/:caseId/attachments/:attachmentId/download',async(req,res,next)=>{try{
    const auth=authOf(res),patientId=req.params.patientId; await requirePatient(prisma,auth,patientId);
    const rows=await prisma.$queryRawUnsafe<Array<{id:string;originalFileName:string;mimeType:string;sizeBytes:number;sha256:string;content:Buffer;sourceLegalEntityId:string}>>(`SELECT attachment."id",attachment."originalFileName",attachment."mimeType",attachment."sizeBytes",attachment."sha256",attachment."content",intake."legalEntityId" AS "sourceLegalEntityId" FROM "ClientIntakeAttachment" attachment JOIN "ClientIntakeCase" intake ON intake."id"=attachment."intakeCaseId" AND intake."organizationId"=attachment."organizationId" WHERE attachment."organizationId"=$1 AND intake."patientId"=$2 AND intake."id"=$3 AND attachment."id"=$4 AND intake."status"='APPROVED' AND attachment."status"='ACTIVE' LIMIT 1`,auth.organizationId,patientId,req.params.caseId,req.params.attachmentId);const x=rows[0];if(!x)throw Object.assign(new Error('Approved intake document was not found'),{status:404});
    await logAccess(prisma,auth,patientId,'DOWNLOAD_ADMISSION_DOCUMENT','ADMISSION_DOCUMENT',x.id);res.setHeader('Content-Type',x.mimeType||'application/octet-stream');res.setHeader('Content-Length',String(x.sizeBytes));res.setHeader('Content-Disposition',`attachment; filename="${safeDownloadName(x.originalFileName)}"`);res.setHeader('X-Sulandra-Source-Entity',x.sourceLegalEntityId);res.setHeader('Cache-Control','private, no-store');res.send(x.content);
  }catch(e){next(e);}});

  app.post('/api/spire/patients/:patientId/encounters',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatientWrite(prisma,auth,req.params.patientId); const entity=selectedEntity(auth);
    const encounterType=text(req.body?.encounterType,80)||'OFFICE_VISIT'; const chiefComplaint=text(req.body?.chiefComplaint,500)||null; const appointmentId=text(req.body?.appointmentId,100)||null;
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireEncounter"("organizationId","legalEntityId","patientId","appointmentId","encounterType","status","chiefComplaint","createdById") VALUES($1,$2,$3,$4,$5,'OPEN',$6,$7) RETURNING *`,auth.organizationId,entity,req.params.patientId,appointmentId,encounterType,chiefComplaint,auth.userId);
    const row=rows[0]; await auditClinical(prisma,auth,req.params.patientId,'CREATE_ENCOUNTER','ENCOUNTER',String(row.id),row); res.status(201).json({data:row});
  }catch(e){next(e);}});

  app.post('/api/spire/patients/:patientId/notes',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatientWrite(prisma,auth,req.params.patientId); const entity=selectedEntity(auth);
    const body=text(req.body?.body,100000); if(!body) throw Object.assign(new Error('Note body is required'),{status:400});
    const noteType=text(req.body?.noteType,80)||'PROGRESS_NOTE'; const title=text(req.body?.title,250)||null; const encounterId=text(req.body?.encounterId,100)||null;
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`WITH n AS (INSERT INTO "SpireClinicalNote"("organizationId","legalEntityId","patientId","encounterId","noteType","title","status","authorUserId") VALUES($1,$2,$3,$4,$5,$6,'DRAFT',$7) RETURNING *) INSERT INTO "SpireClinicalNoteVersion"("organizationId","legalEntityId","noteId","version","body","createdById") SELECT $1,$2,n."id",1,$8,$7 FROM n RETURNING "noteId"`,auth.organizationId,entity,req.params.patientId,encounterId,noteType,title,auth.userId,body);
    const noteId=String(rows[0]?.noteId||''); await auditClinical(prisma,auth,req.params.patientId,'CREATE_NOTE','NOTE',noteId,{noteType,title,encounterId}); res.status(201).json({data:{id:noteId,status:'DRAFT',legalEntityId:entity}});
  }catch(e){next(e);}});

  app.put('/api/spire/patients/:patientId/notes/:noteId',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatientWrite(prisma,auth,req.params.patientId); const entity=selectedEntity(auth); const body=text(req.body?.body,100000); if(!body) throw Object.assign(new Error('Note body is required'),{status:400});
    const owned=await prisma.$queryRawUnsafe<Array<{id:string;currentVersion:number}>>(`SELECT "id","currentVersion" FROM "SpireClinicalNote" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 AND "status"='DRAFT'`,auth.organizationId,entity,req.params.patientId,req.params.noteId); if(!owned[0]) throw Object.assign(new Error('Editable draft note not found in the selected company'),{status:404});
    const version=Number(owned[0].currentVersion||1)+1; await prisma.$executeRawUnsafe(`INSERT INTO "SpireClinicalNoteVersion"("organizationId","legalEntityId","noteId","version","body","changeReason","createdById") VALUES($1,$2,$3,$4,$5,$6,$7)`,auth.organizationId,entity,req.params.noteId,version,body,text(req.body?.changeReason,500)||null,auth.userId); await prisma.$executeRawUnsafe(`UPDATE "SpireClinicalNote" SET "currentVersion"=$1,"updatedAt"=NOW() WHERE "id"=$2 AND "organizationId"=$3 AND "legalEntityId"=$4`,version,req.params.noteId,auth.organizationId,entity);
    await auditClinical(prisma,auth,req.params.patientId,'UPDATE_NOTE','NOTE',req.params.noteId,{version}); res.json({data:{id:req.params.noteId,version,status:'DRAFT'}});
  }catch(e){next(e);}});

  app.post('/api/spire/patients/:patientId/notes/:noteId/sign',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatientWrite(prisma,auth,req.params.patientId); const entity=selectedEntity(auth);
    const result=await prisma.$executeRawUnsafe(`UPDATE "SpireClinicalNote" SET "status"='SIGNED',"signedAt"=NOW(),"signedById"=$1,"updatedAt"=NOW() WHERE "id"=$2 AND "organizationId"=$3 AND "legalEntityId"=$4 AND "patientId"=$5 AND "status"='DRAFT'`,auth.userId,req.params.noteId,auth.organizationId,entity,req.params.patientId); if(!result) throw Object.assign(new Error('Draft note not found in the selected company'),{status:404});
    const cosigner=text(req.body?.cosignerUserId,100); if(cosigner) await prisma.$executeRawUnsafe(`INSERT INTO "SpireNoteCosigner"("organizationId","legalEntityId","noteId","cosignerUserId","status") VALUES($1,$2,$3,$4,'PENDING')`,auth.organizationId,entity,req.params.noteId,cosigner);
    await auditClinical(prisma,auth,req.params.patientId,'SIGN_NOTE','NOTE',req.params.noteId,{cosignerUserId:cosigner||null}); res.json({data:{id:req.params.noteId,status:'SIGNED',cosignRequested:Boolean(cosigner)}});
  }catch(e){next(e);}});

  app.get('/api/spire/tools/smartphrases',async(_req,res,next)=>{try{
    const auth=authOf(res); ensureClinical(auth); selectedEntity(auth); const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "id","name","description","body","ownerUserId","sharedOrganizationWide" FROM "SpireSmartPhrase" WHERE "organizationId"=$1 AND "active"=TRUE AND ("ownerUserId"=$2 OR "sharedOrganizationWide"=TRUE OR EXISTS(SELECT 1 FROM "SpireSmartPhraseShare" s WHERE s."smartPhraseId"="SpireSmartPhrase"."id" AND s."sharedWithUserId"=$2)) ORDER BY "name"`,auth.organizationId,auth.userId); res.json({data:rows});
  }catch(e){next(e);}});

  app.post('/api/spire/tools/smartphrases',async(req,res,next)=>{try{
    const auth=authOf(res); ensureWrite(auth); selectedEntity(auth); const name=text(req.body?.name,80).replace(/^\.+/,'').replace(/[^A-Za-z0-9_-]/g,'').toUpperCase(); const body=text(req.body?.body,100000); if(!name||!body) throw Object.assign(new Error('SmartPhrase name and body are required'),{status:400});
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireSmartPhrase"("organizationId","ownerUserId","name","description","body","sharedOrganizationWide") VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,auth.organizationId,auth.userId,name,text(req.body?.description,500)||null,body,req.body?.sharedOrganizationWide===true && isAdmin(auth)); res.status(201).json({data:rows[0]});
  }catch(e){next(e);}});

  app.post('/api/spire/patients/:patientId/orders',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatientWrite(prisma,auth,req.params.patientId); const entity=selectedEntity(auth); const name=text(req.body?.name,250); if(!name) throw Object.assign(new Error('Order name is required'),{status:400});
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireOrder"("organizationId","legalEntityId","patientId","encounterId","orderType","name","instructions","priority","status","orderedById") VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9) RETURNING *`,auth.organizationId,entity,req.params.patientId,text(req.body?.encounterId,100)||null,text(req.body?.orderType,80)||'CLINICAL',name,text(req.body?.instructions,5000)||null,text(req.body?.priority,30)||'ROUTINE',auth.userId); const row=rows[0]; await auditClinical(prisma,auth,req.params.patientId,'CREATE_ORDER','ORDER',String(row.id),row); res.status(201).json({data:row});
  }catch(e){next(e);}});

  app.post('/api/spire/patients/:patientId/vitals',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatientWrite(prisma,auth,req.params.patientId); const entity=selectedEntity(auth);
    const numberOrNull=(v:unknown)=>v===''||v===null||v===undefined?null:Number(v); const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`INSERT INTO "SpireVitalSign"("organizationId","legalEntityId","patientId","encounterId","temperature","pulse","respirations","systolic","diastolic","spo2","weight","oxygen","recordedById") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,auth.organizationId,entity,req.params.patientId,text(req.body?.encounterId,100)||null,numberOrNull(req.body?.temperature),numberOrNull(req.body?.pulse),numberOrNull(req.body?.respirations),numberOrNull(req.body?.systolic),numberOrNull(req.body?.diastolic),numberOrNull(req.body?.spo2),numberOrNull(req.body?.weight),text(req.body?.oxygen,100)||null,auth.userId); const row=rows[0]; await auditClinical(prisma,auth,req.params.patientId,'RECORD_VITALS','VITAL_SIGN',String(row.id),row); res.status(201).json({data:row});
  }catch(e){next(e);}});

  app.post('/api/spire/patients/:patientId/wrap-up',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatientWrite(prisma,auth,req.params.patientId); const entity=selectedEntity(auth); const encounterId=text(req.body?.encounterId,100); if(!encounterId) throw Object.assign(new Error('Encounter is required'),{status:400});
    const result=await prisma.$executeRawUnsafe(`UPDATE "SpireEncounter" SET "serviceLevel"=$1,"status"='SIGNED',"endedAt"=NOW(),"signedAt"=NOW(),"signedById"=$2,"updatedAt"=NOW() WHERE "id"=$3 AND "organizationId"=$4 AND "legalEntityId"=$5 AND "patientId"=$6 AND "status"<>'SIGNED'`,text(req.body?.serviceLevel,80)||null,auth.userId,encounterId,auth.organizationId,entity,req.params.patientId); if(!result) throw Object.assign(new Error('Open encounter not found in the selected company'),{status:404});
    const timeframe=text(req.body?.followUpTimeframe,250); const instructions=text(req.body?.instructions,10000); if(timeframe||instructions) await prisma.$executeRawUnsafe(`INSERT INTO "SpireVisitFollowUp"("organizationId","legalEntityId","encounterId","timeframe","instructions","createdById") VALUES($1,$2,$3,$4,$5,$6)`,auth.organizationId,entity,encounterId,timeframe||null,instructions||null,auth.userId);
    await prisma.$executeRawUnsafe(`INSERT INTO "SpireEncounterStatusHistory"("organizationId","legalEntityId","encounterId","fromStatus","toStatus","reason","changedById") VALUES($1,$2,$3,'OPEN','SIGNED',$4,$5)`,auth.organizationId,entity,encounterId,text(req.body?.reason,500)||'Encounter signed from Wrap-Up',auth.userId);
    await auditClinical(prisma,auth,req.params.patientId,'SIGN_ENCOUNTER','ENCOUNTER',encounterId,{serviceLevel:text(req.body?.serviceLevel,80)||null,followUpTimeframe:timeframe||null}); res.json({data:{id:encounterId,status:'SIGNED'}});
  }catch(e){next(e);}});

  const simpleMap:Record<string,string>={
    'plan':'SpireCarePlan','medications':'SpireMedicationOrder','mar':'SpireMedicationAdministration','orders':'SpireOrder','care-plan':'SpireCarePlan','assessments':'SpireAssessment','vitals':'SpireVitalSign','incidents':'SpireIncident','authorizations':'SpireServiceAuthorization','documents':'SpireClinicalDocument','external':'SpireExternalRecord','communications':'SpireClinicalMessage','timeline':'SpireClinicalAuditEvent'
  };
  app.get('/api/spire/patients/:patientId/:section',async(req,res,next)=>{try{
    const auth=authOf(res); await requirePatient(prisma,auth,req.params.patientId); const table=simpleMap[req.params.section]; if(!table){next();return;}
    const patientColumn=table==='SpireClinicalAuditEvent'?'clientId':'patientId';
    const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "${table}" WHERE "organizationId"=$1 AND "${patientColumn}"=$2 ORDER BY COALESCE("createdAt",NOW()) DESC LIMIT 500`,auth.organizationId,req.params.patientId).catch(()=>[]); await logAccess(prisma,auth,req.params.patientId,'VIEW_SECTION',req.params.section); res.json({data:{items:rows}});
  }catch(e){next(e);}});
};