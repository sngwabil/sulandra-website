CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- NMT dispatch was introduced earlier by 20260810011500_nmt_trip_dispatch.
-- This migration extends that live schema in place instead of assuming the
-- vehicle/trip tables are new. Never drop the earlier dispatch tables here:
-- they may already contain pre-launch configuration or trip history.

-- ---------------------------------------------------------------------------
-- VEHICLES: preserve vehicleNumber-based dispatch while adding operations fields.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS "NmtVehicle" ADD COLUMN IF NOT EXISTS "unitNumber" text;
ALTER TABLE IF EXISTS "NmtVehicle" ADD COLUMN IF NOT EXISTS "stretcherCapable" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "NmtVehicle" ADD COLUMN IF NOT EXISTS "outOfService" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "NmtVehicle" ADD COLUMN IF NOT EXISTS "outOfServiceReason" text;

UPDATE "NmtVehicle"
SET "unitNumber"=COALESCE(NULLIF("unitNumber",''),"vehicleNumber")
WHERE "unitNumber" IS NULL OR "unitNumber"='';

CREATE OR REPLACE FUNCTION "sync_nmt_vehicle_number_fields"() RETURNS trigger AS $$
BEGIN
  IF NEW."vehicleNumber" IS NULL OR btrim(NEW."vehicleNumber")='' THEN
    NEW."vehicleNumber":=NEW."unitNumber";
  END IF;
  IF NEW."unitNumber" IS NULL OR btrim(NEW."unitNumber")='' THEN
    NEW."unitNumber":=NEW."vehicleNumber";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "NmtVehicle_sync_number_fields" ON "NmtVehicle";
CREATE TRIGGER "NmtVehicle_sync_number_fields"
BEFORE INSERT OR UPDATE OF "vehicleNumber","unitNumber" ON "NmtVehicle"
FOR EACH ROW EXECUTE FUNCTION "sync_nmt_vehicle_number_fields"();

CREATE UNIQUE INDEX IF NOT EXISTS "NmtVehicle_entity_unit_unique"
  ON "NmtVehicle"("organizationId","legalEntityId","unitNumber")
  WHERE "unitNumber" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "NmtVehicle_operations_active_idx"
  ON "NmtVehicle"("organizationId","legalEntityId","active","outOfService","unitNumber");

-- ---------------------------------------------------------------------------
-- DRIVER ASSIGNMENT PROFILE: additive companion to the original NmtDriverProfile.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "NmtDriverAssignmentProfile" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "userId" text NOT NULL,
  "displayName" text NOT NULL,
  "phone" text,
  "employeeNumber" text,
  "wheelchairTransportQualified" boolean NOT NULL DEFAULT false,
  "bariatricTransportQualified" boolean NOT NULL DEFAULT false,
  "stretcherTransportQualified" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtDriverAssignmentProfile_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtDriverAssignmentProfile_user_unique"
    UNIQUE ("organizationId","legalEntityId","userId")
);
CREATE INDEX IF NOT EXISTS "NmtDriverAssignmentProfile_active_idx"
  ON "NmtDriverAssignmentProfile"("organizationId","legalEntityId","active","displayName");

-- ---------------------------------------------------------------------------
-- TRIPS: extend the original dispatch table so both route generations work.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "legType" text NOT NULL DEFAULT 'OUTBOUND';
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "sequence" integer;
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "scheduledDropoffAt" timestamptz;
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "pickupWindowMinutes" integer NOT NULL DEFAULT 15;
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "driverUserId" text;
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "driverProfileId" text;
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "dispatchNotes" text;
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "enRouteAt" timestamptz;
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "arrivedDropoffAt" timestamptz;
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "milesDriven" numeric(12,2);
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "billableMiles" numeric(12,2);
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "billingEligible" boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "billingStatus" text NOT NULL DEFAULT 'NOT_READY';
ALTER TABLE IF EXISTS "NmtTrip" ADD COLUMN IF NOT EXISTS "createdById" text;

-- Existing dispatch rows are mapped into the additive operations fields.
UPDATE "NmtTrip" t
SET "scheduledDropoffAt"=COALESCE(t."scheduledDropoffAt",t."scheduledArrivalAt"),
    "dispatchNotes"=COALESCE(t."dispatchNotes",t."dispatcherNotes"),
    "arrivedDropoffAt"=COALESCE(t."arrivedDropoffAt",t."arrivedDestinationAt"),
    "milesDriven"=COALESCE(t."milesDriven",t."actualMiles"),
    "createdById"=COALESCE(t."createdById",t."dispatcherUserId")
