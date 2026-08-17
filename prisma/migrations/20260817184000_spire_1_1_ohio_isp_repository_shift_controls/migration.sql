CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- SPIRE 1.1 / Step 3 regulatory closure:
-- immutable OhioISP repository snapshots, secure-document provenance, signature
-- provenance and documented shift exceptions for incomplete OhioISP support work.

CREATE TABLE IF NOT EXISTS "SpireOhioIspPlanVersion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL,
  "sourcePlanVersion" text,
  "snapshot" jsonb NOT NULL,
  "reason" text NOT NULL,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspPlanVersion_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspPlanVersion_key" UNIQUE ("ohioIspPlanId","version")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspPlanVersion_patient_idx"
  ON "SpireOhioIspPlanVersion"("organizationId","legalEntityId","patientId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireOhioIspPlanDocumentLink" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "documentId" text NOT NULL,
  "documentVersion" integer NOT NULL,
  "documentSha256" text,
  "documentRole" text NOT NULL,
  "sourcePlanVersion" text,
  "supersedesLinkId" text REFERENCES "SpireOhioIspPlanDocumentLink"("id") ON DELETE RESTRICT,
  "linkedByUserId" text NOT NULL,
  "linkedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspPlanDocumentLink_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspPlanDocumentLink_role_check" CHECK ("documentRole" IN ('ACTIVE_PLAN','SOURCE_ATTACHMENT','SIGNATURE_ATTACHMENT','ASSESSMENT_ATTACHMENT')),
  CONSTRAINT "SpireOhioIspPlanDocumentLink_key" UNIQUE ("ohioIspPlanId","documentId","documentVersion","documentRole")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspPlanDocumentLink_plan_idx"
  ON "SpireOhioIspPlanDocumentLink"("ohioIspPlanId","linkedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireOhioIspSignatureLink" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "carePlanSignatureId" text NOT NULL,
  "planVersion" text NOT NULL,
  "signerRole" text NOT NULL,
  "signerName" text NOT NULL,
  "signerUserId" text,
  "signatureMethod" text,
  "attestation" text,
  "signedAt" timestamptz NOT NULL,
  "linkedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspSignatureLink_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspSignatureLink_signature_key" UNIQUE ("ohioIspPlanId","carePlanSignatureId")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspSignatureLink_plan_idx"
  ON "SpireOhioIspSignatureLink"("ohioIspPlanId","signedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireOhioIspTaskException" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "supportId" text NOT NULL REFERENCES "SpireOhioIspSupport"("id") ON DELETE RESTRICT,
  "taskBindingId" text NOT NULL REFERENCES "SpireOhioIspSupportTaskBinding"("id") ON DELETE RESTRICT,
  "taskId" text NOT NULL,
  "employeeId" text NOT NULL,
  "clockEntryId" text NOT NULL,
  "shiftId" text,
  "reason" text NOT NULL,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspTaskException_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspTaskException_reason_check" CHECK (length(btrim("reason")) >= 10),
  CONSTRAINT "SpireOhioIspTaskException_clock_task_key" UNIQUE ("clockEntryId","taskId")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspTaskException_employee_idx"
  ON "SpireOhioIspTaskException"("organizationId","legalEntityId","employeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireOhioIspTaskException_task_idx"
  ON "SpireOhioIspTaskException"("taskId","createdAt" DESC);

-- Existing Care Plan signatures remain the signing system. When a signature is
-- added to a Care Plan that has an OhioISP profile, capture an immutable OhioISP
-- signature-provenance row for the exact source-plan version.
CREATE OR REPLACE FUNCTION "link_spire_care_plan_signature_to_ohio_isp"()
RETURNS trigger AS $$
DECLARE
  ohio_plan record;
BEGIN
  SELECT o.* INTO ohio_plan
    FROM "SpireOhioIspPlan" o
   WHERE o."organizationId"=NEW."organizationId"
     AND o."legalEntityId"=NEW."legalEntityId"
     AND o."patientId"=NEW."patientId"
     AND o."carePlanId"=NEW."carePlanId"
   LIMIT 1;
  IF ohio_plan.id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO "SpireOhioIspSignatureLink"(
    "organizationId","legalEntityId","patientId","ohioIspPlanId","carePlanSignatureId","planVersion",
    "signerRole","signerName","signerUserId","signatureMethod","attestation","signedAt"
  ) VALUES(
    NEW."organizationId",NEW."legalEntityId",NEW."patientId",ohio_plan.id,NEW."id",
    COALESCE(NULLIF(ohio_plan."sourcePlanVersion",''),'SOURCE_UNVERSIONED'),NEW."signerRole",NEW."signerName",
    NEW."signerUserId",NEW."signatureMethod",NEW."attestation",NEW."signedAt"
  ) ON CONFLICT ("ohioIspPlanId","carePlanSignatureId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireCarePlanSignature_link_ohio_isp" ON "SpireCarePlanSignature";
CREATE TRIGGER "SpireCarePlanSignature_link_ohio_isp"
AFTER INSERT ON "SpireCarePlanSignature"
FOR EACH ROW EXECUTE FUNCTION "link_spire_care_plan_signature_to_ohio_isp"();

INSERT INTO "SpireOhioIspSignatureLink"(
  "organizationId","legalEntityId","patientId","ohioIspPlanId","carePlanSignatureId","planVersion",
  "signerRole","signerName","signerUserId","signatureMethod","attestation","signedAt"
)
SELECT s."organizationId",s."legalEntityId",s."patientId",o."id",s."id",
       COALESCE(NULLIF(o."sourcePlanVersion",''),'SOURCE_UNVERSIONED'),s."signerRole",s."signerName",
       s."signerUserId",s."signatureMethod",s."attestation",s."signedAt"
FROM "SpireCarePlanSignature" s
JOIN "SpireOhioIspPlan" o
  ON o."organizationId"=s."organizationId" AND o."legalEntityId"=s."legalEntityId"
 AND o."patientId"=s."patientId" AND o."carePlanId"=s."carePlanId"
ON CONFLICT ("ohioIspPlanId","carePlanSignatureId") DO NOTHING;

CREATE OR REPLACE FUNCTION "prevent_spire_ohio_isp_repository_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireOhioIspPlanVersion_no_update" ON "SpireOhioIspPlanVersion";
CREATE TRIGGER "SpireOhioIspPlanVersion_no_update" BEFORE UPDATE ON "SpireOhioIspPlanVersion"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_repository_mutation"();
DROP TRIGGER IF EXISTS "SpireOhioIspPlanVersion_no_delete" ON "SpireOhioIspPlanVersion";
CREATE TRIGGER "SpireOhioIspPlanVersion_no_delete" BEFORE DELETE ON "SpireOhioIspPlanVersion"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_repository_mutation"();

DROP TRIGGER IF EXISTS "SpireOhioIspPlanDocumentLink_no_update" ON "SpireOhioIspPlanDocumentLink";
CREATE TRIGGER "SpireOhioIspPlanDocumentLink_no_update" BEFORE UPDATE ON "SpireOhioIspPlanDocumentLink"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_repository_mutation"();
DROP TRIGGER IF EXISTS "SpireOhioIspPlanDocumentLink_no_delete" ON "SpireOhioIspPlanDocumentLink";
CREATE TRIGGER "SpireOhioIspPlanDocumentLink_no_delete" BEFORE DELETE ON "SpireOhioIspPlanDocumentLink"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_repository_mutation"();

DROP TRIGGER IF EXISTS "SpireOhioIspSignatureLink_no_update" ON "SpireOhioIspSignatureLink";
CREATE TRIGGER "SpireOhioIspSignatureLink_no_update" BEFORE UPDATE ON "SpireOhioIspSignatureLink"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_repository_mutation"();
DROP TRIGGER IF EXISTS "SpireOhioIspSignatureLink_no_delete" ON "SpireOhioIspSignatureLink";
CREATE TRIGGER "SpireOhioIspSignatureLink_no_delete" BEFORE DELETE ON "SpireOhioIspSignatureLink"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_repository_mutation"();

DROP TRIGGER IF EXISTS "SpireOhioIspTaskException_no_update" ON "SpireOhioIspTaskException";
CREATE TRIGGER "SpireOhioIspTaskException_no_update" BEFORE UPDATE ON "SpireOhioIspTaskException"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_repository_mutation"();
DROP TRIGGER IF EXISTS "SpireOhioIspTaskException_no_delete" ON "SpireOhioIspTaskException";
CREATE TRIGGER "SpireOhioIspTaskException_no_delete" BEFORE DELETE ON "SpireOhioIspTaskException"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_repository_mutation"();
