CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SpirePatient" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legacyClientId" text,
  "medicalRecordNumber" text,
  "firstName" text NOT NULL,
  "middleName" text,
  "lastName" text NOT NULL,
  "preferredName" text,
  "dateOfBirth" date,
  "sexAtBirth" text,
  "genderIdentity" text,
  "preferredLanguage" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpirePatient_org_mrn_key" ON "SpirePatient"("organizationId","medicalRecordNumber") WHERE "medicalRecordNumber" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "SpirePatient_org_name_idx" ON "SpirePatient"("organizationId","lastName","firstName");

CREATE TABLE IF NOT EXISTS "SpirePatientIdentifier" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "value" text NOT NULL,
  "issuer" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpirePatientIdentifier_org_type_value_key" ON "SpirePatientIdentifier"("organizationId","type","value");

CREATE TABLE IF NOT EXISTS "SpirePatientContact" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "value" text NOT NULL,
  "preferred" boolean NOT NULL DEFAULT false,
  "verifiedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePatientContact_patient_idx" ON "SpirePatientContact"("organizationId","patientId");

CREATE TABLE IF NOT EXISTS "SpireEmergencyContact" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "relationship" text,
  "phone" text,
  "email" text,
  "priority" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpirePatientProgramEnrollment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "programId" text NOT NULL,
  "startsAt" timestamptz NOT NULL DEFAULT now(),
  "endsAt" timestamptz,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireProgramEnrollment_patient_idx" ON "SpirePatientProgramEnrollment"("organizationId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpirePatientHomeAssignment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "homeId" text NOT NULL,
  "primary" boolean NOT NULL DEFAULT true,
  "startsAt" timestamptz NOT NULL DEFAULT now(),
  "endsAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePatientHome_patient_idx" ON "SpirePatientHomeAssignment"("organizationId","patientId");

CREATE TABLE IF NOT EXISTS "SpirePatientCareTeam" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "roleLabel" text,
  "primary" boolean NOT NULL DEFAULT false,
  "startsAt" timestamptz NOT NULL DEFAULT now(),
  "endsAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePatientCareTeam_patient_idx" ON "SpirePatientCareTeam"("organizationId","patientId");

CREATE TABLE IF NOT EXISTS "SpirePatientFlag" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "label" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'INFO',
  "details" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "resolvedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "SpirePatientFlag_patient_idx" ON "SpirePatientFlag"("organizationId","patientId","active");

CREATE TABLE IF NOT EXISTS "SpirePatientAllergy" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "substance" text NOT NULL,
  "reaction" text,
  "severity" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "verifiedAt" timestamptz,
  "verifiedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePatientAllergy_patient_idx" ON "SpirePatientAllergy"("organizationId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpirePatientDiagnosis" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "codeSystem" text,
  "code" text,
  "display" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "onsetDate" date,
  "resolvedDate" date,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePatientDiagnosis_patient_idx" ON "SpirePatientDiagnosis"("organizationId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpirePatientProblem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "details" text,
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "ownerUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireAppointment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "providerUserId" text,
  "locationId" text,
  "appointmentType" text NOT NULL DEFAULT 'VISIT',
  "status" text NOT NULL DEFAULT 'SCHEDULED',
  "startsAt" timestamptz NOT NULL,
  "endsAt" timestamptz,
  "reason" text,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireAppointment_schedule_idx" ON "SpireAppointment"("organizationId","startsAt","status");
CREATE INDEX IF NOT EXISTS "SpireAppointment_patient_idx" ON "SpireAppointment"("organizationId","patientId","startsAt");

CREATE TABLE IF NOT EXISTS "SpireEncounter" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "appointmentId" text REFERENCES "SpireAppointment"("id") ON DELETE SET NULL,
  "encounterType" text NOT NULL DEFAULT 'OFFICE_VISIT',
  "status" text NOT NULL DEFAULT 'OPEN',
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "endedAt" timestamptz,
  "signedAt" timestamptz,
  "signedById" text,
  "chiefComplaint" text,
  "serviceLevel" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireEncounter_patient_idx" ON "SpireEncounter"("organizationId","patientId","startedAt");

CREATE TABLE IF NOT EXISTS "SpireEncounterParticipant" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "encounterId" text NOT NULL REFERENCES "SpireEncounter"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "role" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireEncounterStatusHistory" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "encounterId" text NOT NULL REFERENCES "SpireEncounter"("id") ON DELETE CASCADE,
  "fromStatus" text,
  "toStatus" text NOT NULL,
  "reason" text,
  "changedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireVisitFollowUp" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "encounterId" text NOT NULL REFERENCES "SpireEncounter"("id") ON DELETE CASCADE,
  "timeframe" text,
  "instructions" text,
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "createdById" text
);

