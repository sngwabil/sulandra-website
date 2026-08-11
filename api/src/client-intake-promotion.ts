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
const dateText = (value: unknown) => { const valueText = text(value, 20); return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : null; };
const numberValue = (value: unknown) => { const n = Number(String(value ?? '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : null; };
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
    const payload = obj(section.payload);
    const fields = Object.entries(payload)
      .map(([key, value]) => [key, renderValue(value)] as const)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    return `## ${section.sectionTitle}\nSection key: ${section.sectionKey}\nCompletion: ${section.status}; review: ${section.reviewState}\n${fields || '(No values entered)'}`;
  });
  return `CLIENT INTAKE → SPIRE ADMISSION SUMMARY\nSource intake case: ${caseId}\nGenerated automatically from the approved admission packet. Original intake remains the source record.\n\n${blocks.join('\n\n')}`;
}

function parseDueTimes(raw: unknown) {
  const source = text(raw, 500);
  if (!source) return [] as string[];
  const normalized = source
    .split(/[,;/]+/)
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => {
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
    })
    .filter(Boolean);
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
  const startDate = dateText(startRaw);
  const endDate = dateText(endRaw);
  const prnIndication = prn ? indicationRaw : '';
  return {
    sourceLine,
    name,
    dose,
    route,
    frequency,
    dueTimes: prn ? [] : parseDueTimes(times),
    prescriber,
    startDate,
    endDate,
    prn,
    prnIndication,
    completeForOrder: Boolean(name && dose && route && frequency),
  };
}

