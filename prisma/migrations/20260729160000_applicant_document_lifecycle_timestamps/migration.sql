-- Add applicant document lifecycle timestamps used by application intake,
-- document requests, applicant uploads, and the administration folder UI.
-- These columns were referenced by the API before they existed in the database.

ALTER TABLE "ApplicantDocument"
  ADD COLUMN IF NOT EXISTS "requestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "uploadedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ApplicantDocument_requestedAt_idx"
  ON "ApplicantDocument"("status","requestedAt");
