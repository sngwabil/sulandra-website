-- S.P.I.R.E. medication ordering V2
-- Additive only: preserves all existing medication orders and MAR administrations.

ALTER TABLE "SpireMedicationOrder"
  ADD COLUMN IF NOT EXISTS "scheduleMode" TEXT NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN IF NOT EXISTS "frequencyCode" TEXT,
  ADD COLUMN IF NOT EXISTS "intervalHours" NUMERIC,
  ADD COLUMN IF NOT EXISTS "daysOfWeek" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "prnReason" TEXT,
  ADD COLUMN IF NOT EXISTS "maxDosesPer24Hours" INTEGER,
  ADD COLUMN IF NOT EXISTS "maxDailyDoseMg" NUMERIC,
  ADD COLUMN IF NOT EXISTS "activeIngredient" TEXT,
  ADD COLUMN IF NOT EXISTS "doseAmount" NUMERIC,
  ADD COLUMN IF NOT EXISTS "doseUnit" TEXT,
  ADD COLUMN IF NOT EXISTS "administrationDetails" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "slidingScale" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "holdParameters" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "linkedOrderGroupId" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedOrderRule" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "prescriberName" TEXT,
  ADD COLUMN IF NOT EXISTS "prescriberCredentials" TEXT,
  ADD COLUMN IF NOT EXISTS "prescriberOrderDate" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "orderSource" TEXT,
  ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "lastSafetyReviewedAt" TIMESTAMPTZ;

UPDATE "SpireMedicationOrder"
SET
  "scheduleMode" = CASE
    WHEN UPPER(COALESCE("frequency",'')) LIKE '%PRN%'
      OR UPPER(COALESCE("instructions",'')) LIKE '%AS NEEDED%'
      THEN 'PRN'
    ELSE COALESCE(NULLIF("scheduleMode",''),'SCHEDULED')
  END,
  "frequencyCode" = COALESCE(NULLIF("frequencyCode",''), UPPER(REPLACE(COALESCE("frequency",'CUSTOM'),' ','_')))
WHERE "frequencyCode" IS NULL OR "frequencyCode" = '' OR "scheduleMode" IS NULL OR "scheduleMode" = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SpireMedicationOrder_scheduleMode_check'
  ) THEN
    ALTER TABLE "SpireMedicationOrder"
      ADD CONSTRAINT "SpireMedicationOrder_scheduleMode_check"
      CHECK ("scheduleMode" IN ('SCHEDULED','PRN','DAYS_OF_WEEK','ONE_TIME','CONTINUOUS','CUSTOM'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SpireMedicationOrder_linked_group_idx"
  ON "SpireMedicationOrder" ("organizationId", "clientId", "linkedOrderGroupId")
  WHERE "linkedOrderGroupId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "SpireMedicationOrderRevision" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "medicationOrderId" TEXT NOT NULL REFERENCES "SpireMedicationOrder"("id") ON DELETE CASCADE,
  "revision" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changeType" TEXT NOT NULL,
  "changeReason" TEXT,
  "changedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireMedicationOrderRevision_order_revision_key" UNIQUE ("medicationOrderId", "revision")
);
CREATE INDEX IF NOT EXISTS "SpireMedicationOrderRevision_history_idx"
  ON "SpireMedicationOrderRevision" ("organizationId", "clientId", "medicationOrderId", "revision" DESC);

CREATE TABLE IF NOT EXISTS "SpireMedicationSafetyEvent" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "medicationOrderId" TEXT,
  "administrationId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "context" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireMedicationSafetyEvent_severity_check" CHECK ("severity" IN ('INFO','WARNING','BLOCK')),
  CONSTRAINT "SpireMedicationSafetyEvent_action_check" CHECK ("action" IN ('ORDER_VALIDATION','MAR_PREFLIGHT','OVERRIDE_ACKNOWLEDGED','ORDER_CHANGED'))
);
CREATE INDEX IF NOT EXISTS "SpireMedicationSafetyEvent_client_created_idx"
  ON "SpireMedicationSafetyEvent" ("organizationId", "clientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireMedicationSafetyEvent_order_created_idx"
  ON "SpireMedicationSafetyEvent" ("medicationOrderId", "createdAt" DESC);
