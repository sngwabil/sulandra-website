-- Restore patientId compatibility for legacy clinical tables created before the
-- patient-centric SPIRE foundation. The original tables use clientId; newer
-- storyboard/timeline routes use patientId. Keep both columns synchronized so
-- existing clinical data and legacy writers remain valid.

ALTER TABLE "SpireVitalSign"
  ADD COLUMN IF NOT EXISTS "patientId" text;

ALTER TABLE "SpireClinicalTask"
  ADD COLUMN IF NOT EXISTS "patientId" text;

-- Backfill rows that can be mapped to the canonical SpirePatient either because
-- the legacy client id is already the patient id or because it is recorded as
-- SpirePatient.legacyClientId.
UPDATE "SpireVitalSign" v
SET "patientId" = p."id"
FROM "SpirePatient" p
WHERE v."organizationId" = p."organizationId"
  AND v."patientId" IS NULL
  AND (
    v."clientId" = p."id"
    OR v."clientId" = p."legacyClientId"
  );

UPDATE "SpireClinicalTask" t
SET "patientId" = p."id"
FROM "SpirePatient" p
WHERE t."organizationId" = p."organizationId"
  AND t."patientId" IS NULL
  AND (
    t."clientId" = p."id"
    OR t."clientId" = p."legacyClientId"
  );

CREATE INDEX IF NOT EXISTS "SpireVitalSign_patient_idx"
  ON "SpireVitalSign" ("organizationId", "patientId", "recordedAt" DESC);

CREATE INDEX IF NOT EXISTS "SpireClinicalTask_patient_idx"
  ON "SpireClinicalTask" ("organizationId", "patientId", "dueAt", "status");

-- Legacy clinical-routes.ts still writes clientId. Synchronize patientId at the
-- database boundary so those writes remain visible to the patient-centric SPIRE
-- storyboard without requiring duplicate clinical records.
CREATE OR REPLACE FUNCTION "sync_spire_legacy_patient_id"()
RETURNS trigger AS $$
BEGIN
  IF NEW."patientId" IS NULL AND NEW."clientId" IS NOT NULL THEN
    SELECT p."id"
      INTO NEW."patientId"
      FROM "SpirePatient" p
     WHERE p."organizationId" = NEW."organizationId"
       AND (
         p."id" = NEW."clientId"
         OR p."legacyClientId" = NEW."clientId"
       )
     ORDER BY CASE WHEN p."id" = NEW."clientId" THEN 0 ELSE 1 END
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireVitalSign_sync_patient_id" ON "SpireVitalSign";
CREATE TRIGGER "SpireVitalSign_sync_patient_id"
BEFORE INSERT OR UPDATE OF "organizationId", "clientId", "patientId"
ON "SpireVitalSign"
FOR EACH ROW EXECUTE FUNCTION "sync_spire_legacy_patient_id"();

DROP TRIGGER IF EXISTS "SpireClinicalTask_sync_patient_id" ON "SpireClinicalTask";
CREATE TRIGGER "SpireClinicalTask_sync_patient_id"
BEFORE INSERT OR UPDATE OF "organizationId", "clientId", "patientId"
ON "SpireClinicalTask"
FOR EACH ROW EXECUTE FUNCTION "sync_spire_legacy_patient_id"();
