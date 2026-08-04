CREATE TABLE IF NOT EXISTS "ConsultationRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "referenceNumber" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "service" TEXT NOT NULL,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ConsultationRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsultationRequest_referenceNumber_key" UNIQUE ("referenceNumber"),
  CONSTRAINT "ConsultationRequest_status_check" CHECK ("status" IN ('NEW', 'CONTACTED', 'CLOSED'))
);

CREATE INDEX IF NOT EXISTS "ConsultationRequest_status_createdAt_idx"
  ON "ConsultationRequest" ("status", "createdAt" DESC);
