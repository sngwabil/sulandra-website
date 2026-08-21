-- SPIRE 1.1 Phase A / Step 2
-- First-class Ohio DODD service documentation + generic record-retention foundation.
-- Regulatory profiles are date-effective/configurable; claims are never treated as
-- substitutes for the underlying service documentation.

CREATE TABLE IF NOT EXISTS "SpireDoddDocumentationProfile" (
  "code" text PRIMARY KEY,
  "name" text NOT NULL,
  "authority" text NOT NULL,
  "effectiveFrom" date NOT NULL,
  "effectiveTo" date,
  "requiresPlace" boolean NOT NULL DEFAULT true,
  "requiresStartStop" boolean NOT NULL DEFAULT false,
  "requiresUnits" boolean NOT NULL DEFAULT false,
  "requiresGroupSize" boolean NOT NULL DEFAULT false,
  "requiresNarrative" boolean NOT NULL DEFAULT false,
  "requiresIndividualResponse" boolean NOT NULL DEFAULT false,
  "requiredServiceSpecificFields" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "SpireDoddDocumentationProfile"(
  "code","name","authority","effectiveFrom","requiresPlace","requiresStartStop","requiresUnits",
  "requiresGroupSize","requiresNarrative","requiresIndividualResponse","requiredServiceSpecificFields"
) VALUES
  ('HPC_5123_9_30','Homemaker/Personal Care','OAC 5123-9-30','2024-01-01',true,true,true,true,true,false,'[]'::jsonb),
  ('SHARED_HPC_5123_9_31','Shared Homemaker/Personal Care','OAC 5123-9-31','2024-01-01',true,false,false,false,true,false,'["sharedIndividuals"]'::jsonb),
  ('PD_HPC_5123_9_32','Participant-Directed Homemaker/Personal Care','OAC 5123-9-32','2024-01-01',true,true,true,true,true,false,'[]'::jsonb),
  ('ADULT_DAY_5123_9_17','Adult Day Support','OAC 5123-9-17','2026-07-01',true,true,true,true,true,false,'[]'::jsonb),
  ('TRANSPORT_5123_9_24','Transportation','OAC 5123-9-24','2025-01-02',false,false,false,false,false,false,'["licensePlate","origin","destination","miles","occupants"]'::jsonb),
  ('SUPPORT_BROKERAGE_5123_9_47','Support Brokerage','OAC 5123-9-47','2026-01-01',true,true,true,false,true,false,'[]'::jsonb),
  ('CLINICAL_THERAPEUTIC_5123_9_41','Clinical/Therapeutic Intervention','OAC 5123-9-41','2024-12-02',true,true,true,false,true,true,'[]'::jsonb),
  ('GENERIC_DODD','DODD Waiver Service Documentation','OAC 5123-9-40 and applicable service rule','2024-01-01',true,false,false,false,false,false,'[]'::jsonb)
ON CONFLICT ("code") DO UPDATE SET
  "name"=EXCLUDED."name",
  "authority"=EXCLUDED."authority",
  "requiresPlace"=EXCLUDED."requiresPlace",
  "requiresStartStop"=EXCLUDED."requiresStartStop",
  "requiresUnits"=EXCLUDED."requiresUnits",
  "requiresGroupSize"=EXCLUDED."requiresGroupSize",
  "requiresNarrative"=EXCLUDED."requiresNarrative",
  "requiresIndividualResponse"=EXCLUDED."requiresIndividualResponse",
  "requiredServiceSpecificFields"=EXCLUDED."requiredServiceSpecificFields",
  "updatedAt"=now();

CREATE TABLE IF NOT EXISTS "SpireRetentionPolicy" (
  "code" text PRIMARY KEY,
  "name" text NOT NULL,
  "domain" text NOT NULL,
  "minimumYears" integer NOT NULL,
  "basis" text NOT NULL,
  "authority" text NOT NULL,
  "effectiveFrom" date NOT NULL,
  "effectiveTo" date,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireRetentionPolicy_years_ck" CHECK ("minimumYears">=0)
);

INSERT INTO "SpireRetentionPolicy"(
  "code","name","domain","minimumYears","basis","authority","effectiveFrom"
) VALUES(
  'DODD_SERVICE_DOCUMENTATION_6Y',
  'DODD service documentation — six years after payment or longer through initiated audit',
  'DODD_SERVICE_DOCUMENTATION',6,'PAYMENT_OR_AUDIT_RESOLUTION','OAC 5123-9-40(K)','2026-07-01'
)
ON CONFLICT ("code") DO UPDATE SET
  "name"=EXCLUDED."name","domain"=EXCLUDED."domain","minimumYears"=EXCLUDED."minimumYears",
  "basis"=EXCLUDED."basis","authority"=EXCLUDED."authority","updatedAt"=now();

CREATE TABLE IF NOT EXISTS "SpireDoddServiceDocument" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "homeId" text,
  "authorizationId" text REFERENCES "SpireServiceAuthorization"("id") ON DELETE RESTRICT,
  "evvVisitId" text REFERENCES "SpireEvvVisit"("id") ON DELETE RESTRICT,
  "clinicalTaskId" text,
  "documentationProfileCode" text NOT NULL REFERENCES "SpireDoddDocumentationProfile"("code") ON DELETE RESTRICT,
  "serviceType" text NOT NULL,
  "serviceCode" text,
  "serviceDate" date NOT NULL,
  "placeOfService" text,
  "individualName" text NOT NULL,
  "individualMedicaidId" text,
  "providerName" text,
  "providerIdentifier" text,
  "staffUserId" text NOT NULL,
  "staffDisplayName" text,
  "staffCredentials" text,
  "startAt" timestamptz,
  "endAt" timestamptz,
  "units" numeric(14,3),
  "unitType" text,
  "groupSize" integer,
  "serviceNarrative" text,
  "individualResponse" text,
  "serviceSpecificData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" text NOT NULL,
  "completedByUserId" text,
  "completedAt" timestamptz,
  "signedByUserId" text,
  "signerEmail" text,
  "signerDisplayName" text,
  "signerCredentials" text,
  "signatureIntent" text,
  "signedAt" timestamptz,
  "voidedByUserId" text,
  "voidReason" text,
  "voidedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireDoddServiceDocument_status_ck" CHECK ("status" IN ('DRAFT','COMPLETE','SIGNED','VOID')),
  CONSTRAINT "SpireDoddServiceDocument_units_ck" CHECK ("units" IS NULL OR "units">=0),
  CONSTRAINT "SpireDoddServiceDocument_group_ck" CHECK ("groupSize" IS NULL OR "groupSize">0),
  CONSTRAINT "SpireDoddServiceDocument_times_ck" CHECK ("startAt" IS NULL OR "endAt" IS NULL OR "endAt">"startAt")
);
CREATE INDEX IF NOT EXISTS "SpireDoddServiceDocument_patient_idx"
  ON "SpireDoddServiceDocument"("organizationId","legalEntityId","patientId","serviceDate" DESC);
