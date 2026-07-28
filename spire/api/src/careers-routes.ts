import type express from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Helpers = {
  authOf: (response: express.Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => express.RequestHandler;
  audit: (auth: Partial<AuthContext>, action: string, resourceType: string, resourceId?: string, metadata?: object) => Promise<void>;
};

const openingStatus = z.enum(['DRAFT','PUBLISHED','CLOSED','ARCHIVED']);
const openingSchema = z.object({
  title:z.string().trim().min(2).max(160), slug:z.string().trim().regex(/^[a-z0-9-]+$/).max(120), department:z.string().trim().max(120).optional(),
  employmentType:z.string().trim().max(120).optional(), locationText:z.string().trim().max(180).optional(), payRange:z.string().trim().max(120).optional(),
  summary:z.string().trim().min(10).max(1000), description:z.string().trim().min(20).max(20000), requirements:z.string().trim().max(10000).optional(),
  benefits:z.string().trim().max(10000).optional(), applicationPath:z.string().trim().max(300).optional(), status:openingStatus.default('DRAFT'),
  opensAt:z.coerce.date().optional(), closesAt:z.coerce.date().optional()
});
const publicApplicationSchema = z.object({
  jobOpeningId:z.string().optional(), jobSlug:z.string().optional(), sourceExternalId:z.string().trim().max(200).optional(),
  firstName:z.string().trim().min(1).max(80), middleName:z.string().trim().max(80).optional(), lastName:z.string().trim().min(1).max(80),
  email:z.string().email(), phone:z.string().trim().min(7).max(30), appliedRole:z.nativeEnum(UserRole).default(UserRole.DSP), notes:z.string().max(12000).optional(),
  source:z.string().trim().max(60).default('CAREERS'), documents:z.array(z.object({ category:z.enum(['APPLICATION','RESUME','COVER_LETTER','CPR','FIRST_AID','LPN_LICENSE','RN_LICENSE','DRIVER_LICENSE','AUTO_INSURANCE','TB_TEST','PHYSICAL','BACKGROUND_CHECK','SOCIAL_SECURITY_CARD','REFERENCES','OTHER']), label:z.string().trim().min(1).max(120), fileName:z.string().max(255).optional(), downloadUrl:z.string().url().optional(), storagePath:z.string().max(1000).optional(), mimeType:z.string().max(160).optional(), sizeBytes:z.number().int().nonnegative().max(50_000_000).optional() })).max(30).default([])
});

function referenceNumber(){ return `SCLS-APP-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`; }
function requiredCategories(role:UserRole){ return role==='DELEGATING_NURSE' ? ['RESUME','CPR','RN_LICENSE'] : role==='DSP' ? ['RESUME','CPR','DRIVER_LICENSE'] : ['RESUME','CPR','LPN_LICENSE']; }

export function registerCareersRoutes(app:express.Express, prisma:PrismaClient, helpers:Helpers){
  const {authOf,requireRoles,audit}=helpers;

  app.get('/public/careers/openings',async(_req,res,next)=>{try{
    const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id","title","slug","department","employmentType","locationText","payRange","summary","description","requirements","benefits","applicationPath","opensAt","closesAt" FROM "JobOpening" WHERE "status"='PUBLISHED' AND ("opensAt" IS NULL OR "opensAt"<=NOW()) AND ("closesAt" IS NULL OR "closesAt">NOW()) ORDER BY "publishedAt" DESC NULLS LAST,"createdAt" DESC`);
    res.json({data:rows});
  }catch(e){next(e);}});

  app.post('/public/careers/applications',async(req,res,next)=>{try{
    const input=publicApplicationSchema.parse(req.body); let opening:any=null;
    if(input.jobOpeningId) [opening]=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "JobOpening" WHERE "id"=$1 AND "status"='PUBLISHED'`,input.jobOpeningId);
    else if(input.jobSlug) [opening]=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "JobOpening" WHERE "slug"=$1 AND "status"='PUBLISHED' ORDER BY "publishedAt" DESC LIMIT 1`,input.jobSlug);
    const organizationId=opening?.organizationId||process.env.CAREERS_ORGANIZATION_ID;
    if(!organizationId)return res.status(503).json({error:'Careers intake is not configured. Your existing application form remains available; please contact administration.'});
    if(input.sourceExternalId){ const existing=await prisma.$queryRawUnsafe<any[]>(`SELECT "id","referenceNumber" FROM "EmployeeApplication" WHERE "sourceExternalId"=$1 LIMIT 1`,input.sourceExternalId); if(existing[0])return res.json({data:existing[0],duplicate:true}); }
    const id=randomUUID(), ref=referenceNumber(), email=input.email.toLowerCase();
    await prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe(`INSERT INTO "EmployeeApplication" ("id","organizationId","jobOpeningId","firstName","middleName","lastName","email","phone","appliedRole","status","notes","source","sourceExternalId","referenceNumber","folderCreatedAt","submittedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RECEIVED',$10,$11,$12,$13,NOW(),NOW(),NOW(),NOW())`,id,organizationId,opening?.id??null,input.firstName,input.middleName??null,input.lastName,email,input.phone,input.appliedRole,input.notes??null,input.source,input.sourceExternalId??null,ref);
      const provided=new Map(input.documents.map(d=>[d.category,d]));
      const categories=new Set([...requiredCategories(input.appliedRole),'APPLICATION',...input.documents.map(d=>d.category)]);
      for(const category of categories){ const d=provided.get(category as any); await tx.$executeRawUnsafe(`INSERT INTO "ApplicantDocument" ("id","applicationId","category","label","status","fileName","storagePath","downloadUrl","mimeType","sizeBytes","uploadedByType","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,randomUUID(),id,category,d?.label??String(category).replaceAll('_',' '),d?.downloadUrl?'RECEIVED':'MISSING',d?.fileName??null,d?.storagePath??null,d?.downloadUrl??null,d?.mimeType??null,d?.sizeBytes??null,d?.downloadUrl?'APPLICANT':null); }
    });
    res.status(201).json({data:{id,referenceNumber:ref,status:'RECEIVED'}});
  }catch(e){next(e);}});

  app.get('/api/admin/job-openings',requireRoles(UserRole.ADMINISTRATOR),async(_req,res,next)=>{try{const a=authOf(res);res.json({data:await prisma.$queryRawUnsafe<any[]>(`SELECT j.*,COUNT(a."id")::int AS "applicantCount" FROM "JobOpening" j LEFT JOIN "EmployeeApplication" a ON a."jobOpeningId"=j."id" WHERE j."organizationId"=$1 GROUP BY j."id" ORDER BY j."createdAt" DESC`,a.organizationId)});}catch(e){next(e);}});
  app.post('/api/admin/job-openings',requireRoles(UserRole.ADMINISTRATOR),async(req,res,next)=>{try{const a=authOf(res),i=openingSchema.parse(req.body),id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "JobOpening" ("id","organizationId","title","slug","department","employmentType","locationText","payRange","summary","description","requirements","benefits","applicationPath","status","opensAt","closesAt","publishedAt","createdById","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,CASE WHEN $14='PUBLISHED' THEN NOW() ELSE NULL END,$17,NOW(),NOW())`,id,a.organizationId,i.title,i.slug,i.department??null,i.employmentType??null,i.locationText??null,i.payRange??null,i.summary,i.description,i.requirements??null,i.benefits??null,i.applicationPath??null,i.status,i.opensAt??null,i.closesAt??null,a.userId);await audit(a,'CREATE_JOB_OPENING','JobOpening',id,{status:i.status,title:i.title});res.status(201).json({data:{id,...i}});}catch(e){next(e);}});
  app.patch('/api/admin/job-openings/:id',requireRoles(UserRole.ADMINISTRATOR),async(req,res,next)=>{try{const a=authOf(res),id=String(req.params.id),i=openingSchema.partial().parse(req.body);const current=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "JobOpening" WHERE "id"=$1 AND "organizationId"=$2`,id,a.organizationId))[0];if(!current)return res.status(404).json({error:'Opening not found'});const merged={...current,...i};await prisma.$executeRawUnsafe(`UPDATE "JobOpening" SET "title"=$1,"slug"=$2,"department"=$3,"employmentType"=$4,"locationText"=$5,"payRange"=$6,"summary"=$7,"description"=$8,"requirements"=$9,"benefits"=$10,"applicationPath"=$11,"status"=$12,"opensAt"=$13,"closesAt"=$14,"publishedAt"=CASE WHEN $12='PUBLISHED' AND "publishedAt" IS NULL THEN NOW() ELSE "publishedAt" END,"updatedAt"=NOW() WHERE "id"=$15 AND "organizationId"=$16`,merged.title,merged.slug,merged.department,merged.employmentType,merged.locationText,merged.payRange,merged.summary,merged.description,merged.requirements,merged.benefits,merged.applicationPath,merged.status,merged.opensAt,merged.closesAt,id,a.organizationId);await audit(a,'UPDATE_JOB_OPENING','JobOpening',id,{status:merged.status});res.json({data:{id,...merged}});}catch(e){next(e);}});

  app.get('/api/admin/applications/:id/folder',requireRoles(UserRole.ADMINISTRATOR),async(req,res,next)=>{try{const a=authOf(res),id=String(req.params.id);const apps=await prisma.$queryRawUnsafe<any[]>(`SELECT a.*,j."title" AS "jobTitle" FROM "EmployeeApplication" a LEFT JOIN "JobOpening" j ON j."id"=a."jobOpeningId" WHERE a."id"=$1 AND a."organizationId"=$2`,id,a.organizationId);if(!apps[0])return res.status(404).json({error:'Application not found'});const [documents,messages,interviews]=await Promise.all([prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ApplicantDocument" WHERE "applicationId"=$1 ORDER BY "category","version" DESC`,id),prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "ApplicantMessage" WHERE "applicationId"=$1 ORDER BY "createdAt" DESC`,id),prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "InterviewOption" WHERE "applicationId"=$1 ORDER BY "startsAt"`,id)]);res.json({data:{application:apps[0],documents,messages,interviews}});}catch(e){next(e);}});

  app.post('/api/admin/applications/:id/request-document',requireRoles(UserRole.ADMINISTRATOR),async(req,res,next)=>{try{const a=authOf(res),id=String(req.params.id),input=z.object({category:z.string().min(2),label:z.string().min(2).max(120),message:z.string().max(4000).optional()}).parse(req.body);const appRow=(await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "EmployeeApplication" WHERE "id"=$1 AND "organizationId"=$2`,id,a.organizationId))[0];if(!appRow)return res.status(404).json({error:'Application not found'});const rawToken=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(rawToken).digest('hex'),messageId=randomUUID();await prisma.$transaction(async tx=>{await tx.$executeRawUnsafe(`UPDATE "ApplicantDocument" SET "status"='REQUESTED',"updatedAt"=NOW() WHERE "applicationId"=$1 AND "category"=$2`,id,input.category);await tx.$executeRawUnsafe(`INSERT INTO "ApplicantMessage" ("id","applicationId","type","subject","body","recipientEmail","deliveryStatus","secureTokenHash","tokenExpiresAt","createdById","createdAt") VALUES ($1,$2,'DOCUMENT_REQUEST',$3,$4,$5,'QUEUED',$6,NOW()+INTERVAL '14 days',$7,NOW())`,messageId,id,`Document requested: ${input.label}`,input.message??`Please upload your ${input.label}.`,appRow.email,hash,a.userId);});await audit(a,'REQUEST_APPLICANT_DOCUMENT','EmployeeApplication',id,{category:input.category,messageId});res.status(201).json({data:{messageId,deliveryStatus:'QUEUED',uploadPath:`/applicant-upload.html?token=${rawToken}`}});}catch(e){next(e);}});
}
