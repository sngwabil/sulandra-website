-- Reconcile SpirePushDelivery on environments where the canonical mobile
-- connectivity migration was recorded/applied but the relation is absent.
-- This migration is intentionally additive and retry-safe.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SpirePushDelivery" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "userId" text NOT NULL,
  "deviceId" text REFERENCES "SpirePushDevice"("id") ON DELETE SET NULL,
  "category" text NOT NULL,
  "title" text NOT NULL DEFAULT 'Sulandra Health',
  "body" text NOT NULL DEFAULT 'You have a new work update. Open Sulandra Health to review it.',
  "deepLink" text,
  "collapseKey" text,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "priority" text NOT NULL DEFAULT 'NORMAL',
  "status" text NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" text,
  "errorCode" text,
  "attemptCount" integer NOT NULL DEFAULT 0,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "sentAt" timestamptz
);

ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "deviceId" text;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "title" text NOT NULL DEFAULT 'Sulandra Health';
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "body" text NOT NULL DEFAULT 'You have a new work update. Open Sulandra Health to review it.';
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "deepLink" text;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "collapseKey" text;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "data" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'QUEUED';
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "providerMessageId" text;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "errorCode" text;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "attemptCount" integer NOT NULL DEFAULT 0;
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "nextAttemptAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpirePushDelivery" ADD COLUMN IF NOT EXISTS "sentAt" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = '"SpirePushDelivery"'::regclass
       AND contype = 'f'
       AND pg_get_constraintdef(oid) LIKE '%FOREIGN KEY ("deviceId") REFERENCES "SpirePushDevice"(id)%'
  ) THEN
    ALTER TABLE "SpirePushDelivery"
      ADD CONSTRAINT "SpirePushDelivery_deviceId_fkey"
      FOREIGN KEY ("deviceId") REFERENCES "SpirePushDevice"("id") ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "SpirePushDelivery_queue_idx"
  ON "SpirePushDelivery"("status","nextAttemptAt","createdAt");
CREATE INDEX IF NOT EXISTS "SpirePushDelivery_user_idx"
  ON "SpirePushDelivery"("organizationId","userId","status","createdAt" DESC);
