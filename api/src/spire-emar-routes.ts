import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  legalEntityId?: string;
  enterpriseOwner?: boolean;
};

type Deps = {
  authOf: (response: express.Response) => AuthContext;
};

type EmarAdministration = {
  id?: string;
  scheduledFor?: string | Date | null;
  status?: string | null;
  administeredAt?: string | Date | null;
  administeredById?: string | null;
  reason?: string | null;
  note?: string | null;
};

type EmarMedicationRow = Record<string, unknown> & {
  medicationOrderId?: string;
  dueTimes?: unknown;
  administrations?: EmarAdministration[];
};

type OverdueOccurrenceRow = Record<string, unknown> & {
  overdueCount?: number | string;
};

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

const licensedMedicationRoles = new Set<UserRole>([
  UserRole.RN,
  UserRole.LPN,
  UserRole.DELEGATING_NURSE,
]);

const elevatedRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.AUDITOR,
  UserRole.CEO,
  UserRole.DOO,
]);

const DEFAULT_SPIRE_TIME_ZONE = 'America/New_York';
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

const selectedEntity = (auth: AuthContext) => {
  if (!auth.legalEntityId) {
    throw Object.assign(new Error('Select a Sulandra company before documenting medications'), { status: 409 });
  }
  return auth.legalEntityId;
};

const elevated = (auth: AuthContext) =>
  auth.enterpriseOwner === true
  || elevatedRoles.has(auth.role)
  || String(auth.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';

const spireTimeZone = () => process.env.SPIRE_TIME_ZONE?.trim() || DEFAULT_SPIRE_TIME_ZONE;

const localDateInZone = (date = new Date(), timeZone = spireTimeZone()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const parseRequestedDate = (value: unknown, timeZone: string) => {
  if (value == null || String(value).trim() === '') return localDateInZone(new Date(), timeZone);
  const text = String(value).trim();
  if (!DATE_TEXT.test(text)) {
    throw Object.assign(new Error('MAR date must use YYYY-MM-DD format'), { status: 400 });
  }
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw Object.assign(new Error('MAR date is invalid'), { status: 400 });
  }
  return text;
};

const timeInZone = (value: unknown, timeZone: string) => {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value || '';
  const minute = parts.find((part) => part.type === 'minute')?.value || '';
  return hour && minute ? `${hour}:${minute}` : '';
};

const normalizeEmarRows = (rows: EmarMedicationRow[], timeZone: string) =>
  rows.map((row) => {
    const administrations = Array.isArray(row.administrations) ? row.administrations : [];
    const persistedTimes = Array.from(new Set(
      administrations
        .map((administration) => timeInZone(administration.scheduledFor, timeZone))
        .filter(Boolean),
    )).sort();
    return {
      ...row,
      orderDueTimes: row.dueTimes,
      dueTimes: persistedTimes.length ? persistedTimes : row.dueTimes,
      administrations,
    };
  });

async function medicationAuthorized(prisma: PrismaClient, auth: AuthContext) {
  if (licensedMedicationRoles.has(auth.role)) return true;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1
       FROM "SpireMedicationAdministrationQualification" q
       WHERE q."organizationId"=$1
         AND q."legalEntityId"=$2
         AND q."userId"=$3
         AND q."status"='ACTIVE'
         AND q."revokedAt" IS NULL
         AND q."effectiveAt"<=NOW()
         AND (q."expiresAt" IS NULL OR q."expiresAt">NOW())
     ) AS allowed`,
    auth.organizationId,
    selectedEntity(auth),
    auth.userId,
  );
  return rows[0]?.allowed === true;
}

async function patientAllowed(
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
) {
  const entity = selectedEntity(auth);
  const enrolled = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1
       FROM "ClientEnrollment" e
       WHERE e."organizationId"=$1
         AND e."legalEntityId"=$2
         AND e."clientId"=$3
         AND e."status" IN ('PENDING','ACTIVE','PAUSED')
     ) AS allowed`,
    auth.organizationId,
    entity,
    patientId,
  );
  if (enrolled[0]?.allowed !== true) return false;
  if (elevated(auth)) return true;

  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1
       FROM "SpireEmployeeClientAssignment" x
       WHERE x."organizationId"=$1
         AND x."legalEntityId"=$2
         AND x."userId"=$3
         AND x."clientId"=$4
       UNION ALL
       SELECT 1
       FROM "SpirePatientHomeAssignment" p
       JOIN "SpireEmployeeHomeAssignment" h
         ON h."organizationId"=p."organizationId"
        AND h."legalEntityId"=p."legalEntityId"
        AND h."homeId"=p."homeId"
       WHERE p."organizationId"=$1
         AND p."legalEntityId"=$2
         AND h."userId"=$3
         AND p."patientId"=$4
         AND (p."endsAt" IS NULL OR p."endsAt">NOW())
       UNION ALL
       SELECT 1
       FROM "UserEntityAccessGrant" g
       WHERE g."organizationId"=$1
         AND g."legalEntityId"=$2
         AND g."userId"=$3
         AND g."scopeType"='CLIENT'
         AND g."clientId"=$4
         AND g."active"=TRUE
         AND g."effectiveFrom"<=NOW()
         AND (g."effectiveTo" IS NULL OR g."effectiveTo">NOW())
     ) AS allowed`,
    auth.organizationId,
    entity,
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
  if (!clinicalRoles.has(auth.role) && auth.enterpriseOwner !== true) {
    throw Object.assign(new Error('SPIRE medication access is required'), { status: 403 });
  }
  selectedEntity(auth);
  if (!(await patientAllowed(prisma, auth, patientId))) {
    throw Object.assign(
      new Error('This chart is outside your authorized medication scope for the selected company'),
      { status: 403 },
    );
  }
  if (write && !(await medicationAuthorized(prisma, auth))) {
    throw Object.assign(
      new Error('Medication administration is blocked. A licensed nursing role or an active verified medication-administration qualification is required for this company.'),
      { status: 403 },
    );
  }
}

async function audit(
  prisma: PrismaClient,
  auth: AuthContext,
  patientId: string,
  action: string,
  resourceId?: string,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireChartAccessEvent"
       ("organizationId","legalEntityId","patientId","actorUserId","actorEmail","action",
        "resourceType","resourceId","ipAddress","userAgent")
     VALUES($1,$2,$3,$4,$5,$6,'MEDICATION',$7,$8,$9)`,
    auth.organizationId,
    selectedEntity(auth),
    patientId,
    auth.userId,
    auth.email ?? null,
    action,
    resourceId ?? null,
    auth.ipAddress ?? null,
    auth.userAgent ?? null,
  );
}

