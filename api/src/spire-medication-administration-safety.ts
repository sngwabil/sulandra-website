import type { PrismaClient } from '@prisma/client';

type AdministrationInput = {
  medicationOrderId: string;
  scheduledFor?: string | null;
  status: 'GIVEN' | 'REFUSED' | 'HELD' | 'NOT_GIVEN' | 'MISSED' | 'PRN_GIVEN';
  administeredDose?: string | null;
  administeredRoute?: string | null;
  prnIndication?: string | null;
  bloodGlucose?: number | null;
};

type SafetyIssue = { code: string; message: string };

const jsonArray = <T = unknown>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const jsonObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const firstNumber = (value: unknown) => {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function assertMedicationAdministrationSafe(
  prisma: PrismaClient,
  organizationId: string,
  patientId: string,
  input: AdministrationInput,
) {
  if (!['GIVEN', 'PRN_GIVEN'].includes(input.status)) return;

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireMedicationOrder" m
     WHERE m."organizationId"=$1
       AND COALESCE(to_jsonb(m)->>'patientId',to_jsonb(m)->>'clientId')=$2
       AND m."id"=$3 LIMIT 1`,
    organizationId,
    patientId,
    input.medicationOrderId,
  );
  const order = rows[0];
  if (!order) throw Object.assign(new Error('Medication order not found for this client.'), { status: 404 });

  const issues: SafetyIssue[] = [];
  const now = new Date();
  if (String(order.status) !== 'ACTIVE') issues.push({ code: 'ORDER_NOT_ACTIVE', message: `This medication order is ${String(order.status || 'not active').toLowerCase()} and cannot be documented as given.` });
  const start = order.startDate ? new Date(String(order.startDate)) : null;
  const end = order.endDate ? new Date(String(order.endDate)) : null;
  if (start && !Number.isNaN(start.getTime()) && now < start) issues.push({ code: 'ORDER_NOT_STARTED', message: 'This medication order has not reached its start date.' });
  if (end && !Number.isNaN(end.getTime()) && now > new Date(end.getTime() + 86_399_999)) issues.push({ code: 'ORDER_ENDED', message: 'This medication order has passed its end date.' });
  if (input.administeredRoute && order.route && norm(input.administeredRoute) !== norm(order.route)) issues.push({ code: 'ROUTE_MISMATCH', message: `Entered route (${input.administeredRoute}) does not match the active order route (${order.route}).` });

  const prior = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT a.*, to_jsonb(a) AS "record"
     FROM "SpireMedicationAdministration" a
     WHERE a."organizationId"=$1 AND a."medicationOrderId"=$2
       AND COALESCE(a."administeredAt",a."scheduledFor") >= NOW()-INTERVAL '24 hours'
     ORDER BY COALESCE(a."administeredAt",a."scheduledFor") DESC`,
    organizationId,
    input.medicationOrderId,
  );
  const given = prior.filter((row) => String(row.status).toUpperCase() === 'GIVEN');

  const maxCount = order.maxDosesPer24Hours == null ? 0 : Number(order.maxDosesPer24Hours);
  if (maxCount && given.length >= maxCount) issues.push({ code: 'MAX_DOSES_24H', message: `This order allows no more than ${maxCount} dose${maxCount === 1 ? '' : 's'} in 24 hours; that limit has already been reached.` });

  const intervalHours = order.intervalHours == null ? 0 : Number(order.intervalHours);
  const latestGiven = given.find((row) => row.administeredAt);
  if (intervalHours && latestGiven?.administeredAt) {
    const elapsed = (now.getTime() - new Date(String(latestGiven.administeredAt)).getTime()) / 3_600_000;
    if (elapsed < intervalHours) issues.push({ code: 'TOO_SOON', message: `The last documented dose was ${elapsed.toFixed(1)} hours ago; the order requires at least ${intervalHours} hours between doses.` });
  }

  if (String(order.scheduleMode) === 'PRN' && !String(input.prnIndication || '').trim()) {
    issues.push({ code: 'PRN_INDICATION_REQUIRED', message: `Document the PRN indication before administration${order.prnReason ? ` (${order.prnReason})` : ''}.` });
  }

  const scale = jsonArray<{ min: number; max: number; dose: number; doseUnit?: string }>(order.slidingScale).slice().sort((a,b) => Number(a.min)-Number(b.min));
  if (scale.length) {
    if (input.bloodGlucose == null || !Number.isFinite(Number(input.bloodGlucose))) {
      issues.push({ code: 'GLUCOSE_REQUIRED', message: 'This sliding-scale order requires the current blood glucose before administration.' });
    } else {
      const bg = Number(input.bloodGlucose);
      const row = scale.find((item) => bg >= Number(item.min) && bg <= Number(item.max));
      if (!row) issues.push({ code: 'GLUCOSE_OUTSIDE_SCALE', message: `Blood glucose ${bg} is outside all ordered sliding-scale ranges. Follow the prescriber notification instructions.` });
      else {
        const entered = firstNumber(input.administeredDose);
        if (entered == null) issues.push({ code: 'SLIDING_SCALE_DOSE_REQUIRED', message: `The ordered sliding-scale dose is ${row.dose} ${row.doseUnit || 'units'}; enter the dose before administration.` });
        else if (Math.abs(entered - Number(row.dose)) > 0.0001) issues.push({ code: 'SLIDING_SCALE_DOSE_MISMATCH', message: `For blood glucose ${bg}, the active order specifies ${row.dose} ${row.doseUnit || 'units'}, not ${entered}.` });
      }
    }
  }

  const maxDailyDoseMg = order.maxDailyDoseMg == null ? 0 : Number(order.maxDailyDoseMg);
  if (maxDailyDoseMg) {
    const currentDose = firstNumber(input.administeredDose) ?? Number(order.doseAmount || 0);
    let total = 0;
    for (const row of given) {
      const record = jsonObject(row.record);
      total += firstNumber(record.administeredDose) ?? Number(order.doseAmount || 0);
    }
    if (currentDose > 0 && total + currentDose > maxDailyDoseMg) issues.push({ code: 'MAX_DAILY_DOSE', message: `This administration would exceed the active order's maximum daily dose of ${maxDailyDoseMg} mg.` });
  }

  const linkedGroupId = String(order.linkedOrderGroupId || '');
  const linkedRule = jsonObject(order.linkedOrderRule);
  if (linkedGroupId) {
    const linked = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT o."id",o."name",o."doseAmount",o."doseUnit",a.*,to_jsonb(a) AS "record"
       FROM "SpireMedicationOrder" o
       JOIN "SpireMedicationAdministration" a ON a."medicationOrderId"=o."id"
       WHERE o."organizationId"=$1
         AND COALESCE(to_jsonb(o)->>'patientId',to_jsonb(o)->>'clientId')=$2
         AND o."linkedOrderGroupId"=$3
         AND a."status"='GIVEN' AND a."administeredAt">=NOW()-INTERVAL '24 hours'
       ORDER BY a."administeredAt" DESC`,
      organizationId,
      patientId,
      linkedGroupId,
    );
    const sharedCount = Number(linkedRule.sharedMaxDosesPer24Hours || 0);
    if (sharedCount && linked.length >= sharedCount) issues.push({ code: 'LINKED_GROUP_MAX_DOSES', message: `The linked medication group has reached its shared limit of ${sharedCount} administrations in 24 hours.` });
    const sharedInterval = Number(linkedRule.sharedMinIntervalHours || 0);
    if (sharedInterval && linked[0]?.administeredAt) {
      const elapsed = (now.getTime() - new Date(String(linked[0].administeredAt)).getTime()) / 3_600_000;
      if (elapsed < sharedInterval) issues.push({ code: 'LINKED_GROUP_TOO_SOON', message: `A linked alternative (${linked[0].name}) was administered ${elapsed.toFixed(1)} hours ago; the linked order requires ${sharedInterval} hours between alternatives.` });
    }
    const sharedMax = Number(linkedRule.sharedMaxDailyDoseAmount || 0);
    if (sharedMax) {
      let total = 0;
      for (const row of linked) {
        const record = jsonObject(row.record);
        total += firstNumber(record.administeredDose) ?? Number(row.doseAmount || 0);
      }
      const current = firstNumber(input.administeredDose) ?? Number(order.doseAmount || 0);
      if (current > 0 && total + current > sharedMax) issues.push({ code: 'LINKED_GROUP_MAX_DAILY_DOSE', message: `This administration would exceed the linked-order shared daily maximum of ${sharedMax}.` });
    }
  }

  if (input.scheduledFor) {
    const scheduled = new Date(input.scheduledFor);
    if (!Number.isNaN(scheduled.getTime())) {
      const duplicate = given.some((row) => Math.abs(new Date(String(row.scheduledFor)).getTime() - scheduled.getTime()) < 60_000);
      if (duplicate) issues.push({ code: 'ALREADY_GIVEN_FOR_SLOT', message: 'A Given administration is already documented for this scheduled dose.' });
    }
  }

  if (issues.length) {
    const error = Object.assign(new Error(issues.map((issue) => issue.message).join(' ')), { status: 409, code: 'MEDICATION_SAFETY_BLOCK', issues });
    throw error;
  }
}
