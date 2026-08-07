import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
};

type AuditFn = (
  auth: Partial<AuthContext>,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: object,
) => Promise<void>;

type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
  audit?: AuditFn;
};

const allRoles = Object.values(UserRole) as UserRole[];
const cleanFileName = (value: string) => value.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'employee-document';
const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';

export function registerEmployeeSelfServiceRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  const employeeGate = requireRoles(...allRoles);

  const directoryRows = async (organizationId: string, leadershipOnly = false) => {
    const leadershipClause = leadershipOnly
      ? `AND u."role"::text IN ('CEO','COO','ADMINISTRATOR','HR_MANAGER','PROGRAM_MANAGER','HOUSE_MANAGER','DELEGATING_NURSE')`
      : '';
    const rows = await prisma.$queryRawUnsafe<Array<{
      id:string; email:string|null; role:string; displayName:string|null; jobTitle:string|null; department:string|null; employmentStatus:string|null;
    }>>(
      `SELECT u."id",u."email",u."role"::text AS "role",
        COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "displayName",
        p."jobTitle",p."department",COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus"
       FROM "User" u
       LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
       WHERE u."organizationId"=$1
         AND COALESCE(p."employmentStatus",'ACTIVE') <> 'TERMINATED'
         ${leadershipClause}
       ORDER BY COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id")`,
      organizationId,
    );
    return rows.map((row) => ({
      id: row.id,
      displayName: String(row.email || '').trim().toLowerCase() === OWNER_EMAIL ? OWNER_NAME : row.displayName,
      workEmail: row.email,
      role: row.role,
      jobTitle: row.jobTitle,
      department: row.department,
      employmentStatus: row.employmentStatus,
    }));
  };

  app.get('/api/employee/directory', employeeGate, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const employees = await directoryRows(auth.organizationId, false);
      await audit?.(auth, 'VIEW_EMPLOYEE_DIRECTORY', 'EmployeeDirectory', auth.organizationId, { count: employees.length });
      res.json({ data: { employees } });
    } catch (error) { next(error); }
  });

  app.get('/api/employee/leadership', employeeGate, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const leaders = await directoryRows(auth.organizationId, true);
      await audit?.(auth, 'VIEW_EMPLOYEE_LEADERSHIP', 'EmployeeDirectory', auth.organizationId, { count: leaders.length });
      res.json({ data: { leaders } });
    } catch (error) { next(error); }
  });

  app.get('/api/employee/me/documents/:documentId/download', employeeGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<Array<{
        id: string;
        fileName: string;
        mimeType: string;
        contentBase64: string;
        sensitivity: string;
      }>>(
        `SELECT "id","fileName","mimeType","contentBase64",COALESCE("sensitivity",'GENERAL') AS "sensitivity"
         FROM "EmployeeDocument"
         WHERE "id"=$1 AND "organizationId"=$2 AND "employeeId"=$3
           AND "status"<>'ARCHIVED' AND COALESCE("employeeVisible",FALSE)=TRUE
         LIMIT 1`,
        req.params.documentId,
        auth.organizationId,
        auth.userId,
      );
      const document = rows[0];
      if (!document) return void res.status(404).json({ error: 'The approved employee document was not found' });
      const buffer = Buffer.from(document.contentBase64, 'base64');
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Employee360AccessEvent"
          ("id","organizationId","actorUserId","targetEmployeeId","action","resourceType","resourceId","capability","sensitivity","decision","reason","ipAddress","userAgent")
         VALUES ($1,$2,$3,$3,'SELF_DOWNLOAD','EmployeeDocument',$4,'VIEW_DOCUMENTS',$5,'ALLOW','Employee downloaded an approved self-service document',$6,$7)`,
        randomUUID(),
        auth.organizationId,
        auth.userId,
        document.id,
        document.sensitivity,
        auth.ipAddress || req.ip || null,
        auth.userAgent || req.get('user-agent') || null,
      ).catch(() => undefined);
      await audit?.(auth, 'EMPLOYEE_SELF_DOCUMENT_DOWNLOAD', 'EmployeeDocument', document.id, { sensitivity: document.sensitivity });
      res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFileName(document.fileName)}"`);
      res.send(buffer);
    } catch (error) { next(error); }
  });
}
