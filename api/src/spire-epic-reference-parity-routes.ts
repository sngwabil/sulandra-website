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

const text = (value: unknown, max = 5000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const ensureClinical = (auth: AuthContext) => {
  if (!clinicalRoles.has(auth.role)) {
    throw Object.assign(new Error('SPIRE clinical access is required'), { status: 403 });
  }
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

const selectedEntity = (auth: AuthContext) => {
  const value = text(auth.legalEntityId, 120);
  if (!value) {
    throw Object.assign(new Error('Select a Sulandra company before using SPIRE'), { status: 409 });
  }
  return value;
};

async function enrollmentExists(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  const entityId = selectedEntity(auth);
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1
         FROM "ClientEnrollment" enrollment
        WHERE enrollment."organizationId"=$1
          AND enrollment."legalEntityId"=$2
          AND enrollment."clientId"=$3
          AND enrollment."status" IN ('PENDING','ACTIVE','PAUSED')
     ) AS allowed`,
    auth.organizationId,
    entityId,
    patientId,
  );
  return rows[0]?.allowed === true;
}

async function patientAllowed(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  if (!(await enrollmentExists(prisma, auth, patientId))) return false;
  if (isAdmin(auth) || auth.role === UserRole.AUDITOR) return true;
  const entityId = selectedEntity(auth);
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1
         FROM "SpireEmployeeClientAssignment" a
        WHERE a."organizationId"=$1 AND a."legalEntityId"=$2
          AND a."userId"=$3 AND a."clientId"=$4
       UNION ALL
       SELECT 1
         FROM "SpirePatientHomeAssignment" p
         JOIN "SpireEmployeeHomeAssignment" h
           ON h."organizationId"=p."organizationId"
          AND h."legalEntityId"=p."legalEntityId"
          AND h."homeId"=p."homeId"
        WHERE p."organizationId"=$1 AND p."legalEntityId"=$2
          AND h."userId"=$3 AND p."patientId"=$4
          AND (p."endsAt" IS NULL OR p."endsAt">NOW())
       UNION ALL
       SELECT 1
         FROM "UserEntityAccessGrant" grant_row
        WHERE grant_row."organizationId"=$1 AND grant_row."legalEntityId"=$2
          AND grant_row."userId"=$3 AND grant_row."scopeType"='CLIENT'
          AND grant_row."clientId"=$4 AND grant_row."active"=TRUE
          AND grant_row."effectiveFrom"<=NOW()
          AND (grant_row."effectiveTo" IS NULL OR grant_row."effectiveTo">NOW())
     ) AS allowed`,
    auth.organizationId,
    entityId,
    auth.userId,
    patientId,
  );
  return rows[0]?.allowed === true;
}

async function requirePatient(
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  write = false,
) {
  write ? ensureWrite(auth) : ensureClinical(auth);
  selectedEntity(auth);
  if (!(await patientAllowed(prisma, auth, patientId))) {
    throw Object.assign(new Error('This chart is outside your authorized clinical scope'), { status: 403 });
  }
}

async function logAccess(
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  action: string,
  resourceType: string,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireChartAccessEvent"
      ("organizationId","legalEntityId","patientId","actorUserId","actorEmail","action","resourceType","ipAddress","userAgent")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    auth.organizationId,
    selectedEntity(auth),
    patientId,
    auth.userId,
    auth.email ?? null,
    action,
    resourceType,
    auth.ipAddress ?? null,
    auth.userAgent ?? null,
  );
}

const referenceQueries: Record<string, string> = {
  ecg: `
    SELECT r."resultedAt" AS date,
           'ECG'::text AS type,
           r."testName" AS description,
           r."status" AS status,
           r."source" AS author,
           r."id"::text AS "resourceId"
      FROM "SpireResult" r
     WHERE r."organizationId"=$1 AND r."patientId"=$2
       AND (
         upper(COALESCE(r."category",'')) IN ('ECG','EKG','CARDIOLOGY')
         OR upper(COALESCE(r."testName",'')) LIKE '%ECG%'
         OR upper(COALESCE(r."testName",'')) LIKE '%EKG%'
       )`,
  referrals: `
    SELECT o."orderedAt" AS date,
           'Referral'::text AS type,
           o."name" AS description,
           o."status" AS status,
           o."orderedById" AS author,
           o."id"::text AS "resourceId"
      FROM "SpireOrder" o
     WHERE o."organizationId"=$1 AND o."patientId"=$2
       AND upper(COALESCE(o."orderType",''))='REFERRAL'`,
  procedures: `
    SELECT o."orderedAt" AS date,
           'Procedure'::text AS type,
           o."name" AS description,
           o."status" AS status,
           o."orderedById" AS author,
           o."id"::text AS "resourceId"
      FROM "SpireOrder" o
     WHERE o."organizationId"=$1 AND o."patientId"=$2
       AND upper(COALESCE(o."orderType",'')) IN ('PROCEDURE','SURGERY','THERAPY')`,
  episodes: `
    SELECT e."startsAt" AS date,
           'Episode'::text AS type,
           e."programId" AS description,
           e."status" AS status,
           NULL::text AS author,
           e."id"::text AS "resourceId"
      FROM "SpirePatientProgramEnrollment" e
     WHERE e."organizationId"=$1 AND e."patientId"=$2`,
  letters: `
    SELECT d."createdAt" AS date,
           'Letter'::text AS type,
           d."title" AS description,
           d."status" AS status,
           d."createdById" AS author,
           d."id"::text AS "resourceId"
      FROM "SpireClinicalDocument" d
     WHERE d."organizationId"=$1 AND d."patientId"=$2
       AND (
         upper(COALESCE(d."category",'')) IN ('LETTER','CORRESPONDENCE')
         OR upper(COALESCE(d."title",'')) LIKE '%LETTER%'
       )`,
};

