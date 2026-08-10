CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure SCLS clinical tasks retain company provenance and normalize the newer
-- residential Task Board fields against the original SPIRE task schema.
ALTER TABLE IF EXISTS "SpireClinicalTask" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE IF EXISTS "SpireClinicalTask" ADD COLUMN IF NOT EXISTS "taskType" text;
ALTER TABLE IF EXISTS "SpireClinicalTask" ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'ROUTINE';

UPDATE "SpireClinicalTask"
SET "taskType"=COALESCE(NULLIF("taskType",''),NULLIF("type",''),'GENERAL')
WHERE "taskType" IS NULL OR btrim("taskType")='';

ALTER TABLE "SpireClinicalTask" ALTER COLUMN "taskType" SET DEFAULT 'GENERAL';
ALTER TABLE "SpireClinicalTask" ALTER COLUMN "taskType" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SpireClinicalTask_priority_check') THEN
    ALTER TABLE "SpireClinicalTask" ADD CONSTRAINT "SpireClinicalTask_priority_check"
      CHECK ("priority" IN ('ROUTINE','HIGH','URGENT'));
  END IF;
END $$;

-- Keep the original `type` column and the newer `taskType` column synchronized
-- so pre-existing task records and older SPIRE callers remain compatible with
-- the residential Task Board API.
CREATE OR REPLACE FUNCTION "sync_spire_clinical_task_type_fields"() RETURNS trigger AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW."taskType":=COALESCE(NULLIF(NEW."taskType",''),NULLIF(NEW."type",''),'GENERAL');
    NEW."type":=COALESCE(NULLIF(NEW."type",''),NEW."taskType");
    IF NEW."type" IS DISTINCT FROM NEW."taskType" THEN NEW."type":=NEW."taskType"; END IF;
  ELSE
    IF NEW."taskType" IS DISTINCT FROM OLD."taskType" AND NEW."type" IS NOT DISTINCT FROM OLD."type" THEN
      NEW."type":=NEW."taskType";
    ELSIF NEW."type" IS DISTINCT FROM OLD."type" AND NEW."taskType" IS NOT DISTINCT FROM OLD."taskType" THEN
      NEW."taskType":=NEW."type";
    ELSIF NEW."taskType" IS NULL OR btrim(NEW."taskType")='' THEN
      NEW."taskType":=COALESCE(NULLIF(NEW."type",''),'GENERAL');
      NEW."type":=NEW."taskType";
    ELSIF NEW."type" IS NULL OR btrim(NEW."type")='' THEN
      NEW."type":=NEW."taskType";
    ELSIF NEW."type" IS DISTINCT FROM NEW."taskType" THEN
      NEW."type":=NEW."taskType";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireClinicalTask_sync_type_fields" ON "SpireClinicalTask";
CREATE TRIGGER "SpireClinicalTask_sync_type_fields"
BEFORE INSERT OR UPDATE OF "type","taskType" ON "SpireClinicalTask"
FOR EACH ROW EXECUTE FUNCTION "sync_spire_clinical_task_type_fields"();

UPDATE "SpireClinicalTask" task
SET "legalEntityId" = COALESCE(
  (SELECT pha."legalEntityId" FROM "SpirePatientHomeAssignment" pha WHERE pha."organizationId"=task."organizationId" AND pha."homeId"=task."homeId" AND pha."legalEntityId" IS NOT NULL LIMIT 1),
  (SELECT ce."legalEntityId" FROM "ClientEnrollment" ce WHERE ce."organizationId"=task."organizationId" AND ce."clientId"=task."clientId" AND ce."status" IN ('PENDING','ACTIVE','PAUSED') LIMIT 1),
  (SELECT le."id" FROM "LegalEntity" le WHERE le."organizationId"=task."organizationId" AND le."code"='SCLS' LIMIT 1)
)
WHERE task."legalEntityId" IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SpireClinicalTask_entity_fkey') THEN
    ALTER TABLE "SpireClinicalTask" ADD CONSTRAINT "SpireClinicalTask_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "SpireClinicalTask_entity_status_idx" ON "SpireClinicalTask"("organizationId","legalEntityId","status","dueAt");
CREATE INDEX IF NOT EXISTS "SpireClinicalTask_priority_due_idx" ON "SpireClinicalTask"("organizationId","legalEntityId","priority","dueAt") WHERE "status" IN ('OPEN','IN_PROGRESS');

