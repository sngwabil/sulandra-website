-- SPIRE 1.1 Phase B / Step 3
-- Claim-exchange foundation for X12 candidate generation, external trading-partner
-- handoff, acknowledgement/remittance evidence, and PNM/eMBS verification workflows.
-- No table or seed below asserts live Ohio connectivity or trading-partner certification.

CREATE TABLE IF NOT EXISTS "RevenueCycleTradingPartnerProfileVersion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "profileCode" text NOT NULL,
  "version" integer NOT NULL,
  "name" text NOT NULL,
  "channelType" text NOT NULL,
  "environment" text NOT NULL DEFAULT 'TEST',
  "claimFormat" text NOT NULL,
  "transportMode" text NOT NULL DEFAULT 'MANUAL_DOWNLOAD',
  "submitterId" text,
  "receiverId" text,
  "payerId" text,
  "companionGuideVersion" text,
  "credentialRef" text,
  "externalVerificationStatus" text NOT NULL DEFAULT 'NOT_CONFIGURED',
  "externalVerifiedAt" timestamptz,
  "externalVerifiedByUserId" text,
  "productionEnabled" boolean NOT NULL DEFAULT false,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "verificationEvidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleTradingPartnerProfileVersion_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "RevenueCycleTradingPartnerProfileVersion_version_ck" CHECK ("version">0),
  CONSTRAINT "RevenueCycleTradingPartnerProfileVersion_channel_ck" CHECK ("channelType" IN ('CLEARINGHOUSE','ODM_TRADING_PARTNER','MANUAL_PORTAL')),
  CONSTRAINT "RevenueCycleTradingPartnerProfileVersion_environment_ck" CHECK ("environment" IN ('TEST','PRODUCTION')),
  CONSTRAINT "RevenueCycleTradingPartnerProfileVersion_format_ck" CHECK ("claimFormat" IN ('837P','837I','BOTH')),
  CONSTRAINT "RevenueCycleTradingPartnerProfileVersion_transport_ck" CHECK ("transportMode" IN ('MANUAL_DOWNLOAD','SFTP','API','PORTAL')),
  CONSTRAINT "RevenueCycleTradingPartnerProfileVersion_verification_ck" CHECK ("externalVerificationStatus" IN ('NOT_CONFIGURED','TESTING','VERIFIED','REJECTED')),
  CONSTRAINT "RevenueCycleTradingPartnerProfileVersion_prod_ck" CHECK (NOT "productionEnabled" OR ("environment"='PRODUCTION' AND "externalVerificationStatus"='VERIFIED')),
  CONSTRAINT "RevenueCycleTradingPartnerProfileVersion_code_version_key" UNIQUE("organizationId","legalEntityId","profileCode","version")
);
CREATE INDEX IF NOT EXISTS "RevenueCycleTradingPartnerProfileVersion_entity_idx"
  ON "RevenueCycleTradingPartnerProfileVersion"("organizationId","legalEntityId","profileCode","version" DESC);

CREATE OR REPLACE FUNCTION "prevent_revenue_trading_profile_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'RevenueCycleTradingPartnerProfileVersion is append-only; create a new version'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "RevenueCycleTradingPartnerProfileVersion_no_update" ON "RevenueCycleTradingPartnerProfileVersion";
CREATE TRIGGER "RevenueCycleTradingPartnerProfileVersion_no_update" BEFORE UPDATE ON "RevenueCycleTradingPartnerProfileVersion"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_trading_profile_mutation"();
DROP TRIGGER IF EXISTS "RevenueCycleTradingPartnerProfileVersion_no_delete" ON "RevenueCycleTradingPartnerProfileVersion";
CREATE TRIGGER "RevenueCycleTradingPartnerProfileVersion_no_delete" BEFORE DELETE ON "RevenueCycleTradingPartnerProfileVersion"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_trading_profile_mutation"();

