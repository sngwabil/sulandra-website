CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "RevenueCycleServiceEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "sourceModule" text NOT NULL,
  "sourceType" text NOT NULL,
  "sourceId" text NOT NULL,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "serviceDate" date,
  "serviceStart" timestamptz,
  "serviceEnd" timestamptz,
  "serviceCode" text,
  "serviceDescription" text,
  "units" numeric(12,3),
  "unitType" text,
  "payerType" text,
  "payerName" text,
  "authorizationId" text,
  "authorizationNumber" text,
  "unitRate" numeric(12,4),
  "estimatedAmount" numeric(14,2),
  "billable" boolean NOT NULL DEFAULT false,
  "trainingOnly" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "holdReason" text,
  "exceptions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reviewedAt" timestamptz,
  "reviewedByUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleServiceEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "RevenueCycleServiceEvent_source_key" UNIQUE ("organizationId","legalEntityId","sourceType","sourceId"),
  CONSTRAINT "RevenueCycleServiceEvent_status_check" CHECK ("status" IN ('REVIEW_REQUIRED','READY','HELD','BATCHED','EXPORTED','NON_BILLABLE','VOID')),
  CONSTRAINT "RevenueCycleServiceEvent_source_check" CHECK ("sourceModule" IN ('SCLS','HOME_HEALTH','NMT','MANUAL')),
  CONSTRAINT "RevenueCycleServiceEvent_payer_check" CHECK ("payerType" IS NULL OR "payerType" IN ('MEDICAID','MEDICARE','COMMERCIAL','CONTRACT','SELF_PAY','OTHER'))
);
CREATE INDEX IF NOT EXISTS "RevenueCycleServiceEvent_entity_status_idx" ON "RevenueCycleServiceEvent"("organizationId","legalEntityId","status","serviceDate" DESC);
CREATE INDEX IF NOT EXISTS "RevenueCycleServiceEvent_patient_idx" ON "RevenueCycleServiceEvent"("organizationId","patientId","serviceDate" DESC) WHERE "patientId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "RevenueCycleBatch" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "batchNumber" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "periodStart" date,
  "periodEnd" date,
  "payerType" text,
  "payerName" text,
  "totalEvents" integer NOT NULL DEFAULT 0,
  "totalUnits" numeric(14,3) NOT NULL DEFAULT 0,
  "estimatedAmount" numeric(14,2) NOT NULL DEFAULT 0,
  "notes" text,
  "createdByUserId" text NOT NULL,
  "finalizedAt" timestamptz,
  "finalizedByUserId" text,
  "exportedAt" timestamptz,
  "exportedByUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleBatch_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "RevenueCycleBatch_number_key" UNIQUE ("organizationId","legalEntityId","batchNumber"),
  CONSTRAINT "RevenueCycleBatch_status_check" CHECK ("status" IN ('DRAFT','FINALIZED','EXPORTED','VOID'))
);
CREATE INDEX IF NOT EXISTS "RevenueCycleBatch_entity_idx" ON "RevenueCycleBatch"("organizationId","legalEntityId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "RevenueCycleBatchLine" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "batchId" text NOT NULL REFERENCES "RevenueCycleBatch"("id") ON DELETE CASCADE,
  "serviceEventId" text NOT NULL REFERENCES "RevenueCycleServiceEvent"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleBatchLine_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "RevenueCycleBatchLine_event_key" UNIQUE ("serviceEventId")
);
CREATE INDEX IF NOT EXISTS "RevenueCycleBatchLine_batch_idx" ON "RevenueCycleBatchLine"("organizationId","legalEntityId","batchId");

