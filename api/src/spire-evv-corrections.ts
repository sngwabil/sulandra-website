import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const text = (value: unknown, max = 5000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const has = (value: unknown, key: string) =>
  Boolean(value && typeof value === 'object' && Object.hasOwn(value, key));
const httpError = (status: number, message: string, details?: unknown) =>
  Object.assign(new Error(message), { status, details });
const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* not JSON */ }
  }
  return {};
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const TEXT_FIELDS = new Map<string, number>([
  ['providerMedicaidId', 80], ['patientOtherId', 120], ['patientMedicaidId', 80], ['staffOtherId', 120],
  ['payer', 120], ['payerProgram', 120], ['procedureCode', 120], ['modifier1', 40], ['timeZone', 80],
  ['visitLocationType', 5], ['groupVisitCode', 120], ['visitMemo', 1000],
  ['originName', 250], ['originStreet', 250], ['originCity', 120], ['originState', 40], ['originPostalCode', 40],
  ['destinationName', 250], ['destinationStreet', 250], ['destinationCity', 120], ['destinationState', 40],
  ['destinationPostalCode', 40], ['vehicleLicensePlate', 80],
]);
const NUMBER_FIELDS = new Set(['hoursToBillMinutes', 'odometerStart', 'odometerEnd', 'milesDriven']);
const DATE_FIELDS = new Set(['adjustedClockInAt', 'adjustedClockOutAt']);
const NMT_FIELDS = new Set([
  'originName', 'originStreet', 'originCity', 'originState', 'originPostalCode',
  'destinationName', 'destinationStreet', 'destinationCity', 'destinationState', 'destinationPostalCode',
  'vehicleLicensePlate', 'personsPresent', 'odometerStart', 'odometerEnd', 'milesDriven',
  'driverSignature', 'driverSignatureMethod', 'driverSignatureSha256', 'driverSignedAt', 'driverSignerUserId',
]);
export const SPIRE_EVV_CORRECTION_EFFECTIVE_FIELDS = new Set<string>([
  ...TEXT_FIELDS.keys(), ...NUMBER_FIELDS, ...DATE_FIELDS, 'billVisit', 'personsPresent',
  'driverSignature', 'driverSignatureMethod', 'driverSignatureSha256', 'driverSignedAt', 'driverSignerUserId',
]);

export function applySpireEvvCorrectionOverlay(
  originalVisit: Record<string, unknown>,
  changes: Array<Record<string, unknown>>,
) {
  const effective: Record<string, unknown> = { ...originalVisit };
  for (const change of changes) {
    const before = asRecord(change.beforeValue);
    const after = asRecord(change.afterValue);
    for (const key of SPIRE_EVV_CORRECTION_EFFECTIVE_FIELDS) {
      if (!Object.hasOwn(after, key)) continue;
      if (same(before[key], after[key])) continue;
      effective[key] = after[key];
    }
  }
  return effective;
}

export async function ensureSpireEvvCorrectionLedgerSchema(prisma: PrismaClient) {
  const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT to_regclass('"SpireEvvVisitChange"') IS NOT NULL AS exists`,
  );
  if (!exists[0]?.exists) throw httpError(500, 'SpireEvvVisitChange table is required before immutable corrections can be enabled');
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION spire_block_evv_visit_change_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'SpireEvvVisitChange is append-only; create a superseding correction instead of updating or deleting history';
    END;
    $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='SpireEvvVisitChange_immutable_guard') THEN
        CREATE TRIGGER "SpireEvvVisitChange_immutable_guard"
        BEFORE UPDATE OR DELETE ON "SpireEvvVisitChange"
        FOR EACH ROW EXECUTE FUNCTION spire_block_evv_visit_change_mutation();
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SpireEvvVisitChange_visit_created_idx"
    ON "SpireEvvVisitChange"("organizationId","patientId","evvVisitId","createdAt")
  `);
}

