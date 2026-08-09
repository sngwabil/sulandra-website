-- Convert careers, interviews, employment offers, and onboarding ownership from
-- organization-only records to legal-entity and department-aware records.

CREATE UNIQUE INDEX IF NOT EXISTS "Department_org_id_key"
  ON "Department"("organizationId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "Department_org_entity_id_key"
  ON "Department"("organizationId","legalEntityId","id");

ALTER TABLE "JobOpening" ADD COLUMN IF NOT EXISTS "departmentId" text;
ALTER TABLE "EmployeeApplication" ADD COLUMN IF NOT EXISTS "departmentId" text;
ALTER TABLE "EmploymentOffer" ADD COLUMN IF NOT EXISTS "departmentId" text;
ALTER TABLE "InterviewSlot" ADD COLUMN IF NOT EXISTS "departmentId" text;
ALTER TABLE "InterviewInvitation" ADD COLUMN IF NOT EXISTS "departmentId" text;
ALTER TABLE "EmployeeOnboardingLink" ADD COLUMN IF NOT EXISTS "departmentId" text;
ALTER TABLE "EmployeeOnboardingSnapshot" ADD COLUMN IF NOT EXISTS "departmentId" text;

-- Match legacy free-text departments to the normalized department belonging to
-- the already-backfilled company. Role fallbacks preserve every current record.
UPDATE "JobOpening" opening
SET "departmentId"=COALESCE(
  (
    SELECT department."id" FROM "Department" department
    WHERE department."organizationId"=opening."organizationId"
      AND department."legalEntityId"=opening."legalEntityId"
      AND (
        lower(department."name")=lower(COALESCE(opening."department",''))
        OR department."code"=upper(regexp_replace(COALESCE(opening."department",''),'[^A-Za-z0-9]+','_','g'))
      )
    LIMIT 1
  ),
  (
    SELECT department."id" FROM "Department" department
    WHERE department."organizationId"=opening."organizationId"
      AND department."legalEntityId"=opening."legalEntityId"
      AND department."code"=CASE
        WHEN lower(opening."title") ~ 'nurse|(^|[^a-z])(rn|lpn)([^a-z]|$)|clinical' THEN 'CLINICAL_SERVICES'
        WHEN lower(opening."title") ~ 'driver|transport|nmt' THEN 'COMMUNITY_LIVING'
        WHEN lower(opening."title") ~ 'dsp|direct support|house manager|program manager' THEN 'COMMUNITY_LIVING'
        ELSE 'ADMINISTRATION'
      END
    LIMIT 1
  )
)
WHERE opening."departmentId" IS NULL;

UPDATE "EmployeeApplication" application
SET "departmentId"=COALESCE(
  opening."departmentId",
  (
    SELECT department."id" FROM "Department" department
    WHERE department."organizationId"=application."organizationId"
      AND department."legalEntityId"=application."legalEntityId"
      AND department."code"=CASE application."appliedRole"::text
        WHEN 'RN' THEN 'CLINICAL_SERVICES'
        WHEN 'LPN' THEN 'CLINICAL_SERVICES'
        WHEN 'DELEGATING_NURSE' THEN 'CLINICAL_SERVICES'
        WHEN 'DRIVER' THEN 'COMMUNITY_LIVING'
        WHEN 'DSP' THEN 'COMMUNITY_LIVING'
        ELSE 'ADMINISTRATION'
      END
    LIMIT 1
  )
)
FROM "JobOpening" opening
WHERE application."jobOpeningId"=opening."id"
  AND application."departmentId" IS NULL;

UPDATE "EmployeeApplication" application
SET "departmentId"=(
  SELECT department."id" FROM "Department" department
  WHERE department."organizationId"=application."organizationId"
    AND department."legalEntityId"=application."legalEntityId"
    AND department."code"=CASE application."appliedRole"::text
      WHEN 'RN' THEN 'CLINICAL_SERVICES'
      WHEN 'LPN' THEN 'CLINICAL_SERVICES'
      WHEN 'DELEGATING_NURSE' THEN 'CLINICAL_SERVICES'
      WHEN 'DRIVER' THEN 'COMMUNITY_LIVING'
      WHEN 'DSP' THEN 'COMMUNITY_LIVING'
      ELSE 'ADMINISTRATION'
    END
  LIMIT 1
)
WHERE application."departmentId" IS NULL;

UPDATE "EmploymentOffer" offer
SET "departmentId"=application."departmentId"
FROM "EmployeeApplication" application
WHERE offer."applicationId"=application."id" AND offer."departmentId" IS NULL;

UPDATE "InterviewInvitation" invitation
SET "departmentId"=application."departmentId"
FROM "EmployeeApplication" application
WHERE invitation."applicationId"=application."id" AND invitation."departmentId" IS NULL;

UPDATE "InterviewSlot" slot
SET "departmentId"=application."departmentId"
FROM "EmployeeApplication" application
WHERE slot."bookedApplicationId"=application."id" AND slot."departmentId" IS NULL;

UPDATE "EmployeeOnboardingLink" onboarding
SET "departmentId"=application."departmentId"
FROM "EmployeeApplication" application
WHERE onboarding."applicationId"=application."id" AND onboarding."departmentId" IS NULL;

UPDATE "EmployeeOnboardingSnapshot" snapshot
SET "departmentId"=application."departmentId"
FROM "EmployeeApplication" application
WHERE snapshot."applicationId"=application."id" AND snapshot."departmentId" IS NULL;

DO $$
DECLARE
  target record;
  constraint_name text;
BEGIN
  FOR target IN
    SELECT column_row.table_name
    FROM information_schema.columns column_row
    WHERE column_row.table_schema='public' AND column_row.column_name='legalEntityId'
      AND (
        column_row.table_name='JobOpening'
        OR column_row.table_name='EmployeeApplication'
        OR column_row.table_name='CompanySetting'
        OR column_row.table_name LIKE 'Applicant%'
        OR column_row.table_name LIKE 'Interview%'
        OR column_row.table_name LIKE 'EmploymentOffer%'
        OR column_row.table_name IN ('EmployeeOnboardingLink','EmployeeOnboardingSnapshot')
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.columns organization_column
        WHERE organization_column.table_schema='public'
          AND organization_column.table_name=column_row.table_name
          AND organization_column.column_name='organizationId'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "legalEntityId" SET NOT NULL', target.table_name);
  END LOOP;

  FOR target IN
    SELECT column_row.table_name
    FROM information_schema.columns column_row
    WHERE column_row.table_schema='public' AND column_row.column_name='departmentId'
      AND column_row.table_name IN (
        'JobOpening','EmployeeApplication','EmploymentOffer','InterviewSlot',
        'InterviewInvitation','EmployeeOnboardingLink','EmployeeOnboardingSnapshot'
      )
  LOOP
    constraint_name := left(target.table_name,40) || '_entity_department_fkey';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=constraint_name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("organizationId","legalEntityId","departmentId") REFERENCES "Department"("organizationId","legalEntityId","id") NOT VALID',
        target.table_name,
        constraint_name
      );
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', target.table_name, constraint_name);
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("organizationId","legalEntityId","departmentId")',
      left(target.table_name,40) || '_entity_department_idx', target.table_name);
  END LOOP;
END $$;

-- Company-specific careers settings and interview times may now coexist.
ALTER TABLE "CompanySetting" DROP CONSTRAINT IF EXISTS "CompanySetting_pkey";
ALTER TABLE "CompanySetting" ADD CONSTRAINT "CompanySetting_pkey"
  PRIMARY KEY ("organizationId","legalEntityId");

DROP INDEX IF EXISTS "JobOpening_organizationId_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "JobOpening_entity_slug_key"
  ON "JobOpening"("organizationId","legalEntityId","slug");

DROP INDEX IF EXISTS "EmployeeApplication_sourceExternalId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeApplication_entity_sourceExternalId_key"
  ON "EmployeeApplication"("organizationId","legalEntityId","sourceExternalId")
  WHERE "sourceExternalId" IS NOT NULL;

DROP INDEX IF EXISTS "InterviewSlot_organization_starts_key";
CREATE UNIQUE INDEX IF NOT EXISTS "InterviewSlot_entity_starts_key"
  ON "InterviewSlot"("organizationId","legalEntityId","startsAt");
