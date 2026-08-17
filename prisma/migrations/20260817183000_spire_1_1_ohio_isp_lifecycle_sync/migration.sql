-- SPIRE 1.1 / Step 3 lifecycle bridge.
-- Preserve the existing Care Plan lifecycle as the source of activation state.
-- Only Care Plans that have an OhioISP profile are synchronized.

CREATE OR REPLACE FUNCTION "sync_spire_ohio_isp_from_care_plan_lifecycle"()
RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    UPDATE "SpireOhioIspPlan"
       SET "status" = CASE
         WHEN NEW."status"='ACTIVE' THEN 'ACTIVE'
         WHEN NEW."status"='SUPERSEDED' THEN 'SUPERSEDED'
         ELSE 'DRAFT'
       END,
       "updatedAt"=NOW()
     WHERE "organizationId"=NEW."organizationId"
       AND "legalEntityId"=NEW."legalEntityId"
       AND "patientId"=NEW."patientId"
       AND "carePlanId"=NEW."id"
       AND "status"<>'VOID';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireCarePlan_sync_ohio_isp_lifecycle" ON "SpireCarePlan";
CREATE TRIGGER "SpireCarePlan_sync_ohio_isp_lifecycle"
AFTER UPDATE OF "status" ON "SpireCarePlan"
FOR EACH ROW EXECUTE FUNCTION "sync_spire_ohio_isp_from_care_plan_lifecycle"();

-- Align any Step 3 profiles created before this bridge with the current Care Plan state.
UPDATE "SpireOhioIspPlan" o
SET "status" = CASE
      WHEN p."status"='ACTIVE' THEN 'ACTIVE'
      WHEN p."status"='SUPERSEDED' THEN 'SUPERSEDED'
      ELSE 'DRAFT'
    END,
    "updatedAt"=NOW()
FROM "SpireCarePlan" p
WHERE p."organizationId"=o."organizationId"
  AND p."legalEntityId"=o."legalEntityId"
  AND p."patientId"=o."patientId"
  AND p."id"=o."carePlanId"
  AND o."status"<>'VOID';
