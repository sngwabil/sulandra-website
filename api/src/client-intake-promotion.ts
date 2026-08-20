import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { putSecureObject, scanBufferForMalware } from './secure-object-storage.js';

type PromotionAuth = {
  userId: string;
  organizationId: string;
  legalEntityId?: string;
  role?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
};

type IntakeSection = {
  sectionKey: string;
  sectionTitle: string;
  sectionGroup: string;
  status: string;
  reviewState: string;
  payload: unknown;
};

type IntakeAttachment = {
  id: string;
  sectionKey: string | null;
  documentType: string;
  title: string | null;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  content: Buffer;
  expirationDate: Date | string | null;
  notes: string | null;
};

type PromotionSummary = {
  admissionNoteId: string;
  carePlanId: string | null;
  medicationReconciliationId: string | null;
  medicationsMapped: number;
  medicationsPendingReview: number;
  medicationSchedulesMapped: number;
  documentsMapped: number;
  serviceAuthorizationsMapped: number;
  warnings: string[];
};

const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 20000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const lines = (value: unknown) => text(value, 100000).split(/\r?\n/).map(v => v.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
const dateText = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const valueText = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : null;
};
const numberValue = (value: unknown) => {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
const stableId = (...parts: Array<string | number | null | undefined>) => `ci_${createHash('sha256').update(parts.map(v => String(v ?? '')).join('|')).digest('hex').slice(0, 40)}`;
const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'document';

function sectionMap(sections: IntakeSection[]) {
  return new Map(sections.map(section => [section.sectionKey, obj(section.payload)]));
}

function renderValue(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(renderValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function admissionSummary(caseId: string, sections: IntakeSection[]) {
  const blocks = sections.map(section => {
    const fields = Object.entries(obj(section.payload))
      .map(([key, value]) => [key, renderValue(value)] as const)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    return `## ${section.sectionTitle}\nSection key: ${section.sectionKey}\nGroup: ${section.sectionGroup}\nCompletion: ${section.status}; review: ${section.reviewState}\n${fields || '(No values entered)'}`;
  });
  return `CLIENT INTAKE → SPIRE ADMISSION SUMMARY\nSource intake case: ${caseId}\nGenerated automatically after approval. Every intake section is retained below; native SPIRE modules are also populated where the submitted data is structured and clinically safe to promote. The original intake remains the source record.\n\n${blocks.join('\n\n')}`;
}

function parseDueTimes(raw: unknown) {
  const source = text(raw, 500);
  if (!source) return [] as string[];
  const normalized = source.split(/[,;/]+/).map(v => v.trim()).filter(Boolean).map(v => {
    const twelve = v.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (twelve) {
      let hour = Number(twelve[1]) % 12;
      if (twelve[3].toUpperCase() === 'PM') hour += 12;
      return `${String(hour).padStart(2, '0')}:${twelve[2]}`;
    }
    const compact = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (compact) {
      let hour = Number(compact[1]) % 12;
      if (compact[3].toUpperCase() === 'PM') hour += 12;
      return `${String(hour).padStart(2, '0')}:${compact[2] || '00'}`;
    }
    const twentyFour = v.match(/^(\d{1,2}):(\d{2})$/);
    if (twentyFour && Number(twentyFour[1]) <= 23 && Number(twentyFour[2]) <= 59) return `${String(Number(twentyFour[1])).padStart(2, '0')}:${twentyFour[2]}`;
    return '';
  }).filter(Boolean);
  return [...new Set(normalized)];
}

type ParsedMedication = {
  sourceLine: string;
  name: string;
  dose: string;
  route: string;
  frequency: string;
  dueTimes: string[];
  prescriber: string;
  startDate: string | null;
  endDate: string | null;
  prn: boolean;
  prnIndication: string;
  completeForOrder: boolean;
};

function parseMedicationLine(sourceLine: string, prn = false): ParsedMedication {
  const parts = sourceLine.split('|').map(v => v.trim());
  const [name = '', dose = '', route = '', frequencyRaw = '', times = '', prescriber = '', startRaw = '', endRaw = '', indicationRaw = ''] = parts;
  const frequency = prn ? (frequencyRaw || 'PRN') : frequencyRaw;
  return {
    sourceLine,
    name,
    dose,
    route,
    frequency,
    dueTimes: prn ? [] : parseDueTimes(times),
    prescriber,
    startDate: dateText(startRaw),
    endDate: dateText(endRaw),
    prn,
    prnIndication: prn ? indicationRaw : '',
    completeForOrder: Boolean(name && dose && route && frequency),
  };
}

async function ensureAdmissionNote(prisma: PrismaClient, auth: PromotionAuth, intakeCaseId: string, patientId: string, body: string) {
  const entityId = auth.legalEntityId!;
  const noteId = stableId(auth.organizationId, entityId, intakeCaseId, 'ADMISSION_NOTE');
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalNote"("id","organizationId","legalEntityId","patientId","noteType","title","status","authorUserId")
     VALUES($1,$2,$3,$4,'ADMISSION_INTAKE','Client Intake Admission Summary','DRAFT',$5)
     ON CONFLICT("id") DO UPDATE SET "title"=EXCLUDED."title","updatedAt"=NOW()`,
    noteId, auth.organizationId, entityId, patientId, auth.userId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalNoteVersion"("id","organizationId","legalEntityId","noteId","version","body","changeReason","createdById")
     VALUES($1,$2,$3,$4,1,$5,'Automatically promoted from approved Client Intake',$6)
     ON CONFLICT("noteId","version") DO UPDATE SET "body"=EXCLUDED."body","changeReason"=EXCLUDED."changeReason"`,
    stableId(noteId, 'VERSION', 1), auth.organizationId, entityId, noteId, body, auth.userId,
  );
  return noteId;
}

async function findSeededCarePlan(prisma: PrismaClient, auth: PromotionAuth, intakeCaseId: string, patientId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "SpireCarePlan" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "sourceIntakeCaseId"=$4 ORDER BY "createdAt" DESC LIMIT 1`,
    auth.organizationId, auth.legalEntityId, patientId, intakeCaseId,
  );
  return rows[0]?.id || null;
}

async function ensureMedications(
  prisma: PrismaClient,
  auth: PromotionAuth,
  intakeCaseId: string,
  patientId: string,
  payloads: Map<string, Record<string, unknown>>,
  warnings: string[],
) {
  const medication = payloads.get('medications_reconciliation') || {};
  if (medication.noCurrentMedications === true || (!text(medication.medications) && !text(medication.prnMedications))) {
    return { reconciliationId: null, mapped: 0, pending: 0, schedules: 0 };
  }

  const entityId = auth.legalEntityId!;
  const reconciliationId = stableId(auth.organizationId, entityId, intakeCaseId, 'MED_RECON');
  const regular = lines(medication.medications).map(line => parseMedicationLine(line, false));
  const prn = lines(medication.prnMedications).map(line => parseMedicationLine(line, true));
  const all = [...regular, ...prn];
  const isLicensedReviewer = ['RN', 'LPN', 'DELEGATING_NURSE'].includes(String(auth.role || '').toUpperCase());

  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireMedicationReconciliation"("id","organizationId","legalEntityId","patientId","status","summary")
     VALUES($1,$2,$3,$4,'IN_PROGRESS',$5::jsonb)
     ON CONFLICT("id") DO UPDATE SET "summary"=EXCLUDED."summary","updatedAt"=NOW()`,
    reconciliationId, auth.organizationId, entityId, patientId,
    JSON.stringify({
      source: 'CLIENT_INTAKE',
      intakeCaseId,
      pharmacy: text(medication.pharmacy),
      administrationSupport: text(medication.administrationSupport),
      controlledMedications: text(medication.controlledMedications),
      notes: text(medication.medicationNotes),
    }),
  );

  let mapped = 0;
  let pending = 0;
  let schedules = 0;

  for (let index = 0; index < all.length; index += 1) {
    const med = all[index];
    let orderId: string | null = null;
    let reason = '';

    // Intake data is never converted into an active medication order unless the
    // approving reviewer is licensed for medication ordering/reconciliation and
    // the minimum order fields are present. Missing values are never invented.
    if (isLicensedReviewer && med.completeForOrder) {
      orderId = stableId(auth.organizationId, entityId, patientId, intakeCaseId, 'MEDICATION', index, med.sourceLine);
      const effectiveStart = med.startDate || new Date().toISOString().slice(0, 10);
      const instructions = [
        med.prescriber ? `Prescriber/source prescriber: ${med.prescriber}` : '',
        med.prn && med.prnIndication ? `PRN indication: ${med.prnIndication}` : '',
        `Source: approved Client Intake ${intakeCaseId}`,
      ].filter(Boolean).join('\n');

      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireMedicationOrder"("id","organizationId","legalEntityId","patientId","name","dose","route","frequency","dueTimes","instructions","status","startDate","endDate","orderedById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'ACTIVE',$11::date,$12::date,$13)
         ON CONFLICT("id") DO UPDATE SET "legalEntityId"=EXCLUDED."legalEntityId","name"=EXCLUDED."name","dose"=EXCLUDED."dose","route"=EXCLUDED."route","frequency"=EXCLUDED."frequency","dueTimes"=EXCLUDED."dueTimes","instructions"=EXCLUDED."instructions","startDate"=EXCLUDED."startDate","endDate"=EXCLUDED."endDate","updatedAt"=NOW()`,
        orderId, auth.organizationId, entityId, patientId, med.name, med.dose, med.route, med.frequency,
        JSON.stringify(med.dueTimes), instructions, effectiveStart, med.endDate, auth.userId,
      );
      mapped += 1;
      reason = 'Mapped to an active medication order from a licensed-reviewer-approved intake; medication reconciliation remains open for final clinical verification.';

      if (!med.prn) {
        for (const dueTime of med.dueTimes) {
          const scheduleId = stableId(orderId, 'SCHEDULE', dueTime);
          await prisma.$executeRawUnsafe(
            `INSERT INTO "SpireMedicationSchedule"("id","organizationId","legalEntityId","patientId","medicationOrderId","scheduledTime","active")
             VALUES($1,$2,$3,$4,$5,$6::time,TRUE)
             ON CONFLICT("id") DO UPDATE SET "legalEntityId"=EXCLUDED."legalEntityId","scheduledTime"=EXCLUDED."scheduledTime","active"=TRUE`,
            scheduleId, auth.organizationId, entityId, patientId, orderId, dueTime,
          );
          schedules += 1;
        }
      }
    } else {
      pending += 1;
      reason = !isLicensedReviewer
        ? `Pending nursing medication reconciliation because the approving reviewer was not RN/LPN/Delegating Nurse. Original intake line: ${med.sourceLine}`
        : `Pending nursing medication reconciliation because required medication order fields are incomplete. Original intake line: ${med.sourceLine}`;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireMedicationReconciliationItem"("id","organizationId","legalEntityId","reconciliationId","medicationOrderId","medicationName","source","decision","reason")
       VALUES($1,$2,$3,$4,$5,$6,'CLIENT_INTAKE','CONTINUE',$7)
       ON CONFLICT("id") DO UPDATE SET "legalEntityId"=EXCLUDED."legalEntityId","medicationOrderId"=EXCLUDED."medicationOrderId","medicationName"=EXCLUDED."medicationName","reason"=EXCLUDED."reason"`,
      stableId(reconciliationId, 'ITEM', index, med.sourceLine), auth.organizationId, entityId, reconciliationId,
      orderId, med.name || med.sourceLine.slice(0, 250), reason,
    );
  }

  if (!isLicensedReviewer && all.length) warnings.push('Medication list was preserved in medication reconciliation, but no active eMAR orders were created because approval was not performed by an RN, LPN, or Delegating Nurse.');
  if (all.some(med => !med.completeForOrder)) warnings.push('One or more medication lines are incomplete. Their original intake text is preserved in medication reconciliation and requires nursing verification before eMAR activation.');
  if (regular.some(med => med.completeForOrder && !med.dueTimes.length)) warnings.push('One or more scheduled medications have no parseable administration time. The medication order is preserved, but timed eMAR schedule rows require review.');

  return { reconciliationId, mapped, pending, schedules };
}

