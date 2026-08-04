ALTER TABLE "EmploymentOfferDocument"
  ADD COLUMN IF NOT EXISTS "formRevision" TEXT,
  ADD COLUMN IF NOT EXISTS "generatedPdf" BYTEA,
  ADD COLUMN IF NOT EXISTS "fileName" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "contentSha256" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "EmploymentOfferDocument_formRevision_idx"
  ON "EmploymentOfferDocument"("formRevision");
CREATE INDEX IF NOT EXISTS "EmploymentOfferDocument_contentSha256_idx"
  ON "EmploymentOfferDocument"("contentSha256");
