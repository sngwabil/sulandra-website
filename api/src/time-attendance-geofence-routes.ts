import type { Express, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext = { userId:string; organizationId:string; role:UserRole; email?:string };
type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
};

type ShiftRow = {
  id:string; employeeId:string|null; startTime:Date|string; endTime:Date|string;
  code:string; location:string; latitude:number|null; longitude:number|null; geofenceRadiusMeters:number;
};

const gpsSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0).max(10_000).optional().default(0),
  source: z.string().trim().max(40).optional().default('PORTAL_GPS'),
});
const manualSchema = z.object({
  punchType: z.enum(['CLOCK_IN','CLOCK_OUT']),
  requestedAt: z.coerce.date(),
  reason: z.string().trim().min(5).max(2000),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  accuracyMeters: z.number().finite().min(0).max(10_000).optional(),
  shiftId: z.string().trim().optional(),
});
const geofenceSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  geofenceRadiusMeters: z.number().int().min(50).max(5000).default(250),
  location: z.string().trim().min(2).max(200),
});

const distanceMeters=(aLat:number,aLng:number,bLat:number,bLng:number)=>{
  const r=6_371_000; const p=Math.PI/180;
  const dLat=(bLat-aLat)*p,dLng=(bLng-aLng)*p;
  const h=Math.sin(dLat/2)**2+Math.cos(aLat*p)*Math.cos(bLat*p)*Math.sin(dLng/2)**2;
  return 2*r*Math.asin(Math.sqrt(h));
};

const ensureSchema=async(prisma:PrismaClient)=>{
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceShift" ADD COLUMN IF NOT EXISTS "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 250`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "shiftId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInLatitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInLongitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInAccuracyMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockInDistanceMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutLatitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutLongitude" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutAccuracyMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "TimeAttendanceClockEntry" ADD COLUMN IF NOT EXISTS "clockOutDistanceMeters" DOUBLE PRECISION`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TimeAttendanceManualPunchRequest" (
    "id" TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"employeeId" TEXT NOT NULL,"shiftId" TEXT,
    "punchType" TEXT NOT NULL,"requestedAt" TIMESTAMPTZ NOT NULL,"reason" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,"longitude" DOUBLE PRECISION,"accuracyMeters" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',"reviewedById" TEXT,"reviewedAt" TIMESTAMPTZ,"reviewNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ManualPunch_org_status_idx" ON "TimeAttendanceManualPunchRequest"("organizationId","status")`);
};

