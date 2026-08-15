import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: unknown;
  email?: string;
  legalEntityId?: string;
};

type Dependencies = {
  authOf: (response: express.Response) => AuthContext;
};

const orderRoles = new Set([
  'ADMINISTRATOR', 'PROGRAM_MANAGER', 'CEO', 'DOO', 'DELEGATING_NURSE', 'RN', 'LPN',
]);

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const scaleRowSchema = z.object({
  min: z.coerce.number().finite(),
  max: z.coerce.number().finite(),
  dose: z.coerce.number().min(0).finite(),
  doseUnit: z.string().trim().max(40).default('units'),
  instruction: z.string().trim().max(500).optional(),
});
const linkedRuleSchema = z.object({
  relation: z.enum(['ALTERNATIVE_DOSE', 'SEQUENTIAL', 'SHARED_LIMIT', 'RELATED']).default('RELATED'),
  indication: z.string().trim().max(500).optional(),
  severity: z.string().trim().max(120).optional(),
  sharedMinIntervalHours: z.coerce.number().positive().max(168).optional(),
  sharedMaxDosesPer24Hours: z.coerce.number().int().positive().max(48).optional(),
  sharedMaxDailyDoseAmount: z.coerce.number().positive().max(1_000_000).optional(),
  note: z.string().trim().max(1_000).optional(),
}).default({ relation: 'RELATED' });

