CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Preserve legal-entity provenance on person-centered planning records. Existing
-- legacy planning rows predate multi-company separation, so assign them to SCLS.
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "sourceIntakeCaseId" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "legalEntityId" text;

UPDATE "SpireCarePlan" p SET "legalEntityId"=e."id"
FROM "LegalEntity" e WHERE p."organizationId"=e."organizationId" AND e."code"='SCLS' AND p."legalEntityId" IS NULL;
UPDATE "SpireCarePlanGoal" p SET "legalEntityId"=e."id"
FROM "LegalEntity" e WHERE p."organizationId"=e."organizationId" AND e."code"='SCLS' AND p."legalEntityId" IS NULL;
UPDATE "SpireCarePlanIntervention" p SET "legalEntityId"=e."id"
FROM "LegalEntity" e WHERE p."organizationId"=e."organizationId" AND e."code"='SCLS' AND p."legalEntityId" IS NULL;
UPDATE "SpireCarePlanRisk" p SET "legalEntityId"=e."id"
FROM "LegalEntity" e WHERE p."organizationId"=e."organizationId" AND e."code"='SCLS' AND p."legalEntityId" IS NULL;
UPDATE "SpireCarePlanSignature" p SET "legalEntityId"=e."id"
FROM "LegalEntity" e WHERE p."organizationId"=e."organizationId" AND e."code"='SCLS' AND p."legalEntityId" IS NULL;
UPDATE "SpireGoalProgressEntry" p SET "legalEntityId"=e."id"
FROM "LegalEntity" e WHERE p."organizationId"=e."organizationId" AND e."code"='SCLS' AND p."legalEntityId" IS NULL;
UPDATE "SpireCarePlanServiceLink" p SET "legalEntityId"=e."id"
FROM "LegalEntity" e WHERE p."organizationId"=e."organizationId" AND e."code"='SCLS' AND p."legalEntityId" IS NULL;

CREATE INDEX IF NOT EXISTS "SpireCarePlan_entity_patient_idx" ON "SpireCarePlan"("organizationId","legalEntityId","patientId","status");
CREATE UNIQUE INDEX IF NOT EXISTS "SpireCarePlan_source_intake_key" ON "SpireCarePlan"("organizationId","sourceIntakeCaseId") WHERE "sourceIntakeCaseId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "SpireCarePlanGoal_entity_idx" ON "SpireCarePlanGoal"("organizationId","legalEntityId","patientId","status");
CREATE INDEX IF NOT EXISTS "SpireCarePlanIntervention_entity_idx" ON "SpireCarePlanIntervention"("organizationId","legalEntityId","patientId","status");
CREATE INDEX IF NOT EXISTS "SpireCarePlanRisk_entity_idx" ON "SpireCarePlanRisk"("organizationId","legalEntityId","patientId","active");

CREATE OR REPLACE FUNCTION "seed_spire_draft_care_plan_from_intake"()
RETURNS trigger AS $$
DECLARE
  plan_id text;
  important_profile jsonb := '{}'::jsonb;
  communication jsonb := '{}'::jsonb;
  preferences jsonb := '{}'::jsonb;
  goals jsonb := '{}'::jsonb;
  nutrition jsonb := '{}'::jsonb;
  behavior jsonb := '{}'::jsonb;
  safety jsonb := '{}'::jsonb;
  rights jsonb := '{}'::jsonb;
  transport jsonb := '{}'::jsonb;
  delegation jsonb := '{}'::jsonb;
  scls_implementation jsonb := '{}'::jsonb;
  ohioisp jsonb := '{}'::jsonb;
  effective_date date;
  review_date date;