WHERE t."scheduledDropoffAt" IS NULL
   OR t."dispatchNotes" IS NULL
   OR t."arrivedDropoffAt" IS NULL
   OR t."milesDriven" IS NULL
   OR t."createdById" IS NULL;

UPDATE "NmtTrip" t
SET "driverUserId"=d."userId"
FROM "NmtDriverProfile" d
WHERE t."driverUserId" IS NULL
  AND t."driverId"=d."id";

-- Assign stable leg sequence numbers to any historical repeated order trips.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "organizationId","legalEntityId","orderId"
           ORDER BY "createdAt","id"
         )::integer AS seq
  FROM "NmtTrip"
)
UPDATE "NmtTrip" t
SET "sequence"=ranked.seq
FROM ranked
WHERE t."id"=ranked."id" AND t."sequence" IS NULL;

CREATE OR REPLACE FUNCTION "assign_nmt_trip_sequence"() RETURNS trigger AS $$
BEGIN
  IF NEW."sequence" IS NULL THEN
    SELECT COALESCE(MAX(t."sequence"),0)+1
      INTO NEW."sequence"
      FROM "NmtTrip" t
     WHERE t."organizationId"=NEW."organizationId"
       AND t."legalEntityId"=NEW."legalEntityId"
       AND t."orderId"=NEW."orderId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "NmtTrip_assign_sequence" ON "NmtTrip";
CREATE TRIGGER "NmtTrip_assign_sequence"
BEFORE INSERT ON "NmtTrip"
FOR EACH ROW EXECUTE FUNCTION "assign_nmt_trip_sequence"();

ALTER TABLE "NmtTrip" ALTER COLUMN "sequence" SET NOT NULL;
ALTER TABLE "NmtTrip" ALTER COLUMN "scheduledPickupAt" DROP NOT NULL;
ALTER TABLE "NmtTrip" ALTER COLUMN "tripNumber" DROP NOT NULL;
ALTER TABLE "NmtTrip" ALTER COLUMN "dispatcherUserId" DROP NOT NULL;

-- The original active-order index allowed one active trip per order. Operations
-- supports multiple legs, so sequence becomes the durable uniqueness boundary.
DROP INDEX IF EXISTS "NmtTrip_active_order_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "NmtTrip_order_sequence_unique"
  ON "NmtTrip"("organizationId","legalEntityId","orderId","sequence");
CREATE INDEX IF NOT EXISTS "NmtTrip_operations_driver_idx"
  ON "NmtTrip"("organizationId","legalEntityId","driverUserId","scheduledPickupAt")
  WHERE "driverUserId" IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NmtTrip_driver_assignment_profile_fkey') THEN
    ALTER TABLE "NmtTrip" ADD CONSTRAINT "NmtTrip_driver_assignment_profile_fkey"
      FOREIGN KEY ("driverProfileId") REFERENCES "NmtDriverAssignmentProfile"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Broaden the original dispatch status constraint so both dispatch status names
