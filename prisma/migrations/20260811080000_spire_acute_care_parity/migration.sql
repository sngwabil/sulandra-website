CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Acute-care parity foundation: inpatient ADT/rounding/discharge, nursing I&O/LDA,
-- critical-care devices/drips/ventilation, emergency tracking/triage, and perioperative/anesthesia.
-- Every row is company scoped so one Sulandra operating company cannot silently see another company's chart work.

CREATE TABLE IF NOT EXISTS "SpireHospitalStay" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "stayType" text NOT NULL DEFAULT 'INPATIENT',
  "status" text NOT NULL DEFAULT 'ADMITTED',
  "admittedAt" timestamptz NOT NULL DEFAULT now(),
  "admitSource" text,
  "admitDiagnosis" text,
  "service" text,
  "attendingUserId" text,
  "location" text,
  "room" text,
  "bed" text,
  "levelOfCare" text,
  "disposition" text,
  "dischargedAt" timestamptz,
  "dischargeSummary" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireHospitalStay_status_check" CHECK ("status" IN ('ADMITTED','TRANSFERRED','DISCHARGE_READY','DISCHARGED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "SpireHospitalStay_patient_idx" ON "SpireHospitalStay"("organizationId","legalEntityId","patientId","admittedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireHospitalStay_active_patient_key" ON "SpireHospitalStay"("organizationId","legalEntityId","patientId") WHERE "status" IN ('ADMITTED','TRANSFERRED','DISCHARGE_READY');

CREATE TABLE IF NOT EXISTS "SpireHospitalLocationEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "hospitalStayId" text NOT NULL REFERENCES "SpireHospitalStay"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "fromLocation" text,
  "toLocation" text,
  "fromRoom" text,
  "toRoom" text,
  "fromBed" text,
  "toBed" text,
  "fromLevelOfCare" text,
  "toLevelOfCare" text,
  "reason" text,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "performedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireHospitalLocationEvent_stay_idx" ON "SpireHospitalLocationEvent"("organizationId","legalEntityId","hospitalStayId","occurredAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireDischargeMilestone" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "hospitalStayId" text NOT NULL REFERENCES "SpireHospitalStay"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "milestoneType" text NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "dueAt" timestamptz,
  "completedAt" timestamptz,
  "ownerUserId" text,
  "barrier" text,
  "notes" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireDischargeMilestone_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','BLOCKED','COMPLETE','NOT_APPLICABLE'))
);
CREATE INDEX IF NOT EXISTS "SpireDischargeMilestone_stay_idx" ON "SpireDischargeMilestone"("organizationId","legalEntityId","hospitalStayId","status","dueAt");

