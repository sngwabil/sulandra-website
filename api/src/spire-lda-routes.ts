import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  legalEntityId?: string;
};

type Dependencies = { authOf: (response: express.Response) => AuthContext };

const readRoles = new Set(['ADMINISTRATOR','PROGRAM_MANAGER','CEO','DOO','DELEGATING_NURSE','RN','LPN','DSP','HOUSE_MANAGER']);
const writeRoles = new Set(['ADMINISTRATOR','PROGRAM_MANAGER','CEO','DELEGATING_NURSE','RN','LPN']);
const adminEmails = new Set(['admin@sulandrahealth.com']);

const CATALOG = [
  { code:'WOUND', category:'WOUND', label:'Wound / Skin Integrity', color:'#c43d69', icon:'◆', assessmentIntervalMinutes:1440,
    subtypes:['Pressure Injury','Surgical Incision','Skin Tear','Diabetic Ulcer','Venous Ulcer','Arterial Ulcer','Traumatic Wound','Moisture-Associated Skin Damage','Other Wound'],
    properties:['woundType','stage','presentOnAdmission','approximateAgeWeeks','description'],
    assessments:['siteAssessment','periWoundAssessment','lengthCm','widthCm','depthCm','woundBed','drainageAmount','drainageColor','odor','tunnelingCm','underminingCm','margins','closure','treatment','dressing','dressingStatus','painScore'] },
  { code:'PIV', category:'LINE', label:'Peripheral IV', color:'#3f7fb2', icon:'●', assessmentIntervalMinutes:480,
    properties:['gauge','site','laterality','numberOfAttempts','indication'], assessments:['siteAssessment','patency','bloodReturn','phlebitis','infiltration','dressing','dressingStatus','necessity','complications'] },
  { code:'MIDLINE', category:'LINE', label:'Midline', color:'#3f7fb2', icon:'●', assessmentIntervalMinutes:480,
    properties:['gauge','site','laterality','lumens','externalLengthCm','indication'], assessments:['siteAssessment','patency','bloodReturn','externalLengthCm','dressing','dressingStatus','necessity','complications'] },
  { code:'PICC', category:'LINE', label:'PICC', color:'#275f91', icon:'●', assessmentIntervalMinutes:480,
    properties:['sizeFrench','site','laterality','lumens','externalLengthCm','tipLocation','indication'], assessments:['siteAssessment','patency','bloodReturn','externalLengthCm','dressing','dressingStatus','connectorStatus','necessity','complications'] },
  { code:'CENTRAL_LINE', category:'LINE', label:'Central Venous Catheter', color:'#275f91', icon:'●', assessmentIntervalMinutes:480,
    properties:['sizeFrench','site','lumens','tipLocation','indication'], assessments:['siteAssessment','patency','bloodReturn','dressing','dressingStatus','connectorStatus','necessity','complications'] },
  { code:'PORT', category:'LINE', label:'Implanted Port', color:'#275f91', icon:'●', assessmentIntervalMinutes:480,
    properties:['site','needleSize','indication'], assessments:['accessed','siteAssessment','patency','bloodReturn','dressing','dressingStatus','necessity','complications'] },
  { code:'DIALYSIS_CATHETER', category:'LINE', label:'Dialysis Catheter', color:'#275f91', icon:'●', assessmentIntervalMinutes:480,
    properties:['site','laterality','lumens','indication'], assessments:['siteAssessment','dressing','dressingStatus','locked','necessity','complications'] },
  { code:'FOLEY', category:'DRAIN', label:'Indwelling Urinary Catheter (Foley)', color:'#d49a20', icon:'▲', assessmentIntervalMinutes:480,
    properties:['sizeFrench','balloonMl','indication','securement'], assessments:['patency','catheterCare','securement','bagPosition','urineColor','urineClarity','drainage','necessity','complications'] },
  { code:'SUPRAPUBIC', category:'DRAIN', label:'Suprapubic Catheter', color:'#d49a20', icon:'▲', assessmentIntervalMinutes:480,
    properties:['sizeFrench','balloonMl','indication'], assessments:['siteAssessment','patency','catheterCare','urineColor','urineClarity','drainage','dressing','complications'] },
  { code:'NEPHROSTOMY', category:'DRAIN', label:'Nephrostomy Tube', color:'#d49a20', icon:'▲', assessmentIntervalMinutes:480,
    properties:['sizeFrench','laterality','indication'], assessments:['siteAssessment','patency','drainageAmountMl','drainageCharacter','dressing','securement','complications'] },
  { code:'JP_DRAIN', category:'DRAIN', label:'Jackson-Pratt Drain', color:'#d46e42', icon:'▲', assessmentIntervalMinutes:480,
    properties:['site','laterality','size','indication'], assessments:['siteAssessment','suction','patency','outputMl','drainageColor','drainageCharacter','dressing','securement','complications'] },
  { code:'SURGICAL_DRAIN', category:'DRAIN', label:'Surgical Drain', color:'#d46e42', icon:'▲', assessmentIntervalMinutes:480,
    properties:['site','laterality','size','indication'], assessments:['siteAssessment','suction','patency','outputMl','drainageColor','drainageCharacter','dressing','securement','complications'] },
  { code:'CHEST_TUBE', category:'DRAIN', label:'Chest Tube', color:'#c9563f', icon:'▲', assessmentIntervalMinutes:240,
    properties:['site','laterality','sizeFrench','indication'], assessments:['siteAssessment','system','suction','waterSeal','airLeak','tidaling','outputMl','drainageCharacter','dressing','securement','respiratoryStatus','complications'] },
  { code:'NG_TUBE', category:'TUBE', label:'Nasogastric Tube', color:'#6a72b5', icon:'■', assessmentIntervalMinutes:480,
    properties:['sizeFrench','nostril','externalLengthCm','indication'], assessments:['placementVerification','externalLengthCm','patency','securement','siteAssessment','feedingStatus','drainage','complications'] },
  { code:'G_TUBE', category:'TUBE', label:'Gastrostomy Tube', color:'#6a72b5', icon:'■', assessmentIntervalMinutes:480,
    properties:['sizeFrench','deviceType','balloonMl','indication'], assessments:['siteAssessment','patency','externalLengthCm','securement','feedingStatus','drainage','dressing','complications'] },
  { code:'J_TUBE', category:'TUBE', label:'Jejunostomy Tube', color:'#6a72b5', icon:'■', assessmentIntervalMinutes:480,
    properties:['sizeFrench','deviceType','indication'], assessments:['siteAssessment','patency','externalLengthCm','securement','feedingStatus','drainage','dressing','complications'] },
  { code:'OSTOMY', category:'OSTOMY', label:'Ostomy / Stoma', color:'#8b5fa5', icon:'⬟', assessmentIntervalMinutes:480,
    properties:['ostomyType','site','indication'], assessments:['stomaColor','stomaMoisture','stomaSize','periStomalSkin','outputAmount','outputCharacter','appliance','sealStatus','complications'] },
  { code:'TRACHEOSTOMY', category:'AIRWAY', label:'Tracheostomy', color:'#267f79', icon:'✚', assessmentIntervalMinutes:240,
    properties:['size','brand','cuffed','indication'], assessments:['siteAssessment','airwayPatency','cuffStatus','securement','innerCannula','secretions','suction','oxygenDelivery','dressing','emergencyEquipment','complications'] },
  { code:'ETT', category:'AIRWAY', label:'Endotracheal Tube', color:'#267f79', icon:'✚', assessmentIntervalMinutes:120,
    properties:['size','depthCm','site','cuffed','indication'], assessments:['airwayPatency','depthCm','cuffPressure','securement','secretions','suction','ventilatorConnection','oralCare','complications'] },
  { code:'WOUND_VAC', category:'THERAPY', label:'Negative Pressure Wound Therapy', color:'#7c5c9d', icon:'◇', assessmentIntervalMinutes:480,
    properties:['device','pressureSetting','mode','linkedWound'], assessments:['therapyRunning','pressureSetting','sealStatus','canisterOutputMl','dressingStatus','alarms','tolerance','complications'] },
  { code:'OTHER', category:'OTHER', label:'Other LDA / Device', color:'#64748b', icon:'●', assessmentIntervalMinutes:480,
    properties:['deviceType','indication'], assessments:['siteAssessment','function','securement','dressing','complications'] },
] as const;

