-- Canonical Home Health visit -> EVV evidence bridge.
-- HomeHealthVisit remains the clinical/system-of-record visit. SpireEvvVisit is
-- created and maintained only as the EVV/compliance attachment for visits that
-- require EVV. No second clinical visit workflow is introduced.

ALTER TABLE "HomeHealthDisciplineOrder"
  ADD COLUMN IF NOT EXISTS "evvServiceCode" text;

ALTER TABLE "HomeHealthVisit"
  ADD COLUMN IF NOT EXISTS "evvServiceCode" text;

CREATE INDEX IF NOT EXISTS "HomeHealthDisciplineOrder_evv_service_idx"
  ON "HomeHealthDisciplineOrder"("organizationId","legalEntityId","evvServiceCode")
  WHERE "evvServiceCode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "HomeHealthVisit_evv_required_idx"
  ON "HomeHealthVisit"("organizationId","legalEntityId","evvRequired","scheduledStart")
  WHERE "evvRequired"=TRUE;

-- Preserve an explicitly recorded visit-level code, otherwise inherit the
-- provider-order code. This does not guess or manufacture Medicaid procedure
-- codes; EVV-required visits without a configured code are rejected.
UPDATE "HomeHealthVisit" v
SET "evvServiceCode" = o."evvServiceCode",
    "updatedAt" = NOW()
FROM "HomeHealthDisciplineOrder" o
WHERE v."disciplineOrderId" = o."id"
  AND v."evvRequired" = TRUE
  AND v."evvServiceCode" IS NULL
  AND o."evvServiceCode" IS NOT NULL;

CREATE OR REPLACE FUNCTION "sync_home_health_canonical_evv_visit"()
RETURNS trigger AS $$
DECLARE
  v_code text;
  v_order_code text;
  v_evv_id text;
  v_existing_home_health_visit_id text;
BEGIN
  -- The function updates HomeHealthVisit after inserting the EVV attachment.
  -- Do not recursively re-enter from that internal update.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW."evvRequired" IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW."disciplineOrderId" IS NOT NULL THEN
    SELECT "evvServiceCode"
      INTO v_order_code
      FROM "HomeHealthDisciplineOrder"
     WHERE "id" = NEW."disciplineOrderId"
       AND "organizationId" = NEW."organizationId"
       AND "legalEntityId" = NEW."legalEntityId"
       AND "episodeId" = NEW."episodeId"
     LIMIT 1;
  END IF;

  v_code := COALESCE(NULLIF(BTRIM(NEW."evvServiceCode"), ''), NULLIF(BTRIM(v_order_code), ''));

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'EVV-required Home Health visit % requires a configured EVV service/procedure code on its discipline order', NEW."id";
  END IF;

  -- If a legacy/current explicit EVV link is already present, validate that it
  -- belongs to this visit and synchronize only scheduling metadata while OPEN.
  IF NEW."evvVisitId" IS NOT NULL THEN
    SELECT "homeHealthVisitId"
      INTO v_existing_home_health_visit_id
      FROM "SpireEvvVisit"
     WHERE "id" = NEW."evvVisitId"
       AND "organizationId" = NEW."organizationId"
       AND "patientId" = NEW."patientId"
     LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Home Health visit % references EVV visit % that is missing or outside patient scope', NEW."id", NEW."evvVisitId";
    END IF;

    IF v_existing_home_health_visit_id IS NULL THEN
      UPDATE "SpireEvvVisit"
         SET "homeHealthVisitId" = NEW."id",
             "legalEntityId" = COALESCE("legalEntityId", NEW."legalEntityId"),
             "updatedAt" = NOW()
       WHERE "id" = NEW."evvVisitId";
    ELSIF v_existing_home_health_visit_id <> NEW."id" THEN
      RAISE EXCEPTION 'EVV visit % is already attached to another Home Health visit', NEW."evvVisitId";
    END IF;

    UPDATE "SpireEvvVisit"
       SET "employeeUserId" = NEW."assignedUserId",
           "serviceCode" = v_code,
           "procedureCode" = v_code,
           "scheduledStart" = NEW."scheduledStart",
           "scheduledEnd" = NEW."scheduledEnd",
           "updatedAt" = NOW()
     WHERE "id" = NEW."evvVisitId"
       AND "status" = 'OPEN';

    IF NEW."evvServiceCode" IS DISTINCT FROM v_code THEN
      UPDATE "HomeHealthVisit"
         SET "evvServiceCode" = v_code,
             "updatedAt" = NOW()
       WHERE "id" = NEW."id";
    END IF;

    RETURN NEW;
  END IF;

  -- Reuse an already attached canonical EVV record if one exists. This makes
  -- retries/idempotent scheduling safe and prevents duplicate EVV visits.
  SELECT "id"
    INTO v_evv_id
    FROM "SpireEvvVisit"
   WHERE "homeHealthVisitId" = NEW."id"
   LIMIT 1;

  IF v_evv_id IS NULL THEN
    v_evv_id := gen_random_uuid()::text;

    INSERT INTO "SpireEvvVisit"(
      "id","organizationId","legalEntityId","patientId","authorizationId",
      "employeeUserId","appointmentId","serviceCode","procedureCode",
      "scheduledStart","scheduledEnd","verificationMethod","status",
      "homeHealthVisitId","createdAt","updatedAt"
    ) VALUES(
      v_evv_id,NEW."organizationId",NEW."legalEntityId",NEW."patientId",NULL,
      NEW."assignedUserId",NULL,v_code,v_code,
      NEW."scheduledStart",NEW."scheduledEnd",'MOBILE','OPEN',
      NEW."id",NOW(),NOW()
    );
  END IF;

  UPDATE "HomeHealthVisit"
     SET "evvVisitId" = v_evv_id,
         "evvServiceCode" = v_code,
         "updatedAt" = NOW()
   WHERE "id" = NEW."id"
     AND ("evvVisitId" IS NULL OR "evvVisitId" = v_evv_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "HomeHealthVisit_canonical_evv_trg" ON "HomeHealthVisit";
CREATE TRIGGER "HomeHealthVisit_canonical_evv_trg"
AFTER INSERT OR UPDATE OF
  "evvRequired","evvVisitId","evvServiceCode","disciplineOrderId",
  "assignedUserId","scheduledStart","scheduledEnd"
ON "HomeHealthVisit"
FOR EACH ROW EXECUTE FUNCTION "sync_home_health_canonical_evv_visit"();

-- Existing EVV-required visits that are already linked remain unchanged. New or
-- edited EVV-required visits are now prevented from entering an unlinked state.
