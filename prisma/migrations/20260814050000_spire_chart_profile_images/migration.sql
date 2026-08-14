-- Patient-scoped chart profile images.
-- Small, browser-normalized JPEG/PNG/WebP profile images are stored directly in
-- PostgreSQL so chart avatars do not depend on optional external object storage.

CREATE TABLE IF NOT EXISTS "SpireChartProfileImage" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "providerName" TEXT,
  "mimeType" TEXT NOT NULL,
  "imageData" BYTEA NOT NULL,
  "sha256" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireChartProfileImage_kind_check" CHECK ("kind" IN ('CLIENT','PCP')),
  CONSTRAINT "SpireChartProfileImage_org_patient_kind_key" UNIQUE ("organizationId","patientId","kind")
);

CREATE INDEX IF NOT EXISTS "SpireChartProfileImage_patient_idx"
  ON "SpireChartProfileImage" ("organizationId","patientId");
