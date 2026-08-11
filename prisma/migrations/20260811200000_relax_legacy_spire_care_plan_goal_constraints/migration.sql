-- Production compatibility repair for legacy SpireCarePlanGoal columns.
--
-- Some production databases contain an older generation of SpireCarePlanGoal.
-- The modern schema was added alongside those legacy columns, preserving data,
-- but one or more obsolete legacy-only columns can still carry NOT NULL
-- constraints. Modern SPIRE intentionally does not populate unknown legacy
-- fields, so an otherwise-complete goal insert fails with PostgreSQL 23502.
--
-- Preserve every legacy column and every existing value. Only relax NOT NULL on
-- columns that are NOT part of the canonical current SPIRE care-plan-goal shape.
-- This is additive/idempotent and avoids guessing or hard-coding historical
-- column names that can differ between partially migrated production databases.

DO $$
DECLARE
  legacy_column record;
BEGIN
  IF to_regclass('public."SpireCarePlanGoal"') IS NULL THEN
    RETURN;
  END IF;

  FOR legacy_column IN
    SELECT c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'SpireCarePlanGoal'
      AND c.is_nullable = 'NO'
      AND c.column_name NOT IN (
        'id',
        'organizationId',
        'legalEntityId',
        'patientId',
        'carePlanId',
        'title',
        'baseline',
        'desiredOutcome',
        'targetValue',
        'targetUnit',
        'frequency',
        'responsibleDiscipline',
        'status',
        'progressPercent',
        'startsAt',
        'dueDate',
        'reviewDate',
        'createdById',
        'createdAt',
        'updatedAt'
      )
  LOOP
    RAISE NOTICE 'Relaxing obsolete SpireCarePlanGoal legacy NOT NULL column: %', legacy_column.column_name;
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL',
      'SpireCarePlanGoal',
      legacy_column.column_name
    );
  END LOOP;
END
$$;

-- Reassert defaults/constraints that are intentionally required by the current
-- SPIRE model. These are the fields the modern insert always supplies or can
-- safely default, and they are not legacy compatibility fields.
UPDATE "SpireCarePlanGoal"
SET "title" = COALESCE(NULLIF(BTRIM("desiredOutcome"), ''), 'Care plan goal')
WHERE "title" IS NULL OR BTRIM("title") = '';

UPDATE "SpireCarePlanGoal"
SET "status" = 'ACTIVE'
WHERE "status" IS NULL OR BTRIM("status") = '';

UPDATE "SpireCarePlanGoal"
SET "progressPercent" = 0
WHERE "progressPercent" IS NULL;

UPDATE "SpireCarePlanGoal"
SET "createdAt" = now()
WHERE "createdAt" IS NULL;

UPDATE "SpireCarePlanGoal"
SET "updatedAt" = COALESCE("createdAt", now())
WHERE "updatedAt" IS NULL;

ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "progressPercent" SET DEFAULT 0;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "progressPercent" SET NOT NULL;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "updatedAt" SET NOT NULL;

COMMENT ON TABLE "SpireCarePlanGoal" IS
  'SPIRE care-plan goals. Legacy columns may remain for backward compatibility, but obsolete legacy-only fields are not required for current goal inserts.';
