-- SPIRE 1.1 Phase B / Step 2
-- Date-effective Ohio DODD billing-rule configuration + immutable validation evidence.
-- System seed rules intentionally encode only verified structural requirements. Dollar
-- rates remain separately configurable/versioned because DODD rates vary by effective
-- date, provider type, county cost-of-doing-business category and approved modifiers.

CREATE TABLE IF NOT EXISTS "SpireDoddBillingRuleVersion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text,
  "legalEntityId" text,
  "scope" text NOT NULL DEFAULT 'SYSTEM',
  "ruleCode" text NOT NULL,
  "version" integer NOT NULL,
  "name" text NOT NULL,
  "serviceFamily" text NOT NULL,
  "serviceCode" text,
  "effectiveFrom" date NOT NULL,
  "effectiveTo" date,
  "priority" integer NOT NULL DEFAULT 0,
  "unitMethod" text NOT NULL DEFAULT 'CONFIGURED',
  "requiresAuthorization" boolean NOT NULL DEFAULT true,
  "requiresSignedServiceDocument" boolean NOT NULL DEFAULT true,
  "requiresEvv" boolean NOT NULL DEFAULT false,
  "requiresGroupSize" boolean NOT NULL DEFAULT false,
  "ruleConfig" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "authority" text NOT NULL,
  "authorityUrl" text,
  "reviewedOn" date NOT NULL,
  "createdByUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireDoddBillingRuleVersion_scope_ck" CHECK ("scope" IN ('SYSTEM','ENTITY')),
  CONSTRAINT "SpireDoddBillingRuleVersion_entity_scope_ck" CHECK (
    ("scope"='SYSTEM' AND "organizationId" IS NULL AND "legalEntityId" IS NULL)
    OR ("scope"='ENTITY' AND "organizationId" IS NOT NULL AND "legalEntityId" IS NOT NULL)
  ),
  CONSTRAINT "SpireDoddBillingRuleVersion_dates_ck" CHECK ("effectiveTo" IS NULL OR "effectiveTo">="effectiveFrom"),
  CONSTRAINT "SpireDoddBillingRuleVersion_version_ck" CHECK ("version">0),
  CONSTRAINT "SpireDoddBillingRuleVersion_scope_version_key" UNIQUE(
    "scope","organizationId","legalEntityId","ruleCode","version"
  )
);
CREATE INDEX IF NOT EXISTS "SpireDoddBillingRuleVersion_effective_idx"
  ON "SpireDoddBillingRuleVersion"("serviceFamily","serviceCode","effectiveFrom","effectiveTo","priority" DESC);
CREATE INDEX IF NOT EXISTS "SpireDoddBillingRuleVersion_entity_idx"
  ON "SpireDoddBillingRuleVersion"("organizationId","legalEntityId","effectiveFrom" DESC)
  WHERE "scope"='ENTITY';

