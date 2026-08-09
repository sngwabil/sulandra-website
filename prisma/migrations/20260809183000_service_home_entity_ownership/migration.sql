CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Service homes are the shared location source for SCLS operations and the
-- workforce scheduler. Define them in migrations (rather than only at runtime)
-- and make company ownership mandatory before any additional operating company
-- can receive the SCLS_OPERATIONS capability.
CREATE TABLE IF NOT EXISTS "TimeAttendanceLocation" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "name" text NOT NULL,
  "address" text NOT NULL,
  "streetAddress" text,
  "city" text,
  "state" text,
  "zipCode" text,
  "latitude" double precision,
  "longitude" double precision,
  "geofenceRadiusMeters" integer NOT NULL DEFAULT 250,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "TimeAttendanceLocation"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text,
  ADD COLUMN IF NOT EXISTS "streetAddress" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "state" text,
  ADD COLUMN IF NOT EXISTS "zipCode" text;

CREATE TABLE IF NOT EXISTS "TimeAttendanceLocationAssignment" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "locationId" text NOT NULL,
  "employeeId" text NOT NULL,
  "isManager" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "TimeAttendanceLocationAssignment"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text;

CREATE TABLE IF NOT EXISTS "ServiceHomeClientAssignment" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "locationId" text NOT NULL,
  "clientId" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "ServiceHomeClientAssignment"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text;

-- The workforce tables share service-home locations. Define their complete
-- runtime shape here as well so a fresh database and an upgraded database
-- enforce the same company boundary before the application starts.
CREATE TABLE IF NOT EXISTS "TimeAttendanceShift" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "employeeId" text,
  "locationId" text,
  "startTime" timestamptz NOT NULL,
  "endTime" timestamptz NOT NULL,
  "code" text NOT NULL,
  "department" text NOT NULL DEFAULT '',
  "location" text NOT NULL DEFAULT '',
  "notes" text NOT NULL DEFAULT '',
  "clientId" text,
  "payCode" text NOT NULL DEFAULT 'REG',
  "status" text NOT NULL DEFAULT 'DRAFT',
  "latitude" double precision,
  "longitude" double precision,
  "geofenceRadiusMeters" integer NOT NULL DEFAULT 250,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "TimeAttendanceShift"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text,
  ADD COLUMN IF NOT EXISTS "locationId" text,
  ADD COLUMN IF NOT EXISTS "latitude" double precision,
  ADD COLUMN IF NOT EXISTS "longitude" double precision,
  ADD COLUMN IF NOT EXISTS "geofenceRadiusMeters" integer NOT NULL DEFAULT 250;

CREATE TABLE IF NOT EXISTS "TimeAttendanceClockEntry" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "employeeId" text NOT NULL,
  "shiftId" text,
  "clockIn" timestamptz NOT NULL,
  "clockOut" timestamptz,
  "source" text NOT NULL DEFAULT 'PORTAL',
  "status" text NOT NULL DEFAULT 'OPEN',
  "notes" text NOT NULL DEFAULT '',
  "clockInLatitude" double precision,
  "clockInLongitude" double precision,
  "clockInAccuracyMeters" double precision,
  "clockInDistanceMeters" double precision,
  "clockOutLatitude" double precision,
  "clockOutLongitude" double precision,
  "clockOutAccuracyMeters" double precision,
  "clockOutDistanceMeters" double precision,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "TimeAttendanceClockEntry"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text,
  ADD COLUMN IF NOT EXISTS "shiftId" text,
  ADD COLUMN IF NOT EXISTS "clockInLatitude" double precision,
  ADD COLUMN IF NOT EXISTS "clockInLongitude" double precision,
  ADD COLUMN IF NOT EXISTS "clockInAccuracyMeters" double precision,
  ADD COLUMN IF NOT EXISTS "clockInDistanceMeters" double precision,
  ADD COLUMN IF NOT EXISTS "clockOutLatitude" double precision,
  ADD COLUMN IF NOT EXISTS "clockOutLongitude" double precision,
  ADD COLUMN IF NOT EXISTS "clockOutAccuracyMeters" double precision,
  ADD COLUMN IF NOT EXISTS "clockOutDistanceMeters" double precision;

CREATE TABLE IF NOT EXISTS "TimeAttendanceRequest" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "employeeId" text NOT NULL,
  "type" text NOT NULL,
  "startAt" timestamptz NOT NULL,
  "endAt" timestamptz NOT NULL,
  "reason" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'PENDING',
  "reviewedById" text,
  "reviewedAt" timestamptz,
  "reviewNotes" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "TimeAttendanceRequest"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text;

CREATE TABLE IF NOT EXISTS "TimeAttendanceAudit" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "actorId" text NOT NULL,
  "action" text NOT NULL,
  "resourceType" text NOT NULL,
  "resourceId" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "TimeAttendanceAudit"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text;

