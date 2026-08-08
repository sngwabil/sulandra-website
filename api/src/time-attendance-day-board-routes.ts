import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext={userId:string;organizationId:string;role:UserRole};
type Dependencies={app:Express;prisma:PrismaClient;authOf:(res:Response)=>AuthContext;requireRoles:(...roles:UserRole[])=>RequestHandler};

const GLOBAL_ROLES=new Set<string>(['ADMINISTRATOR','PROGRAM_MANAGER','HR_MANAGER','SCHEDULER','CEO','DOO']);
const VIEW_ROLES=[UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.HR_MANAGER,UserRole.SCHEDULER,UserRole.CEO,UserRole.DOO,UserRole.HOUSE_MANAGER,UserRole.AUDITOR] as const;

const parseDate=(value:unknown)=>{
  const raw=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const start=new Date(`${raw}T00:00:00`);
  if(Number.isNaN(start.getTime())) return null;
  const end=new Date(start); end.setDate(end.getDate()+1);
  return {raw,start,end};
};

const ensureColumns=async(prisma:PrismaClient)=>{
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "locationId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "shiftId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInLatitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInLongitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInAccuracyMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInDistanceMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutLatitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutLongitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutAccuracyMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutDistanceMeters" DOUBLE PRECISION`);
};

export const registerTimeAttendanceDayBoardRoutes=({app,prisma,authOf,requireRoles}:Dependencies)=>{
  let readyPromise:Promise<void>|null=null;
  const ready=()=>readyPromise??=ensureColumns(prisma).catch(error=>{readyPromise=null;throw error;});
  const gate=requireRoles(...VIEW_ROLES);

  app.get('/api/admin/time-attendance/day-board',gate,async(req,res,next)=>{try{
    await ready();
    const auth=authOf(res);
    const requested=parseDate(req.query.date) || parseDate(new Date().toISOString().slice(0,10));
    if(!requested) return res.status(400).json({error:'Date must use YYYY-MM-DD'});
    const global=GLOBAL_ROLES.has(String(auth.role));

    const locations=global
      ? await prisma.$queryRawUnsafe<any[]>(`SELECT l.* FROM "TimeAttendanceLocation" l WHERE l."organizationId"=$1 AND l."active"=TRUE ORDER BY CASE WHEN LOWER(l."name")='office' THEN 1 ELSE 0 END,l."name"`,auth.organizationId)
      : await prisma.$queryRawUnsafe<any[]>(`SELECT DISTINCT l.* FROM "TimeAttendanceLocation" l JOIN "TimeAttendanceLocationAssignment" a ON a."organizationId"=l."organizationId" AND a."locationId"=l."id" WHERE l."organizationId"=$1 AND l."active"=TRUE AND a."employeeId"=$2 AND a."active"=TRUE AND (a."isManager"=TRUE OR $3='AUDITOR') ORDER BY l."name"`,auth.organizationId,auth.userId,String(auth.role));
    const locationIds=locations.map(row=>String(row.id));

    const shifts=global
      ? await prisma.$queryRawUnsafe<any[]>(`SELECT s.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",'Open shift') AS "employeeName",u."email" AS "employeeEmail",u."role"::text AS "role",COALESCE(p."department",s."department",'') AS "employeeDepartment",COALESCE(l."name",NULLIF(s."location",''),'Unassigned location') AS "locationName",COALESCE(l."address",'') AS "locationAddress" FROM "TimeAttendanceShift" s LEFT JOIN "User" u ON u."id"=s."employeeId" AND u."organizationId"=s."organizationId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=s."organizationId" LEFT JOIN "TimeAttendanceLocation" l ON l."id"=s."locationId" AND l."organizationId"=s."organizationId" WHERE s."organizationId"=$1 AND s."startTime"<$3 AND s."endTime">$2 ORDER BY COALESCE(l."name",s."location"),s."startTime"`,auth.organizationId,requested.start,requested.end)
      : locationIds.length
        ? await prisma.$queryRawUnsafe<any[]>(`SELECT s.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",'Open shift') AS "employeeName",u."email" AS "employeeEmail",u."role"::text AS "role",COALESCE(p."department",s."department",'') AS "employeeDepartment",COALESCE(l."name",NULLIF(s."location",''),'Unassigned location') AS "locationName",COALESCE(l."address",'') AS "locationAddress" FROM "TimeAttendanceShift" s LEFT JOIN "User" u ON u."id"=s."employeeId" AND u."organizationId"=s."organizationId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=s."organizationId" LEFT JOIN "TimeAttendanceLocation" l ON l."id"=s."locationId" AND l."organizationId"=s."organizationId" WHERE s."organizationId"=$1 AND s."locationId"=ANY($2::text[]) AND s."startTime"<$4 AND s."endTime">$3 ORDER BY COALESCE(l."name",s."location"),s."startTime"`,auth.organizationId,locationIds,requested.start,requested.end)
        : [];

    const clockEntries=global
      ? await prisma.$queryRawUnsafe<any[]>(`SELECT e.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",e."employeeId") AS "employeeName",u."role"::text AS "role",COALESCE(p."department",'') AS "employeeDepartment",COALESCE(l."name",NULLIF(s."location",''),'Unassigned location') AS "locationName",COALESCE(l."address",'') AS "locationAddress" FROM "TimeAttendanceClockEntry" e LEFT JOIN "User" u ON u."id"=e."employeeId" AND u."organizationId"=e."organizationId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=e."organizationId" LEFT JOIN "TimeAttendanceShift" s ON s."id"=e."shiftId" AND s."organizationId"=e."organizationId" LEFT JOIN "TimeAttendanceLocation" l ON l."id"=s."locationId" AND l."organizationId"=e."organizationId" WHERE e."organizationId"=$1 AND e."clockIn"<$3 AND COALESCE(e."clockOut",NOW())>=$2 ORDER BY e."clockIn"`,auth.organizationId,requested.start,requested.end)
      : locationIds.length
        ? await prisma.$queryRawUnsafe<any[]>(`SELECT e.*,COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",e."employeeId") AS "employeeName",u."role"::text AS "role",COALESCE(p."department",'') AS "employeeDepartment",COALESCE(l."name",NULLIF(s."location",''),'Unassigned location') AS "locationName",COALESCE(l."address",'') AS "locationAddress" FROM "TimeAttendanceClockEntry" e JOIN "TimeAttendanceShift" s ON s."id"=e."shiftId" AND s."organizationId"=e."organizationId" LEFT JOIN "User" u ON u."id"=e."employeeId" AND u."organizationId"=e."organizationId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=e."organizationId" LEFT JOIN "TimeAttendanceLocation" l ON l."id"=s."locationId" AND l."organizationId"=e."organizationId" WHERE e."organizationId"=$1 AND s."locationId"=ANY($2::text[]) AND e."clockIn"<$4 AND COALESCE(e."clockOut",NOW())>=$3 ORDER BY e."clockIn"`,auth.organizationId,locationIds,requested.start,requested.end)
        : [];

    const clocksByShift=new Map<string,any>();
    const openByEmployee=new Map<string,any>();
    for(const entry of clockEntries){
      if(entry.shiftId) clocksByShift.set(String(entry.shiftId),entry);
      if(!entry.clockOut) openByEmployee.set(String(entry.employeeId),entry);
    }

    const now=Date.now();
    const rows=shifts.map(shift=>{
      const clock=clocksByShift.get(String(shift.id)) || (shift.employeeId?openByEmployee.get(String(shift.employeeId)):null) || null;
      const start=new Date(shift.startTime).getTime(),end=new Date(shift.endTime).getTime();
      const status=clock && !clock.clockOut ? 'CLOCKED_IN' : clock?.clockOut ? 'COMPLETED' : now<start ? 'UPCOMING' : now>end ? 'MISSED_OR_UNRECORDED' : 'SCHEDULED_NOW';
      return {...shift,clock,status};
    });

    const scheduledEmployeeIds=new Set(rows.map(row=>row.employeeId).filter(Boolean).map(String));
    const unscheduledClockedIn=clockEntries.filter(entry=>!entry.clockOut && !scheduledEmployeeIds.has(String(entry.employeeId))).map(entry=>({...entry,status:'CLOCKED_IN_UNSCHEDULED'}));
    const metrics={
      locations:locations.length,
      scheduledShifts:rows.length,
      clockedIn:clockEntries.filter(entry=>!entry.clockOut).length,
      upcoming:rows.filter(row=>row.status==='UPCOMING').length,
      completed:rows.filter(row=>row.status==='COMPLETED').length,
      exceptions:rows.filter(row=>row.status==='MISSED_OR_UNRECORDED').length+unscheduledClockedIn.length,
    };
    res.json({data:{date:requested.raw,locations,rows,unscheduledClockedIn,metrics,generatedAt:new Date().toISOString()}});
  }catch(error){next(error)}});
};