export const registerTimeAttendanceGeofenceRoutes=({app,prisma,authOf,requireRoles}:Dependencies)=>{
  let schemaReady:Promise<void>|null=null;
  const ready=()=>schemaReady??=(ensureSchema(prisma).catch(e=>{schemaReady=null;throw e;}));
  const admin=requireRoles(UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.HR_MANAGER,UserRole.SCHEDULER,UserRole.CEO,UserRole.COO);
  const findShift=async(a:AuthContext,at:Date)=>{
    const rows=await prisma.$queryRawUnsafe<ShiftRow[]>(`SELECT "id","employeeId","startTime","endTime","code","location","latitude","longitude","geofenceRadiusMeters"
      FROM "TimeAttendanceShift" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status" IN ('PUBLISHED','DRAFT')
      AND "startTime" <= $3 + INTERVAL '60 minutes' AND "endTime" >= $3 - INTERVAL '120 minutes'
      ORDER BY ABS(EXTRACT(EPOCH FROM ("startTime"-$3))) LIMIT 1`,a.organizationId,a.userId,at);
    return rows[0]||null;
  };
  const validate=async(a:AuthContext,gps:z.infer<typeof gpsSchema>,at=new Date())=>{
    const shift=await findShift(a,at);
    if(!shift) return {allowed:false,code:'OUTSIDE_SCHEDULE',message:'You are not within an assigned shift window. Regular clocking is unavailable. Please submit an Add Clock In/Out request for administrator review.',shift:null};
    if(shift.latitude==null||shift.longitude==null) return {allowed:false,code:'LOCATION_NOT_CONFIGURED',message:'The GPS work location has not been configured for this shift. Please submit an Add Clock In/Out request for administrator review.',shift};
    const distance=Math.round(distanceMeters(gps.latitude,gps.longitude,Number(shift.latitude),Number(shift.longitude)));
    const radius=Math.max(50,Number(shift.geofenceRadiusMeters||250));
    const effectiveDistance=Math.max(0,distance-Number(gps.accuracyMeters||0));
    if(effectiveDistance>radius) return {allowed:false,code:'TOO_FAR',message:`You are approximately ${distance} meters from your assigned work area and cannot clock in or out here. Move closer to ${shift.location||'the assigned location'} or submit an Add Clock In/Out request for administrator review.`,distanceMeters:distance,radiusMeters:radius,shift};
    return {allowed:true,code:'ALLOWED',message:'Location and schedule verified.',distanceMeters:distance,radiusMeters:radius,shift};
  };

  app.post('/api/time-attendance/clock/validate',async(req,res,next)=>{try{await ready();const a=authOf(res);const gps=gpsSchema.parse(req.body);res.json({data:await validate(a,gps)})}catch(e){next(e)}});

  app.post('/api/time-attendance/clock/geofenced-in',async(req,res,next)=>{try{await ready();const a=authOf(res);const gps=gpsSchema.parse(req.body);const check=await validate(a,gps);if(!check.allowed)return res.status(403).json({error:check.message,code:check.code,data:check});const open=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockOut" IS NULL LIMIT 1`,a.organizationId,a.userId);if(open[0])return res.status(409).json({error:'You are already clocked in'});const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceClockEntry" ("id","organizationId","employeeId","shiftId","clockIn","source","clockInLatitude","clockInLongitude","clockInAccuracyMeters","clockInDistanceMeters") VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9)`,id,a.organizationId,a.userId,check.shift?.id||null,gps.source,gps.latitude,gps.longitude,gps.accuracyMeters,check.distanceMeters||0);res.status(201).json({data:{id,clockedIn:true,verification:check}})}catch(e){next(e)}});

  app.post('/api/time-attendance/clock/geofenced-out',async(req,res,next)=>{try{await ready();const a=authOf(res);const gps=gpsSchema.parse(req.body);const open=await prisma.$queryRawUnsafe<any[]>(`SELECT c.*,s."latitude" AS "shiftLatitude",s."longitude" AS "shiftLongitude",s."geofenceRadiusMeters",s."location" FROM "TimeAttendanceClockEntry" c LEFT JOIN "TimeAttendanceShift" s ON s."id"=c."shiftId" WHERE c."organizationId"=$1 AND c."employeeId"=$2 AND c."clockOut" IS NULL ORDER BY c."clockIn" DESC LIMIT 1`,a.organizationId,a.userId);if(!open[0])return res.status(409).json({error:'You are not clocked in'});const row=open[0];if(row.shiftLatitude==null||row.shiftLongitude==null)return res.status(403).json({error:'The assigned work location cannot be verified. Please submit an Add Clock Out request for administrator review.',code:'LOCATION_NOT_CONFIGURED'});const distance=Math.round(distanceMeters(gps.latitude,gps.longitude,Number(row.shiftLatitude),Number(row.shiftLongitude)));const radius=Math.max(50,Number(row.geofenceRadiusMeters||250));if(Math.max(0,distance-gps.accuracyMeters)>radius)return res.status(403).json({error:`You are approximately ${distance} meters from your assigned work area and cannot clock out here. Return to ${row.location||'the assigned location'} or submit an Add Clock Out request for administrator review.`,code:'TOO_FAR',data:{distanceMeters:distance,radiusMeters:radius}});const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE "TimeAttendanceClockEntry" SET "clockOut"=NOW(),"status"='COMPLETED',"clockOutLatitude"=$1,"clockOutLongitude"=$2,"clockOutAccuracyMeters"=$3,"clockOutDistanceMeters"=$4,"updatedAt"=NOW() WHERE "id"=$5 RETURNING *`,gps.latitude,gps.longitude,gps.accuracyMeters,distance,row.id);res.json({data:rows[0]})}catch(e){next(e)}});

  app.post('/api/time-attendance/manual-punch-requests',async(req,res,next)=>{try{await ready();const a=authOf(res);const input=manualSchema.parse(req.body);const id=randomUUID();await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceManualPunchRequest" ("id","organizationId","employeeId","shiftId","punchType","requestedAt","reason","latitude","longitude","accuracyMeters") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,id,a.organizationId,a.userId,input.shiftId||null,input.punchType,input.requestedAt,input.reason,input.latitude??null,input.longitude??null,input.accuracyMeters??null);res.status(201).json({data:{id,status:'PENDING'}})}catch(e){next(e)}});
  app.get('/api/time-attendance/manual-punch-requests',async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceManualPunchRequest" WHERE "organizationId"=$1 AND "employeeId"=$2 ORDER BY "createdAt" DESC`,a.organizationId,a.userId);res.json({data:rows})}catch(e){next(e)}});

  app.patch('/api/admin/time-attendance/shifts/:id/geofence',admin,async(req,res,next)=>{try{await ready();const a=authOf(res);const input=geofenceSchema.parse(req.body);const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE "TimeAttendanceShift" SET "latitude"=$1,"longitude"=$2,"geofenceRadiusMeters"=$3,"location"=$4,"updatedAt"=NOW() WHERE "id"=$5 AND "organizationId"=$6 RETURNING *`,input.latitude,input.longitude,input.geofenceRadiusMeters,input.location,req.params.id,a.organizationId);if(!rows[0])return res.status(404).json({error:'Shift not found'});res.json({data:rows[0]})}catch(e){next(e)}});
  app.get('/api/admin/time-attendance/manual-punch-requests',admin,async(_req,res,next)=>{try{await ready();const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT r.*,COALESCE(c."displayName",u."email",r."employeeId") AS "employeeName",s."code" AS "shiftCode",s."location" AS "shiftLocation" FROM "TimeAttendanceManualPunchRequest" r LEFT JOIN "User" u ON u."id"=r."employeeId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" LEFT JOIN "TimeAttendanceShift" s ON s."id"=r."shiftId" WHERE r."organizationId"=$1 ORDER BY CASE WHEN r."status"='PENDING' THEN 0 ELSE 1 END,r."createdAt" DESC LIMIT 500`,a.organizationId);res.json({data:rows})}catch(e){next(e)}});
  app.patch('/api/admin/time-attendance/manual-punch-requests/:id',admin,async(req,res,next)=>{try{await ready();const a=authOf(res);const status=z.enum(['APPROVED','DENIED']).parse(req.body?.status);const notes=z.string().trim().max(2000).optional().default('').parse(req.body?.reviewNotes);const requests=await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TimeAttendanceManualPunchRequest" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,req.params.id,a.organizationId);const item=requests[0];if(!item)return res.status(404).json({error:'Request not found'});if(item.status!=='PENDING')return res.status(409).json({error:'Request has already been reviewed'});if(status==='APPROVED'){
    if(item.punchType==='CLOCK_IN'){const open=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$1 AND "employeeId"=$2 AND "clockOut" IS NULL LIMIT 1`,a.organizationId,item.employeeId);if(open[0])return res.status(409).json({error:'Employee already has an open clock entry'});await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceClockEntry" ("id","organizationId","employeeId","shiftId","clockIn","source","status","notes") VALUES ($1,$2,$3,$4,$5,'ADMIN_APPROVED','OPEN',$6)`,randomUUID(),a.organizationId,item.employeeId,item.shiftId,item.requestedAt,`Approved manual punch: ${item.reason}`)}
    else {const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE "TimeAttendanceClockEntry" SET "clockOut"=$1,"status"='COMPLETED',"notes"=CONCAT("notes",$2),"updatedAt"=NOW() WHERE "id"=(SELECT "id" FROM "TimeAttendanceClockEntry" WHERE "organizationId"=$3 AND "employeeId"=$4 AND "clockOut" IS NULL ORDER BY "clockIn" DESC LIMIT 1) RETURNING "id"`,item.requestedAt,` | Approved manual clock out: ${item.reason}`,a.organizationId,item.employeeId);if(!rows[0])return res.status(409).json({error:'Employee has no open clock entry to close'})}
  }const rows=await prisma.$queryRawUnsafe<any[]>(`UPDATE "TimeAttendanceManualPunchRequest" SET "status"=$1,"reviewedById"=$2,"reviewedAt"=NOW(),"reviewNotes"=$3,"updatedAt"=NOW() WHERE "id"=$4 RETURNING *`,status,a.userId,notes,item.id);res.json({data:rows[0]})}catch(e){next(e)}});
};
