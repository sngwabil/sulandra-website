CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Stage 4: assign all current company-owned operational data to SCLS.
--
-- This is intentionally a compatibility migration. It adds and backfills the
-- legalEntityId discriminator, but does not make it NOT NULL yet. Each module's
-- conversion stage will require the selected entity on new writes and enforce
-- entity/department access before that module is considered converted.
--
-- Enterprise identity and shared-product data remain organization-scoped:
-- User, EmployeePortalCredential, EmployeeAuthSession, EmployeeMfaProfile,
-- EmployeePortalAccessControl, EmployeeLoginEvent, EmployeeAccountSecurityEvent,
-- ApplicantPortalAccount, ApplicantPasswordReset, EmployeeLearningCourse,
-- AdminDesktopProfile, IntranetContentItem, and IntranetContentSettings.

CREATE UNIQUE INDEX IF NOT EXISTS "LegalEntity_org_id_key"
  ON "LegalEntity"("organizationId","id");

CREATE TABLE IF NOT EXISTS "OperationalEntityBackfillAudit" (
  "migrationKey" text NOT NULL,
  "tableName" text NOT NULL,
  "rowsBackfilled" bigint NOT NULL DEFAULT 0,
  "remainingUnassignedRows" bigint NOT NULL DEFAULT 0,
  "completedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("migrationKey","tableName")
);

DO $$
DECLARE
  target record;
  changed_rows bigint;
  remaining_rows bigint;
  identifier_base text;
  index_name text;
  constraint_name text;
BEGIN
  FOR target IN
    SELECT column_row.table_name
    FROM information_schema.columns column_row
    WHERE column_row.table_schema='public'
      AND column_row.column_name='organizationId'
      AND (
        column_row.table_name ~ '^Applicant'
        OR column_row.table_name='EmployeeApplication'
        OR column_row.table_name ~ '^EmploymentOffer'
        OR column_row.table_name ~ '^Interview'
        OR column_row.table_name='JobOpening'
        OR column_row.table_name ~ '^Employee'
        OR column_row.table_name ~ '^TimeAttendance'
        OR column_row.table_name ~ '^ServiceHome'
        OR column_row.table_name='Client'
        OR column_row.table_name='ClientServiceRequest'
        OR column_row.table_name='Location'
        OR column_row.table_name ~ '^Spire'
        OR column_row.table_name='CompanySetting'
        OR column_row.table_name='EducationAssignment'
        OR column_row.table_name='AuditEvent'
      )
      AND column_row.table_name NOT IN (
        'Employment',
        'EmployeePortalCredential',
        'EmployeeAuthSession',
        'EmployeeMfaProfile',
        'EmployeePortalAccessControl',
        'EmployeeLoginEvent',
        'EmployeeAccountSecurityEvent',
        'ApplicantPortalAccount',
        'ApplicantPasswordReset',
        'EmployeeLearningCourse',
        'AdminDesktopProfile',
        'IntranetContentItem',
        'IntranetContentSettings'
      )
    ORDER BY column_row.table_name
  LOOP
    identifier_base := left(regexp_replace(target.table_name,'[^A-Za-z0-9]','','g'),36)
      || '_' || substr(md5(target.table_name),1,8);
    index_name := identifier_base || '_org_entity_idx';
    constraint_name := identifier_base || '_org_entity_fkey';

    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS "legalEntityId" text',
      target.table_name
    );

    EXECUTE format(
      'UPDATE %I AS operational_row
       SET "legalEntityId"=entity."id"
       FROM "LegalEntity" entity
       WHERE operational_row."organizationId"=entity."organizationId"
         AND entity."code"=''SCLS''
         AND operational_row."organizationId" IS NOT NULL
         AND operational_row."legalEntityId" IS NULL',
      target.table_name
    );
    GET DIAGNOSTICS changed_rows = ROW_COUNT;

    EXECUTE format(
      'SELECT count(*) FROM %I
       WHERE "organizationId" IS NOT NULL AND "legalEntityId" IS NULL',
      target.table_name
    ) INTO remaining_rows;

    IF remaining_rows > 0 THEN
      RAISE EXCEPTION 'SCLS operational backfill left % unassigned rows in %', remaining_rows, target.table_name;
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I ("organizationId","legalEntityId")',
      index_name,
      target.table_name
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid=format('public.%I',target.table_name)::regclass
        AND constraint_row.conname=constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I
         FOREIGN KEY ("organizationId","legalEntityId")
         REFERENCES "LegalEntity"("organizationId","id") NOT VALID',
        target.table_name,
        constraint_name
      );
      EXECUTE format(
        'ALTER TABLE %I VALIDATE CONSTRAINT %I',
        target.table_name,
        constraint_name
      );
    END IF;

    EXECUTE format(
      'COMMENT ON COLUMN %I."legalEntityId" IS %L',
      target.table_name,
      'Owning Sulandra legal entity. Existing data was assigned to SCLS by Stage 4.'
    );

    INSERT INTO "OperationalEntityBackfillAudit" (
      "migrationKey","tableName","rowsBackfilled","remainingUnassignedRows","completedAt"
    ) VALUES (
      '20260808230000_scls_operational_data_backfill',target.table_name,changed_rows,remaining_rows,now()
    )
    ON CONFLICT ("migrationKey","tableName") DO UPDATE SET
      "rowsBackfilled"=GREATEST("OperationalEntityBackfillAudit"."rowsBackfilled",EXCLUDED."rowsBackfilled"),
      "remainingUnassignedRows"=EXCLUDED."remainingUnassignedRows",
      "completedAt"=EXCLUDED."completedAt";
  END LOOP;
END $$;

-- The first migration already created normalized entity records for employees
-- and clients. Reassert those assignments so a retry or partially completed
-- earlier deployment still leaves every current record owned by SCLS.
UPDATE "Employment" employment
SET "legalEntityId"=entity."id","updatedAt"=now()
FROM "LegalEntity" entity
WHERE employment."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND employment."source"='EXISTING_SCLS_BACKFILL'
  AND employment."legalEntityId"<>entity."id";

UPDATE "ClientEnrollment" enrollment
SET "legalEntityId"=entity."id","updatedAt"=now()
FROM "LegalEntity" entity
WHERE enrollment."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND enrollment."source"='EXISTING_SCLS_BACKFILL'
  AND enrollment."legalEntityId"<>entity."id";