CREATE TABLE IF NOT EXISTS "RevenueCycleEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "serviceEventId" text REFERENCES "RevenueCycleServiceEvent"("id") ON DELETE CASCADE,
  "batchId" text REFERENCES "RevenueCycleBatch"("id") ON DELETE CASCADE,
  "eventType" text NOT NULL,
  "actorUserId" text NOT NULL,
  "fromStatus" text,
  "toStatus" text,
  "comment" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "RevenueCycleEvent_service_idx" ON "RevenueCycleEvent"("organizationId","legalEntityId","serviceEventId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "RevenueCycleEvent_batch_idx" ON "RevenueCycleEvent"("organizationId","legalEntityId","batchId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_revenue_cycle_event_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'RevenueCycleEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "RevenueCycleEvent_no_update" ON "RevenueCycleEvent";
CREATE TRIGGER "RevenueCycleEvent_no_update" BEFORE UPDATE ON "RevenueCycleEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_cycle_event_mutation"();
DROP TRIGGER IF EXISTS "RevenueCycleEvent_no_delete" ON "RevenueCycleEvent";
CREATE TRIGGER "RevenueCycleEvent_no_delete" BEFORE DELETE ON "RevenueCycleEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_cycle_event_mutation"();

CREATE OR REPLACE FUNCTION "upsert_revenue_service_event"(
  p_org text,p_entity text,p_module text,p_type text,p_source text,p_patient text,p_date date,p_start timestamptz,p_end timestamptz,
  p_code text,p_description text,p_units numeric,p_unit_type text,p_training boolean,p_metadata jsonb
) RETURNS void AS $$
DECLARE event_id text; exc jsonb := '[]'::jsonb;
BEGIN
  IF p_org IS NULL OR p_entity IS NULL OR p_source IS NULL THEN RETURN; END IF;
  IF p_patient IS NULL THEN exc:=exc||jsonb_build_array('PATIENT_NOT_LINKED'); END IF;
  IF p_date IS NULL THEN exc:=exc||jsonb_build_array('SERVICE_DATE_MISSING'); END IF;
  IF p_code IS NULL OR trim(p_code)='' THEN exc:=exc||jsonb_build_array('SERVICE_CODE_REVIEW_REQUIRED'); END IF;
  SELECT "id" INTO event_id FROM "RevenueCycleServiceEvent" WHERE "organizationId"=p_org AND "legalEntityId"=p_entity AND "sourceType"=p_type AND "sourceId"=p_source LIMIT 1;
  IF event_id IS NULL THEN
    INSERT INTO "RevenueCycleServiceEvent"(
      "id","organizationId","legalEntityId","sourceModule","sourceType","sourceId","patientId","serviceDate","serviceStart","serviceEnd",
      "serviceCode","serviceDescription","units","unitType","trainingOnly","billable","status","exceptions","metadata"
    ) VALUES(
      gen_random_uuid()::text,p_org,p_entity,p_module,p_type,p_source,p_patient,p_date,p_start,p_end,p_code,p_description,p_units,p_unit_type,
      COALESCE(p_training,false),false,CASE WHEN COALESCE(p_training,false) THEN 'NON_BILLABLE' ELSE 'REVIEW_REQUIRED' END,exc,COALESCE(p_metadata,'{}'::jsonb)
    );
  ELSE
    UPDATE "RevenueCycleServiceEvent" SET
      "patientId"=COALESCE(p_patient,"patientId"),"serviceDate"=COALESCE(p_date,"serviceDate"),"serviceStart"=COALESCE(p_start,"serviceStart"),
      "serviceEnd"=COALESCE(p_end,"serviceEnd"),"serviceCode"=COALESCE(NULLIF(p_code,''),"serviceCode"),"serviceDescription"=COALESCE(p_description,"serviceDescription"),
      "units"=COALESCE(p_units,"units"),"unitType"=COALESCE(p_unit_type,"unitType"),"trainingOnly"=COALESCE(p_training,"trainingOnly"),
      "exceptions"=CASE WHEN "status"='REVIEW_REQUIRED' THEN exc ELSE "exceptions" END,"metadata"="metadata"||COALESCE(p_metadata,'{}'::jsonb),"updatedAt"=NOW()
    WHERE "id"=event_id AND "status" NOT IN ('BATCHED','EXPORTED','VOID');
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "project_home_health_visit_revenue"() RETURNS trigger AS $$
DECLARE j jsonb; st text; service_start timestamptz; service_end timestamptz; service_date date; units numeric; training boolean;
BEGIN
  j:=to_jsonb(NEW); st:=upper(COALESCE(j->>'status',''));
  IF st='COMPLETED' THEN
    BEGIN service_start:=COALESCE(NULLIF(j->>'actualStart','')::timestamptz,NULLIF(j->>'startedAt','')::timestamptz,NULLIF(j->>'scheduledStart','')::timestamptz); EXCEPTION WHEN others THEN service_start:=NULL; END;
    BEGIN service_end:=COALESCE(NULLIF(j->>'actualEnd','')::timestamptz,NULLIF(j->>'completedAt','')::timestamptz,NULLIF(j->>'scheduledEnd','')::timestamptz); EXCEPTION WHEN others THEN service_end:=NULL; END;
    service_date:=COALESCE(service_start::date,service_end::date,CURRENT_DATE);
    IF service_start IS NOT NULL AND service_end IS NOT NULL AND service_end>service_start THEN units:=ROUND(EXTRACT(EPOCH FROM (service_end-service_start))/900.0,3); ELSE BEGIN units:=NULLIF(j->>'units','')::numeric; EXCEPTION WHEN others THEN units:=1; END; END IF;
    training:=lower(COALESCE(j->>'mode','')) LIKE '%training%' OR lower(COALESCE(j->>'trainingOnly','false'))='true';
    PERFORM "upsert_revenue_service_event"(j->>'organizationId',j->>'legalEntityId','HOME_HEALTH','HomeHealthVisit',j->>'id',j->>'patientId',service_date,service_start,service_end,COALESCE(j->>'serviceCode',j->>'discipline',j->>'visitType'),concat_ws(' · ',j->>'discipline',j->>'visitType'),COALESCE(units,1),'15_MINUTE',training,jsonb_build_object('episodeId',j->>'episodeId','discipline',j->>'discipline','visitType',j->>'visitType','assignedUserId',j->>'assignedUserId'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"HomeHealthVisit"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "HomeHealthVisit_revenue_projection" ON "HomeHealthVisit"'; EXECUTE 'CREATE TRIGGER "HomeHealthVisit_revenue_projection" AFTER INSERT OR UPDATE ON "HomeHealthVisit" FOR EACH ROW EXECUTE FUNCTION "project_home_health_visit_revenue"()'; END IF; END $$;

CREATE OR REPLACE FUNCTION "project_nmt_trip_revenue"() RETURNS trigger AS $$
DECLARE j jsonb; st text; service_start timestamptz; service_end timestamptz; service_date date; units numeric; training boolean; patient_id text;
BEGIN
  j:=to_jsonb(NEW); st:=upper(COALESCE(j->>'status',''));patient_id:=COALESCE(j->>'patientId',j->>'clientId');
  IF st='COMPLETED' THEN
    BEGIN service_start:=COALESCE(NULLIF(j->>'actualPickupAt','')::timestamptz,NULLIF(j->>'pickupAt','')::timestamptz,NULLIF(j->>'scheduledPickupAt','')::timestamptz); EXCEPTION WHEN others THEN service_start:=NULL; END;
    BEGIN service_end:=COALESCE(NULLIF(j->>'completedAt','')::timestamptz,NULLIF(j->>'dropoffAt','')::timestamptz); EXCEPTION WHEN others THEN service_end:=NULL; END;
    service_date:=COALESCE(service_start::date,service_end::date,CURRENT_DATE);
    BEGIN units:=COALESCE(NULLIF(j->>'billableMiles','')::numeric,NULLIF(j->>'miles','')::numeric,NULLIF(j->>'actualMiles','')::numeric,1); EXCEPTION WHEN others THEN units:=1; END;
    training:=lower(COALESCE(j->>'mode','')) LIKE '%training%' OR lower(COALESCE(j->>'trainingOnly','false'))='true';
    PERFORM "upsert_revenue_service_event"(j->>'organizationId',j->>'legalEntityId','NMT','NmtTrip',j->>'id',patient_id,service_date,service_start,service_end,COALESCE(j->>'serviceCode',j->>'serviceLevel',j->>'tripType'),'Non-medical transportation completed trip',units,CASE WHEN units>1 THEN 'MILE' ELSE 'TRIP' END,training,jsonb_build_object('tripNumber',j->>'tripNumber','vehicleId',j->>'vehicleId','driverProfileId',j->>'driverProfileId','orderId',j->>'orderId'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"NmtTrip"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "NmtTrip_revenue_projection" ON "NmtTrip"'; EXECUTE 'CREATE TRIGGER "NmtTrip_revenue_projection" AFTER INSERT OR UPDATE ON "NmtTrip" FOR EACH ROW EXECUTE FUNCTION "project_nmt_trip_revenue"()'; END IF; END $$;

CREATE OR REPLACE FUNCTION "project_scls_evv_revenue"() RETURNS trigger AS $$
DECLARE j jsonb; st text; service_start timestamptz; service_end timestamptz; service_date date; units numeric; training boolean; patient_id text;
BEGIN
  j:=to_jsonb(NEW);st:=upper(COALESCE(j->>'status',''));patient_id:=COALESCE(j->>'patientId',j->>'clientId');
  IF st IN ('COMPLETED','VERIFIED','APPROVED') THEN
    BEGIN service_start:=COALESCE(NULLIF(j->>'clockInAt','')::timestamptz,NULLIF(j->>'startedAt','')::timestamptz,NULLIF(j->>'visitStart','')::timestamptz); EXCEPTION WHEN others THEN service_start:=NULL; END;
    BEGIN service_end:=COALESCE(NULLIF(j->>'clockOutAt','')::timestamptz,NULLIF(j->>'endedAt','')::timestamptz,NULLIF(j->>'visitEnd','')::timestamptz); EXCEPTION WHEN others THEN service_end:=NULL; END;
    service_date:=COALESCE(service_start::date,service_end::date,CURRENT_DATE);
    IF service_start IS NOT NULL AND service_end IS NOT NULL AND service_end>service_start THEN units:=ROUND(EXTRACT(EPOCH FROM (service_end-service_start))/900.0,3); ELSE BEGIN units:=COALESCE(NULLIF(j->>'units','')::numeric,NULLIF(j->>'deliveredUnits','')::numeric,1); EXCEPTION WHEN others THEN units:=1; END; END IF;
    training:=lower(COALESCE(j->>'mode','')) LIKE '%training%' OR lower(COALESCE(j->>'trainingOnly','false'))='true';
    PERFORM "upsert_revenue_service_event"(j->>'organizationId',j->>'legalEntityId','SCLS','SpireEvvVisit',j->>'id',patient_id,service_date,service_start,service_end,COALESCE(j->>'serviceCode',j->>'serviceType',j->>'programCode'),'SCLS EVV/service delivery record',units,'15_MINUTE',training,jsonb_build_object('authorizationId',j->>'authorizationId','employeeUserId',COALESCE(j->>'userId',j->>'employeeUserId'),'visitVerificationMethod',j->>'verificationMethod'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN IF to_regclass('"SpireEvvVisit"') IS NOT NULL THEN EXECUTE 'DROP TRIGGER IF EXISTS "SpireEvvVisit_revenue_projection" ON "SpireEvvVisit"'; EXECUTE 'CREATE TRIGGER "SpireEvvVisit_revenue_projection" AFTER INSERT OR UPDATE ON "SpireEvvVisit" FOR EACH ROW EXECUTE FUNCTION "project_scls_evv_revenue"()'; END IF; END $$;

CREATE OR REPLACE FUNCTION "notify_revenue_cycle_review"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('REVIEW_REQUIRED','HELD') AND NEW."trainingOnly"=FALSE THEN
    PERFORM "upsert_enterprise_work_notification"(NEW."organizationId",NEW."legalEntityId",NULL,'["ADMINISTRATOR","PROGRAM_MANAGER","BILLING_SPECIALIST","CEO","DOO"]'::jsonb,'REVENUE_CYCLE','RevenueCycleServiceEvent',NEW."id",'BILLING_REVIEW',concat('Billing review — ',NEW."sourceModule",' ',COALESCE(NEW."serviceCode",NEW."sourceType")),CASE WHEN NEW."status"='HELD' THEN COALESCE(NEW."holdReason",'Service event is on billing hold.') ELSE 'Completed service requires billing readiness review.' END,CASE WHEN NEW."status"='HELD' THEN 'HIGH' ELSE 'ROUTINE' END,'/revenue-cycle.html',NULL,jsonb_build_object('patientId',NEW."patientId",'sourceType',NEW."sourceType",'sourceId',NEW."sourceId"));
  ELSE
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=NOW(),"updatedAt"=NOW() WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId" AND "resourceType"='RevenueCycleServiceEvent' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "RevenueCycleServiceEvent_work_notification" ON "RevenueCycleServiceEvent";
CREATE TRIGGER "RevenueCycleServiceEvent_work_notification" AFTER INSERT OR UPDATE OF "status","holdReason" ON "RevenueCycleServiceEvent" FOR EACH ROW EXECUTE FUNCTION "notify_revenue_cycle_review"();
