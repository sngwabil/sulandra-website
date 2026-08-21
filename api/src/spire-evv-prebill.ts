import type { PrismaClient } from '@prisma/client';
import {
  buildCanonicalOhioEvvVisitPayload,
  loadCanonicalEvvSnapshot,
  validateCanonicalEvvSnapshot,
} from './spire-evv-canonical.js';

export type SpireEvvPrebillDecision = {
  required: boolean;
  ready: boolean;
  code: 'NOT_REQUIRED' | 'PASS' | 'BLOCK';
  serviceEventId: string;
  evvVisitId: string | null;
  errors: string[];
  details: Record<string, unknown>;
};

type EvaluationInput = {
  organizationId: string;
  legalEntityId: string;
  event: Record<string, unknown>;
};

type DecisionRecordInput = {
  organizationId: string;
  legalEntityId: string;
  actorUserId: string;
  action: 'READY' | 'BATCH';
  decision: SpireEvvPrebillDecision;
};

const clean = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : String(value ?? '').trim().slice(0, max);
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const millis = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  const result = date.getTime();
  return Number.isFinite(result) ? result : null;
};
const dateKey = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const time = millis(value);
  return time === null ? '' : new Date(time).toISOString().slice(0, 10);
};
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  }
  return value;
};
const stableJson = (value: unknown) => JSON.stringify(stable(value));