const wrapUpContext = async (
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  encounterId = '',
) => {
  const legalEntityId = selectedEntity(auth);
  const encounters = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT e.*
       FROM "SpireEncounter" e
      WHERE e."organizationId"=$1
        AND e."legalEntityId"=$2
        AND e."patientId"=$3
        AND ($4='' OR e."id"=$4)
      ORDER BY
        CASE WHEN e."status"<>'SIGNED' THEN 0 ELSE 1 END,
        e."startedAt" DESC
      LIMIT 1`,
    auth.organizationId,
    legalEntityId,
    patientId,
    encounterId,
  );
  const encounter = encounters[0] ?? null;
  if (!encounter) {
    return {
      encounter: null,
      followUp: null,
      patientInstructions: [],
      avs: null,
      attendingCosignerUserId: null,
      modifiers: [],
      allowedModifiers: ['GC', 'GE', 'GT'],
    };
  }

  const id = String(encounter.id);
  const [followUps, instructions, summaries, participants] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT *
         FROM "SpireVisitFollowUp"
        WHERE "organizationId"=$1 AND "encounterId"=$2
        ORDER BY "requestedAt" DESC
        LIMIT 1`,
      auth.organizationId,
      id,
    ),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT *
         FROM "SpirePatientInstruction"
        WHERE "organizationId"=$1 AND "patientId"=$2 AND "encounterId"=$3
        ORDER BY "createdAt" DESC
        LIMIT 20`,
      auth.organizationId,
      patientId,
      id,
    ),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT *
         FROM "SpireAfterVisitSummary"
        WHERE "organizationId"=$1 AND "patientId"=$2 AND "encounterId"=$3
        ORDER BY "generatedAt" DESC
        LIMIT 1`,
      auth.organizationId,
      patientId,
      id,
    ),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT *
         FROM "SpireEncounterParticipant"
        WHERE "organizationId"=$1 AND "encounterId"=$2 AND "role"='ATTENDING_COSIGNER'
        ORDER BY "createdAt" DESC
        LIMIT 1`,
      auth.organizationId,
      id,
    ),
  ]);

  const summary = (summaries[0]?.summary && typeof summaries[0].summary === 'object')
    ? summaries[0].summary as Record<string, unknown>
    : {};
  const savedModifiers = Array.isArray(summary.modifiers)
    ? summary.modifiers.map((value) => String(value))
    : [];

  return {
    encounter,
    followUp: followUps[0] ?? null,
    patientInstructions: instructions,
    avs: summaries[0] ?? null,
    attendingCosignerUserId:
      participants[0]?.userId
      ?? (typeof summary.attendingCosignerUserId === 'string' ? summary.attendingCosignerUserId : null),
    modifiers: savedModifiers,
    allowedModifiers: ['GC', 'GE', 'GT'],
  };
};

export const registerSpireEpicReferenceParityRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  deps: Deps,
) => {
  const { authOf } = deps;

  app.get('/api/spire/patients/:patientId/reference-review/:category', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId);
      const category = text(req.params.category, 40).toLowerCase();
      const query = referenceQueries[category];
      if (!query) {
        throw Object.assign(new Error('Unsupported reference chart category'), { status: 400 });
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `${query} ORDER BY date DESC NULLS LAST LIMIT 750`,
        auth.organizationId,
        patientId,
      );
      await logAccess(prisma, auth, patientId, 'VIEW_REFERENCE_REVIEW', `REFERENCE:${category}`);
      res.json({ data: { category, items: rows } });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/spire/patients/:patientId/wrap-up-context', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId);
      const encounterId = text(req.query.encounterId, 120);
      const data = await wrapUpContext(prisma, auth, patientId, encounterId);
      await logAccess(prisma, auth, patientId, 'VIEW_WRAP_UP', 'WRAP_UP');
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/spire/patients/:patientId/wrap-up-reference', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId, true);
      const legalEntityId = selectedEntity(auth);
      const encounterId = text(req.body?.encounterId, 120);
      if (!encounterId) {
        throw Object.assign(new Error('Encounter is required'), { status: 400 });
      }

      const requestedModifiers: string[] = Array.isArray(req.body?.modifiers)
        ? req.body.modifiers.map((value: unknown) => text(value, 10).toUpperCase()).filter(Boolean)
        : [];
      const modifiers: string[] = [...new Set<string>(requestedModifiers)];
      const allowedModifiers = new Set<string>(['GC', 'GE', 'GT']);
      if (modifiers.some((value) => !allowedModifiers.has(value))) {
        throw Object.assign(new Error('Only GC, GE and GT modifiers are supported by this workflow'), { status: 400 });
      }

      const serviceLevel = text(req.body?.serviceLevel, 80);
      const followUpTimeframe = text(req.body?.followUpTimeframe, 250);
      const instructions = text(req.body?.instructions, 10000);
      const closeReason = text(req.body?.reason, 500) || 'Encounter signed from SPIRE Wrap-Up';
      const attendingCosignerUserId = text(req.body?.attendingCosignerUserId, 120);

      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.$queryRawUnsafe(
          `SELECT *
             FROM "SpireEncounter"
            WHERE "organizationId"=$1
              AND "legalEntityId"=$2
              AND "patientId"=$3
              AND "id"=$4
              AND "status"<>'SIGNED'
            FOR UPDATE`,
          auth.organizationId,
          legalEntityId,
          patientId,
          encounterId,
        ) as Array<Record<string, unknown>>;
        if (!current[0]) {
          throw Object.assign(new Error('Open encounter not found in the selected company'), { status: 404 });
        }

        await tx.$executeRawUnsafe(
          `UPDATE "SpireEncounter"
              SET "serviceLevel"=$1,
                  "status"='SIGNED',
                  "endedAt"=NOW(),
                  "signedAt"=NOW(),
                  "signedById"=$2,
                  "updatedAt"=NOW()
            WHERE "organizationId"=$3
              AND "legalEntityId"=$4
              AND "patientId"=$5
              AND "id"=$6`,
          serviceLevel || null,
          auth.userId,
          auth.organizationId,
          legalEntityId,
          patientId,
          encounterId,
        );

        if (attendingCosignerUserId) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireEncounterParticipant"
              ("organizationId","legalEntityId","encounterId","userId","role")
             SELECT $1,$2,$3,$4,'ATTENDING_COSIGNER'
             WHERE NOT EXISTS (
               SELECT 1
                 FROM "SpireEncounterParticipant"
                WHERE "organizationId"=$1
                  AND "legalEntityId"=$2
                  AND "encounterId"=$3
                  AND "userId"=$4
                  AND "role"='ATTENDING_COSIGNER'
             )`,
            auth.organizationId,
            legalEntityId,
            encounterId,
            attendingCosignerUserId,
          );
        }

        if (followUpTimeframe || instructions) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireVisitFollowUp"
              ("organizationId","legalEntityId","encounterId","timeframe","instructions","createdById")
             VALUES($1,$2,$3,$4,$5,$6)`,
            auth.organizationId,
            legalEntityId,
            encounterId,
            followUpTimeframe || null,
            instructions || null,
            auth.userId,
          );
        }

        if (instructions) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpirePatientInstruction"
              ("organizationId","legalEntityId","patientId","encounterId","body","createdById")
             VALUES($1,$2,$3,$4,$5,$6)`,
            auth.organizationId,
            legalEntityId,
            patientId,
            encounterId,
            instructions,
            auth.userId,
          );
        }

        const summary = {
          followUpTimeframe: followUpTimeframe || null,
          instructions: instructions || null,
          serviceLevel: serviceLevel || null,
          modifiers,
          attendingCosignerUserId: attendingCosignerUserId || null,
          signedById: auth.userId,
          signedAt: new Date().toISOString(),
        };

        const avsRows = await tx.$queryRawUnsafe(
          `INSERT INTO "SpireAfterVisitSummary"
            ("organizationId","legalEntityId","patientId","encounterId","summary","generatedById")
           VALUES($1,$2,$3,$4,$5::jsonb,$6)
           RETURNING *`,
          auth.organizationId,
          legalEntityId,
          patientId,
          encounterId,
          JSON.stringify(summary),
          auth.userId,
        ) as Array<Record<string, unknown>>;

        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireEncounterStatusHistory"
            ("organizationId","legalEntityId","encounterId","fromStatus","toStatus","reason","changedById")
           VALUES($1,$2,$3,$4,'SIGNED',$5,$6)`,
          auth.organizationId,
          legalEntityId,
          encounterId,
          String(current[0].status || 'OPEN'),
          closeReason,
          auth.userId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireClinicalAuditEvent"
            ("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent")
           VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,'SIGN_ENCOUNTER_REFERENCE_WRAP_UP','ENCOUNTER',$6,$7::jsonb,$8,$9)`,
          auth.organizationId,
          legalEntityId,
          auth.userId,
          auth.email ?? null,
          patientId,
          encounterId,
          JSON.stringify(summary),
          auth.ipAddress ?? null,
          auth.userAgent ?? null,
        );

        return { encounterId, status: 'SIGNED', avs: avsRows[0] ?? null, summary };
      });

      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });
};
