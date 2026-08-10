CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "EnterpriseDataQualityIssue" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "issueKey" text NOT NULL,
  "module" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'MEDIUM',
  "status" text NOT NULL DEFAULT 'OPEN',
  "resourceType" text NOT NULL,
  "resourceId" text,
  "title" text NOT NULL,
  "details" text,
  "actionPath" text,
  "assignedUserId" text,
  "detectedBy" text NOT NULL DEFAULT 'SYSTEM_SCAN',
  "firstSeenAt" timestamptz NOT NULL DEFAULT now(),
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  "acknowledgedAt" timestamptz,
  "acknowledgedByUserId" text,
  "resolvedAt" timestamptz,
  "resolvedByUserId" text,
  "resolutionNote" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EnterpriseDataQualityIssue_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EnterpriseDataQualityIssue_key" UNIQUE ("organizationId","legalEntityId","issueKey"),
  CONSTRAINT "EnterpriseDataQualityIssue_severity_check" CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT "EnterpriseDataQualityIssue_status_check" CHECK ("status" IN ('OPEN','ACKNOWLEDGED','RESOLVED','IGNORED'))
);
CREATE INDEX IF NOT EXISTS "EnterpriseDataQualityIssue_entity_idx" ON "EnterpriseDataQualityIssue"("organizationId","legalEntityId","status","severity","lastSeenAt" DESC);
CREATE INDEX IF NOT EXISTS "EnterpriseDataQualityIssue_owner_idx" ON "EnterpriseDataQualityIssue"("organizationId","legalEntityId","assignedUserId","status");

CREATE TABLE IF NOT EXISTS "EnterpriseDataQualityRun" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "startedByUserId" text NOT NULL,
  "scanVersion" text NOT NULL,
  "issuesFound" integer NOT NULL DEFAULT 0,
  "criticalCount" integer NOT NULL DEFAULT 0,
  "highCount" integer NOT NULL DEFAULT 0,
  "mediumCount" integer NOT NULL DEFAULT 0,
  "lowCount" integer NOT NULL DEFAULT 0,
  "modulesScanned" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "notes" text,
  CONSTRAINT "EnterpriseDataQualityRun_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "EnterpriseDataQualityRun_entity_idx" ON "EnterpriseDataQualityRun"("organizationId","legalEntityId","startedAt" DESC);

CREATE TABLE IF NOT EXISTS "EnterpriseDataQualityEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "issueId" text NOT NULL REFERENCES "EnterpriseDataQualityIssue"("id") ON DELETE CASCADE,
  "eventType" text NOT NULL,
  "actorUserId" text NOT NULL,
  "fromStatus" text,
  "toStatus" text,
  "comment" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EnterpriseDataQualityEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EnterpriseDataQualityEvent_type_check" CHECK ("eventType" IN ('DETECTED','UPDATED','ACKNOWLEDGED','RESOLVED','REOPENED','IGNORED','ASSIGNED','COMMENT'))
);
CREATE INDEX IF NOT EXISTS "EnterpriseDataQualityEvent_issue_idx" ON "EnterpriseDataQualityEvent"("organizationId","legalEntityId","issueId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_data_quality_event_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'EnterpriseDataQualityEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "EnterpriseDataQualityEvent_no_update" ON "EnterpriseDataQualityEvent";
CREATE TRIGGER "EnterpriseDataQualityEvent_no_update" BEFORE UPDATE ON "EnterpriseDataQualityEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_data_quality_event_mutation"();
DROP TRIGGER IF EXISTS "EnterpriseDataQualityEvent_no_delete" ON "EnterpriseDataQualityEvent";
CREATE TRIGGER "EnterpriseDataQualityEvent_no_delete" BEFORE DELETE ON "EnterpriseDataQualityEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_data_quality_event_mutation"();

CREATE OR REPLACE FUNCTION "notify_data_quality_issue"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('OPEN','ACKNOWLEDGED') AND NEW."severity" IN ('HIGH','CRITICAL') THEN
    PERFORM "upsert_enterprise_work_notification"(
      NEW."organizationId",NEW."legalEntityId",NEW."assignedUserId",
      CASE WHEN NEW."assignedUserId" IS NULL THEN '["ADMINISTRATOR","PROGRAM_MANAGER","RN","DELEGATING_NURSE","HR_MANAGER","BILLING_SPECIALIST","CEO","DOO"]'::jsonb ELSE '[]'::jsonb END,
      'DATA_QUALITY','EnterpriseDataQualityIssue',NEW."id",'ISSUE',NEW."title",NEW."details",
      CASE WHEN NEW."severity"='CRITICAL' THEN 'CRITICAL' ELSE 'HIGH' END,COALESCE(NEW."actionPath",'/data-quality.html'),NULL,
      jsonb_build_object('module',NEW."module",'resourceType',NEW."resourceType",'resourceId',NEW."resourceId",'issueKey',NEW."issueKey")
    );
  ELSE
    UPDATE "EnterpriseWorkNotification" SET "status"='COMPLETED',"completedAt"=now(),"updatedAt"=now()
    WHERE "organizationId"=NEW."organizationId" AND "legalEntityId"=NEW."legalEntityId"
      AND "resourceType"='EnterpriseDataQualityIssue' AND "resourceId"=NEW."id" AND "status" IN ('OPEN','READ');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "EnterpriseDataQualityIssue_work_notification" ON "EnterpriseDataQualityIssue";
CREATE TRIGGER "EnterpriseDataQualityIssue_work_notification" AFTER INSERT OR UPDATE OF "status","severity","assignedUserId","title","details" ON "EnterpriseDataQualityIssue" FOR EACH ROW EXECUTE FUNCTION "notify_data_quality_issue"();
