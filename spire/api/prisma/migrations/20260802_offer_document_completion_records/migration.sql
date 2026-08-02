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
