CREATE TABLE IF NOT EXISTS "AdminDesktopProfile" (
  "userId" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "profile" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "wallpapers" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AdminDesktopProfile_organizationId_idx"
  ON "AdminDesktopProfile" ("organizationId");
