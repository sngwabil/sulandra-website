CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Sulandra-native S.P.I.R.E. Care Workstation.
-- Additive/idempotent changes only: preserve all existing clinical records.

ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "documentedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "entryMode" text NOT NULL DEFAULT 'CURRENT';
ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "lateEntryReason" text;
ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "amendsEntryId" text;
ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "amendmentReason" text;
ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "signedAt" timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='SpireFlowsheetEntry_amendsEntryId_fkey'
  ) THEN
    ALTER TABLE "SpireFlowsheetEntry"
      ADD CONSTRAINT "SpireFlowsheetEntry_amendsEntryId_fkey"
      FOREIGN KEY ("amendsEntryId") REFERENCES "SpireFlowsheetEntry"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SpireFlowsheetEntry_entity_documented_idx"
  ON "SpireFlowsheetEntry"("organizationId","legalEntityId","patientId","documentedAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireFlowsheetEntry_amendment_idx"
  ON "SpireFlowsheetEntry"("organizationId","legalEntityId","amendsEntryId");

ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "documentedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "entryMode" text NOT NULL DEFAULT 'CURRENT';
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "lateEntryReason" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "amendsEntryId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "amendmentReason" text;
CREATE INDEX IF NOT EXISTS "SpireGoalProgressEntry_documented_idx"
  ON "SpireGoalProgressEntry"("organizationId","legalEntityId","patientId","documentedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePatientPhoto" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "mimeType" text NOT NULL,
  "imageData" bytea NOT NULL,
  "sha256" text,
  "uploadedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpirePatientPhoto_entity_patient_key"
  ON "SpirePatientPhoto"("organizationId","legalEntityId","patientId");

CREATE TABLE IF NOT EXISTS "SpireClinicalModuleCatalog" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "moduleKey" text NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "discipline" text NOT NULL DEFAULT 'NURSING',
  "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","moduleKey")
);
CREATE INDEX IF NOT EXISTS "SpireClinicalModuleCatalog_category_idx"
  ON "SpireClinicalModuleCatalog"("organizationId","category","active");

CREATE TABLE IF NOT EXISTS "SpirePatientClinicalModule" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "moduleKey" text NOT NULL,
  "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "enabledById" text,
  "enabledAt" timestamptz NOT NULL DEFAULT now(),
  "disabledAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","legalEntityId","patientId","moduleKey")
);
CREATE INDEX IF NOT EXISTS "SpirePatientClinicalModule_patient_idx"
  ON "SpirePatientClinicalModule"("organizationId","legalEntityId","patientId","enabled");

CREATE TABLE IF NOT EXISTS "SpireSleepWakeSchedule" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "startLocalTime" text NOT NULL DEFAULT '22:00',
  "endLocalTime" text NOT NULL DEFAULT '06:00',
  "frequencyMinutes" integer NOT NULL DEFAULT 60,
  "instructions" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","legalEntityId","patientId")
);
CREATE INDEX IF NOT EXISTS "SpireSleepWakeSchedule_patient_idx"
  ON "SpireSleepWakeSchedule"("organizationId","legalEntityId","patientId","active");

COMMENT ON TABLE "SpireClinicalModuleCatalog" IS
  'Admin-editable nursing and home-health clinical catalog available for per-patient activation.';
COMMENT ON TABLE "SpirePatientClinicalModule" IS
  'Clinical catalog modules enabled for a particular patient within a Sulandra legal entity.';
COMMENT ON TABLE "SpireSleepWakeSchedule" IS
  'Per-patient sleep/wake observation schedule; observations are stored as auditable SpireFlowsheetEntry rows.';
COMMENT ON COLUMN "SpireFlowsheetEntry"."recordedAt" IS
  'Clinical event/observation time selected by the documenter.';
COMMENT ON COLUMN "SpireFlowsheetEntry"."documentedAt" IS
  'Immutable system documentation timestamp; distinct from the clinical event time.';
COMMENT ON COLUMN "SpireFlowsheetEntry"."amendsEntryId" IS
  'Original entry corrected by this append-only amendment; signed history is never silently overwritten.';
