CREATE TABLE IF NOT EXISTS "IntranetContentItem" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "slotKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "eyebrow" TEXT NOT NULL DEFAULT '',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "imageObjectKey" TEXT,
  "imageMimeType" TEXT,
  "externalImageUrl" TEXT NOT NULL DEFAULT '',
  "linkUrl" TEXT NOT NULL DEFAULT '',
  "linkLabel" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER NOT NULL DEFAULT 8000,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "startsAt" TIMESTAMPTZ,
  "endsAt" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IntranetContentItem_org_slot_idx" ON "IntranetContentItem"("organizationId","slotKey","active","sortOrder");

CREATE TABLE IF NOT EXISTS "IntranetContentSettings" (
  "organizationId" TEXT PRIMARY KEY,
  "heroAutoplay" BOOLEAN NOT NULL DEFAULT TRUE,
  "heroIntervalMs" INTEGER NOT NULL DEFAULT 8000,
  "newsAutoplay" BOOLEAN NOT NULL DEFAULT FALSE,
  "newsIntervalMs" INTEGER NOT NULL DEFAULT 10000,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
