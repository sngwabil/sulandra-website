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

const text = (value: unknown, max = 120) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export const registerSpireSpeedButtonParityRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  deps: Deps,
) => {
  const { authOf } = deps;

  app.put('/api/spire/tools/smartphrases/speed-buttons', async (req, res, next) => {
    try {
      const auth = authOf(res);
      if (!auth.legalEntityId) {
        throw Object.assign(new Error('Select a Sulandra company before using SPIRE'), { status: 409 });
      }
      if (!writeRoles.has(auth.role)) {
        throw Object.assign(new Error('This SPIRE role is read-only'), { status: 403 });
      }

      const requested = Array.isArray(req.body?.smartPhraseIds)
        ? req.body.smartPhraseIds.map((value: unknown) => text(value)).filter(Boolean).slice(0, 12)
        : [];
      const uniqueRequested = [...new Set<string>(requested)];

      const available = uniqueRequested.length
        ? await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
          `SELECT phrase."id",phrase."name"
             FROM "SpireSmartPhrase" phrase
            WHERE phrase."organizationId"=$1
              AND phrase."active"=TRUE
              AND phrase."id"=ANY($2::text[])
              AND (
                phrase."ownerUserId"=$3
                OR phrase."sharedOrganizationWide"=TRUE
                OR EXISTS(
                  SELECT 1 FROM "SpireSmartPhraseShare" share_row
                   WHERE share_row."organizationId"=phrase."organizationId"
                     AND share_row."smartPhraseId"=phrase."id"
                     AND share_row."sharedWithUserId"=$3
                )
              )`,
          auth.organizationId,
          uniqueRequested,
          auth.userId,
        )
        : [];

      const phraseById = new Map(available.map((row) => [row.id, row]));
      if (uniqueRequested.some((id) => !phraseById.has(id))) {
        throw Object.assign(new Error('One or more SmartPhrases are not available to this user'), { status: 409 });
      }

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

      res.json({ data: { smartPhraseIds: uniqueRequested } });
    } catch (error) {
      next(error);
    }
  });
};
