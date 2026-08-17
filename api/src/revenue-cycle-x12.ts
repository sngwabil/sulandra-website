import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export type ClaimFormat = '837P' | '837I';
export type ClaimCandidate = {
  format: ClaimFormat;
  implementationVersion: string;
  payload: string;
  payloadSha256: string;
  errors: string[];
  warnings: string[];
  lines: Array<{ serviceEventId: string; claimControlNumber: string; patientMemberId: string; chargedAmount: number }>;
  metadata: Record<string, unknown>;
};

const clean = (value: unknown, max = 5000) => String(value ?? '').trim().slice(0, max);
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const date8 = (value: unknown) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10).replaceAll('-', '');
};
const time4 = (value = new Date()) => value.toISOString().slice(11, 16).replace(':', '');
const yymmdd = (value = new Date()) => value.toISOString().slice(2, 10).replaceAll('-', '');
const x12 = (value: unknown, max = 80) => clean(value, max).replace(/[~*:^|]/g, ' ').replace(/\s+/g, ' ').trim();
const pad = (value: unknown, width: number) => x12(value, width).slice(0, width).padEnd(width, ' ');
const control9 = (value: unknown) => String(value ?? '').replace(/\D/g, '').slice(-9).padStart(9, '0');
const control4 = (value: unknown) => String(value ?? '').replace(/\D/g, '').slice(-4).padStart(4, '0');
const dollars = (value: unknown) => (num(value) ?? 0).toFixed(2);
const decimal = (value: unknown) => String(num(value) ?? 0).replace(/\.0+$/, '');
const first = (...values: unknown[]) => values.map((value) => clean(value)).find(Boolean) || '';
const valueAt = (source: Record<string, unknown>, keys: string[]) => first(...keys.map((key) => source[key]));
const stringArray = (value: unknown) => array(value).map((item) => clean(item, 40)).filter(Boolean);

function patientMemberId(patient: Record<string, unknown>, event: Record<string, unknown>, document: Record<string, unknown> | null) {
  const metadata = object(event.metadata);
  return first(
    metadata.memberId, metadata.medicaidId, metadata.individualMedicaidId, metadata.patientMedicaidId,
    document?.individualMedicaidId,
    valueAt(patient, ['medicaidId','medicaidNumber','memberId','patientMedicaidId','individualMedicaidId']),
  );
}
function patientName(patient: Record<string, unknown>) {
  return {
    firstName: first(patient.preferredName, patient.firstName),
    lastName: clean(patient.lastName, 80),
    middleName: clean(patient.middleName, 80),
  };
}
function patientDob(patient: Record<string, unknown>) { return date8(first(patient.dateOfBirth, patient.dob, patient.birthDate)); }
function patientSex(patient: Record<string, unknown>) {
  const value = first(patient.sexAtBirth, patient.sex, patient.gender).toUpperCase();
  return value.startsWith('M') ? 'M' : value.startsWith('F') ? 'F' : 'U';
}

export async function loadRevenueBatchExchangeContext(
  prisma: PrismaClient,
  organizationId: string,
  legalEntityId: string,
  batchId: string,
) {
  const batches = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT b.*,to_jsonb(e) AS "entityJson" FROM "RevenueCycleBatch" b
      JOIN "LegalEntity" e ON e."organizationId"=b."organizationId" AND e."id"=b."legalEntityId"
      WHERE b."organizationId"=$1 AND b."legalEntityId"=$2 AND b."id"=$3 LIMIT 1`,
    organizationId, legalEntityId, batchId,
  );
  const batch = batches[0];
  if (!batch) throw Object.assign(new Error('Revenue batch was not found'), { status: 404 });
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT e.*,to_jsonb(p) AS "patientJson",
       (SELECT to_jsonb(d) FROM "SpireDoddServiceDocument" d
         WHERE d."organizationId"=e."organizationId" AND d."legalEntityId"=e."legalEntityId" AND d."patientId"=e."patientId"
           AND d."status"='SIGNED' AND d."serviceDate"=e."serviceDate"
           AND (d."authorizationId"=e."authorizationId" OR d."evvVisitId"=e."sourceId")
         ORDER BY CASE WHEN d."evvVisitId"=e."sourceId" THEN 0 ELSE 1 END,d."createdAt" DESC LIMIT 1) AS "doddDocumentJson"
      FROM "RevenueCycleBatchLine" l
      JOIN "RevenueCycleServiceEvent" e ON e."id"=l."serviceEventId"
      LEFT JOIN "SpirePatient" p ON p."organizationId"=e."organizationId" AND p."id"=e."patientId"
      WHERE l."organizationId"=$1 AND l."legalEntityId"=$2 AND l."batchId"=$3
      ORDER BY e."serviceDate",e."createdAt"`,
    organizationId, legalEntityId, batchId,
  );
  return { batch, entity: object(batch.entityJson), events: rows };
}

