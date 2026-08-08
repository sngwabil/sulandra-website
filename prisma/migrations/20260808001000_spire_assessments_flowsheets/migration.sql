CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Spire structured clinical assessments and longitudinal flowsheets.
ALTER TABLE "SpireAssessmentTemplate" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "SpireAssessmentTemplate" ADD COLUMN IF NOT EXISTS "discipline" text;
ALTER TABLE "SpireAssessmentTemplate" ADD COLUMN IF NOT EXISTS "scoringMethod" text NOT NULL DEFAULT 'NONE';
ALTER TABLE "SpireAssessmentTemplate" ADD COLUMN IF NOT EXISTS "reassessmentIntervalHours" integer;
ALTER TABLE "SpireAssessmentTemplate" ADD COLUMN IF NOT EXISTS "requiresSignature" boolean NOT NULL DEFAULT true;
ALTER TABLE "SpireAssessmentTemplate" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;
ALTER TABLE "SpireAssessmentTemplate" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "encounterId" text;
ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "score" numeric;
ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "scoreBand" text;
ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "startedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "dueAt" timestamptz;
ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "signedAt" timestamptz;
ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "signedById" text;
ALTER TABLE "SpireAssessmentResponse" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS "SpireAssessmentResponse_patient_status_idx" ON "SpireAssessmentResponse"("organizationId","patientId","status","completedAt");

CREATE TABLE IF NOT EXISTS "SpireAssessmentQuestion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "templateId" text NOT NULL REFERENCES "SpireAssessmentTemplate"("id") ON DELETE CASCADE,
  "section" text,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "helpText" text,
  "responseType" text NOT NULL DEFAULT 'TEXT',
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "required" boolean NOT NULL DEFAULT false,
  "scoreMap" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("templateId","code")
);
CREATE INDEX IF NOT EXISTS "SpireAssessmentQuestion_template_idx" ON "SpireAssessmentQuestion"("organizationId","templateId","sortOrder");

CREATE TABLE IF NOT EXISTS "SpireAssessmentAnswer" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "responseId" text NOT NULL REFERENCES "SpireAssessmentResponse"("id") ON DELETE CASCADE,
  "questionId" text NOT NULL REFERENCES "SpireAssessmentQuestion"("id") ON DELETE RESTRICT,
  "valueText" text,
  "valueNumber" numeric,
  "valueBoolean" boolean,
  "valueJson" jsonb,
  "score" numeric,
  "comment" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("responseId","questionId")
);
CREATE INDEX IF NOT EXISTS "SpireAssessmentAnswer_response_idx" ON "SpireAssessmentAnswer"("organizationId","patientId","responseId");

CREATE TABLE IF NOT EXISTS "SpireAssessmentSignature" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "responseId" text NOT NULL REFERENCES "SpireAssessmentResponse"("id") ON DELETE CASCADE,
  "signerUserId" text,
  "signerName" text NOT NULL,
  "signerRole" text,
  "attestation" text,
  "signedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text
);
CREATE INDEX IF NOT EXISTS "SpireAssessmentSignature_response_idx" ON "SpireAssessmentSignature"("organizationId","patientId","responseId");

ALTER TABLE "SpireFlowsheetRow" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "SpireFlowsheetRow" ADD COLUMN IF NOT EXISTS "normalLow" numeric;
ALTER TABLE "SpireFlowsheetRow" ADD COLUMN IF NOT EXISTS "normalHigh" numeric;
ALTER TABLE "SpireFlowsheetRow" ADD COLUMN IF NOT EXISTS "criticalLow" numeric;
ALTER TABLE "SpireFlowsheetRow" ADD COLUMN IF NOT EXISTS "criticalHigh" numeric;
ALTER TABLE "SpireFlowsheetRow" ADD COLUMN IF NOT EXISTS "options" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "SpireFlowsheetRow" ADD COLUMN IF NOT EXISTS "sortOrder" integer NOT NULL DEFAULT 0;
ALTER TABLE "SpireFlowsheetRow" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();

ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "abnormalFlag" text;
ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "SpireFlowsheetEntry" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS "SpireFlowsheetEntry_patient_recorded_idx" ON "SpireFlowsheetEntry"("organizationId","patientId","recordedAt");

CREATE TABLE IF NOT EXISTS "SpireFlowsheetTemplate" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "discipline" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireFlowsheetTemplate_org_category_idx" ON "SpireFlowsheetTemplate"("organizationId","category","active");

CREATE TABLE IF NOT EXISTS "SpireFlowsheetTemplateRow" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "templateId" text NOT NULL REFERENCES "SpireFlowsheetTemplate"("id") ON DELETE CASCADE,
  "rowId" text NOT NULL REFERENCES "SpireFlowsheetRow"("id") ON DELETE CASCADE,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "required" boolean NOT NULL DEFAULT false,
  UNIQUE("templateId","rowId")
);

CREATE TABLE IF NOT EXISTS "SpireClinicalReassessmentDue" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "assessmentTemplateId" text REFERENCES "SpireAssessmentTemplate"("id") ON DELETE CASCADE,
  "assessmentResponseId" text REFERENCES "SpireAssessmentResponse"("id") ON DELETE SET NULL,
  "reason" text NOT NULL,
  "dueAt" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "assignedToUserId" text,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireClinicalReassessmentDue_patient_idx" ON "SpireClinicalReassessmentDue"("organizationId","patientId","status","dueAt");

-- Seed standard assessment templates once per organization when templates are later created via API.
