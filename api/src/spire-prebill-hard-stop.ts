import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { evaluateSpireEvvPrebill, recordSpireEvvPrebillDecision } from './spire-evv-prebill.js';
import { evaluateSpireDoddBilling, recordSpireDoddBillingDecision } from './spire-dodd-billing-rules.js';

export type RevenuePrebillStage = 'BATCH_FINALIZE' | 'CLAIM_GENERATE' | 'CLAIM_DOWNLOAD' | 'CLAIM_HANDOFF' | 'CSV_EXPORT';
export type RevenuePrebillEventDecision = {
  serviceEventId: string;
  ready: boolean;
  blockers: string[];
  evv: Awaited<ReturnType<typeof evaluateSpireEvvPrebill>>;
  dodd: Awaited<ReturnType<typeof evaluateSpireDoddBilling>>;
  evidence: Record<string, unknown>;
};
export type RevenuePrebillBatchDecision = {
  ready: boolean;
  code: 'PASS' | 'BLOCK';
  stage: RevenuePrebillStage;
  batchId: string;
  batchStatus: string;
  blockers: string[];
  events: RevenuePrebillEventDecision[];
  fingerprint: string;
};

type Input = {
  organizationId: string;
  legalEntityId: string;
  batchId: string;
  stage: RevenuePrebillStage;
  actorUserId?: string;
  recordDecisions?: boolean;
  expectedFingerprint?: string | null;
};

const clean = (value: unknown, max = 5000) => String(value ?? '').trim().slice(0, max);
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !['stage', 'createdAt', 'updatedAt'].includes(key))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, stable(child)]),
  );
  return value;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const httpError = (status: number, message: string, details?: unknown) => Object.assign(new Error(message), { status, details });

function basicEventBlockers(event: Record<string, unknown>) {
  const blockers: string[] = [];
  if (event.trainingOnly === true) blockers.push('Training-only service events cannot be billed.');
  if (event.billable !== true) blockers.push('Service event is not marked billable.');
  if (!event.patientId) blockers.push('Patient/client is not linked.');
  if (!event.serviceDate) blockers.push('Service date is missing.');
  if (!clean(event.serviceCode, 120)) blockers.push('Service code is missing.');
  const units = Number(event.units);
  if (!Number.isFinite(units) || units <= 0) blockers.push('Billable units must be greater than zero.');
  return blockers;
}