CREATE TABLE IF NOT EXISTS "SpireIntakeOutputEntry" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "hospitalStayId" text REFERENCES "SpireHospitalStay"("id") ON DELETE SET NULL,
  "direction" text NOT NULL,
  "category" text NOT NULL,
  "source" text,
  "amountMl" numeric,
  "details" text,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireIntakeOutputEntry_direction_check" CHECK ("direction" IN ('INTAKE','OUTPUT'))
);
CREATE INDEX IF NOT EXISTS "SpireIntakeOutputEntry_patient_idx" ON "SpireIntakeOutputEntry"("organizationId","legalEntityId","patientId","recordedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireLdaDevice" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "hospitalStayId" text REFERENCES "SpireHospitalStay"("id") ON DELETE SET NULL,
  "deviceType" text NOT NULL,
  "site" text,
  "laterality" text,
  "size" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "insertedAt" timestamptz NOT NULL DEFAULT now(),
  "insertedById" text,
  "removedAt" timestamptz,
  "removedById" text,
  "indication" text,
  "assessment" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireLdaDevice_status_check" CHECK ("status" IN ('ACTIVE','REMOVED','DISCONTINUED'))
);
CREATE INDEX IF NOT EXISTS "SpireLdaDevice_patient_idx" ON "SpireLdaDevice"("organizationId","legalEntityId","patientId","status","insertedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireContinuousInfusion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "hospitalStayId" text REFERENCES "SpireHospitalStay"("id") ON DELETE SET NULL,
  "medicationName" text NOT NULL,
  "concentration" text,
  "rate" numeric,
  "rateUnit" text,
  "dose" numeric,
  "doseUnit" text,
  "titrationTarget" text,
  "status" text NOT NULL DEFAULT 'RUNNING',
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "stoppedAt" timestamptz,
  "verifiedById" text,
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireContinuousInfusion_status_check" CHECK ("status" IN ('RUNNING','PAUSED','STOPPED','COMPLETED'))
);
CREATE INDEX IF NOT EXISTS "SpireContinuousInfusion_patient_idx" ON "SpireContinuousInfusion"("organizationId","legalEntityId","patientId","status","startedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireCriticalCareObservation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "hospitalStayId" text REFERENCES "SpireHospitalStay"("id") ON DELETE SET NULL,
  "observationType" text NOT NULL,
  "value" text,
  "numericValue" numeric,
  "unit" text,
  "severity" text,
  "deviceSource" text,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCriticalCareObservation_patient_idx" ON "SpireCriticalCareObservation"("organizationId","legalEntityId","patientId","recordedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireVentilatorSetting" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "hospitalStayId" text REFERENCES "SpireHospitalStay"("id") ON DELETE SET NULL,
  "mode" text,
  "fio2" numeric,
  "peep" numeric,
  "rate" numeric,
  "tidalVolume" numeric,
  "pressureSupport" numeric,
  "plateauPressure" numeric,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireVentilatorSetting_patient_idx" ON "SpireVentilatorSetting"("organizationId","legalEntityId","patientId","recordedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireDeteriorationAlert" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "alertType" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'HIGH',
  "score" numeric,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "triggeredAt" timestamptz NOT NULL DEFAULT now(),
  "acknowledgedAt" timestamptz,
  "acknowledgedById" text,
  "resolvedAt" timestamptz,
  "resolvedById" text,
  "resolution" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireDeteriorationAlert_status_check" CHECK ("status" IN ('OPEN','ACKNOWLEDGED','RESOLVED'))
);
CREATE INDEX IF NOT EXISTS "SpireDeteriorationAlert_patient_idx" ON "SpireDeteriorationAlert"("organizationId","legalEntityId","patientId","status","triggeredAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireEmergencyVisit" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "arrivalAt" timestamptz NOT NULL DEFAULT now(),
  "arrivalMode" text,
  "chiefComplaint" text,
  "acuity" integer,
  "trackingStatus" text NOT NULL DEFAULT 'ARRIVED',
  "room" text,
  "providerUserId" text,
  "disposition" text,
  "dispositionAt" timestamptz,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireEmergencyVisit_acuity_check" CHECK ("acuity" IS NULL OR ("acuity">=1 AND "acuity"<=5))
);
CREATE INDEX IF NOT EXISTS "SpireEmergencyVisit_patient_idx" ON "SpireEmergencyVisit"("organizationId","legalEntityId","patientId","arrivalAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireEmergencyTriage" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "emergencyVisitId" text NOT NULL REFERENCES "SpireEmergencyVisit"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "acuity" integer NOT NULL,
  "painScore" integer,
  "presentingProblem" text,
  "highRiskFlags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "triageNote" text,
  "triagedAt" timestamptz NOT NULL DEFAULT now(),
  "triagedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireEmergencyTriage_acuity_check" CHECK ("acuity">=1 AND "acuity"<=5),
  CONSTRAINT "SpireEmergencyTriage_pain_check" CHECK ("painScore" IS NULL OR ("painScore">=0 AND "painScore"<=10))
);
CREATE INDEX IF NOT EXISTS "SpireEmergencyTriage_visit_idx" ON "SpireEmergencyTriage"("organizationId","legalEntityId","emergencyVisitId","triagedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireEmergencyTrackingEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "emergencyVisitId" text NOT NULL REFERENCES "SpireEmergencyVisit"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "fromStatus" text,
  "toStatus" text NOT NULL,
  "room" text,
  "note" text,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "performedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireEmergencyTrackingEvent_visit_idx" ON "SpireEmergencyTrackingEvent"("organizationId","legalEntityId","emergencyVisitId","occurredAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireProcedureCase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "procedureName" text NOT NULL,
  "serviceLine" text,
  "caseStatus" text NOT NULL DEFAULT 'SCHEDULED',
  "scheduledAt" timestamptz,
  "room" text,
  "primarySurgeonUserId" text,
  "anesthesiaType" text,
  "preOpDiagnosis" text,
  "postOpDiagnosis" text,
  "procedureDescription" text,
  "startedAt" timestamptz,
  "endedAt" timestamptz,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireProcedureCase_status_check" CHECK ("caseStatus" IN ('SCHEDULED','PRE_OP','IN_ROOM','PROCEDURE','PACU','COMPLETE','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "SpireProcedureCase_patient_idx" ON "SpireProcedureCase"("organizationId","legalEntityId","patientId","scheduledAt" DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS "SpirePeriopEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "procedureCaseId" text NOT NULL REFERENCES "SpireProcedureCase"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "performedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePeriopEvent_case_idx" ON "SpirePeriopEvent"("organizationId","legalEntityId","procedureCaseId","occurredAt");

CREATE TABLE IF NOT EXISTS "SpireAnesthesiaRecord" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "procedureCaseId" text NOT NULL REFERENCES "SpireProcedureCase"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "recordType" text NOT NULL DEFAULT 'INTRA_OP',
  "airway" text,
  "asaClass" text,
  "anesthesiaType" text,
  "startedAt" timestamptz,
  "endedAt" timestamptz,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "providerUserId" text,
  "signedAt" timestamptz,
  "signedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireAnesthesiaRecord_case_idx" ON "SpireAnesthesiaRecord"("organizationId","legalEntityId","procedureCaseId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireImplantLog" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "procedureCaseId" text NOT NULL REFERENCES "SpireProcedureCase"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "itemName" text NOT NULL,
  "manufacturer" text,
  "lotNumber" text,
  "serialNumber" text,
  "expirationDate" date,
  "implantedAt" timestamptz,
  "removedAt" timestamptz,
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireImplantLog_case_idx" ON "SpireImplantLog"("organizationId","legalEntityId","procedureCaseId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireSurgicalCount" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "procedureCaseId" text NOT NULL REFERENCES "SpireProcedureCase"("id") ON DELETE CASCADE,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "countType" text NOT NULL,
  "itemType" text NOT NULL,
  "expectedCount" integer NOT NULL DEFAULT 0,
  "actualCount" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'PENDING',
  "resolvedNote" text,
  "verifiedById" text,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireSurgicalCount_status_check" CHECK ("status" IN ('PENDING','CORRECT','DISCREPANCY','RESOLVED'))
);
CREATE INDEX IF NOT EXISTS "SpireSurgicalCount_case_idx" ON "SpireSurgicalCount"("organizationId","legalEntityId","procedureCaseId","recordedAt" DESC);
