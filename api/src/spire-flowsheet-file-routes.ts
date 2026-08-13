import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  legalEntityId?: string;
  enterpriseOwner?: boolean;
};

type Deps = {
  authOf: (response: express.Response) => AuthContext;
};

type FileChange = {
  entryId?: string | null;
  rowId?: string | null;
  recordedAt?: string | Date | null;
  value?: string | null;
  numericValue?: number | string | null;
  comment?: string | null;
};

const writerRoles = new Set([
  'ADMINISTRATOR',
  'PROGRAM_MANAGER',
  'DSP',
  'DELEGATING_NURSE',
  'LPN',
  'RN',
  'HOUSE_MANAGER',
  'CEO',
  'DOO',
  'COO',
]);

const adminRoles = new Set(['ADMINISTRATOR', 'PROGRAM_MANAGER', 'CEO', 'DOO', 'COO']);
const text = (value: unknown, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const badRequest = (message: string) => Object.assign(new Error(message), { status: 400 });
const forbidden = (message: string) => Object.assign(new Error(message), { status: 403 });
const notFound = (message: string) => Object.assign(new Error(message), { status: 404 });
const conflict = (message: string) => Object.assign(new Error(message), { status: 409 });

function entityId(auth: AuthContext) {
  const value = text(auth.legalEntityId, 120);
  if (!value) throw conflict('Select a Sulandra company before documenting in SPIRE');
  return value;
}

function ensureWriter(auth: AuthContext) {
  if (!writerRoles.has(String(auth.role || ''))) throw forbidden('This SPIRE role is read-only');
}

function isAdmin(auth: AuthContext) {
  return auth.enterpriseOwner === true ||
    adminRoles.has(String(auth.role || '')) ||
    text(auth.email, 300).toLowerCase() === 'admin@sulandrahealth.com';
}

function asDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) throw badRequest('A valid flowsheet event date and time is required');
  return date;
}

function validateValues(row: Record<string, unknown>, change: FileChange) {
  const dataType = text(row.dataType, 40).toUpperCase() || 'TEXT';
  const rowName = text(row.name, 500) || 'Flowsheet row';
  const comment = text(change.comment, 8000) || null;
  const rawValue = change.value == null ? '' : text(change.value, 8000);
  let value: string | null = rawValue || null;
  let numeric: number | null = null;

  if (dataType === 'NUMBER') {
    if (change.numericValue != null && String(change.numericValue).trim() !== '') {
      numeric = Number(change.numericValue);
    } else if (rawValue) {
      numeric = Number(rawValue);
    }
    if (numeric != null && !Number.isFinite(numeric)) throw badRequest(`${rowName}: enter a valid number.`);
    value = null;
  }

  // SELECT/options are advisory suggestions in the SPIRE flowsheet UI, not a
  // hard enum. Staff may type an appropriate free-text value when the configured
  // suggestions do not describe what actually occurred. The actor, timestamp,
  // original value and later amendments remain fully audited by File.

  if (rowName === 'BP (mmHg)' && value) {
    const match = value.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
    if (!match) throw badRequest('Blood pressure must be entered as systolic/diastolic, for example 120/80.');
    const systolic = Number(match[1]);
    const diastolic = Number(match[2]);
    if (systolic <= diastolic) throw badRequest('Blood pressure systolic value must be greater than diastolic value.');
    value = `${systolic}/${diastolic}`;
  }

  if (numeric == null && !value && !comment) throw badRequest(`${rowName}: enter a value or comment before filing.`);
  return { numeric, value, comment };
}

