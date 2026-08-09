-- Employee collaboration and request workflows belong to the selected employer
-- company. Existing organization-wide records predate multi-company routing and
-- are preserved as SCLS records. This migration does not enable provider services.

ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeWorkflowRequest" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeWorkflowApproval" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeWorkflowComment" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeWorkflowEvent" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeTeamFeedback" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeRecognition" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "legalEntityId" text;

UPDATE "EmployeeWorkflowDefinition" row_to_scope
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=row_to_scope."organizationId"
  AND entity."code"='SCLS' AND row_to_scope."legalEntityId" IS NULL;

UPDATE "EmployeeWorkflowRequest" row_to_scope
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=row_to_scope."organizationId"
  AND entity."code"='SCLS' AND row_to_scope."legalEntityId" IS NULL;

UPDATE "EmployeeWorkflowApproval" approval
SET "legalEntityId"=request."legalEntityId"
FROM "EmployeeWorkflowRequest" request
WHERE request."organizationId"=approval."organizationId"
  AND request."id"=approval."requestId" AND approval."legalEntityId" IS NULL;

UPDATE "EmployeeWorkflowComment" comment_row
SET "legalEntityId"=request."legalEntityId"
FROM "EmployeeWorkflowRequest" request
WHERE request."organizationId"=comment_row."organizationId"
  AND request."id"=comment_row."requestId" AND comment_row."legalEntityId" IS NULL;

UPDATE "EmployeeWorkflowEvent" event_row
SET "legalEntityId"=request."legalEntityId"
FROM "EmployeeWorkflowRequest" request
WHERE request."organizationId"=event_row."organizationId"
  AND request."id"=event_row."requestId" AND event_row."legalEntityId" IS NULL;

-- Preserve orphaned legacy child rows and records produced by shared Employee
-- 360 modules as SCLS compatibility data.
UPDATE "EmployeeWorkflowApproval" row_to_scope
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=row_to_scope."organizationId"
  AND entity."code"='SCLS' AND row_to_scope."legalEntityId" IS NULL;
UPDATE "EmployeeWorkflowComment" row_to_scope
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=row_to_scope."organizationId"
  AND entity."code"='SCLS' AND row_to_scope."legalEntityId" IS NULL;
UPDATE "EmployeeWorkflowEvent" row_to_scope
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=row_to_scope."organizationId"
  AND entity."code"='SCLS' AND row_to_scope."legalEntityId" IS NULL;
UPDATE "EmployeeTeamFeedback" row_to_scope
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=row_to_scope."organizationId"
  AND entity."code"='SCLS' AND row_to_scope."legalEntityId" IS NULL;
UPDATE "EmployeeRecognition" row_to_scope
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=row_to_scope."organizationId"
  AND entity."code"='SCLS' AND row_to_scope."legalEntityId" IS NULL;
