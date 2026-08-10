-- Production drift repair for legacy SpireClinicalTask installations.
--
-- Some shared databases recorded 20260810090000_referral_attachment_sync_and_scls_task_events
-- as applied before that migration gained the legacy task-normalization statements now present
-- in the repository.  Do not rewrite the already-recorded migration.  Repair the live schema
-- additively before 20260810100000_enterprise_work_notifications creates task triggers.

ALTER TABLE IF EXISTS "SpireClinicalTask"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE IF EXISTS "SpireClinicalTask"
  ADD COLUMN IF NOT EXISTS "taskType" text;
ALTER TABLE IF EXISTS "SpireClinicalTask"
  ADD COLUMN IF NOT EXISTS "priority" text;

-- Normalize task type without assuming every historical installation has the legacy `type` column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SpireClinicalTask'
      AND column_name = 'type'
  ) THEN
    UPDATE "SpireClinicalTask"
    SET "taskType" = COALESCE(NULLIF("taskType", ''), NULLIF("type", ''), 'GENERAL')
    WHERE "taskType" IS NULL OR btrim("taskType") = '';
  ELSE
    UPDATE "SpireClinicalTask"
    SET "taskType" = COALESCE(NULLIF("taskType", ''), 'GENERAL')
    WHERE "taskType" IS NULL OR btrim("taskType") = '';
  END IF;
END $$;

UPDATE "SpireClinicalTask"
SET "priority" = CASE
  WHEN "priority" IS NULL OR btrim("priority") = '' THEN 'ROUTINE'
  WHEN upper("priority") = 'NORMAL' THEN 'ROUTINE'
  WHEN upper("priority") IN ('ROUTINE', 'HIGH', 'URGENT') THEN upper("priority")
  ELSE 'ROUTINE'
END;

ALTER TABLE "SpireClinicalTask"
  ALTER COLUMN "taskType" SET DEFAULT 'GENERAL';
ALTER TABLE "SpireClinicalTask"
  ALTER COLUMN "taskType" SET NOT NULL;
ALTER TABLE "SpireClinicalTask"
  ALTER COLUMN "priority" SET DEFAULT 'ROUTINE';
ALTER TABLE "SpireClinicalTask"
  ALTER COLUMN "priority" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SpireClinicalTask_priority_check'
      AND conrelid = '"SpireClinicalTask"'::regclass
  ) THEN
    ALTER TABLE "SpireClinicalTask"
      ADD CONSTRAINT "SpireClinicalTask_priority_check"
      CHECK ("priority" IN ('ROUTINE', 'HIGH', 'URGENT'));
  END IF;
END $$;

-- Restore the compatibility sync used by the original clientId-oriented SPIRE task API.
CREATE OR REPLACE FUNCTION "sync_spire_clinical_task_type_fields"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."taskType" := COALESCE(NULLIF(NEW."taskType", ''), NULLIF(NEW."type", ''), 'GENERAL');
    NEW."type" := COALESCE(NULLIF(NEW."type", ''), NEW."taskType");
    IF NEW."type" IS DISTINCT FROM NEW."taskType" THEN
      NEW."type" := NEW."taskType";
    END IF;
  ELSE
    IF NEW."taskType" IS DISTINCT FROM OLD."taskType"
       AND NEW."type" IS NOT DISTINCT FROM OLD."type" THEN
      NEW."type" := NEW."taskType";
    ELSIF NEW."type" IS DISTINCT FROM OLD."type"
       AND NEW."taskType" IS NOT DISTINCT FROM OLD."taskType" THEN
      NEW."taskType" := NEW."type";
    ELSIF NEW."taskType" IS NULL OR btrim(NEW."taskType") = '' THEN
      NEW."taskType" := COALESCE(NULLIF(NEW."type", ''), 'GENERAL');
      NEW."type" := NEW."taskType";
    ELSIF NEW."type" IS NULL OR btrim(NEW."type") = '' THEN
      NEW."type" := NEW."taskType";
    ELSIF NEW."type" IS DISTINCT FROM NEW."taskType" THEN
      NEW."type" := NEW."taskType";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireClinicalTask_sync_type_fields" ON "SpireClinicalTask";
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'SpireClinicalTask'
      AND column_name = 'type'
  ) THEN
    CREATE TRIGGER "SpireClinicalTask_sync_type_fields"
    BEFORE INSERT OR UPDATE OF "type", "taskType" ON "SpireClinicalTask"
    FOR EACH ROW EXECUTE FUNCTION "sync_spire_clinical_task_type_fields"();
  END IF;
END $$;

-- Recover legal-entity provenance from the most specific available source first.
DO $$
BEGIN
  IF to_regclass('"SpirePatientHomeAssignment"') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'SpirePatientHomeAssignment'
         AND column_name = 'legalEntityId'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'SpireClinicalTask'
         AND column_name = 'homeId'
     ) THEN
    UPDATE "SpireClinicalTask" task
    SET "legalEntityId" = (
      SELECT pha."legalEntityId"
      FROM "SpirePatientHomeAssignment" pha
      WHERE pha."organizationId" = task."organizationId"
        AND pha."homeId" = task."homeId"
        AND pha."legalEntityId" IS NOT NULL
      LIMIT 1
    )
    WHERE task."legalEntityId" IS NULL
      AND task."homeId" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "SpirePatientHomeAssignment" pha
        WHERE pha."organizationId" = task."organizationId"
          AND pha."homeId" = task."homeId"
          AND pha."legalEntityId" IS NOT NULL
      );
  END IF;

  IF to_regclass('"ClientEnrollment"') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'SpireClinicalTask'
         AND column_name = 'clientId'
     ) THEN
    UPDATE "SpireClinicalTask" task
    SET "legalEntityId" = (
      SELECT ce."legalEntityId"
      FROM "ClientEnrollment" ce
      WHERE ce."organizationId" = task."organizationId"
        AND ce."clientId" = task."clientId"
        AND ce."status" IN ('PENDING', 'ACTIVE', 'PAUSED')
      ORDER BY CASE ce."status" WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END
      LIMIT 1
    )
    WHERE task."legalEntityId" IS NULL
      AND task."clientId" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "ClientEnrollment" ce
        WHERE ce."organizationId" = task."organizationId"
          AND ce."clientId" = task."clientId"
          AND ce."status" IN ('PENDING', 'ACTIVE', 'PAUSED')
      );
  END IF;

  IF to_regclass('"LegalEntity"') IS NOT NULL THEN
    UPDATE "SpireClinicalTask" task
    SET "legalEntityId" = (
      SELECT le."id"
      FROM "LegalEntity" le
      WHERE le."organizationId" = task."organizationId"
        AND le."code" = 'SCLS'
      LIMIT 1
    )
    WHERE task."legalEntityId" IS NULL
      AND EXISTS (
        SELECT 1
        FROM "LegalEntity" le
        WHERE le."organizationId" = task."organizationId"
          AND le."code" = 'SCLS'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SpireClinicalTask_entity_fkey'
      AND conrelid = '"SpireClinicalTask"'::regclass
  ) THEN
    ALTER TABLE "SpireClinicalTask"
      ADD CONSTRAINT "SpireClinicalTask_entity_fkey"
      FOREIGN KEY ("organizationId", "legalEntityId")
      REFERENCES "LegalEntity"("organizationId", "id")
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SpireClinicalTask_entity_status_idx"
  ON "SpireClinicalTask"("organizationId", "legalEntityId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "SpireClinicalTask_priority_due_idx"
  ON "SpireClinicalTask"("organizationId", "legalEntityId", "priority", "dueAt")
  WHERE "status" IN ('OPEN', 'IN_PROGRESS');
