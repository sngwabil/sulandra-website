-- Additive alignment for the automatic Client Intake -> SPIRE promotion path.
-- Medication reconciliation is a long-lived workflow record and needs the same
-- retry/update timestamp semantics already used by the other SPIRE chart modules.

ALTER TABLE "SpireMedicationReconciliation"
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "SpireMedicationReconciliation_entity_patient_idx"
  ON "SpireMedicationReconciliation"("organizationId","legalEntityId","patientId","status","createdAt" DESC);

COMMENT ON COLUMN "SpireMedicationReconciliation"."updatedAt" IS
  'Last mutation time. Used by retry-safe Client Intake promotion and medication reconciliation workflows.';
