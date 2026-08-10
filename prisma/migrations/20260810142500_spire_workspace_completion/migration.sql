-- Finish the remaining SPIRE workspaces with server-side personalization and note cosign responses.
-- This migration is additive and retry-safe. Do not edit it after production applies it.

CREATE TABLE IF NOT EXISTS "SpireUserWorkspacePreference" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceTabs" JSONB NOT NULL DEFAULT '{"order":[],"hidden":[]}'::jsonb,
  "speedButtons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "savedFilters" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireUserWorkspacePreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SpireUserWorkspacePreference_scope_key"
  ON "SpireUserWorkspacePreference"("organizationId","legalEntityId","userId");
CREATE INDEX IF NOT EXISTS "SpireUserWorkspacePreference_entity_idx"
  ON "SpireUserWorkspacePreference"("organizationId","legalEntityId");

CREATE TABLE IF NOT EXISTS "SpireSmartText" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "legalEntityId" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "sharedOrganizationWide" BOOLEAN NOT NULL DEFAULT FALSE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireSmartText_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SpireSmartText_owner_name_key"
  ON "SpireSmartText"("organizationId","legalEntityId","ownerUserId",LOWER("name"))
  WHERE "active"=TRUE;
CREATE INDEX IF NOT EXISTS "SpireSmartText_lookup_idx"
  ON "SpireSmartText"("organizationId","legalEntityId","ownerUserId","active");

DO $$
BEGIN
  IF to_regclass('"SpireNoteCosigner"') IS NOT NULL THEN
    ALTER TABLE "SpireNoteCosigner" ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMPTZ;
    ALTER TABLE "SpireNoteCosigner" ADD COLUMN IF NOT EXISTS "respondedById" TEXT;
    ALTER TABLE "SpireNoteCosigner" ADD COLUMN IF NOT EXISTS "responseComment" TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SpireNoteCosigner_pending_user_idx"
  ON "SpireNoteCosigner"("organizationId","cosignerUserId","status")
  WHERE "status"='PENDING';
