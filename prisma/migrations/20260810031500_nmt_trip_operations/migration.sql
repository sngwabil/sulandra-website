CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "NmtVehicle" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "unitNumber" text NOT NULL,
  "vin" text,
  "year" integer,
  "make" text,
  "model" text,
  "licensePlate" text,
  "wheelchairCapacity" integer NOT NULL DEFAULT 0,
  "ambulatoryCapacity" integer NOT NULL DEFAULT 1,
  "bariatricCapable" boolean NOT NULL DEFAULT false,
  "stretcherCapable" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "outOfService" boolean NOT NULL DEFAULT false,
  "outOfServiceReason" text,
  "notes" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtVehicle_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtVehicle_unit_unique" UNIQUE ("organizationId","legalEntityId","unitNumber"),
  CONSTRAINT "NmtVehicle_capacity_check" CHECK ("wheelchairCapacity">=0 AND "ambulatoryCapacity">=0)
);
CREATE INDEX IF NOT EXISTS "NmtVehicle_entity_active_idx" ON "NmtVehicle"("organizationId","legalEntityId","active","outOfService","unitNumber");

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
  CONSTRAINT "NmtDriverAssignmentProfile_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtDriverAssignmentProfile_user_unique" UNIQUE ("organizationId","legalEntityId","userId")
);
CREATE INDEX IF NOT EXISTS "NmtDriverAssignmentProfile_active_idx" ON "NmtDriverAssignmentProfile"("organizationId","legalEntityId","active","displayName");

CREATE TABLE IF NOT EXISTS "NmtTrip" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "orderId" text NOT NULL REFERENCES "NmtTransportOrder"("id") ON DELETE RESTRICT,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "legType" text NOT NULL DEFAULT 'OUTBOUND',
  "sequence" integer NOT NULL DEFAULT 1,
  "mode" text NOT NULL,
  "status" text NOT NULL DEFAULT 'UNSCHEDULED',
  "scheduledPickupAt" timestamptz,
  "scheduledDropoffAt" timestamptz,
  "pickupWindowMinutes" integer NOT NULL DEFAULT 15,
  "driverUserId" text,
  "driverProfileId" text REFERENCES "NmtDriverAssignmentProfile"("id") ON DELETE SET NULL,
  "vehicleId" text REFERENCES "NmtVehicle"("id") ON DELETE SET NULL,
  "dispatchNotes" text,
  "driverNotes" text,
  "enRouteAt" timestamptz,
  "arrivedPickupAt" timestamptz,
  "riderOnBoardAt" timestamptz,
  "departedPickupAt" timestamptz,
  "arrivedDropoffAt" timestamptz,
  "completedAt" timestamptz,
  "cancelledAt" timestamptz,
  "noShowAt" timestamptz,
  "odometerStart" numeric(12,2),
  "odometerEnd" numeric(12,2),
  "milesDriven" numeric(12,2),
  "billableMiles" numeric(12,2),
  "billingEligible" boolean NOT NULL DEFAULT false,
  "billingStatus" text NOT NULL DEFAULT 'NOT_READY',
  "cancellationReason" text,
  "noShowReason" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtTrip_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtTrip_leg_check" CHECK ("legType" IN ('OUTBOUND','RETURN','RECURRING')),
  CONSTRAINT "NmtTrip_mode_check" CHECK ("mode" IN ('OPERATIONAL','TRAINING_ONLY')),
  CONSTRAINT "NmtTrip_status_check" CHECK ("status" IN ('UNSCHEDULED','SCHEDULED','DISPATCHED','EN_ROUTE','ARRIVED_PICKUP','RIDER_ON_BOARD','DEPARTED_PICKUP','ARRIVED_DROPOFF','COMPLETED','NO_SHOW','CANCELLED')),
  CONSTRAINT "NmtTrip_billing_status_check" CHECK ("billingStatus" IN ('NOT_READY','READY','HELD','SUBMITTED','PAID','DENIED','VOID')),
  CONSTRAINT "NmtTrip_window_check" CHECK ("pickupWindowMinutes">=0 AND "pickupWindowMinutes"<=240),
  CONSTRAINT "NmtTrip_sequence_check" CHECK ("sequence">0),
  CONSTRAINT "NmtTrip_odometer_check" CHECK ("odometerStart" IS NULL OR "odometerEnd" IS NULL OR "odometerEnd">="odometerStart"),
  CONSTRAINT "NmtTrip_training_nonbillable_check" CHECK ("mode"<>'TRAINING_ONLY' OR ("billingEligible"=false AND "billingStatus"='NOT_READY'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "NmtTrip_order_sequence_unique" ON "NmtTrip"("organizationId","legalEntityId","orderId","sequence");
CREATE INDEX IF NOT EXISTS "NmtTrip_schedule_idx" ON "NmtTrip"("organizationId","legalEntityId","scheduledPickupAt","status");
CREATE INDEX IF NOT EXISTS "NmtTrip_driver_idx" ON "NmtTrip"("organizationId","legalEntityId","driverUserId","scheduledPickupAt") WHERE "driverUserId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "NmtTrip_vehicle_idx" ON "NmtTrip"("organizationId","legalEntityId","vehicleId","scheduledPickupAt") WHERE "vehicleId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "NmtTripEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "tripId" text NOT NULL REFERENCES "NmtTrip"("id") ON DELETE CASCADE,
  "orderId" text NOT NULL REFERENCES "NmtTransportOrder"("id") ON DELETE RESTRICT,
  "actorType" text NOT NULL,
  "actorId" text,
  "eventType" text NOT NULL,
  "fromStatus" text,
  "toStatus" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtTripEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtTripEvent_actor_check" CHECK ("actorType" IN ('DRIVER','DISPATCH','ADMIN','SYSTEM'))
);
CREATE INDEX IF NOT EXISTS "NmtTripEvent_trip_idx" ON "NmtTripEvent"("organizationId","legalEntityId","tripId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_nmt_trip_event_mutation"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'NmtTripEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "NmtTripEvent_no_update" ON "NmtTripEvent";
CREATE TRIGGER "NmtTripEvent_no_update" BEFORE UPDATE ON "NmtTripEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_nmt_trip_event_mutation"();
DROP TRIGGER IF EXISTS "NmtTripEvent_no_delete" ON "NmtTripEvent";
CREATE TRIGGER "NmtTripEvent_no_delete" BEFORE DELETE ON "NmtTripEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_nmt_trip_event_mutation"();

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
CREATE TRIGGER "NmtTrip_training_billing_guard" BEFORE INSERT OR UPDATE ON "NmtTrip" FOR EACH ROW EXECUTE FUNCTION "prevent_training_trip_billing"();