CREATE TABLE IF NOT EXISTS "SpireClinicalNote" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "noteType" text NOT NULL DEFAULT 'PROGRESS_NOTE',
  "title" text,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "currentVersion" integer NOT NULL DEFAULT 1,
  "authorUserId" text NOT NULL,
  "signedAt" timestamptz,
  "signedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireClinicalNote_patient_idx" ON "SpireClinicalNote"("organizationId","patientId","createdAt");

CREATE TABLE IF NOT EXISTS "SpireClinicalNoteVersion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "noteId" text NOT NULL REFERENCES "SpireClinicalNote"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "body" text NOT NULL,
  "changeReason" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("noteId","version")
);

CREATE TABLE IF NOT EXISTS "SpireNoteCosigner" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "noteId" text NOT NULL REFERENCES "SpireClinicalNote"("id") ON DELETE CASCADE,
  "cosignerUserId" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "comment" text
);

CREATE TABLE IF NOT EXISTS "SpireSmartPhrase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "ownerUserId" text,
  "name" text NOT NULL,
  "description" text,
  "body" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "sharedOrganizationWide" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireSmartPhrase_owner_name_key" ON "SpireSmartPhrase"("organizationId","ownerUserId","name");

CREATE TABLE IF NOT EXISTS "SpireSmartPhraseShare" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "smartPhraseId" text NOT NULL REFERENCES "SpireSmartPhrase"("id") ON DELETE CASCADE,
  "sharedWithUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("smartPhraseId","sharedWithUserId")
);

CREATE TABLE IF NOT EXISTS "SpireSmartText" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "ownerUserId" text,
  "name" text NOT NULL,
  "body" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireSpeedButton" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "workspace" text NOT NULL,
  "label" text NOT NULL,
  "smartPhraseId" text REFERENCES "SpireSmartPhrase"("id") ON DELETE SET NULL,
  "smartTextId" text REFERENCES "SpireSmartText"("id") ON DELETE SET NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpirePatientInstruction" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireAfterVisitSummary" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text NOT NULL REFERENCES "SpireEncounter"("id") ON DELETE CASCADE,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "generatedAt" timestamptz NOT NULL DEFAULT now(),
  "generatedById" text
);

CREATE TABLE IF NOT EXISTS "SpireResult" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "category" text NOT NULL,
  "testName" text NOT NULL,
  "status" text NOT NULL DEFAULT 'FINAL',
  "resultedAt" timestamptz NOT NULL DEFAULT now(),
  "source" text,
  "rawData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireResult_patient_resulted_idx" ON "SpireResult"("organizationId","patientId","resultedAt");

CREATE TABLE IF NOT EXISTS "SpireResultComponent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "resultId" text NOT NULL REFERENCES "SpireResult"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "value" text,
  "numericValue" numeric,
  "unit" text,
  "referenceRange" text,
  "abnormalFlag" text,
  "sortOrder" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "SpireVitalSign" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "temperature" numeric,
  "pulse" integer,
  "respirations" integer,
  "systolic" integer,
  "diastolic" integer,
  "spo2" integer,
  "weight" numeric,
  "oxygen" text,
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireFlowsheetRow" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "name" text NOT NULL,
  "groupName" text,
  "dataType" text NOT NULL DEFAULT 'TEXT',
  "unit" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireFlowsheetEntry" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "rowId" text NOT NULL REFERENCES "SpireFlowsheetRow"("id") ON DELETE RESTRICT,
  "value" text,
  "numericValue" numeric,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text
);