export async function evaluateRevenuePrebillBatch(prisma: PrismaClient, input: Input): Promise<RevenuePrebillBatchDecision> {
  const batchRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "RevenueCycleBatch" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,
    input.organizationId, input.legalEntityId, input.batchId,
  );
  const batch = batchRows[0];
  if (!batch) throw httpError(404, 'Revenue batch was not found');
  const batchStatus = clean(batch.status, 40).toUpperCase();
  const allowed = input.stage === 'BATCH_FINALIZE' ? new Set(['DRAFT'])
    : input.stage === 'CSV_EXPORT' || input.stage === 'CLAIM_DOWNLOAD' ? new Set(['FINALIZED', 'EXPORTED'])
      : new Set(['FINALIZED']);
  const batchBlockers: string[] = [];
  if (!allowed.has(batchStatus)) batchBlockers.push(`Batch status ${batchStatus || 'UNKNOWN'} is not valid for ${input.stage}.`);

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT e.* FROM "RevenueCycleBatchLine" l
      JOIN "RevenueCycleServiceEvent" e ON e."id"=l."serviceEventId"
      WHERE l."organizationId"=$1 AND l."legalEntityId"=$2 AND l."batchId"=$3
      ORDER BY e."serviceDate",e."createdAt"`,
    input.organizationId, input.legalEntityId, input.batchId,
  );
  if (!rows.length) batchBlockers.push('Revenue batch contains no service events.');

  const eventDecisions: RevenuePrebillEventDecision[] = [];
  for (const event of rows) {
    const eventId = clean(event.id, 160);
    const blockers = basicEventBlockers(event);
    const allowedEventStatuses = input.stage === 'CSV_EXPORT' || input.stage === 'CLAIM_DOWNLOAD'
      ? new Set(['BATCHED', 'EXPORTED']) : new Set(['BATCHED']);
    const eventStatus = clean(event.status, 40).toUpperCase();
    if (!allowedEventStatuses.has(eventStatus)) blockers.push(`Service event status ${eventStatus || 'UNKNOWN'} is not valid for ${input.stage}.`);

    const evv = await evaluateSpireEvvPrebill(prisma, {
      organizationId: input.organizationId, legalEntityId: input.legalEntityId, event,
    });
    const dodd = await evaluateSpireDoddBilling(prisma, {
      organizationId: input.organizationId, legalEntityId: input.legalEntityId, event,
    });
    if (evv.required && !evv.ready) blockers.push(...evv.errors.map((error) => `EVV: ${error}`));
    if (dodd.required && !dodd.ready) blockers.push(...dodd.blockers.map((error: string) => `Billing rule: ${error}`));

    if (input.recordDecisions && input.actorUserId) {
      if (evv.required) await recordSpireEvvPrebillDecision(prisma, {
        organizationId: input.organizationId, legalEntityId: input.legalEntityId,
        actorUserId: input.actorUserId, action: 'BATCH', decision: evv,
      });
      if (dodd.required) await recordSpireDoddBillingDecision(prisma, {
        organizationId: input.organizationId, legalEntityId: input.legalEntityId,
        actorUserId: input.actorUserId, action: 'BATCH', decision: dodd,
      });
    }

    const deduped = unique(blockers);
    eventDecisions.push({
      serviceEventId: eventId,
      ready: deduped.length === 0,
      blockers: deduped,
      evv,
      dodd,
      evidence: {
        status: event.status ?? null,
        billable: event.billable === true,
        trainingOnly: event.trainingOnly === true,
        patientId: event.patientId ?? null,
        serviceDate: event.serviceDate ?? null,
        serviceCode: event.serviceCode ?? null,
        units: event.units ?? null,
        unitType: event.unitType ?? null,
        authorizationId: event.authorizationId ?? null,
        estimatedAmount: event.estimatedAmount ?? null,
      },
    });
  }

  const blockers = unique([
    ...batchBlockers,
    ...eventDecisions.flatMap((decision) => decision.blockers.map((blocker) => `${decision.serviceEventId}: ${blocker}`)),
  ]);
  const fingerprintEvidence = {
    batchId: input.batchId,
    batchStatus,
    events: eventDecisions.map((decision) => ({ serviceEventId: decision.serviceEventId, evidence: decision.evidence, evv: decision.evv, dodd: decision.dodd })),
  };
  const fingerprint = hash(fingerprintEvidence);
  const ready = blockers.length === 0;
  return { ready, code: ready ? 'PASS' : 'BLOCK', stage: input.stage, batchId: input.batchId, batchStatus, blockers, events: eventDecisions, fingerprint };
}

export async function assertRevenuePrebillBatch(prisma: PrismaClient, input: Input) {
  const decision = await evaluateRevenuePrebillBatch(prisma, input);
  if (!decision.ready) throw httpError(409, 'Revenue pre-bill hard stop failed. The batch cannot advance.', { code: 'REVENUE_PREBILL_HARD_STOP_BLOCKED', prebill: decision });
  const expected = clean(input.expectedFingerprint, 128);
  if (expected && expected !== decision.fingerprint) throw httpError(409, 'Revenue pre-bill evidence changed after claim generation. Regenerate the claim candidate before download or handoff.', {
    code: 'REVENUE_PREBILL_SNAPSHOT_STALE', expectedFingerprint: expected, currentFingerprint: decision.fingerprint, prebill: decision,
  });
  return decision;
}