async function ensureDocuments(
  prisma: PrismaClient,
  auth: PromotionAuth,
  intakeCaseId: string,
  patientId: string,
  attachments: IntakeAttachment[],
) {
  let mapped = 0;
  for (const attachment of attachments) {
    const documentId = stableId(auth.organizationId, auth.legalEntityId, patientId, intakeCaseId, 'DOCUMENT', attachment.id);
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "SpireClinicalDocument" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 LIMIT 1`,
      auth.organizationId, auth.legalEntityId, patientId, documentId,
    );
    if (existing[0]) {
      mapped += 1;
      continue;
    }

    const scan = await scanBufferForMalware(attachment.content);
    if (scan.status === 'INFECTED') {
      throw Object.assign(new Error(`Client Intake attachment ${attachment.originalFileName} was blocked by malware scanning: ${scan.signature || 'infected file'}`), { status: 422 });
    }

    const key = `spire/${auth.organizationId}/${patientId}/intake-${safeSegment(intakeCaseId)}/${documentId}/v1-${safeSegment(attachment.originalFileName)}`;
    const stored = await putSecureObject({
      key,
      body: attachment.content,
      contentType: attachment.mimeType || 'application/octet-stream',
      metadata: { patient: patientId, document: documentId, intake: intakeCaseId, source: 'client-intake' },
    });
    const description = [
      attachment.notes,
      `Promoted automatically from Client Intake ${intakeCaseId}`,
      attachment.sectionKey ? `Intake section: ${attachment.sectionKey}` : '',
    ].filter(Boolean).join('\n');

    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireClinicalDocument"("id","organizationId","legalEntityId","patientId","category","title","description","mimeType","storageKey","sha256","sizeBytes","storageBucket","etag","encryption","kmsKeyId","ivBase64","authTagBase64","malwareScanStatus","malwareScanDetail","sensitivity","source","reviewStatus","expirationDate","createdById")
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'CLINICAL','CLIENT_INTAKE','PENDING',$20::date,$21)`,
      documentId, auth.organizationId, auth.legalEntityId, patientId, attachment.documentType || 'INTAKE',
      attachment.title || attachment.originalFileName, description, attachment.mimeType || 'application/octet-stream',
      stored.key, stored.sha256, stored.sizeBytes, stored.bucket, stored.etag, stored.encryption, stored.kmsKeyId,
      stored.ivBase64, stored.authTagBase64, scan.status, scan.detail, dateText(attachment.expirationDate), auth.userId,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireClinicalDocumentVersion"("id","organizationId","legalEntityId","documentId","version","storageKey","sha256","mimeType","sizeBytes","createdById","storageBucket","etag","encryption","kmsKeyId","ivBase64","authTagBase64","malwareScanStatus","malwareScanDetail")
       VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      stableId(documentId, 'VERSION', 1), auth.organizationId, auth.legalEntityId, documentId, stored.key, stored.sha256,
      attachment.mimeType || 'application/octet-stream', stored.sizeBytes, auth.userId, stored.bucket, stored.etag,
      stored.encryption, stored.kmsKeyId, stored.ivBase64, stored.authTagBase64, scan.status, scan.detail,
    );
    mapped += 1;
  }
  return mapped;
}

