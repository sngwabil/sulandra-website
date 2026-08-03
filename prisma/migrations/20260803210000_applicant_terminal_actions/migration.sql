-- Support explicit terminal applicant actions.
-- Position-filled applications remain in the retained archive; not-selected records may be deleted.

ALTER TABLE "EmployeeApplication"
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" TEXT,
  ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;

CREATE INDEX IF NOT EXISTS "EmployeeApplication_archive_idx"
  ON "EmployeeApplication"("organizationId","archivedAt","submittedAt");
