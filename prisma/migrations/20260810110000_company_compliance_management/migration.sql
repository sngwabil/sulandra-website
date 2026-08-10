CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "CompanyComplianceItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "category" text NOT NULL,
  "requirementName" text NOT NULL,
  "authority" text,
  "referenceNumber" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "effectiveDate" date,
  "expirationDate" date,
  "renewalLeadDays" integer NOT NULL DEFAULT 60,
  "responsibleUserId" text,
  "linkedDocumentId" text,
  "documentFolderHint" text,
  "verificationMethod" text,
  "verifiedAt" timestamptz,
  "verifiedByUserId" text,
  "lastReviewedAt" timestamptz,
  "lastReviewedByUserId" text,
  "renewalSubmittedAt" timestamptz,
  "renewalConfirmation" text,
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CompanyComplianceItem_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "CompanyComplianceItem_status_check" CHECK ("status" IN ('ACTIVE','RENEWAL_IN_PROGRESS','PENDING_VERIFICATION','EXPIRED','SUSPENDED','NOT_APPLICABLE','SUPERSEDED','CLOSED')),
  CONSTRAINT "CompanyComplianceItem_category_check" CHECK ("category" IN ('LICENSE','MEDICAID_PROVIDER','CERTIFICATION','INSURANCE','REGISTRATION','CONTRACT','ACCREDITATION','POLICY_REVIEW','FLEET_VEHICLE','DRIVER_COMPLIANCE','FACILITY_HOME','HOME_HEALTH','NMT','SCLS_DODD','CORPORATE','TAX','OTHER')),
  CONSTRAINT "CompanyComplianceItem_lead_check" CHECK ("renewalLeadDays">=0 AND "renewalLeadDays"<=730)
);
CREATE INDEX IF NOT EXISTS "CompanyComplianceItem_entity_idx" ON "CompanyComplianceItem"("organizationId","legalEntityId","status","expirationDate");
CREATE INDEX IF NOT EXISTS "CompanyComplianceItem_owner_idx" ON "CompanyComplianceItem"("organizationId","legalEntityId","responsibleUserId","status","expirationDate");

CREATE TABLE IF NOT EXISTS "CompanyComplianceEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "complianceItemId" text NOT NULL REFERENCES "CompanyComplianceItem"("id") ON DELETE CASCADE,
  "eventType" text NOT NULL,
  "actorUserId" text NOT NULL,
  "fromStatus" text,
  "toStatus" text,
  "comment" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CompanyComplianceEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "CompanyComplianceEvent_type_check" CHECK ("eventType" IN ('CREATED','UPDATED','REVIEWED','VERIFIED','RENEWAL_STARTED','RENEWAL_SUBMITTED','RENEWED','EXPIRED','SUSPENDED','SUPERSEDED','CLOSED','COMMENT'))
);
CREATE INDEX IF NOT EXISTS "CompanyComplianceEvent_item_idx" ON "CompanyComplianceEvent"("organizationId","legalEntityId","complianceItemId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_company_compliance_event_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'CompanyComplianceEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "CompanyComplianceEvent_no_update" ON "CompanyComplianceEvent";
CREATE TRIGGER "CompanyComplianceEvent_no_update" BEFORE UPDATE ON "CompanyComplianceEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_company_compliance_event_mutation"();
DROP TRIGGER IF EXISTS "CompanyComplianceEvent_no_delete" ON "CompanyComplianceEvent";
CREATE TRIGGER "CompanyComplianceEvent_no_delete" BEFORE DELETE ON "CompanyComplianceEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_company_compliance_event_mutation"();

CREATE OR REPLACE FUNCTION "notify_company_compliance_change"() RETURNS trigger AS $$
DECLARE
  urgency text;
  msg text;
BEGIN
  IF NEW."status" IN ('CLOSED','SUPERSEDED','NOT_APPLICABLE') THEN
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=now(),"updatedAt"=now()
    WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId"
      AND "resourceType"='CompanyComplianceItem' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
    RETURN NEW;
  END IF;

  urgency := CASE
    WHEN NEW."status" IN ('EXPIRED','SUSPENDED') THEN 'CRITICAL'
    WHEN NEW."expirationDate" IS NOT NULL AND NEW."expirationDate" <= CURRENT_DATE + 15 THEN 'URGENT'
    WHEN NEW."expirationDate" IS NOT NULL AND NEW."expirationDate" <= CURRENT_DATE + NEW."renewalLeadDays" THEN 'HIGH'
    ELSE 'ROUTINE'
  END;
  msg := CASE
    WHEN NEW."status"='EXPIRED' THEN 'Compliance item is expired and requires immediate action.'
    WHEN NEW."status"='SUSPENDED' THEN 'Compliance item is suspended and requires immediate action.'
    WHEN NEW."expirationDate" IS NOT NULL THEN concat('Expiration date: ',NEW."expirationDate"::text,'. Renewal lead: ',NEW."renewalLeadDays",' days.')
    ELSE 'Compliance item requires ongoing review.'
  END;
  PERFORM "upsert_enterprise_work_notification"(
    NEW."organizationId",NEW."legalEntityId",NEW."responsibleUserId",
    CASE WHEN NEW."responsibleUserId" IS NULL THEN '["ADMINISTRATOR","PROGRAM_MANAGER","HR_MANAGER","BILLING_SPECIALIST","CEO","DOO"]'::jsonb ELSE '[]'::jsonb END,
    'COMPLIANCE','CompanyComplianceItem',NEW."id",'COMPLIANCE_DUE',NEW."requirementName",msg,urgency,
    '/company-compliance.html',CASE WHEN NEW."expirationDate" IS NULL THEN NULL ELSE NEW."expirationDate"::timestamptz END,
    jsonb_build_object('category',NEW."category",'authority',NEW."authority",'referenceNumber',NEW."referenceNumber")
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "CompanyComplianceItem_work_notification" ON "CompanyComplianceItem";
CREATE TRIGGER "CompanyComplianceItem_work_notification" AFTER INSERT OR UPDATE OF "status","expirationDate","renewalLeadDays","responsibleUserId","requirementName" ON "CompanyComplianceItem" FOR EACH ROW EXECUTE FUNCTION "notify_company_compliance_change"();