function carePlanContent(payloads: Map<string, Record<string, unknown>>) {
  const important = payloads.get('important_to_for') || {};
  const communication = payloads.get('communication') || {};
  const routines = payloads.get('preferences_routines') || {};
  const rights = payloads.get('rights_choice_privacy') || {};
  const plan = payloads.get('ohioisp_person_centered_plan') || {};
  const nutrition = payloads.get('nutrition_swallowing') || {};
  const behavior = payloads.get('behavior_support') || payloads.get('behavioral_mental_health') || {};
  const safety = payloads.get('safety_emergency') || {};
  const transportation = payloads.get('transportation') || {};
  const delegation = payloads.get('nursing_delegation') || {};
  return {
    effectiveDate: dateText(plan.planEffectiveDate),
    annualReviewDate: dateText(plan.planReviewDate),
    personCenteredSummary: [text(plan.assessedNeeds), text(plan.outcomes), text(plan.supports)].filter(Boolean).join('\n\n'),
    importantTo: text(important.importantTo),
    importantFor: text(important.importantFor),
    communicationPlan: [text(communication.primaryMethod), text(communication.receptiveCommunication), text(communication.expressiveCommunication), text(communication.assistiveCommunication), text(communication.interpreterNeeds), text(communication.decisionSupport)].filter(Boolean).join('\n'),
    transportationPlan: [text(transportation.transportationNeeds), text(transportation.transportationPlan), text(transportation.mobilityTransportation)].filter(Boolean).join('\n'),
    mealPlan: [text(nutrition.dietOrder), text(nutrition.texture), text(nutrition.liquidConsistency), text(nutrition.swallowingRisk), text(nutrition.feedingSupport), text(nutrition.fluidPlan)].filter(Boolean).join('\n'),
    behaviorSupportPlan: [text(behavior.behaviorSupportPlan), text(behavior.behavioralBaseline), text(behavior.triggers), text(behavior.deescalation), text(behavior.supportStrategies)].filter(Boolean).join('\n'),
    emergencyPlan: [text(safety.emergencyPlan), text(safety.emergencyInstructions), text(safety.elopementRisk), text(safety.chokingRisk), text(plan.risksInPlan)].filter(Boolean).join('\n'),
    rightsModifications: text(rights.rightsRestrictions),
    restrictiveMeasures: [text(rights.rightsRestrictions), text(behavior.restrictiveMeasures)].filter(Boolean).join('\n'),
    nursingDelegationInstructions: [text(delegation.delegationInstructions), text(delegation.nursingDelegationInstructions)].filter(Boolean).join('\n'),
    routines: [text(routines.morningRoutine), text(routines.eveningRoutine), text(routines.sleepPreferences), text(routines.likesInterests), text(routines.dislikes), text(routines.cultureFaith), text(routines.sensoryPreferences)].filter(Boolean).join('\n'),
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

async function ensureCarePlan(prisma: PrismaClient, auth: PromotionAuth, intakeCaseId: string, patientId: string, payloads: Map<string, Record<string, unknown>>) {
  const entityId = auth.legalEntityId!;
  const planPayload = payloads.get('ohioisp_person_centered_plan') || {};
  const person = payloads.get('important_to_for') || {};
  const goalsPayload = payloads.get('goals_outcomes') || {};
  const content = carePlanContent(payloads);
  const hasPlanData = Object.values(content).some(Boolean) || Object.keys(planPayload).length > 0 || Object.keys(goalsPayload).length > 0;
  if (!hasPlanData) return null;

  const carePlanId = stableId(auth.organizationId, entityId, intakeCaseId, 'CARE_PLAN');
  const existing = await prisma.$queryRawUnsafe<Array<{ version: number }>>(
    `SELECT COALESCE("version",1)::int AS version FROM "SpireCarePlan" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4 LIMIT 1`,
    auth.organizationId, entityId, patientId, carePlanId,
  );
  let version = existing[0]?.version;
  if (!version) {
    const versions = await prisma.$queryRawUnsafe<Array<{ version: number }>>(
      `SELECT COALESCE(MAX(COALESCE("version",1)),0)::int+1 AS version FROM "SpireCarePlan" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "planType"='ISP'`,
      auth.organizationId, entityId, patientId,
    );
    version = versions[0]?.version || 1;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireCarePlan"("id","organizationId","legalEntityId","patientId","title","planType","version","effectiveDate","annualReviewDate","personCenteredSummary","importantTo","importantFor","communicationPlan","transportationPlan","mealPlan","behaviorSupportPlan","emergencyPlan","rightsModifications","restrictiveMeasures","nursingDelegationInstructions","status","createdById")
       VALUES($1,$2,$3,$4,$5,'ISP',$6,$7::date,$8::date,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'DRAFT',$20)`,
      carePlanId, auth.organizationId, entityId, patientId,
      text(planPayload.planTitle, 250) || 'Individual Service Plan — Draft from Client Intake',
      version, content.effectiveDate, content.annualReviewDate, content.personCenteredSummary,
      content.importantTo, content.importantFor, content.communicationPlan, content.transportationPlan,
      content.mealPlan, content.behaviorSupportPlan, content.emergencyPlan, content.rightsModifications,
      content.restrictiveMeasures, content.nursingDelegationInstructions, auth.userId,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE "SpireCarePlan" SET "effectiveDate"=$1::date,"annualReviewDate"=$2::date,"personCenteredSummary"=$3,"importantTo"=$4,"importantFor"=$5,"communicationPlan"=$6,"transportationPlan"=$7,"mealPlan"=$8,"behaviorSupportPlan"=$9,"emergencyPlan"=$10,"rightsModifications"=$11,"restrictiveMeasures"=$12,"nursingDelegationInstructions"=$13,"updatedAt"=NOW() WHERE "organizationId"=$14 AND "legalEntityId"=$15 AND "patientId"=$16 AND "id"=$17`,
      content.effectiveDate, content.annualReviewDate, content.personCenteredSummary, content.importantTo,
      content.importantFor, content.communicationPlan, content.transportationPlan, content.mealPlan,
      content.behaviorSupportPlan, content.emergencyPlan, content.rightsModifications, content.restrictiveMeasures,
      content.nursingDelegationInstructions, auth.organizationId, entityId, patientId, carePlanId,
    );
  }

  const snapshotRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "SpireCarePlan" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "patientId"=$3 AND "id"=$4`,
    auth.organizationId, entityId, patientId, carePlanId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireCarePlanVersion"("id","organizationId","legalEntityId","carePlanId","version","snapshot","reason","createdById")
     VALUES($1,$2,$3,$4,$5,$6::jsonb,'Draft seeded automatically from approved Client Intake',$7)
     ON CONFLICT("carePlanId","version") DO UPDATE SET "snapshot"=EXCLUDED."snapshot","reason"=EXCLUDED."reason"`,
    stableId(carePlanId, 'VERSION', version), auth.organizationId, entityId, carePlanId, version,
    JSON.stringify(snapshotRows[0] || {}), auth.userId,
  );

  const goalLines = [
    ...lines(goalsPayload.lifeGoals),
    ...lines(goalsPayload.serviceGoals),
    ...lines(goalsPayload.independenceGoals),
    ...lines(goalsPayload.communityGoals),
    ...lines(goalsPayload.employmentEducationGoals),
  ];
  const uniqueGoals = [...new Set(goalLines.map(v => v.trim()).filter(Boolean))];
  for (let index = 0; index < uniqueGoals.length; index += 1) {
    const goal = uniqueGoals[index];
    const goalId = stableId(carePlanId, 'GOAL', index, goal);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireCarePlanGoal"("id","organizationId","legalEntityId","patientId","carePlanId","title","desiredOutcome","status","progressPercent","startsAt","reviewDate","createdById")
       VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE',0,$8::date,$9::date,$10)
       ON CONFLICT("id") DO UPDATE SET "title"=EXCLUDED."title","desiredOutcome"=EXCLUDED."desiredOutcome","updatedAt"=NOW()`,
      goalId, auth.organizationId, entityId, patientId, carePlanId, goal.slice(0, 250), goal,
      content.effectiveDate, content.annualReviewDate, auth.userId,
    );
  }

  const supportText = [text(planPayload.supports), text(person.successfulSupport)].filter(Boolean).join('\n\n');
  if (supportText) {
    const interventionId = stableId(carePlanId, 'INTERVENTION', 'INTAKE_SUPPORTS');
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireCarePlanIntervention"("id","organizationId","legalEntityId","patientId","carePlanId","title","instructions","frequency","responsibleRole","serviceType","createdById")
       VALUES($1,$2,$3,$4,$5,'Intake-identified supports',$6,$7,$8,$9,$10)
       ON CONFLICT("id") DO UPDATE SET "instructions"=EXCLUDED."instructions","updatedAt"=NOW()`,
      interventionId, auth.organizationId, entityId, patientId, carePlanId, supportText,
      text(payloads.get('service_authorization')?.frequency, 120) || null,
      'Assigned care team', text(payloads.get('service_authorization')?.authorizedService, 120) || null, auth.userId,
    );
  }

  return carePlanId;
}

