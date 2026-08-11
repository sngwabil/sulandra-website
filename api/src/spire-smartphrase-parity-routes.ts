import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
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

const selectedEntity = (auth: AuthContext) => {
  const entity = text(auth.legalEntityId, 120);
  if (!entity) {
    throw Object.assign(new Error('Select a Sulandra company before using SPIRE'), { status: 409 });
  }
  return entity;
};

const ensureClinical = (auth: AuthContext) => {
  if (!clinicalRoles.has(auth.role)) {
    throw Object.assign(new Error('SPIRE clinical access is required'), { status: 403 });
  }
  selectedEntity(auth);
};

const ensureWrite = (auth: AuthContext) => {
  ensureClinical(auth);
  if (!writeRoles.has(auth.role)) {
    throw Object.assign(new Error('This SPIRE role is read-only'), { status: 403 });
  }
};

const isAdmin = (auth: AuthContext) =>
  adminRoles.has(auth.role)
  || String(auth.email || '').toLowerCase() === 'admin@sulandrahealth.com';

const normalizePhraseName = (value: unknown) =>
  text(value, 80)
    .replace(/^\.+/, '')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .toUpperCase();

async function auditTool(
  prisma: PrismaClient,
  auth: AuthContext,
  action: string,
  resourceType: string,
  resourceId: string,
  afterValue: unknown,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"
      ("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent")
     VALUES(gen_random_uuid()::text,$1,$2,$3,$4,NULL,$5,$6,$7,$8::jsonb,$9,$10)`,
    auth.organizationId,
    selectedEntity(auth),
    auth.userId,
    auth.email ?? null,
    action,
    resourceType,
    resourceId,
    JSON.stringify(afterValue ?? {}),
    auth.ipAddress ?? null,
    auth.userAgent ?? null,
  ).catch(() => undefined);
}

async function phraseForManagement(
  prisma: PrismaClient,
  auth: AuthContext,
  phraseId: string,
) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT phrase.*
       FROM "SpireSmartPhrase" phrase
      WHERE phrase."organizationId"=$1
        AND phrase."id"=$2
        AND phrase."active"=TRUE
        AND (phrase."ownerUserId"=$3 OR $4::boolean=TRUE)
      LIMIT 1`,
    auth.organizationId,
    phraseId,
    auth.userId,
    isAdmin(auth),
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Editable SmartPhrase was not found'), { status: 404 });
  }
  return rows[0];
}

