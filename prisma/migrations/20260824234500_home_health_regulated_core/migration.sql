CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Home Health regulated-core hardening.
-- Existing HomeHealthEpisode, HomeHealthPlanOfCare, HomeHealthDisciplineOrder,
-- HomeHealthVisit, SpireAssessmentResponse, and SpireEvvVisit remain authoritative.
-- This migration adds regulated lifecycle/linkage around those existing records;
-- it does not replace the generic SPIRE assessment engine or create a second EVV visit.

CREATE TABLE IF NOT EXISTS "HomeHealthCertificationPeriod" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "episodeId" text NOT NULL REFERENCES "HomeHealthEpisode"("id") ON DELETE CASCADE,
  "periodNumber" integer NOT NULL,
  "certificationType" text NOT NULL DEFAULT 'INITIAL',
  "periodStart" date NOT NULL,
  "periodEnd" date NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "certifyingProviderName" text,
  "certifyingProviderNpi" text,
  "certificationStatement" text,
  "faceToFaceDate" date,
  "signedAt" timestamptz,
  "signedByProviderName" text,
  "signedByProviderNpi" text,
  "closedAt" timestamptz,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthCertificationPeriod_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "HomeHealthCertificationPeriod_number_ck" CHECK ("periodNumber" > 0),
  CONSTRAINT "HomeHealthCertificationPeriod_dates_ck" CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "HomeHealthCertificationPeriod_type_ck" CHECK ("certificationType" IN ('INITIAL','RECERTIFICATION')),
  CONSTRAINT "HomeHealthCertificationPeriod_status_ck" CHECK ("status" IN ('DRAFT','ACTIVE','CLOSED','CANCELLED')),
  UNIQUE("episodeId","periodNumber")
);
CREATE INDEX IF NOT EXISTS "HomeHealthCertificationPeriod_episode_idx"
  ON "HomeHealthCertificationPeriod"("organizationId","legalEntityId","episodeId","periodStart" DESC);

ALTER TABLE "HomeHealthEpisode"
  ADD COLUMN IF NOT EXISTS "currentCertificationPeriodId" text;
CREATE INDEX IF NOT EXISTS "HomeHealthEpisode_current_cert_idx"
  ON "HomeHealthEpisode"("organizationId","legalEntityId","currentCertificationPeriodId")
  WHERE "currentCertificationPeriodId" IS NOT NULL;

-- Preserve existing certification dates by materializing them as period 1 when
-- both dates are already present. No episode dates are changed or deleted.
INSERT INTO "HomeHealthCertificationPeriod"(
  "organizationId","legalEntityId","episodeId","periodNumber","certificationType",
  "periodStart","periodEnd","status","certifyingProviderName","certifyingProviderNpi",
  "faceToFaceDate","signedAt","signedByProviderName","signedByProviderNpi","createdById"
)
SELECT
  e."organizationId",e."legalEntityId",e."id",1,'INITIAL',
  e."certificationPeriodStart",e."certificationPeriodEnd",
  CASE WHEN e."status" IN ('ACTIVE','ON_HOLD','DISCHARGED') THEN 'ACTIVE' ELSE 'DRAFT' END,
  e."certifyingProviderName",e."certifyingProviderNpi",e."faceToFaceDate",
  NULL,e."certifyingProviderName",e."certifyingProviderNpi",e."createdById"
FROM "HomeHealthEpisode" e
WHERE e."certificationPeriodStart" IS NOT NULL
  AND e."certificationPeriodEnd" IS NOT NULL
ON CONFLICT ("episodeId","periodNumber") DO NOTHING;

UPDATE "HomeHealthEpisode" e
SET "currentCertificationPeriodId" = p."id",
    "updatedAt" = NOW()
FROM "HomeHealthCertificationPeriod" p
WHERE p."episodeId" = e."id"
  AND p."periodNumber" = 1
  AND e."currentCertificationPeriodId" IS NULL;

DO $$ BEGIN
  ALTER TABLE "HomeHealthEpisode"
    ADD CONSTRAINT "HomeHealthEpisode_current_cert_fkey"
    FOREIGN KEY ("currentCertificationPeriodId")
    REFERENCES "HomeHealthCertificationPeriod"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "HomeHealthOasisSpecVersion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "specName" text NOT NULL,
  "itemSetVersionCode" text NOT NULL,
  "submissionSpecVersion" text NOT NULL,
  "effectiveFrom" date NOT NULL,
  "effectiveThrough" date,
  "sourceAuthority" text NOT NULL DEFAULT 'CMS',
  "sourceReference" text,
  "itemDefinitions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "editRules" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "definitionSha256" text,
  "status" text NOT NULL DEFAULT 'REGISTERED',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthOasisSpecVersion_status_ck" CHECK ("status" IN ('REGISTERED','LOADED','VALIDATED','RETIRED')),
  UNIQUE("itemSetVersionCode","submissionSpecVersion")
);