CREATE TABLE IF NOT EXISTS "RevenueCycleClaimSubmission" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "batchId" text NOT NULL REFERENCES "RevenueCycleBatch"("id") ON DELETE RESTRICT,
  "profileVersionId" text NOT NULL REFERENCES "RevenueCycleTradingPartnerProfileVersion"("id") ON DELETE RESTRICT,
  "submissionNumber" text NOT NULL,
  "environment" text NOT NULL,
  "claimFormat" text NOT NULL,
  "implementationVersion" text NOT NULL,
  "status" text NOT NULL DEFAULT 'GENERATED',
  "interchangeControlNumber" text NOT NULL,
  "groupControlNumber" text NOT NULL,
  "transactionSetControlNumber" text NOT NULL,
  "payloadSha256" text NOT NULL,
  "payload" text NOT NULL,
  "externalReference" text,
  "generatedByUserId" text NOT NULL,
  "generatedAt" timestamptz NOT NULL DEFAULT now(),
  "submittedAt" timestamptz,
  "resolvedAt" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleClaimSubmission_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "RevenueCycleClaimSubmission_environment_ck" CHECK ("environment" IN ('TEST','PRODUCTION')),
  CONSTRAINT "RevenueCycleClaimSubmission_format_ck" CHECK ("claimFormat" IN ('837P','837I')),
  CONSTRAINT "RevenueCycleClaimSubmission_status_ck" CHECK ("status" IN ('GENERATED','HANDED_OFF','ACK_ACCEPTED','ACK_REJECTED','PARTIAL','ADJUDICATED','RECONCILED','FAILED','CANCELLED')),
  CONSTRAINT "RevenueCycleClaimSubmission_number_key" UNIQUE("organizationId","legalEntityId","submissionNumber")
);
CREATE INDEX IF NOT EXISTS "RevenueCycleClaimSubmission_batch_idx"
  ON "RevenueCycleClaimSubmission"("organizationId","legalEntityId","batchId","generatedAt" DESC);
CREATE INDEX IF NOT EXISTS "RevenueCycleClaimSubmission_status_idx"
  ON "RevenueCycleClaimSubmission"("organizationId","legalEntityId","status","generatedAt" DESC);

CREATE TABLE IF NOT EXISTS "RevenueCycleClaimSubmissionLine" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "submissionId" text NOT NULL REFERENCES "RevenueCycleClaimSubmission"("id") ON DELETE RESTRICT,
  "serviceEventId" text NOT NULL REFERENCES "RevenueCycleServiceEvent"("id") ON DELETE RESTRICT,
  "claimControlNumber" text NOT NULL,
  "patientMemberId" text NOT NULL,
  "chargedAmount" numeric(14,2) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleClaimSubmissionLine_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "RevenueCycleClaimSubmissionLine_submission_claim_key" UNIQUE("submissionId","claimControlNumber"),
  CONSTRAINT "RevenueCycleClaimSubmissionLine_submission_event_key" UNIQUE("submissionId","serviceEventId")
);
CREATE INDEX IF NOT EXISTS "RevenueCycleClaimSubmissionLine_event_idx"
  ON "RevenueCycleClaimSubmissionLine"("organizationId","legalEntityId","serviceEventId");

CREATE TABLE IF NOT EXISTS "RevenueCycleClaimExchangeEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "submissionId" text NOT NULL REFERENCES "RevenueCycleClaimSubmission"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "status" text,
  "acknowledgementType" text,
  "externalReference" text,
  "rawPayload" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleClaimExchangeEvent_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "RevenueCycleClaimExchangeEvent_ack_ck" CHECK ("acknowledgementType" IS NULL OR "acknowledgementType" IN ('TA1','999','277CA','835','PORTAL_STATUS','CLEARINGHOUSE_STATUS','OTHER'))
);
CREATE INDEX IF NOT EXISTS "RevenueCycleClaimExchangeEvent_submission_idx"
  ON "RevenueCycleClaimExchangeEvent"("organizationId","legalEntityId","submissionId","createdAt");

CREATE OR REPLACE FUNCTION "prevent_revenue_claim_exchange_event_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'RevenueCycleClaimExchangeEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "RevenueCycleClaimExchangeEvent_no_update" ON "RevenueCycleClaimExchangeEvent";
CREATE TRIGGER "RevenueCycleClaimExchangeEvent_no_update" BEFORE UPDATE ON "RevenueCycleClaimExchangeEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_claim_exchange_event_mutation"();
DROP TRIGGER IF EXISTS "RevenueCycleClaimExchangeEvent_no_delete" ON "RevenueCycleClaimExchangeEvent";
CREATE TRIGGER "RevenueCycleClaimExchangeEvent_no_delete" BEFORE DELETE ON "RevenueCycleClaimExchangeEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_claim_exchange_event_mutation"();

