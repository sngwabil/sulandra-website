import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string};
type Dependencies={app:Express;prisma:PrismaClient;authOf:(response:Response)=>AuthContext};
const OWNER_EMAIL='admin@sulandrahealth.com';
const globalRoles=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.HR_MANAGER,UserRole.CEO,UserRole.COO,UserRole.AUDITOR]);
const locationRoles=new Set<UserRole>([UserRole.PROGRAM_MANAGER,UserRole.HOUSE_MANAGER,UserRole.SCHEDULER,UserRole.DELEGATING_NURSE]);
const deniedPathByRole:Partial<Record<UserRole,RegExp[]>>={
  [UserRole.SCHEDULER]:[/compensation/i,/payroll/i,/benefit/i,/document/i,/performance/i,/disciplin/i,/medical/i,/health-safety/i,/account/i,/security/i,/audit/i],
  [UserRole.HOUSE_MANAGER]:[/compensation/i,/payroll/i,/benefit/i,/account-security/i,/secure-files/i,/audit-ledger/i],
  [UserRole.PROGRAM_MANAGER]:[/compensation/i,/payroll/i,/benefit/i,/account-security/i,/secure-files/i],
  [UserRole.DELEGATING_NURSE]:[/compensation/i,/payroll/i,/benefit/i,/performance/i,/disciplin/i,/account/i,/security/i,/audit/i,/bulk/i],
};
const employeeRoute=/^\/api\/admin\/(?:employees?(?:\/|$)|employee[-360a-z0-9_/]*|employee360(?:\/|$))/i;
const normalize=(v:unknown)=>String(v??'').trim().toLowerCase();

function targetEmployeeId(req:any){return String(req.params?.employeeId||req.params?.userId||req.body?.employeeId||req.query?.employeeId||'').trim()||null}
function looksLikeEmployee(row:any){return row&&typeof row==='object'&&!Array.isArray(row)&&(('employeeId'in row)||('userId'in row)||(('id'in row)&&(('email'in row)||('role'in row)||('jobTitle'in row)||('displayName'in row))))}
function employeeIdOf(row:any){return String(row?.employeeId||row?.userId||row?.id||'')}
function filterPayload(value:any,allowed:Set<string>,depth=0):any{
  if(depth>8||value==null)return value;
  if(Array.isArray(value))return value.filter(item=>!looksLikeEmployee(item)||allowed.has(employeeIdOf(item))).map(item=>filterPayload(item,allowed,depth+1));
  if(typeof value==='object'){const output:any={};for(const[key,item]of Object.entries(value))output[key]=filterPayload(item,allowed,depth+1);return output}
  return value;
}

export function registerEmployee360ScopeEnforcement({app,prisma,authOf}:Dependencies){
  const middleware:RequestHandler=async(req,res,next)=>{
    try{
      if(!employeeRoute.test(req.path)||req.path.startsWith('/api/admin/employee360/access'))return next();
      const auth=authOf(res);if(!auth)return void res.status(401).json({error:'Authentication required'});
      const actor=(await prisma.$queryRawUnsafe<Array<{email:string|null}>>(`SELECT "email" FROM "User" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,auth.organizationId,auth.userId))[0];
      if(normalize(actor?.email||auth.email)===OWNER_EMAIL)return next();
      if(auth.role===UserRole.AUDITOR&&req.method!=='GET')return void res.status(403).json({error:'Auditor access is read only'});
      if(globalRoles.has(auth.role))return next();
      if(!locationRoles.has(auth.role))return void res.status(403).json({error:'Employee 360 access is not assigned to this role'});
      if((deniedPathByRole[auth.role]||[]).some(pattern=>pattern.test(req.path)))return void res.status(403).json({error:'This Employee 360 area is outside your assigned role'});
      const locations=await prisma.$queryRawUnsafe<Array<{locationId:string}>>(`SELECT DISTINCT "locationId" FROM "EmployeeWorkAssignment" WHERE "organizationId"=$1 AND "employeeId"=$2 AND ("startsAt" IS NULL OR "startsAt"<=NOW()) AND ("endsAt" IS NULL OR "endsAt">NOW())`,auth.organizationId,auth.userId).catch(()=>[]);
      const locationIds=locations.map(row=>row.locationId).filter(Boolean);
      const employees=locationIds.length?await prisma.$queryRawUnsafe<Array<{employeeId:string}>>(`SELECT DISTINCT "employeeId" FROM "EmployeeWorkAssignment" WHERE "organizationId"=$1 AND "locationId"=ANY($2::text[]) AND ("startsAt" IS NULL OR "startsAt"<=NOW()) AND ("endsAt" IS NULL OR "endsAt">NOW())`,auth.organizationId,locationIds).catch(()=>[]):[];
      const allowed=new Set<string>([auth.userId,...employees.map(row=>row.employeeId)]);
      const target=targetEmployeeId(req);if(target&&!allowed.has(target))return void res.status(403).json({error:'This employee is outside your assigned service homes or programs'});
      const originalJson=res.json.bind(res);res.json=((body:any)=>originalJson(filterPayload(body,allowed))) as typeof res.json;
      res.locals.employee360Scope={type:'LOCATION',locationIds,employeeIds:[...allowed]};
      next();
    }catch(error){next(error)}
  };
  app.use(middleware);
}