function profileConfig(profile: Record<string, unknown>) {
  const config = object(profile.config);
  return {
    submitterName: first(config.submitterName, config.billingProviderName),
    contactName: clean(config.contactName, 80),
    contactPhone: clean(config.contactPhone, 40).replace(/\D/g, ''),
    billingProviderNpi: clean(config.billingProviderNpi, 20),
    billingProviderTaxonomy: clean(config.billingProviderTaxonomy, 40),
    billingProviderTaxId: clean(config.billingProviderTaxId, 20),
    billingAddress1: clean(config.billingAddress1, 100),
    billingAddress2: clean(config.billingAddress2, 100),
    billingCity: clean(config.billingCity, 80),
    billingState: clean(config.billingState, 2).toUpperCase(),
    billingZip: clean(config.billingZip, 20).replace(/[^0-9-]/g, ''),
    defaultPlaceOfService: clean(config.defaultPlaceOfService, 4),
    defaultDiagnosisCodes: stringArray(config.defaultDiagnosisCodes),
    requireDiagnosisCodes: config.requireDiagnosisCodes !== false,
    facilityTypeCode: clean(config.facilityTypeCode, 4),
    claimFrequencyCode: clean(config.claimFrequencyCode, 2) || '1',
    defaultRevenueCode: clean(config.defaultRevenueCode, 8),
  };
}