CREATE TABLE IF NOT EXISTS "RevenueCycleRemittance" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "submissionId" text REFERENCES "RevenueCycleClaimSubmission"("id") ON DELETE RESTRICT,
  "traceNumber" text,
  "paymentDate" date,
  "totalPayment" numeric(14,2),
  "rawPayload" text NOT NULL,
  "parsed" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recordedByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleRemittance_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "RevenueCycleRemittance_submission_idx"
  ON "RevenueCycleRemittance"("organizationId","legalEntityId","submissionId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "RevenueCycleRemittanceLine" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "remittanceId" text NOT NULL REFERENCES "RevenueCycleRemittance"("id") ON DELETE RESTRICT,
  "submissionLineId" text REFERENCES "RevenueCycleClaimSubmissionLine"("id") ON DELETE RESTRICT,
  "serviceEventId" text REFERENCES "RevenueCycleServiceEvent"("id") ON DELETE RESTRICT,
  "claimControlNumber" text NOT NULL,
  "payerClaimControlNumber" text,
  "claimStatusCode" text,
  "billedAmount" numeric(14,2),
  "paidAmount" numeric(14,2),
  "patientResponsibility" numeric(14,2),
  "adjustments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleRemittanceLine_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "RevenueCycleRemittanceLine_event_idx"
  ON "RevenueCycleRemittanceLine"("organizationId","legalEntityId","serviceEventId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_revenue_remittance_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Revenue Cycle remittance evidence is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "RevenueCycleRemittance_no_update" ON "RevenueCycleRemittance";
CREATE TRIGGER "RevenueCycleRemittance_no_update" BEFORE UPDATE ON "RevenueCycleRemittance"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_remittance_mutation"();
DROP TRIGGER IF EXISTS "RevenueCycleRemittance_no_delete" ON "RevenueCycleRemittance";
CREATE TRIGGER "RevenueCycleRemittance_no_delete" BEFORE DELETE ON "RevenueCycleRemittance"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_remittance_mutation"();
DROP TRIGGER IF EXISTS "RevenueCycleRemittanceLine_no_update" ON "RevenueCycleRemittanceLine";
CREATE TRIGGER "RevenueCycleRemittanceLine_no_update" BEFORE UPDATE ON "RevenueCycleRemittanceLine"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_remittance_mutation"();
DROP TRIGGER IF EXISTS "RevenueCycleRemittanceLine_no_delete" ON "RevenueCycleRemittanceLine";
CREATE TRIGGER "RevenueCycleRemittanceLine_no_delete" BEFORE DELETE ON "RevenueCycleRemittanceLine"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_remittance_mutation"();

CREATE TABLE IF NOT EXISTS "RevenueCycleExternalWorkflow" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "workflowType" text NOT NULL,
  "subjectType" text NOT NULL,
  "subjectId" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "externalReference" text,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "verifiedAt" timestamptz,
  "verifiedByUserId" text,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleExternalWorkflow_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "RevenueCycleExternalWorkflow_type_ck" CHECK ("workflowType" IN ('PNM_PROVIDER_ENROLLMENT','DODD_EMBS_BILLING_ACCESS','TRADING_PARTNER_SETUP','CLEARINGHOUSE_SETUP')),
  CONSTRAINT "RevenueCycleExternalWorkflow_subject_ck" CHECK ("subjectType" IN ('LEGAL_ENTITY','BATCH','SUBMISSION')),
  CONSTRAINT "RevenueCycleExternalWorkflow_status_ck" CHECK ("status" IN ('OPEN','IN_PROGRESS','VERIFIED','REJECTED','CLOSED'))
);
CREATE INDEX IF NOT EXISTS "RevenueCycleExternalWorkflow_entity_idx"
  ON "RevenueCycleExternalWorkflow"("organizationId","legalEntityId","workflowType","status","updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "RevenueCycleExternalWorkflowEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "workflowId" text NOT NULL REFERENCES "RevenueCycleExternalWorkflow"("id") ON DELETE RESTRICT,
  "fromStatus" text,
  "toStatus" text NOT NULL,
  "externalReference" text,
  "note" text,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RevenueCycleExternalWorkflowEvent_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "RevenueCycleExternalWorkflowEvent_workflow_idx"
  ON "RevenueCycleExternalWorkflowEvent"("organizationId","legalEntityId","workflowId","createdAt");

CREATE OR REPLACE FUNCTION "prevent_revenue_external_workflow_event_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'RevenueCycleExternalWorkflowEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "RevenueCycleExternalWorkflowEvent_no_update" ON "RevenueCycleExternalWorkflowEvent";
CREATE TRIGGER "RevenueCycleExternalWorkflowEvent_no_update" BEFORE UPDATE ON "RevenueCycleExternalWorkflowEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_external_workflow_event_mutation"();
DROP TRIGGER IF EXISTS "RevenueCycleExternalWorkflowEvent_no_delete" ON "RevenueCycleExternalWorkflowEvent";
CREATE TRIGGER "RevenueCycleExternalWorkflowEvent_no_delete" BEFORE DELETE ON "RevenueCycleExternalWorkflowEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_revenue_external_workflow_event_mutation"();