BEGIN
  IF NEW."status" <> 'APPROVED' OR NEW."patientId" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND OLD."status"='APPROVED' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM "SpireCarePlan" WHERE "organizationId"=NEW."organizationId" AND "sourceIntakeCaseId"=NEW."id") THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE("payload",'{}'::jsonb) INTO important_profile FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='important_to_for' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO communication FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='communication' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO preferences FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='preferences_routines' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO goals FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='goals_outcomes' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO nutrition FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='nutrition_swallowing' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO behavior FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='behavior_support' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO safety FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='safety_emergency' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO rights FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='rights_choice_privacy' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO transport FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='community_transportation' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO delegation FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='delegation_training' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO scls_implementation FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='scls_isp_implementation' LIMIT 1;
  SELECT COALESCE("payload",'{}'::jsonb) INTO ohioisp FROM "ClientIntakeSection" WHERE "intakeCaseId"=NEW."id" AND "sectionKey"='ohioisp_person_centered_plan' LIMIT 1;

  effective_date := NULLIF(ohioisp->>'planEffectiveDate','')::date;
  review_date := NULLIF(ohioisp->>'planReviewDate','')::date;
  plan_id := gen_random_uuid()::text;

  INSERT INTO "SpireCarePlan"(
    "id","organizationId","legalEntityId","patientId","title","planType","effectiveDate","annualReviewDate",
    "personCenteredSummary","importantTo","importantFor","communicationPlan","transportationPlan","mealPlan",
    "behaviorSupportPlan","emergencyPlan","rightsModifications","restrictiveMeasures","nursingDelegationInstructions",
    "status","createdById","sourceIntakeCaseId"
  ) VALUES (
    plan_id,NEW."organizationId",NEW."legalEntityId",NEW."patientId",
    CASE WHEN NEW."serviceType" IS NULL THEN 'Draft Individual Service Plan from Intake' ELSE 'Draft '||NEW."serviceType"||' Care Plan from Intake' END,
    CASE WHEN NEW."serviceType" ILIKE '%home health%' THEN 'PLAN_OF_CARE' ELSE 'ISP' END,
    effective_date,review_date,
    concat_ws(E'\n\n',NULLIF('Preferences / routines: '||COALESCE(preferences->>'likesInterests',''), 'Preferences / routines: '),NULLIF('Successful support: '||COALESCE(important_profile->>'successfulSupport',''),'Successful support: '),NULLIF('Assessed needs: '||COALESCE(ohioisp->>'assessedNeeds',''),'Assessed needs: ')),
    NULLIF(important_profile->>'importantTo',''),
    NULLIF(important_profile->>'importantFor',''),
    concat_ws(E'\n',NULLIF(communication->>'primaryMethod',''),NULLIF(communication->>'receptiveCommunication',''),NULLIF(communication->>'expressiveCommunication',''),NULLIF(communication->>'assistiveCommunication',''),NULLIF(communication->>'interpreterNeeds','')),
    concat_ws(E'\n',NULLIF(transport->>'transportationNeeds',''),NULLIF(transport->>'vehicleSafety',''),NULLIF(transport->>'frequentDestinations',''),NULLIF(transport->>'independentTravel','')),
    concat_ws(E'\n',NULLIF(nutrition->>'dietOrder',''),NULLIF(nutrition->>'texture',''),NULLIF(nutrition->>'liquidConsistency',''),NULLIF(nutrition->>'swallowingRisk',''),NULLIF(nutrition->>'feedingSupport',''),NULLIF(nutrition->>'fluidPlan','')),
    concat_ws(E'\n',NULLIF(behavior->>'behaviorBaseline',''),NULLIF(behavior->>'triggers',''),NULLIF(behavior->>'earlyWarningSigns',''),NULLIF(behavior->>'positiveSupports',''),NULLIF(behavior->>'crisisPlan',''),NULLIF(behavior->>'behaviorPlan','')),
    concat_ws(E'\n',NULLIF(safety->>'emergencyPlan',''),NULLIF(safety->>'evacuationSupport',''),NULLIF(safety->>'elopementRisk',''),NULLIF(safety->>'chokingRisk',''),NULLIF(safety->>'weatherDisaster',''),NULLIF(safety->>'emergencyEquipment','')),
    concat_ws(E'\n',NULLIF(rights->>'rightsConcerns',''),NULLIF(rights->>'rightsRestrictions',''),NULLIF(rights->>'privacyPreferences',''),NULLIF(rights->>'choicePreferences','')),
    NULLIF(rights->>'rightsRestrictions',''),
    concat_ws(E'\n',NULLIF(delegation->>'delegatedTasks',''),NULLIF(delegation->>'delegatingNurse',''),NULLIF(delegation->>'medCertification',''),NULLIF(delegation->>'individualSpecificTraining',''),NULLIF(delegation->>'competencies',''),NULLIF(delegation->>'trainingBeforeFirstShift','')),
    'DRAFT',COALESCE(NEW."approvedById",NEW."createdById"),NEW."id"
  );

  IF NULLIF(goals->>'serviceGoals','') IS NOT NULL THEN
    INSERT INTO "SpireCarePlanGoal"("id","organizationId","legalEntityId","patientId","carePlanId","title","desiredOutcome","frequency","status","progressPercent","startsAt","reviewDate","createdById")
    VALUES(gen_random_uuid()::text,NEW."organizationId",NEW."legalEntityId",NEW."patientId",plan_id,'Service / ISP Goals',goals->>'serviceGoals',NULLIF(goals->>'howProgressMeasured',''),'ACTIVE',0,effective_date,review_date,COALESCE(NEW."approvedById",NEW."createdById"));
  END IF;
  IF NULLIF(goals->>'lifeGoals','') IS NOT NULL THEN
    INSERT INTO "SpireCarePlanGoal"("id","organizationId","legalEntityId","patientId","carePlanId","title","desiredOutcome","status","progressPercent","startsAt","reviewDate","createdById")
    VALUES(gen_random_uuid()::text,NEW."organizationId",NEW."legalEntityId",NEW."patientId",plan_id,'Personal Life Goals',goals->>'lifeGoals','ACTIVE',0,effective_date,review_date,COALESCE(NEW."approvedById",NEW."createdById"));
  END IF;

  IF NULLIF(scls_implementation->>'outcomeImplementation','') IS NOT NULL OR NULLIF(scls_implementation->>'dailyDocumentation','') IS NOT NULL THEN
    INSERT INTO "SpireCarePlanIntervention"("id","organizationId","legalEntityId","patientId","carePlanId","title","instructions","responsibleRole","serviceType","status","createdById")
    VALUES(gen_random_uuid()::text,NEW."organizationId",NEW."legalEntityId",NEW."patientId",plan_id,'Daily ISP Implementation',concat_ws(E'\n',NULLIF(scls_implementation->>'outcomeImplementation',''),NULLIF(scls_implementation->>'dailyDocumentation',''),NULLIF(scls_implementation->>'dataCollection',''),NULLIF(scls_implementation->>'supervisorReview','')),'DSP',NEW."serviceType",'ACTIVE',COALESCE(NEW."approvedById",NEW."createdById"));
  END IF;

  IF NULLIF(safety->>'emergencyPlan','') IS NOT NULL OR NULLIF(safety->>'elopementRisk','') IS NOT NULL OR NULLIF(safety->>'chokingRisk','') IS NOT NULL THEN
    INSERT INTO "SpireCarePlanRisk"("id","organizationId","legalEntityId","patientId","carePlanId","category","title","riskLevel","triggerDescription","preventionPlan","responsePlan","emergencyInstructions","active")
    VALUES(gen_random_uuid()::text,NEW."organizationId",NEW."legalEntityId",NEW."patientId",plan_id,'SAFETY','Intake-Identified Safety and Emergency Risks','HIGH',concat_ws(E'\n',NULLIF(safety->>'elopementRisk',''),NULLIF(safety->>'chokingRisk',''),NULLIF(safety->>'abuseNeglectRisk','')),NULLIF(scls_implementation->>'riskProtocols',''),NULLIF(safety->>'emergencyPlan',''),concat_ws(E'\n',NULLIF(safety->>'evacuationSupport',''),NULLIF(safety->>'emergencyEquipment','')),true);
  END IF;

  INSERT INTO "SpireCarePlanVersion"("id","organizationId","carePlanId","version","snapshot","reason","createdById")
  VALUES(gen_random_uuid()::text,NEW."organizationId",plan_id,1,jsonb_build_object('source','CLIENT_INTAKE','sourceIntakeCaseId',NEW."id",'legalEntityId',NEW."legalEntityId",'status','DRAFT'),'Seeded from approved client intake; requires clinical/program review before activation or signature.',COALESCE(NEW."approvedById",NEW."createdById"));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ClientIntakeCase_seed_draft_care_plan" ON "ClientIntakeCase";
CREATE TRIGGER "ClientIntakeCase_seed_draft_care_plan"
AFTER INSERT OR UPDATE OF "status","patientId" ON "ClientIntakeCase"
FOR EACH ROW EXECUTE FUNCTION "seed_spire_draft_care_plan_from_intake"();

COMMENT ON COLUMN "SpireCarePlan"."sourceIntakeCaseId" IS 'Approved intake case that seeded this draft plan. Intake seeding never signs or activates the care plan automatically.';
