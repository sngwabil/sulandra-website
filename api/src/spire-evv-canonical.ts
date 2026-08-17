import type { PrismaClient } from '@prisma/client';

export type SpireEvvRecordType = 'PATIENT' | 'STAFF' | 'VISIT';
export type SpireEvvEnvironment = 'UAT' | 'PRODUCTION';

export type CanonicalEvvSnapshot = {
  visit: Record<string, unknown>;
  calls: Array<Record<string, unknown>>;
  changes: Array<Record<string, unknown>>;
};

export const evvText = (value: unknown, max = 5000) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export const evvHttpError = (status: number, message: string, details?: unknown) =>
  Object.assign(new Error(message), { status, details });

const asBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback;

const iso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const nullableText = (value: unknown, max = 5000) => evvText(value, max) || null;

export async function nextSpireEvvSequence(
  prisma: PrismaClient,
  organizationId: string,
  recordType: SpireEvvRecordType,
  recordOtherId: string,
) {
  const rows = await prisma.$queryRawUnsafe<Array<{ sequenceId: string }>>(
    `INSERT INTO "SpireEvvSequence"("organizationId","recordType","recordOtherId","lastSequenceId")
       VALUES($1,$2,$3,1)
       ON CONFLICT("organizationId","recordType","recordOtherId") DO UPDATE SET
         "lastSequenceId"="SpireEvvSequence"."lastSequenceId"+1,
         "updatedAt"=NOW()
       RETURNING "lastSequenceId"::text AS "sequenceId"`,
    organizationId,
    recordType,
    recordOtherId,
  );
  if (!rows[0]?.sequenceId) throw evvHttpError(500, 'Unable to allocate an EVV sequence ID');
  return rows[0].sequenceId;
}

