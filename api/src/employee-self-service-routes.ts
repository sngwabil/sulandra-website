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

export function registerEmployeeSelfServiceRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  const employeeGate = requireRoles(...allRoles);

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
         VALUES (gen_random_uuid()::text,$1,$2,$2,'SELF_DOWNLOAD','EmployeeDocument',$3,'VIEW_DOCUMENTS',$4,'ALLOW','Employee downloaded an approved self-service document',$5,$6)`,
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