async function ensureServiceAuthorization(
  prisma: PrismaClient,
  auth: PromotionAuth,
  intakeCaseId: string,
  patientId: string,
  payloads: Map<string, Record<string, unknown>>,
  carePlanId: string | null,
  warnings: string[],
) {
  const authorization = payloads.get('service_authorization') || {};
  const serviceName = text(authorization.authorizedService, 250);
  if (!serviceName) return 0;

  const serviceCode = text(authorization.serviceCode, 80);
  const startDate = dateText(authorization.authorizationStart);
  const endDate = dateText(authorization.authorizationEnd);
  const units = numberValue(authorization.authorizedUnits);
  if (!serviceCode || !startDate || !endDate || units == null || units <= 0) {
    warnings.push('Service authorization information is retained in the admission summary, but a billable native authorization was not activated because service code, valid dates, and authorized units greater than zero are all required.');
    return 0;
  }

  const entityId = auth.legalEntityId!;
  const authorizationNumber = text(authorization.authorizationNumber, 120) || null;
  let authorizationId = stableId(auth.organizationId, entityId, intakeCaseId, 'SERVICE_AUTHORIZATION', serviceCode);

  if (authorizationNumber) {
    const sameNumber = await prisma.$queryRawUnsafe<Array<{ id: string; patientId: string }>>(
      `SELECT "id","patientId" FROM "SpireServiceAuthorization" WHERE "organizationId"=$1 AND "authorizationNumber"=$2 LIMIT 1`,
      auth.organizationId, authorizationNumber,
    );
    if (sameNumber[0] && sameNumber[0].patientId !== patientId) {
      warnings.push(`Authorization ${authorizationNumber} already exists on a different SPIRE chart. Intake values were preserved but not reassigned automatically.`);
      return 0;
    }
    if (sameNumber[0]) authorizationId = sameNumber[0].id;
  }

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireServiceAuthorization"("id","organizationId","legalEntityId","patientId","authorizationNumber","payer","waiverType","serviceCode","serviceName","unitType","authorizedUnits","startDate","endDate","status","notes","createdById")
     VALUES($1,$2,$3,$4,$5,'MEDICAID',$6,$7,$8,'UNIT',$9,$10::date,$11::date,'ACTIVE',$12,$13)
     ON CONFLICT("id") DO UPDATE SET "legalEntityId"=EXCLUDED."legalEntityId","authorizationNumber"=EXCLUDED."authorizationNumber","waiverType"=EXCLUDED."waiverType","serviceCode"=EXCLUDED."serviceCode","serviceName"=EXCLUDED."serviceName","authorizedUnits"=EXCLUDED."authorizedUnits","startDate"=EXCLUDED."startDate","endDate"=EXCLUDED."endDate","notes"=EXCLUDED."notes","updatedAt"=NOW()`,
      authorizationId, auth.organizationId, entityId, patientId, authorizationNumber,
      text(payloads.get('insurance_medicaid')?.waiverType, 120) || null, serviceCode, serviceName, units, startDate, endDate,
      [
        text(authorization.frequency),
        text(authorization.providerAssignment),
        text(authorization.authorizationNotes),
        `Source: Client Intake ${intakeCaseId}`,
      ].filter(Boolean).join('\n'), auth.userId,
    );
  } catch (e) {
    const cols = await prisma.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'SpireServiceAuthorization' AND is_nullable = 'NO' AND column_default IS NULL");
    throw new Error("MISSING REQUIRED COLUMNS DUMP: " + JSON.stringify(cols) + " Original error: " + e);
  }

  if (carePlanId) {
    const linkId = stableId(carePlanId, 'SERVICE_LINK', authorizationId);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireCarePlanServiceLink"("id","organizationId","legalEntityId","patientId","carePlanId","authorizationId","serviceCode","serviceName","approvedServiceType","startsAt","endsAt","authorizedUnits","active")
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,TRUE)
       ON CONFLICT("id") DO UPDATE SET "legalEntityId"=EXCLUDED."legalEntityId","authorizationId"=EXCLUDED."authorizationId","serviceCode"=EXCLUDED."serviceCode","serviceName"=EXCLUDED."serviceName","startsAt"=EXCLUDED."startsAt","endsAt"=EXCLUDED."endsAt","authorizedUnits"=EXCLUDED."authorizedUnits","active"=TRUE`,
      linkId, auth.organizationId, entityId, patientId, carePlanId, authorizationId, serviceCode, serviceName,
      text(authorization.providerAssignment, 120) || null, startDate, endDate, units,
    );
  }

  return 1;
}

