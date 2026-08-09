CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Practice charts are deliberately isolated from SpirePatient, ClientEnrollment,
-- billing, EVV, authorizations and official clinical tables. Training records can
-- therefore be reset freely and can never become billable production records.

CREATE TABLE IF NOT EXISTS "SpireTrainingCase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "scenarioCode" text NOT NULL,
  "scenarioType" text NOT NULL,
  "displayName" text NOT NULL,
  "dateOfBirth" date,
  "description" text NOT NULL,
  "seedData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireTrainingCase_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE CASCADE,
  CONSTRAINT "SpireTrainingCase_type_check"
    CHECK ("scenarioType" IN ('SCLS','HOME_HEALTH','NMT','GENERAL')),
  CONSTRAINT "SpireTrainingCase_status_check"
    CHECK ("status" IN ('ACTIVE','ARCHIVED'))
);
CREATE INDEX IF NOT EXISTS "SpireTrainingCase_entity_idx"
  ON "SpireTrainingCase"("organizationId","legalEntityId","status","scenarioType","displayName");

CREATE TABLE IF NOT EXISTS "SpireTrainingAssignment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "caseId" text NOT NULL REFERENCES "SpireTrainingCase"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "assignedById" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "assignedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  CONSTRAINT "SpireTrainingAssignment_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireTrainingAssignment_active_key"
  ON "SpireTrainingAssignment"("organizationId","legalEntityId","caseId","userId")
  WHERE "active"=true;
CREATE INDEX IF NOT EXISTS "SpireTrainingAssignment_user_idx"
  ON "SpireTrainingAssignment"("organizationId","legalEntityId","userId","active","assignedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireTrainingChartEntry" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "caseId" text NOT NULL REFERENCES "SpireTrainingCase"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "entryType" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'RECORDED',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireTrainingChartEntry_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE CASCADE,
  CONSTRAINT "SpireTrainingChartEntry_type_check"
    CHECK ("entryType" IN ('VITALS','FLOWSHEET','PROGRESS_NOTE','MAR','ASSESSMENT','INCIDENT','TASK','ORDER','TRANSPORT','COMMUNICATION','OTHER')),
  CONSTRAINT "SpireTrainingChartEntry_status_check"
    CHECK ("status" IN ('RECORDED','VOIDED'))
);
CREATE INDEX IF NOT EXISTS "SpireTrainingChartEntry_case_idx"
  ON "SpireTrainingChartEntry"("organizationId","legalEntityId","caseId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireTrainingChartEntry_user_idx"
  ON "SpireTrainingChartEntry"("organizationId","legalEntityId","userId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireTrainingEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "caseId" text,
  "actorUserId" text NOT NULL,
  "eventType" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireTrainingEvent_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "SpireTrainingEvent_entity_idx"
  ON "SpireTrainingEvent"("organizationId","legalEntityId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_spire_training_event_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SpireTrainingEvent is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "SpireTrainingEvent_no_update" ON "SpireTrainingEvent";
CREATE TRIGGER "SpireTrainingEvent_no_update"
BEFORE UPDATE ON "SpireTrainingEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_training_event_mutation"();
DROP TRIGGER IF EXISTS "SpireTrainingEvent_no_delete" ON "SpireTrainingEvent";
CREATE TRIGGER "SpireTrainingEvent_no_delete"
BEFORE DELETE ON "SpireTrainingEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_training_event_mutation"();
