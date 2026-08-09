import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  legalEntityId?: string;
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
  const selectedEntityId = (auth: AuthContext) => {
    if (!auth.legalEntityId) throw Object.assign(new Error('Company access context is required'), { status: 500 });
    return auth.legalEntityId;
  };

  const directoryRows = async (auth: AuthContext, leadershipOnly = false) => {
    const leadershipClause = leadershipOnly
      ? `AND u."role"::text IN ('CEO','COO','ADMINISTRATOR','HR_MANAGER','PROGRAM_MANAGER','HOUSE_MANAGER','DELEGATING_NURSE')`
      : '';
    const rows = await prisma.$queryRawUnsafe<Array<{
      id:string; email:string|null; role:string; displayName:string|null; jobTitle:string|null; department:string|null; employmentStatus:string|null;
    }>>(
      `WITH selected_employment AS (
         SELECT DISTINCT ON ("userId") * FROM "Employment"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2
         ORDER BY "userId",CASE WHEN "status"='TERMINATED' THEN 1 ELSE 0 END,"startsAt" DESC
       )
       SELECT u."id",u."email",u."role"::text AS "role",
        COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "displayName",
        COALESCE(employment."jobTitle",p."jobTitle") AS "jobTitle",COALESCE(department."name",p."department") AS "department",
        employment."status" AS "employmentStatus"
       FROM selected_employment employment
       JOIN "User" u ON u."organizationId"=employment."organizationId" AND u."id"=employment."userId"
       LEFT JOIN "Department" department
         ON department."organizationId"=employment."organizationId" AND department."legalEntityId"=employment."legalEntityId"
        AND department."id"=employment."departmentId"
       LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"
       WHERE employment."status" <> 'TERMINATED'
         ${leadershipClause}
       ORDER BY COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id")`,
      auth.organizationId,
      selectedEntityId(auth),
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
      const employees = await directoryRows(auth, false);
      await audit?.(auth, 'VIEW_EMPLOYEE_DIRECTORY', 'EmployeeDirectory', auth.organizationId, { legalEntityId: selectedEntityId(auth), count: employees.length });
      res.json({ data: { employees } });
    } catch (error) { next(error); }
  });

  app.get('/api/employee/leadership', employeeGate, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const leaders = await directoryRows(auth, true);
      await audit?.(auth, 'VIEW_EMPLOYEE_LEADERSHIP', 'EmployeeDirectory', auth.organizationId, { legalEntityId: selectedEntityId(auth), count: leaders.length });
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
          ("id","organizationId","legalEntityId","actorUserId","targetEmployeeId","action","resourceType","resourceId","capability","sensitivity","decision","reason","ipAddress","userAgent")
         VALUES ($1,$2,$3,$4,$4,'SELF_DOWNLOAD','EmployeeDocument',$5,'VIEW_DOCUMENTS',$6,'ALLOW','Employee downloaded an approved self-service document',$7,$8)`,
        randomUUID(),
        auth.organizationId,
        selectedEntityId(auth),
        auth.userId,
        document.id,
        document.sensitivity,
        auth.ipAddress || req.ip || null,
        auth.userAgent || req.get('user-agent') || null,
      ).catch(() => undefined);
      await audit?.(auth, 'EMPLOYEE_SELF_DOCUMENT_DOWNLOAD', 'EmployeeDocument', document.id, { legalEntityId: selectedEntityId(auth), sensitivity: document.sensitivity });
      res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Content-Disposition', `attachment; filename="${cleanFileName(document.fileName)}"`);
      res.send(buffer);
    } catch (error) { next(error); }
  });
}
