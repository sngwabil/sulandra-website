CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "EducationCampaign" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "conversationId" text,
  "createdById" text NOT NULL,
  "courseCode" text NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL DEFAULT '',
  "content" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "audience" text NOT NULL DEFAULT 'ALL_EMPLOYEES',
  "recipientUserIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "dueDate" timestamptz,
  "emailSubject" text NOT NULL DEFAULT '',
  "emailMessage" text NOT NULL DEFAULT '',
  "version" integer NOT NULL DEFAULT 1,
  "sentAt" timestamptz,
  "deliverySummary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EducationCampaign_status_check" CHECK ("status" IN ('DRAFT','READY_TO_SEND','ACTIVE','CLOSED')),
  CONSTRAINT "EducationCampaign_audience_check" CHECK ("audience" IN ('ALL_EMPLOYEES','MANAGERS','HR_ADMIN','CUSTOM')),
  CONSTRAINT "EducationCampaign_version_check" CHECK ("version" >= 1),
  CONSTRAINT "EducationCampaign_course_key" UNIQUE ("organizationId","courseCode")
);

CREATE INDEX IF NOT EXISTS "EducationCampaign_conversation_idx"
  ON "EducationCampaign"("organizationId","conversationId","updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "EducationCampaign_status_idx"
  ON "EducationCampaign"("organizationId","status","updatedAt" DESC);

CREATE TABLE IF NOT EXISTS "EducationCampaignRevision" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "campaignId" text NOT NULL REFERENCES "EducationCampaign"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL DEFAULT '',
  "content" text NOT NULL,
  "dueDate" timestamptz,
  "emailSubject" text NOT NULL DEFAULT '',
  "emailMessage" text NOT NULL DEFAULT '',
  "changedById" text NOT NULL,
  "changeNote" text NOT NULL DEFAULT '',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EducationCampaignRevision_version_key" UNIQUE ("campaignId","version")
);

CREATE INDEX IF NOT EXISTS "EducationCampaignRevision_campaign_idx"
  ON "EducationCampaignRevision"("organizationId","campaignId","version" DESC);

ALTER TABLE "EducationAssignment"
  ADD COLUMN IF NOT EXISTS "campaignId" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EducationAssignment_campaign_fkey') THEN
    ALTER TABLE "EducationAssignment"
      ADD CONSTRAINT "EducationAssignment_campaign_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "EducationCampaign"("id") ON DELETE SET NULL NOT VALID;
    ALTER TABLE "EducationAssignment" VALIDATE CONSTRAINT "EducationAssignment_campaign_fkey";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EducationAssignment_campaign_employee_idx"
  ON "EducationAssignment"("organizationId","campaignId","employeeId","status");

CREATE OR REPLACE FUNCTION protect_education_campaign_revision()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Education campaign revision history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "EducationCampaignRevision_immutable" ON "EducationCampaignRevision";
CREATE TRIGGER "EducationCampaignRevision_immutable"
BEFORE UPDATE OR DELETE ON "EducationCampaignRevision"
FOR EACH ROW EXECUTE FUNCTION protect_education_campaign_revision();

COMMENT ON TABLE "EducationCampaign" IS
  'Admin-authored education draft/review/send lifecycle used by Sulandra IT Solutions. Distribution creates canonical EducationAssignment records.';
COMMENT ON TABLE "EducationCampaignRevision" IS
  'Append-only review and revision history for IT-generated employee education.';
COMMENT ON COLUMN "EducationAssignment"."campaignId" IS
  'Links employee completion evidence to the exact reviewed EducationCampaign version.';
