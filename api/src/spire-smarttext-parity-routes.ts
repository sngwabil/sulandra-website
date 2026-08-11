import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  legalEntityId?: string;
};

type Deps = { authOf: (response: express.Response) => AuthContext };

const clinicalRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.AUDITOR,
  UserRole.DSP,
  UserRole.DELEGATING_NURSE,
  UserRole.LPN,
  UserRole.RN,
  UserRole.HOUSE_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);
const writeRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.DSP,
  UserRole.DELEGATING_NURSE,
  UserRole.LPN,
  UserRole.RN,
  UserRole.HOUSE_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);
const adminRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);

const text = (value: unknown, max = 100000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const ensureClinical = (auth: AuthContext) => {
  if (!clinicalRoles.has(auth.role)) {
    throw Object.assign(new Error('SPIRE clinical access is required'), { status: 403 });
  }
  if (!auth.legalEntityId) {
    throw Object.assign(new Error('Select a Sulandra company before using SPIRE'), { status: 409 });
  }
};
const ensureWrite = (auth: AuthContext) => {
  ensureClinical(auth);
  if (!writeRoles.has(auth.role)) {
    throw Object.assign(new Error('This SPIRE role is read-only'), { status: 403 });
  }
};
const isAdmin = (auth: AuthContext) =>
  adminRoles.has(auth.role) || String(auth.email || '').toLowerCase() === 'admin@sulandrahealth.com';

const normalizeName = (value: unknown) =>
  text(value, 80).replace(/[^A-Za-z0-9 _-]/g, '').trim().toUpperCase();

async function editable(
  prisma: PrismaClient,
  auth: AuthContext,
  smartTextId: string,
) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireSmartText"
      WHERE "organizationId"=$1 AND "id"=$2 AND "active"=TRUE
        AND ("ownerUserId"=$3 OR ($4::boolean=TRUE AND "ownerUserId" IS NULL))
      LIMIT 1`,
    auth.organizationId,
    smartTextId,
    auth.userId,
    isAdmin(auth),
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Editable SmartText was not found'), { status: 404 });
  }
  return rows[0];
}

export const registerSpireSmartTextParityRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  deps: Deps,
) => {
  const { authOf } = deps;

  app.get('/api/spire/tools/smarttexts', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id","name","body","ownerUserId","active","createdAt","updatedAt",
                ("ownerUserId"=$2) AS "ownedByCurrentUser",
                ("ownerUserId" IS NULL) AS "organizationWide"
           FROM "SpireSmartText"
          WHERE "organizationId"=$1 AND "active"=TRUE
            AND ("ownerUserId"=$2 OR "ownerUserId" IS NULL)
          ORDER BY "name"`,
        auth.organizationId,
        auth.userId,
      );
      res.json({ data: { items: rows, canCreateOrganizationWide: isAdmin(auth) } });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/spire/tools/smarttexts', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureWrite(auth);
      const name = normalizeName(req.body?.name);
      const body = text(req.body?.body, 100000);
      if (!name || !body) {
        throw Object.assign(new Error('SmartText name and body are required'), { status: 400 });
      }
      const organizationWide = req.body?.organizationWide === true && isAdmin(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireSmartText"("organizationId","ownerUserId","name","body")
         VALUES($1,$2,$3,$4) RETURNING *`,
        auth.organizationId,
        organizationWide ? null : auth.userId,
        name,
        body,
      );
      res.status(201).json({ data: rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/spire/tools/smarttexts/:smartTextId', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureWrite(auth);
      await editable(prisma, auth, req.params.smartTextId);
      const name = normalizeName(req.body?.name);
      const body = text(req.body?.body, 100000);
      if (!name || !body) {
        throw Object.assign(new Error('SmartText name and body are required'), { status: 400 });
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireSmartText"
            SET "name"=$1,"body"=$2,"updatedAt"=NOW()
          WHERE "organizationId"=$3 AND "id"=$4
          RETURNING *`,
        name,
        body,
        auth.organizationId,
        req.params.smartTextId,
      );
      res.json({ data: rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/spire/tools/smarttexts/:smartTextId', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureWrite(auth);
      await editable(prisma, auth, req.params.smartTextId);
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireSmartText" SET "active"=FALSE,"updatedAt"=NOW()
          WHERE "organizationId"=$1 AND "id"=$2`,
        auth.organizationId,
        req.params.smartTextId,
      );
      res.json({ data: { id: req.params.smartTextId, active: false } });
    } catch (error) {
      next(error);
    }
  });
};
