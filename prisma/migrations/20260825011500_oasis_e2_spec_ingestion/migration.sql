-- OASIS-E2 / iQIES spec-driven ingestion foundation.
-- This migration deliberately does not embed or invent CMS item/edit content.
-- Official CMS 3.02.0 package content must be normalized, hashed and validated
-- before the registered specification can transition to VALIDATED.

ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "sourcePackageName" text;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "sourcePackageSha256" text;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "sourceManifest" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "valueSets" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "submissionDefinition" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "normalizedDefinitionSha256" text;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "loadedAt" timestamptz;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "loadedById" text;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "validatedAt" timestamptz;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "validatedById" text;
ALTER TABLE "HomeHealthOasisSpecVersion"
  ADD COLUMN IF NOT EXISTS "validatorVersion" text;

CREATE INDEX IF NOT EXISTS "HomeHealthOasisSpecVersion_status_effective_idx"
  ON "HomeHealthOasisSpecVersion"("status","effectiveFrom","effectiveThrough");

CREATE TABLE IF NOT EXISTS "HomeHealthOasisSpecImport" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "specVersionId" text NOT NULL REFERENCES "HomeHealthOasisSpecVersion"("id") ON DELETE RESTRICT,
  "sourcePackageName" text NOT NULL,
  "sourcePackageSha256" text NOT NULL,
  "normalizedDefinitionSha256" text NOT NULL,
  "sourceManifest" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "validatorVersion" text NOT NULL,
  "validationStatus" text NOT NULL,
  "validationFindings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "itemDefinitionCount" integer NOT NULL DEFAULT 0,
  "editRuleCount" integer NOT NULL DEFAULT 0,
  "valueSetCount" integer NOT NULL DEFAULT 0,
  "submissionMappingCount" integer NOT NULL DEFAULT 0,
  "importedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthOasisSpecImport_validation_ck"
    CHECK ("validationStatus" IN ('PASS','FAIL'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthOasisSpecImport_spec_idx"
  ON "HomeHealthOasisSpecImport"("specVersionId","createdAt" DESC);

-- Preserve the audit trail for official specification imports.
CREATE OR REPLACE FUNCTION "prevent_home_health_oasis_spec_import_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'HomeHealthOasisSpecImport is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "HomeHealthOasisSpecImport_no_update" ON "HomeHealthOasisSpecImport";
CREATE TRIGGER "HomeHealthOasisSpecImport_no_update"
BEFORE UPDATE ON "HomeHealthOasisSpecImport"
FOR EACH ROW EXECUTE FUNCTION "prevent_home_health_oasis_spec_import_mutation"();
DROP TRIGGER IF EXISTS "HomeHealthOasisSpecImport_no_delete" ON "HomeHealthOasisSpecImport";
CREATE TRIGGER "HomeHealthOasisSpecImport_no_delete"
BEFORE DELETE ON "HomeHealthOasisSpecImport"
FOR EACH ROW EXECUTE FUNCTION "prevent_home_health_oasis_spec_import_mutation"();

-- Transaction mode is a SPIRE semantic state. Actual CMS submission values are
-- sourced from the loaded submissionDefinition rather than hard-coded here.
ALTER TABLE "HomeHealthOasisAssessment"
  ADD COLUMN IF NOT EXISTS "transactionMode" text NOT NULL DEFAULT 'NEW';
ALTER TABLE "HomeHealthOasisAssessment"
  ADD COLUMN IF NOT EXISTS "submissionIntentReason" text;
DO $$ BEGIN
  ALTER TABLE "HomeHealthOasisAssessment"
    ADD CONSTRAINT "HomeHealthOasisAssessment_transaction_mode_ck"
    CHECK ("transactionMode" IN ('NEW','MODIFICATION','INACTIVATION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "HomeHealthOasisAssessment_transaction_idx"
  ON "HomeHealthOasisAssessment"("organizationId","legalEntityId","transactionMode","status","targetDate");

-- Store export/reconciliation metadata, not raw unencrypted PHI XML.
ALTER TABLE "HomeHealthIqiesSubmission"
  ADD COLUMN IF NOT EXISTS "payloadBytes" integer;
ALTER TABLE "HomeHealthIqiesSubmission"
  ADD COLUMN IF NOT EXISTS "recordCount" integer NOT NULL DEFAULT 1;
ALTER TABLE "HomeHealthIqiesSubmission"
  ADD COLUMN IF NOT EXISTS "exportMetadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "HomeHealthIqiesSubmission"
  ADD COLUMN IF NOT EXISTS "validationReportSha256" text;
ALTER TABLE "HomeHealthIqiesSubmission"
  ADD COLUMN IF NOT EXISTS "responseReceivedAt" timestamptz;
ALTER TABLE "HomeHealthIqiesSubmission"
  ADD COLUMN IF NOT EXISTS "sourceSnapshotSha256" text;
ALTER TABLE "HomeHealthIqiesSubmission"
  ADD COLUMN IF NOT EXISTS "specDefinitionSha256" text;

DO $$ BEGIN
  ALTER TABLE "HomeHealthIqiesSubmission"
    ADD CONSTRAINT "HomeHealthIqiesSubmission_payload_bytes_ck"
    CHECK ("payloadBytes" IS NULL OR "payloadBytes">=0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HomeHealthIqiesSubmission"
    ADD CONSTRAINT "HomeHealthIqiesSubmission_record_count_ck"
    CHECK ("recordCount">0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
