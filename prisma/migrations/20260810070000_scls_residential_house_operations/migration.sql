CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS "SpireHome" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE IF EXISTS "SpireHome" ADD COLUMN IF NOT EXISTS "homeType" text NOT NULL DEFAULT 'GROUP_HOME';
ALTER TABLE IF EXISTS "SpireHome" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE IF EXISTS "SpireHome" ADD COLUMN IF NOT EXISTS "capacity" integer;
ALTER TABLE IF EXISTS "SpireHome" ADD COLUMN IF NOT EXISTS "managerUserId" text;
ALTER TABLE IF EXISTS "SpireHome" ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'America/New_York';
ALTER TABLE IF EXISTS "SpireHome" ADD COLUMN IF NOT EXISTS "emergencyInstructions" text;
ALTER TABLE IF EXISTS "SpireHome" ADD COLUMN IF NOT EXISTS "houseNotes" text;

UPDATE "SpireHome" home
SET "legalEntityId" = (
  SELECT x."legalEntityId"
  FROM "SpirePatientHomeAssignment" x
  WHERE x."organizationId" = home."organizationId"
    AND x."homeId" = home."id"
    AND x."legalEntityId" IS NOT NULL
  LIMIT 1
)
WHERE home."legalEntityId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "SpirePatientHomeAssignment" x
    WHERE x."organizationId" = home."organizationId"
      AND x."homeId" = home."id"
      AND x."legalEntityId" IS NOT NULL
  );

UPDATE "SpireHome" home
SET "legalEntityId" = entity."id"
FROM "LegalEntity" entity
WHERE home."legalEntityId" IS NULL
  AND entity."organizationId"=home."organizationId"
  AND entity."code"='SCLS';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SpireHome_entity_fkey') THEN
    ALTER TABLE "SpireHome" ADD CONSTRAINT "SpireHome_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "SpireHome_entity_active_idx" ON "SpireHome"("organizationId","legalEntityId","active","name");

ALTER TABLE IF EXISTS "SpirePatientHomeAssignment" ADD COLUMN IF NOT EXISTS "roomLabel" text;
ALTER TABLE IF EXISTS "SpirePatientHomeAssignment" ADD COLUMN IF NOT EXISTS "bedLabel" text;
ALTER TABLE IF EXISTS "SpirePatientHomeAssignment" ADD COLUMN IF NOT EXISTS "placementNotes" text;
ALTER TABLE IF EXISTS "SpirePatientHomeAssignment" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS "SpireHouseShiftHandoff" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "homeId" text NOT NULL REFERENCES "SpireHome"("id") ON DELETE CASCADE,
  "shiftType" text NOT NULL,
  "shiftStart" timestamptz NOT NULL,
  "shiftEnd" timestamptz,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "staffingSummary" text,
  "residentSummary" text,
  "medicationExceptions" text,
  "healthChanges" text,
  "behaviorSafetyChanges" text,
  "appointmentsTransportation" text,
  "unfinishedTasks" text,
  "houseEnvironment" text,
  "followUpRequired" text,
  "createdByUserId" text NOT NULL,
  "signedByUserId" text,
  "signedAt" timestamptz,
  "signatureAttestation" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireHouseShiftHandoff_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireHouseShiftHandoff_status_check" CHECK ("status" IN ('DRAFT','SIGNED','SUPERSEDED')),
  CONSTRAINT "SpireHouseShiftHandoff_shift_check" CHECK ("shiftType" IN ('DAY','EVENING','NIGHT','CUSTOM'))
);
CREATE INDEX IF NOT EXISTS "SpireHouseShiftHandoff_home_idx" ON "SpireHouseShiftHandoff"("organizationId","legalEntityId","homeId","shiftStart" DESC);

CREATE TABLE IF NOT EXISTS "SpireHouseLogEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "homeId" text NOT NULL REFERENCES "SpireHome"("id") ON DELETE CASCADE,
  "eventType" text NOT NULL,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "title" text NOT NULL,
  "details" text NOT NULL,
  "residentId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "severity" text NOT NULL DEFAULT 'INFO',
  "requiresFollowUp" boolean NOT NULL DEFAULT false,
  "followUpOwnerUserId" text,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireHouseLogEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireHouseLogEvent_type_check" CHECK ("eventType" IN ('SHIFT_NOTE','HOUSE_ACTIVITY','APPOINTMENT','TRANSPORTATION','HEALTH_CHANGE','BEHAVIOR_SAFETY','MEDICATION_EXCEPTION','MAINTENANCE','STAFFING','EMERGENCY','OTHER')),
  CONSTRAINT "SpireHouseLogEvent_severity_check" CHECK ("severity" IN ('INFO','WATCH','HIGH','CRITICAL'))
);
CREATE INDEX IF NOT EXISTS "SpireHouseLogEvent_home_idx" ON "SpireHouseLogEvent"("organizationId","legalEntityId","homeId","occurredAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_spire_house_log_event_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'SpireHouseLogEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireHouseLogEvent_no_update" ON "SpireHouseLogEvent";
CREATE TRIGGER "SpireHouseLogEvent_no_update" BEFORE UPDATE ON "SpireHouseLogEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_house_log_event_mutation"();
DROP TRIGGER IF EXISTS "SpireHouseLogEvent_no_delete" ON "SpireHouseLogEvent";
CREATE TRIGGER "SpireHouseLogEvent_no_delete" BEFORE DELETE ON "SpireHouseLogEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_house_log_event_mutation"();