-- and the newer operations status names remain valid.
ALTER TABLE "NmtTrip" DROP CONSTRAINT IF EXISTS "NmtTrip_status_check";
ALTER TABLE "NmtTrip" ADD CONSTRAINT "NmtTrip_status_check" CHECK ("status" IN (
  'UNSCHEDULED','SCHEDULED','DISPATCHED','EN_ROUTE','EN_ROUTE_TO_PICKUP',
  'ARRIVED_PICKUP','RIDER_ON_BOARD','DEPARTED_PICKUP','EN_ROUTE_TO_DESTINATION',
  'ARRIVED_DROPOFF','ARRIVED_DESTINATION','COMPLETED','NO_SHOW','CANCELLED'
));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NmtTrip_leg_check') THEN
    ALTER TABLE "NmtTrip" ADD CONSTRAINT "NmtTrip_leg_check"
      CHECK ("legType" IN ('OUTBOUND','RETURN','RECURRING'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NmtTrip_billing_status_check') THEN
    ALTER TABLE "NmtTrip" ADD CONSTRAINT "NmtTrip_billing_status_check"
      CHECK ("billingStatus" IN ('NOT_READY','READY','HELD','SUBMITTED','PAID','DENIED','VOID'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NmtTrip_window_check') THEN
    ALTER TABLE "NmtTrip" ADD CONSTRAINT "NmtTrip_window_check"
      CHECK ("pickupWindowMinutes">=0 AND "pickupWindowMinutes"<=240);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NmtTrip_sequence_check') THEN
    ALTER TABLE "NmtTrip" ADD CONSTRAINT "NmtTrip_sequence_check" CHECK ("sequence">0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NmtTrip_odometer_check') THEN
    ALTER TABLE "NmtTrip" ADD CONSTRAINT "NmtTrip_odometer_check"
      CHECK ("odometerStart" IS NULL OR "odometerEnd" IS NULL OR "odometerEnd">="odometerStart");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NmtTrip_training_nonbillable_check') THEN
    ALTER TABLE "NmtTrip" ADD CONSTRAINT "NmtTrip_training_nonbillable_check"
      CHECK ("mode"<>'TRAINING_ONLY' OR ("billingEligible"=false AND "billingStatus"='NOT_READY'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- TRIP EVENTS: extend original event rows without discarding audit history.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS "NmtTripEvent" ADD COLUMN IF NOT EXISTS "orderId" text;
ALTER TABLE IF EXISTS "NmtTripEvent" ADD COLUMN IF NOT EXISTS "actorType" text;
ALTER TABLE IF EXISTS "NmtTripEvent" ADD COLUMN IF NOT EXISTS "actorId" text;
ALTER TABLE IF EXISTS "NmtTripEvent" ADD COLUMN IF NOT EXISTS "ipAddress" text;
ALTER TABLE IF EXISTS "NmtTripEvent" ADD COLUMN IF NOT EXISTS "userAgent" text;

UPDATE "NmtTripEvent" e
SET "orderId"=t."orderId"
FROM "NmtTrip" t
WHERE e."tripId"=t."id" AND e."orderId" IS NULL;

UPDATE "NmtTripEvent"
SET "actorId"=COALESCE("actorId","actorUserId"),
    "actorType"=COALESCE("actorType",CASE WHEN "actorUserId" IS NULL THEN 'SYSTEM' ELSE 'DISPATCH' END)
WHERE "actorId" IS NULL OR "actorType" IS NULL;

CREATE OR REPLACE FUNCTION "sync_nmt_trip_event_compatibility"() RETURNS trigger AS $$
BEGIN
  IF NEW."orderId" IS NULL THEN
    SELECT t."orderId" INTO NEW."orderId" FROM "NmtTrip" t WHERE t."id"=NEW."tripId";
  END IF;
  IF NEW."actorId" IS NULL THEN NEW."actorId":=NEW."actorUserId"; END IF;
  IF NEW."actorType" IS NULL THEN
    NEW."actorType":=CASE WHEN NEW."actorUserId" IS NULL THEN 'SYSTEM' ELSE 'DISPATCH' END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "NmtTripEvent_sync_compatibility" ON "NmtTripEvent";
CREATE TRIGGER "NmtTripEvent_sync_compatibility"
BEFORE INSERT ON "NmtTripEvent"
FOR EACH ROW EXECUTE FUNCTION "sync_nmt_trip_event_compatibility"();

ALTER TABLE "NmtTripEvent" ALTER COLUMN "orderId" SET NOT NULL;
ALTER TABLE "NmtTripEvent" ALTER COLUMN "actorType" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NmtTripEvent_order_fkey') THEN
    ALTER TABLE "NmtTripEvent" ADD CONSTRAINT "NmtTripEvent_order_fkey"
      FOREIGN KEY ("orderId") REFERENCES "NmtTransportOrder"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='NmtTripEvent_actor_check') THEN
    ALTER TABLE "NmtTripEvent" ADD CONSTRAINT "NmtTripEvent_actor_check"
      CHECK ("actorType" IN ('DRIVER','DISPATCH','ADMIN','SYSTEM'));
  END IF;
END $$;

-- Keep append-only behavior for trip event history.
CREATE OR REPLACE FUNCTION "prevent_nmt_trip_event_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'NmtTripEvent is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "NmtTripEvent_no_update" ON "NmtTripEvent";
CREATE TRIGGER "NmtTripEvent_no_update"
BEFORE UPDATE ON "NmtTripEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_nmt_trip_event_mutation"();
DROP TRIGGER IF EXISTS "NmtTripEvent_no_delete" ON "NmtTripEvent";
CREATE TRIGGER "NmtTripEvent_no_delete"
BEFORE DELETE ON "NmtTripEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_nmt_trip_event_mutation"();

CREATE OR REPLACE FUNCTION "prevent_training_trip_billing"() RETURNS trigger AS $$
BEGIN
  IF NEW."mode"='TRAINING_ONLY' THEN
    NEW."billingEligible":=false;
    NEW."billingStatus":='NOT_READY';
    NEW."billableMiles":=NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "NmtTrip_training_billing_guard" ON "NmtTrip";
CREATE TRIGGER "NmtTrip_training_billing_guard"
BEFORE INSERT OR UPDATE ON "NmtTrip"
FOR EACH ROW EXECUTE FUNCTION "prevent_training_trip_billing"();