const orderSchema = z.object({
  clientId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(250),
  activeIngredient: z.string().trim().max(250).optional(),
  dose: z.string().trim().min(1).max(160),
  doseAmount: z.coerce.number().positive().max(1_000_000).optional(),
  doseUnit: z.string().trim().max(40).optional(),
  route: z.string().trim().min(1).max(80),
  scheduleMode: z.enum(['SCHEDULED', 'PRN', 'DAYS_OF_WEEK', 'ONE_TIME', 'CONTINUOUS', 'CUSTOM']).default('SCHEDULED'),
  frequencyCode: z.enum(['ONCE_DAILY', 'BID', 'TID', 'QID', 'EVERY_N_HOURS', 'CUSTOM_TIMES', 'PRN', 'DAYS_OF_WEEK', 'ONE_TIME', 'CONTINUOUS']).default('CUSTOM_TIMES'),
  frequency: z.string().trim().min(1).max(160),
  dueTimes: z.array(timeSchema).max(24).default([]),
  intervalHours: z.coerce.number().positive().max(168).optional(),
  daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
  prnReason: z.string().trim().max(1_000).optional(),
  maxDosesPer24Hours: z.coerce.number().int().positive().max(48).optional(),
  maxDailyDoseMg: z.coerce.number().positive().max(1_000_000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  instructions: z.string().trim().max(8_000).optional(),
  administrationDetails: z.record(z.unknown()).default({}),
  holdParameters: z.array(z.record(z.unknown())).max(25).default([]),
  slidingScale: z.array(scaleRowSchema).max(50).default([]),
  linkedOrderGroupId: z.string().trim().max(120).optional(),
  linkedOrderRule: linkedRuleSchema,
  prescriberName: z.string().trim().max(250).optional(),
  prescriberCredentials: z.string().trim().max(120).optional(),
  prescriberOrderDate: z.coerce.date().optional(),
  orderSource: z.enum(['ELECTRONIC', 'WRITTEN', 'VERBAL', 'TELEPHONE', 'FAX', 'HOSPITAL_DISCHARGE', 'OTHER']).optional(),
  changeReason: z.string().trim().max(1_000).optional(),
});

const statusSchema = z.object({
  status: z.enum(['ACTIVE', 'HELD', 'DISCONTINUED', 'COMPLETED']),
  reason: z.string().trim().min(1).max(1_000),
});

const safetySchema = z.object({
  clientId: z.string().trim().min(1),
  medicationOrderId: z.string().trim().min(1),
  scheduledFor: z.coerce.date().optional(),
  status: z.enum(['GIVEN', 'PRN_GIVEN', 'REFUSED', 'HELD', 'NOT_GIVEN', 'MISSED']).default('GIVEN'),
  administeredDose: z.string().trim().max(160).optional(),
  administeredRoute: z.string().trim().max(80).optional(),
  prnIndication: z.string().trim().max(1_000).optional(),
  bloodGlucose: z.coerce.number().finite().min(0).max(2_000).optional(),
});

type Issue = { severity: 'INFO' | 'WARNING' | 'BLOCK'; code: string; message: string };

const roleOf = (auth: AuthContext) => String(auth.role || '').toUpperCase();
const ensureOrderAccess = (auth: AuthContext) => {
  if (!orderRoles.has(roleOf(auth))) {
    throw Object.assign(new Error('Medication order entry requires an authorized nurse or administrator role.'), { status: 403 });
  }
};

const jsonArray = <T = unknown>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const jsonObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const firstNumber = (value: unknown) => {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const unique = <T>(values: T[]) => Array.from(new Set(values));
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function validateStructuredOrder(input: z.infer<typeof orderSchema>) {
  const problems: string[] = [];
  const times = unique(input.dueTimes);
  if (times.length !== input.dueTimes.length) problems.push('Administration times must not contain duplicates.');
  if (input.endDate && input.endDate < input.startDate) problems.push('End date cannot be before start date.');

  const expectedCounts: Record<string, number> = { ONCE_DAILY: 1, BID: 2, TID: 3, QID: 4, ONE_TIME: 1 };
  const expected = expectedCounts[input.frequencyCode];
  if (expected && times.length !== expected) problems.push(`${input.frequencyCode.replaceAll('_', ' ')} requires exactly ${expected} administration time${expected === 1 ? '' : 's'}.`);
  if (['SCHEDULED', 'DAYS_OF_WEEK', 'CUSTOM'].includes(input.scheduleMode) && !times.length) problems.push('Scheduled orders require at least one administration time.');
  if (input.scheduleMode === 'DAYS_OF_WEEK' && !unique(input.daysOfWeek).length) problems.push('Choose at least one day of the week.');
  if (input.scheduleMode === 'PRN') {
    if (!input.intervalHours) problems.push('PRN orders require a minimum interval between doses.');
    if (!input.prnReason) problems.push('PRN orders require an indication/reason.');
  }
  if (input.frequencyCode === 'EVERY_N_HOURS' && !input.intervalHours) problems.push('Every-N-hours orders require the number of hours.');
  if (input.maxDailyDoseMg && input.doseAmount && String(input.doseUnit || '').toLowerCase() === 'mg' && input.maxDailyDoseMg < input.doseAmount) {
    problems.push('Maximum daily dose cannot be lower than a single ordered dose.');
  }

  const scale = input.slidingScale.slice().sort((a, b) => a.min - b.min);
  for (let index = 0; index < scale.length; index += 1) {
    if (scale[index].max < scale[index].min) problems.push(`Sliding-scale row ${index + 1} has a maximum below its minimum.`);
    if (index > 0 && scale[index].min <= scale[index - 1].max) problems.push(`Sliding-scale rows ${index} and ${index + 1} overlap.`);
  }
  return unique(problems);
}

async function getOrder(prisma: PrismaClient, auth: AuthContext, orderId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireMedicationOrder" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    auth.organizationId,
    orderId,
  );
  const order = rows[0];
  if (!order) throw Object.assign(new Error('Medication order not found.'), { status: 404 });
  return order;
}

async function snapshotRevision(
  prisma: PrismaClient,
  auth: AuthContext,
  order: Record<string, unknown>,
  changeType: string,
  changeReason?: string,
) {
  const revision = Number(order.revision || 1);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireMedicationOrderRevision"
       ("organizationId","clientId","medicationOrderId","revision","snapshot","changeType","changeReason","changedByUserId")
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
     ON CONFLICT ("medicationOrderId","revision") DO NOTHING`,
    auth.organizationId,
    String(order.clientId),
    String(order.id),
    revision,
    JSON.stringify(order),
    changeType,
    changeReason ?? null,
    auth.userId,
  );
}

async function recordSafety(
  prisma: PrismaClient,
  auth: AuthContext,
  clientId: string,
  medicationOrderId: string | null,
  action: 'ORDER_VALIDATION' | 'MAR_PREFLIGHT' | 'OVERRIDE_ACKNOWLEDGED' | 'ORDER_CHANGED',
  issues: Issue[],
  context: Record<string, unknown>,
) {
  const material = issues.filter((issue) => issue.severity !== 'INFO');
  for (const issue of material) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireMedicationSafetyEvent"
         ("organizationId","clientId","medicationOrderId","actorUserId","severity","code","message","action","context")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      auth.organizationId,
      clientId,
      medicationOrderId,
      auth.userId,
      issue.severity,
      issue.code,
      issue.message,
      action,
      JSON.stringify(context),
    );
  }
}

function scheduleTimes(input: z.infer<typeof orderSchema>) {
  if (input.scheduleMode === 'PRN' || input.scheduleMode === 'CONTINUOUS') return [];
  if (input.frequencyCode !== 'EVERY_N_HOURS') return unique(input.dueTimes).sort();
  const interval = Number(input.intervalHours || 0);
  if (!interval) return unique(input.dueTimes).sort();
  const start = input.dueTimes[0] || '00:00';
  const [hour, minute] = start.split(':').map(Number);
  const startMinutes = hour * 60 + minute;
  const result: string[] = [];
  for (let total = startMinutes; total < startMinutes + 24 * 60; total += interval * 60) {
    const within = total % (24 * 60);
    result.push(`${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`);
    if (result.length >= 24) break;
  }
  return unique(result).sort();
}

async function generateFutureAdministrations(
  prisma: PrismaClient,
  auth: AuthContext,
  orderId: string,
  input: z.infer<typeof orderSchema>,
) {
  await prisma.$executeRawUnsafe(
    `DELETE FROM "SpireMedicationAdministration"
     WHERE "organizationId"=$1 AND "medicationOrderId"=$2
       AND "scheduledFor" >= NOW() AND "status" IN ('SCHEDULED','DUE')`,
    auth.organizationId,
    orderId,
  );

  const dueTimes = scheduleTimes(input);
  if (!dueTimes.length) return;
  const startDate = input.startDate.toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 30 * 86_400_000);
  const end = input.endDate && input.endDate < horizon ? input.endDate : horizon;
  const endDate = input.scheduleMode === 'ONE_TIME' ? startDate : end.toISOString().slice(0, 10);
  const days = input.scheduleMode === 'DAYS_OF_WEEK' ? unique(input.daysOfWeek) : [];

  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireMedicationAdministration"
       ("id","organizationId","clientId","medicationOrderId","scheduledFor","status","createdAt","updatedAt")
     SELECT gen_random_uuid()::text, $1, $2, $3,
            (d::date + t::time) AT TIME ZONE COALESCE($8, 'America/New_York'),
            'SCHEDULED', NOW(), NOW()
     FROM generate_series($4::date, $5::date, INTERVAL '1 day') d
     CROSS JOIN unnest($6::text[]) t
     WHERE ($7::jsonb = '[]'::jsonb OR EXTRACT(DOW FROM d)::int IN (
       SELECT value::int FROM jsonb_array_elements_text($7::jsonb)
     ))
     ON CONFLICT ("medicationOrderId","scheduledFor") DO NOTHING`,
    auth.organizationId,
    input.clientId,
    orderId,
    startDate,
    endDate,
    dueTimes,
    JSON.stringify(days),
    process.env.SPIRE_TIME_ZONE || 'America/New_York',
  );
}

async function orderWarnings(prisma: PrismaClient, auth: AuthContext, input: z.infer<typeof orderSchema>, excludeOrderId?: string) {
  const issues: Issue[] = [];
  const ingredient = norm(input.activeIngredient || input.name);
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT "id","name","activeIngredient","dose","route","frequency","linkedOrderGroupId"
     FROM "SpireMedicationOrder"
     WHERE "organizationId"=$1 AND "clientId"=$2 AND "status"='ACTIVE'
       AND ($3::text IS NULL OR "id"<>$3)`,
    auth.organizationId,
    input.clientId,
    excludeOrderId ?? null,
  );
  for (const row of rows) {
    const otherIngredient = norm(row.activeIngredient || row.name);
    if (ingredient && otherIngredient && ingredient === otherIngredient) {
      issues.push({
        severity: 'WARNING',
        code: 'DUPLICATE_ACTIVE_INGREDIENT',
        message: `Another active order (${row.name}) appears to contain the same active ingredient. Review cumulative dosing and whether both orders are intended.`,
      });
    }
  }
  if (input.linkedOrderGroupId && !input.linkedOrderRule.indication) {
    issues.push({ severity: 'WARNING', code: 'LINKED_ORDER_NO_INDICATION', message: 'This order is linked to another order but does not define its indication/use case.' });
  }
  if (input.maxDosesPer24Hours == null && input.scheduleMode === 'PRN') {
    issues.push({ severity: 'WARNING', code: 'PRN_NO_DAILY_DOSE_COUNT_LIMIT', message: 'The PRN order has no maximum number of doses per 24 hours. Confirm whether the prescriber intended a daily limit.' });
  }
  if (input.slidingScale.length && input.maxDosesPer24Hours == null && input.scheduleMode === 'PRN') {
    issues.push({ severity: 'WARNING', code: 'SLIDING_SCALE_PRN_NO_DAILY_LIMIT', message: 'The sliding-scale PRN order has no maximum administration count per 24 hours.' });
  }
  return issues;
}

function orderResponse(row: Record<string, unknown>) {
  return {
    ...row,
    dueTimes: jsonArray(row.dueTimes),
    daysOfWeek: jsonArray(row.daysOfWeek),
    slidingScale: jsonArray(row.slidingScale),
    holdParameters: jsonArray(row.holdParameters),
    administrationDetails: jsonObject(row.administrationDetails),
    linkedOrderRule: jsonObject(row.linkedOrderRule),
  };
}

export const registerMedicationSafetyRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  dependencies: Dependencies,
) => {
  const { authOf } = dependencies;

  app.get('/api/spire/medication-orders-v2/clients/:clientId', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureOrderAccess(auth);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireMedicationOrder"
         WHERE "organizationId"=$1 AND "clientId"=$2
         ORDER BY CASE "status" WHEN 'ACTIVE' THEN 0 WHEN 'HELD' THEN 1 ELSE 2 END, "createdAt" DESC`,
        auth.organizationId,
        req.params.clientId,
      );
      res.json({ data: rows.map(orderResponse) });
    } catch (error) { next(error); }
  });

  app.get('/api/spire/medication-orders-v2/:orderId', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureOrderAccess(auth);
      res.json({ data: orderResponse(await getOrder(prisma, auth, req.params.orderId)) });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/medication-orders-v2/validate', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureOrderAccess(auth);
      const input = orderSchema.parse(req.body);
      const structural = validateStructuredOrder(input);
      const issues: Issue[] = structural.map((message) => ({ severity: 'BLOCK', code: 'ORDER_STRUCTURE', message }));
      issues.push(...await orderWarnings(prisma, auth, input, typeof req.body?.orderId === 'string' ? req.body.orderId : undefined));
      await recordSafety(prisma, auth, input.clientId, typeof req.body?.orderId === 'string' ? req.body.orderId : null, 'ORDER_VALIDATION', issues, { frequencyCode: input.frequencyCode, scheduleMode: input.scheduleMode });
      res.json({ data: { issues, canSave: !issues.some((issue) => issue.severity === 'BLOCK') } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/medication-orders-v2', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureOrderAccess(auth);
      const input = orderSchema.parse(req.body);
      const structural = validateStructuredOrder(input);
      if (structural.length) throw Object.assign(new Error(structural.join(' ')), { status: 400 });
      const id = randomUUID();
      const dueTimes = scheduleTimes(input);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireMedicationOrder"
          ("id","organizationId","clientId","name","activeIngredient","dose","doseAmount","doseUnit","route","frequency","frequencyCode","scheduleMode","dueTimes","intervalHours","daysOfWeek","prnReason","maxDosesPer24Hours","maxDailyDoseMg","startDate","endDate","instructions","administrationDetails","holdParameters","slidingScale","linkedOrderGroupId","linkedOrderRule","prescriberName","prescriberCredentials","prescriberOrderDate","orderSource","status","orderedByUserId","lastModifiedByUserId","revision","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,$24::jsonb,$25,$26::jsonb,$27,$28,$29,$30,'ACTIVE',$31,$31,1,NOW(),NOW())`,
        id, auth.organizationId, input.clientId, input.name, input.activeIngredient ?? null, input.dose,
        input.doseAmount ?? null, input.doseUnit ?? null, input.route, input.frequency, input.frequencyCode,
        input.scheduleMode, JSON.stringify(dueTimes), input.intervalHours ?? null, JSON.stringify(unique(input.daysOfWeek)),
        input.prnReason ?? null, input.maxDosesPer24Hours ?? null, input.maxDailyDoseMg ?? null,
        input.startDate, input.endDate ?? null, input.instructions ?? null, JSON.stringify(input.administrationDetails),
        JSON.stringify(input.holdParameters), JSON.stringify(input.slidingScale), input.linkedOrderGroupId ?? null,
        JSON.stringify(input.linkedOrderRule), input.prescriberName ?? null, input.prescriberCredentials ?? null,
        input.prescriberOrderDate ?? null, input.orderSource ?? null, auth.userId,
      );
      await generateFutureAdministrations(prisma, auth, id, { ...input, dueTimes });
      const created = await getOrder(prisma, auth, id);
      await snapshotRevision(prisma, auth, created, 'CREATED', input.changeReason);
      const warnings = await orderWarnings(prisma, auth, input, id);
      await recordSafety(prisma, auth, input.clientId, id, 'ORDER_CHANGED', warnings, { changeType: 'CREATED' });
      res.status(201).json({ data: { order: orderResponse(created), warnings } });
    } catch (error) { next(error); }
  });

  app.patch('/api/spire/medication-orders-v2/:orderId', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureOrderAccess(auth);
      const existing = await getOrder(prisma, auth, req.params.orderId);
      const input = orderSchema.parse({ ...req.body, clientId: String(existing.clientId) });
      const structural = validateStructuredOrder(input);
      if (structural.length) throw Object.assign(new Error(structural.join(' ')), { status: 400 });
      const nextRevision = Number(existing.revision || 1) + 1;
      const dueTimes = scheduleTimes(input);
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireMedicationOrder" SET
          "name"=$3,"activeIngredient"=$4,"dose"=$5,"doseAmount"=$6,"doseUnit"=$7,"route"=$8,
          "frequency"=$9,"frequencyCode"=$10,"scheduleMode"=$11,"dueTimes"=$12::jsonb,"intervalHours"=$13,
          "daysOfWeek"=$14::jsonb,"prnReason"=$15,"maxDosesPer24Hours"=$16,"maxDailyDoseMg"=$17,
          "startDate"=$18,"endDate"=$19,"instructions"=$20,"administrationDetails"=$21::jsonb,
          "holdParameters"=$22::jsonb,"slidingScale"=$23::jsonb,"linkedOrderGroupId"=$24,"linkedOrderRule"=$25::jsonb,
          "prescriberName"=$26,"prescriberCredentials"=$27,"prescriberOrderDate"=$28,"orderSource"=$29,
          "lastModifiedByUserId"=$30,"revision"=$31,"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "id"=$2`,
        auth.organizationId, req.params.orderId, input.name, input.activeIngredient ?? null, input.dose,
        input.doseAmount ?? null, input.doseUnit ?? null, input.route, input.frequency, input.frequencyCode,
        input.scheduleMode, JSON.stringify(dueTimes), input.intervalHours ?? null, JSON.stringify(unique(input.daysOfWeek)),
        input.prnReason ?? null, input.maxDosesPer24Hours ?? null, input.maxDailyDoseMg ?? null,
        input.startDate, input.endDate ?? null, input.instructions ?? null, JSON.stringify(input.administrationDetails),
        JSON.stringify(input.holdParameters), JSON.stringify(input.slidingScale), input.linkedOrderGroupId ?? null,
        JSON.stringify(input.linkedOrderRule), input.prescriberName ?? null, input.prescriberCredentials ?? null,
        input.prescriberOrderDate ?? null, input.orderSource ?? null, auth.userId, nextRevision,
      );
      await generateFutureAdministrations(prisma, auth, req.params.orderId, { ...input, dueTimes });
      const updated = await getOrder(prisma, auth, req.params.orderId);
      await snapshotRevision(prisma, auth, updated, 'CHANGED', input.changeReason || 'Medication order edited');
      const warnings = await orderWarnings(prisma, auth, input, req.params.orderId);
      await recordSafety(prisma, auth, input.clientId, req.params.orderId, 'ORDER_CHANGED', warnings, { changeType: 'CHANGED', revision: nextRevision });
      res.json({ data: { order: orderResponse(updated), warnings } });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/medication-orders-v2/:orderId/status', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureOrderAccess(auth);
      const input = statusSchema.parse(req.body);
      const existing = await getOrder(prisma, auth, req.params.orderId);
      const nextRevision = Number(existing.revision || 1) + 1;
      await prisma.$executeRawUnsafe(
        `UPDATE "SpireMedicationOrder" SET
          "status"=$3,
          "holdReason"=CASE WHEN $3='HELD' THEN $4 ELSE "holdReason" END,
          "discontinueReason"=CASE WHEN $3='DISCONTINUED' THEN $4 ELSE "discontinueReason" END,
          "lastModifiedByUserId"=$5,"revision"=$6,"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "id"=$2`,
        auth.organizationId, req.params.orderId, input.status, input.reason, auth.userId, nextRevision,
      );
      if (input.status !== 'ACTIVE') {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "SpireMedicationAdministration"
           WHERE "organizationId"=$1 AND "medicationOrderId"=$2 AND "scheduledFor">=NOW()
             AND "status" IN ('SCHEDULED','DUE')`,
          auth.organizationId, req.params.orderId,
        );
      }
      const updated = await getOrder(prisma, auth, req.params.orderId);
      await snapshotRevision(prisma, auth, updated, input.status, input.reason);
      res.json({ data: orderResponse(updated) });
    } catch (error) { next(error); }
  });

  app.post('/api/spire/medication-safety/check', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureOrderAccess(auth);
      const input = safetySchema.parse(req.body);
      const order = await getOrder(prisma, auth, input.medicationOrderId);
      if (String(order.clientId) !== input.clientId) throw Object.assign(new Error('Medication order does not belong to this client.'), { status: 400 });
      const issues: Issue[] = [];
      let recommendedDose: number | null = null;
      const giving = input.status === 'GIVEN' || input.status === 'PRN_GIVEN';
      const now = new Date();
      const startDate = new Date(String(order.startDate));
      const endDate = order.endDate ? new Date(String(order.endDate)) : null;

      if (giving && String(order.status) !== 'ACTIVE') issues.push({ severity: 'BLOCK', code: 'ORDER_NOT_ACTIVE', message: `This medication order is ${String(order.status).toLowerCase()} and cannot be recorded as given.` });
      if (giving && !Number.isNaN(startDate.getTime()) && now < startDate) issues.push({ severity: 'BLOCK', code: 'ORDER_NOT_STARTED', message: 'The medication order has not reached its start date.' });
      if (giving && endDate && !Number.isNaN(endDate.getTime()) && now > new Date(endDate.getTime() + 86_399_999)) issues.push({ severity: 'BLOCK', code: 'ORDER_ENDED', message: 'The medication order has passed its end date.' });
      if (giving && input.administeredRoute && order.route && norm(input.administeredRoute) !== norm(order.route)) issues.push({ severity: 'WARNING', code: 'ROUTE_MISMATCH', message: `Entered route (${input.administeredRoute}) differs from ordered route (${order.route}).` });

      const prior = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT a."id",a."scheduledFor",a."administeredAt",a."status",to_jsonb(a) AS "record"
         FROM "SpireMedicationAdministration" a
         WHERE a."organizationId"=$1 AND a."medicationOrderId"=$2
           AND COALESCE(a."administeredAt",a."scheduledFor") >= NOW() - INTERVAL '24 hours'
         ORDER BY COALESCE(a."administeredAt",a."scheduledFor") DESC`,
        auth.organizationId, input.medicationOrderId,
      );
      const given = prior.filter((row) => String(row.status).toUpperCase() === 'GIVEN');
      const maxCount = order.maxDosesPer24Hours == null ? null : Number(order.maxDosesPer24Hours);
      if (giving && maxCount && given.length >= maxCount) issues.push({ severity: 'BLOCK', code: 'MAX_DOSES_24H', message: `The order allows no more than ${maxCount} dose${maxCount === 1 ? '' : 's'} in 24 hours, and that limit has already been reached.` });

      const intervalHours = order.intervalHours == null ? null : Number(order.intervalHours);
      if (giving && intervalHours && given[0]?.administeredAt) {
        const hours = (now.getTime() - new Date(String(given[0].administeredAt)).getTime()) / 3_600_000;
        if (hours < intervalHours) issues.push({ severity: 'BLOCK', code: 'TOO_SOON', message: `The last documented dose was ${hours.toFixed(1)} hours ago. This order requires at least ${intervalHours} hours between doses.` });
      }
      if (String(order.scheduleMode) === 'PRN' && giving && !input.prnIndication) issues.push({ severity: 'BLOCK', code: 'PRN_INDICATION_REQUIRED', message: `Document the PRN indication before administration${order.prnReason ? ` (${order.prnReason})` : ''}.` });

      const scale = jsonArray<{ min: number; max: number; dose: number; doseUnit?: string }>(order.slidingScale).slice().sort((a, b) => Number(a.min) - Number(b.min));
      if (giving && scale.length) {
        if (input.bloodGlucose == null) {
          issues.push({ severity: 'BLOCK', code: 'GLUCOSE_REQUIRED', message: 'This sliding-scale insulin order requires the current blood glucose value before administration.' });
        } else {
          const matched = scale.find((row) => input.bloodGlucose! >= Number(row.min) && input.bloodGlucose! <= Number(row.max));
          if (!matched) issues.push({ severity: 'BLOCK', code: 'GLUCOSE_OUTSIDE_SCALE', message: `Blood glucose ${input.bloodGlucose} is not covered by the ordered sliding scale. Follow the prescriber notification instructions.` });
          else {
            recommendedDose = Number(matched.dose);
            const entered = firstNumber(input.administeredDose);
            if (entered == null) issues.push({ severity: 'BLOCK', code: 'SLIDING_SCALE_DOSE_REQUIRED', message: `The ordered sliding-scale dose is ${recommendedDose} ${matched.doseUnit || 'units'}. Enter the dose to be administered.` });
            else if (Math.abs(entered - recommendedDose) > 0.0001) issues.push({ severity: 'BLOCK', code: 'SLIDING_SCALE_DOSE_MISMATCH', message: `For blood glucose ${input.bloodGlucose}, the ordered sliding-scale dose is ${recommendedDose} ${matched.doseUnit || 'units'}, not ${entered}.` });
          }
        }
      }

      const maxDailyDoseMg = order.maxDailyDoseMg == null ? null : Number(order.maxDailyDoseMg);
      if (giving && maxDailyDoseMg) {
        const currentDose = firstNumber(input.administeredDose) ?? Number(order.doseAmount || 0);
        let total = 0;
        for (const row of given) {
          const record = jsonObject(row.record);
          total += firstNumber(record.administeredDose) ?? Number(order.doseAmount || 0);
        }
        if (currentDose > 0 && total + currentDose > maxDailyDoseMg) issues.push({ severity: 'BLOCK', code: 'MAX_DAILY_DOSE', message: `This administration would exceed the order-defined maximum daily dose of ${maxDailyDoseMg} mg.` });
      }

      const linkedGroupId = String(order.linkedOrderGroupId || '');
      const linkedRule = jsonObject(order.linkedOrderRule);
      if (giving && linkedGroupId) {
        const linked = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT o."id",o."name",a."administeredAt",a."status",to_jsonb(a) AS "record"
           FROM "SpireMedicationOrder" o
           JOIN "SpireMedicationAdministration" a ON a."medicationOrderId"=o."id"
           WHERE o."organizationId"=$1 AND o."clientId"=$2 AND o."linkedOrderGroupId"=$3
             AND a."status"='GIVEN' AND a."administeredAt">=NOW()-INTERVAL '24 hours'
           ORDER BY a."administeredAt" DESC`,
          auth.organizationId, input.clientId, linkedGroupId,
        );
        const sharedMaxCount = Number(linkedRule.sharedMaxDosesPer24Hours || 0);
        if (sharedMaxCount && linked.length >= sharedMaxCount) issues.push({ severity: 'BLOCK', code: 'LINKED_GROUP_MAX_DOSES', message: `The linked medication group has already reached its shared limit of ${sharedMaxCount} administrations in 24 hours.` });
        const sharedInterval = Number(linkedRule.sharedMinIntervalHours || 0);
        if (sharedInterval && linked[0]?.administeredAt) {
          const elapsed = (now.getTime() - new Date(String(linked[0].administeredAt)).getTime()) / 3_600_000;
          if (elapsed < sharedInterval) issues.push({ severity: 'BLOCK', code: 'LINKED_GROUP_TOO_SOON', message: `A linked alternative (${linked[0].name}) was given ${elapsed.toFixed(1)} hours ago; the linked-order rule requires ${sharedInterval} hours between alternatives.` });
        }
      }

      if (giving && input.scheduledFor) {
        const duplicate = prior.find((row) => String(row.status).toUpperCase() === 'GIVEN' && Math.abs(new Date(String(row.scheduledFor)).getTime() - input.scheduledFor!.getTime()) < 60_000);
        if (duplicate) issues.push({ severity: 'BLOCK', code: 'ALREADY_GIVEN_FOR_SLOT', message: 'A Given administration is already documented for this scheduled dose.' });
      }

      await recordSafety(prisma, auth, input.clientId, input.medicationOrderId, 'MAR_PREFLIGHT', issues, { ...input, bloodGlucose: input.bloodGlucose ?? null, recommendedDose });
      res.json({
        data: {
          safeToProceed: !issues.some((issue) => issue.severity === 'BLOCK'),
          requiresAcknowledgement: issues.some((issue) => issue.severity === 'WARNING'),
          issues,
          recommendedDose,
          order: orderResponse(order),
        },
      });
    } catch (error) { next(error); }
  });
};
