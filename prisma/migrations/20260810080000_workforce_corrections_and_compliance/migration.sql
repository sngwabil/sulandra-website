CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "EmployeeTimeCorrection" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "userId" text NOT NULL,
  "originalPunchId" text REFERENCES "EmployeeTimePunch"("id") ON DELETE RESTRICT,
  "correctionKind" text NOT NULL,
  "requestedPunchType" text,
  "requestedOccurredAt" timestamptz,
  "requestedLocationType" text,
  "requestedClientId" text REFERENCES "SpirePatient"("id") ON DELETE SET NULL,
  "requestedNote" text,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "requestedByUserId" text NOT NULL,
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedAt" timestamptz,
  "reviewedById" text,
  "reviewNotes" text,
  "appliedAt" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "EmployeeTimeCorrection_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeTimeCorrection_kind_check" CHECK ("correctionKind" IN ('ADD_MISSING_PUNCH','CHANGE_PUNCH','VOID_PUNCH','ANNOTATE_PUNCH')),
  CONSTRAINT "EmployeeTimeCorrection_type_check" CHECK ("requestedPunchType" IS NULL OR "requestedPunchType" IN ('CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT')),
  CONSTRAINT "EmployeeTimeCorrection_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeTimeCorrection_user_idx" ON "EmployeeTimeCorrection"("organizationId","legalEntityId","userId","requestedAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeTimeCorrection_status_idx" ON "EmployeeTimeCorrection"("organizationId","legalEntityId","status","requestedAt");

CREATE TABLE IF NOT EXISTS "EmployeeDocumentComplianceReview" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "documentId" text NOT NULL REFERENCES "EmployeeDocumentSubmission"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "reviewType" text NOT NULL,
  "dueAt" timestamptz,
  "status" text NOT NULL DEFAULT 'OPEN',
  "notes" text,
  "createdByUserId" text,
  "resolvedAt" timestamptz,
  "resolvedByUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeDocumentComplianceReview_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeDocumentComplianceReview_type_check" CHECK ("reviewType" IN ('EXPIRING','EXPIRED','MISSING_REPLACEMENT','MANUAL_REVIEW')),
  CONSTRAINT "EmployeeDocumentComplianceReview_status_check" CHECK ("status" IN ('OPEN','RESOLVED','DISMISSED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeDocumentComplianceReview_open_idx" ON "EmployeeDocumentComplianceReview"("organizationId","legalEntityId","status","dueAt");