async function ensureMedications(prisma: PrismaClient, auth: PromotionAuth, intakeCaseId: string, patientId: string, payloads: Map<string, Record<string, unknown>>, warnings: string[]) {
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
     ON CONFLICT("id") DO UPDATE SET "summary"=EXCLUDED."summary"`,
    reconciliationId, auth.organizationId, entityId, patientId,
    JSON.stringify({ source: 'CLIENT_INTAKE', intakeCaseId, pharmacy: text(medication.pharmacy), administrationSupport: text(medication.administrationSupport), notes: text(medication.medicationNotes) }),
  );

  let mapped = 0;
  let pending = 0;
  let schedules = 0;
  for (let index = 0; index < all.length; index += 1) {
    const med = all[index];
    const medicationOrderId = stableId(auth.organizationId, patientId, intakeCaseId, 'MEDICATION', index, med.sourceLine);
    const status = med.completeForOrder && isLicensedReviewer ? 'ACTIVE' : 'PENDING_VERIFICATION';
    const effectiveStart = med.startDate || (status === 'ACTIVE' ? new Date().toISOString().slice(0, 10) : null);
    let orderId: string | null = null;

    if (med.completeForOrder && effectiveStart) {
      const instructions = [
        med.prescriber ? `Prescriber: ${med.prescriber}` : '',
        med.prn && med.prnIndication ? `PRN indication: ${med.prnIndication}` : '',
        `Source: approved Client Intake ${intakeCaseId}`,
      ].filter(Boolean).join('\n');
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireMedicationOrder"("id","organizationId","patientId","name","dose","route","frequency","dueTimes","instructions","status","startDate","endDate","orderedById")
         VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8='' THEN ARRAY[]::text[] ELSE string_to_array($8,',') END,$9,$10,$11::date,$12::date,$13)
         ON CONFLICT("id") DO UPDATE SET "name"=EXCLUDED."name","dose"=EXCLUDED."dose","route"=EXCLUDED."route","frequency"=EXCLUDED."frequency","dueTimes"=EXCLUDED."dueTimes","instructions"=EXCLUDED."instructions","status"=EXCLUDED."status","startDate"=EXCLUDED."startDate","endDate"=EXCLUDED."endDate","updatedAt"=NOW()`,
        medicationOrderId, auth.organizationId, patientId, med.name, med.dose, med.route, med.frequency,
        med.dueTimes.join(','), instructions, status, effectiveStart, med.endDate, auth.userId,
      );
      orderId = medicationOrderId;
      if (status === 'ACTIVE') mapped += 1; else pending += 1;

      if (status === 'ACTIVE' && !med.prn) {
        for (const dueTime of med.dueTimes) {
          const scheduleId = stableId(medicationOrderId, 'SCHEDULE', dueTime);
          await prisma.$executeRawUnsafe(
            `INSERT INTO "SpireMedicationSchedule"("id","organizationId","legalEntityId","patientId","medicationOrderId","scheduledTime","active")
             VALUES($1,$2,$3,$4,$5,$6::time,TRUE)
             ON CONFLICT("id") DO UPDATE SET "scheduledTime"=EXCLUDED."scheduledTime","active"=TRUE`,
            scheduleId, auth.organizationId, entityId, patientId, medicationOrderId, dueTime,
          );
          schedules += 1;
        }
      }
    } else {
      pending += 1;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireMedicationReconciliationItem"("id","organizationId","legalEntityId","reconciliationId","medicationOrderId","medicationName","source","decision","reason")
       VALUES($1,$2,$3,$4,$5,$6,'CLIENT_INTAKE','CONTINUE',$7)
       ON CONFLICT("id") DO UPDATE SET "medicationOrderId"=EXCLUDED."medicationOrderId","medicationName"=EXCLUDED."medicationName","reason"=EXCLUDED."reason"`,
      stableId(reconciliationId, 'ITEM', index, med.sourceLine), auth.organizationId, entityId, reconciliationId,
      orderId, med.name || med.sourceLine.slice(0, 250), status === 'ACTIVE' ? 'Mapped from nurse-approved intake; reconciliation remains open for final verification.' : `Pending medication verification. Original intake line: ${med.sourceLine}`,
    );
  }

  if (!isLicensedReviewer && all.length) warnings.push('Medication list was preserved in reconciliation, but active eMAR orders require nursing verification because the intake was approved by a non-licensed medication reviewer.');
  if (all.some(med => !med.completeForOrder)) warnings.push('One or more medication lines are incomplete; the original intake text was preserved and requires medication reconciliation before it can become an active eMAR order.');
  return { reconciliationId, mapped, pending, schedules };
}

async function ensureDocuments(prisma: PrismaClient, auth: PromotionAuth, intakeCaseId: string, patientId: string, attachments: IntakeAttachment[]) {
  let mapped = 0;
  for (const attachment of attachments) {
    const documentId = stableId(auth.organizationId, patientId, intakeCaseId, 'DOCUMENT', attachment.id);
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "SpireClinicalDocument" WHERE "organizationId"=$1 AND "patientId"=$2 AND "id"=$3 LIMIT 1`,
      auth.organizationId, patientId, documentId,
    );
    if (existing[0]) { mapped += 1; continue; }

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
    const description = [attachment.notes, `Promoted automatically from Client Intake ${intakeCaseId}`, attachment.sectionKey ? `Intake section: ${attachment.sectionKey}` : ''].filter(Boolean).join('\n');
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

