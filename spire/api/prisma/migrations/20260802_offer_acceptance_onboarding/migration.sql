CREATE TABLE IF NOT EXISTS "EmploymentOffer" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL UNIQUE,
  "employeeId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OFFER_PENDING',
  "positionTitle" TEXT NOT NULL,
  "department" TEXT,
  "supervisorName" TEXT,
  "employmentType" TEXT NOT NULL,
  "compensationType" TEXT NOT NULL,
  "payAmount" DECIMAL(12,2) NOT NULL,
  "shift" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "orientationDate" TIMESTAMP(3),
  "workLocation" TEXT,
  "ptoEligible" BOOLEAN NOT NULL DEFAULT false,
  "benefitsEligible" BOOLEAN NOT NULL DEFAULT false,
  "probationDays" INTEGER NOT NULL DEFAULT 90,
  "bonusAmount" DECIMAL(12,2),
  "notes" TEXT,
  "requiredDocuments" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "viewedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "documentsCompletedAt" TIMESTAMP(3),
  "acceptedByName" TEXT,
  "signature" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "EmploymentOffer_applicationId_idx" ON "EmploymentOffer"("applicationId");
CREATE INDEX IF NOT EXISTS "EmploymentOffer_status_idx" ON "EmploymentOffer"("status");
CREATE INDEX IF NOT EXISTS "EmploymentOffer_tokenHash_idx" ON "EmploymentOffer"("tokenHash");

ALTER TABLE "EmploymentOffer"
  ADD CONSTRAINT "EmploymentOffer_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmploymentOffer"
  ADD CONSTRAINT "EmploymentOffer_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
