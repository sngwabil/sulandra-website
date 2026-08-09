CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Training belongs to the employing legal entity. Existing assignments were
-- backfilled to SCLS by the Stage 4 operational-data migration.
ALTER TABLE "EducationAssignment"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text,
  ADD COLUMN IF NOT EXISTS "departmentId" text,
  ADD COLUMN IF NOT EXISTS "certificateNumber" text,
  ADD COLUMN IF NOT EXISTS "attemptCount" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "completionEvidence" jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE "EducationAssignment" assignment
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE assignment."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND assignment."legalEntityId" IS NULL;

UPDATE "EducationAssignment" assignment
SET "departmentId"=employment."departmentId"
FROM "Employment" employment
WHERE assignment."organizationId"=employment."organizationId"
  AND assignment."employeeId"=employment."userId"
  AND assignment."legalEntityId"=employment."legalEntityId"
  AND employment."status"<>'TERMINATED'
  AND assignment."departmentId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "EducationAssignment"
    WHERE "organizationId" IS NOT NULL AND "legalEntityId" IS NULL
  ) THEN
    RAISE EXCEPTION 'EducationAssignment contains records without a legal entity';
  END IF;
END $$;

ALTER TABLE "EducationAssignment"
  ALTER COLUMN "legalEntityId" SET NOT NULL;

DROP INDEX IF EXISTS "EducationAssignment_open_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "EducationAssignment_open_entity_unique"
  ON "EducationAssignment"("organizationId","legalEntityId","employeeId","courseCode")
  WHERE "status" IN ('ASSIGNED','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS "EducationAssignment_entity_employee_status_idx"
  ON "EducationAssignment"("organizationId","legalEntityId","employeeId","status");
CREATE INDEX IF NOT EXISTS "EducationAssignment_entity_department_due_idx"
  ON "EducationAssignment"("organizationId","legalEntityId","departmentId","status","dueDate");
CREATE UNIQUE INDEX IF NOT EXISTS "EducationAssignment_certificate_unique"
  ON "EducationAssignment"("organizationId","certificateNumber")
  WHERE "certificateNumber" IS NOT NULL;

UPDATE "EducationAssignment" SET "attemptCount"=0 WHERE "attemptCount"<0;
UPDATE "EducationAssignment" SET "scorePercent"=NULL WHERE "scorePercent"<0 OR "scorePercent">100;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EducationAssignment_attempt_count_check') THEN
    ALTER TABLE "EducationAssignment"
      ADD CONSTRAINT "EducationAssignment_attempt_count_check" CHECK ("attemptCount">=0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EducationAssignment_score_percent_check') THEN
    ALTER TABLE "EducationAssignment"
      ADD CONSTRAINT "EducationAssignment_score_percent_check" CHECK ("scorePercent" IS NULL OR ("scorePercent">=0 AND "scorePercent"<=100));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EducationAssignment_department_fkey') THEN
    ALTER TABLE "EducationAssignment"
      ADD CONSTRAINT "EducationAssignment_department_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL NOT VALID;
    ALTER TABLE "EducationAssignment" VALIDATE CONSTRAINT "EducationAssignment_department_fkey";
  END IF;
END $$;

-- Immutable idempotency ledger for the accepted-applicant-to-employee action.
CREATE TABLE IF NOT EXISTS "EmployeeHireProvisioning" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL REFERENCES "LegalEntity"("id") ON DELETE RESTRICT,
  "departmentId" text REFERENCES "Department"("id") ON DELETE SET NULL,
  "applicationId" text NOT NULL REFERENCES "EmployeeApplication"("id") ON DELETE RESTRICT,
  "offerId" text NOT NULL REFERENCES "EmploymentOffer"("id") ON DELETE RESTRICT,
  "userId" text NOT NULL,
  "employmentId" text NOT NULL REFERENCES "Employment"("id") ON DELETE RESTRICT,
  "provisionedById" text NOT NULL,
  "roleCode" text NOT NULL,
  "trainingAssignmentCount" integer NOT NULL DEFAULT 0,
  "credentialCreated" boolean NOT NULL DEFAULT false,
  "welcomeDeliveryStatus" text NOT NULL DEFAULT 'PENDING',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeHireProvisioning_application_key" UNIQUE ("organizationId","applicationId"),
  CONSTRAINT "EmployeeHireProvisioning_offer_key" UNIQUE ("organizationId","offerId"),
  CONSTRAINT "EmployeeHireProvisioning_delivery_check" CHECK (
    "welcomeDeliveryStatus" IN ('PENDING','SENT','FAILED','NOT_REQUESTED','NOT_CONFIGURED')
  )
);
CREATE INDEX IF NOT EXISTS "EmployeeHireProvisioning_entity_created_idx"
  ON "EmployeeHireProvisioning"("organizationId","legalEntityId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeHireProvisioning_user_idx"
  ON "EmployeeHireProvisioning"("organizationId","userId","createdAt" DESC);

COMMENT ON TABLE "EmployeeHireProvisioning" IS
  'Idempotent audit ledger for accepted applicant conversion into a company-scoped employee, portal credential, employment, access grant, and initial training.';
