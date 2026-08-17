-- SPIRE 1.1 Phase B / Step 1
-- Immutable evidence for the EVV pre-billing hard stop. A decision records what
-- the gate evaluated when Revenue Cycle attempted READY or BATCH. It does not
-- represent ODM/Sandata certification and cannot be mutated after insertion.

CREATE TABLE IF NOT EXISTS "SpireEvvPrebillDecision" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "serviceEventId" text NOT NULL REFERENCES "RevenueCycleServiceEvent"("id") ON DELETE RESTRICT,
  "evvVisitId" text REFERENCES "SpireEvvVisit"("id") ON DELETE RESTRICT,
  "action" text NOT NULL,
  "required" boolean NOT NULL,
  "ready" boolean NOT NULL,
  "decisionCode" text NOT NULL,
  "errors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireEvvPrebillDecision_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireEvvPrebillDecision_action_ck" CHECK ("action" IN ('READY','BATCH')),
  CONSTRAINT "SpireEvvPrebillDecision_code_ck" CHECK ("decisionCode" IN ('NOT_REQUIRED','PASS','BLOCK'))
);

CREATE INDEX IF NOT EXISTS "SpireEvvPrebillDecision_event_idx"
  ON "SpireEvvPrebillDecision"("organizationId","legalEntityId","serviceEventId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireEvvPrebillDecision_visit_idx"
  ON "SpireEvvPrebillDecision"("organizationId","evvVisitId","createdAt" DESC)
  WHERE "evvVisitId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "SpireEvvPrebillDecision_block_idx"
  ON "SpireEvvPrebillDecision"("organizationId","legalEntityId","ready","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_spire_evv_prebill_decision_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SpireEvvPrebillDecision is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireEvvPrebillDecision_no_update" ON "SpireEvvPrebillDecision";
CREATE TRIGGER "SpireEvvPrebillDecision_no_update"
BEFORE UPDATE ON "SpireEvvPrebillDecision"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_evv_prebill_decision_mutation"();

DROP TRIGGER IF EXISTS "SpireEvvPrebillDecision_no_delete" ON "SpireEvvPrebillDecision";
CREATE TRIGGER "SpireEvvPrebillDecision_no_delete"
BEFORE DELETE ON "SpireEvvPrebillDecision"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_evv_prebill_decision_mutation"();

-- Keep the existing Revenue Cycle projection as the owner of event creation, then
-- normalize its mutable pre-batch billing fields to the canonical EVV effective
-- values. The zz_ name makes this AFTER trigger run after the existing projection.
CREATE OR REPLACE FUNCTION "sync_scls_evv_revenue_canonical_match"()
RETURNS trigger AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_units numeric;
BEGIN
  IF UPPER(COALESCE(NEW."status",'')) NOT IN ('COMPLETED','VERIFIED','APPROVED') THEN RETURN NEW; END IF;
  v_start := COALESCE(NEW."adjustedClockInAt",NEW."clockInAt");
  v_end := COALESCE(NEW."adjustedClockOutAt",NEW."clockOutAt");
  IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_end>v_start THEN
    v_units := ROUND((EXTRACT(EPOCH FROM (v_end-v_start))/900.0)::numeric,3);
  ELSE
    v_units := NEW."units";
  END IF;
  UPDATE "RevenueCycleServiceEvent" SET
    "serviceDate"=COALESCE(v_start::date,v_end::date,"serviceDate"),
    "serviceStart"=COALESCE(v_start,"serviceStart"),
    "serviceEnd"=COALESCE(v_end,"serviceEnd"),
    "serviceCode"=COALESCE(NULLIF(NEW."procedureCode",''),NULLIF(NEW."serviceCode",''),"serviceCode"),
    "units"=COALESCE(v_units,"units"),
    "authorizationId"=COALESCE(NEW."authorizationId","authorizationId"),
    "metadata"="metadata"||jsonb_build_object(
      'evvCanonicalMatchVersion','SPIRE_1_1_PHASE_B_1',
      'authorizationId',NEW."authorizationId",
      'procedureCode',COALESCE(NEW."procedureCode",NEW."serviceCode")
    ),
    "updatedAt"=NOW()
  WHERE "organizationId"=NEW."organizationId"
    AND "sourceModule"='SCLS' AND "sourceType"='SpireEvvVisit' AND "sourceId"=NEW."id"
    AND "status" NOT IN ('BATCHED','EXPORTED','VOID');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "zz_SpireEvvVisit_canonical_revenue_match" ON "SpireEvvVisit";
CREATE TRIGGER "zz_SpireEvvVisit_canonical_revenue_match"
AFTER INSERT OR UPDATE ON "SpireEvvVisit"
FOR EACH ROW EXECUTE FUNCTION "sync_scls_evv_revenue_canonical_match"();

-- Normalize already-projected, still-editable SCLS EVV events immediately.
UPDATE "RevenueCycleServiceEvent" e SET
  "serviceDate"=COALESCE(COALESCE(v."adjustedClockInAt",v."clockInAt")::date,COALESCE(v."adjustedClockOutAt",v."clockOutAt")::date,e."serviceDate"),
  "serviceStart"=COALESCE(v."adjustedClockInAt",v."clockInAt",e."serviceStart"),
  "serviceEnd"=COALESCE(v."adjustedClockOutAt",v."clockOutAt",e."serviceEnd"),
  "serviceCode"=COALESCE(NULLIF(v."procedureCode",''),NULLIF(v."serviceCode",''),e."serviceCode"),
  "units"=CASE
    WHEN COALESCE(v."adjustedClockOutAt",v."clockOutAt")>COALESCE(v."adjustedClockInAt",v."clockInAt")
      THEN ROUND((EXTRACT(EPOCH FROM (COALESCE(v."adjustedClockOutAt",v."clockOutAt")-COALESCE(v."adjustedClockInAt",v."clockInAt")))/900.0)::numeric,3)
    ELSE COALESCE(v."units",e."units") END,
  "authorizationId"=COALESCE(v."authorizationId",e."authorizationId"),
  "metadata"=e."metadata"||jsonb_build_object(
    'evvCanonicalMatchVersion','SPIRE_1_1_PHASE_B_1',
    'authorizationId',v."authorizationId",
    'procedureCode',COALESCE(v."procedureCode",v."serviceCode")
  ),
  "updatedAt"=NOW()
FROM "SpireEvvVisit" v
WHERE e."organizationId"=v."organizationId"
  AND e."sourceModule"='SCLS' AND e."sourceType"='SpireEvvVisit' AND e."sourceId"=v."id"
  AND e."status" NOT IN ('BATCHED','EXPORTED','VOID');
