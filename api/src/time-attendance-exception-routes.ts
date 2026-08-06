import type { Express, RequestHandler, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext={userId:string;organizationId:string;role:UserRole;email?:string};
type Dependencies={app:Express;prisma:PrismaClient;authOf:(response:Response)=>AuthContext;requireRoles:(...roles:UserRole[])=>RequestHandler};

const blockedSchema=z.object({
  punchType:z.enum(['CLOCK_IN','CLOCK_OUT']),
  reason:z.string().trim().min(2).max(2000),
  code:z.string().trim().max(80).optional().default('BLOCKED'),
  latitude:z.number().finite().min(-90).max(90).optional(),
  longitude:z.number().finite().min(-180).max(180).optional(),
  accuracyMeters:z.number().finite().min(0).max(10000).optional(),
  shiftId:z.string().trim().optional(),
});

export const registerTimeAttendanceExceptionRoutes=({app,prisma,authOf,requireRoles}:Dependencies)=>{
  const admin=requireRoles(UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.HR_MANAGER,UserRole.SCHEDULER,UserRole.CEO,UserRole.COO);
  app.post('/api/time-attendance/clock/blocked-attempt',async(req,res,next)=>{try{
    const a=authOf(res);const input=blockedSchema.parse(req.body);const id=randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "TimeAttendanceManualPunchRequest" ("id","organizationId","employeeId","shiftId","punchType","requestedAt","reason","latitude","longitude","accuracyMeters","status","reviewNotes") VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9,'PENDING',$10)`,id,a.organizationId,a.userId,input.shiftId||null,input.punchType,`Automatic blocked attempt [${input.code}]: ${input.reason}`,input.latitude??null,input.longitude??null,input.accuracyMeters??null,'Employee was prevented from using regular clocking. Review the exception and instruct the employee to submit an exact Add Clock request if needed.');
    res.status(201).json({data:{id,status:'PENDING'}});
  }catch(e){next(e)}});
  app.get('/api/admin/time-attendance/blocked-attempts',admin,async(_req,res,next)=>{try{
    const a=authOf(res);const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT r.*,COALESCE(c."displayName",u."email",r."employeeId") AS "employeeName" FROM "TimeAttendanceManualPunchRequest" r LEFT JOIN "User" u ON u."id"=r."employeeId" LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id" WHERE r."organizationId"=$1 AND r."reason" LIKE 'Automatic blocked attempt%' ORDER BY r."createdAt" DESC LIMIT 500`,a.organizationId);res.json({data:rows});
  }catch(e){next(e)}});
};
