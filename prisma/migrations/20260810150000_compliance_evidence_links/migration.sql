CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "CompanyComplianceEvidence" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "complianceItemId" text NOT NULL REFERENCES "CompanyComplianceItem"("id") ON DELETE CASCADE,
  "documentId" text NOT NULL,
  "documentTitleSnapshot" text,
  "evidenceType" text NOT NULL DEFAULT 'SUPPORTING',
  "notes" text,
  "addedByUserId" text NOT NULL,
  "addedAt" timestamptz NOT NULL DEFAULT now(),
  "removedAt" timestamptz,
  "removedByUserId" text,
  "removalReason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "CompanyComplianceEvidence_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "CompanyComplianceEvidence_type_check" CHECK ("evidenceType" IN ('PRIMARY','SUPPORTING','RENEWAL','VERIFICATION','OTHER'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyComplianceEvidence_active_unique"
  ON "CompanyComplianceEvidence"("organizationId","legalEntityId","complianceItemId","documentId","evidenceType")
  WHERE "removedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "CompanyComplianceEvidence_item_idx" ON "CompanyComplianceEvidence"("organizationId","legalEntityId","complianceItemId","removedAt");
CREATE INDEX IF NOT EXISTS "CompanyComplianceEvidence_document_idx" ON "CompanyComplianceEvidence"("organizationId","legalEntityId","documentId") WHERE "removedAt" IS NULL;

CREATE OR REPLACE FUNCTION "require_compliance_evidence_for_activation"()
RETURNS trigger AS $$
DECLARE evidence_count integer;
BEGIN
  IF NEW."status"='ACTIVE' AND OLD."status" IS DISTINCT FROM 'ACTIVE'
     AND NEW."category" IN ('LICENSE','MEDICAID_PROVIDER','CERTIFICATION','INSURANCE','REGISTRATION','CONTRACT','ACCREDITATION','FLEET_VEHICLE','DRIVER_COMPLIANCE','CORPORATE','TAX')
     AND COALESCE(NEW."metadata"->>'autoProjected','false')<>'true' THEN
    SELECT count(*) INTO evidence_count FROM "CompanyComplianceEvidence"
    WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId"
      AND "complianceItemId"=NEW."id" AND "removedAt" IS NULL;
    IF evidence_count=0 AND NULLIF(NEW."linkedDocumentId",'') IS NULL THEN
      RAISE EXCEPTION 'Supporting evidence must be linked before this compliance item can be activated';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "CompanyComplianceItem_evidence_activation_guard" ON "CompanyComplianceItem";
CREATE TRIGGER "CompanyComplianceItem_evidence_activation_guard"
BEFORE UPDATE OF "status" ON "CompanyComplianceItem"
FOR EACH ROW EXECUTE FUNCTION "require_compliance_evidence_for_activation"();
