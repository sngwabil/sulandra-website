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

type EmployeeNumberRow = {
  userId: string;
  email: string | null;
  displayName: string | null;
  hireDate: Date | string | null;
  existingNumber: string | null;
};

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const employeeNumberPattern = /^SH(\d+)$/i;
const formatEmployeeNumber = (sequence: number) => `SH${String(sequence).padStart(3, '0')}`;

const sequenceOf = (value: unknown) => {
  const match = String(value ?? '').trim().match(employeeNumberPattern);
  if (!match) return null;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
};

export function registerEmployeeNumberRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  const manager = requireRoles(UserRole.ADMINISTRATOR, UserRole.HR_MANAGER, UserRole.CEO, UserRole.DOO);

  app.post('/api/admin/employee-numbers/reconcile', manager, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe<Array<{ lock: unknown }>>(
          'SELECT pg_advisory_xact_lock(hashtext($1)) AS lock',
          `sulandra-employee-number:${auth.organizationId}`,
        );

        const rows = await tx.$queryRawUnsafe<EmployeeNumberRow[]>(
          `SELECT u."id" AS "userId",u."email",
                  COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email") AS "displayName",
                  MIN(e."startsAt") AS "hireDate",
                  (ARRAY_AGG(NULLIF(e."employeeNumber",'') ORDER BY e."primaryEmployment" DESC,e."startsAt")
                    FILTER (WHERE NULLIF(e."employeeNumber",'') IS NOT NULL))[1] AS "existingNumber"
           FROM "User" u
           JOIN "Employment" e ON e."organizationId"=u."organizationId" AND e."userId"=u."id"
           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"
           LEFT JOIN "EmployeeManagementProfile" p ON p."organizationId"=u."organizationId" AND p."userId"=u."id"
           WHERE u."organizationId"=$1 AND lower(COALESCE(u."email",'')) NOT LIKE '%@demo.spire.local'
           GROUP BY u."id",u."email",c."displayName",p."displayName"
           ORDER BY CASE WHEN lower(COALESCE(u."email",''))=$2 THEN 0 ELSE 1 END,
                    MIN(e."startsAt") ASC,u."id" ASC`,
          auth.organizationId,
          OWNER_EMAIL,
        );

        const used = new Set<number>();
        const assignments = new Map<string, string>();
        const owner = rows.find((row) => String(row.email ?? '').trim().toLowerCase() === OWNER_EMAIL);
        if (owner) {
          assignments.set(owner.userId, 'SH001');
          used.add(1);
        }

        for (const row of rows) {
          if (assignments.has(row.userId)) continue;
          const sequence = sequenceOf(row.existingNumber);
          if (sequence && sequence !== 1 && !used.has(sequence)) {
            assignments.set(row.userId, formatEmployeeNumber(sequence));
            used.add(sequence);
          }
        }

        let nextSequence = 2;
        for (const row of rows) {
          if (assignments.has(row.userId)) continue;
          while (used.has(nextSequence)) nextSequence += 1;
          assignments.set(row.userId, formatEmployeeNumber(nextSequence));
          used.add(nextSequence);
          nextSequence += 1;
        }

        let changed = 0;
        for (const row of rows) {
          const employeeNumber = assignments.get(row.userId);
          if (!employeeNumber) continue;
          if (String(row.existingNumber ?? '').trim().toUpperCase() !== employeeNumber) changed += 1;
          await tx.$executeRawUnsafe(
            `UPDATE "Employment" SET "employeeNumber"=$1,"updatedAt"=NOW()
             WHERE "organizationId"=$2 AND "userId"=$3 AND COALESCE("employeeNumber",'')<>$1`,
            employeeNumber,
            auth.organizationId,
            row.userId,
          );
          await tx.$executeRawUnsafe(
            `UPDATE "EmployeeManagementProfile" SET "employeeNumber"=$1,"updatedAt"=NOW()
             WHERE "organizationId"=$2 AND "userId"=$3 AND COALESCE("employeeNumber",'')<>$1`,
            employeeNumber,
            auth.organizationId,
            row.userId,
          );
        }

        return {
          changed,
          assignments: rows.map((row) => ({
            userId: row.userId,
            displayName: row.displayName,
            employeeNumber: assignments.get(row.userId) ?? null,
            hireDate: row.hireDate,
          })),
        };
      });

      if (audit && result.changed > 0) {
        await audit(auth, 'EMPLOYEE_NUMBERS_RECONCILED', 'Employee', auth.organizationId, {
          changed: result.changed,
          format: 'SH###',
          assignmentCount: result.assignments.length,
        });
      }

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });
}
