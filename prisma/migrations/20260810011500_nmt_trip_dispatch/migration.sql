CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- This migration introduces only pre-launch NMT dispatch objects. If an earlier
-- attempt failed part-way through, Prisma can mark it rolled back but PostgreSQL
-- may still contain partial objects. Rebuild only these new dispatch tables so a
-- retry is deterministic; no operational NMT trips exist before this migration.
DROP TABLE IF EXISTS "NmtTripEvent" CASCADE;
DROP TABLE IF EXISTS "NmtTrip" CASCADE;
DROP TABLE IF EXISTS "NmtDriverProfile" CASCADE;
DROP TABLE IF EXISTS "NmtVehicle" CASCADE;

CREATE TABLE "NmtVehicle" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "vehicleNumber" text NOT NULL,
  "year" integer,
  "make" text,
  "model" text,
  "color" text,
  "vin" text,
  "licensePlate" text,
  "licenseState" text,
  "serviceLevels" text[] NOT NULL DEFAULT ARRAY['AMBULATORY']::text[],
  "wheelchairCapacity" integer NOT NULL DEFAULT 0,
  "ambulatoryCapacity" integer NOT NULL DEFAULT 1,
  "liftEquipped" boolean NOT NULL DEFAULT false,
  "bariatricCapable" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "inspectionExpiresAt" date,
  "registrationExpiresAt" date,
  "insuranceExpiresAt" date,
  "notes" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtVehicle_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtVehicle_number_key" UNIQUE ("organizationId","legalEntityId","vehicleNumber"),
  CONSTRAINT "NmtVehicle_capacity_check" CHECK ("wheelchairCapacity">=0 AND "ambulatoryCapacity">=0)
);
CREATE INDEX "NmtVehicle_entity_active_idx" ON "NmtVehicle"("organizationId","legalEntityId","active","vehicleNumber");

CREATE TABLE "NmtDriverProfile" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "userId" text,
  "displayName" text NOT NULL,
  "phone" text,
  "email" text,
  "licenseNumber" text,
  "licenseState" text,
  "licenseExpiresAt" date,
  "certifications" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtDriverProfile_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "NmtDriverProfile_user_key" ON "NmtDriverProfile"("organizationId","legalEntityId","userId") WHERE "userId" IS NOT NULL;
CREATE INDEX "NmtDriverProfile_entity_active_idx" ON "NmtDriverProfile"("organizationId","legalEntityId","active","displayName");

CREATE TABLE "NmtTrip" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "orderId" text NOT NULL REFERENCES "NmtTransportOrder"("id") ON DELETE RESTRICT,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "mode" text NOT NULL,
  "status" text NOT NULL DEFAULT 'SCHEDULED',
  "tripNumber" text NOT NULL,
  "scheduledPickupAt" timestamptz NOT NULL,
  "scheduledArrivalAt" timestamptz,
  "driverId" text REFERENCES "NmtDriverProfile"("id") ON DELETE RESTRICT,
  "vehicleId" text REFERENCES "NmtVehicle"("id") ON DELETE RESTRICT,
  "dispatcherUserId" text NOT NULL,
  "pickupConfirmedAt" timestamptz,
  "arrivedPickupAt" timestamptz,
  "riderOnBoardAt" timestamptz,
  "departedPickupAt" timestamptz,
  "arrivedDestinationAt" timestamptz,
  "riderDroppedOffAt" timestamptz,
  "completedAt" timestamptz,
  "cancelledAt" timestamptz,
  "cancellationReason" text,
  "noShowAt" timestamptz,
  "noShowReason" text,
  "odometerStart" numeric(12,2),
  "odometerEnd" numeric(12,2),
  "actualMiles" numeric(12,2),
  "driverNotes" text,
  "dispatcherNotes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtTrip_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtTrip_number_key" UNIQUE ("tripNumber"),
  CONSTRAINT "NmtTrip_mode_check" CHECK ("mode" IN ('OPERATIONAL','TRAINING_ONLY')),
  CONSTRAINT "NmtTrip_status_check" CHECK ("status" IN ('SCHEDULED','DISPATCHED','EN_ROUTE_TO_PICKUP','ARRIVED_PICKUP','RIDER_ON_BOARD','EN_ROUTE_TO_DESTINATION','ARRIVED_DESTINATION','COMPLETED','NO_SHOW','CANCELLED'))
);
CREATE INDEX "NmtTrip_schedule_idx" ON "NmtTrip"("organizationId","legalEntityId","scheduledPickupAt","status");
CREATE INDEX "NmtTrip_driver_idx" ON "NmtTrip"("organizationId","legalEntityId","driverId","scheduledPickupAt") WHERE "driverId" IS NOT NULL;
CREATE INDEX "NmtTrip_vehicle_idx" ON "NmtTrip"("organizationId","legalEntityId","vehicleId","scheduledPickupAt") WHERE "vehicleId" IS NOT NULL;
CREATE UNIQUE INDEX "NmtTrip_active_order_idx" ON "NmtTrip"("organizationId","legalEntityId","orderId") WHERE "status" NOT IN ('CANCELLED','NO_SHOW');

CREATE TABLE "NmtTripEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "tripId" text NOT NULL REFERENCES "NmtTrip"("id") ON DELETE CASCADE,
  "actorUserId" text,
  "eventType" text NOT NULL,
  "fromStatus" text,
  "toStatus" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "latitude" numeric(10,7),
  "longitude" numeric(10,7),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtTripEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX "NmtTripEvent_trip_idx" ON "NmtTripEvent"("organizationId","legalEntityId","tripId","createdAt");