async function logPromotion(
  prisma: PrismaClient,
  auth: PromotionAuth,
  intakeCaseId: string,
  patientId: string,
  summary: PromotionSummary,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ClientIntakeEvent"("id","organizationId","legalEntityId","intakeCaseId","actorUserId","eventType","details","ipAddress","userAgent")
     SELECT $1,$2,$3,$4,$5,'CHART_PROMOTION_COMPLETED',$6::jsonb,$7,$8
     WHERE NOT EXISTS(SELECT 1 FROM "ClientIntakeEvent" WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "intakeCaseId"=$4 AND "eventType"='CHART_PROMOTION_COMPLETED')`,
    stableId(intakeCaseId, 'PROMOTION_EVENT'), auth.organizationId, auth.legalEntityId, intakeCaseId, auth.userId,
    JSON.stringify({ patientId, ...summary }), auth.ipAddress ?? null, auth.userAgent ?? null,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireClinicalAuditEvent"("id","organizationId","legalEntityId","actorUserId","actorEmail","clientId","action","resourceType","resourceId","afterValue","ipAddress","userAgent")
     SELECT $1,$2,$3,$4,$5,$6,'PROMOTE_CLIENT_INTAKE','CLIENT_INTAKE',$7,$8::jsonb,$9,$10
     WHERE NOT EXISTS(SELECT 1 FROM "SpireClinicalAuditEvent" WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "clientId"=$6 AND "action"='PROMOTE_CLIENT_INTAKE' AND "resourceId"=$7)`,
    stableId(intakeCaseId, 'PROMOTION_AUDIT'), auth.organizationId, auth.legalEntityId, auth.userId, auth.email ?? null,
    patientId, intakeCaseId, JSON.stringify(summary), auth.ipAddress ?? null, auth.userAgent ?? null,
  );
}