CREATE TABLE IF NOT EXISTS "SpireImagingStudy" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "modality" text,
  "description" text NOT NULL,
  "status" text NOT NULL DEFAULT 'FINAL',
  "performedAt" timestamptz,
  "report" text,
  "externalViewerUrl" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireMicrobiologyResult" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "specimen" text,
  "testName" text NOT NULL,
  "organism" text,
  "result" text,
  "susceptibilities" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "resultedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpirePathologyResult" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "specimen" text,
  "diagnosis" text,
  "report" text,
  "resultedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireMedicationOrder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "dose" text NOT NULL,
  "route" text NOT NULL,
  "frequency" text NOT NULL,
  "dueTimes" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "instructions" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "startDate" date NOT NULL,
  "endDate" date,
  "orderedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireMedicationOrder_patient_idx" ON "SpireMedicationOrder"("organizationId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpireMedicationOrderVersion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "medicationOrderId" text NOT NULL REFERENCES "SpireMedicationOrder"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "reason" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("medicationOrderId","version")
);

CREATE TABLE IF NOT EXISTS "SpireMedicationAdministration" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "medicationOrderId" text NOT NULL REFERENCES "SpireMedicationOrder"("id") ON DELETE RESTRICT,
  "scheduledFor" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'SCHEDULED',
  "administeredAt" timestamptz,
  "administeredById" text,
  "note" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("medicationOrderId","scheduledFor")
);

CREATE TABLE IF NOT EXISTS "SpireMedicationReconciliation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'IN_PROGRESS',
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "completedById" text,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireOrder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "orderType" text NOT NULL,
  "name" text NOT NULL,
  "instructions" text,
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "status" text NOT NULL DEFAULT 'PENDING',
  "orderedById" text,
  "orderedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireOrder_patient_idx" ON "SpireOrder"("organizationId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpireOrderStatusHistory" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "orderId" text NOT NULL REFERENCES "SpireOrder"("id") ON DELETE CASCADE,
  "fromStatus" text,
  "toStatus" text NOT NULL,
  "reason" text,
  "changedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireProviderOrderDocument" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "orderId" text REFERENCES "SpireOrder"("id") ON DELETE SET NULL,
  "documentId" text,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireServiceAuthorization" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "serviceCode" text NOT NULL,
  "payer" text,
  "authorizationNumber" text,
  "authorizedUnits" numeric NOT NULL DEFAULT 0,
  "startsAt" date NOT NULL,
  "endsAt" date NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireAuthorizationUnitLedger" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "authorizationId" text NOT NULL REFERENCES "SpireServiceAuthorization"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "serviceDate" date NOT NULL,
  "units" numeric NOT NULL,
  "sourceType" text,
  "sourceId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireCarePlan" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "planType" text NOT NULL DEFAULT 'ISP',
  "status" text NOT NULL DEFAULT 'DRAFT',
  "effectiveDate" date,
  "reviewDate" date,
  "title" text,
  "summary" text,
  "createdById" text,
  "approvedById" text,
  "approvedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireCarePlanGoal" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "carePlanId" text NOT NULL REFERENCES "SpireCarePlan"("id") ON DELETE CASCADE,
  "goal" text NOT NULL,
  "measure" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "SpireCarePlanIntervention" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "carePlanId" text NOT NULL REFERENCES "SpireCarePlan"("id") ON DELETE CASCADE,
  "goalId" text REFERENCES "SpireCarePlanGoal"("id") ON DELETE SET NULL,
  "instruction" text NOT NULL,
  "frequency" text,
  "responsibleRole" text,
  "sortOrder" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "SpireCarePlanRisk" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "carePlanId" text NOT NULL REFERENCES "SpireCarePlan"("id") ON DELETE CASCADE,
  "risk" text NOT NULL,
  "mitigation" text,
  "severity" text NOT NULL DEFAULT 'MODERATE',
  "active" boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "SpireAssessment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "assessmentType" text NOT NULL,
  "status" text NOT NULL DEFAULT 'IN_PROGRESS',
  "score" numeric,
  "summary" text,
  "performedById" text,
  "performedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireAssessmentResponse" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "assessmentId" text NOT NULL REFERENCES "SpireAssessment"("id") ON DELETE CASCADE,
  "questionKey" text NOT NULL,
  "questionText" text,
  "response" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sortOrder" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "SpireIncident" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "incidentType" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'MODERATE',
  "status" text NOT NULL DEFAULT 'OPEN',
  "occurredAt" timestamptz NOT NULL,
  "location" text,
  "summary" text NOT NULL,
  "details" text,
  "reportedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireIncidentParticipant" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE CASCADE,
  "participantType" text NOT NULL,
  "participantId" text,
  "name" text,
  "role" text
);