const jsonRecord = z.record(z.unknown()).default({});
const createSchema = z.object({
  typeCode: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(240),
  bodySide: z.enum(['FRONT','BACK']),
  bodyRegion: z.string().trim().min(1).max(120),
  laterality: z.string().trim().max(40).nullable().optional(),
  positionX: z.coerce.number().min(0).max(100),
  positionY: z.coerce.number().min(0).max(100),
  placementAt: z.coerce.date().optional(),
  presentOnAdmission: z.boolean().default(false),
  insertionProvider: z.string().trim().max(240).nullable().optional(),
  indication: z.string().trim().max(1200).nullable().optional(),
  size: z.string().trim().max(120).nullable().optional(),
  assessmentIntervalMinutes: z.coerce.number().int().min(15).max(10080).nullable().optional(),
  linkedOrderId: z.string().trim().max(240).nullable().optional(),
  linkedOrderText: z.string().trim().max(1000).nullable().optional(),
  linkedLdaId: z.string().trim().max(240).nullable().optional(),
  properties: jsonRecord,
  comment: z.string().trim().max(4000).nullable().optional(),
  confirmDuplicate: z.boolean().default(false),
});
const patchSchema = createSchema.omit({ confirmDuplicate:true, typeCode:true }).partial().extend({
  typeCode: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['ACTIVE','REMOVED','COMPLETED','ENTERED_IN_ERROR']).optional(),
});
const assessmentSchema = z.object({
  assessmentType: z.string().trim().min(1).max(120).default('ROUTINE'),
  assessedAt: z.coerce.date().optional(),
  data: jsonRecord,
  comment: z.string().trim().max(4000).nullable().optional(),
  linkedNoteId: z.string().trim().max(240).nullable().optional(),
  amendsAssessmentId: z.string().trim().max(240).nullable().optional(),
});
const removeSchema = z.object({
  removalAt: z.coerce.date().optional(),
  reason: z.string().trim().min(1).max(1200),
  outcome: z.string().trim().max(1200).nullable().optional(),
  removalData: jsonRecord,
});
const linkSchema = z.object({
  linkType: z.enum(['ORDER','LDA','FLOWSHEET','NOTE','THERAPY','OTHER']),
  targetId: z.string().trim().max(240).nullable().optional(),
  label: z.string().trim().min(1).max(500),
  relation: z.string().trim().max(240).nullable().optional(),
});
const imageSchema = z.object({
  assessmentId: z.string().trim().max(240).nullable().optional(),
  fileName: z.string().trim().min(1).max(500),
  mimeType: z.enum(['image/jpeg','image/png','image/webp']),
  dataUrl: z.string().min(50).max(9_000_000).regex(/^data:image\/(jpeg|png|webp);base64,/i),
  caption: z.string().trim().max(1000).nullable().optional(),
  takenAt: z.coerce.date().optional(),
});

