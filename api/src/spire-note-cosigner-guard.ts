import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string;legalEntityId?:string;enterpriseOwner?:boolean};
type Deps={authOf:(response:express.Response)=>AuthContext};
const clinicalAccessRoles=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.AUDITOR,UserRole.DSP,UserRole.DELEGATING_NURSE,UserRole.LPN,UserRole.RN,UserRole.HOUSE_MANAGER,UserRole.CEO,UserRole.DOO]);
const cosignerRoles=new Set<UserRole>([UserRole.DELEGATING_NURSE,UserRole.RN]);
const httpError=(status:number,message:string)=>Object.assign(new Error(message),{status});
const selectedEntity=(a:AuthContext)=>{if(!a.legalEntityId)throw httpError(409,'Select a Sulandra company before using note cosign');return a.legalEntityId;};
const owner=(a:AuthContext)=>a.enterpriseOwner===true||String(a.email||'').trim().toLowerCase()==='admin@sulandrahealth.com';
const asObject=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const clean=(v:unknown)=>typeof v==='string'?v.trim():'';

async function companyCosignerAllowed(prisma:PrismaClient,a:AuthContext,userId:string){
  const rows=await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(`
    SELECT EXISTS(
      SELECT 1 FROM "User" u
      WHERE u."organizationId"=$1 AND u."id"=$3 AND u."role"::text=ANY($4::text[])
        AND (
          EXISTS(SELECT 1 FROM "Employment" e WHERE e."organizationId"=u."organizationId" AND e."userId"=u."id" AND e."legalEntityId"=$2 AND e."status"<>'TERMINATED')
          OR EXISTS(
            SELECT 1 FROM "UserEntityAccessGrant" g
            LEFT JOIN "Department" d ON d."id"=g."departmentId"
            WHERE g."organizationId"=u."organizationId" AND g."userId"=u."id"
              AND g."active"=TRUE AND g."effectiveFrom"<=NOW() AND (g."effectiveTo" IS NULL OR g."effectiveTo">NOW())
              AND (g."scopeType"='ENTERPRISE' OR g."legalEntityId"=$2 OR d."legalEntityId"=$2 OR (g."scopeType"='CLIENT' AND EXISTS(SELECT 1 FROM "ClientEnrollment" ce WHERE ce."organizationId"=u."organizationId" AND ce."clientId"=g."clientId" AND ce."legalEntityId"=$2 AND ce."status" IN ('PENDING','ACTIVE','PAUSED')))
          )
        )
    ) AS allowed`,a.organizationId,selectedEntity(a),userId,[...cosignerRoles].map(String));
  return rows[0]?.allowed===true;
}

export const registerSpireNoteCosignerGuard=(app:express.Express,prisma:PrismaClient,deps:Deps)=>{const{authOf}=deps;
  app.get('/api/spire/workspaces/note-cosigners',async(_req,res,next)=>{try{
    const a=authOf(res),entity=selectedEntity(a);
    if(!clinicalAccessRoles.has(a.role)&&!owner(a))throw httpError(403,'SPIRE clinical access is required');
    const rows=await prisma.$queryRawUnsafe<Array<{id:string;email:string|null;role:string;record:unknown}>>(`
      SELECT u."id",u."email",u."role"::text AS "role",to_jsonb(u) AS record
      FROM "User" u
      WHERE u."organizationId"=$1 AND u."role"::text=ANY($3::text[])
        AND (
          EXISTS(SELECT 1 FROM "Employment" e WHERE e."organizationId"=u."organizationId" AND e."userId"=u."id" AND e."legalEntityId"=$2 AND e."status"<>'TERMINATED')
          OR EXISTS(
            SELECT 1 FROM "UserEntityAccessGrant" g
            LEFT JOIN "Department" d ON d."id"=g."departmentId"
            WHERE g."organizationId"=u."organizationId" AND g."userId"=u."id"
              AND g."active"=TRUE AND g."effectiveFrom"<=NOW() AND (g."effectiveTo" IS NULL OR g."effectiveTo">NOW())
              AND (g."scopeType"='ENTERPRISE' OR g."legalEntityId"=$2 OR d."legalEntityId"=$2 OR (g."scopeType"='CLIENT' AND EXISTS(SELECT 1 FROM "ClientEnrollment" ce WHERE ce."organizationId"=u."organizationId" AND ce."clientId"=g."clientId" AND ce."legalEntityId"=$2 AND ce."status" IN ('PENDING','ACTIVE','PAUSED')))
          )
        )
      ORDER BY LOWER(COALESCE(u."email",'')),u."id"`,a.organizationId,entity,[...cosignerRoles].map(String));
    res.json({data:rows.map(row=>{const r=asObject(row.record);return{id:row.id,email:row.email,role:row.role,displayName:clean(r.displayName)||clean(r.fullName)||clean(r.name)||[clean(r.firstName),clean(r.lastName)].filter(Boolean).join(' ')||row.email||row.id};})});
  }catch(e){next(e);}});

  app.post('/api/spire/patients/:patientId/notes/:noteId/sign',async(req,res,next)=>{try{
    const a=authOf(res),candidate=clean(req.body?.cosignerUserId);
    selectedEntity(a);
    if(!candidate)return next();
    if(!(await companyCosignerAllowed(prisma,a,candidate)))throw httpError(403,'The selected note cosigner must be an RN or Delegating Nurse with active access to this Sulandra company');
    next();
  }catch(e){next(e);}});

  app.post('/api/spire/patients/:patientId/notes/:noteId/cosign',async(_req,res,next)=>{try{
    const a=authOf(res);selectedEntity(a);
    if(!cosignerRoles.has(a.role))throw httpError(403,'Clinical note cosign requires an RN or Delegating Nurse role');
    next();
  }catch(e){next(e);}});
};