export async function buildRevenueClaimCandidate(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    legalEntityId: string;
    batchId: string;
    profile: Record<string, unknown>;
    format: ClaimFormat;
    submissionNumber: string;
    interchangeControlNumber: string;
    groupControlNumber: string;
    transactionSetControlNumber: string;
  },
): Promise<ClaimCandidate> {
  const { batch, entity, events } = await loadRevenueBatchExchangeContext(prisma, input.organizationId, input.legalEntityId, input.batchId);
  const errors: string[] = [], warnings: string[] = [];
  if (clean(batch.status, 40) !== 'FINALIZED') errors.push('Revenue batch must be FINALIZED before an X12 claim candidate can be generated.');
  if (!events.length) errors.push('Revenue batch contains no service events.');

  const profile = input.profile;
  const config = profileConfig(profile);
  const submitterId = clean(profile.submitterId, 30);
  const receiverId = clean(profile.receiverId, 30);
  const payerId = clean(profile.payerId, 30);
  const payerName = first(batch.payerName, profile.name, 'PAYER');
  const providerName = first(config.submitterName, entity.legalName, entity.displayName, entity.name);
  const providerNpi = first(config.billingProviderNpi, valueAt(entity, ['npi','nationalProviderIdentifier']));
  const providerTaxonomy = first(config.billingProviderTaxonomy, valueAt(entity, ['taxonomyCode','taxonomy']));
  const providerTaxId = config.billingProviderTaxId;
  if (!submitterId) errors.push('Trading-partner Submitter ID is required.');
  if (!receiverId) errors.push('Trading-partner Receiver ID is required.');
  if (!payerId) errors.push('Payer ID is required.');
  if (!providerName) errors.push('Billing provider legal/display name is required.');
  if (!providerNpi || !/^\d{10}$/.test(providerNpi)) errors.push('Billing provider NPI must be a 10-digit NPI.');
  if (!providerTaxonomy) warnings.push('Billing provider taxonomy is not configured; verify the payer companion guide before external handoff.');
  if (!providerTaxId) warnings.push('Billing provider tax identifier is not configured; external companion-guide validation may require it.');
  if (!config.billingAddress1 || !config.billingCity || !config.billingState || !config.billingZip) errors.push('Billing provider address/city/state/ZIP are required for claim generation.');
  if (input.format === '837I' && !config.facilityTypeCode) errors.push('837I requires a configured facility type/bill-type component.');

  const implementationVersion = input.format === '837P' ? '005010X222A1' : '005010X223A2';
  const now = new Date();
  const segments: string[] = [];
  const isaControl = control9(input.interchangeControlNumber);
  const gsControl = String(Number(input.groupControlNumber) || 1);
  const stControl = control4(input.transactionSetControlNumber);
  segments.push(`ISA*00*${' '.repeat(10)}*00*${' '.repeat(10)}*ZZ*${pad(submitterId,15)}*ZZ*${pad(receiverId,15)}*${yymmdd(now)}*${time4(now)}*^*00501*${isaControl}*1*T*:`);
  segments.push(`GS*HC*${x12(submitterId,15)}*${x12(receiverId,15)}*${date8(now)}*${time4(now)}*${gsControl}*X*${implementationVersion}`);
  segments.push(`ST*837*${stControl}*${implementationVersion}`);
  segments.push(`BHT*0019*00*${x12(input.submissionNumber,30)}*${date8(now)}*${time4(now)}*CH`);
  segments.push(`NM1*41*2*${x12(providerName,60)}*****46*${x12(submitterId,30)}`);
  if (config.contactName && config.contactPhone) segments.push(`PER*IC*${x12(config.contactName,60)}*TE*${x12(config.contactPhone,30)}`);
  segments.push(`NM1*40*2*${x12(payerName,60)}*****46*${x12(receiverId,30)}`);
  let hl = 1;
  segments.push(`HL*${hl}**20*1`);
  segments.push(`NM1*85*2*${x12(providerName,60)}*****XX*${x12(providerNpi,20)}`);
  if (providerTaxonomy) segments.push(`PRV*BI*PXC*${x12(providerTaxonomy,30)}`);
  segments.push(`N3*${x12(config.billingAddress1,55)}${config.billingAddress2 ? `*${x12(config.billingAddress2,55)}` : ''}`);
  segments.push(`N4*${x12(config.billingCity,30)}*${x12(config.billingState,2)}*${x12(config.billingZip,15)}`);
  if (providerTaxId) segments.push(`REF*EI*${x12(providerTaxId,20)}`);

  const submissionLines: ClaimCandidate['lines'] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const patient = object(event.patientJson);
    const doddDocument = Object.keys(object(event.doddDocumentJson)).length ? object(event.doddDocumentJson) : null;
    const name = patientName(patient);
    const memberId = patientMemberId(patient, event, doddDocument);
    const serviceCode = clean(event.serviceCode, 30);
    const serviceDate = date8(event.serviceDate);
    const units = num(event.units);
    const charged = num(event.estimatedAmount);
    const eventMeta = object(event.metadata);
    const diagnoses = stringArray(eventMeta.diagnosisCodes).length ? stringArray(eventMeta.diagnosisCodes) : config.defaultDiagnosisCodes;
    const placeOfService = first(eventMeta.placeOfServiceCode, eventMeta.placeOfService, config.defaultPlaceOfService);
    const modifiers = stringArray(eventMeta.modifiers).slice(0, 4);
    const revenueCode = first(eventMeta.revenueCode, config.defaultRevenueCode);
    const claimControlNumber = `S${String(index + 1).padStart(5,'0')}${x12(input.submissionNumber,12).replace(/[^A-Za-z0-9]/g,'').slice(-12)}`.slice(0, 20);

    if (!memberId) errors.push(`Service event ${event.id}: Medicaid/member ID is required.`);
    if (!name.firstName || !name.lastName) errors.push(`Service event ${event.id}: patient first and last name are required.`);
    if (!patientDob(patient)) errors.push(`Service event ${event.id}: patient date of birth is required.`);
    if (!serviceCode) errors.push(`Service event ${event.id}: service/HCPCS code is required.`);
    if (!serviceDate) errors.push(`Service event ${event.id}: service date is required.`);
    if (units === null || units <= 0) errors.push(`Service event ${event.id}: positive service units are required.`);
    if (charged === null || charged < 0) errors.push(`Service event ${event.id}: calculated/estimated charge is required before X12 generation.`);
    if (config.requireDiagnosisCodes && !diagnoses.length) errors.push(`Service event ${event.id}: at least one diagnosis code is required by this trading profile.`);
    if (input.format === '837P' && !placeOfService) errors.push(`Service event ${event.id}: place-of-service code is required for 837P.`);
    if (input.format === '837I' && !revenueCode) errors.push(`Service event ${event.id}: revenue code is required for 837I.`);

    hl += 1;
    segments.push(`HL*${hl}*1*22*0`);
    segments.push('SBR*P*18*******MC');
    segments.push(`NM1*IL*1*${x12(name.lastName,35)}*${x12(name.firstName,25)}*${x12(name.middleName,25)}***MI*${x12(memberId,30)}`);
    segments.push(`DMG*D8*${patientDob(patient)}*${patientSex(patient)}`);
    segments.push(`NM1*PR*2*${x12(payerName,60)}*****PI*${x12(payerId,30)}`);
    if (input.format === '837P') {
      segments.push(`CLM*${claimControlNumber}*${dollars(charged)}***${x12(placeOfService,2)}:B:1*Y*A*Y*Y`);
    } else {
      segments.push(`CLM*${claimControlNumber}*${dollars(charged)}***${x12(config.facilityTypeCode,2)}:A:${x12(config.claimFrequencyCode,1)}*Y*A*Y*Y`);
    }
    if (diagnoses.length) segments.push(`HI*${diagnoses.map((code, diagnosisIndex) => `${diagnosisIndex === 0 ? 'ABK' : 'ABF'}:${x12(code.replaceAll('.',''),12)}`).join('*')}`);
    segments.push('LX*1');
    const procedureComposite = ['HC', serviceCode, ...modifiers].map((v) => x12(v, 12)).join(':');
    if (input.format === '837P') segments.push(`SV1*${procedureComposite}*${dollars(charged)}*UN*${decimal(units)}***1`);
    else segments.push(`SV2*${x12(revenueCode,8)}*${procedureComposite}*${dollars(charged)}*UN*${decimal(units)}`);
    segments.push(`DTP*472*D8*${serviceDate}`);
    submissionLines.push({ serviceEventId: clean(event.id,160), claimControlNumber, patientMemberId: memberId, chargedAmount: charged ?? 0 });
  }

  const uniqueErrors = [...new Set(errors)];
  const uniqueWarnings = [...new Set(warnings)];
  const segmentCount = segments.length - 2 + 1;
  segments.push(`SE*${segmentCount + 1}*${stControl}`);
  segments.push(`GE*1*${gsControl}`);
  segments.push(`IEA*1*${isaControl}`);
  const payload = `${segments.join('~')}~`;
  return {
    format: input.format,
    implementationVersion,
    payload,
    payloadSha256: createHash('sha256').update(payload, 'utf8').digest('hex'),
    errors: uniqueErrors,
    warnings: uniqueWarnings,
    lines: submissionLines,
    metadata: {
      standardsBasis: 'HIPAA X12 5010 candidate; payer/Ohio companion-guide validation still required',
      directStateSubmissionConfigured: false,
      externalCertificationClaimed: false,
      batchNumber: batch.batchNumber,
      payerName,
      payerId,
      billingProviderNpi: providerNpi,
      eventCount: events.length,
    },
  };
}