async function ensureServiceAuthorization(prisma: PrismaClient, auth: PromotionAuth, intakeCaseId: string, patientId: string, payloads: Map<string, Record<string, unknown>>, carePlanId: string | null, warnings: string[]) {
  const authorization = payloads.get('service_authorization') || {};
  const serviceName = text(authorization.authorizedService, 250);
  if (!serviceName) return 0;
  const serviceCode = text(authorization.serviceCode, 80);
  const startDate = dateText(authorization.authorizationStart);
  const endDate = dateText(authorization.authorizationEnd);
  if (!serviceCode || !startDate || !endDate) {
    warnings.push('Service authorization details were preserved in the admission summary, but a native authorization was not activated because service code and/or authorization dates are incomplete.');
    return 0;
  }
  const entityId = auth.legalEntityId!;
  const authorizationId = stableId(auth.organizationId, entityId, intakeCaseId, 'SERVICE_AUTHORIZATION', serviceCode);
  const units = numberValue(authorization.authorizedUnits) ?? 0;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireServiceAuthorization"("id","organizationId","legalEntityId","patientId","authorizationNumber","payer","waiverType","serviceCode","serviceName","authorizedUnits","startDate","endDate","status","notes","createdById")
     VALUES($1,$2,$3,$4,$5,'MEDICAID',$6,$7,$8,$9,$10::date,$11::date,'ACTIVE',$12,$13)
     ON CONFLICT("id") DO UPDATE SET "authorizationNumber"=EXCLUDED."authorizationNumber","waiverType"=EXCLUDED."waiverType","serviceName"=EXCLUDED."serviceName","authorizedUnits"=EXCLUDED."authorizedUnits","startDate"=EXCLUDED."startDate","endDate"=EXCLUDED."endDate","notes"=EXCLUDED."notes","updatedAt"=NOW()`,
    authorizationId, auth.organizationId, entityId, patientId, text(authorization.authorizationNumber, 120) || null,
    text(payloads.get('insurance_medicaid')?.waiverType, 120) || null, serviceCode, serviceName, units, startDate, endDate,
    [text(authorization.frequency), text(authorization.providerAssignment), text(authorization.authorizationNotes), `Source: Client Intake ${intakeCaseId}`].filter(Boolean).join('\n'), auth.userId,
  );
  if (carePlanId) {
    const linkId = stableId(carePlanId, 'SERVICE_LINK', authorizationId);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SpireCarePlanServiceLink"("id","organizationId","legalEntityId","patientId","carePlanId","authorizationId","serviceCode","serviceName","approvedServiceType","startsAt","endsAt","authorizedUnits","active")
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,TRUE)
       ON CONFLICT("id") DO UPDATE SET "authorizationId"=EXCLUDED."authorizationId","serviceCode"=EXCLUDED."serviceCode","serviceName"=EXCLUDED."serviceName","startsAt"=EXCLUDED."startsAt","endsAt"=EXCLUDED."endsAt","authorizedUnits"=EXCLUDED."authorizedUnits","active"=TRUE`,
      linkId, auth.organizationId, entityId, patientId, carePlanId, authorizationId, serviceCode, serviceName,
      text(authorization.providerAssignment, 120) || null, startDate, endDate, units,
    );
  }
  return 1;
}