CREATE TABLE IF NOT EXISTS "SpireDoddBillingValidationDecision" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "serviceEventId" text NOT NULL REFERENCES "RevenueCycleServiceEvent"("id") ON DELETE RESTRICT,
  "ruleVersionId" text REFERENCES "SpireDoddBillingRuleVersion"("id") ON DELETE RESTRICT,
  "action" text NOT NULL,
  "required" boolean NOT NULL,
  "ready" boolean NOT NULL,
  "decisionCode" text NOT NULL,
  "blockers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actorUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireDoddBillingValidationDecision_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireDoddBillingValidationDecision_action_ck" CHECK ("action" IN ('READY','BATCH')),
  CONSTRAINT "SpireDoddBillingValidationDecision_code_ck" CHECK ("decisionCode" IN ('NOT_REQUIRED','PASS','BLOCK'))
);
CREATE INDEX IF NOT EXISTS "SpireDoddBillingValidationDecision_event_idx"
  ON "SpireDoddBillingValidationDecision"("organizationId","legalEntityId","serviceEventId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireDoddBillingValidationDecision_block_idx"
  ON "SpireDoddBillingValidationDecision"("organizationId","legalEntityId","ready","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_spire_dodd_billing_rule_version_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'SpireDoddBillingRuleVersion is append-only; create a new date-effective version'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireDoddBillingRuleVersion_no_update" ON "SpireDoddBillingRuleVersion";
CREATE TRIGGER "SpireDoddBillingRuleVersion_no_update" BEFORE UPDATE ON "SpireDoddBillingRuleVersion"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_dodd_billing_rule_version_mutation"();
DROP TRIGGER IF EXISTS "SpireDoddBillingRuleVersion_no_delete" ON "SpireDoddBillingRuleVersion";
CREATE TRIGGER "SpireDoddBillingRuleVersion_no_delete" BEFORE DELETE ON "SpireDoddBillingRuleVersion"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_dodd_billing_rule_version_mutation"();

CREATE OR REPLACE FUNCTION "prevent_spire_dodd_billing_decision_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'SpireDoddBillingValidationDecision is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireDoddBillingValidationDecision_no_update" ON "SpireDoddBillingValidationDecision";
CREATE TRIGGER "SpireDoddBillingValidationDecision_no_update" BEFORE UPDATE ON "SpireDoddBillingValidationDecision"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_dodd_billing_decision_mutation"();
DROP TRIGGER IF EXISTS "SpireDoddBillingValidationDecision_no_delete" ON "SpireDoddBillingValidationDecision";
CREATE TRIGGER "SpireDoddBillingValidationDecision_no_delete" BEFORE DELETE ON "SpireDoddBillingValidationDecision"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_dodd_billing_decision_mutation"();

-- Generic DODD Medicaid validation applies when a more specific family rule is not available.
INSERT INTO "SpireDoddBillingRuleVersion"(
  "id","scope","ruleCode","version","name","serviceFamily","effectiveFrom","priority","unitMethod",
  "requiresAuthorization","requiresSignedServiceDocument","requiresEvv","requiresGroupSize","ruleConfig",
  "authority","authorityUrl","reviewedOn"
) VALUES (
  'system-dodd-medicaid-generic-v1','SYSTEM','DODD_MEDICAID_GENERIC',1,
  'Ohio DODD Medicaid service — authorization and signed service-document gate','*','2024-01-01',10,'CONFIGURED',
  true,true,false,false,
  '{"requireServiceCodeMatch":true,"requireServiceDateMatch":true,"requireAuthorizationDateCoverage":true,"requireAuthorizationUnits":true,"rateValidationMode":"CONFIG_ONLY"}'::jsonb,
  'Applicable DODD service rule and OAC 5123-9-40 payment/service-documentation requirements',
  'https://codes.ohio.gov/ohio-administrative-code/chapter-5123-9','2026-08-17'
) ON CONFLICT DO NOTHING;

-- OAC 5123-9-30 uses the same structural HPC rules across 2024, but the rule explicitly
-- switches its referenced payment schedule from Appendix A to Appendix B on 2024-07-01.
-- Keeping separate immutable versions makes that boundary auditable without hard-coding
-- a permanent dollar rate into application logic.
INSERT INTO "SpireDoddBillingRuleVersion"(
  "id","scope","ruleCode","version","name","serviceFamily","effectiveFrom","effectiveTo","priority","unitMethod",
  "requiresAuthorization","requiresSignedServiceDocument","requiresEvv","requiresGroupSize","ruleConfig",
  "authority","authorityUrl","reviewedOn"
) VALUES
(
  'system-dodd-hpc-5123-9-30-v1','SYSTEM','DODD_HPC_5123_9_30',1,
  'Homemaker/Personal Care — Appendix A schedule','HOMEMAKER_PERSONAL_CARE','2024-01-01','2024-06-30',100,'FIFTEEN_MINUTE_DAILY_AGGREGATE',
  true,true,true,true,
  '{
    "documentationProfiles":["HPC_5123_9_30","PD_HPC_5123_9_32"],
    "serviceNamePatterns":["homemaker","personal care","hpc"],
    "minuteRounding":{"unitMinutes":15,"minimumRemainderMinutes":8,"aggregateBy":"PATIENT_SERVICE_DATE"},
    "prohibitedConcurrentServicePatterns":["adult day support","group employment support","individual employment support","vocational habilitation","residential respite"],
    "nmtPerTripOverlap":"REVIEW",
    "groupRateFactors":{"1":1.00,"2":1.07,"3":1.17,"4+":1.30,"divideByIndividuals":true},
    "rateScheduleRef":"APPENDIX_A_5123_9_30",
    "rateValidationMode":"CONFIG_ONLY",
    "allowedModifiers":[]
  }'::jsonb,
  'Ohio Administrative Code 5123-9-30','https://codes.ohio.gov/ohio-administrative-code/rule-5123-9-30','2026-08-17'
),
(
  'system-dodd-hpc-5123-9-30-v2','SYSTEM','DODD_HPC_5123_9_30',2,
  'Homemaker/Personal Care — Appendix B schedule','HOMEMAKER_PERSONAL_CARE','2024-07-01',NULL,100,'FIFTEEN_MINUTE_DAILY_AGGREGATE',
  true,true,true,true,
  '{
    "documentationProfiles":["HPC_5123_9_30","PD_HPC_5123_9_32"],
    "serviceNamePatterns":["homemaker","personal care","hpc"],
    "minuteRounding":{"unitMinutes":15,"minimumRemainderMinutes":8,"aggregateBy":"PATIENT_SERVICE_DATE"},
    "prohibitedConcurrentServicePatterns":["adult day support","group employment support","individual employment support","vocational habilitation","residential respite"],
    "nmtPerTripOverlap":"REVIEW",
    "groupRateFactors":{"1":1.00,"2":1.07,"3":1.17,"4+":1.30,"divideByIndividuals":true},
    "rateScheduleRef":"APPENDIX_B_5123_9_30",
    "rateValidationMode":"CONFIG_ONLY",
    "allowedModifiers":[]
  }'::jsonb,
  'Ohio Administrative Code 5123-9-30','https://codes.ohio.gov/ohio-administrative-code/rule-5123-9-30','2026-08-17'
)
ON CONFLICT DO NOTHING;
