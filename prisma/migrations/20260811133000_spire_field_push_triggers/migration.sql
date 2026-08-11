-- Field push queue hooks for Sulandra's in-network mobile workflow.
-- Push text is intentionally generic and contains no client name, diagnosis, medication,
-- address, or other PHI. The authenticated native app retrieves details after opening.

CREATE OR REPLACE FUNCTION "spire_queue_user_push"(
  p_organization_id text,
  p_legal_entity_id text,
  p_user_id text,
  p_category text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_collapse_key text,
  p_data jsonb,
  p_priority text DEFAULT 'NORMAL'
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RETURN;
  END IF;

  INSERT INTO "SpirePushDelivery"(
    "organizationId","legalEntityId","userId","deviceId","category","title","body",
    "deepLink","collapseKey","data","priority","status","nextAttemptAt"
  )
  SELECT p_organization_id,p_legal_entity_id,p_user_id,d."id",p_category,p_title,p_body,
         p_deep_link,p_collapse_key,COALESCE(p_data,'{}'::jsonb),p_priority,'QUEUED',NOW()
    FROM "SpirePushDevice" d
   WHERE d."organizationId"=p_organization_id
     AND d."userId"=p_user_id
     AND d."status"='ACTIVE'
     AND (p_legal_entity_id IS NULL OR d."legalEntityId" IS NULL OR d."legalEntityId"=p_legal_entity_id);
END;
$$;

CREATE OR REPLACE FUNCTION "spire_push_appointment_change"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP='INSERT'
     OR NEW."startsAt" IS DISTINCT FROM OLD."startsAt"
     OR NEW."endsAt" IS DISTINCT FROM OLD."endsAt"
     OR NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."providerUserId" IS DISTINCT FROM OLD."providerUserId" THEN
    PERFORM "spire_queue_user_push"(
      NEW."organizationId",NEW."legalEntityId",NEW."providerUserId",
      'SCHEDULE_CHANGE','Schedule updated',
      'Your Sulandra schedule changed. Open the app to review the update.',
      'sulandra://schedule','appointment-'||NEW."id",
      jsonb_build_object('appointmentId',NEW."id"),
      CASE WHEN NEW."status"='CANCELLED' THEN 'HIGH' ELSE 'NORMAL' END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "SpireAppointment_field_push" ON "SpireAppointment";
CREATE TRIGGER "SpireAppointment_field_push"
AFTER INSERT OR UPDATE ON "SpireAppointment"
FOR EACH ROW EXECUTE FUNCTION "spire_push_appointment_change"();

CREATE OR REPLACE FUNCTION "spire_push_evv_change"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP='INSERT'
     OR NEW."scheduledStart" IS DISTINCT FROM OLD."scheduledStart"
     OR NEW."scheduledEnd" IS DISTINCT FROM OLD."scheduledEnd"
     OR NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."employeeUserId" IS DISTINCT FROM OLD."employeeUserId" THEN
    PERFORM "spire_queue_user_push"(
      NEW."organizationId",NEW."legalEntityId",NEW."employeeUserId",
      'SHIFT_UPDATE','Shift update',
      'A scheduled visit or shift changed. Open Sulandra Health to review it.',
      'sulandra://evv','evv-'||NEW."id",
      jsonb_build_object('visitId',NEW."id"),
      CASE WHEN NEW."status" IN ('CANCELLED','EXCEPTION') THEN 'HIGH' ELSE 'NORMAL' END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "SpireEvvVisit_field_push" ON "SpireEvvVisit";
CREATE TRIGGER "SpireEvvVisit_field_push"
AFTER INSERT OR UPDATE ON "SpireEvvVisit"
FOR EACH ROW EXECUTE FUNCTION "spire_push_evv_change"();

CREATE OR REPLACE FUNCTION "spire_push_nmt_trip_change"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  driver_user_id text;
BEGIN
  SELECT d."userId" INTO driver_user_id
    FROM "NmtDriverProfile" d
   WHERE d."organizationId"=NEW."organizationId"
     AND d."legalEntityId"=NEW."legalEntityId"
     AND d."id"=NEW."driverId"
   LIMIT 1;

  IF driver_user_id IS NOT NULL AND (
       TG_OP='INSERT'
       OR NEW."scheduledPickupAt" IS DISTINCT FROM OLD."scheduledPickupAt"
       OR NEW."scheduledArrivalAt" IS DISTINCT FROM OLD."scheduledArrivalAt"
       OR NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."driverId" IS DISTINCT FROM OLD."driverId"
     ) THEN
    PERFORM "spire_queue_user_push"(
      NEW."organizationId",NEW."legalEntityId",driver_user_id,
      'TRANSPORT_UPDATE','Transport assignment updated',
      'A transport assignment changed. Open Sulandra Health to review it.',
      'sulandra://transport','trip-'||NEW."id",
      jsonb_build_object('tripId',NEW."id"),
      CASE WHEN NEW."status"='CANCELLED' THEN 'HIGH' ELSE 'NORMAL' END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "NmtTrip_field_push" ON "NmtTrip";
CREATE TRIGGER "NmtTrip_field_push"
AFTER INSERT OR UPDATE ON "NmtTrip"
FOR EACH ROW EXECUTE FUNCTION "spire_push_nmt_trip_change"();

CREATE OR REPLACE FUNCTION "spire_push_inbasket_urgent"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."assignedToUserId" IS NOT NULL
     AND NEW."priority" IN ('URGENT','HIGH')
     AND (TG_OP='INSERT'
          OR NEW."priority" IS DISTINCT FROM OLD."priority"
          OR NEW."assignedToUserId" IS DISTINCT FROM OLD."assignedToUserId") THEN
    PERFORM "spire_queue_user_push"(
      NEW."organizationId",NEW."legalEntityId",NEW."assignedToUserId",
      'URGENT_CLIENT_UPDATE','Urgent client update',
      'An urgent client update requires your review. Open Sulandra Health.',
      'sulandra://inbox','inbasket-'||NEW."id",
      jsonb_build_object('inBasketItemId',NEW."id"),
      'HIGH'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "SpireInBasketItem_field_push" ON "SpireInBasketItem";
CREATE TRIGGER "SpireInBasketItem_field_push"
AFTER INSERT OR UPDATE ON "SpireInBasketItem"
FOR EACH ROW EXECUTE FUNCTION "spire_push_inbasket_urgent"();
