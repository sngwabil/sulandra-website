CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- SPIRE is a Sulandra Health network clinical record. Company/legal-entity IDs remain
-- provenance for operations and audit, while chart authorization is driven by the
-- service homes assigned to the authenticated user across the organization.

ALTER TABLE "SpireEmployeeHomeAssignment" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpirePatientHomeAssignment" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireChartAccessEvent" ADD COLUMN IF NOT EXISTS "legalEntityId" text;

CREATE TABLE IF NOT EXISTS "SpireUserHomeFavorite" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "homeId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireUserHomeFavorite_org_user_home_key" UNIQUE ("organizationId","userId","homeId")
);
CREATE INDEX IF NOT EXISTS "SpireUserHomeFavorite_user_idx"
  ON "SpireUserHomeFavorite"("organizationId","userId","createdAt");

CREATE TABLE IF NOT EXISTS "SpireServiceHomeAccessEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "homeId" text,
  "actorUserId" text,
  "actorEmail" text,
  "subjectUserId" text,
  "action" text NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireServiceHomeAccessEvent_org_created_idx"
  ON "SpireServiceHomeAccessEvent"("organizationId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireServiceHomeAccessEvent_home_idx"
  ON "SpireServiceHomeAccessEvent"("organizationId","homeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireServiceHomeAccessEvent_actor_idx"
  ON "SpireServiceHomeAccessEvent"("organizationId","actorUserId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "spire_service_home_access_event_immutable"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SpireServiceHomeAccessEvent is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireServiceHomeAccessEvent_immutable" ON "SpireServiceHomeAccessEvent";
CREATE TRIGGER "SpireServiceHomeAccessEvent_immutable"
BEFORE UPDATE OR DELETE ON "SpireServiceHomeAccessEvent"
FOR EACH ROW EXECUTE FUNCTION "spire_service_home_access_event_immutable"();

-- Backfill SPIRE staff/home access from the service-home management assignment table.
DO $$
BEGIN
  IF to_regclass('public."TimeAttendanceLocationAssignment"') IS NOT NULL
     AND to_regclass('public."TimeAttendanceLocation"') IS NOT NULL THEN
    INSERT INTO "SpireEmployeeHomeAssignment"
      ("id","organizationId","legalEntityId","userId","homeId","assignedByUserId","createdAt")
    SELECT gen_random_uuid()::text, a."organizationId", a."legalEntityId", a."employeeId", a."locationId", a."employeeId", COALESCE(a."createdAt",now())
    FROM "TimeAttendanceLocationAssignment" a
    JOIN "TimeAttendanceLocation" h
      ON h."organizationId"=a."organizationId" AND h."id"=a."locationId"
    WHERE a."active"=true AND h."active"=true
      AND NOT EXISTS (
        SELECT 1 FROM "SpireEmployeeHomeAssignment" s
        WHERE s."organizationId"=a."organizationId" AND s."userId"=a."employeeId"
          AND s."homeId"=a."locationId" AND COALESCE(s."legalEntityId",'')=COALESCE(a."legalEntityId",'')
      );
  END IF;
END $$;

-- Backfill patient/home links from service-home client placement. ServiceHomeClientAssignment
-- clientId is the shared SPIRE patient identifier in the current multi-company foundation.
DO $$
BEGIN
  IF to_regclass('public."ServiceHomeClientAssignment"') IS NOT NULL
     AND to_regclass('public."TimeAttendanceLocation"') IS NOT NULL THEN
    INSERT INTO "SpirePatientHomeAssignment"
      ("id","organizationId","legalEntityId","patientId","homeId","primary","startsAt","endsAt","createdAt")
    SELECT gen_random_uuid()::text, a."organizationId", a."legalEntityId", a."clientId", a."locationId", true,
           COALESCE(a."createdAt",now()), NULL, COALESCE(a."createdAt",now())
    FROM "ServiceHomeClientAssignment" a
    JOIN "TimeAttendanceLocation" h
      ON h."organizationId"=a."organizationId" AND h."id"=a."locationId"
    JOIN "SpirePatient" p
      ON p."organizationId"=a."organizationId" AND p."id"=a."clientId"
    WHERE a."active"=true AND h."active"=true
      AND NOT EXISTS (
        SELECT 1 FROM "SpirePatientHomeAssignment" s
        WHERE s."organizationId"=a."organizationId" AND s."patientId"=a."clientId"
          AND s."homeId"=a."locationId" AND (s."endsAt" IS NULL OR s."endsAt">now())
      );
  END IF;
END $$;

-- Keep future operational service-home staff assignments synchronized into SPIRE access.
CREATE OR REPLACE FUNCTION "spire_sync_operational_employee_home"()
RETURNS trigger AS $$
BEGIN
  IF NEW."active"=true THEN
    UPDATE "SpireEmployeeHomeAssignment"
       SET "legalEntityId"=NEW."legalEntityId"
     WHERE "organizationId"=NEW."organizationId" AND "userId"=NEW."employeeId"
       AND "homeId"=NEW."locationId" AND COALESCE("legalEntityId",'')=COALESCE(NEW."legalEntityId",'');
    IF NOT FOUND THEN
      INSERT INTO "SpireEmployeeHomeAssignment"
        ("id","organizationId","legalEntityId","userId","homeId","assignedByUserId","createdAt")
      VALUES (gen_random_uuid()::text,NEW."organizationId",NEW."legalEntityId",NEW."employeeId",NEW."locationId",NEW."employeeId",now());
    END IF;
  ELSE
    DELETE FROM "SpireEmployeeHomeAssignment"
     WHERE "organizationId"=NEW."organizationId" AND "userId"=NEW."employeeId"
       AND "homeId"=NEW."locationId" AND COALESCE("legalEntityId",'')=COALESCE(NEW."legalEntityId",'');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public."TimeAttendanceLocationAssignment"') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS "TimeAttendanceLocationAssignment_sync_spire" ON "TimeAttendanceLocationAssignment";
    CREATE TRIGGER "TimeAttendanceLocationAssignment_sync_spire"
    AFTER INSERT OR UPDATE OF "active","legalEntityId","employeeId","locationId"
    ON "TimeAttendanceLocationAssignment"
    FOR EACH ROW EXECUTE FUNCTION "spire_sync_operational_employee_home"();
  END IF;
END $$;

-- Keep future operational client placement synchronized into the shared SPIRE chart home.
CREATE OR REPLACE FUNCTION "spire_sync_operational_patient_home"()
RETURNS trigger AS $$
BEGIN
  IF NEW."active"=true THEN
    UPDATE "SpirePatientHomeAssignment"
       SET "legalEntityId"=NEW."legalEntityId", "endsAt"=NULL
     WHERE "organizationId"=NEW."organizationId" AND "patientId"=NEW."clientId"
       AND "homeId"=NEW."locationId" AND ("endsAt" IS NULL OR "endsAt">now());
    IF NOT FOUND THEN
      INSERT INTO "SpirePatientHomeAssignment"
        ("id","organizationId","legalEntityId","patientId","homeId","primary","startsAt","endsAt","createdAt")
      SELECT gen_random_uuid()::text,NEW."organizationId",NEW."legalEntityId",NEW."clientId",NEW."locationId",true,now(),NULL,now()
      WHERE EXISTS (
        SELECT 1 FROM "SpirePatient" p WHERE p."organizationId"=NEW."organizationId" AND p."id"=NEW."clientId"
      );
    END IF;
  ELSE
    UPDATE "SpirePatientHomeAssignment"
       SET "endsAt"=COALESCE("endsAt",now())
     WHERE "organizationId"=NEW."organizationId" AND "patientId"=NEW."clientId"
       AND "homeId"=NEW."locationId" AND ("endsAt" IS NULL OR "endsAt">now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public."ServiceHomeClientAssignment"') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS "ServiceHomeClientAssignment_sync_spire" ON "ServiceHomeClientAssignment";
    CREATE TRIGGER "ServiceHomeClientAssignment_sync_spire"
    AFTER INSERT OR UPDATE OF "active","legalEntityId","clientId","locationId"
    ON "ServiceHomeClientAssignment"
    FOR EACH ROW EXECUTE FUNCTION "spire_sync_operational_patient_home"();
  END IF;
END $$;

COMMENT ON TABLE "SpireUserHomeFavorite" IS
  'Per-user SPIRE service-home favorites. The API enforces a maximum of five favorites.';
COMMENT ON TABLE "SpireServiceHomeAccessEvent" IS
  'Append-only network SPIRE service-home access and administration audit trail.';
