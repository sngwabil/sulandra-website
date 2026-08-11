CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Owner-directed field operations foundation.
-- Sulandra will use its own in-network workflows for diagnostics and revenue for now.
-- External PACS/LIS/X12/eRx/PDMP/telehealth gateway tables are intentionally not
-- required by this migration. Diagnostic results can be entered manually or attached
-- as protected documents through existing SPIRE result/document workflows.
--
-- This migration previously failed before completion in production. Every table and
-- index below is deliberately additive and retry-safe so the recognized failed Prisma
-- record can be resolved and safely replayed without deleting existing data.

CREATE TABLE IF NOT EXISTS "SpireMobileOAuthClient" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "clientId" text NOT NULL,
  "name" text NOT NULL,
  "platform" text NOT NULL,
  "bundleId" text NOT NULL,
  "redirectUris" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "allowedScopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "clientId" text;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "platform" text;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "bundleId" text;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "redirectUris" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "allowedScopes" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "createdById" text;
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpireMobileOAuthClient" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS "SpireMobileOAuthClient_org_client_key" ON "SpireMobileOAuthClient"("organizationId","clientId");
CREATE INDEX IF NOT EXISTS "SpireMobileOAuthClient_scope_idx" ON "SpireMobileOAuthClient"("organizationId","legalEntityId","active");

CREATE TABLE IF NOT EXISTS "SpireMobileAccessGrant" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text,
  "clientId" text NOT NULL,
  "userId" text NOT NULL,
  "role" text NOT NULL,
  "scopes" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "jtiHash" text NOT NULL,
  "deviceId" text,
  "issuedAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "lastUsedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "clientId" text;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "role" text;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "scopes" text[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "jtiHash" text;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "deviceId" text;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "issuedAt" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "expiresAt" timestamptz;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "revokedAt" timestamptz;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "lastUsedAt" timestamptz;
ALTER TABLE "SpireMobileAccessGrant" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS "SpireMobileAccessGrant_jti_key" ON "SpireMobileAccessGrant"("organizationId","jtiHash");
CREATE INDEX IF NOT EXISTS "SpireMobileAccessGrant_user_idx" ON "SpireMobileAccessGrant"("organizationId","userId","expiresAt" DESC);

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

CREATE TABLE IF NOT EXISTS "SpireMobileBuild" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "platform" text NOT NULL,
  "bundleId" text NOT NULL,
  "version" text NOT NULL,
  "buildNumber" text NOT NULL,
  "gitSha" text,
  "distribution" text NOT NULL,
  "status" text NOT NULL DEFAULT 'REGISTERED',
  "artifactUrl" text,
  "releasedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "platform" text;
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "bundleId" text;
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "version" text;
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "buildNumber" text;
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "gitSha" text;
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "distribution" text;
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'REGISTERED';
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "artifactUrl" text;
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "releasedAt" timestamptz;
ALTER TABLE "SpireMobileBuild" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS "SpireMobileBuild_key" ON "SpireMobileBuild"("platform","bundleId","version","buildNumber");

-- Make the existing field-service workflows company-aware for all future writes.
-- Existing rows are intentionally left nullable instead of guessing ownership.
ALTER TABLE "SpireEvvVisit" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireServiceAuthorization" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireAuthorizationLedger" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireAuthorizationAlert" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireBillingReconciliation" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireAppointment" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
CREATE INDEX IF NOT EXISTS "SpireEvvVisit_entity_employee_idx" ON "SpireEvvVisit"("organizationId","legalEntityId","employeeUserId","status","scheduledStart");
CREATE INDEX IF NOT EXISTS "SpireAppointment_entity_provider_idx" ON "SpireAppointment"("organizationId","legalEntityId","providerUserId","startsAt");
