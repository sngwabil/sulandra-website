-- Company-scope the encounter-closing records used by the Epic-reference parity workflow.
-- These ALTER statements are intentionally defensive because older SPIRE installations
-- may already have some of these columns from company-boundary deployments.

ALTER TABLE "SpireEncounterParticipant" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireEncounterStatusHistory" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireVisitFollowUp" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpirePatientInstruction" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireAfterVisitSummary" ADD COLUMN IF NOT EXISTS "legalEntityId" text;

-- Backfill the company from the owning encounter. This preserves historical data while
-- ensuring new company-scoped reads can distinguish the same patient across Sulandra entities.
UPDATE "SpireEncounterParticipant" child
SET "legalEntityId"=encounter."legalEntityId"
FROM "SpireEncounter" encounter
WHERE child."encounterId"=encounter."id"
  AND child."organizationId"=encounter."organizationId"
  AND child."legalEntityId" IS NULL
  AND encounter."legalEntityId" IS NOT NULL;

UPDATE "SpireEncounterStatusHistory" child
SET "legalEntityId"=encounter."legalEntityId"
FROM "SpireEncounter" encounter
WHERE child."encounterId"=encounter."id"
  AND child."organizationId"=encounter."organizationId"
  AND child."legalEntityId" IS NULL
  AND encounter."legalEntityId" IS NOT NULL;

UPDATE "SpireVisitFollowUp" child
SET "legalEntityId"=encounter."legalEntityId"
FROM "SpireEncounter" encounter
WHERE child."encounterId"=encounter."id"
  AND child."organizationId"=encounter."organizationId"
  AND child."legalEntityId" IS NULL
  AND encounter."legalEntityId" IS NOT NULL;

UPDATE "SpirePatientInstruction" child
SET "legalEntityId"=encounter."legalEntityId"
FROM "SpireEncounter" encounter
WHERE child."encounterId"=encounter."id"
  AND child."organizationId"=encounter."organizationId"
  AND child."legalEntityId" IS NULL
  AND encounter."legalEntityId" IS NOT NULL;

UPDATE "SpireAfterVisitSummary" child
SET "legalEntityId"=encounter."legalEntityId"
FROM "SpireEncounter" encounter
WHERE child."encounterId"=encounter."id"
  AND child."organizationId"=encounter."organizationId"
  AND child."legalEntityId" IS NULL
  AND encounter."legalEntityId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireEncounterParticipant_entity_encounter_idx"
  ON "SpireEncounterParticipant"("organizationId","legalEntityId","encounterId");
CREATE INDEX IF NOT EXISTS "SpireEncounterStatusHistory_entity_encounter_idx"
  ON "SpireEncounterStatusHistory"("organizationId","legalEntityId","encounterId","createdAt");
CREATE INDEX IF NOT EXISTS "SpireVisitFollowUp_entity_encounter_idx"
  ON "SpireVisitFollowUp"("organizationId","legalEntityId","encounterId","requestedAt");
CREATE INDEX IF NOT EXISTS "SpirePatientInstruction_entity_patient_idx"
  ON "SpirePatientInstruction"("organizationId","legalEntityId","patientId","createdAt");
CREATE INDEX IF NOT EXISTS "SpireAfterVisitSummary_entity_patient_idx"
  ON "SpireAfterVisitSummary"("organizationId","legalEntityId","patientId","generatedAt");
