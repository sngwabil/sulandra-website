CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- SPIRE 1.1 / Step 3
-- OhioISP is modeled as a regulated layer over the existing SPIRE Care Plan / ISP
-- and SCLS Task Board. Existing care-plan goals/interventions and clinical tasks
-- remain the canonical workstation records; these tables retain OhioISP source,
-- assessment-domain, outcome, support, training and evidence provenance.

CREATE TABLE IF NOT EXISTS "SpireOhioIspPlan" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "carePlanId" text NOT NULL,
  "sourcePlanId" text,
  "sourcePlanVersion" text,
  "countyBoardName" text,
  "countyBoardIdentifier" text,
  "ssaName" text,
  "ssaContact" text,
  "effectiveStartDate" date,
  "effectiveEndDate" date,
  "annualReviewDate" date,
  "importantTo" text,
  "importantFor" text,
  "knownRisks" text,
  "skillsAndAbilities" text,
  "sourceMetadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" text NOT NULL,
  "updatedByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspPlan_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspPlan_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','SUPERSEDED','VOID')),
  CONSTRAINT "SpireOhioIspPlan_dates_check" CHECK (
    "effectiveEndDate" IS NULL OR "effectiveStartDate" IS NULL OR "effectiveEndDate">="effectiveStartDate"
  ),
  CONSTRAINT "SpireOhioIspPlan_care_plan_key" UNIQUE ("organizationId","legalEntityId","carePlanId")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspPlan_patient_idx"
  ON "SpireOhioIspPlan"("organizationId","legalEntityId","patientId","updatedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireOhioIspPlan_source_key"
  ON "SpireOhioIspPlan"("organizationId","legalEntityId","sourcePlanId","sourcePlanVersion")
  WHERE "sourcePlanId" IS NOT NULL AND "sourcePlanVersion" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "SpireOhioIspAssessmentDomain" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "domainCode" text NOT NULL,
  "summary" text,
  "strengths" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "needs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "risks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "preferences" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "assessmentData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'IN_PROGRESS',
  "reviewedByUserId" text,
  "reviewedAt" timestamptz,
  "updatedByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspAssessmentDomain_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspAssessmentDomain_code_check" CHECK ("domainCode" IN (
    'COMMUNICATION','ADVOCACY_ENGAGEMENT','SAFETY_SECURITY','SOCIAL_SPIRITUALITY',
    'DAILY_LIFE_EMPLOYMENT','COMMUNITY_LIVING','HEALTHY_LIVING'
  )),
  CONSTRAINT "SpireOhioIspAssessmentDomain_status_check" CHECK ("status" IN ('IN_PROGRESS','COMPLETE','NOT_APPLICABLE')),
  CONSTRAINT "SpireOhioIspAssessmentDomain_key" UNIQUE ("ohioIspPlanId","domainCode")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspAssessmentDomain_patient_idx"
  ON "SpireOhioIspAssessmentDomain"("organizationId","legalEntityId","patientId","domainCode");

CREATE TABLE IF NOT EXISTS "SpireOhioIspOutcome" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "carePlanGoalId" text NOT NULL,
  "sequence" integer NOT NULL DEFAULT 1,
  "title" text NOT NULL,
  "outcomeStatement" text NOT NULL,
  "detailsToKnow" text,
  "measurementMethod" text,
  "reviewFrequency" text,
  "status" text NOT NULL DEFAULT 'IN_PROGRESS',
  "createdByUserId" text NOT NULL,
  "updatedByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspOutcome_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspOutcome_status_check" CHECK ("status" IN ('IN_PROGRESS','ACHIEVED','DISCONTINUED')),
  CONSTRAINT "SpireOhioIspOutcome_goal_key" UNIQUE ("ohioIspPlanId","carePlanGoalId")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspOutcome_patient_idx"
  ON "SpireOhioIspOutcome"("organizationId","legalEntityId","patientId","status","sequence");

CREATE TABLE IF NOT EXISTS "SpireOhioIspSupport" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "outcomeId" text REFERENCES "SpireOhioIspOutcome"("id") ON DELETE RESTRICT,
  "carePlanInterventionId" text NOT NULL,
  "authorizationId" text,
  "serviceCode" text,
  "serviceType" text,
  "providerName" text,
  "providerIdentifier" text,
  "fundingSource" text,
  "title" text NOT NULL,
  "scope" text NOT NULL,
  "instructions" text NOT NULL,
  "frequency" text,
  "amount" numeric,
  "amountUnit" text,
  "schedule" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "beginsOn" date,
  "endsOn" date,
  "responsibleRole" text,
  "taskGenerationMode" text NOT NULL DEFAULT 'ON_DEMAND',
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" text NOT NULL,
  "updatedByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspSupport_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspSupport_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE','DISCONTINUED')),
  CONSTRAINT "SpireOhioIspSupport_task_mode_check" CHECK ("taskGenerationMode" IN ('NONE','ON_DEMAND','SCHEDULED')),
  CONSTRAINT "SpireOhioIspSupport_priority_check" CHECK ("priority" IN ('ROUTINE','HIGH','URGENT')),
  CONSTRAINT "SpireOhioIspSupport_dates_check" CHECK ("endsOn" IS NULL OR "beginsOn" IS NULL OR "endsOn">="beginsOn"),
  CONSTRAINT "SpireOhioIspSupport_intervention_key" UNIQUE ("ohioIspPlanId","carePlanInterventionId")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspSupport_patient_idx"
  ON "SpireOhioIspSupport"("organizationId","legalEntityId","patientId","status","beginsOn");
CREATE INDEX IF NOT EXISTS "SpireOhioIspSupport_outcome_idx"
  ON "SpireOhioIspSupport"("ohioIspPlanId","outcomeId","status");

CREATE TABLE IF NOT EXISTS "SpireOhioIspSupportTaskBinding" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "supportId" text NOT NULL REFERENCES "SpireOhioIspSupport"("id") ON DELETE RESTRICT,
  "taskId" text NOT NULL REFERENCES "SpireClinicalTask"("id") ON DELETE RESTRICT,
  "generationKey" text NOT NULL,
  "sourcePlanVersion" text,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspSupportTaskBinding_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspSupportTaskBinding_task_key" UNIQUE ("supportId","taskId"),
  CONSTRAINT "SpireOhioIspSupportTaskBinding_generation_key" UNIQUE ("supportId","generationKey")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspSupportTaskBinding_patient_idx"
  ON "SpireOhioIspSupportTaskBinding"("organizationId","legalEntityId","patientId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireOhioIspStaffAcknowledgment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "userId" text NOT NULL,
  "planVersion" text NOT NULL,
  "attestation" text NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "acknowledgedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspStaffAcknowledgment_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspStaffAcknowledgment_key" UNIQUE ("ohioIspPlanId","userId","planVersion")
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspStaffAcknowledgment_patient_idx"
  ON "SpireOhioIspStaffAcknowledgment"("organizationId","legalEntityId","patientId","acknowledgedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireOhioIspEvidenceLink" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "outcomeId" text REFERENCES "SpireOhioIspOutcome"("id") ON DELETE RESTRICT,
  "supportId" text REFERENCES "SpireOhioIspSupport"("id") ON DELETE RESTRICT,
  "serviceDocumentId" text,
  "goalProgressEntryId" text,
  "taskId" text,
  "evidenceType" text NOT NULL,
  "note" text,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspEvidenceLink_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireOhioIspEvidenceLink_target_check" CHECK ("outcomeId" IS NOT NULL OR "supportId" IS NOT NULL),
  CONSTRAINT "SpireOhioIspEvidenceLink_source_check" CHECK (
    "serviceDocumentId" IS NOT NULL OR "goalProgressEntryId" IS NOT NULL OR "taskId" IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspEvidenceLink_patient_idx"
  ON "SpireOhioIspEvidenceLink"("organizationId","legalEntityId","patientId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireOhioIspEvidenceLink_outcome_idx" ON "SpireOhioIspEvidenceLink"("outcomeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireOhioIspEvidenceLink_support_idx" ON "SpireOhioIspEvidenceLink"("supportId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireOhioIspEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "ohioIspPlanId" text NOT NULL REFERENCES "SpireOhioIspPlan"("id") ON DELETE RESTRICT,
  "resourceType" text NOT NULL,
  "resourceId" text NOT NULL,
  "eventType" text NOT NULL,
  "actorUserId" text NOT NULL,
  "actorEmail" text,
  "reason" text,
  "beforeValue" jsonb,
  "afterValue" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOhioIspEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "SpireOhioIspEvent_plan_idx"
  ON "SpireOhioIspEvent"("organizationId","legalEntityId","ohioIspPlanId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireOhioIspEvent_resource_idx"
  ON "SpireOhioIspEvent"("resourceType","resourceId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "touch_spire_ohio_isp_updated_at"()
RETURNS trigger AS $$ BEGIN NEW."updatedAt"=now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireOhioIspPlan_touch" ON "SpireOhioIspPlan";
CREATE TRIGGER "SpireOhioIspPlan_touch" BEFORE UPDATE ON "SpireOhioIspPlan"
FOR EACH ROW EXECUTE FUNCTION "touch_spire_ohio_isp_updated_at"();
DROP TRIGGER IF EXISTS "SpireOhioIspAssessmentDomain_touch" ON "SpireOhioIspAssessmentDomain";
CREATE TRIGGER "SpireOhioIspAssessmentDomain_touch" BEFORE UPDATE ON "SpireOhioIspAssessmentDomain"
FOR EACH ROW EXECUTE FUNCTION "touch_spire_ohio_isp_updated_at"();
DROP TRIGGER IF EXISTS "SpireOhioIspOutcome_touch" ON "SpireOhioIspOutcome";
CREATE TRIGGER "SpireOhioIspOutcome_touch" BEFORE UPDATE ON "SpireOhioIspOutcome"
FOR EACH ROW EXECUTE FUNCTION "touch_spire_ohio_isp_updated_at"();
DROP TRIGGER IF EXISTS "SpireOhioIspSupport_touch" ON "SpireOhioIspSupport";
CREATE TRIGGER "SpireOhioIspSupport_touch" BEFORE UPDATE ON "SpireOhioIspSupport"
FOR EACH ROW EXECUTE FUNCTION "touch_spire_ohio_isp_updated_at"();

CREATE OR REPLACE FUNCTION "prevent_spire_ohio_isp_append_only_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireOhioIspEvent_no_update" ON "SpireOhioIspEvent";
CREATE TRIGGER "SpireOhioIspEvent_no_update" BEFORE UPDATE ON "SpireOhioIspEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_append_only_mutation"();
DROP TRIGGER IF EXISTS "SpireOhioIspEvent_no_delete" ON "SpireOhioIspEvent";
CREATE TRIGGER "SpireOhioIspEvent_no_delete" BEFORE DELETE ON "SpireOhioIspEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_append_only_mutation"();

DROP TRIGGER IF EXISTS "SpireOhioIspStaffAcknowledgment_no_update" ON "SpireOhioIspStaffAcknowledgment";
CREATE TRIGGER "SpireOhioIspStaffAcknowledgment_no_update" BEFORE UPDATE ON "SpireOhioIspStaffAcknowledgment"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_append_only_mutation"();
DROP TRIGGER IF EXISTS "SpireOhioIspStaffAcknowledgment_no_delete" ON "SpireOhioIspStaffAcknowledgment";
CREATE TRIGGER "SpireOhioIspStaffAcknowledgment_no_delete" BEFORE DELETE ON "SpireOhioIspStaffAcknowledgment"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_append_only_mutation"();

DROP TRIGGER IF EXISTS "SpireOhioIspEvidenceLink_no_update" ON "SpireOhioIspEvidenceLink";
CREATE TRIGGER "SpireOhioIspEvidenceLink_no_update" BEFORE UPDATE ON "SpireOhioIspEvidenceLink"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_append_only_mutation"();
DROP TRIGGER IF EXISTS "SpireOhioIspEvidenceLink_no_delete" ON "SpireOhioIspEvidenceLink";
CREATE TRIGGER "SpireOhioIspEvidenceLink_no_delete" BEFORE DELETE ON "SpireOhioIspEvidenceLink"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_append_only_mutation"();

DROP TRIGGER IF EXISTS "SpireOhioIspSupportTaskBinding_no_update" ON "SpireOhioIspSupportTaskBinding";
CREATE TRIGGER "SpireOhioIspSupportTaskBinding_no_update" BEFORE UPDATE ON "SpireOhioIspSupportTaskBinding"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_append_only_mutation"();
DROP TRIGGER IF EXISTS "SpireOhioIspSupportTaskBinding_no_delete" ON "SpireOhioIspSupportTaskBinding";
CREATE TRIGGER "SpireOhioIspSupportTaskBinding_no_delete" BEFORE DELETE ON "SpireOhioIspSupportTaskBinding"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_ohio_isp_append_only_mutation"();
