-- SPIRE 1.1 Phase A / Step 1
-- Canonical Ohio Alternate EVV visit foundation.
-- This migration extends the existing SpireEvvVisit model in place and does not
-- represent Sandata/ODM certification or perform external transmission.

ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "visitOtherId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "providerMedicaidId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "patientOtherId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "patientMedicaidId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "staffOtherId" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "payer" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "payerProgram" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "procedureCode" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "modifier1" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "timeZone" text NOT NULL DEFAULT 'US/Eastern';
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "visitLocationType" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "billVisit" boolean NOT NULL DEFAULT true;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "hoursToBillMinutes" numeric(14,2);
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "groupVisitCode" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "visitMemo" text;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "adjustedClockInAt" timestamptz;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "adjustedClockOutAt" timestamptz;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "transmissionState" text NOT NULL DEFAULT 'NOT_READY';
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "lastQueuedAt" timestamptz;
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "lastAcceptedAt" timestamptz;

UPDATE "SpireEvvVisit"
SET
  "visitOtherId" = COALESCE(NULLIF("visitOtherId", ''), "id"),
  "patientOtherId" = COALESCE(NULLIF("patientOtherId", ''), "patientId"),
  "staffOtherId" = COALESCE(NULLIF("staffOtherId", ''), "employeeUserId"),
  "procedureCode" = COALESCE(NULLIF("procedureCode", ''), "serviceCode"),
  "timeZone" = COALESCE(NULLIF("timeZone", ''), 'US/Eastern'),
  "transmissionState" = CASE
    WHEN "status"='VERIFIED' AND COALESCE(NULLIF("transmissionState", ''), 'NOT_READY')='NOT_READY' THEN 'READY_FOR_VALIDATION'
    ELSE COALESCE(NULLIF("transmissionState", ''), 'NOT_READY')
  END;

CREATE UNIQUE INDEX IF NOT EXISTS "SpireEvvVisit_visitOtherId_idx"
  ON "SpireEvvVisit"("organizationId", "visitOtherId")
  WHERE "visitOtherId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "SpireEvvVisit_transmissionState_idx"
  ON "SpireEvvVisit"("organizationId", "transmissionState", "updatedAt");

CREATE TABLE IF NOT EXISTS "SpireEvvCall" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "evvVisitId" text NOT NULL REFERENCES "SpireEvvVisit"("id") ON DELETE RESTRICT,
  "callExternalId" text NOT NULL,
  "callAssignment" text NOT NULL,
  "callDateTime" timestamptz NOT NULL,
  "callType" text NOT NULL,
  "procedureCode" text NOT NULL,
  "patientIdentifierOnCall" text,
  "mobileLogin" text,
  "visitLocationType" text,
  "latitude" numeric(10,7),
  "longitude" numeric(10,7),
  "telephonyPin" text,
  "originatingPhoneNumber" text,
  "capturedFrom" text NOT NULL DEFAULT 'SPIRE',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireEvvCall_visit_assignment_idx"
  ON "SpireEvvCall"("organizationId", "evvVisitId", "callAssignment");
CREATE INDEX IF NOT EXISTS "SpireEvvCall_patient_idx"
  ON "SpireEvvCall"("organizationId", "patientId", "callDateTime");

CREATE TABLE IF NOT EXISTS "SpireEvvVisitChange" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "evvVisitId" text NOT NULL REFERENCES "SpireEvvVisit"("id") ON DELETE RESTRICT,
  "appliesToSequenceId" numeric(50,0),
  "actorUserId" text NOT NULL,
  "changeMadeByEmail" text NOT NULL,
  "changeDateTime" timestamptz NOT NULL DEFAULT now(),
  "reasonCode" text NOT NULL DEFAULT '99',
  "changeReasonMemo" text,
  "source" text NOT NULL DEFAULT 'MANUAL_EDIT',
  "beforeValue" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "afterValue" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireEvvVisitChange_reason_ck" CHECK ("reasonCode"='99')
);
CREATE INDEX IF NOT EXISTS "SpireEvvVisitChange_visit_idx"
  ON "SpireEvvVisitChange"("organizationId", "evvVisitId", "createdAt");

