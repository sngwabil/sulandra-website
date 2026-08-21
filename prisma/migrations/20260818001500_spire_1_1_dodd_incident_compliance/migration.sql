-- SPIRE 1.1 Phase C Step 1
-- Ohio DODD MUI/UI compliance companion schema for the existing SpireIncident workflow.
-- Authority: Ohio Administrative Code 5123-17-02, effective 2025-07-01.

CREATE TABLE IF NOT EXISTS "SpireIncidentRegulatoryProfileVersion" (
  "id" text PRIMARY KEY,
  "profileCode" text NOT NULL,
  "version" integer NOT NULL,
  "name" text NOT NULL,
  "effectiveFrom" date NOT NULL,
  "effectiveTo" date,
  "timezone" text NOT NULL DEFAULT 'America/New_York',
  "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "authority" text NOT NULL,
  "authorityUrl" text NOT NULL,
  "reviewedOn" date NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireIncidentRegulatoryProfileVersion_dates_ck" CHECK ("effectiveTo" IS NULL OR "effectiveTo">="effectiveFrom"),
  CONSTRAINT "SpireIncidentRegulatoryProfileVersion_version_ck" CHECK ("version">0),
  CONSTRAINT "SpireIncidentRegulatoryProfileVersion_code_version_key" UNIQUE("profileCode","version")
);

CREATE TABLE IF NOT EXISTS "SpireIncidentRegulatoryCase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE RESTRICT,
  "profileVersionId" text NOT NULL REFERENCES "SpireIncidentRegulatoryProfileVersion"("id") ON DELETE RESTRICT,
  "classification" text NOT NULL DEFAULT 'PENDING',
  "muiCategory" text,
  "muiType" text,
  "discoveredAt" timestamptz NOT NULL,
  "providerAwareAt" timestamptz NOT NULL,
  "countyName" text,
  "programName" text,
  "residenceName" text,
  "primaryPersonInvolved" text,
  "immediateHealthWelfareActions" text,
  "causesContributingFactors" text,
  "preventionPlan" text,
  "classificationReason" text,
  "oitmsReference" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "classifiedByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireIncidentRegulatoryCase_classification_ck" CHECK ("classification" IN ('PENDING','UI','MUI','NON_REPORTABLE')),
  CONSTRAINT "SpireIncidentRegulatoryCase_category_ck" CHECK ("muiCategory" IS NULL OR "muiCategory" IN ('A','B','C')),
  CONSTRAINT "SpireIncidentRegulatoryCase_status_ck" CHECK ("status" IN ('ACTIVE','CLOSED')),
  CONSTRAINT "SpireIncidentRegulatoryCase_incident_key" UNIQUE("organizationId","legalEntityId","incidentId")
);
CREATE INDEX IF NOT EXISTS "SpireIncidentRegulatoryCase_patient_idx" ON "SpireIncidentRegulatoryCase"("organizationId","legalEntityId","patientId","classification","discoveredAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireIncidentRegulatoryCase_trend_idx" ON "SpireIncidentRegulatoryCase"("organizationId","legalEntityId","countyName","classification","muiType","discoveredAt");

CREATE TABLE IF NOT EXISTS "SpireIncidentRegulatoryDeadline" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE RESTRICT,
  "regulatoryCaseId" text NOT NULL REFERENCES "SpireIncidentRegulatoryCase"("id") ON DELETE RESTRICT,
  "deadlineType" text NOT NULL,
  "required" boolean NOT NULL DEFAULT true,
  "dueAt" timestamptz,
  "status" text NOT NULL DEFAULT 'PENDING',
  "satisfiedAt" timestamptz,
  "evidenceType" text,
  "evidenceId" text,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireIncidentRegulatoryDeadline_type_ck" CHECK ("deadlineType" IN ('MUI_FOUR_HOUR_COUNTY_BOARD','MUI_INCIDENT_REPORT_FIRST_WORKDAY_3PM','MUI_SAME_DAY_NOTIFICATION','MUI_CATEGORY_C_ADMIN_REVIEW_FORM','UI_EMPLOYEE_REPORT_24_HOUR')),
  CONSTRAINT "SpireIncidentRegulatoryDeadline_status_ck" CHECK ("status" IN ('PENDING','SATISFIED','OVERDUE','NOT_APPLICABLE','WAIVED')),
  CONSTRAINT "SpireIncidentRegulatoryDeadline_case_type_key" UNIQUE("organizationId","legalEntityId","regulatoryCaseId","deadlineType")
);
CREATE INDEX IF NOT EXISTS "SpireIncidentRegulatoryDeadline_due_idx" ON "SpireIncidentRegulatoryDeadline"("organizationId","legalEntityId","status","dueAt");

