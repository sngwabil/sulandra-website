CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SecurityAccessReviewCampaign" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "reviewType" text NOT NULL DEFAULT 'PERIODIC',
  "periodStart" date,
  "periodEnd" date,
  "dueAt" timestamptz,
  "instructions" text,
  "createdByUserId" text NOT NULL,
  "startedAt" timestamptz,
  "startedByUserId" text,
  "completedAt" timestamptz,
  "completedByUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SecurityAccessReviewCampaign_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SecurityAccessReviewCampaign_status_check" CHECK ("status" IN ('DRAFT','IN_PROGRESS','COMPLETED','VOID')),
  CONSTRAINT "SecurityAccessReviewCampaign_type_check" CHECK ("reviewType" IN ('PERIODIC','ROLE_CHANGE','TERMINATION','PRIVILEGED_ACCESS','INCIDENT_FOLLOW_UP','OTHER'))
);
CREATE INDEX IF NOT EXISTS "SecurityAccessReviewCampaign_entity_idx" ON "SecurityAccessReviewCampaign"("organizationId","legalEntityId","status","dueAt");

CREATE TABLE IF NOT EXISTS "SecurityAccessReviewItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "campaignId" text NOT NULL REFERENCES "SecurityAccessReviewCampaign"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "userDisplayName" text,
  "email" text,
  "roleSnapshot" text,
  "accessSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "activitySnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "decision" text NOT NULL DEFAULT 'PENDING',
  "requiredAction" text,
  "reviewNote" text,
  "reviewedAt" timestamptz,
  "reviewedByUserId" text,
  "actionCompletedAt" timestamptz,
  "actionCompletedByUserId" text,
  "actionCompletionNote" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SecurityAccessReviewItem_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SecurityAccessReviewItem_user_key" UNIQUE ("campaignId","userId"),
  CONSTRAINT "SecurityAccessReviewItem_decision_check" CHECK ("decision" IN ('PENDING','APPROVE_CURRENT','CHANGE_REQUIRED','REMOVE_ACCESS','NOT_APPLICABLE'))
);
CREATE INDEX IF NOT EXISTS "SecurityAccessReviewItem_campaign_idx" ON "SecurityAccessReviewItem"("organizationId","legalEntityId","campaignId","decision");
CREATE INDEX IF NOT EXISTS "SecurityAccessReviewItem_user_idx" ON "SecurityAccessReviewItem"("organizationId","legalEntityId","userId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SecurityAccessReviewEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "campaignId" text NOT NULL REFERENCES "SecurityAccessReviewCampaign"("id") ON DELETE CASCADE,
  "itemId" text REFERENCES "SecurityAccessReviewItem"("id") ON DELETE CASCADE,
  "eventType" text NOT NULL,
  "actorUserId" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SecurityAccessReviewEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "SecurityAccessReviewEvent_campaign_idx" ON "SecurityAccessReviewEvent"("organizationId","legalEntityId","campaignId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SecurityAuditExport" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "exportType" text NOT NULL,
  "format" text NOT NULL DEFAULT 'CSV',
  "filterSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "rowCount" integer NOT NULL DEFAULT 0,
  "sha256" text,
  "exportedByUserId" text NOT NULL,
  "exportedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SecurityAuditExport_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SecurityAuditExport_type_check" CHECK ("exportType" IN ('UNIFIED_AUDIT','CHART_ACCESS','CLINICAL_AUDIT','ACCESS_REVIEW','SECURITY_ACTIVITY')),
  CONSTRAINT "SecurityAuditExport_format_check" CHECK ("format" IN ('CSV','JSON'))
);
CREATE INDEX IF NOT EXISTS "SecurityAuditExport_entity_idx" ON "SecurityAuditExport"("organizationId","legalEntityId","exportedAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_security_access_review_event_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'SecurityAccessReviewEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SecurityAccessReviewEvent_no_update" ON "SecurityAccessReviewEvent";
CREATE TRIGGER "SecurityAccessReviewEvent_no_update" BEFORE UPDATE ON "SecurityAccessReviewEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_security_access_review_event_mutation"();
DROP TRIGGER IF EXISTS "SecurityAccessReviewEvent_no_delete" ON "SecurityAccessReviewEvent";
CREATE TRIGGER "SecurityAccessReviewEvent_no_delete" BEFORE DELETE ON "SecurityAccessReviewEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_security_access_review_event_mutation"();

CREATE OR REPLACE FUNCTION "notify_security_access_review"() RETURNS trigger AS $$
BEGIN
  IF NEW."status"='IN_PROGRESS' THEN
    PERFORM "upsert_enterprise_work_notification"(
      NEW."organizationId",NEW."legalEntityId",NULL,
      '["ADMINISTRATOR","HR_MANAGER","PROGRAM_MANAGER","CEO","DOO"]'::jsonb,
      'SECURITY','SecurityAccessReviewCampaign',NEW."id",'ACCESS_REVIEW',NEW."title",
      'A formal user-access review campaign is in progress and requires completion.','HIGH','/security-audit.html',NEW."dueAt",
      jsonb_build_object('reviewType',NEW."reviewType")
    );
  ELSE
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=NOW(),"updatedAt"=NOW()
    WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId"
      AND "resourceType"='SecurityAccessReviewCampaign' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SecurityAccessReviewCampaign_work_notification" ON "SecurityAccessReviewCampaign";
CREATE TRIGGER "SecurityAccessReviewCampaign_work_notification" AFTER INSERT OR UPDATE OF "status","dueAt" ON "SecurityAccessReviewCampaign" FOR EACH ROW EXECUTE FUNCTION "notify_security_access_review"();