const catalogItem = (typeCode: string) => CATALOG.find((item) => item.code === typeCode);
const isAdmin = (auth: AuthContext) => auth.role === 'ADMINISTRATOR' || auth.role === 'PROGRAM_MANAGER' || auth.role === 'CEO' || adminEmails.has(String(auth.email || '').toLowerCase());
const ensureRead = (auth: AuthContext) => { if (!readRoles.has(String(auth.role)) && !isAdmin(auth)) throw Object.assign(new Error('Clinical chart permission is required'), { status:403 }); };
const ensureWrite = (auth: AuthContext) => { if (!writeRoles.has(String(auth.role)) && !isAdmin(auth)) throw Object.assign(new Error('LDA documentation requires nursing/clinical management permission'), { status:403 }); };

async function canAccessClient(prisma: PrismaClient, auth: AuthContext, clientId: string) {
  if (isAdmin(auth)) return true;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed:boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM "SpireEmployeeClientAssignment" a
        WHERE a."organizationId"=$1 AND a."userId"=$2 AND a."clientId"=$3
       UNION ALL
       SELECT 1 FROM "SpireEmployeeHomeAssignment" h
       JOIN "SpireClientProfile" c ON c."organizationId"=h."organizationId" AND c."homeId"=h."homeId"
        WHERE h."organizationId"=$1 AND h."userId"=$2 AND c."clientId"=$3 AND c."active"=TRUE
     ) AS "allowed"`, auth.organizationId, auth.userId, clientId);
  return rows[0]?.allowed === true;
}
async function requireClient(prisma: PrismaClient, auth: AuthContext, clientId: string, write=false) {
  if (write) ensureWrite(auth); else ensureRead(auth);
  if (!(await canAccessClient(prisma, auth, clientId))) throw Object.assign(new Error('This client is not assigned to the signed-in employee'), { status:403 });
}
async function audit(prisma: PrismaClient, auth: AuthContext, action:string, resourceType:string, resourceId:string, clientId:string, beforeValue?:unknown, afterValue?:unknown) {
  await prisma.$executeRawUnsafe(`INSERT INTO "SpireClinicalAuditEvent"
    ("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","beforeValue","afterValue","ipAddress","userAgent","createdAt")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,NOW())`,
    randomUUID(), auth.organizationId, auth.legalEntityId ?? null, auth.userId, auth.email ?? null, clientId, action, resourceType, resourceId,
    beforeValue == null ? null : JSON.stringify(beforeValue), afterValue == null ? null : JSON.stringify(afterValue), auth.ipAddress ?? null, auth.userAgent ?? null);
}
async function getLda(prisma: PrismaClient, auth: AuthContext, clientId:string, ldaId:string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "SpireLda" WHERE "id"=$1 AND "organizationId"=$2 AND "clientId"=$3 LIMIT 1`, ldaId, auth.organizationId, clientId);
  if (!rows[0]) throw Object.assign(new Error('LDA record not found'), { status:404 });
  return rows[0];
}
async function actorMap(prisma: PrismaClient, organizationId:string, userIds:string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map<string,{displayName:string;email:string|null;role:string|null}>();
  const rows = await prisma.$queryRawUnsafe<Array<{id:string;email:string|null;role:string|null;record:Record<string,unknown>}>>(
    `SELECT u."id",u."email",u."role"::text AS "role",to_jsonb(u) AS "record" FROM "User" u WHERE u."organizationId"=$1 AND u."id"=ANY($2::text[])`, organizationId, ids);
  const map = new Map<string,{displayName:string;email:string|null;role:string|null}>();
  for (const row of rows) {
    const r = row.record || {};
    const name = String(r.displayName || r.fullName || r.name || [r.firstName,r.lastName].filter(Boolean).join(' ') || row.email || row.id);
    map.set(row.id,{displayName:name,email:row.email,role:row.role});
  }
  return map;
}
function nextDue(lda:Record<string,unknown>, latest?:Record<string,unknown>) {
  const interval = Number(lda.assessmentIntervalMinutes || 0);
  if (!interval || String(lda.status) !== 'ACTIVE') return null;
  const from = new Date(String(latest?.assessedAt || lda.placementAt || lda.createdAt)).getTime();
  if (!Number.isFinite(from)) return null;
  const at = new Date(from + interval * 60_000);
  return { at:at.toISOString(), state: Date.now() > at.getTime() ? 'OVERDUE' : (Date.now() + 60*60_000 > at.getTime() ? 'DUE_SOON' : 'UPCOMING') };
}