export async function evaluateSpireEvvPrebill(prisma: PrismaClient, input: EvaluationInput): Promise<SpireEvvPrebillDecision> {
  const event = input.event;
  const serviceEventId = clean(event.id, 160);
  const sourceModule = clean(event.sourceModule, 80).toUpperCase();
  const sourceType = clean(event.sourceType, 160);
  const evvVisitId = sourceModule === 'SCLS' && sourceType === 'SpireEvvVisit' ? clean(event.sourceId, 160) : '';
  const required = Boolean(evvVisitId);

  if (!required) {
    return {
      required: false,
      ready: true,
      code: 'NOT_REQUIRED',
      serviceEventId,
      evvVisitId: null,
      errors: [],
      details: { reason: 'This Phase B EVV hard stop applies to SCLS Revenue Cycle events sourced from SpireEvvVisit.' },
    };
  }

  const errors: string[] = [];
  const patientId = clean(event.patientId, 160);
  if (!patientId) errors.push('Revenue service event is not linked to a client.');

  const visitRows = patientId ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT v.*,
            COALESCE(v."adjustedClockInAt",v."clockInAt") AS "effectiveStart",
            COALESCE(v."adjustedClockOutAt",v."clockOutAt") AS "effectiveEnd",
            COALESCE(v."adjustedClockInAt",v."clockInAt")::date::text AS "effectiveServiceDate",
            CASE WHEN COALESCE(v."adjustedClockOutAt",v."clockOutAt")>COALESCE(v."adjustedClockInAt",v."clockInAt")
              THEN ROUND((EXTRACT(EPOCH FROM (COALESCE(v."adjustedClockOutAt",v."clockOutAt")-COALESCE(v."adjustedClockInAt",v."clockInAt")))/900.0)::numeric,3)::float8
              ELSE NULL END AS "effectiveUnits"
       FROM "SpireEvvVisit" v
      WHERE v."organizationId"=$1 AND v."patientId"=$2 AND v."id"=$3 LIMIT 1`,
    input.organizationId, patientId, evvVisitId,
  ) : [];
  const visit = visitRows[0];
  if (!visit) {
    errors.push('The EVV visit linked to this revenue event was not found for this client.');
    return {
      required: true,
      ready: false,
      code: 'BLOCK',
      serviceEventId,
      evvVisitId,
      errors,
      details: { sourceModule, sourceType, patientId },
    };
  }

  const visitEntity = clean(visit.legalEntityId, 160);
  if (visitEntity && visitEntity !== input.legalEntityId) errors.push('EVV visit belongs to a different Sulandra legal-entity scope.');

  const eventDate = dateKey(event.serviceDate);
  const visitDate = clean(visit.effectiveServiceDate, 20);
  if (!eventDate || !visitDate || eventDate !== visitDate) errors.push('Revenue service date does not match the canonical EVV visit date.');

  const eventStart = millis(event.serviceStart);
  const eventEnd = millis(event.serviceEnd);
  const visitStart = millis(visit.effectiveStart);
  const visitEnd = millis(visit.effectiveEnd);
  if (eventStart === null || visitStart === null || Math.abs(eventStart - visitStart) > 1000) errors.push('Revenue service start does not match the canonical EVV effective clock-in time.');
  if (eventEnd === null || visitEnd === null || Math.abs(eventEnd - visitEnd) > 1000) errors.push('Revenue service end does not match the canonical EVV effective clock-out time.');

  const eventCode = clean(event.serviceCode, 120);
  const visitCode = clean(visit.procedureCode || visit.serviceCode, 120);
  if (!eventCode || !visitCode || eventCode !== visitCode) errors.push('Revenue service code does not match the canonical EVV procedure code.');

  const eventUnits = Number(event.units);
  const visitUnits = Number(visit.effectiveUnits);
  if (!Number.isFinite(eventUnits) || !Number.isFinite(visitUnits) || Math.abs(eventUnits - visitUnits) > 0.001) {
    errors.push('Revenue billable units do not match the canonical EVV visit duration.');
  }

  const metadata = object(event.metadata);
  const eventAuthorizationId = clean(event.authorizationId || metadata.authorizationId, 160);
  const visitAuthorizationId = clean(visit.authorizationId, 160);
  if (visitAuthorizationId && eventAuthorizationId !== visitAuthorizationId) errors.push('Revenue authorization does not match the EVV visit authorization.');

  let canonicalErrors: string[] = [];
  let payloadCurrent = false;
  let transmission: Record<string, unknown> | null = null;
  try {
    const snapshot = await loadCanonicalEvvSnapshot(prisma, input.organizationId, patientId, evvVisitId);
    canonicalErrors = validateCanonicalEvvSnapshot(snapshot);
    errors.push(...canonicalErrors.map((message) => `Canonical EVV: ${message}`));

    const transmissionRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "SpireEvvTransmission"
        WHERE "organizationId"=$1 AND "patientId"=$2 AND "evvVisitId"=$3 AND "environment"='PRODUCTION'
        ORDER BY "sequenceId" DESC,"createdAt" DESC LIMIT 1`,
      input.organizationId, patientId, evvVisitId,
    );
    transmission = transmissionRows[0] ?? null;
    if (!transmission) {
      errors.push('No PRODUCTION EVV transmission is recorded for this visit.');
    } else if (clean(transmission.status, 40).toUpperCase() !== 'ACCEPTED') {
      errors.push(`Latest PRODUCTION EVV transmission is ${clean(transmission.status, 40) || 'UNKNOWN'}, not ACCEPTED.`);
    } else {
      const sequenceId = clean(transmission.sequenceId, 80);
      const expectedPayload = buildCanonicalOhioEvvVisitPayload(snapshot, sequenceId);
      payloadCurrent = stableJson(expectedPayload) === stableJson(transmission.payload);
      if (!payloadCurrent) errors.push('Accepted PRODUCTION EVV payload is stale relative to the current canonical visit; queue and externally re-accept a corrected transmission.');
    }
  } catch (error) {
    errors.push(`Canonical EVV evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const deduped = unique(errors);
  const ready = deduped.length === 0;
  return {
    required: true,
    ready,
    code: ready ? 'PASS' : 'BLOCK',
    serviceEventId,
    evvVisitId,
    errors: deduped,
    details: {
      patientId,
      legalEntityId: input.legalEntityId,
      eventDate,
      visitDate,
      eventCode,
      visitCode,
      eventUnits: Number.isFinite(eventUnits) ? eventUnits : null,
      visitUnits: Number.isFinite(visitUnits) ? visitUnits : null,
      eventAuthorizationId: eventAuthorizationId || null,
      visitAuthorizationId: visitAuthorizationId || null,
      canonicalValidationErrors: canonicalErrors,
      productionTransmission: transmission ? {
        id: transmission.id,
        sequenceId: transmission.sequenceId,
        environment: transmission.environment,
        status: transmission.status,
        transactionId: transmission.transactionId,
        queuedAt: transmission.queuedAt,
        acknowledgedAt: transmission.acknowledgedAt,
        resolvedAt: transmission.resolvedAt,
      } : null,
      acceptedPayloadMatchesCurrentCanonicalVisit: payloadCurrent,
      certificationClaimed: false,
    },
  };
}

export async function recordSpireEvvPrebillDecision(prisma: PrismaClient, input: DecisionRecordInput) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireEvvPrebillDecision"(
      "organizationId","legalEntityId","serviceEventId","evvVisitId","action","required","ready","decisionCode",
      "errors","details","actorUserId"
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
    input.organizationId,
    input.legalEntityId,
    input.decision.serviceEventId,
    input.decision.evvVisitId,
    input.action,
    input.decision.required,
    input.decision.ready,
    input.decision.code,
    JSON.stringify(input.decision.errors),
    JSON.stringify(input.decision.details),
    input.actorUserId,
  );
}
