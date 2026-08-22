import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;legalEntityId?:string;enterpriseOwner?:boolean};
type Deps={authOf:(response:express.Response)=>AuthContext;audit?:(auth:Partial<AuthContext>,action:string,resourceType:string,resourceId?:string,metadata?:object)=>Promise<void>};
type LegalEntityBrandRow={id:string;code:string;displayName:string;metadata:Record<string,unknown>;createdAt?:Date|string};
const roles=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.CEO,UserRole.DOO]);
const httpError=(status:number,message:string)=>Object.assign(new Error(message),{status});
const selectedEntity=(a:AuthContext)=>{if(!a.legalEntityId)throw httpError(409,'Select a Sulandra company first');return a.legalEntityId;};
const owner=(a:AuthContext)=>a.enterpriseOwner===true||String(a.email||'').trim().toLowerCase()==='admin@sulandrahealth.com';
const ensure=(a:AuthContext)=>{if(!roles.has(a.role)&&!owner(a))throw httpError(403,'Company settings administration access is required');selectedEntity(a);};
const schema=z.object({
  companyName:z.string().trim().min(1).max(250).optional(),
  companyAddress:z.string().trim().max(500).optional().nullable(),
  companyPhone:z.string().trim().max(80).optional().nullable(),
  companyEmail:z.string().trim().email().max(250).optional().nullable(),
  senderName:z.string().trim().max(160).optional().nullable(),
  unmonitoredNotice:z.string().trim().max(1000).optional().nullable(),
  employmentDisclaimer:z.string().trim().max(4000).optional().nullable(),
  timezone:z.string().trim().max(100).optional().nullable(),
  supportEmail:z.string().trim().email().max(250).optional().nullable(),
  supportPhone:z.string().trim().max(80).optional().nullable(),
  website:z.string().trim().max(500).optional().nullable(),
  metadata:z.record(z.unknown()).optional(),
});
const asObject=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const asString=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null;
const asStringArray=(v:unknown)=>Array.isArray(v)?v.map(asString).filter((item):item is string=>Boolean(item)):[];
const normalizeHost=(v:unknown)=>String(v||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'').replace(/:\d+$/,'');
const publicBrand=(row:LegalEntityBrandRow)=>{
  const metadata=asObject(row.metadata),settings=asObject(metadata.companySettings),settingsMetadata=asObject(settings.metadata),chronicles=asObject(settingsMetadata.companyChronicles);
  return {
    legalEntityId:row.id,
    code:row.code,
    displayName:row.displayName,
    companyName:asString(settings.companyName)||row.displayName,
    logoUrl:asString(chronicles.logoUrl),
    faviconUrl:asString(chronicles.faviconUrl),
    documentLogoUrl:asString(chronicles.documentLogoUrl)||asString(chronicles.logoUrl),
    brandTagline:asString(chronicles.brandTagline),
    primaryColor:asString(chronicles.primaryColor),
    secondaryColor:asString(chronicles.secondaryColor),
    accentColor:asString(chronicles.accentColor),
    publicContactEmail:asString(chronicles.publicContactEmail)||asString(settings.companyEmail)||asString(settings.supportEmail),
    publicContactPhone:asString(chronicles.publicContactPhone)||asString(settings.companyPhone)||asString(settings.supportPhone),
    website:asString(settings.website),
    domains:asStringArray(chronicles.domains),
  };
};

export const registerCompanySettingsRoutes=(app:express.Express,prisma:PrismaClient,deps:Deps)=>{const{authOf,audit}=deps;
  app.get('/public/company-chronicles',async(req,res,next)=>{try{
    const requestedCode=String(typeof req.query.code==='string'?req.query.code:'').trim().toUpperCase();
    const requestedHost=normalizeHost(typeof req.query.host==='string'?req.query.host:req.header('host'));
    const rows=await prisma.$queryRawUnsafe<LegalEntityBrandRow[]>(`SELECT "id","code","displayName","metadata","createdAt" FROM "LegalEntity" WHERE COALESCE("status"::text,'ACTIVE')='ACTIVE' ORDER BY "createdAt" ASC LIMIT 100`);
    const branded=rows.map(row=>({row,brand:publicBrand(row)}));
    const selected=(requestedCode?branded.find(({row})=>String(row.code||'').toUpperCase()===requestedCode):undefined)
      ||(requestedHost?branded.find(({brand})=>brand.domains.map(normalizeHost).includes(requestedHost)):undefined)
      ||branded.find(({row})=>['SULANDRA_HEALTH','SULANDRA','SH'].includes(String(row.code||'').toUpperCase()))
      ||branded[0];
    if(!selected)throw httpError(404,'No active company branding configuration is available');
    res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=300');
    res.json({data:selected.brand});
  }catch(e){next(e);}});
  app.get('/api/admin/company-settings',async(_req,res,next)=>{try{const a=authOf(res);ensure(a);const rows=await prisma.$queryRawUnsafe<Array<{id:string;code:string;displayName:string;metadata:Record<string,unknown>}>>(`SELECT "id","code","displayName","metadata" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,a.organizationId,selectedEntity(a));const row=rows[0];if(!row)throw httpError(404,'Selected company was not found');const metadata=asObject(row.metadata),settings=asObject(metadata.companySettings);res.json({data:{legalEntityId:row.id,code:row.code,displayName:row.displayName,settings:{companyName:String(settings.companyName||row.displayName),companyAddress:settings.companyAddress??'',companyPhone:settings.companyPhone??'',companyEmail:settings.companyEmail??'',senderName:settings.senderName??'Sulandra Health Human Resources Department',unmonitoredNotice:settings.unmonitoredNotice??'This message was sent from an unmonitored notification mailbox. Please do not reply directly to this message.',employmentDisclaimer:settings.employmentDisclaimer??'This notification does not constitute a formal offer of employment. Formal offers are issued separately after required screening and verification.',timezone:settings.timezone??'America/New_York',supportEmail:settings.supportEmail??'',supportPhone:settings.supportPhone??'',website:settings.website??'',metadata:asObject(settings.metadata),updatedAt:settings.updatedAt??null,updatedById:settings.updatedById??null}}});}catch(e){next(e);}});
  app.patch('/api/admin/company-settings',async(req,res,next)=>{try{const a=authOf(res);ensure(a);const input=schema.parse(req.body);const currentRows=await prisma.$queryRawUnsafe<Array<{displayName:string;metadata:Record<string,unknown>}>>(`SELECT "displayName","metadata" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,a.organizationId,selectedEntity(a));const current=currentRows[0];if(!current)throw httpError(404,'Selected company was not found');const metadata=asObject(current.metadata),existing=asObject(metadata.companySettings);const nextSettings={...existing,...input,companyName:input.companyName??existing.companyName??current.displayName,metadata:{...asObject(existing.metadata),...asObject(input.metadata)},updatedAt:new Date().toISOString(),updatedById:a.userId};const nextMetadata={...metadata,companySettings:nextSettings};await prisma.$executeRawUnsafe(`UPDATE "LegalEntity" SET "metadata"=$1::jsonb,"updatedAt"=NOW() WHERE "organizationId"=$2 AND "id"=$3`,JSON.stringify(nextMetadata),a.organizationId,selectedEntity(a));await audit?.(a,'UPDATE_COMPANY_SETTINGS','LegalEntity',selectedEntity(a),{companySettings:nextSettings});res.json({data:{legalEntityId:selectedEntity(a),settings:nextSettings}});}catch(e){next(e);}});
};