CREATE TABLE IF NOT EXISTS "SpireClinicalTaskEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "taskId" text NOT NULL REFERENCES "SpireClinicalTask"("id") ON DELETE CASCADE,
  "eventType" text NOT NULL,
  "fromStatus" text,
  "toStatus" text,
  "actorUserId" text NOT NULL,
  "comment" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireClinicalTaskEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireClinicalTaskEvent_type_check" CHECK ("eventType" IN ('CREATED','STARTED','COMPLETED','CANCELLED','REOPENED','ASSIGNED','COMMENT'))
);
CREATE INDEX IF NOT EXISTS "SpireClinicalTaskEvent_task_idx" ON "SpireClinicalTaskEvent"("organizationId","legalEntityId","taskId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_spire_clinical_task_event_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'SpireClinicalTaskEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireClinicalTaskEvent_no_update" ON "SpireClinicalTaskEvent";
CREATE TRIGGER "SpireClinicalTaskEvent_no_update" BEFORE UPDATE ON "SpireClinicalTaskEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_clinical_task_event_mutation"();
DROP TRIGGER IF EXISTS "SpireClinicalTaskEvent_no_delete" ON "SpireClinicalTaskEvent";
CREATE TRIGGER "SpireClinicalTaskEvent_no_delete" BEFORE DELETE ON "SpireClinicalTaskEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_clinical_task_event_mutation"();

-- Home Health referral documents automatically follow the referral into the
-- Client Intake case. This preserves the original referral attachment while
-- also making it available in the admission packet.
CREATE OR REPLACE FUNCTION "sync_home_health_referral_attachment_to_intake"()
RETURNS trigger AS $$
DECLARE
  target_case text;
  source_id text;
BEGIN
  SELECT r."intakeCaseId", r."sourceId" INTO target_case, source_id
  FROM "HomeHealthReferral" r
  WHERE r."id"=NEW."referralId" AND r."organizationId"=NEW."organizationId";

  IF target_case IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM "ClientIntakeAttachment" cia
    WHERE cia."organizationId"=NEW."organizationId"
      AND cia."legalEntityId"=NEW."legalEntityId"
      AND cia."intakeCaseId"=target_case
      AND cia."sha256"=NEW."sha256"
      AND cia."status"='ACTIVE'
  ) THEN
    INSERT INTO "ClientIntakeAttachment"(
      "id","organizationId","legalEntityId","intakeCaseId","sectionKey","documentType","title",
      "originalFileName","mimeType","sizeBytes","sha256","content","notes","uploadedById"
    ) VALUES(
      gen_random_uuid()::text,NEW."organizationId",NEW."legalEntityId",target_case,'home_health_referral',
      NEW."documentType",NEW."title",NEW."originalFileName",NEW."mimeType",NEW."sizeBytes",NEW."sha256",NEW."content",
      'Automatically synchronized from secure Home Health referral.',concat('REFERRAL_SOURCE:',source_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "HomeHealthReferralAttachment_sync_intake" ON "HomeHealthReferralAttachment";
CREATE TRIGGER "HomeHealthReferralAttachment_sync_intake"
AFTER INSERT ON "HomeHealthReferralAttachment"
FOR EACH ROW EXECUTE FUNCTION "sync_home_health_referral_attachment_to_intake"();

CREATE OR REPLACE FUNCTION "sync_existing_home_health_referral_attachments_on_intake_link"()
RETURNS trigger AS $$
BEGIN
  IF NEW."intakeCaseId" IS NOT NULL AND (OLD."intakeCaseId" IS DISTINCT FROM NEW."intakeCaseId") THEN
    INSERT INTO "ClientIntakeAttachment"(
      "id","organizationId","legalEntityId","intakeCaseId","sectionKey","documentType","title",
      "originalFileName","mimeType","sizeBytes","sha256","content","notes","uploadedById"
    )
    SELECT gen_random_uuid()::text,a."organizationId",a."legalEntityId",NEW."intakeCaseId",'home_health_referral',
      a."documentType",a."title",a."originalFileName",a."mimeType",a."sizeBytes",a."sha256",a."content",
      'Automatically synchronized from secure Home Health referral.',concat('REFERRAL_SOURCE:',NEW."sourceId")
    FROM "HomeHealthReferralAttachment" a
    WHERE a."organizationId"=NEW."organizationId" AND a."legalEntityId"=NEW."legalEntityId" AND a."referralId"=NEW."id"
      AND NOT EXISTS(
        SELECT 1 FROM "ClientIntakeAttachment" cia
        WHERE cia."organizationId"=a."organizationId" AND cia."legalEntityId"=a."legalEntityId"
          AND cia."intakeCaseId"=NEW."intakeCaseId" AND cia."sha256"=a."sha256" AND cia."status"='ACTIVE'
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "HomeHealthReferral_sync_existing_attachments" ON "HomeHealthReferral";
CREATE TRIGGER "HomeHealthReferral_sync_existing_attachments"
AFTER UPDATE OF "intakeCaseId" ON "HomeHealthReferral"
FOR EACH ROW EXECUTE FUNCTION "sync_existing_home_health_referral_attachments_on_intake_link"();