async function allowed(prisma: PrismaClient, auth: AuthContext, patientId: string) {
  const selectedEntityId = entityId(auth);
  const enrolled = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM "ClientEnrollment" e WHERE e."organizationId"=$1 AND e."legalEntityId"=$2 AND e."clientId"=$3 AND e."status" IN ('PENDING','ACTIVE','PAUSED')) AS allowed`,
    auth.organizationId,
    selectedEntityId,
    patientId,
  );
  if (enrolled[0]?.allowed !== true) return false;
  if (isAdmin(auth) || String(auth.role || '') === 'AUDITOR') return true;

  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
      SELECT 1 FROM "SpireEmployeeClientAssignment" x
       WHERE x."organizationId"=$1 AND x."legalEntityId"=$2 AND x."userId"=$3 AND x."clientId"=$4
      UNION ALL
      SELECT 1 FROM "SpirePatientHomeAssignment" p
       JOIN "SpireEmployeeHomeAssignment" h
         ON h."organizationId"=p."organizationId" AND h."legalEntityId"=p."legalEntityId" AND h."homeId"=p."homeId"
       WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND h."userId"=$3 AND p."patientId"=$4
         AND (p."endsAt" IS NULL OR p."endsAt">NOW())
      UNION ALL
      SELECT 1 FROM "UserEntityAccessGrant" g
       WHERE g."organizationId"=$1 AND g."legalEntityId"=$2 AND g."userId"=$3 AND g."scopeType"='CLIENT'
         AND g."clientId"=$4 AND g."active"=TRUE AND g."effectiveFrom"<=NOW()
         AND (g."effectiveTo" IS NULL OR g."effectiveTo">NOW())
    ) AS allowed`,
    auth.organizationId,
    selectedEntityId,
    auth.userId,
    patientId,
  );
  return rows[0]?.allowed === true;
}