async function accessiblePhraseIds(
  prisma: PrismaClient,
  auth: AuthContext,
  phraseIds: string[],
) {
  if (!phraseIds.length) return [];
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT phrase."id"
       FROM "SpireSmartPhrase" phrase
      WHERE phrase."organizationId"=$1
        AND phrase."active"=TRUE
        AND phrase."id"=ANY($2::text[])
        AND (
          phrase."ownerUserId"=$3
          OR phrase."sharedOrganizationWide"=TRUE
          OR EXISTS(
            SELECT 1
              FROM "SpireSmartPhraseShare" share_row
             WHERE share_row."organizationId"=phrase."organizationId"
               AND share_row."smartPhraseId"=phrase."id"
               AND share_row."sharedWithUserId"=$3
          )
        )`,
    auth.organizationId,
    phraseIds,
    auth.userId,
  );
  return rows.map((row) => row.id);
}

export const registerSpireSmartPhraseParityRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  deps: Deps,
) => {
  const { authOf } = deps;

  app.get('/api/spire/tools/smartphrases/manage', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const [phrases, speedButtons] = await Promise.all([
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT phrase."id",phrase."name",phrase."description",phrase."body",phrase."ownerUserId",
                  phrase."sharedOrganizationWide",phrase."createdAt",phrase."updatedAt",
                  (phrase."ownerUserId"=$2) AS "ownedByCurrentUser",
                  COALESCE((
                    SELECT jsonb_agg(
                      jsonb_build_object(
                        'userId',share_row."sharedWithUserId",
                        'email',target_user."email",
                        'role',target_user."role"::text
                      )
                      ORDER BY target_user."email"
                    )
                    FROM "SpireSmartPhraseShare" share_row
                    LEFT JOIN "User" target_user
                      ON target_user."organizationId"=share_row."organizationId"
                     AND target_user."id"=share_row."sharedWithUserId"
                    WHERE share_row."organizationId"=phrase."organizationId"
                      AND share_row."smartPhraseId"=phrase."id"
                  ),'[]'::jsonb) AS shares
             FROM "SpireSmartPhrase" phrase
            WHERE phrase."organizationId"=$1
              AND phrase."active"=TRUE
              AND (
                phrase."ownerUserId"=$2
                OR phrase."sharedOrganizationWide"=TRUE
                OR EXISTS(
                  SELECT 1 FROM "SpireSmartPhraseShare" share_row
                   WHERE share_row."organizationId"=phrase."organizationId"
                     AND share_row."smartPhraseId"=phrase."id"
                     AND share_row."sharedWithUserId"=$2
                )
              )
            ORDER BY phrase."name"`,
          auth.organizationId,
          auth.userId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT button."id",button."workspace",button."label",button."smartPhraseId",button."sortOrder",
                  phrase."name",phrase."description"
             FROM "SpireSpeedButton" button
             LEFT JOIN "SpireSmartPhrase" phrase ON phrase."id"=button."smartPhraseId"
            WHERE button."organizationId"=$1
              AND button."userId"=$2
              AND button."workspace"='PROGRESS_NOTE'
            ORDER BY button."sortOrder",button."createdAt"`,
          auth.organizationId,
          auth.userId,
        ),
      ]);
      res.json({ data: { phrases, speedButtons, canShareOrganizationWide: isAdmin(auth) } });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/spire/tools/smartphrases/share-targets', async (_req, res, next) => {
    try {
      const auth = authOf(res);
      ensureClinical(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT user_row."id" AS "userId",user_row."email",user_row."role"::text AS role,
                employment."jobTitle",employment."departmentId"
           FROM "Employment" employment
           JOIN "User" user_row
             ON user_row."organizationId"=employment."organizationId"
            AND user_row."id"=employment."userId"
          WHERE employment."organizationId"=$1
            AND employment."legalEntityId"=$2
            AND employment."status" IN ('ACTIVE','LEAVE')
            AND employment."startsAt"<=CURRENT_DATE
            AND (employment."endsAt" IS NULL OR employment."endsAt">=CURRENT_DATE)
            AND employment."userId"<>$3
          ORDER BY COALESCE(employment."jobTitle",''),user_row."email"`,
        auth.organizationId,
        selectedEntity(auth),
        auth.userId,
      );
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/spire/tools/smartphrases/:smartPhraseId', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureWrite(auth);
      const phraseId = req.params.smartPhraseId;
      await phraseForManagement(prisma, auth, phraseId);
      const name = normalizePhraseName(req.body?.name);
      const body = text(req.body?.body, 100000);
      if (!name || !body) {
        throw Object.assign(new Error('SmartPhrase name and body are required'), { status: 400 });
      }
      const sharedOrganizationWide = req.body?.sharedOrganizationWide === true && isAdmin(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireSmartPhrase"
            SET "name"=$1,"description"=$2,"body"=$3,"sharedOrganizationWide"=$4,"updatedAt"=NOW()
          WHERE "organizationId"=$5 AND "id"=$6
          RETURNING *`,
        name,
        text(req.body?.description, 500) || null,
        body,
        sharedOrganizationWide,
        auth.organizationId,
        phraseId,
      );
      await auditTool(prisma, auth, 'UPDATE_SMARTPHRASE', 'SMARTPHRASE', phraseId, {
        name,
        sharedOrganizationWide,
      });
      res.json({ data: rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/spire/tools/smartphrases/:smartPhraseId', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureWrite(auth);
      const phraseId = req.params.smartPhraseId;
      await phraseForManagement(prisma, auth, phraseId);
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM "SpireSpeedButton"
            WHERE "organizationId"=$1 AND "smartPhraseId"=$2`,
          auth.organizationId,
          phraseId,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "SpireSmartPhrase" SET "active"=FALSE,"updatedAt"=NOW()
            WHERE "organizationId"=$1 AND "id"=$2`,
          auth.organizationId,
          phraseId,
        );
      });
      await auditTool(prisma, auth, 'DEACTIVATE_SMARTPHRASE', 'SMARTPHRASE', phraseId, {});
      res.json({ data: { id: phraseId, active: false } });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/spire/tools/smartphrases/:smartPhraseId/share', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureWrite(auth);
      const phraseId = req.params.smartPhraseId;
      await phraseForManagement(prisma, auth, phraseId);
      const sharedWithUserId = text(req.body?.sharedWithUserId, 120);
      if (!sharedWithUserId || sharedWithUserId === auth.userId) {
        throw Object.assign(new Error('Choose another active employee to share this SmartPhrase with'), { status: 400 });
      }
      const targets = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT employment."userId" AS id
           FROM "Employment" employment
          WHERE employment."organizationId"=$1
            AND employment."legalEntityId"=$2
            AND employment."userId"=$3
            AND employment."status" IN ('ACTIVE','LEAVE')
            AND employment."startsAt"<=CURRENT_DATE
            AND (employment."endsAt" IS NULL OR employment."endsAt">=CURRENT_DATE)
          LIMIT 1`,
        auth.organizationId,
        selectedEntity(auth),
        sharedWithUserId,
      );
      if (!targets[0]) {
        throw Object.assign(new Error('The selected employee is not active in this company'), { status: 409 });
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireSmartPhraseShare"("organizationId","smartPhraseId","sharedWithUserId")
         VALUES($1,$2,$3)
         ON CONFLICT ("smartPhraseId","sharedWithUserId") DO NOTHING`,
        auth.organizationId,
        phraseId,
        sharedWithUserId,
      );
      await auditTool(prisma, auth, 'SHARE_SMARTPHRASE', 'SMARTPHRASE', phraseId, { sharedWithUserId });
      res.status(201).json({ data: { smartPhraseId: phraseId, sharedWithUserId } });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/spire/tools/smartphrases/:smartPhraseId/share/:userId', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureWrite(auth);
      const phraseId = req.params.smartPhraseId;
      await phraseForManagement(prisma, auth, phraseId);
      await prisma.$executeRawUnsafe(
        `DELETE FROM "SpireSmartPhraseShare"
          WHERE "organizationId"=$1 AND "smartPhraseId"=$2 AND "sharedWithUserId"=$3`,
        auth.organizationId,
        phraseId,
        req.params.userId,
      );
      await auditTool(prisma, auth, 'UNSHARE_SMARTPHRASE', 'SMARTPHRASE', phraseId, {
        sharedWithUserId: req.params.userId,
      });
      res.json({ data: { smartPhraseId: phraseId, sharedWithUserId: req.params.userId, shared: false } });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/spire/tools/smartphrases/speed-buttons', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureWrite(auth);
      const requested = Array.isArray(req.body?.smartPhraseIds)
        ? req.body.smartPhraseIds.map((value: unknown) => text(value, 120)).filter(Boolean).slice(0, 12)
        : [];
      const uniqueRequested = [...new Set<string>(requested)];
      const allowed = await accessiblePhraseIds(prisma, auth, uniqueRequested);
      const allowedSet = new Set(allowed);
      if (uniqueRequested.some((id) => !allowedSet.has(id))) {
        throw Object.assign(new Error('One or more SmartPhrases are not available to this user'), { status: 409 });
      }

      const phraseRows = uniqueRequested.length
        ? await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
          `SELECT "id","name" FROM "SpireSmartPhrase"
            WHERE "organizationId"=$1 AND "id"=ANY($2::text[])`,
          auth.organizationId,
          uniqueRequested,
        )
        : [];
      const phraseById = new Map(phraseRows.map((row) => [row.id, row]));

      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM "SpireSpeedButton"
            WHERE "organizationId"=$1 AND "userId"=$2 AND "workspace"='PROGRESS_NOTE'`,
          auth.organizationId,
          auth.userId,
        );
        for (let index = 0; index < uniqueRequested.length; index += 1) {
          const phraseId = uniqueRequested[index];
          const phrase = phraseById.get(phraseId);
          if (!phrase) continue;
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireSpeedButton"
              ("organizationId","userId","workspace","label","smartPhraseId","sortOrder")
             VALUES($1,$2,'PROGRESS_NOTE',$3,$4,$5)`,
            auth.organizationId,
            auth.userId,
            phrase.name,
            phraseId,
            index,
          );
        }
      });
      await auditTool(prisma, auth, 'UPDATE_NOTE_SPEED_BUTTONS', 'SMARTPHRASE_SPEED_BUTTONS', auth.userId, {
        smartPhraseIds: uniqueRequested,
      });
      res.json({ data: { smartPhraseIds: uniqueRequested } });
    } catch (error) {
      next(error);
    }
  });
};