CREATE TABLE IF NOT EXISTS "SpireEvvSequence" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "recordType" text NOT NULL,
  "recordOtherId" text NOT NULL,
  "lastSequenceId" numeric(50,0) NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireEvvSequence_recordType_ck" CHECK ("recordType" IN ('PATIENT','STAFF','VISIT')),
  CONSTRAINT "SpireEvvSequence_positive_ck" CHECK ("lastSequenceId">=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireEvvSequence_record_idx"
  ON "SpireEvvSequence"("organizationId", "recordType", "recordOtherId");

CREATE TABLE IF NOT EXISTS "SpireEvvTransmission" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "evvVisitId" text REFERENCES "SpireEvvVisit"("id") ON DELETE RESTRICT,
  "recordType" text NOT NULL,
  "recordOtherId" text NOT NULL,
  "sequenceId" numeric(50,0) NOT NULL,
  "environment" text NOT NULL DEFAULT 'UAT',
  "target" text NOT NULL DEFAULT 'SANDATA_AGGREGATOR',
  "status" text NOT NULL DEFAULT 'QUEUED',
  "payload" jsonb NOT NULL,
  "transactionId" text,
  "ackReason" text,
  "attemptCount" integer NOT NULL DEFAULT 0,
  "queuedAt" timestamptz NOT NULL DEFAULT now(),
  "sentAt" timestamptz,
  "acknowledgedAt" timestamptz,
  "resolvedAt" timestamptz,
  "nextAttemptAt" timestamptz,
  "lastError" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireEvvTransmission_recordType_ck" CHECK ("recordType" IN ('PATIENT','STAFF','VISIT')),
  CONSTRAINT "SpireEvvTransmission_environment_ck" CHECK ("environment" IN ('UAT','PRODUCTION'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireEvvTransmission_sequence_idx"
  ON "SpireEvvTransmission"("organizationId", "recordType", "recordOtherId", "sequenceId");
CREATE INDEX IF NOT EXISTS "SpireEvvTransmission_queue_idx"
  ON "SpireEvvTransmission"("organizationId", "environment", "status", "queuedAt");
CREATE INDEX IF NOT EXISTS "SpireEvvTransmission_visit_idx"
  ON "SpireEvvTransmission"("organizationId", "evvVisitId", "createdAt");

CREATE TABLE IF NOT EXISTS "SpireEvvTransmissionEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "transmissionId" text NOT NULL REFERENCES "SpireEvvTransmission"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "status" text NOT NULL,
  "transactionId" text,
  "reason" text,
  "response" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireEvvTransmissionEvent_tx_idx"
  ON "SpireEvvTransmissionEvent"("organizationId", "transmissionId", "createdAt");

-- Populate canonical call evidence from existing 1.0 clock timestamps without
-- altering the original visit record.
INSERT INTO "SpireEvvCall"(
  "organizationId","legalEntityId","patientId","evvVisitId","callExternalId","callAssignment",
  "callDateTime","callType","procedureCode","patientIdentifierOnCall","visitLocationType",
  "latitude","longitude","capturedFrom"
)
SELECT
  v."organizationId",v."legalEntityId",v."patientId",v."id",COALESCE(v."visitOtherId",v."id")||'-IN','Call In',
  v."clockInAt",
  CASE WHEN UPPER(COALESCE(v."verificationMethod",'')) LIKE '%MOBILE%' THEN 'Mobile'
       WHEN UPPER(COALESCE(v."verificationMethod",'')) LIKE '%TELE%' THEN 'Telephony'
       WHEN UPPER(COALESCE(v."verificationMethod",'')) LIKE '%OTHER%' THEN 'Other'
       ELSE 'Manual' END,
  COALESCE(v."procedureCode",v."serviceCode"),v."patientOtherId",v."visitLocationType",
  v."clockInLatitude",v."clockInLongitude",'SPIRE_1_0_BACKFILL'
FROM "SpireEvvVisit" v
WHERE v."clockInAt" IS NOT NULL
ON CONFLICT ("organizationId","evvVisitId","callAssignment") DO NOTHING;

INSERT INTO "SpireEvvCall"(
  "organizationId","legalEntityId","patientId","evvVisitId","callExternalId","callAssignment",
  "callDateTime","callType","procedureCode","patientIdentifierOnCall","visitLocationType",
  "latitude","longitude","capturedFrom"
)
SELECT
  v."organizationId",v."legalEntityId",v."patientId",v."id",COALESCE(v."visitOtherId",v."id")||'-OUT','Call Out',
  v."clockOutAt",
  CASE WHEN UPPER(COALESCE(v."verificationMethod",'')) LIKE '%MOBILE%' THEN 'Mobile'
       WHEN UPPER(COALESCE(v."verificationMethod",'')) LIKE '%TELE%' THEN 'Telephony'
       WHEN UPPER(COALESCE(v."verificationMethod",'')) LIKE '%OTHER%' THEN 'Other'
       ELSE 'Manual' END,
  COALESCE(v."procedureCode",v."serviceCode"),v."patientOtherId",v."visitLocationType",
  v."clockOutLatitude",v."clockOutLongitude",'SPIRE_1_0_BACKFILL'
FROM "SpireEvvVisit" v
WHERE v."clockOutAt" IS NOT NULL
ON CONFLICT ("organizationId","evvVisitId","callAssignment") DO NOTHING;

-- Keep every current and future 1.0 entry point (desktop and mobile) feeding the
-- same canonical visit record. The BEFORE trigger fills stable identifiers and
-- moves verified visits into validation-ready state without changing 1.0 status.
CREATE OR REPLACE FUNCTION "spire_evv_canonicalize_visit"() RETURNS trigger AS $$
BEGIN
  NEW."visitOtherId" := COALESCE(NULLIF(NEW."visitOtherId",''),NEW."id");
  NEW."patientOtherId" := COALESCE(NULLIF(NEW."patientOtherId",''),NEW."patientId");
  NEW."staffOtherId" := COALESCE(NULLIF(NEW."staffOtherId",''),NEW."employeeUserId");
  NEW."procedureCode" := COALESCE(NULLIF(NEW."procedureCode",''),NEW."serviceCode");
  NEW."timeZone" := COALESCE(NULLIF(NEW."timeZone",''),'US/Eastern');
  IF NEW."visitLocationType" IS NOT NULL AND NEW."visitLocationType" NOT IN ('1','2') THEN
    RAISE EXCEPTION 'EVV visitLocationType must be 1 (Home) or 2 (Community)';
  END IF;
  IF NEW."status"='VERIFIED' AND COALESCE(NEW."transmissionState",'NOT_READY')='NOT_READY' THEN
    NEW."transmissionState" := 'READY_FOR_VALIDATION';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireEvvVisit_canonicalize_trg" ON "SpireEvvVisit";
CREATE TRIGGER "SpireEvvVisit_canonicalize_trg"
BEFORE INSERT OR UPDATE ON "SpireEvvVisit"
FOR EACH ROW EXECUTE FUNCTION "spire_evv_canonicalize_visit"();

-- Capture first-source clock evidence regardless of whether it came through the
-- desktop EVV endpoint or the field/mobile EVV endpoint.
CREATE OR REPLACE FUNCTION "spire_evv_capture_calls"() RETURNS trigger AS $$
DECLARE
  v_call_type text;
BEGIN
  v_call_type := CASE WHEN UPPER(COALESCE(NEW."verificationMethod",'')) LIKE '%MOBILE%' THEN 'Mobile'
                      WHEN UPPER(COALESCE(NEW."verificationMethod",'')) LIKE '%TELE%' THEN 'Telephony'
                      WHEN UPPER(COALESCE(NEW."verificationMethod",'')) LIKE '%OTHER%' THEN 'Other'
                      ELSE 'Manual' END;
  IF NEW."clockInAt" IS NOT NULL AND (TG_OP='INSERT' OR OLD."clockInAt" IS NULL) THEN
    INSERT INTO "SpireEvvCall"(
      "organizationId","legalEntityId","patientId","evvVisitId","callExternalId","callAssignment",
      "callDateTime","callType","procedureCode","patientIdentifierOnCall","visitLocationType",
      "latitude","longitude","capturedFrom"
    ) VALUES(
      NEW."organizationId",NEW."legalEntityId",NEW."patientId",NEW."id",COALESCE(NEW."visitOtherId",NEW."id")||'-IN','Call In',
      NEW."clockInAt",v_call_type,COALESCE(NEW."procedureCode",NEW."serviceCode"),NEW."patientOtherId",NEW."visitLocationType",
      NEW."clockInLatitude",NEW."clockInLongitude",'SPIRE_RUNTIME'
    ) ON CONFLICT ("organizationId","evvVisitId","callAssignment") DO NOTHING;
  END IF;
  IF NEW."clockOutAt" IS NOT NULL AND (TG_OP='INSERT' OR OLD."clockOutAt" IS NULL) THEN
    INSERT INTO "SpireEvvCall"(
      "organizationId","legalEntityId","patientId","evvVisitId","callExternalId","callAssignment",
      "callDateTime","callType","procedureCode","patientIdentifierOnCall","visitLocationType",
      "latitude","longitude","capturedFrom"
    ) VALUES(
      NEW."organizationId",NEW."legalEntityId",NEW."patientId",NEW."id",COALESCE(NEW."visitOtherId",NEW."id")||'-OUT','Call Out',
      NEW."clockOutAt",v_call_type,COALESCE(NEW."procedureCode",NEW."serviceCode"),NEW."patientOtherId",NEW."visitLocationType",
      NEW."clockOutLatitude",NEW."clockOutLongitude",'SPIRE_RUNTIME'
    ) ON CONFLICT ("organizationId","evvVisitId","callAssignment") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireEvvVisit_capture_calls_trg" ON "SpireEvvVisit";
CREATE TRIGGER "SpireEvvVisit_capture_calls_trg"
AFTER INSERT OR UPDATE ON "SpireEvvVisit"
FOR EACH ROW EXECUTE FUNCTION "spire_evv_capture_calls"();

-- Corrections and transmission events are evidence records. They may be appended
-- but never rewritten or deleted after creation.
CREATE OR REPLACE FUNCTION "spire_evv_reject_evidence_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SPIRE EVV evidence is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireEvvCall_immutable_trg" ON "SpireEvvCall";
CREATE TRIGGER "SpireEvvCall_immutable_trg"
BEFORE UPDATE OR DELETE ON "SpireEvvCall"
FOR EACH ROW EXECUTE FUNCTION "spire_evv_reject_evidence_mutation"();

DROP TRIGGER IF EXISTS "SpireEvvVisitChange_immutable_trg" ON "SpireEvvVisitChange";
CREATE TRIGGER "SpireEvvVisitChange_immutable_trg"
BEFORE UPDATE OR DELETE ON "SpireEvvVisitChange"
FOR EACH ROW EXECUTE FUNCTION "spire_evv_reject_evidence_mutation"();

DROP TRIGGER IF EXISTS "SpireEvvTransmissionEvent_immutable_trg" ON "SpireEvvTransmissionEvent";
CREATE TRIGGER "SpireEvvTransmissionEvent_immutable_trg"
BEFORE UPDATE OR DELETE ON "SpireEvvTransmissionEvent"
FOR EACH ROW EXECUTE FUNCTION "spire_evv_reject_evidence_mutation"();
