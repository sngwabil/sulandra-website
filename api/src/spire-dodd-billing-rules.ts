import type { PrismaClient } from '@prisma/client';

export type SpireDoddBillingDecision = {
  required: boolean;
  ready: boolean;
  code: 'NOT_REQUIRED' | 'PASS' | 'BLOCK';
  serviceEventId: string;
  ruleVersionId: string | null;
  blockers: string[];
  warnings: string[];
  details: Record<string, unknown>;
};

type EvalInput = { organizationId: string; legalEntityId: string; event: Record<string, unknown> };
type RecordInput = {
  organizationId: string;
  legalEntityId: string;
  actorUserId: string;
  action: 'READY' | 'BATCH';
  decision: SpireDoddBillingDecision;
};

const clean = (value: unknown, max = 5000) => String(value ?? '').trim().slice(0, max);
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const dateKey = (value: unknown) => clean(value, 30).slice(0, 10);
const milliseconds = (value: unknown) => { const n = value ? new Date(String(value)).getTime() : NaN; return Number.isFinite(n) ? n : null; };
const closeTime = (a: unknown, b: unknown) => { const x = milliseconds(a), y = milliseconds(b); return x !== null && y !== null && Math.abs(x-y) <= 1000; };

function familyOf(document: Record<string, unknown> | null, authorization: Record<string, unknown> | null, event: Record<string, unknown>) {
  const profile = clean(document?.documentationProfileCode, 160).toUpperCase();
  const description = [document?.serviceType, authorization?.serviceName, event.serviceDescription, event.serviceCode].map((v) => clean(v, 500).toLowerCase()).join(' ');
  if (profile === 'HPC_5123_9_30' || profile === 'PD_HPC_5123_9_32' || /\b(homemaker|personal care|hpc)\b/i.test(description)) return 'HOMEMAKER_PERSONAL_CARE';
  if (profile === 'SHARED_HPC_5123_9_31') return 'SHARED_HOMEMAKER_PERSONAL_CARE';
  if (profile === 'ADULT_DAY_5123_9_17' || /adult day support/i.test(description)) return 'ADULT_DAY_SUPPORT';
  if (profile === 'TRANSPORT_5123_9_24' || /transport/i.test(description)) return 'TRANSPORTATION';
  if (profile === 'SUPPORT_BROKERAGE_5123_9_47') return 'SUPPORT_BROKERAGE';
  if (profile === 'CLINICAL_THERAPEUTIC_5123_9_41') return 'CLINICAL_THERAPEUTIC';
  return 'GENERIC_DODD';
}

async function loadContext(prisma: PrismaClient, input: EvalInput) {
  const event = input.event;
  const sourceType = clean(event.sourceType, 160);
  const sourceId = clean(event.sourceId, 160);
  const patientId = clean(event.patientId, 160);
  let visit: Record<string, unknown> | null = null;
  if (sourceType === 'SpireEvvVisit' && sourceId && patientId) {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "SpireEvvVisit" WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 LIMIT 1`,
      input.organizationId, patientId, sourceId,
    );
    visit = rows[0] ?? null;
  }
  const authorizationId = clean(event.authorizationId || visit?.authorizationId, 160);
  let authorization: Record<string, unknown> | null = null;
  if (authorizationId && patientId) {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "SpireServiceAuthorization" WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 LIMIT 1`,
      input.organizationId, patientId, authorizationId,
    );
    authorization = rows[0] ?? null;
  }
  const serviceDate = dateKey(event.serviceDate);
  const serviceCode = clean(event.serviceCode || visit?.procedureCode || visit?.serviceCode, 120);
  const documents = patientId && serviceDate ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT d.* FROM "SpireDoddServiceDocument" d
      WHERE d."organizationId"=$1 AND d."legalEntityId"=$2 AND d."patientId"=$3
        AND d."serviceDate"=$4::date
        AND ($5::text='' OR d."evvVisitId"=$5 OR d."authorizationId"=$6)
      ORDER BY CASE WHEN d."evvVisitId"=$5 THEN 0 ELSE 1 END,
               CASE d."status" WHEN 'SIGNED' THEN 0 WHEN 'COMPLETE' THEN 1 ELSE 2 END,
               d."createdAt" DESC`,
    input.organizationId, input.legalEntityId, patientId, serviceDate, sourceType === 'SpireEvvVisit' ? sourceId : '', authorizationId || null,
  ) : [];
  const document = documents[0] ?? null;
  return { patientId, sourceType, sourceId, visit, authorizationId, authorization, serviceDate, serviceCode, documents, document };
}

async function selectRule(prisma: PrismaClient, input: EvalInput, family: string, serviceCode: string) {
  const serviceDate = dateKey(input.event.serviceDate);
  if (!serviceDate) return null;
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireDoddBillingRuleVersion"
      WHERE "effectiveFrom"<=$1::date AND ("effectiveTo" IS NULL OR "effectiveTo">=$1::date)
        AND ("scope"='SYSTEM' OR ("scope"='ENTITY' AND "organizationId"=$2 AND "legalEntityId"=$3))
        AND ("serviceFamily"='*' OR "serviceFamily"=$4)
        AND ("serviceCode" IS NULL OR "serviceCode"=$5)
      ORDER BY
        CASE WHEN "scope"='ENTITY' THEN 1 ELSE 0 END DESC,
        CASE WHEN "serviceCode"=$5 THEN 1 ELSE 0 END DESC,
        CASE WHEN "serviceFamily"=$4 THEN 1 ELSE 0 END DESC,
        "priority" DESC,"effectiveFrom" DESC,"version" DESC,"createdAt" DESC LIMIT 1`,
    serviceDate, input.organizationId, input.legalEntityId, family, serviceCode,
  );
  return rows[0] ?? null;
}