UPDATE "EmployeeNotification" row_to_scope
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=row_to_scope."organizationId"
  AND entity."code"='SCLS' AND row_to_scope."legalEntityId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "EmployeeWorkflowRequest" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'EmployeeWorkflowRequest contains records without an SCLS legal entity';
  END IF;
  IF EXISTS (SELECT 1 FROM "EmployeeWorkflowApproval" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'EmployeeWorkflowApproval contains records without an SCLS legal entity';
  END IF;
  IF EXISTS (SELECT 1 FROM "EmployeeWorkflowComment" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'EmployeeWorkflowComment contains records without an SCLS legal entity';
  END IF;
  IF EXISTS (SELECT 1 FROM "EmployeeTeamFeedback" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'EmployeeTeamFeedback contains records without an SCLS legal entity';
  END IF;
END $$;

ALTER TABLE "EmployeeWorkflowRequest" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "EmployeeWorkflowApproval" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "EmployeeWorkflowComment" ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "EmployeeTeamFeedback" ALTER COLUMN "legalEntityId" SET NOT NULL;

-- These two tables are also used by the workflow-automation feature. Nullable
-- collaboration-only fields let both record shapes safely coexist.
ALTER TABLE "EmployeeWorkflowDefinition" ALTER COLUMN "requestType" DROP NOT NULL;
ALTER TABLE "EmployeeWorkflowEvent" ALTER COLUMN "requestId" DROP NOT NULL;

DROP INDEX IF EXISTS "EmployeeWorkflowDefinition_type_unique";
CREATE UNIQUE INDEX "EmployeeWorkflowDefinition_type_unique"
  ON "EmployeeWorkflowDefinition"("organizationId","legalEntityId","requestType")
  WHERE "requestType" IS NOT NULL;

DROP INDEX IF EXISTS "EmployeeWorkflowApproval_request_actor_unique";
CREATE UNIQUE INDEX "EmployeeWorkflowApproval_request_actor_unique"
  ON "EmployeeWorkflowApproval"("organizationId","legalEntityId","requestId","sequence","approverUserId")
  WHERE "approverUserId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeWorkflowRequest_entity_id_key"
  ON "EmployeeWorkflowRequest"("organizationId","legalEntityId","id");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowDefinition_entity_enabled_idx"
  ON "EmployeeWorkflowDefinition"("organizationId","legalEntityId","enabled","employeeCanSubmit");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowRequest_entity_employee_idx"
  ON "EmployeeWorkflowRequest"("organizationId","legalEntityId","employeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowRequest_entity_status_idx"
  ON "EmployeeWorkflowRequest"("organizationId","legalEntityId","status","currentSequence","createdAt");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowRequest_entity_type_idx"
  ON "EmployeeWorkflowRequest"("organizationId","legalEntityId","requestType","status");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowApproval_entity_actor_idx"
  ON "EmployeeWorkflowApproval"("organizationId","legalEntityId","approverUserId","status","sequence");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowApproval_entity_request_idx"
  ON "EmployeeWorkflowApproval"("organizationId","legalEntityId","requestId","sequence","status");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowComment_entity_request_idx"
  ON "EmployeeWorkflowComment"("organizationId","legalEntityId","requestId","createdAt");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowEvent_entity_request_idx"
  ON "EmployeeWorkflowEvent"("organizationId","legalEntityId","requestId","createdAt");
CREATE INDEX IF NOT EXISTS "EmployeeTeamFeedback_entity_employee_idx"
  ON "EmployeeTeamFeedback"("organizationId","legalEntityId","employeeId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeTeamFeedback_entity_followup_idx"
  ON "EmployeeTeamFeedback"("organizationId","legalEntityId","followUpDate","status");
CREATE INDEX IF NOT EXISTS "EmployeeRecognition_entity_employee_idx"
  ON "EmployeeRecognition"("organizationId","legalEntityId","employeeId","status","awardDate" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeNotification_entity_user_idx"
  ON "EmployeeNotification"("organizationId","legalEntityId","userId","status","createdAt" DESC);

DO $$
DECLARE
  table_name text;
  constraint_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'EmployeeWorkflowDefinition','EmployeeWorkflowRequest','EmployeeWorkflowApproval','EmployeeWorkflowComment',
    'EmployeeWorkflowEvent','EmployeeTeamFeedback','EmployeeRecognition','EmployeeNotification'
  ]
  LOOP
    constraint_name := table_name || '_entity_fkey';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=constraint_name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT NOT VALID',
        table_name,
        constraint_name
      );
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I',table_name,constraint_name);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeWorkflowApproval_entity_request_fkey') THEN
    ALTER TABLE "EmployeeWorkflowApproval"
      ADD CONSTRAINT "EmployeeWorkflowApproval_entity_request_fkey"
      FOREIGN KEY ("organizationId","legalEntityId","requestId")
      REFERENCES "EmployeeWorkflowRequest"("organizationId","legalEntityId","id")
      ON DELETE CASCADE NOT VALID;
    ALTER TABLE "EmployeeWorkflowApproval" VALIDATE CONSTRAINT "EmployeeWorkflowApproval_entity_request_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeWorkflowComment_entity_request_fkey') THEN
    ALTER TABLE "EmployeeWorkflowComment"
      ADD CONSTRAINT "EmployeeWorkflowComment_entity_request_fkey"
      FOREIGN KEY ("organizationId","legalEntityId","requestId")
      REFERENCES "EmployeeWorkflowRequest"("organizationId","legalEntityId","id")
      ON DELETE CASCADE NOT VALID;
    ALTER TABLE "EmployeeWorkflowComment" VALIDATE CONSTRAINT "EmployeeWorkflowComment_entity_request_fkey";
  END IF;
END $$;

COMMENT ON COLUMN "EmployeeWorkflowDefinition"."legalEntityId" IS 'Employer company for Employee 360 request definitions; NULL is reserved for shared legacy producers.';
COMMENT ON COLUMN "EmployeeWorkflowRequest"."legalEntityId" IS 'Employer company in which the employee submitted this request.';
COMMENT ON COLUMN "EmployeeWorkflowApproval"."legalEntityId" IS 'Employer company in which this approval is valid.';
COMMENT ON COLUMN "EmployeeWorkflowComment"."legalEntityId" IS 'Employer company owning this request comment.';
COMMENT ON COLUMN "EmployeeWorkflowEvent"."legalEntityId" IS 'Employer company for collaboration events; NULL is reserved for shared legacy producers.';
COMMENT ON COLUMN "EmployeeTeamFeedback"."legalEntityId" IS 'Employer company owning this manager feedback.';
COMMENT ON COLUMN "EmployeeRecognition"."legalEntityId" IS 'Employer company for collaboration recognition; NULL is reserved for shared legacy producers.';
COMMENT ON COLUMN "EmployeeNotification"."legalEntityId" IS 'Employer company for collaboration notifications; NULL is reserved for shared legacy producers.';
