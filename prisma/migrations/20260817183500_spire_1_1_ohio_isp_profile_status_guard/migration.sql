-- Keep OhioISP profile status aligned even when a profile is created after an
-- already-active Care Plan. The Care Plan lifecycle remains the source of truth.

CREATE OR REPLACE FUNCTION "set_spire_ohio_isp_profile_lifecycle_status"()
RETURNS trigger AS $$
DECLARE
  care_status text;
BEGIN
  IF NEW."status"='VOID' THEN RETURN NEW; END IF;
  SELECT p."status" INTO care_status
    FROM "SpireCarePlan" p
   WHERE p."organizationId"=NEW."organizationId"
     AND p."legalEntityId"=NEW."legalEntityId"
     AND p."patientId"=NEW."patientId"
     AND p."id"=NEW."carePlanId"
   LIMIT 1;
  IF care_status='ACTIVE' THEN NEW."status":='ACTIVE';
  ELSIF care_status='SUPERSEDED' THEN NEW."status":='SUPERSEDED';
  ELSE NEW."status":='DRAFT';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireOhioIspPlan_lifecycle_status_guard" ON "SpireOhioIspPlan";
CREATE TRIGGER "SpireOhioIspPlan_lifecycle_status_guard"
BEFORE INSERT OR UPDATE ON "SpireOhioIspPlan"
FOR EACH ROW EXECUTE FUNCTION "set_spire_ohio_isp_profile_lifecycle_status"();

UPDATE "SpireOhioIspPlan" SET "updatedAt"="updatedAt" WHERE "status"<>'VOID';
