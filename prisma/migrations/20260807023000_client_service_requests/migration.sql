CREATE TABLE IF NOT EXISTS "ClientServiceRequest" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "requesterName" TEXT NOT NULL,
  "requesterRelationship" TEXT NOT NULL DEFAULT 'Self',
  "clientName" TEXT NOT NULL,
  "clientDateOfBirth" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "preferredContact" TEXT NOT NULL DEFAULT 'EMAIL',
  "streetAddress" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT 'OH',
  "zipCode" TEXT NOT NULL DEFAULT '',
  "county" TEXT NOT NULL DEFAULT '',
  "fundingSource" TEXT NOT NULL DEFAULT '',
  "serviceTypes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "urgency" TEXT NOT NULL DEFAULT 'ROUTINE',
  "currentProvider" TEXT NOT NULL DEFAULT '',
  "requestedStartDate" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "assignedToUserId" TEXT,
  "serviceHomeId" TEXT,
  "internalNotes" TEXT NOT NULL DEFAULT '',
  "dispositionReason" TEXT NOT NULL DEFAULT '',
  "nextFollowUpAt" TIMESTAMPTZ,
  "consentAt" TIMESTAMPTZ NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ClientServiceRequest_requestNumber_key" UNIQUE ("requestNumber")
);

CREATE INDEX IF NOT EXISTS "ClientServiceRequest_org_status_idx" ON "ClientServiceRequest"("organizationId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ClientServiceRequest_org_urgency_idx" ON "ClientServiceRequest"("organizationId","urgency","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ClientServiceRequest_org_followup_idx" ON "ClientServiceRequest"("organizationId","nextFollowUpAt");
CREATE INDEX IF NOT EXISTS "ClientServiceRequest_org_email_idx" ON "ClientServiceRequest"("organizationId","email");
