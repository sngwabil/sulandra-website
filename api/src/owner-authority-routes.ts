import type { Express, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (res: Response) => AuthContext;
};

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
const assignRoleSchema = z.object({ role: z.nativeEnum(UserRole) });

export function registerOwnerAuthorityRoutes({ app, prisma, authOf }: Dependencies) {
  let readyPromise: Promise<void> | null = null;
  const ensureReady = () => readyPromise ??= (async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE "EmployeePortalCredential" c
       SET "displayName" = $1, "updatedAt" = NOW()
       FROM "User" u
       WHERE c."userId" = u."id" AND LOWER(u."email") = LOWER($2)`,
      OWNER_NAME,
      OWNER_EMAIL,
    ).catch(() => undefined);

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION protect_sulandra_enterprise_owner()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND LOWER(OLD."email") = LOWER('${OWNER_EMAIL}') THEN
          RAISE EXCEPTION 'The enterprise owner account cannot be deleted';
        END IF;
        IF TG_OP = 'UPDATE' AND LOWER(OLD."email") = LOWER('${OWNER_EMAIL}') THEN
          IF NEW."email" IS DISTINCT FROM OLD."email" OR NEW."role" IS DISTINCT FROM OLD."role" OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
            RAISE EXCEPTION 'The enterprise owner identity, role, and organization cannot be modified';
          END IF;
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS protect_sulandra_enterprise_owner_trigger ON "User"`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER protect_sulandra_enterprise_owner_trigger
      BEFORE UPDATE OR DELETE ON "User"
      FOR EACH ROW EXECUTE FUNCTION protect_sulandra_enterprise_owner()
    `);
  })().catch((error) => {
    readyPromise = null;
    throw error;
  });

  const requireOwner = async (res: Response) => {
    await ensureReady();
    const auth = authOf(res);
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string }>>(
      `SELECT "email" FROM "User" WHERE "id" = $1 AND "organizationId" = $2 LIMIT 1`,
      auth.userId,
      auth.organizationId,
    );
    return { auth, isOwner: String(rows[0]?.email || '').toLowerCase() === OWNER_EMAIL };
  };

  app.get('/api/owner/authority', async (_req, res, next) => {
    try {
      const { auth, isOwner } = await requireOwner(res);
      if (!isOwner) return res.status(403).json({ error: 'Enterprise owner clearance required' });
      res.json({ data: { isOwner: true, displayName: OWNER_NAME, email: OWNER_EMAIL, clearance: 'ENTERPRISE_OWNER', organizationId: auth.organizationId } });
    } catch (error) { next(error); }
  });

  app.get('/api/owner/employees', async (_req, res, next) => {
    try {
      const { auth, isOwner } = await requireOwner(res);
      if (!isOwner) return res.status(403).json({ error: 'Enterprise owner clearance required' });
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT u."id", u."email", u."role"::text AS "role",
                COALESCE(NULLIF(c."displayName", ''), u."email") AS "displayName",
                CASE WHEN LOWER(u."email") = LOWER($2) THEN TRUE ELSE FALSE END AS "isOwner"
         FROM "User" u
         LEFT JOIN "EmployeePortalCredential" c ON c."userId" = u."id"
         WHERE u."organizationId" = $1
         ORDER BY CASE WHEN LOWER(u."email") = LOWER($2) THEN 0 ELSE 1 END, COALESCE(NULLIF(c."displayName", ''), u."email")`,
        auth.organizationId,
        OWNER_EMAIL,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.patch('/api/owner/employees/:id/role', async (req, res, next) => {
    try {
      const { auth, isOwner } = await requireOwner(res);
      if (!isOwner) return res.status(403).json({ error: 'Enterprise owner clearance required' });
      const input = assignRoleSchema.parse(req.body);
      const target = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
        `SELECT "id", "email" FROM "User" WHERE "id" = $1 AND "organizationId" = $2 LIMIT 1`,
        req.params.id,
        auth.organizationId,
      );
      if (!target[0]) return res.status(404).json({ error: 'Employee not found' });
      if (String(target[0].email).toLowerCase() === OWNER_EMAIL) {
        return res.status(409).json({ error: 'The enterprise owner account is immutable and cannot be managed by any user' });
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "User" SET "role" = $1::"UserRole" WHERE "id" = $2 AND "organizationId" = $3 RETURNING "id", "email", "role"::text AS "role"`,
        input.role,
        req.params.id,
        auth.organizationId,
      );
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });
}
