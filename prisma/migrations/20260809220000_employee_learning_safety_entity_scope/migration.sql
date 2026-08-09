-- Learning assignments, development goals, and workforce safety/wellness data
-- belong to the selected employer company. The reusable learning course catalog
-- intentionally remains enterprise-shared. No provider capability is enabled.

ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeDevelopmentGoal" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeLearningEvent" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "EmployeeHealthSafetyEvent" ADD COLUMN IF NOT EXISTS "legalEntityId" text;

DO $$
DECLARE
  table_name text;
  has_unassigned boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'EmployeeLearningAssignment','EmployeeDevelopmentGoal','EmployeeLearningEvent',
    'EmployeeSafetyIncident','EmployeeSafetyAction','EmployeeWellnessProgram','EmployeeHealthSafetyEvent'
  ]
  LOOP
    EXECUTE format(
      'UPDATE %I row_to_scope SET "legalEntityId"=entity."id" FROM "LegalEntity" entity
       WHERE entity."organizationId"=row_to_scope."organizationId" AND entity."code"=''SCLS''
         AND row_to_scope."legalEntityId" IS NULL',
      table_name
    );
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I WHERE "legalEntityId" IS NULL)',
      table_name
    ) INTO has_unassigned;
    IF has_unassigned THEN
      RAISE EXCEPTION '% contains records without an SCLS legal entity',table_name;
    END IF;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "legalEntityId" SET NOT NULL',table_name);
  END LOOP;
END $$;

DROP INDEX IF EXISTS "EmployeeLearningAssignment_unique";
CREATE UNIQUE INDEX "EmployeeLearningAssignment_unique"
  ON "EmployeeLearningAssignment"("organizationId","legalEntityId","employeeId","courseId");

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeSafetyIncident_entity_id_key"
  ON "EmployeeSafetyIncident"("organizationId","legalEntityId","id");
CREATE INDEX IF NOT EXISTS "EmployeeLearningAssignment_entity_employee_idx"
  ON "EmployeeLearningAssignment"("organizationId","legalEntityId","employeeId","status","dueAt");
CREATE INDEX IF NOT EXISTS "EmployeeDevelopmentGoal_entity_employee_idx"
  ON "EmployeeDevelopmentGoal"("organizationId","legalEntityId","employeeId","status","targetDate");
CREATE INDEX IF NOT EXISTS "EmployeeLearningEvent_entity_idx"
  ON "EmployeeLearningEvent"("organizationId","legalEntityId","employeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeSafetyIncident_entity_idx"
  ON "EmployeeSafetyIncident"("organizationId","legalEntityId","status","severity","occurredAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeSafetyAction_entity_idx"
  ON "EmployeeSafetyAction"("organizationId","legalEntityId","status","dueAt");
CREATE INDEX IF NOT EXISTS "EmployeeWellnessProgram_entity_idx"
  ON "EmployeeWellnessProgram"("organizationId","legalEntityId","active","programType","startsAt");
CREATE INDEX IF NOT EXISTS "EmployeeHealthSafetyEvent_entity_idx"
  ON "EmployeeHealthSafetyEvent"("organizationId","legalEntityId","employeeId","createdAt" DESC);

DO $$
DECLARE
  table_name text;
  constraint_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'EmployeeLearningAssignment','EmployeeDevelopmentGoal','EmployeeLearningEvent',
    'EmployeeSafetyIncident','EmployeeSafetyAction','EmployeeWellnessProgram','EmployeeHealthSafetyEvent'
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

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeSafetyAction_entity_incident_fkey') THEN
    ALTER TABLE "EmployeeSafetyAction"
      ADD CONSTRAINT "EmployeeSafetyAction_entity_incident_fkey"
      FOREIGN KEY ("organizationId","legalEntityId","incidentId")
      REFERENCES "EmployeeSafetyIncident"("organizationId","legalEntityId","id")
      ON DELETE CASCADE NOT VALID;
    ALTER TABLE "EmployeeSafetyAction" VALIDATE CONSTRAINT "EmployeeSafetyAction_entity_incident_fkey";
  END IF;
END $$;

COMMENT ON COLUMN "EmployeeLearningAssignment"."legalEntityId" IS 'Employer company owning this course assignment and completion evidence.';
COMMENT ON COLUMN "EmployeeDevelopmentGoal"."legalEntityId" IS 'Employer company owning this employee development goal.';
COMMENT ON COLUMN "EmployeeLearningEvent"."legalEntityId" IS 'Employer company selected when this learning event occurred.';
COMMENT ON COLUMN "EmployeeSafetyIncident"."legalEntityId" IS 'Employer company owning this workforce safety incident.';
COMMENT ON COLUMN "EmployeeSafetyAction"."legalEntityId" IS 'Employer company owning this corrective safety action.';
COMMENT ON COLUMN "EmployeeWellnessProgram"."legalEntityId" IS 'Employer company publishing this wellness program.';
COMMENT ON COLUMN "EmployeeHealthSafetyEvent"."legalEntityId" IS 'Employer company selected when this health and safety event occurred.';
