CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Company-aware SPIRE assignment boundaries.
-- Existing operational rows were already backfilled to SCLS by Stage 4. These
-- changes allow the same employee/client or employee/home relationship to exist
-- independently inside different Sulandra legal entities without one company
-- overwriting another company's assignment.

ALTER TABLE "SpireEmployeeClientAssignment"
  DROP CONSTRAINT IF EXISTS "SpireEmployeeClientAssignment_unique";
ALTER TABLE "SpireEmployeeHomeAssignment"
  DROP CONSTRAINT IF EXISTS "SpireEmployeeHomeAssignment_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "SpireEmployeeClientAssignment_entity_unique"
  ON "SpireEmployeeClientAssignment"("organizationId","legalEntityId","userId","clientId")
  WHERE "legalEntityId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "SpireEmployeeHomeAssignment_entity_unique"
  ON "SpireEmployeeHomeAssignment"("organizationId","legalEntityId","userId","homeId")
  WHERE "legalEntityId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireEmployeeClientAssignment_entity_lookup_idx"
  ON "SpireEmployeeClientAssignment"("organizationId","legalEntityId","userId","clientId");
CREATE INDEX IF NOT EXISTS "SpireEmployeeHomeAssignment_entity_lookup_idx"
  ON "SpireEmployeeHomeAssignment"("organizationId","legalEntityId","userId","homeId");
CREATE INDEX IF NOT EXISTS "SpirePatientHomeAssignment_entity_patient_idx"
  ON "SpirePatientHomeAssignment"("organizationId","legalEntityId","patientId","homeId");
CREATE INDEX IF NOT EXISTS "SpireChartAccessEvent_entity_patient_idx"
  ON "SpireChartAccessEvent"("organizationId","legalEntityId","patientId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireMedicationAdministrationEvent_entity_patient_idx"
  ON "SpireMedicationAdministrationEvent"("organizationId","legalEntityId","patientId","scheduledFor");
CREATE INDEX IF NOT EXISTS "SpireMedicationControlledLog_entity_patient_idx"
  ON "SpireMedicationControlledLog"("organizationId","legalEntityId","patientId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireFlowsheetEntry_entity_patient_idx"
  ON "SpireFlowsheetEntry"("organizationId","legalEntityId","patientId","recordedAt" DESC);

-- Preserve compatibility with any old process that briefly writes an assignment
-- without an entity during rolling deployment. A missing entity is interpreted as
-- legacy SCLS only; current API routes always send the selected legal entity.
CREATE OR REPLACE FUNCTION "spire_default_assignment_entity_to_scls"()
RETURNS trigger AS $$
BEGIN
  IF NEW."legalEntityId" IS NULL THEN
    SELECT entity."id" INTO NEW."legalEntityId"
    FROM "LegalEntity" entity
    WHERE entity."organizationId"=NEW."organizationId" AND entity."code"='SCLS'
    LIMIT 1;
  END IF;
  IF NEW."legalEntityId" IS NULL THEN
    RAISE EXCEPTION 'SPIRE assignment requires a legal entity';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireEmployeeClientAssignment_default_entity" ON "SpireEmployeeClientAssignment";
CREATE TRIGGER "SpireEmployeeClientAssignment_default_entity"
BEFORE INSERT OR UPDATE OF "legalEntityId","organizationId" ON "SpireEmployeeClientAssignment"
FOR EACH ROW EXECUTE FUNCTION "spire_default_assignment_entity_to_scls"();

DROP TRIGGER IF EXISTS "SpireEmployeeHomeAssignment_default_entity" ON "SpireEmployeeHomeAssignment";
CREATE TRIGGER "SpireEmployeeHomeAssignment_default_entity"
BEFORE INSERT OR UPDATE OF "legalEntityId","organizationId" ON "SpireEmployeeHomeAssignment"
FOR EACH ROW EXECUTE FUNCTION "spire_default_assignment_entity_to_scls"();

COMMENT ON COLUMN "SpireEmployeeClientAssignment"."legalEntityId" IS
  'Company scope for direct staff-to-client SPIRE chart access. Legacy missing values default to SCLS during rolling deployment.';
COMMENT ON COLUMN "SpireEmployeeHomeAssignment"."legalEntityId" IS
  'Company scope for staff-to-home SPIRE chart access. Legacy missing values default to SCLS during rolling deployment.';
