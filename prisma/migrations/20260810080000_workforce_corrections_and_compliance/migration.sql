CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- This migration previously failed during Railway predeploy and may have left
-- partially-created support tables. These two tables were introduced only by
-- this migration and cannot contain committed production workflow data because
-- the migration never completed. Recreate them deterministically on retry.
DROP TABLE IF EXISTS "EmployeeDocumentComplianceReview" CASCADE;
DROP TABLE IF EXISTS "EmployeeTimeCorrection" CASCADE;

CREATE TABLE "EmployeeTimeCorrection" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "userId" text NOT NULL,
  "originalPunchId" text,
  "correctionKind" text NOT NULL,
  "requestedPunchType" text,
  "requestedOccurredAt" timestamptz,
  "requestedLocationType" text,
  "requestedClientId" text,
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
  CONSTRAINT "EmployeeTimeCorrection_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeTimeCorrection_kind_check"
    CHECK ("correctionKind" IN ('ADD_MISSING_PUNCH','CHANGE_PUNCH','VOID_PUNCH','ANNOTATE_PUNCH')),
  CONSTRAINT "EmployeeTimeCorrection_type_check"
    CHECK ("requestedPunchType" IS NULL OR "requestedPunchType" IN ('CLOCK_IN','BREAK_START','BREAK_END','CLOCK_OUT')),
  CONSTRAINT "EmployeeTimeCorrection_status_check"
    CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED'))
);
CREATE INDEX "EmployeeTimeCorrection_user_idx"
  ON "EmployeeTimeCorrection"("organizationId","legalEntityId","userId","requestedAt" DESC);
CREATE INDEX "EmployeeTimeCorrection_status_idx"
  ON "EmployeeTimeCorrection"("organizationId","legalEntityId","status","requestedAt");
CREATE INDEX "EmployeeTimeCorrection_original_punch_idx"
  ON "EmployeeTimeCorrection"("organizationId","legalEntityId","originalPunchId")
  WHERE "originalPunchId" IS NOT NULL;

CREATE TABLE "EmployeeDocumentComplianceReview" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "documentId" text NOT NULL,
  "userId" text NOT NULL,
  "reviewType" text NOT NULL,
  "dueAt" timestamptz,
  "status" text NOT NULL DEFAULT 'OPEN',
  "notes" text,
  "createdByUserId" text,
  "resolvedAt" timestamptz,
  "resolvedByUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "EmployeeDocumentComplianceReview_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "EmployeeDocumentComplianceReview_type_check"
    CHECK ("reviewType" IN ('EXPIRING','EXPIRED','MISSING_REPLACEMENT','MANUAL_REVIEW')),
  CONSTRAINT "EmployeeDocumentComplianceReview_status_check"
    CHECK ("status" IN ('OPEN','RESOLVED','DISMISSED'))
);
CREATE INDEX "EmployeeDocumentComplianceReview_open_idx"
  ON "EmployeeDocumentComplianceReview"("organizationId","legalEntityId","status","dueAt");
CREATE INDEX "EmployeeDocumentComplianceReview_document_idx"
  ON "EmployeeDocumentComplianceReview"("organizationId","legalEntityId","documentId");

-- Cross-module references intentionally remain logical IDs here. The Workforce
-- API validates punch, patient, and document ownership inside the selected
-- organization/legal entity. This avoids coupling deployment of the correction
-- layer to the physical key types/order of legacy Workforce and SPIRE tables.