function expectedFifteenMinuteUnits(totalMinutes: number, config: Record<string, unknown>) {
  const rounding = obj(config.minuteRounding);
  const unitMinutes = Math.max(1, num(rounding.unitMinutes) ?? 15);
  const minimumRemainder = Math.max(0, num(rounding.minimumRemainderMinutes) ?? 8);
  const whole = Math.floor(totalMinutes / unitMinutes);
  const remainder = totalMinutes - whole * unitMinutes;
  return whole + (remainder >= minimumRemainder ? 1 : 0);
}

export async function evaluateSpireDoddBilling(prisma: PrismaClient, input: EvalInput): Promise<SpireDoddBillingDecision> {
  const event = input.event;
  const eventId = clean(event.id, 160);
  const entityRows = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
    `SELECT "code" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, input.organizationId, input.legalEntityId,
  );
  const required = clean(event.sourceModule, 40).toUpperCase() === 'SCLS' && entityRows[0]?.code === 'SCLS';
  if (!required) return { required:false, ready:true, code:'NOT_REQUIRED', serviceEventId:eventId, ruleVersionId:null, blockers:[], warnings:[], details:{ reason:'DODD billing rules apply to SCLS service events in the SCLS legal entity.' } };

  const blockers: string[] = [], warnings: string[] = [];
  const context = await loadContext(prisma, input);
  const { patientId, sourceType, sourceId, visit, authorizationId, authorization, serviceDate, serviceCode, documents, document } = context;
  const family = familyOf(document, authorization, event);
  const rule = await selectRule(prisma, input, family, serviceCode);
  const config = obj(rule?.ruleConfig);

  if (!patientId) blockers.push('DODD billing requires a linked individual/client.');
  if (!serviceDate) blockers.push('DODD billing requires a service date.');
  if (!serviceCode) blockers.push('DODD billing requires a service code.');
  if (!rule) blockers.push(`No date-effective DODD billing rule is configured for ${family} on ${serviceDate || 'this service date'}.`);

  if (rule?.requiresAuthorization !== false) {
    if (!authorization) blockers.push('A matching DODD service authorization is required before billing.');
    else {
      const start = dateKey(authorization.startDate), end = dateKey(authorization.endDate);
      if (serviceDate && ((start && serviceDate < start) || (end && serviceDate > end))) blockers.push('Service date is outside the linked authorization span.');
      const authCode = clean(authorization.serviceCode, 120);
      if (serviceCode && authCode && serviceCode !== authCode) blockers.push('Revenue service code does not match the linked authorization service code.');
      const authorizedUnits = num(authorization.authorizedUnits), deliveredUnits = num(authorization.deliveredUnits);
      if (authorizedUnits !== null && deliveredUnits !== null && deliveredUnits > authorizedUnits + 0.001) blockers.push('Delivered authorization units exceed the authorized amount.');
      if (clean(authorization.status, 40).toUpperCase() && clean(authorization.status, 40).toUpperCase() !== 'ACTIVE') warnings.push(`Linked authorization status is ${clean(authorization.status,40)}; verify it was valid on the service date.`);
    }
  }

  const signed = documents.find((row) => clean(row.status, 30).toUpperCase() === 'SIGNED') ?? null;
  if (rule?.requiresSignedServiceDocument !== false) {
    if (!signed) blockers.push('A signed DODD service document linked to this service/visit is required before billing.');
    else {
      if (sourceType === 'SpireEvvVisit' && clean(signed.evvVisitId,160) !== sourceId) blockers.push('Signed DODD service documentation is not linked to the exact EVV visit.');
      if (authorizationId && clean(signed.authorizationId,160) !== authorizationId) blockers.push('Signed DODD service documentation does not match the service authorization.');
      if (dateKey(signed.serviceDate) !== serviceDate) blockers.push('Signed DODD service-document date does not match the revenue service date.');
      const signedCode = clean(signed.serviceCode,120);
      if (serviceCode && signedCode && signedCode !== serviceCode) blockers.push('Signed DODD service-document code does not match the revenue service code.');
      if (event.serviceStart && signed.startAt && !closeTime(event.serviceStart,signed.startAt)) blockers.push('Signed service-document start time does not match the revenue service start.');
      if (event.serviceEnd && signed.endAt && !closeTime(event.serviceEnd,signed.endAt)) blockers.push('Signed service-document end time does not match the revenue service end.');
    }
  }

  if (rule?.requiresEvv === true && sourceType !== 'SpireEvvVisit') blockers.push('This date-effective DODD billing rule requires an EVV-backed service event.');
  if (rule?.requiresGroupSize === true && (!signed || (num(signed.groupSize) ?? 0) <= 0)) blockers.push('Group size is required in signed DODD service documentation for this service.');

  let dailyMinutes: number | null = null, expectedDailyUnits: number | null = null, currentDailyRevenueUnits: number | null = null;
  if (clean(rule?.unitMethod,80) === 'FIFTEEN_MINUTE_DAILY_AGGREGATE' && patientId && serviceDate) {
    const profiles = arr(config.documentationProfiles).map((v) => clean(v,160)).filter(Boolean);
    const minuteRows = await prisma.$queryRawUnsafe<Array<{ minutes: number }>>(
      `SELECT COALESCE(sum(EXTRACT(EPOCH FROM ("endAt"-"startAt"))/60.0),0)::float8 AS minutes
         FROM "SpireDoddServiceDocument"
        WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "serviceDate"=$4::date
          AND "status"='SIGNED' AND "startAt" IS NOT NULL AND "endAt" IS NOT NULL
          AND (cardinality($5::text[])=0 OR "documentationProfileCode"=ANY($5::text[]))`,
      input.organizationId,input.legalEntityId,patientId,serviceDate,profiles,
    );
    dailyMinutes = num(minuteRows[0]?.minutes) ?? 0;
    expectedDailyUnits = expectedFifteenMinuteUnits(dailyMinutes, config);
    const unitRows = await prisma.$queryRawUnsafe<Array<{ units: number }>>(
      `SELECT COALESCE(sum("units"),0)::float8 AS units FROM "RevenueCycleServiceEvent"
        WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "serviceDate"=$4::date
          AND "sourceModule"='SCLS' AND "status" NOT IN ('NON_BILLABLE','VOID')
          AND ($5::text='' OR "serviceCode"=$5)`,
      input.organizationId,input.legalEntityId,patientId,serviceDate,serviceCode,
    );
    currentDailyRevenueUnits = num(unitRows[0]?.units) ?? 0;
    if (Math.abs(currentDailyRevenueUnits-expectedDailyUnits) > 0.001) {
      blockers.push(`Daily 15-minute billing-unit total is ${currentDailyRevenueUnits}, but ${dailyMinutes.toFixed(1)} signed service minutes calculate to ${expectedDailyUnits} billing unit(s) under the active rule.`);
    }
  }

  if (signed && family === 'HOMEMAKER_PERSONAL_CARE') {
    const start = milliseconds(signed.startAt), end = milliseconds(signed.endAt);
    if (start !== null && end !== null) {
      const overlaps = await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(
        `SELECT "id","sourceModule","serviceCode","serviceDescription","unitType","serviceStart","serviceEnd"
           FROM "RevenueCycleServiceEvent"
          WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"<>$4
            AND "status" NOT IN ('NON_BILLABLE','VOID') AND "serviceStart"<$5::timestamptz AND "serviceEnd">$6::timestamptz`,
        input.organizationId,input.legalEntityId,patientId,eventId,new Date(end).toISOString(),new Date(start).toISOString(),
      );
      const prohibited = arr(config.prohibitedConcurrentServicePatterns).map((v)=>clean(v,200).toLowerCase()).filter(Boolean);
      for (const overlap of overlaps) {
        const label = `${clean(overlap.serviceCode,120)} ${clean(overlap.serviceDescription,500)}`.toLowerCase();
        const hit = prohibited.find((pattern)=>label.includes(pattern));
        if (hit) blockers.push(`Homemaker/Personal Care overlaps prohibited concurrent service "${clean(overlap.serviceDescription,300) || clean(overlap.serviceCode,120)}".`);
        if (clean(overlap.sourceModule,40).toUpperCase()==='NMT' && clean(overlap.unitType,40).toUpperCase()==='TRIP') warnings.push('HPC overlaps a per-trip NMT event; verify the HPC worker was not the driver before billing.');
      }
    }
  }

  const modifiers = arr(obj(event.metadata).modifiers).map((v)=>clean(v,40).toUpperCase()).filter(Boolean);
  const allowedModifiers = arr(config.allowedModifiers).map((v)=>clean(v,40).toUpperCase()).filter(Boolean);
  if (modifiers.length && !allowedModifiers.length) blockers.push('Billing modifier/add-on data is present but the active rule version has no verified modifier configuration. Create a date-effective rule version before billing.');
  else if (modifiers.some((modifier)=>!allowedModifiers.includes(modifier))) blockers.push('One or more billing modifiers are not permitted by the active date-effective rule version.');

  const rateTable = obj(config.rateTable);
  const unitRate = num(event.unitRate);
  if (unitRate !== null && Object.keys(rateTable).length === 0) warnings.push('A unit rate is present, but the active system rule intentionally does not hard-code a dollar rate. Verify/configure the date-effective county/provider rate before claim generation.');

  const groupSize = num(signed?.groupSize);
  const factors = obj(config.groupRateFactors);
  let groupRateFactor: number | null = null;
  if (groupSize !== null && groupSize > 0 && Object.keys(factors).length) {
    const key = groupSize >= 4 ? '4+' : String(Math.trunc(groupSize));
    groupRateFactor = num(factors[key]);
  }

  const finalBlockers = unique(blockers), finalWarnings = unique(warnings), ready = finalBlockers.length === 0;
  return {
    required:true, ready, code:ready?'PASS':'BLOCK', serviceEventId:eventId, ruleVersionId:clean(rule?.id,160)||null,
    blockers:finalBlockers, warnings:finalWarnings,
    details:{
      serviceFamily:family, serviceCode, serviceDate, sourceType, sourceId,
      authorizationId:authorizationId||null, authorizationStatus:authorization?.status??null,
      signedServiceDocumentId:signed?.id??null, signedDocumentationProfile:signed?.documentationProfileCode??null,
      rule:rule?{id:rule.id,ruleCode:rule.ruleCode,version:rule.version,name:rule.name,effectiveFrom:rule.effectiveFrom,effectiveTo:rule.effectiveTo,unitMethod:rule.unitMethod,authority:rule.authority,authorityUrl:rule.authorityUrl,reviewedOn:rule.reviewedOn,scope:rule.scope}:null,
      dailyMinutes, expectedDailyBillingUnits:expectedDailyUnits, currentDailyRevenueUnits,
      groupSize, groupRateFactor, modifiers, rateValidationMode:config.rateValidationMode??null,
    },
  };
}

export async function recordSpireDoddBillingDecision(prisma: PrismaClient, input: RecordInput) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireDoddBillingValidationDecision"(
      "organizationId","legalEntityId","serviceEventId","ruleVersionId","action","required","ready","decisionCode",
      "blockers","warnings","details","actorUserId"
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12)`,
    input.organizationId,input.legalEntityId,input.decision.serviceEventId,input.decision.ruleVersionId,input.action,
    input.decision.required,input.decision.ready,input.decision.code,JSON.stringify(input.decision.blockers),JSON.stringify(input.decision.warnings),JSON.stringify(input.decision.details),input.actorUserId,
  );
}
