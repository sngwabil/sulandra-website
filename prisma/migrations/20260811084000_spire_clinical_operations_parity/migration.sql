CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SpireIsolationOrder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "isolationType" text NOT NULL,
  "indication" text NOT NULL,
  "organism" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "endedAt" timestamptz,
  "orderedById" text,
  "discontinuedById" text,
  "precautions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireIsolationOrder_patient_idx" ON "SpireIsolationOrder"("organizationId","legalEntityId","patientId","status","startedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireInfectionSurveillanceCase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "caseType" text NOT NULL,
  "organism" text,
  "site" text,
  "classification" text,
  "onsetAt" timestamptz,
  "identifiedAt" timestamptz NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'OPEN',
  "reportable" boolean NOT NULL DEFAULT false,
  "reportedAt" timestamptz,
  "reportingAgency" text,
  "linkedMicrobiologyResultId" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdById" text,
  "closedAt" timestamptz,
  "closedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireInfectionSurveillanceCase_patient_idx" ON "SpireInfectionSurveillanceCase"("organizationId","legalEntityId","patientId","status","identifiedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireDeviceDay" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "deviceType" text NOT NULL,
  "location" text,
  "dayDate" date NOT NULL,
  "present" boolean NOT NULL DEFAULT true,
  "sourceDeviceId" text,
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","legalEntityId","patientId","deviceType","dayDate")
);
CREATE INDEX IF NOT EXISTS "SpireDeviceDay_org_date_idx" ON "SpireDeviceDay"("organizationId","legalEntityId","dayDate","deviceType");

CREATE TABLE IF NOT EXISTS "SpireHealthcareAssociatedInfection" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "surveillanceCaseId" text REFERENCES "SpireInfectionSurveillanceCase"("id") ON DELETE SET NULL,
  "haiType" text NOT NULL,
  "eventDate" date NOT NULL,
  "location" text,
  "deviceAssociated" boolean NOT NULL DEFAULT false,
  "deviceType" text,
  "criteria" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'CONFIRMED',
  "reportedExternally" boolean NOT NULL DEFAULT false,
  "reportedAt" timestamptz,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireHealthcareAssociatedInfection_idx" ON "SpireHealthcareAssociatedInfection"("organizationId","legalEntityId","eventDate","haiType");

CREATE TABLE IF NOT EXISTS "SpireCaseManagementCase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "hospitalStayId" text REFERENCES "SpireHospitalStay"("id") ON DELETE SET NULL,
  "caseType" text NOT NULL DEFAULT 'INPATIENT',
  "status" text NOT NULL DEFAULT 'OPEN',
  "assignedCaseManagerUserId" text,
  "assignedSocialWorkerUserId" text,
  "anticipatedDisposition" text,
  "targetDischargeDate" date,
  "medicalNecessityStatus" text,
  "levelOfCareStatus" text,
  "createdById" text,
  "openedAt" timestamptz NOT NULL DEFAULT now(),
  "closedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCaseManagementCase_patient_idx" ON "SpireCaseManagementCase"("organizationId","legalEntityId","patientId","status","openedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireCaseManagementBarrier" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "caseId" text NOT NULL REFERENCES "SpireCaseManagementCase"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "barrierType" text NOT NULL,
  "description" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'NORMAL',
  "status" text NOT NULL DEFAULT 'OPEN',
  "ownerUserId" text,
  "dueAt" timestamptz,
  "resolvedAt" timestamptz,
  "resolution" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCaseManagementBarrier_case_idx" ON "SpireCaseManagementBarrier"("organizationId","legalEntityId","caseId","status","priority");

CREATE TABLE IF NOT EXISTS "SpireUtilizationReview" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "caseId" text NOT NULL REFERENCES "SpireCaseManagementCase"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "reviewType" text NOT NULL,
  "reviewAt" timestamptz NOT NULL DEFAULT now(),
  "levelOfCare" text,
  "criteriaMet" boolean,
  "medicalNecessity" text,
  "payerDecision" text,
  "authorizedThrough" date,
  "denialReason" text,
  "appealStatus" text,
  "notes" text,
  "reviewedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireUtilizationReview_case_idx" ON "SpireUtilizationReview"("organizationId","legalEntityId","caseId","reviewAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePayerCommunication" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "caseManagementCaseId" text REFERENCES "SpireCaseManagementCase"("id") ON DELETE SET NULL,
  "payerName" text NOT NULL,
  "communicationType" text NOT NULL,
  "direction" text NOT NULL,
  "subject" text,
  "details" text,
  "referenceNumber" text,
  "contactName" text,
  "contactMethod" text,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePayerCommunication_patient_idx" ON "SpirePayerCommunication"("organizationId","legalEntityId","patientId","occurredAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireLabSpecimen" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "orderId" text REFERENCES "SpireOrder"("id") ON DELETE SET NULL,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "specimenType" text NOT NULL,
  "source" text,
  "collectionMethod" text,
  "containerType" text,
  "status" text NOT NULL DEFAULT 'ORDERED',
  "collectedAt" timestamptz,
  "collectedById" text,
  "receivedAt" timestamptz,
  "rejectionReason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireLabSpecimen_patient_idx" ON "SpireLabSpecimen"("organizationId","legalEntityId","patientId","status","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireLabAccession" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "specimenId" text NOT NULL REFERENCES "SpireLabSpecimen"("id") ON DELETE RESTRICT,
  "accessionNumber" text NOT NULL,
  "department" text,
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "status" text NOT NULL DEFAULT 'RECEIVED',
  "accessionedAt" timestamptz NOT NULL DEFAULT now(),
  "accessionedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","legalEntityId","accessionNumber")
);
CREATE INDEX IF NOT EXISTS "SpireLabAccession_patient_idx" ON "SpireLabAccession"("organizationId","legalEntityId","patientId","status","accessionedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireLabWorkItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "accessionId" text NOT NULL REFERENCES "SpireLabAccession"("id") ON DELETE CASCADE,
  "testName" text NOT NULL,
  "instrument" text,
  "bench" text,
  "status" text NOT NULL DEFAULT 'PENDING',
  "resultValue" text,
  "numericValue" numeric,
  "unit" text,
  "referenceRange" text,
  "abnormalFlag" text,
  "performedAt" timestamptz,
  "performedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireLabWorkItem_accession_idx" ON "SpireLabWorkItem"("organizationId","legalEntityId","accessionId","status");

CREATE TABLE IF NOT EXISTS "SpireLabVerification" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "accessionId" text NOT NULL REFERENCES "SpireLabAccession"("id") ON DELETE CASCADE,
  "verificationType" text NOT NULL DEFAULT 'FINAL',
  "status" text NOT NULL DEFAULT 'VERIFIED',
  "criticalResult" boolean NOT NULL DEFAULT false,
  "criticalNotification" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "verifiedAt" timestamptz NOT NULL DEFAULT now(),
  "verifiedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireLabVerification_accession_idx" ON "SpireLabVerification"("organizationId","legalEntityId","accessionId","verifiedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireRadiologyWorkItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "orderId" text REFERENCES "SpireOrder"("id") ON DELETE SET NULL,
  "appointmentId" text REFERENCES "SpireAppointment"("id") ON DELETE SET NULL,
  "modality" text NOT NULL,
  "procedureName" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "status" text NOT NULL DEFAULT 'ORDERED',
  "scheduledAt" timestamptz,
  "protocolStatus" text,
  "protocol" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "radiologistUserId" text,
  "technologistUserId" text,
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireRadiologyWorkItem_worklist_idx" ON "SpireRadiologyWorkItem"("organizationId","legalEntityId","status","priority","scheduledAt");

CREATE TABLE IF NOT EXISTS "SpireActionableImagingFinding" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "imagingStudyId" text REFERENCES "SpireImagingStudy"("id") ON DELETE SET NULL,
  "radiologyWorkItemId" text REFERENCES "SpireRadiologyWorkItem"("id") ON DELETE SET NULL,
  "findingType" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'HIGH',
  "finding" text NOT NULL,
  "recommendedAction" text,
  "status" text NOT NULL DEFAULT 'OPEN',
  "identifiedAt" timestamptz NOT NULL DEFAULT now(),
  "identifiedById" text,
  "acknowledgedAt" timestamptz,
  "acknowledgedById" text,
  "closedAt" timestamptz,
  "closedById" text,
  "closureEvidence" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireActionableImagingFinding_patient_idx" ON "SpireActionableImagingFinding"("organizationId","legalEntityId","patientId","status","identifiedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireFormularyEntry" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "medicationName" text NOT NULL,
  "ndc" text,
  "rxNormCode" text,
  "formularyStatus" text NOT NULL DEFAULT 'FORMULARY',
  "restrictions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "alternatives" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireFormularyEntry_name_idx" ON "SpireFormularyEntry"("organizationId","legalEntityId","medicationName","active");

CREATE TABLE IF NOT EXISTS "SpireMedicationBenefitCheck" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "medicationOrderId" text REFERENCES "SpireMedicationOrder"("id") ON DELETE SET NULL,
  "medicationName" text NOT NULL,
  "payerName" text,
  "covered" boolean,
  "estimatedPatientCost" numeric,
  "priorAuthorizationRequired" boolean,
  "stepTherapyRequired" boolean,
  "alternatives" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "checkedAt" timestamptz NOT NULL DEFAULT now(),
  "source" text,
  "rawResponse" jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS "SpireMedicationBenefitCheck_patient_idx" ON "SpireMedicationBenefitCheck"("organizationId","legalEntityId","patientId","checkedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePharmacyVerification" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "medicationOrderId" text NOT NULL REFERENCES "SpireMedicationOrder"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'PENDING',
  "doseCheck" text,
  "renalDoseCheck" text,
  "interactionCheck" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allergyCheck" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "formularyCheck" text,
  "clinicalNote" text,
  "verifiedAt" timestamptz,
  "verifiedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePharmacyVerification_patient_idx" ON "SpirePharmacyVerification"("organizationId","legalEntityId","patientId","status","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireMedicationDispense" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "medicationOrderId" text NOT NULL REFERENCES "SpireMedicationOrder"("id") ON DELETE RESTRICT,
  "pharmacyVerificationId" text REFERENCES "SpirePharmacyVerification"("id") ON DELETE SET NULL,
  "quantity" numeric NOT NULL,
  "unit" text,
  "lotNumber" text,
  "expirationDate" date,
  "status" text NOT NULL DEFAULT 'DISPENSED',
  "dispensedAt" timestamptz NOT NULL DEFAULT now(),
  "dispensedById" text,
  "destination" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireMedicationDispense_patient_idx" ON "SpireMedicationDispense"("organizationId","legalEntityId","patientId","dispensedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireMedicationReconciliation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "reconciliationType" text NOT NULL,
  "status" text NOT NULL DEFAULT 'IN_PROGRESS',
  "sourceMedicationList" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "decisions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "discrepancies" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "completedAt" timestamptz,
  "completedById" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireMedicationReconciliation_patient_idx" ON "SpireMedicationReconciliation"("organizationId","legalEntityId","patientId","createdAt" DESC);