function normalizeCorrectionPatch(
  body: Record<string, unknown>,
  effectiveBefore: Record<string, unknown>,
  actorUserId: string,
) {
  const patch: Record<string, unknown> = {};
  for (const [key, max] of TEXT_FIELDS) {
    if (!has(body, key)) continue;
    const value = body[key];
    patch[key] = value === null || value === '' ? null : text(value, max) || null;
  }
  if (has(body, 'billVisit')) {
    if (typeof body.billVisit !== 'boolean') throw httpError(400, 'billVisit must be true or false');
    patch.billVisit = body.billVisit;
  }
  for (const key of NUMBER_FIELDS) {
    if (!has(body, key)) continue;
    if (body[key] === null || body[key] === '') { patch[key] = null; continue; }
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value < 0) throw httpError(400, `${key} must be a non-negative number`);
    patch[key] = value;
  }
  for (const key of DATE_FIELDS) {
    if (!has(body, key)) continue;
    if (body[key] === null || body[key] === '') { patch[key] = null; continue; }
    const date = new Date(String(body[key]));
    if (Number.isNaN(date.getTime())) throw httpError(400, `${key} must be a valid date/time`);
    patch[key] = date.toISOString();
  }
  if (has(body, 'visitLocationType')) {
    const location = String(patch.visitLocationType ?? '');
    if (location && !['1', '2'].includes(location)) throw httpError(400, 'visitLocationType must be 1 (Home) or 2 (Community)');
  }
  if (has(body, 'personsPresent')) {
    if (!Array.isArray(body.personsPresent)) throw httpError(400, 'personsPresent must be an array');
    const people = body.personsPresent.map((person) => text(person, 200)).filter(Boolean).slice(0, 30);
    if (people.length < 2) throw httpError(400, 'NMT persons-present evidence must identify at least two people');
    patch.personsPresent = people;
  }
  if (has(body, 'driverSignatureMethod') && !has(body, 'driverSignature')) {
    throw httpError(400, 'A replacement driver signature is required when changing the signature method');
  }
  if (has(body, 'driverSignature')) {
    const signature = text(body.driverSignature, 500000);
    if (signature.length < 2) throw httpError(400, 'A replacement driver signature is required');
    const method = text(body.driverSignatureMethod, 40).toUpperCase()
      || text(effectiveBefore.driverSignatureMethod, 40).toUpperCase()
      || 'ELECTRONIC';
    if (!['DRAWN', 'TYPED', 'ELECTRONIC', 'PIN'].includes(method)) throw httpError(400, 'Unsupported driver signature method');
    patch.driverSignature = signature;
    patch.driverSignatureMethod = method;
    patch.driverSignatureSha256 = createHash('sha256').update(signature).digest('hex');
    patch.driverSignedAt = new Date().toISOString();
    patch.driverSignerUserId = actorUserId;
  }
  const isNmt = Boolean(text(effectiveBefore.sourceNmtTripId, 160));
  if (!isNmt) {
    const requestedNmtFields = [...NMT_FIELDS].filter((key) => has(body, key));
    if (requestedNmtFields.length) throw httpError(400, 'NMT route, vehicle, mileage, persons-present and signature corrections are only valid for NMT EVV visits');
  }
  return patch;
}

export async function appendImmutableSpireEvvCorrection(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    legalEntityId?: string | null;
    patientId: string;
    visitId: string;
    actorUserId: string;
    actorEmail: string;
    body: Record<string, unknown>;
  },
) {
  const reasonCode = text(input.body.reasonCode, 20) || '99';
  if (reasonCode !== '99') throw httpError(400, 'Ohio Alternate EVV manual corrections require reason code 99');
  const memo = text(input.body.changeReasonMemo, 256);
  if (memo.length < 2) throw httpError(400, 'A correction reason memo is required');
  await ensureSpireEvvCorrectionLedgerSchema(prisma);

  return await prisma.$transaction(async (tx) => {
    const currentRows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "SpireEvvVisit" WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 FOR UPDATE`,
      input.organizationId, input.patientId, input.visitId,
    );
    const originalVisit = currentRows[0];
    if (!originalVisit) throw httpError(404, 'EVV visit not found');
    const changes = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "SpireEvvVisitChange" WHERE "organizationId"=$1 AND "patientId"=$2 AND "evvVisitId"=$3 ORDER BY "createdAt","id"`,
      input.organizationId, input.patientId, input.visitId,
    );
    const effectiveBefore = applySpireEvvCorrectionOverlay(originalVisit, changes);
    const patch = normalizeCorrectionPatch(input.body, effectiveBefore, input.actorUserId);
    const effectiveAfter: Record<string, unknown> = { ...effectiveBefore, ...patch };
    const changedKeys = [...SPIRE_EVV_CORRECTION_EFFECTIVE_FIELDS].filter((key) =>
      Object.hasOwn(patch, key) && !same(effectiveBefore[key], effectiveAfter[key]));
    if (!changedKeys.length) throw httpError(400, 'At least one canonical EVV value must actually change');

    const visitOtherId = text(originalVisit.visitOtherId, 120) || input.visitId;
    const seqRows = await tx.$queryRawUnsafe<Array<{ sequenceId: string }>>(
      `SELECT "lastSequenceId"::text AS "sequenceId" FROM "SpireEvvSequence"
       WHERE "organizationId"=$1 AND "recordType"='VISIT' AND "recordOtherId"=$2 LIMIT 1`,
      input.organizationId, visitOtherId,
    );
    const correctionRows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `INSERT INTO "SpireEvvVisitChange"(
        "organizationId","legalEntityId","patientId","evvVisitId","appliesToSequenceId","actorUserId",
        "changeMadeByEmail","reasonCode","changeReasonMemo","source","beforeValue","afterValue"
      ) VALUES($1,$2,$3,$4,$5::numeric,$6,$7,'99',$8,'IMMUTABLE_OVERLAY',$9::jsonb,$10::jsonb) RETURNING *`,
      input.organizationId, originalVisit.legalEntityId ?? input.legalEntityId ?? null, input.patientId, input.visitId,
      seqRows[0]?.sequenceId ?? null, input.actorUserId, input.actorEmail, memo,
      JSON.stringify(effectiveBefore), JSON.stringify(effectiveAfter),
    );
    await tx.$executeRawUnsafe(
      `UPDATE "SpireEvvVisit" SET "transmissionState"='DIRTY',"updatedAt"=NOW()
       WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3`,
      input.organizationId, input.patientId, input.visitId,
    );
    return {
      originalVisit,
      effectiveVisit: effectiveAfter,
      correction: correctionRows[0],
      changedKeys,
      reasonCode: '99',
      changeReasonMemo: memo,
    };
  });
}