CREATE TABLE IF NOT EXISTS "TimeAttendanceManualPunchRequest" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "employeeId" text NOT NULL,
  "shiftId" text,
  "punchType" text NOT NULL,
  "requestedAt" timestamptz NOT NULL,
  "reason" text NOT NULL,
  "latitude" double precision,
  "longitude" double precision,
  "accuracyMeters" double precision,
  "status" text NOT NULL DEFAULT 'PENDING',
  "reviewedById" text,
  "reviewedAt" timestamptz,
  "reviewNotes" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "TimeAttendanceManualPunchRequest"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text;

UPDATE "TimeAttendanceLocation" location_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE location_row."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND location_row."legalEntityId" IS NULL;

UPDATE "TimeAttendanceLocationAssignment" assignment
SET "legalEntityId"=location_row."legalEntityId"
FROM "TimeAttendanceLocation" location_row
WHERE assignment."organizationId"=location_row."organizationId"
  AND assignment."locationId"=location_row."id"
  AND assignment."legalEntityId" IS NULL;

UPDATE "ServiceHomeClientAssignment" assignment
SET "legalEntityId"=location_row."legalEntityId"
FROM "TimeAttendanceLocation" location_row
WHERE assignment."organizationId"=location_row."organizationId"
  AND assignment."locationId"=location_row."id"
  AND assignment."legalEntityId" IS NULL;

UPDATE "TimeAttendanceShift" workforce_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE workforce_row."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND workforce_row."legalEntityId" IS NULL;

UPDATE "TimeAttendanceClockEntry" workforce_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE workforce_row."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND workforce_row."legalEntityId" IS NULL;

UPDATE "TimeAttendanceRequest" workforce_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE workforce_row."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND workforce_row."legalEntityId" IS NULL;

UPDATE "TimeAttendanceAudit" workforce_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE workforce_row."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND workforce_row."legalEntityId" IS NULL;

