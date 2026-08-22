import { createHash } from 'node:crypto';

export type MedicaidRuleEnvelopeInput = {
  event: Record<string, unknown>;
  authorization: Record<string, unknown> | null;
  rule: Record<string, unknown> | null;
  ruleConfig: Record<string, unknown>;
  serviceDate: string;
  serviceCode: string;
  serviceFamily: string;
};

export type MedicaidRuleEnvelopeDecision = {
  blockers: string[];
  warnings: string[];
  evidence: Record<string, unknown>;
  fingerprint: string;
};

const clean = (value: unknown, max = 5000) => String(value ?? '').trim().slice(0, max);
const arr = (value: unknown) => Array.isArray(value) ? value : [];
const num = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const dateKey = (value: unknown) => clean(value, 30).slice(0, 10);
const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const upperSet = (value: unknown) => new Set(arr(value).map((item) => clean(item, 160).toUpperCase()).filter(Boolean));
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, stable(child)]));
  }
  return value;
};
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export function evaluateMedicaidRuleEnvelope(input: MedicaidRuleEnvelopeInput): MedicaidRuleEnvelopeDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const { event, authorization, rule, ruleConfig: config, serviceDate, serviceCode, serviceFamily } = input;

  const eventUnits = num(event.units);
  const unitType = clean(event.unitType, 80).toUpperCase();
  const payer = clean(event.payer || authorization?.payer, 160).toUpperCase();
  const payerProgram = clean((event.metadata as Record<string, unknown> | null)?.payerProgram || authorization?.waiverType, 160).toUpperCase();
  const waiverType = clean(authorization?.waiverType, 160).toUpperCase();
  const authStatus = clean(authorization?.status, 40).toUpperCase();
  const authStart = dateKey(authorization?.startDate);
  const authEnd = dateKey(authorization?.endDate);
  const authCode = clean(authorization?.serviceCode, 120);
  const authorizedUnits = num(authorization?.authorizedUnits);
  const deliveredUnits = num(authorization?.deliveredUnits);
  const remainingUnits = authorizedUnits !== null && deliveredUnits !== null ? authorizedUnits - deliveredUnits : null;

  // This layer never invents Ohio code/rate mappings. Restrictions become hard stops only
  // when the active, date-effective rule version explicitly configures them.
  const allowedPayers = upperSet(config.allowedPayers);
  const allowedPrograms = upperSet(config.allowedPayerPrograms);
  const allowedWaivers = upperSet(config.allowedWaiverTypes);
  const allowedServiceCodes = upperSet(config.allowedServiceCodes);
  const allowedUnitTypes = upperSet(config.allowedUnitTypes);

  if (bool(rule?.requiresAuthorization, true)) {
    if (!authorization) blockers.push('Medicaid rule engine requires a linked service authorization.');
    else {
      if (authStatus && authStatus !== 'ACTIVE' && bool(config.requireAuthorizationActiveStatus, true)) {
        blockers.push(`Linked authorization status is ${authStatus}, not ACTIVE.`);
      }
      if (serviceDate && authStart && serviceDate < authStart) blockers.push('Service date precedes the authorization start date.');
      if (serviceDate && authEnd && serviceDate > authEnd) blockers.push('Service date is after the authorization end date.');
      if (serviceCode && authCode && serviceCode !== authCode) blockers.push('Service code does not match the linked authorization.');
      if (authorizedUnits !== null && deliveredUnits !== null && deliveredUnits > authorizedUnits + 0.001) {
        blockers.push('Delivered units exceed the authorization ceiling.');
      }
      if (remainingUnits !== null && remainingUnits < -0.001) blockers.push('Authorization has a negative remaining-unit balance.');
    }
  }

  if (bool(config.requirePositiveUnits, true) && (eventUnits === null || eventUnits <= 0)) {
    blockers.push('Billable Medicaid units must be greater than zero.');
  }
  const minUnits = num(config.minUnitsPerEvent);
  const maxUnits = num(config.maxUnitsPerEvent);
  if (eventUnits !== null && minUnits !== null && eventUnits < minUnits) blockers.push(`Billable units are below the configured minimum of ${minUnits}.`);
  if (eventUnits !== null && maxUnits !== null && eventUnits > maxUnits) blockers.push(`Billable units exceed the configured per-event maximum of ${maxUnits}.`);
  if (allowedUnitTypes.size && (!unitType || !allowedUnitTypes.has(unitType))) blockers.push('Revenue unit type is not permitted by the active Medicaid rule version.');

  if (allowedPayers.size && (!payer || !allowedPayers.has(payer))) blockers.push('Payer is not permitted by the active Medicaid rule version.');
  if (allowedPrograms.size && (!payerProgram || !allowedPrograms.has(payerProgram))) blockers.push('Payer program is not permitted by the active Medicaid rule version.');
  if (allowedWaivers.size && (!waiverType || !allowedWaivers.has(waiverType))) blockers.push('Waiver type is not permitted by the active Medicaid rule version.');
  if (allowedServiceCodes.size && (!serviceCode || !allowedServiceCodes.has(serviceCode.toUpperCase()))) blockers.push('Service code is not permitted by the active Medicaid rule version.');

  if (rule) {
    if (!clean(rule.authority, 1000)) blockers.push('Active Medicaid rule version is missing its authority/source citation.');
    if (!dateKey(rule.reviewedOn)) blockers.push('Active Medicaid rule version is missing its reviewed-on date.');
    const effectiveFrom = dateKey(rule.effectiveFrom), effectiveTo = dateKey(rule.effectiveTo);
    if (serviceDate && effectiveFrom && serviceDate < effectiveFrom) blockers.push('Selected Medicaid rule version is not yet effective for the service date.');
    if (serviceDate && effectiveTo && serviceDate > effectiveTo) blockers.push('Selected Medicaid rule version expired before the service date.');
    const maxReviewAgeDays = num(config.maxRuleReviewAgeDays);
    if (maxReviewAgeDays !== null && maxReviewAgeDays > 0 && dateKey(rule.reviewedOn)) {
      const reviewed = new Date(`${dateKey(rule.reviewedOn)}T00:00:00Z`).getTime();
      const at = serviceDate ? new Date(`${serviceDate}T00:00:00Z`).getTime() : Date.now();
      if (Number.isFinite(reviewed) && Number.isFinite(at) && at - reviewed > maxReviewAgeDays * 86400000) {
        warnings.push(`Active Medicaid rule version was last reviewed more than ${maxReviewAgeDays} days before the service date.`);
      }
    }
  }

  const evidence = {
    engine: 'SPIRE_MEDICAID_RULE_ENVELOPE_1_1',
    serviceFamily,
    serviceCode,
    serviceDate,
    eventUnits,
    unitType: unitType || null,
    payer: payer || null,
    payerProgram: payerProgram || null,
    waiverType: waiverType || null,
    authorization: authorization ? {
      id: authorization.id ?? null,
      status: authorization.status ?? null,
      serviceCode: authorization.serviceCode ?? null,
      startDate: authorization.startDate ?? null,
      endDate: authorization.endDate ?? null,
      authorizedUnits,
      deliveredUnits,
      remainingUnits,
    } : null,
    rule: rule ? {
      id: rule.id ?? null,
      ruleCode: rule.ruleCode ?? null,
      version: rule.version ?? null,
      scope: rule.scope ?? null,
      effectiveFrom: rule.effectiveFrom ?? null,
      effectiveTo: rule.effectiveTo ?? null,
      authority: rule.authority ?? null,
      reviewedOn: rule.reviewedOn ?? null,
      unitMethod: rule.unitMethod ?? null,
    } : null,
    configuredRestrictions: {
      allowedPayers: [...allowedPayers],
      allowedPayerPrograms: [...allowedPrograms],
      allowedWaiverTypes: [...allowedWaivers],
      allowedServiceCodes: [...allowedServiceCodes],
      allowedUnitTypes: [...allowedUnitTypes],
      minUnitsPerEvent: minUnits,
      maxUnitsPerEvent: maxUnits,
    },
  };

  return { blockers: unique(blockers), warnings: unique(warnings), evidence, fingerprint: fingerprint(evidence) };
}