async function logPromotion(prisma: PrismaClient, auth: PromotionAuth, intakeCaseId: string, patientId: string, summary: PromotionSummary) {
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

export async function promoteApprovedIntakeToSpire(
  prisma: PrismaClient,
  auth: PromotionAuth,
  intakeCaseId: string,
  patientId: string,
): Promise<PromotionSummary> {
  if (!auth.legalEntityId) throw Object.assign(new Error('Select a Sulandra company before promoting Client Intake to SPIRE'), { status: 409 });

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
  const noteId = await ensureAdmissionNote(prisma, auth, intakeCaseId, patientId, admissionSummary(intakeCaseId, sections));
  const carePlanId = await ensureCarePlan(prisma, auth, intakeCaseId, patientId, payloads);
  const meds = await ensureMedications(prisma, auth, intakeCaseId, patientId, payloads, warnings);
  const documentsMapped = await ensureDocuments(prisma, auth, intakeCaseId, patientId, attachments);
  const serviceAuthorizationsMapped = await ensureServiceAuthorization(prisma, auth, intakeCaseId, patientId, payloads, carePlanId, warnings);

  const summary: PromotionSummary = {
    admissionNoteId: noteId,
    carePlanId,
    medicationReconciliationId: meds.reconciliationId,
    medicationsMapped: meds.mapped,
    medicationsPendingReview: meds.pending,
    medicationSchedulesMapped: meds.schedules,
    documentsMapped,
    serviceAuthorizationsMapped,
    warnings,
  };
  await logPromotion(prisma, auth, intakeCaseId, patientId, summary);
  return summary;
}