export const registerSpireFlowsheetFileRoutes = (app: express.Express, prisma: PrismaClient, deps: Deps) => {
  const { authOf } = deps;

  app.post('/api/spire/patients/:patientId/flowsheet-workspace/file', async (req, res, next) => {
    try {
      const auth = authOf(res);
      ensureWriter(auth);
      const patientId = text(req.params.patientId, 120);
      if (!patientId) throw badRequest('Patient is required');
      if (!(await allowed(prisma, auth, patientId))) throw forbidden('This chart is outside your authorized clinical scope for the selected company');

      const changes = Array.isArray(req.body?.entries) ? req.body.entries as FileChange[] : [];
      if (!changes.length) throw badRequest('There are no staged flowsheet entries to file');
      if (changes.length > 500) throw badRequest('File no more than 500 flowsheet cells at one time');

      const selectedEntityId = entityId(auth);
      const fileId = randomUUID();
      const filedAt = new Date();

      const filedEntries = await prisma.$transaction(async (tx) => {
        const filed: Record<string, unknown>[] = [];

        for (const change of changes) {
          const entryId = text(change.entryId, 120);
          const rowId = text(change.rowId, 120);
          if (!rowId) throw badRequest('Every staged flowsheet cell must include a row');
          const recordedAt = asDate(change.recordedAt);

          const rowRows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
            `SELECT * FROM "SpireFlowsheetRow" WHERE "organizationId"=$1 AND "id"=$2 AND "active"=TRUE LIMIT 1`,
            auth.organizationId,
            rowId,
          );
          const row = rowRows[0];
          if (!row) throw notFound('A flowsheet row selected for filing is no longer active');
          const { numeric, value, comment } = validateValues(row, change);

          if (entryId) {
            const originals = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
              `SELECT e.*,r."name" AS "rowName",r."groupName",r."dataType",r."unit",r."options"
                 FROM "SpireFlowsheetEntry" e
                 JOIN "SpireFlowsheetRow" r ON r."id"=e."rowId" AND r."organizationId"=e."organizationId"
                WHERE e."organizationId"=$1 AND e."legalEntityId"=$2 AND e."patientId"=$3 AND e."id"=$4 LIMIT 1`,
              auth.organizationId,
              selectedEntityId,
              patientId,
              entryId,
            );
            const original = originals[0];
            if (!original) throw notFound('A filed flowsheet entry selected for amendment was not found');
            if (String(original.recordedById || '') !== String(auth.userId)) throw forbidden('Only the user who originally filed this flowsheet entry can amend it');
            if (String(original.rowId || '') !== rowId) throw conflict('A filed flowsheet entry cannot be moved to a different row');

            const updatedRows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
              `UPDATE "SpireFlowsheetEntry"
                  SET "value"=$1,"numericValue"=$2,"recordedAt"=$3,"comment"=$4,"updatedAt"=NOW()
                WHERE "organizationId"=$5 AND "legalEntityId"=$6 AND "patientId"=$7 AND "id"=$8 AND "recordedById"=$9
                RETURNING *`,
              value,
              numeric,
              recordedAt,
              comment,
              auth.organizationId,
              selectedEntityId,
              patientId,
              entryId,
              auth.userId,
            );
            const updated = updatedRows[0];
            if (!updated) throw conflict('This filed entry can no longer be amended');

            await tx.$executeRawUnsafe(
              `INSERT INTO "SpireClinicalAuditEvent"("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","beforeValue","afterValue","ipAddress","userAgent")
               VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,'FLOWSHEET_ENTRY_AMENDED','FLOWSHEET_ENTRY',$6,$7::jsonb,$8::jsonb,$9,$10)`,
              auth.organizationId,
              selectedEntityId,
              auth.userId,
              auth.email ?? null,
              patientId,
              entryId,
              JSON.stringify(original),
              JSON.stringify({ ...updated, fileId }),
              auth.ipAddress ?? null,
              auth.userAgent ?? null,
            );
            filed.push({ ...updated, canEdit: true, amended: true, rowName: row.name, groupName: row.groupName, dataType: row.dataType, unit: row.unit });
          } else {
            const insertedRows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
              `INSERT INTO "SpireFlowsheetEntry"("organizationId","legalEntityId","patientId","rowId","value","numericValue","recordedAt","recordedById","comment","source")
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SPIRE_FLOWSHEET_FILE') RETURNING *`,
              auth.organizationId,
              selectedEntityId,
              patientId,
              rowId,
              value,
              numeric,
              recordedAt,
              auth.userId,
              comment,
            );
            const inserted = insertedRows[0];
            if (!inserted) throw conflict('A staged flowsheet entry could not be filed');

            await tx.$executeRawUnsafe(
              `INSERT INTO "SpireClinicalAuditEvent"("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent")
               VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,'FLOWSHEET_ENTRY_FILED','FLOWSHEET_ENTRY',$6,$7::jsonb,$8,$9)`,
              auth.organizationId,
              selectedEntityId,
              auth.userId,
              auth.email ?? null,
              patientId,
              String(inserted.id),
              JSON.stringify({ ...inserted, fileId }),
              auth.ipAddress ?? null,
              auth.userAgent ?? null,
            );
            filed.push({ ...inserted, canEdit: true, amended: false, rowName: row.name, groupName: row.groupName, dataType: row.dataType, unit: row.unit });
          }
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO "SpireClinicalAuditEvent"("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent")
           VALUES(gen_random_uuid()::text,$1,$2,$3,$4,$5,'FLOWSHEET_FILE_COMMITTED','FLOWSHEET_FILE',$6,$7::jsonb,$8,$9)`,
          auth.organizationId,
          selectedEntityId,
          auth.userId,
          auth.email ?? null,
          patientId,
          fileId,
          JSON.stringify({ fileId, count: filed.length, entryIds: filed.map((entry) => entry.id), filedAt: filedAt.toISOString() }),
          auth.ipAddress ?? null,
          auth.userAgent ?? null,
        );

        return filed;
      });

      res.status(201).json({
        data: {
          fileId,
          filedAt: filedAt.toISOString(),
          count: filedEntries.length,
          entries: filedEntries,
          filedBy: { userId: auth.userId, email: auth.email ?? null },
        },
      });
    } catch (error) {
      next(error);
    }
  });
};