export async function loadCanonicalEvvSnapshot(
  prisma: PrismaClient,
  organizationId: string,
  patientId: string,
  visitId: string,
): Promise<CanonicalEvvSnapshot> {
  const visits = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireEvvVisit"
      WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 LIMIT 1`,
    organizationId,
    patientId,
    visitId,
  );
  const visit = visits[0];
  if (!visit) throw evvHttpError(404, 'EVV visit not found');
  const [calls, changes] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "SpireEvvCall"
        WHERE "organizationId"=$1 AND "evvVisitId"=$2
        ORDER BY "callDateTime","createdAt"`,
      organizationId,
      visitId,
    ),
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "SpireEvvVisitChange"
        WHERE "organizationId"=$1 AND "evvVisitId"=$2
        ORDER BY "createdAt"`,
      organizationId,
      visitId,
    ),
  ]);
  return { visit, calls, changes };
}

export function validateCanonicalEvvSnapshot(snapshot: CanonicalEvvSnapshot) {
  const { visit, calls } = snapshot;
  const errors: string[] = [];
  const visitLocation = evvText(visit.visitLocationType, 5);
  const visitProcedure = evvText(visit.procedureCode, 120);
  const requireText = (key: string, label: string) => {
    if (!evvText(visit[key], 500)) errors.push(`${label} is required`);
  };
  requireText('visitOtherId', 'VisitOtherID');
  requireText('providerMedicaidId', 'Provider Medicaid identifier');
  requireText('patientOtherId', 'PatientOtherID');
  requireText('patientMedicaidId', 'Patient Medicaid identifier');
  requireText('staffOtherId', 'StaffOtherID');
  requireText('payer', 'Payer');
  requireText('payerProgram', 'Payer program');
  requireText('procedureCode', 'Procedure code');
  requireText('timeZone', 'Time zone');
  if (!visit.clockInAt) errors.push('Call-in/clock-in time is required');
  if (!visit.clockOutAt) errors.push('Call-out/clock-out time is required');
  if (!['1', '2'].includes(visitLocation)) {
    errors.push('Visit location type must be 1 (Home) or 2 (Community)');
  }
  const assignments = new Set(calls.map((call) => evvText(call.callAssignment, 40)));
  if (!assignments.has('Call In')) errors.push('Canonical Call In evidence is required');
  if (!assignments.has('Call Out')) errors.push('Canonical Call Out evidence is required');
  for (const call of calls) {
    const assignment = evvText(call.callAssignment, 40) || 'EVV call';
    const callLocation = evvText(call.visitLocationType, 5) || visitLocation;
    const callProcedure = evvText(call.procedureCode, 120) || visitProcedure;
    if (!call.callDateTime) errors.push(`${assignment} date/time is required`);
    if (!evvText(call.callType, 40)) errors.push(`${assignment} type is required`);
    if (!callProcedure) errors.push(`${assignment} procedure code is required`);
    if (!['1', '2'].includes(callLocation)) {
      errors.push(`${assignment} location type must be 1 (Home) or 2 (Community)`);
    }
  }
  return [...new Set(errors)];
}

export function buildCanonicalOhioEvvVisitPayload(
  snapshot: CanonicalEvvSnapshot,
  sequenceId: string,
) {
  const { visit, calls, changes } = snapshot;
  const visitLocation = nullableText(visit.visitLocationType, 5);
  const visitProcedure = nullableText(visit.procedureCode, 120);
  return {
    Schema: 'SPIRE_OHIO_ALT_EVV_CANONICAL_1_1',
    BusinessEntityMedicaidIdentifier: nullableText(visit.providerMedicaidId, 80),
    VisitOtherID: nullableText(visit.visitOtherId, 120),
    SequenceID: sequenceId,
    StaffOtherID: nullableText(visit.staffOtherId, 120),
    PatientOtherID: nullableText(visit.patientOtherId, 120),
    PatientMedicaidID: nullableText(visit.patientMedicaidId, 80),
    VisitCancelledIndicator: String(visit.status || '').toUpperCase() === 'CANCELLED',
    Payer: nullableText(visit.payer, 120),
    PayerProgram: nullableText(visit.payerProgram, 120),
    ProcedureCode: visitProcedure,
    Modifier1: nullableText(visit.modifier1, 40),
    TimeZone: nullableText(visit.timeZone, 80) || 'US/Eastern',
    AdjInDateTime: iso(visit.adjustedClockInAt),
    AdjOutDateTime: iso(visit.adjustedClockOutAt),
    BillVisit: asBoolean(visit.billVisit, true),
    HoursToBill: visit.hoursToBillMinutes == null ? null : Number(visit.hoursToBillMinutes),
    VisitMemo: nullableText(visit.visitMemo, 1000),
    GroupVisitCode: nullableText(visit.groupVisitCode, 120),
    Calls: calls.map((call) => ({
      CallExternalID: nullableText(call.callExternalId, 120),
      CallDateTime: iso(call.callDateTime),
      CallAssignment: nullableText(call.callAssignment, 40),
      CallType: nullableText(call.callType, 40),
      ProcedureCode: visitProcedure || nullableText(call.procedureCode, 120),
      PatientIdentifierOnCall: nullableText(call.patientIdentifierOnCall, 120),
      MobileLogin: nullableText(call.mobileLogin, 120),
      VisitLocationType: visitLocation || nullableText(call.visitLocationType, 5),
      CallLatitude: call.latitude == null ? null : Number(call.latitude),
      CallLongitude: call.longitude == null ? null : Number(call.longitude),
      TelephonyPIN: nullableText(call.telephonyPin, 120),
      OriginatingPhoneNumber: nullableText(call.originatingPhoneNumber, 80),
    })),
    VisitChanges: changes.map((change) => ({
      SequenceID: change.appliesToSequenceId == null ? sequenceId : String(change.appliesToSequenceId),
      ChangeMadeByEmail: nullableText(change.changeMadeByEmail, 320),
      ChangeDateTime: iso(change.changeDateTime),
      ReasonCode: nullableText(change.reasonCode, 20) || '99',
      ChangeReasonMemo: nullableText(change.changeReasonMemo, 256),
    })),
  };
}

export async function appendSpireEvvTransmissionEvent(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    transmissionId: string;
    eventType: string;
    status: string;
    transactionId?: string | null;
    reason?: string | null;
    response?: unknown;
    actorUserId?: string | null;
  },
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireEvvTransmissionEvent"(
       "organizationId","transmissionId","eventType","status","transactionId","reason","response","actorUserId"
     ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    input.organizationId,
    input.transmissionId,
    input.eventType,
    input.status,
    input.transactionId ?? null,
    input.reason ?? null,
    JSON.stringify(input.response ?? {}),
    input.actorUserId ?? null,
  );
}