export type Parsed835 = {
  traceNumber: string | null;
  paymentDate: string | null;
  totalPayment: number | null;
  claims: Array<{
    claimControlNumber: string;
    claimStatusCode: string | null;
    billedAmount: number | null;
    paidAmount: number | null;
    patientResponsibility: number | null;
    payerClaimControlNumber: string | null;
    adjustments: Array<{ groupCode: string; reasonCode: string; amount: number | null; quantity: number | null }>;
  }>;
};

export function parseBasic835(raw: string): Parsed835 {
  const segments = raw.replace(/[\r\n]+/g, '').split('~').map((segment) => segment.trim()).filter(Boolean);
  let traceNumber: string | null = null, paymentDate: string | null = null, totalPayment: number | null = null;
  const claims: Parsed835['claims'] = [];
  let current: Parsed835['claims'][number] | null = null;
  for (const segment of segments) {
    const parts = segment.split('*');
    if (parts[0] === 'BPR') totalPayment = num(parts[2]);
    if (parts[0] === 'TRN' && !traceNumber) traceNumber = clean(parts[2], 200) || null;
    if (parts[0] === 'DTM' && parts[1] === '405' && /^\d{8}$/.test(parts[2] || '')) paymentDate = `${parts[2].slice(0,4)}-${parts[2].slice(4,6)}-${parts[2].slice(6,8)}`;
    if (parts[0] === 'CLP') {
      current = {
        claimControlNumber: clean(parts[1], 120),
        claimStatusCode: clean(parts[2], 20) || null,
        billedAmount: num(parts[3]),
        paidAmount: num(parts[4]),
        patientResponsibility: num(parts[5]),
        payerClaimControlNumber: clean(parts[7], 120) || null,
        adjustments: [],
      };
      claims.push(current);
      continue;
    }
    if (parts[0] === 'CAS' && current) {
      const groupCode = clean(parts[1], 20);
      for (let index = 2; index < parts.length; index += 3) {
        const reasonCode = clean(parts[index], 20);
        if (!reasonCode) continue;
        current.adjustments.push({ groupCode, reasonCode, amount: num(parts[index + 1]), quantity: num(parts[index + 2]) });
      }
    }
  }
  return { traceNumber, paymentDate, totalPayment, claims };
}