export function registerSpireLdaRoutes(app: express.Express, prisma: PrismaClient, dependencies: Dependencies) {
  const { authOf } = dependencies;

  app.get('/api/spire/lda-catalog', async (_req,res,next) => {
    try { const auth=authOf(res); ensureRead(auth); res.json({data:{catalog:CATALOG,bodySides:['FRONT','BACK']}}); } catch(error){next(error);}
  });

  app.get('/api/spire/patients/:clientId/ldas', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,false);
      const includeRemoved = String(req.query.status || 'ACTIVE').toUpperCase() === 'ALL';
      const rows = await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT l.*,
        la."id" AS "latestAssessmentId",la."assessedAt" AS "latestAssessedAt",la."data" AS "latestAssessmentData",la."comment" AS "latestAssessmentComment",
        (SELECT COUNT(*)::int FROM "SpireLdaAssessment" a WHERE a."ldaId"=l."id" AND a."status"<>'ENTERED_IN_ERROR') AS "assessmentCount",
        (SELECT COUNT(*)::int FROM "SpireLdaImage" i WHERE i."ldaId"=l."id") AS "imageCount"
        FROM "SpireLda" l
        LEFT JOIN LATERAL (SELECT a.* FROM "SpireLdaAssessment" a WHERE a."ldaId"=l."id" AND a."status"<>'ENTERED_IN_ERROR' ORDER BY a."assessedAt" DESC,a."createdAt" DESC LIMIT 1) la ON TRUE
        WHERE l."organizationId"=$1 AND l."clientId"=$2 ${includeRemoved ? '' : `AND l."status"='ACTIVE'`}
        ORDER BY CASE WHEN l."status"='ACTIVE' THEN 0 ELSE 1 END,l."placementAt" DESC`, auth.organizationId, clientId);
      const data = rows.map((row) => ({...row, catalog:catalogItem(String(row.typeCode)) || null, nextAssessmentDue:nextDue(row,{assessedAt:row.latestAssessedAt})}));
      res.json({data});
    } catch(error){next(error);}
  });

  app.get('/api/spire/patients/:clientId/ldas/:ldaId', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,false);
      const lda = await getLda(prisma,auth,clientId,req.params.ldaId);
      const assessments = await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT a.* FROM "SpireLdaAssessment" a WHERE a."ldaId"=$1 AND a."organizationId"=$2 ORDER BY a."assessedAt" DESC,a."createdAt" DESC`, req.params.ldaId,auth.organizationId);
      const images = await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "id","assessmentId","fileName","mimeType","caption","takenAt","uploadedByUserId","createdAt" FROM "SpireLdaImage" WHERE "ldaId"=$1 AND "organizationId"=$2 ORDER BY "takenAt" DESC`,req.params.ldaId,auth.organizationId);
      const links = await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "SpireLdaLink" WHERE "ldaId"=$1 AND "organizationId"=$2 ORDER BY "createdAt" DESC`,req.params.ldaId,auth.organizationId);
      const users = await actorMap(prisma,auth.organizationId,[String(lda.createdByUserId||''),String(lda.updatedByUserId||''),String(lda.removedByUserId||''),...assessments.map(x=>String(x.performedByUserId||'')),...images.map(x=>String(x.uploadedByUserId||''))]);
      const decorate=(row:Record<string,unknown>,field:string)=>{const actor=users.get(String(row[field]||''));return actor?{...row,actor}:row;};
      res.json({data:{...lda,catalog:catalogItem(String(lda.typeCode))||null,nextAssessmentDue:nextDue(lda,assessments[0]),assessments:assessments.map(x=>decorate(x,'performedByUserId')),images:images.map(x=>decorate(x,'uploadedByUserId')),links,createdBy:users.get(String(lda.createdByUserId||''))||null,updatedBy:users.get(String(lda.updatedByUserId||''))||null,removedBy:users.get(String(lda.removedByUserId||''))||null}});
    } catch(error){next(error);}
  });

  app.get('/api/spire/patients/:clientId/ldas/:ldaId/images/:imageId', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,false); await getLda(prisma,auth,clientId,req.params.ldaId);
      const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "SpireLdaImage" WHERE "id"=$1 AND "ldaId"=$2 AND "organizationId"=$3 LIMIT 1`,req.params.imageId,req.params.ldaId,auth.organizationId);
      if(!rows[0]) throw Object.assign(new Error('LDA image not found'),{status:404}); res.json({data:rows[0]});
    } catch(error){next(error);}
  });

  app.post('/api/spire/patients/:clientId/ldas', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,true);
      const input=createSchema.parse(req.body); const catalog=catalogItem(input.typeCode); if(!catalog) throw Object.assign(new Error('Unsupported LDA type'),{status:400});
      const dupes=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT "id","displayName","bodyRegion","bodySide","positionX","positionY","placementAt" FROM "SpireLda" WHERE "organizationId"=$1 AND "clientId"=$2 AND "status"='ACTIVE' AND "typeCode"=$3 AND "bodySide"=$4 AND "bodyRegion"=$5 AND ABS("positionX"-$6)<=8 AND ABS("positionY"-$7)<=8`,auth.organizationId,clientId,input.typeCode,input.bodySide,input.bodyRegion,input.positionX,input.positionY);
      if(dupes.length && !input.confirmDuplicate) { res.status(409).json({error:'A similar active LDA already exists near this body location.',code:'POSSIBLE_DUPLICATE_LDA',possibleDuplicates:dupes}); return; }
      const id=randomUUID(); const interval=input.assessmentIntervalMinutes ?? catalog.assessmentIntervalMinutes ?? null;
      await prisma.$executeRawUnsafe(`INSERT INTO "SpireLda" ("id","organizationId","legalEntityId","clientId","category","typeCode","displayName","bodySide","bodyRegion","laterality","positionX","positionY","placementAt","presentOnAdmission","insertionProvider","indication","size","assessmentIntervalMinutes","linkedOrderId","linkedOrderText","linkedLdaId","properties","comment","createdByUserId","updatedByUserId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24,$24,NOW(),NOW())`,id,auth.organizationId,auth.legalEntityId??null,clientId,catalog.category,input.typeCode,input.displayName,input.bodySide,input.bodyRegion,input.laterality??null,input.positionX,input.positionY,(input.placementAt??new Date()),input.presentOnAdmission,input.insertionProvider??null,input.indication??null,input.size??null,interval,input.linkedOrderId??null,input.linkedOrderText??null,input.linkedLdaId??null,JSON.stringify(input.properties),input.comment??null,auth.userId);
      const after=await getLda(prisma,auth,clientId,id); await audit(prisma,auth,'LDA_CREATED','SpireLda',id,clientId,null,after); res.status(201).json({data:{...after,catalog}});
    } catch(error){next(error);}
  });

  app.patch('/api/spire/patients/:clientId/ldas/:ldaId', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,true); const before=await getLda(prisma,auth,clientId,req.params.ldaId); const input=patchSchema.parse(req.body);
      const typeCode=input.typeCode??String(before.typeCode); const catalog=catalogItem(typeCode); if(!catalog) throw Object.assign(new Error('Unsupported LDA type'),{status:400});
      const properties={...(before.properties as Record<string,unknown>||{}),...(input.properties||{})};
      const nextRow={displayName:input.displayName??before.displayName,category:catalog.category,typeCode,bodySide:input.bodySide??before.bodySide,bodyRegion:input.bodyRegion??before.bodyRegion,laterality:input.laterality===undefined?before.laterality:input.laterality,positionX:input.positionX??before.positionX,positionY:input.positionY??before.positionY,placementAt:input.placementAt??before.placementAt,presentOnAdmission:input.presentOnAdmission??before.presentOnAdmission,insertionProvider:input.insertionProvider===undefined?before.insertionProvider:input.insertionProvider,indication:input.indication===undefined?before.indication:input.indication,size:input.size===undefined?before.size:input.size,assessmentIntervalMinutes:input.assessmentIntervalMinutes===undefined?before.assessmentIntervalMinutes:input.assessmentIntervalMinutes,linkedOrderId:input.linkedOrderId===undefined?before.linkedOrderId:input.linkedOrderId,linkedOrderText:input.linkedOrderText===undefined?before.linkedOrderText:input.linkedOrderText,linkedLdaId:input.linkedLdaId===undefined?before.linkedLdaId:input.linkedLdaId,properties,comment:input.comment===undefined?before.comment:input.comment,status:input.status??before.status};
      await prisma.$executeRawUnsafe(`UPDATE "SpireLda" SET "displayName"=$1,"category"=$2,"typeCode"=$3,"bodySide"=$4,"bodyRegion"=$5,"laterality"=$6,"positionX"=$7,"positionY"=$8,"placementAt"=$9,"presentOnAdmission"=$10,"insertionProvider"=$11,"indication"=$12,"size"=$13,"assessmentIntervalMinutes"=$14,"linkedOrderId"=$15,"linkedOrderText"=$16,"linkedLdaId"=$17,"properties"=$18::jsonb,"comment"=$19,"status"=$20,"updatedByUserId"=$21 WHERE "id"=$22 AND "organizationId"=$23 AND "clientId"=$24`,nextRow.displayName,nextRow.category,nextRow.typeCode,nextRow.bodySide,nextRow.bodyRegion,nextRow.laterality,nextRow.positionX,nextRow.positionY,nextRow.placementAt,nextRow.presentOnAdmission,nextRow.insertionProvider,nextRow.indication,nextRow.size,nextRow.assessmentIntervalMinutes,nextRow.linkedOrderId,nextRow.linkedOrderText,nextRow.linkedLdaId,JSON.stringify(properties),nextRow.comment,nextRow.status,auth.userId,req.params.ldaId,auth.organizationId,clientId);
      const after=await getLda(prisma,auth,clientId,req.params.ldaId); await audit(prisma,auth,'LDA_UPDATED','SpireLda',req.params.ldaId,clientId,before,after); res.json({data:{...after,catalog}});
    } catch(error){next(error);}
  });

  app.post('/api/spire/patients/:clientId/ldas/:ldaId/assessments', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,true); const lda=await getLda(prisma,auth,clientId,req.params.ldaId); if(String(lda.status)!=='ACTIVE') throw Object.assign(new Error('Removed/completed LDAs cannot receive new assessments'),{status:409});
      const input=assessmentSchema.parse(req.body); const id=randomUUID();
      if(input.amendsAssessmentId){await prisma.$executeRawUnsafe(`UPDATE "SpireLdaAssessment" SET "status"='AMENDED',"updatedAt"=NOW() WHERE "id"=$1 AND "ldaId"=$2 AND "organizationId"=$3`,input.amendsAssessmentId,req.params.ldaId,auth.organizationId);}
      await prisma.$executeRawUnsafe(`INSERT INTO "SpireLdaAssessment" ("id","organizationId","clientId","ldaId","assessmentType","status","assessedAt","data","comment","linkedNoteId","performedByUserId","amendsAssessmentId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'FINAL',$6,$7::jsonb,$8,$9,$10,$11,NOW(),NOW())`,id,auth.organizationId,clientId,req.params.ldaId,input.assessmentType,input.assessedAt??new Date(),JSON.stringify(input.data),input.comment??null,input.linkedNoteId??null,auth.userId,input.amendsAssessmentId??null);
      const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`SELECT * FROM "SpireLdaAssessment" WHERE "id"=$1`,id); await audit(prisma,auth,input.amendsAssessmentId?'LDA_ASSESSMENT_AMENDED':'LDA_ASSESSED','SpireLdaAssessment',id,clientId,null,rows[0]); res.status(201).json({data:rows[0]});
    } catch(error){next(error);}
  });

  app.post('/api/spire/patients/:clientId/ldas/:ldaId/remove', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,true); const before=await getLda(prisma,auth,clientId,req.params.ldaId); if(String(before.status)!=='ACTIVE') throw Object.assign(new Error('LDA is already removed or completed'),{status:409}); const input=removeSchema.parse(req.body);
      const props={...(before.properties as Record<string,unknown>||{}),removal:{reason:input.reason,outcome:input.outcome??null,...input.removalData}};
      await prisma.$executeRawUnsafe(`UPDATE "SpireLda" SET "status"='REMOVED',"removalAt"=$1,"removedByUserId"=$2,"updatedByUserId"=$2,"properties"=$3::jsonb WHERE "id"=$4 AND "organizationId"=$5 AND "clientId"=$6`,input.removalAt??new Date(),auth.userId,JSON.stringify(props),req.params.ldaId,auth.organizationId,clientId);
      const after=await getLda(prisma,auth,clientId,req.params.ldaId); await audit(prisma,auth,'LDA_REMOVED','SpireLda',req.params.ldaId,clientId,before,after); res.json({data:after});
    } catch(error){next(error);}
  });

  app.post('/api/spire/patients/:clientId/ldas/:ldaId/reopen', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,true); const before=await getLda(prisma,auth,clientId,req.params.ldaId); const reason=z.object({reason:z.string().trim().min(1).max(1200)}).parse(req.body);
      await prisma.$executeRawUnsafe(`UPDATE "SpireLda" SET "status"='ACTIVE',"removalAt"=NULL,"removedByUserId"=NULL,"updatedByUserId"=$1,"comment"=CONCAT_WS(E'\n',NULLIF("comment",''),$2) WHERE "id"=$3 AND "organizationId"=$4 AND "clientId"=$5`,auth.userId,`Reopened: ${reason.reason}`,req.params.ldaId,auth.organizationId,clientId);
      const after=await getLda(prisma,auth,clientId,req.params.ldaId); await audit(prisma,auth,'LDA_REOPENED','SpireLda',req.params.ldaId,clientId,before,after); res.json({data:after});
    } catch(error){next(error);}
  });

  app.post('/api/spire/patients/:clientId/ldas/:ldaId/links', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,true); await getLda(prisma,auth,clientId,req.params.ldaId); const input=linkSchema.parse(req.body); const id=randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "SpireLdaLink" ("id","organizationId","clientId","ldaId","linkType","targetId","label","relation","createdByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,id,auth.organizationId,clientId,req.params.ldaId,input.linkType,input.targetId??null,input.label,input.relation??null,auth.userId); await audit(prisma,auth,'LDA_LINK_ADDED','SpireLdaLink',id,clientId,null,input); res.status(201).json({data:{id,...input}});
    } catch(error){next(error);}
  });

  app.delete('/api/spire/patients/:clientId/ldas/:ldaId/links/:linkId', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,true); await getLda(prisma,auth,clientId,req.params.ldaId); const rows=await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(`DELETE FROM "SpireLdaLink" WHERE "id"=$1 AND "ldaId"=$2 AND "organizationId"=$3 RETURNING *`,req.params.linkId,req.params.ldaId,auth.organizationId); if(!rows[0]) throw Object.assign(new Error('LDA link not found'),{status:404}); await audit(prisma,auth,'LDA_LINK_REMOVED','SpireLdaLink',req.params.linkId,clientId,rows[0],null); res.json({data:{deleted:true}});
    } catch(error){next(error);}
  });

  app.post('/api/spire/patients/:clientId/ldas/:ldaId/images', async (req,res,next) => {
    try {
      const auth=authOf(res); const clientId=req.params.clientId; await requireClient(prisma,auth,clientId,true); await getLda(prisma,auth,clientId,req.params.ldaId); const input=imageSchema.parse(req.body); const id=randomUUID();
      if(input.assessmentId){const found=await prisma.$queryRawUnsafe<Array<{id:string}>>(`SELECT "id" FROM "SpireLdaAssessment" WHERE "id"=$1 AND "ldaId"=$2 AND "organizationId"=$3`,input.assessmentId,req.params.ldaId,auth.organizationId);if(!found.length) throw Object.assign(new Error('Assessment for image was not found'),{status:404});}
      await prisma.$executeRawUnsafe(`INSERT INTO "SpireLdaImage" ("id","organizationId","clientId","ldaId","assessmentId","fileName","mimeType","dataUrl","caption","takenAt","uploadedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,id,auth.organizationId,clientId,req.params.ldaId,input.assessmentId??null,input.fileName,input.mimeType,input.dataUrl,input.caption??null,input.takenAt??new Date(),auth.userId); await audit(prisma,auth,'LDA_IMAGE_ADDED','SpireLdaImage',id,clientId,null,{assessmentId:input.assessmentId,fileName:input.fileName,mimeType:input.mimeType,caption:input.caption}); res.status(201).json({data:{id,fileName:input.fileName,mimeType:input.mimeType,caption:input.caption,takenAt:input.takenAt??new Date()}});
    } catch(error){next(error);}
  });
}