INSERT INTO "HomeHealthOasisSpecVersion"(
  "specName","itemSetVersionCode","submissionSpecVersion","effectiveFrom","sourceAuthority","sourceReference","status"
) VALUES(
  'OASIS-E2','E2-042026','3.02','2026-04-01','CMS',
  'CMS OASIS-E2 Data Submission Specifications Version 3.02.0','REGISTERED'
)
ON CONFLICT ("itemSetVersionCode","submissionSpecVersion") DO NOTHING;

CREATE TABLE IF NOT EXISTS "HomeHealthOasisAssessment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "episodeId" text NOT NULL REFERENCES "HomeHealthEpisode"("id") ON DELETE CASCADE,
  "certificationPeriodId" text REFERENCES "HomeHealthCertificationPeriod"("id") ON DELETE SET NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "assessmentResponseId" text NOT NULL REFERENCES "SpireAssessmentResponse"("id") ON DELETE RESTRICT,
  "specVersionId" text NOT NULL REFERENCES "HomeHealthOasisSpecVersion"("id") ON DELETE RESTRICT,
  "reasonForAssessment" text NOT NULL,
  "targetDate" date NOT NULL,
  "m0090Date" date,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "validationState" text NOT NULL DEFAULT 'NOT_RUN',
  "immutableSnapshot" jsonb,
  "snapshotSha256" text,
  "snapshotCreatedAt" timestamptz,
  "submittedAt" timestamptz,
  "acceptedAt" timestamptz,
  "rejectedAt" timestamptz,
  "correctsAssessmentId" text REFERENCES "HomeHealthOasisAssessment"("id") ON DELETE SET NULL,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthOasisAssessment_rfa_ck" CHECK ("reasonForAssessment" IN ('SOC','ROC','RECERTIFICATION','OTHER_FOLLOW_UP','TRANSFER','DISCHARGE','DEATH_AT_HOME')),
  CONSTRAINT "HomeHealthOasisAssessment_status_ck" CHECK ("status" IN ('DRAFT','VALIDATED','READY_TO_SUBMIT','SUBMITTED','ACCEPTED','REJECTED','CORRECTED','VOID')),
  CONSTRAINT "HomeHealthOasisAssessment_validation_ck" CHECK ("validationState" IN ('NOT_RUN','PASS','FAIL','WARNING')),
  UNIQUE("assessmentResponseId")
);
CREATE INDEX IF NOT EXISTS "HomeHealthOasisAssessment_episode_idx"
  ON "HomeHealthOasisAssessment"("organizationId","legalEntityId","episodeId","targetDate" DESC);
CREATE INDEX IF NOT EXISTS "HomeHealthOasisAssessment_submission_idx"
  ON "HomeHealthOasisAssessment"("organizationId","legalEntityId","status","targetDate");

