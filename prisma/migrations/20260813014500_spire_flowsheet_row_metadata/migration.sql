-- S.P.I.R.E. continuous flowsheet row metadata required by the live workspace.
-- This migration is intentionally additive and idempotent so existing clinical
-- rows and entries remain intact.

ALTER TABLE "SpireFlowsheetRow"
  ADD COLUMN IF NOT EXISTS "description" text,
  ADD COLUMN IF NOT EXISTS "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "sortOrder" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "SpireFlowsheetRow_org_active_sort_idx"
  ON "SpireFlowsheetRow" ("organizationId", "active", "sortOrder", "groupName", "name");