CREATE TABLE IF NOT EXISTS "SpireIncidentFollowUp" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "assignedToId" text,
  "dueAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireRiskAlert" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'MODERATE',
  "title" text NOT NULL,
  "details" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "resolvedAt" timestamptz
);

CREATE TABLE IF NOT EXISTS "SpireClinicalDocument" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "mimeType" text,
  "storageKey" text,
  "sha256" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireClinicalDocumentVersion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "documentId" text NOT NULL REFERENCES "SpireClinicalDocument"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "storageKey" text NOT NULL,
  "sha256" text,
  "mimeType" text,
  "sizeBytes" bigint,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("documentId","version")
);

CREATE TABLE IF NOT EXISTS "SpireExternalRecordSource" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "name" text NOT NULL,
  "sourceType" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireExternalRecord" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "sourceId" text REFERENCES "SpireExternalRecordSource"("id") ON DELETE SET NULL,
  "recordType" text NOT NULL,
  "title" text NOT NULL,
  "recordDate" date,
  "documentId" text REFERENCES "SpireClinicalDocument"("id") ON DELETE SET NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireMediaItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "documentId" text REFERENCES "SpireClinicalDocument"("id") ON DELETE SET NULL,
  "mediaType" text NOT NULL,
  "caption" text,
  "takenAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireClinicalMessage" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "messageType" text NOT NULL DEFAULT 'CLINICAL',
  "priority" text NOT NULL DEFAULT 'NORMAL',
  "senderUserId" text,
  "status" text NOT NULL DEFAULT 'SENT',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireClinicalMessageRecipient" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "messageId" text NOT NULL REFERENCES "SpireClinicalMessage"("id") ON DELETE CASCADE,
  "recipientUserId" text NOT NULL,
  "readAt" timestamptz,
  "acknowledgedAt" timestamptz,
  "status" text NOT NULL DEFAULT 'UNREAD',
  UNIQUE("messageId","recipientUserId")
);

CREATE TABLE IF NOT EXISTS "SpireInBasketItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "assignedToUserId" text NOT NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "details" text,
  "priority" text NOT NULL DEFAULT 'NORMAL',
  "status" text NOT NULL DEFAULT 'OPEN',
  "sourceType" text,
  "sourceId" text,
  "dueAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireInBasket_user_idx" ON "SpireInBasketItem"("organizationId","assignedToUserId","status","createdAt");

CREATE TABLE IF NOT EXISTS "SpireClinicalTask" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "details" text,
  "assignedToUserId" text,
  "priority" text NOT NULL DEFAULT 'NORMAL',
  "status" text NOT NULL DEFAULT 'OPEN',
  "dueAt" timestamptz,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireClinicalReminder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "details" text,
  "remindAt" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireWorkspacePreference" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "workspace" text NOT NULL,
  "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","userId","workspace")
);

CREATE TABLE IF NOT EXISTS "SpirePinnedTool" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "toolKey" text NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","userId","toolKey")
);

CREATE TABLE IF NOT EXISTS "SpireTabPreference" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "workspace" text NOT NULL,
  "tabKey" text NOT NULL,
  "visible" boolean NOT NULL DEFAULT true,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","userId","workspace","tabKey")
);

CREATE TABLE IF NOT EXISTS "SpireEmployeeHomeAssignment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "homeId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","userId","homeId")
);

CREATE TABLE IF NOT EXISTS "SpireEmployeeClientAssignment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "clientId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","userId","clientId")
);

CREATE TABLE IF NOT EXISTS "SpireClinicalAuditEvent" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "actorUserId" text,
  "actorEmail" text,
  "clientId" text,
  "action" text NOT NULL,
  "resourceType" text NOT NULL,
  "resourceId" text,
  "beforeValue" jsonb,
  "afterValue" jsonb,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireClinicalAudit_org_created_idx" ON "SpireClinicalAuditEvent"("organizationId","createdAt");

CREATE TABLE IF NOT EXISTS "SpireChartAccessEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text,
  "actorUserId" text,
  "actorEmail" text,
  "action" text NOT NULL,
  "resourceType" text,
  "resourceId" text,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireChartAccess_org_patient_idx" ON "SpireChartAccessEvent"("organizationId","patientId","createdAt");