CREATE TABLE IF NOT EXISTS "HomeHealthOasisEditFinding" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "oasisAssessmentId" text NOT NULL REFERENCES "HomeHealthOasisAssessment"("id") ON DELETE CASCADE,
  "ruleCode" text NOT NULL,
  "severity" text NOT NULL,
  "itemCode" text,
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "resolvedAt" timestamptz,
  "resolvedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthOasisEditFinding_severity_ck" CHECK ("severity" IN ('FATAL','WARNING','INFO')),
  CONSTRAINT "HomeHealthOasisEditFinding_status_ck" CHECK ("status" IN ('OPEN','RESOLVED','OVERRIDDEN'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthOasisEditFinding_open_idx"
  ON "HomeHealthOasisEditFinding"("organizationId","legalEntityId","oasisAssessmentId","status","severity");

CREATE TABLE IF NOT EXISTS "HomeHealthIqiesSubmission" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "oasisAssessmentId" text NOT NULL REFERENCES "HomeHealthOasisAssessment"("id") ON DELETE RESTRICT,
  "submissionSpecVersion" text NOT NULL,
  "environment" text NOT NULL DEFAULT 'TEST',
  "transportMode" text NOT NULL DEFAULT 'EXPORT_ONLY',
  "status" text NOT NULL DEFAULT 'QUEUED',
  "fileName" text,
  "payloadSha256" text,
  "externalSubmissionId" text,
  "validationUtilityVersion" text,
  "ackCode" text,
  "ackMessage" text,
  "responsePayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "queuedAt" timestamptz NOT NULL DEFAULT now(),
  "exportedAt" timestamptz,
  "submittedAt" timestamptz,
  "acknowledgedAt" timestamptz,
  "resolvedAt" timestamptz,
  "lastError" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthIqiesSubmission_environment_ck" CHECK ("environment" IN ('TEST','PRODUCTION')),
  CONSTRAINT "HomeHealthIqiesSubmission_transport_ck" CHECK ("transportMode" IN ('EXPORT_ONLY','MANUAL_UPLOAD','EXTERNAL_ADAPTER')),
  CONSTRAINT "HomeHealthIqiesSubmission_status_ck" CHECK ("status" IN ('QUEUED','EXPORTED','SUBMITTED','ACCEPTED','REJECTED','PARTIAL','ERROR','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthIqiesSubmission_queue_idx"
  ON "HomeHealthIqiesSubmission"("organizationId","legalEntityId","environment","status","queuedAt");

-- Extend the existing POC; do not create a second care-plan engine.
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "certificationPeriodId" text REFERENCES "HomeHealthCertificationPeriod"("id") ON DELETE SET NULL;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "cmsRepresentation" text NOT NULL DEFAULT 'CMS_485_POC';
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "certificationStatement" text;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "certifyingProviderName" text;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "certifyingProviderNpi" text;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "orderLifecycleStatus" text NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "verbalOrderObtainedAt" timestamptz;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "verbalOrderObtainedByUserId" text;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "writtenOrderReceivedAt" timestamptz;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "sentForSignatureAt" timestamptz;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "signatureDueAt" timestamptz;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "signatureStatus" text NOT NULL DEFAULT 'PENDING';
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "parentPlanOfCareId" text REFERENCES "HomeHealthPlanOfCare"("id") ON DELETE SET NULL;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "amendmentType" text;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "amendmentReason" text;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "amendedAt" timestamptz;
ALTER TABLE "HomeHealthPlanOfCare" ADD COLUMN IF NOT EXISTS "amendedById" text;
CREATE INDEX IF NOT EXISTS "HomeHealthPlanOfCare_cert_idx"
  ON "HomeHealthPlanOfCare"("organizationId","legalEntityId","certificationPeriodId","status")
  WHERE "certificationPeriodId" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "HomeHealthPlanOfCare" ADD CONSTRAINT "HomeHealthPlanOfCare_lifecycle_ck"
    CHECK ("orderLifecycleStatus" IN ('DRAFT','VERBAL_ORDER','WRITTEN_PENDING_SIGNATURE','SIGNED','ACTIVE','SUPERSEDED','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HomeHealthPlanOfCare" ADD CONSTRAINT "HomeHealthPlanOfCare_signature_status_ck"
    CHECK ("signatureStatus" IN ('PENDING','SIGNED','OVERDUE','NOT_REQUIRED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HomeHealthPlanOfCare" ADD CONSTRAINT "HomeHealthPlanOfCare_amendment_type_ck"
    CHECK ("amendmentType" IS NULL OR "amendmentType" IN ('ADDENDUM','AMENDMENT','RECERTIFICATION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend existing discipline orders with a provider-order lifecycle.
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "certificationPeriodId" text REFERENCES "HomeHealthCertificationPeriod"("id") ON DELETE SET NULL;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "orderNumber" text;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "orderType" text NOT NULL DEFAULT 'PLAN_OF_CARE';
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "communicationMethod" text;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "verbalOrderAt" timestamptz;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "receivedByUserId" text;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "sentForSignatureAt" timestamptz;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "signatureDueAt" timestamptz;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "providerSignedAt" timestamptz;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "signedByProviderName" text;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "signedByProviderNpi" text;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "signatureStatus" text NOT NULL DEFAULT 'PENDING';
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "supersedesOrderId" text REFERENCES "HomeHealthDisciplineOrder"("id") ON DELETE SET NULL;
ALTER TABLE "HomeHealthDisciplineOrder" ADD COLUMN IF NOT EXISTS "amendmentReason" text;
CREATE UNIQUE INDEX IF NOT EXISTS "HomeHealthDisciplineOrder_number_idx"
  ON "HomeHealthDisciplineOrder"("organizationId","legalEntityId","orderNumber") WHERE "orderNumber" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "HomeHealthDisciplineOrder_signature_due_idx"
  ON "HomeHealthDisciplineOrder"("organizationId","legalEntityId","signatureStatus","signatureDueAt")
  WHERE "signatureDueAt" IS NOT NULL;
DO $$ BEGIN
  ALTER TABLE "HomeHealthDisciplineOrder" ADD CONSTRAINT "HomeHealthDisciplineOrder_type_ck"
    CHECK ("orderType" IN ('PLAN_OF_CARE','VERBAL','WRITTEN','SUPPLEMENTAL','PRN','CHANGE','DISCONTINUE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HomeHealthDisciplineOrder" ADD CONSTRAINT "HomeHealthDisciplineOrder_signature_status_ck"
    CHECK ("signatureStatus" IN ('PENDING','SIGNED','OVERDUE','NOT_REQUIRED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One Home Health clinical visit may have at most one EVV visit. EVV remains a
-- compliance capture attached to the clinical visit, not a competing clinical visit identity.
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "homeHealthVisitId" text REFERENCES "HomeHealthVisit"("id") ON DELETE SET NULL;
ALTER TABLE "HomeHealthVisit" ADD COLUMN IF NOT EXISTS "certificationPeriodId" text REFERENCES "HomeHealthCertificationPeriod"("id") ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "SpireEvvVisit_home_health_visit_idx"
  ON "SpireEvvVisit"("homeHealthVisitId") WHERE "homeHealthVisitId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "HomeHealthVisit_evv_visit_idx"
  ON "HomeHealthVisit"("evvVisitId") WHERE "evvVisitId" IS NOT NULL;

-- Backfill only unambiguous legacy links. Ambiguous/dangling links are preserved
-- on HomeHealthVisit.evvVisitId for audit and must be resolved by the readiness gate.
UPDATE "SpireEvvVisit" evv
SET "homeHealthVisitId" = hh."id", "updatedAt" = NOW()
FROM "HomeHealthVisit" hh
WHERE hh."evvVisitId" = evv."id"
  AND evv."homeHealthVisitId" IS NULL
  AND (SELECT count(*) FROM "HomeHealthVisit" x WHERE x."evvVisitId" = evv."id") = 1;

UPDATE "HomeHealthVisit" v
SET "certificationPeriodId" = e."currentCertificationPeriodId", "updatedAt" = NOW()
FROM "HomeHealthEpisode" e
WHERE e."id" = v."episodeId"
  AND v."certificationPeriodId" IS NULL
  AND e."currentCertificationPeriodId" IS NOT NULL;

CREATE OR REPLACE FUNCTION "validate_home_health_evv_visit_link"() RETURNS trigger AS $$
DECLARE
  hh record;
BEGIN
  IF NEW."homeHealthVisitId" IS NULL THEN RETURN NEW; END IF;
  SELECT "organizationId","legalEntityId","patientId" INTO hh
    FROM "HomeHealthVisit" WHERE "id" = NEW."homeHealthVisitId";
  IF NOT FOUND THEN RAISE EXCEPTION 'Home Health visit % does not exist', NEW."homeHealthVisitId"; END IF;
  IF hh."organizationId" <> NEW."organizationId" OR hh."patientId" <> NEW."patientId" THEN
    RAISE EXCEPTION 'EVV/Home Health visit organization or patient mismatch';
  END IF;
  IF NEW."legalEntityId" IS NOT NULL AND hh."legalEntityId" <> NEW."legalEntityId" THEN
    RAISE EXCEPTION 'EVV/Home Health visit legal-entity mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireEvvVisit_home_health_link_trg" ON "SpireEvvVisit";
CREATE TRIGGER "SpireEvvVisit_home_health_link_trg"
BEFORE INSERT OR UPDATE OF "homeHealthVisitId","organizationId","legalEntityId","patientId" ON "SpireEvvVisit"
FOR EACH ROW EXECUTE FUNCTION "validate_home_health_evv_visit_link"();

CREATE TABLE IF NOT EXISTS "HomeHealthEpisodeTransition" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "episodeId" text NOT NULL REFERENCES "HomeHealthEpisode"("id") ON DELETE CASCADE,
  "certificationPeriodId" text REFERENCES "HomeHealthCertificationPeriod"("id") ON DELETE SET NULL,
  "transitionType" text NOT NULL,
  "fromStatus" text,
  "toStatus" text NOT NULL,
  "effectiveAt" timestamptz NOT NULL,
  "reason" text,
  "destination" text,
  "oasisAssessmentId" text REFERENCES "HomeHealthOasisAssessment"("id") ON DELETE SET NULL,
  "actorUserId" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthEpisodeTransition_type_ck" CHECK ("transitionType" IN ('START_OF_CARE','ACTIVATE','HOLD','RESUME','RECERTIFY','TRANSFER','DISCHARGE','CANCEL'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthEpisodeTransition_episode_idx"
  ON "HomeHealthEpisodeTransition"("organizationId","legalEntityId","episodeId","effectiveAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_home_health_transition_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'HomeHealthEpisodeTransition is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "HomeHealthEpisodeTransition_no_update" ON "HomeHealthEpisodeTransition";
CREATE TRIGGER "HomeHealthEpisodeTransition_no_update" BEFORE UPDATE ON "HomeHealthEpisodeTransition"
FOR EACH ROW EXECUTE FUNCTION "prevent_home_health_transition_mutation"();
DROP TRIGGER IF EXISTS "HomeHealthEpisodeTransition_no_delete" ON "HomeHealthEpisodeTransition";
CREATE TRIGGER "HomeHealthEpisodeTransition_no_delete" BEFORE DELETE ON "HomeHealthEpisodeTransition"
FOR EACH ROW EXECUTE FUNCTION "prevent_home_health_transition_mutation"();