CREATE TABLE IF NOT EXISTS "SpireIncidentRegulatoryEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE RESTRICT,
  "regulatoryCaseId" text NOT NULL REFERENCES "SpireIncidentRegulatoryCase"("id") ON DELETE RESTRICT,
  "eventType" text NOT NULL,
  "beforeValue" jsonb,
  "afterValue" jsonb,
  "reason" text,
  "actorUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireIncidentRegulatoryEvent_case_idx" ON "SpireIncidentRegulatoryEvent"("organizationId","legalEntityId","regulatoryCaseId","createdAt");

CREATE TABLE IF NOT EXISTS "SpireIncidentWorkingDayException" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "exceptionDate" date NOT NULL,
  "label" text NOT NULL,
  "source" text NOT NULL DEFAULT 'APPOINTED_HOLIDAY',
  "createdByUserId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireIncidentWorkingDayException_unique" ON "SpireIncidentWorkingDayException"("organizationId",COALESCE("legalEntityId",''),"exceptionDate","source");

CREATE TABLE IF NOT EXISTS "SpireIncidentUiMonthlyReview" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "monthStart" date NOT NULL,
  "uiCount" integer NOT NULL DEFAULT 0,
  "zeroIncidentMonth" boolean NOT NULL DEFAULT false,
  "reviewedAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedByUserId" text NOT NULL,
  "findings" text,
  "preventionPlanReview" text,
  "trendNotes" text,
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireIncidentUiMonthlyReview_month_ck" CHECK (date_trunc('month',"monthStart")::date="monthStart"),
  CONSTRAINT "SpireIncidentUiMonthlyReview_zero_ck" CHECK (NOT "zeroIncidentMonth" OR "uiCount"=0)
);
CREATE INDEX IF NOT EXISTS "SpireIncidentUiMonthlyReview_month_idx" ON "SpireIncidentUiMonthlyReview"("organizationId","legalEntityId","monthStart","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireIncidentMuiAnnualTrendReport" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "reportYear" integer NOT NULL,
  "countyName" text NOT NULL,
  "version" integer NOT NULL,
  "reviewedAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedByUserId" text NOT NULL,
  "comparisonPreviousThreeYears" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "categoryBreakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "individualTrendFlags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "residenceRegionProgramTrends" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "previouslyIdentifiedTrends" text,
  "explanation" text,
  "actionAndPreventionPlans" text,
  "sentToCountyBoardAt" timestamptz,
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireIncidentMuiAnnualTrendReport_year_ck" CHECK ("reportYear" BETWEEN 2000 AND 2200),
  CONSTRAINT "SpireIncidentMuiAnnualTrendReport_version_ck" CHECK ("version">0),
  CONSTRAINT "SpireIncidentMuiAnnualTrendReport_version_key" UNIQUE("organizationId","legalEntityId","reportYear","countyName","version")
);
CREATE INDEX IF NOT EXISTS "SpireIncidentMuiAnnualTrendReport_year_idx" ON "SpireIncidentMuiAnnualTrendReport"("organizationId","legalEntityId","reportYear","countyName","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_spire_incident_regulatory_append_only_mutation"() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'SPIRE incident regulatory evidence is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireIncidentRegulatoryProfileVersion_no_mutation" ON "SpireIncidentRegulatoryProfileVersion";
CREATE TRIGGER "SpireIncidentRegulatoryProfileVersion_no_mutation" BEFORE UPDATE OR DELETE ON "SpireIncidentRegulatoryProfileVersion" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_incident_regulatory_append_only_mutation"();
DROP TRIGGER IF EXISTS "SpireIncidentRegulatoryEvent_no_mutation" ON "SpireIncidentRegulatoryEvent";
CREATE TRIGGER "SpireIncidentRegulatoryEvent_no_mutation" BEFORE UPDATE OR DELETE ON "SpireIncidentRegulatoryEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_incident_regulatory_append_only_mutation"();
DROP TRIGGER IF EXISTS "SpireIncidentUiMonthlyReview_no_mutation" ON "SpireIncidentUiMonthlyReview";
CREATE TRIGGER "SpireIncidentUiMonthlyReview_no_mutation" BEFORE UPDATE OR DELETE ON "SpireIncidentUiMonthlyReview" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_incident_regulatory_append_only_mutation"();
DROP TRIGGER IF EXISTS "SpireIncidentMuiAnnualTrendReport_no_mutation" ON "SpireIncidentMuiAnnualTrendReport";
CREATE TRIGGER "SpireIncidentMuiAnnualTrendReport_no_mutation" BEFORE UPDATE OR DELETE ON "SpireIncidentMuiAnnualTrendReport" FOR EACH ROW EXECUTE FUNCTION "prevent_spire_incident_regulatory_append_only_mutation"();

INSERT INTO "SpireIncidentRegulatoryProfileVersion"("id","profileCode","version","name","effectiveFrom","timezone","configuration","authority","authorityUrl","reviewedOn") VALUES (
  'system-oh-dodd-mui-ui-2025-v1',
  'OH_DODD_MUI_UI',
  1,
  'Ohio DODD MUI/UI reporting and quality review',
  '2025-07-01',
  'America/New_York',
  '{
    "muiCategories": {
      "A": ["EMOTIONAL_ABUSE","EXPLOITATION","FAILURE_TO_REPORT","MISAPPROPRIATION","NEGLECT","PHYSICAL_ABUSE","PROHIBITED_SEXUAL_RELATIONS","RIGHTS_CODE_VIOLATION","SEXUAL_ABUSE","UNEXPLAINED_OR_UNANTICIPATED_DEATH"],
      "B": ["ATTEMPTED_SUICIDE","DEATH_OTHER_THAN_UNEXPLAINED_OR_UNANTICIPATED","MEDICAL_EMERGENCY","MISSING_INDIVIDUAL","PEER_TO_PEER_ACT","SIGNIFICANT_INJURY"],
      "C": ["LAW_ENFORCEMENT","UNANTICIPATED_HOSPITALIZATION","UNAPPROVED_BEHAVIORAL_SUPPORT"]
    },
    "fourHourCountyBoardTypes": ["EMOTIONAL_ABUSE","EXPLOITATION","MISAPPROPRIATION","NEGLECT","PEER_TO_PEER_ACT","PHYSICAL_ABUSE","PROHIBITED_SEXUAL_RELATIONS","SEXUAL_ABUSE","UNEXPLAINED_OR_UNANTICIPATED_DEATH","MEDIA_INQUIRY"],
    "muiIncidentReportDeadline": "FIRST_WORKING_DAY_3PM",
    "muiSameDayNotifications": true,
    "categoryCAdministrativeReviewRequired": true,
    "uiEmployeeReportHours": 24,
    "uiMonthlyLogReviewRequired": true,
    "annualMuiTrendReportDue": "02-28",
    "annualMuiTrendThresholds": {"sixMonthCount":5,"annualCount":10,"previousYearComparisonCount":3},
    "liveOitmsIntegrationConfigured": false,
    "submissionMode": "MANUAL_OITMS_OR_COUNTY_BOARD"
  }'::jsonb,
  'Ohio Administrative Code 5123-17-02',
  'https://codes.ohio.gov/ohio-administrative-code/rule-5123-17-02',
  '2026-08-17'
) ON CONFLICT DO NOTHING;
