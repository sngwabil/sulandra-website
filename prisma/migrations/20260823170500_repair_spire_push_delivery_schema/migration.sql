-- Repair the SPIRE field-push queue schema for environments where the
-- canonical 20260811121500_spire_external_connectivity_foundation migration
-- was recorded/applied without these additive objects being present.
--
-- Keep this migration retry-safe and aligned with the canonical table shapes.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SpirePushDevice" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "userId" text NOT NULL,
  "platform" text NOT NULL,
  "provider" text NOT NULL,
  "tokenHash" text NOT NULL,
  "tokenCiphertext" text,
  "appBundleId" text,
  "environment" text NOT NULL DEFAULT 'PRODUCTION',
  "deviceLabel" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "platform" text;
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "provider" text;
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "tokenHash" text;
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "tokenCiphertext" text;
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "appBundleId" text;
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "environment" text NOT NULL DEFAULT 'PRODUCTION';
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "deviceLabel" text;
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "lastSeenAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpirePushDevice" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS "SpirePushDevice_token_idx" ON "SpirePushDevice"("organizationId","userId","provider","tokenHash");
CREATE INDEX IF NOT EXISTS "SpirePushDevice_user_idx" ON "SpirePushDevice"("organizationId","legalEntityId","userId","status");

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
CREATE INDEX IF NOT EXISTS "SpirePushDelivery_queue_idx" ON "SpirePushDelivery"("status","nextAttemptAt","createdAt");
CREATE INDEX IF NOT EXISTS "SpirePushDelivery_user_idx" ON "SpirePushDelivery"("organizationId","userId","status","createdAt" DESC);
