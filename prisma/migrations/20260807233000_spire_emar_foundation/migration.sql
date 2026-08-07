CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SpireMedicationSchedule" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "medicationOrderId" text NOT NULL REFERENCES "SpireMedicationOrder"("id") ON DELETE CASCADE,
  "scheduledTime" time NOT NULL,
  "windowBeforeMinutes" integer NOT NULL DEFAULT 60,
  "windowAfterMinutes" integer NOT NULL DEFAULT 60,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireMedicationSchedule_patient_idx" ON "SpireMedicationSchedule"("organizationId","patientId","active");

CREATE TABLE IF NOT EXISTS "SpireMedicationAdministrationEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "medicationOrderId" text NOT NULL REFERENCES "SpireMedicationOrder"("id") ON DELETE RESTRICT,
  "scheduledFor" timestamptz,
  "status" text NOT NULL,
  "administeredDose" text,
  "administeredRoute" text,
  "administeredAt" timestamptz,
  "administeredById" text NOT NULL,
  "reason" text,
  "note" text,
  "prnIndication" text,
  "effectiveness" text,
  "effectivenessRecordedAt" timestamptz,
  "effectivenessRecordedById" text,
  "barcodeValue" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireMedicationAdministrationEvent_patient_idx" ON "SpireMedicationAdministrationEvent"("organizationId","patientId","scheduledFor");
CREATE INDEX IF NOT EXISTS "SpireMedicationAdministrationEvent_med_idx" ON "SpireMedicationAdministrationEvent"("organizationId","medicationOrderId","createdAt");

CREATE TABLE IF NOT EXISTS "SpireMedicationReconciliationItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "reconciliationId" text NOT NULL REFERENCES "SpireMedicationReconciliation"("id") ON DELETE CASCADE,
  "medicationOrderId" text REFERENCES "SpireMedicationOrder"("id") ON DELETE SET NULL,
  "medicationName" text NOT NULL,
  "source" text NOT NULL DEFAULT 'CURRENT_LIST',
  "decision" text NOT NULL DEFAULT 'CONTINUE',
  "reason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "SpireMedicationControlledLog" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "medicationOrderId" text NOT NULL REFERENCES "SpireMedicationOrder"("id") ON DELETE RESTRICT,
  "administrationEventId" text REFERENCES "SpireMedicationAdministrationEvent"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "quantity" numeric,
  "witnessUserId" text,
  "note" text,
  "actorUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireMedicationControlledLog_patient_idx" ON "SpireMedicationControlledLog"("organizationId","patientId","createdAt");