CREATE INDEX IF NOT EXISTS "SpireDoddServiceDocument_status_idx"
  ON "SpireDoddServiceDocument"("organizationId","legalEntityId","status","serviceDate" DESC);
CREATE INDEX IF NOT EXISTS "SpireDoddServiceDocument_evv_idx"
  ON "SpireDoddServiceDocument"("organizationId","evvVisitId") WHERE "evvVisitId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "SpireDoddServiceDocumentEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "serviceDocumentId" text NOT NULL REFERENCES "SpireDoddServiceDocument"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "fromStatus" text,
  "toStatus" text,
  "actorUserId" text NOT NULL,
  "actorEmail" text,
  "reason" text,
  "beforeValue" jsonb,
  "afterValue" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireDoddServiceDocumentEvent_doc_idx"
  ON "SpireDoddServiceDocumentEvent"("organizationId","serviceDocumentId","createdAt");

CREATE TABLE IF NOT EXISTS "SpireRecordRetention" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "resourceType" text NOT NULL,
  "resourceId" text NOT NULL,
  "policyCode" text NOT NULL REFERENCES "SpireRetentionPolicy"("code") ON DELETE RESTRICT,
  "paymentReceivedAt" timestamptz,
  "minimumRetainUntil" timestamptz,
  "auditOpenedAt" timestamptz,
  "auditResolvedAt" timestamptz,
  "legalHold" boolean NOT NULL DEFAULT false,
  "legalHoldReason" text,
  "legalHoldSetByUserId" text,
  "legalHoldSetAt" timestamptz,
  "calculatedRetainUntil" timestamptz,
  "dispositionStatus" text NOT NULL DEFAULT 'ACTIVE',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireRecordRetention_resource_key" UNIQUE("organizationId","resourceType","resourceId"),
  CONSTRAINT "SpireRecordRetention_disposition_ck" CHECK ("dispositionStatus" IN ('ACTIVE','ELIGIBLE','DISPOSED')),
  CONSTRAINT "SpireRecordRetention_audit_ck" CHECK ("auditResolvedAt" IS NULL OR "auditOpenedAt" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "SpireRecordRetention_due_idx"
  ON "SpireRecordRetention"("organizationId","calculatedRetainUntil","dispositionStatus");

CREATE TABLE IF NOT EXISTS "SpireRecordRetentionEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "retentionId" text NOT NULL REFERENCES "SpireRecordRetention"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "actorUserId" text NOT NULL,
  "reason" text,
  "beforeValue" jsonb,
  "afterValue" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireRecordRetentionEvent_retention_idx"
  ON "SpireRecordRetentionEvent"("organizationId","retentionId","createdAt");

CREATE OR REPLACE FUNCTION "spire_recalculate_retention"() RETURNS trigger AS $$
DECLARE
  v_years integer;
  v_base timestamptz;
BEGIN
  SELECT "minimumYears" INTO v_years FROM "SpireRetentionPolicy" WHERE "code"=NEW."policyCode";
  IF NEW."paymentReceivedAt" IS NOT NULL THEN
    v_base := NEW."paymentReceivedAt" + make_interval(years => COALESCE(v_years,0));
    NEW."minimumRetainUntil" := v_base;
  ELSE
    NEW."minimumRetainUntil" := NULL;
    v_base := NULL;
  END IF;

  IF NEW."legalHold" OR (NEW."auditOpenedAt" IS NOT NULL AND NEW."auditResolvedAt" IS NULL) THEN
    NEW."calculatedRetainUntil" := NULL;
  ELSIF NEW."auditResolvedAt" IS NOT NULL THEN
    NEW."calculatedRetainUntil" := CASE
      WHEN v_base IS NULL THEN NEW."auditResolvedAt"
      ELSE GREATEST(v_base,NEW."auditResolvedAt")
    END;
  ELSE
    NEW."calculatedRetainUntil" := v_base;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireRecordRetention_recalculate_trg" ON "SpireRecordRetention";
CREATE TRIGGER "SpireRecordRetention_recalculate_trg"
BEFORE INSERT OR UPDATE ON "SpireRecordRetention"
FOR EACH ROW EXECUTE FUNCTION "spire_recalculate_retention"();

CREATE OR REPLACE FUNCTION "spire_dodd_document_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'DODD service documentation is retained evidence and cannot be deleted';
  END IF;
  IF OLD."status"='VOID' THEN
    RAISE EXCEPTION 'Voided DODD service documentation is immutable';
  END IF;
  IF OLD."status"='SIGNED' AND NOT (
    NEW."status"='VOID' AND NEW."voidedAt" IS NOT NULL AND NEW."voidedByUserId" IS NOT NULL AND NULLIF(NEW."voidReason",'') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Signed DODD service documentation is immutable; void with a reason instead of editing';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireDoddServiceDocument_guard_trg" ON "SpireDoddServiceDocument";
CREATE TRIGGER "SpireDoddServiceDocument_guard_trg"
BEFORE UPDATE OR DELETE ON "SpireDoddServiceDocument"
FOR EACH ROW EXECUTE FUNCTION "spire_dodd_document_guard"();

CREATE OR REPLACE FUNCTION "spire_reject_dodd_evidence_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SPIRE DODD service-documentation evidence is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireDoddServiceDocumentEvent_immutable_trg" ON "SpireDoddServiceDocumentEvent";
CREATE TRIGGER "SpireDoddServiceDocumentEvent_immutable_trg"
BEFORE UPDATE OR DELETE ON "SpireDoddServiceDocumentEvent"
FOR EACH ROW EXECUTE FUNCTION "spire_reject_dodd_evidence_mutation"();

DROP TRIGGER IF EXISTS "SpireRecordRetentionEvent_immutable_trg" ON "SpireRecordRetentionEvent";
CREATE TRIGGER "SpireRecordRetentionEvent_immutable_trg"
BEFORE UPDATE OR DELETE ON "SpireRecordRetentionEvent"
FOR EACH ROW EXECUTE FUNCTION "spire_reject_dodd_evidence_mutation"();