UPDATE "TimeAttendanceManualPunchRequest" workforce_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE workforce_row."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND workforce_row."legalEntityId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TimeAttendanceLocation" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'TimeAttendanceLocation contains records without a legal entity';
  END IF;
  IF EXISTS (SELECT 1 FROM "TimeAttendanceLocationAssignment" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'TimeAttendanceLocationAssignment contains records without a legal entity or matching location';
  END IF;
  IF EXISTS (SELECT 1 FROM "ServiceHomeClientAssignment" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'ServiceHomeClientAssignment contains records without a legal entity or matching location';
  END IF;
  IF EXISTS (SELECT 1 FROM "TimeAttendanceShift" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'TimeAttendanceShift contains records without a legal entity';
  END IF;
  IF EXISTS (SELECT 1 FROM "TimeAttendanceClockEntry" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'TimeAttendanceClockEntry contains records without a legal entity';
  END IF;
  IF EXISTS (SELECT 1 FROM "TimeAttendanceRequest" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'TimeAttendanceRequest contains records without a legal entity';
  END IF;
  IF EXISTS (SELECT 1 FROM "TimeAttendanceAudit" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'TimeAttendanceAudit contains records without a legal entity';
  END IF;
  IF EXISTS (SELECT 1 FROM "TimeAttendanceManualPunchRequest" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'TimeAttendanceManualPunchRequest contains records without a legal entity';
  END IF;
END $$;

ALTER TABLE "TimeAttendanceLocation"
  ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "TimeAttendanceLocationAssignment"
  ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "ServiceHomeClientAssignment"
  ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "TimeAttendanceShift"
  ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "TimeAttendanceClockEntry"
  ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "TimeAttendanceRequest"
  ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "TimeAttendanceAudit"
  ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "TimeAttendanceManualPunchRequest"
  ALTER COLUMN "legalEntityId" SET NOT NULL;

DROP INDEX IF EXISTS "TA_location_org_name_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "TA_location_entity_name_uq"
  ON "TimeAttendanceLocation"("organizationId","legalEntityId","name");
CREATE UNIQUE INDEX IF NOT EXISTS "TA_location_org_entity_id_uq"
  ON "TimeAttendanceLocation"("organizationId","legalEntityId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "TA_location_assignment_uq"
  ON "TimeAttendanceLocationAssignment"("organizationId","locationId","employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "service_home_client_uq"
  ON "ServiceHomeClientAssignment"("organizationId","locationId","clientId");
CREATE INDEX IF NOT EXISTS "TA_location_assignment_entity_employee_idx"
  ON "TimeAttendanceLocationAssignment"("organizationId","legalEntityId","employeeId","active");
CREATE INDEX IF NOT EXISTS "service_home_client_entity_client_idx"
  ON "ServiceHomeClientAssignment"("organizationId","legalEntityId","clientId","active");
CREATE UNIQUE INDEX IF NOT EXISTS "TimeAttendanceShift_org_entity_id_uq"
  ON "TimeAttendanceShift"("organizationId","legalEntityId","id");
CREATE INDEX IF NOT EXISTS "TimeAttendanceShift_entity_start_idx"
  ON "TimeAttendanceShift"("organizationId","legalEntityId","startTime");
DROP INDEX IF EXISTS "TimeAttendanceClockEntry_one_open";
CREATE UNIQUE INDEX IF NOT EXISTS "TimeAttendanceClockEntry_entity_one_open"
  ON "TimeAttendanceClockEntry"("organizationId","legalEntityId","employeeId")
  WHERE "clockOut" IS NULL;
CREATE INDEX IF NOT EXISTS "TimeAttendanceClockEntry_entity_clock_idx"
  ON "TimeAttendanceClockEntry"("organizationId","legalEntityId","clockIn");
CREATE INDEX IF NOT EXISTS "TimeAttendanceRequest_entity_status_idx"
  ON "TimeAttendanceRequest"("organizationId","legalEntityId","status");
CREATE INDEX IF NOT EXISTS "TimeAttendanceAudit_entity_created_idx"
  ON "TimeAttendanceAudit"("organizationId","legalEntityId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ManualPunch_entity_status_idx"
  ON "TimeAttendanceManualPunchRequest"("organizationId","legalEntityId","status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TimeAttendanceLocation_entity_fkey') THEN
    ALTER TABLE "TimeAttendanceLocation"
      ADD CONSTRAINT "TimeAttendanceLocation_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId")
      REFERENCES "LegalEntity"("organizationId","id")
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "TimeAttendanceLocation" VALIDATE CONSTRAINT "TimeAttendanceLocation_entity_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TA_location_assignment_entity_location_fkey') THEN
    ALTER TABLE "TimeAttendanceLocationAssignment"
      ADD CONSTRAINT "TA_location_assignment_entity_location_fkey"
      FOREIGN KEY ("organizationId","legalEntityId","locationId")
      REFERENCES "TimeAttendanceLocation"("organizationId","legalEntityId","id")
      ON DELETE CASCADE NOT VALID;
    ALTER TABLE "TimeAttendanceLocationAssignment" VALIDATE CONSTRAINT "TA_location_assignment_entity_location_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ServiceHomeClientAssignment_entity_location_fkey') THEN
    ALTER TABLE "ServiceHomeClientAssignment"
      ADD CONSTRAINT "ServiceHomeClientAssignment_entity_location_fkey"
      FOREIGN KEY ("organizationId","legalEntityId","locationId")
      REFERENCES "TimeAttendanceLocation"("organizationId","legalEntityId","id")
      ON DELETE CASCADE NOT VALID;
    ALTER TABLE "ServiceHomeClientAssignment" VALIDATE CONSTRAINT "ServiceHomeClientAssignment_entity_location_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TimeAttendanceShift_entity_fkey') THEN
    ALTER TABLE "TimeAttendanceShift"
      ADD CONSTRAINT "TimeAttendanceShift_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId")
      REFERENCES "LegalEntity"("organizationId","id")
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "TimeAttendanceShift" VALIDATE CONSTRAINT "TimeAttendanceShift_entity_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TimeAttendanceShift_entity_location_fkey') THEN
    ALTER TABLE "TimeAttendanceShift"
      ADD CONSTRAINT "TimeAttendanceShift_entity_location_fkey"
      FOREIGN KEY ("organizationId","legalEntityId","locationId")
      REFERENCES "TimeAttendanceLocation"("organizationId","legalEntityId","id")
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "TimeAttendanceShift" VALIDATE CONSTRAINT "TimeAttendanceShift_entity_location_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TimeAttendanceClockEntry_entity_fkey') THEN
    ALTER TABLE "TimeAttendanceClockEntry"
      ADD CONSTRAINT "TimeAttendanceClockEntry_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId")
      REFERENCES "LegalEntity"("organizationId","id")
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "TimeAttendanceClockEntry" VALIDATE CONSTRAINT "TimeAttendanceClockEntry_entity_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TimeAttendanceRequest_entity_fkey') THEN
    ALTER TABLE "TimeAttendanceRequest"
      ADD CONSTRAINT "TimeAttendanceRequest_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId")
      REFERENCES "LegalEntity"("organizationId","id")
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "TimeAttendanceRequest" VALIDATE CONSTRAINT "TimeAttendanceRequest_entity_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TimeAttendanceAudit_entity_fkey') THEN
    ALTER TABLE "TimeAttendanceAudit"
      ADD CONSTRAINT "TimeAttendanceAudit_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId")
      REFERENCES "LegalEntity"("organizationId","id")
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "TimeAttendanceAudit" VALIDATE CONSTRAINT "TimeAttendanceAudit_entity_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='TimeAttendanceManualPunchRequest_entity_fkey') THEN
    ALTER TABLE "TimeAttendanceManualPunchRequest"
      ADD CONSTRAINT "TimeAttendanceManualPunchRequest_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId")
      REFERENCES "LegalEntity"("organizationId","id")
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "TimeAttendanceManualPunchRequest" VALIDATE CONSTRAINT "TimeAttendanceManualPunchRequest_entity_fkey";
  END IF;
END $$;

COMMENT ON COLUMN "TimeAttendanceLocation"."legalEntityId" IS
  'Owning Sulandra legal entity. A service home cannot be shared across provider companies.';
COMMENT ON TABLE "ServiceHomeClientAssignment" IS
  'Company-scoped assignment of an enrolled client to a service home.';
COMMENT ON COLUMN "TimeAttendanceShift"."legalEntityId" IS
  'Owning employer company. Workforce records cannot be shared across legal entities.';
