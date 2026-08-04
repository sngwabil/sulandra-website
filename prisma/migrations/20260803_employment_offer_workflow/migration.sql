CREATE TABLE IF NOT EXISTS "EmploymentOffer" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OFFER_SENT',
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
  "ptoEligible" BOOLEAN NOT NULL DEFAULT FALSE,
  "benefitsEligible" BOOLEAN NOT NULL DEFAULT FALSE,
  "probationDays" INTEGER NOT NULL DEFAULT 90,
  "bonusAmount" DECIMAL(12,2),
  "notes" TEXT,
  "requiredDocuments" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "tokenHash" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "viewedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "documentsCompletedAt" TIMESTAMP(3),
  "acceptedByName" TEXT,
  "signature" TEXT,
  "employeeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmploymentOffer_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmploymentOffer_tokenHash_key" ON "EmploymentOffer"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmploymentOffer_applicationId_idx" ON "EmploymentOffer"("applicationId");
CREATE INDEX IF NOT EXISTS "EmploymentOffer_organizationId_idx" ON "EmploymentOffer"("organizationId");
CREATE INDEX IF NOT EXISTS "EmploymentOffer_status_idx" ON "EmploymentOffer"("status");

CREATE TABLE IF NOT EXISTS "EmploymentOfferDocument" (
  "id" TEXT PRIMARY KEY,
  "offerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "signature" TEXT,
  "signedByName" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmploymentOfferDocument_offerId_name_key" UNIQUE ("offerId", "name"),
  CONSTRAINT "EmploymentOfferDocument_offerId_fkey"
    FOREIGN KEY ("offerId") REFERENCES "EmploymentOffer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EmploymentOfferDocument_offerId_idx" ON "EmploymentOfferDocument"("offerId");
CREATE INDEX IF NOT EXISTS "EmploymentOfferDocument_status_idx" ON "EmploymentOfferDocument"("status");
