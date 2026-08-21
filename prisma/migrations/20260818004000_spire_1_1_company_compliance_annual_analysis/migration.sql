-- SPIRE 1.1 Phase C / Step 3
-- Immutable annual cross-system quality analysis snapshots for Company Compliance.
-- A revised analysis is a new version; historical snapshots cannot be edited/deleted.

CREATE TABLE IF NOT EXISTS "CompanyComplianceAnnualQaAnalysis" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "analysisNumber" text NOT NULL,
  "reportYear" integer NOT NULL,
  "version" integer NOT NULL,
  "generatedByUserId" text NOT NULL,
  "generatedAt" timestamptz NOT NULL DEFAULT now(),
  "snapshotSha256" text NOT NULL,
  "monthlyMetrics" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "yearTotals" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "priorYearComparison" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "trendSignals" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sourcePacketIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "findings" text,
  "actionPlan" text,
  "notes" text,
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "CompanyComplianceAnnualQaAnalysis_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "CompanyComplianceAnnualQaAnalysis_year_ck" CHECK ("reportYear" BETWEEN 2000 AND 2200),
  CONSTRAINT "CompanyComplianceAnnualQaAnalysis_version_ck" CHECK ("version">0),
  CONSTRAINT "CompanyComplianceAnnualQaAnalysis_hash_ck" CHECK ("snapshotSha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "CompanyComplianceAnnualQaAnalysis_number_key" UNIQUE("organizationId","legalEntityId","analysisNumber"),
  CONSTRAINT "CompanyComplianceAnnualQaAnalysis_version_key" UNIQUE("organizationId","legalEntityId","reportYear","version")
);
CREATE INDEX IF NOT EXISTS "CompanyComplianceAnnualQaAnalysis_year_idx"
  ON "CompanyComplianceAnnualQaAnalysis"("organizationId","legalEntityId","reportYear","version" DESC,"generatedAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_company_compliance_annual_qa_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CompanyComplianceAnnualQaAnalysis is immutable; create a new version instead';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "CompanyComplianceAnnualQaAnalysis_no_update" ON "CompanyComplianceAnnualQaAnalysis";
CREATE TRIGGER "CompanyComplianceAnnualQaAnalysis_no_update"
BEFORE UPDATE ON "CompanyComplianceAnnualQaAnalysis"
FOR EACH ROW EXECUTE FUNCTION "prevent_company_compliance_annual_qa_mutation"();
DROP TRIGGER IF EXISTS "CompanyComplianceAnnualQaAnalysis_no_delete" ON "CompanyComplianceAnnualQaAnalysis";
CREATE TRIGGER "CompanyComplianceAnnualQaAnalysis_no_delete"
BEFORE DELETE ON "CompanyComplianceAnnualQaAnalysis"
FOR EACH ROW EXECUTE FUNCTION "prevent_company_compliance_annual_qa_mutation"();