/**
 * Finish an approved intake's automatic SPIRE mapping.
 *
 * Patient identity/enrollment, contacts, allergies, diagnoses and risk flags are
 * mapped by client-intake-routes.ts. The approval database trigger seeds the
 * DRAFT ISP/care plan. This service then preserves every intake field in an
 * admission summary, maps medications safely, promotes uploaded records into
 * encrypted clinical documents, creates complete service authorizations, links
 * them to the seeded plan, and records an immutable promotion audit trail.
 *
 * Stable IDs make this deliberately retry-safe because secure object storage and
 * PostgreSQL cannot share a single transaction.
 */
export async function promoteApprovedIntakeToSpire(
  prisma: PrismaClient,
  auth: PromotionAuth,
  intakeCaseId: string,
  patientId: string,
): Promise<PromotionSummary> {
  if (!auth.legalEntityId) throw Object.assign(new Error('Select a Sulandra company before promoting Client Intake to SPIRE'), { status: 409 });

  const caseRows = await prisma.$queryRawUnsafe<Array<{ status: string; patientId: string | null }>>(
    `SELECT "status","patientId" FROM "ClientIntakeCase" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,
    auth.organizationId, auth.legalEntityId, intakeCaseId,
  );
  if (!caseRows[0] || caseRows[0].status !== 'APPROVED' || caseRows[0].patientId !== patientId) {
    throw Object.assign(new Error('Client Intake must be approved and linked to this SPIRE patient before automatic chart promotion runs'), { status: 409 });
  }

  const [sections, attachments] = await Promise.all([
    prisma.$queryRawUnsafe<IntakeSection[]>(
      `SELECT "sectionKey","sectionTitle","sectionGroup","status","reviewState","payload" FROM "ClientIntakeSection" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "intakeCaseId"=$3 ORDER BY "createdAt","sectionKey"`,
      auth.organizationId, auth.legalEntityId, intakeCaseId,
    ),
    prisma.$queryRawUnsafe<IntakeAttachment[]>(
      `SELECT "id","sectionKey","documentType","title","originalFileName","mimeType","sizeBytes","sha256","content","expirationDate","notes" FROM "ClientIntakeAttachment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "intakeCaseId"=$3 AND "status"='ACTIVE' ORDER BY "createdAt"`,
      auth.organizationId, auth.legalEntityId, intakeCaseId,
    ),
  ]);

  const payloads = sectionMap(sections);
  const warnings: string[] = [];
  const carePlanId = await findSeededCarePlan(prisma, auth, intakeCaseId, patientId);
  if (!carePlanId) warnings.push('The approval completed but no intake-seeded DRAFT care plan was found. Intake data is preserved in the admission summary and requires care-plan review.');

  const admissionNoteId = await ensureAdmissionNote(prisma, auth, intakeCaseId, patientId, admissionSummary(intakeCaseId, sections));
  const medications = await ensureMedications(prisma, auth, intakeCaseId, patientId, payloads, warnings);
  const documentsMapped = await ensureDocuments(prisma, auth, intakeCaseId, patientId, attachments);
  const serviceAuthorizationsMapped = await ensureServiceAuthorization(prisma, auth, intakeCaseId, patientId, payloads, carePlanId, warnings);

  const summary: PromotionSummary = {
    admissionNoteId,
    carePlanId,
    medicationReconciliationId: medications.reconciliationId,
    medicationsMapped: medications.mapped,
    medicationsPendingReview: medications.pending,
    medicationSchedulesMapped: medications.schedules,
    documentsMapped,
    serviceAuthorizationsMapped,
    warnings,
  };
  await logPromotion(prisma, auth, intakeCaseId, patientId, summary);
  return summary;
}