const eventSchema = z.object({
  medicationOrderId: z.string().min(1),
  // PostgreSQL timestamptz values may round-trip as Zulu or explicit-offset ISO strings.
  // Accept both so selecting an existing scheduled occurrence can always be documented.
  scheduledFor: z.string().datetime({ offset: true }).optional().nullable(),
  status: z.enum(['GIVEN', 'REFUSED', 'HELD', 'NOT_GIVEN', 'MISSED', 'PRN_GIVEN']),
  administeredDose: z.string().optional().nullable(),
  administeredRoute: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  prnIndication: z.string().optional().nullable(),
  barcodeValue: z.string().trim().max(1024).optional().nullable(),
  controlledQuantity: z.number().optional().nullable(),
  witnessUserId: z.string().optional().nullable(),
  // Desktop and the forthcoming native scanner share this exact eMAR write path.
  source: z.enum(['DESKTOP_MAR', 'MOBILE_SCAN']).default('DESKTOP_MAR'),
});

const effectivenessSchema = z.object({
  effectiveness: z.string().min(1).max(2000),
});

export const registerSpireEmarRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  deps: Deps,
) => {
  const { authOf } = deps;

  app.get('/api/spire/patients/:patientId/medications/active', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT m.*,
                COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'scheduledTime',s."scheduledTime",
                      'windowBeforeMinutes',s."windowBeforeMinutes",
                      'windowAfterMinutes',s."windowAfterMinutes"
                    )
                    ORDER BY s."scheduledTime"
                  )
                  FROM "SpireMedicationSchedule" s
                  WHERE s."organizationId"=m."organizationId"
                    AND s."medicationOrderId"=m."id"
                    AND s."active"=TRUE
                ),'[]'::jsonb) schedules,
                (
                  SELECT e."status"
                  FROM "SpireMedicationAdministrationEvent" e
                  WHERE e."organizationId"=m."organizationId"
                    AND e."medicationOrderId"=m."id"
                  ORDER BY e."createdAt" DESC
                  LIMIT 1
                ) AS "lastAdministrationStatus",
                (
                  SELECT e."administeredAt"
                  FROM "SpireMedicationAdministrationEvent" e
                  WHERE e."organizationId"=m."organizationId"
                    AND e."medicationOrderId"=m."id"
                  ORDER BY e."createdAt" DESC
                  LIMIT 1
                ) AS "lastAdministeredAt"
         FROM "SpireMedicationOrder" m
         WHERE m."organizationId"=$1
           AND COALESCE(to_jsonb(m)->>'patientId',to_jsonb(m)->>'clientId')=$2
           AND m."status"='ACTIVE'
         ORDER BY m."name"`,
        auth.organizationId,
        patientId,
      );
      await audit(prisma, auth, patientId, 'VIEW_ACTIVE_MEDICATIONS');
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/spire/patients/:patientId/emar', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId);

      const timeZone = spireTimeZone();
      const date = parseRequestedDate(req.query.date, timeZone);
      const includeOverdue = ['1', 'true', 'yes'].includes(
        String(req.query.includeOverdue || '').trim().toLowerCase(),
      );

      const rows = await prisma.$queryRawUnsafe<EmarMedicationRow[]>(
        `SELECT
           m."id" AS "medicationOrderId",
           m."name",
           m."dose",
           m."route",
           m."frequency",
           m."instructions",
           m."dueTimes",
           m."startDate",
           m."endDate",
           m."status",
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object(
                 'id',a2."id",
                 'scheduledFor',a2."scheduledFor",
                 'status',a2."status",
                 'administeredAt',a2."administeredAt",
                 'administeredById',a2."administeredByUserId",
                 'reason',a2."resultNote",
                 'note',a2."resultNote"
               )
               ORDER BY a2."scheduledFor"
             )
             FROM "SpireMedicationAdministration" a2
             WHERE a2."organizationId"=m."organizationId"
               AND a2."medicationOrderId"=m."id"
               AND (a2."scheduledFor" AT TIME ZONE $4)::date=$3::date
           ),'[]'::jsonb) administrations
         FROM "SpireMedicationOrder" m
         WHERE m."organizationId"=$1
           AND COALESCE(to_jsonb(m)->>'patientId',to_jsonb(m)->>'clientId')=$2
           AND m."startDate"<=$3::date
           AND (m."endDate" IS NULL OR m."endDate">=$3::date)
           AND (
             m."status"='ACTIVE'
             OR EXISTS(
               SELECT 1
               FROM "SpireMedicationAdministration" ax
               WHERE ax."organizationId"=m."organizationId"
                 AND ax."medicationOrderId"=m."id"
                 AND (ax."scheduledFor" AT TIME ZONE $4)::date=$3::date
             )
           )
         ORDER BY m."name"`,
        auth.organizationId,
        patientId,
        date,
        timeZone,
      );

      let overdueOccurrences: OverdueOccurrenceRow[] = [];
      let overdueCount = 0;

      if (includeOverdue) {
        overdueOccurrences = await prisma.$queryRawUnsafe<OverdueOccurrenceRow[]>(
          `SELECT
             a."id",
             a."medicationOrderId",
             a."scheduledFor",
             a."status",
             m."name",
             m."dose",
             m."route",
             m."frequency",
             m."instructions",
             COUNT(*) OVER()::int AS "overdueCount"
           FROM "SpireMedicationAdministration" a
           JOIN "SpireMedicationOrder" m
             ON m."organizationId"=a."organizationId"
            AND m."id"=a."medicationOrderId"
           WHERE a."organizationId"=$1
             AND a."clientId"=$2
             AND a."status" IN ('SCHEDULED','DUE')
             AND (a."scheduledFor" AT TIME ZONE $3)::date < $4::date
             AND m."status"='ACTIVE'
           ORDER BY a."scheduledFor" DESC
           LIMIT 100`,
          auth.organizationId,
          patientId,
          timeZone,
          date,
        );
        overdueCount = Number(overdueOccurrences[0]?.overdueCount || overdueOccurrences.length || 0);
        overdueOccurrences = overdueOccurrences.map(({ overdueCount: _count, ...row }) => row);
      }

      await audit(prisma, auth, patientId, 'VIEW_EMAR');

      res.json({
        data: {
          date,
          timeZone,
          medications: normalizeEmarRows(rows, timeZone),
          medicationAdministrationAuthorized: await medicationAuthorized(prisma, auth),
          overdueOccurrences,
          overdueCount,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/spire/patients/:patientId/emar/events', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const patientId = req.params.patientId;
      await requirePatient(prisma, auth, patientId, true);
      const body = eventSchema.parse(req.body);

      const medication = await prisma.$queryRawUnsafe<Array<{
        id: string;
        name: string;
        dose: string;
        route: string;
      }>>(
        `SELECT "id","name","dose","route"
         FROM "SpireMedicationOrder" m
         WHERE m."organizationId"=$1
           AND COALESCE(to_jsonb(m)->>'patientId',to_jsonb(m)->>'clientId')=$2
           AND m."id"=$3
           AND m."status"='ACTIVE'`,
        auth.organizationId,
        patientId,
        body.medicationOrderId,
      );

      if (!medication[0]) {
        throw Object.assign(new Error('Active medication order not found'), { status: 404 });
      }

      if (
        ['REFUSED', 'HELD', 'NOT_GIVEN', 'MISSED'].includes(body.status)
        && !String(body.reason || '').trim()
      ) {
        throw Object.assign(
          new Error('A reason is required when medication is not administered'),
          { status: 400 },
        );
      }

      if (body.status === 'PRN_GIVEN' && !String(body.prnIndication || '').trim()) {
        throw Object.assign(new Error('PRN indication is required'), { status: 400 });
      }

      const scheduled = body.scheduledFor ? new Date(body.scheduledFor) : null;
      const statusMap: Record<string, string> = {
        GIVEN: 'GIVEN',
        REFUSED: 'REFUSED',
        HELD: 'HELD',
        NOT_GIVEN: 'MISSED',
        MISSED: 'MISSED',
        PRN_GIVEN: 'GIVEN',
      };

      let administrationId: string | undefined;

      if (scheduled) {
        const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT "id"
           FROM "SpireMedicationAdministration"
           WHERE "organizationId"=$1
             AND "medicationOrderId"=$2
             AND "scheduledFor"=$3
           LIMIT 1`,
          auth.organizationId,
          body.medicationOrderId,
          scheduled,
        );
        administrationId = existing[0]?.id;
      }

      if (administrationId) {
        await prisma.$executeRawUnsafe(
          `UPDATE "SpireMedicationAdministration"
           SET "status"=$1,
               "administeredAt"=CASE WHEN $1='GIVEN' THEN NOW() ELSE "administeredAt" END,
               "administeredByUserId"=$2,
               "resultNote"=$3,
               "updatedAt"=NOW()
           WHERE "id"=$4`,
          statusMap[body.status] || 'MISSED',
          auth.userId,
          [body.reason, body.note, body.prnIndication].filter(Boolean).join(' — ') || null,
          administrationId,
        );
      } else {
        administrationId = crypto.randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "SpireMedicationAdministration"
             ("id","organizationId","clientId","medicationOrderId","scheduledFor","status",
              "administeredAt","administeredByUserId","resultNote","createdAt","updatedAt")
           VALUES(
             $1,$2,$3,$4,$5,$6,
             CASE WHEN $6='GIVEN' THEN NOW() ELSE NULL END,
             $7,$8,NOW(),NOW()
           )`,
          administrationId,
          auth.organizationId,
          patientId,
          body.medicationOrderId,
          scheduled ?? new Date(),
          statusMap[body.status] || 'MISSED',
          auth.userId,
          [body.reason, body.note, body.prnIndication].filter(Boolean).join(' — ') || null,
        );
      }

      await audit(prisma, auth, patientId, `EMAR_${body.status}_${body.source}`, administrationId);

      res.status(201).json({
        data: {
          id: administrationId,
          status: body.status,
          source: body.source,
          barcodeCaptured: Boolean(body.barcodeValue),
          legalEntityId: selectedEntity(auth),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/spire/patients/:patientId/emar/events/:eventId/effectiveness',
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const patientId = req.params.patientId;
        await requirePatient(prisma, auth, patientId, true);
        const body = effectivenessSchema.parse(req.body);
        const count = await prisma.$executeRawUnsafe(
          `UPDATE "SpireMedicationAdministration"
           SET "resultNote"=CONCAT_WS(' — ',NULLIF("resultNote",''),$1),
               "updatedAt"=NOW()
           WHERE "organizationId"=$2
             AND "clientId"=$3
             AND "id"=$4`,
          body.effectiveness,
          auth.organizationId,
          patientId,
          req.params.eventId,
        );
        if (!count) {
          throw Object.assign(
            new Error('Administration event not found in the selected company'),
            { status: 404 },
          );
        }
        await audit(
          prisma,
          auth,
          patientId,
          'DOCUMENT_PRN_EFFECTIVENESS',
          req.params.eventId,
        );
        res.json({ data: { ok: true } });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    '/api/spire/patients/:patientId/medications/reconciliation',
    async (req, res, next) => {
      try {
        const auth = authOf(res);
        const patientId = req.params.patientId;
        await requirePatient(prisma, auth, patientId);
        const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT r.*,
                  COALESCE((
                    SELECT jsonb_agg(i ORDER BY i."createdAt")
                    FROM "SpireMedicationReconciliationItem" i
                    WHERE i."organizationId"=r."organizationId"
                      AND i."reconciliationId"=r."id"
                  ),'[]'::jsonb) items
           FROM "SpireMedicationReconciliation" r
           WHERE r."organizationId"=$1
             AND r."patientId"=$2
           ORDER BY r."createdAt" DESC
           LIMIT 20`,
          auth.organizationId,
          patientId,
        );
        res.json({ data: rows });
      } catch (error) {
        next(error);
      }
    },
  );
};