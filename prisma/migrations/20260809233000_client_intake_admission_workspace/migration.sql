CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Long-form client/patient intake is intentionally staged outside the live SPIRE
-- chart. A case can be completed over time and reviewed before a shared patient
-- identity and company enrollment are created.

CREATE TABLE IF NOT EXISTS "ClientIntakeCase" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "intakeMode" text NOT NULL DEFAULT 'OPERATIONAL',
  "serviceType" text,
  "programCode" text,
  "referralSource" text,
  "referralDate" date,
  "assignedCoordinatorUserId" text,
  "prospectFirstName" text,
  "prospectMiddleName" text,
  "prospectLastName" text,
  "prospectPreferredName" text,
  "prospectDateOfBirth" date,
  "prospectPhone" text,
  "prospectEmail" text,
  "completionPercent" integer NOT NULL DEFAULT 0,
  "currentSectionKey" text,
  "reviewNotes" text,
  "submittedAt" timestamptz,
  "submittedById" text,
  "reviewedAt" timestamptz,
  "reviewedById" text,
  "approvedAt" timestamptz,
  "approvedById" text,
  "closedAt" timestamptz,
  "closedById" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "ClientIntakeCase_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "ClientIntakeCase_patient_fkey"
    FOREIGN KEY ("patientId") REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  CONSTRAINT "ClientIntakeCase_status_check"
    CHECK ("status" IN ('DRAFT','IN_PROGRESS','SUBMITTED','REVIEW_REQUIRED','APPROVED','REJECTED','WITHDRAWN','CLOSED')),
  CONSTRAINT "ClientIntakeCase_mode_check"
    CHECK ("intakeMode" IN ('OPERATIONAL','PRELAUNCH_INTEREST','ENTERPRISE_CONSULTATION')),
  CONSTRAINT "ClientIntakeCase_completion_check"
    CHECK ("completionPercent">=0 AND "completionPercent"<=100)
);
CREATE INDEX IF NOT EXISTS "ClientIntakeCase_entity_status_idx"
  ON "ClientIntakeCase"("organizationId","legalEntityId","status","updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "ClientIntakeCase_patient_idx"
  ON "ClientIntakeCase"("organizationId","patientId","updatedAt" DESC)
  WHERE "patientId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "ClientIntakeSection" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "intakeCaseId" text NOT NULL REFERENCES "ClientIntakeCase"("id") ON DELETE CASCADE,
  "sectionKey" text NOT NULL,
  "sectionTitle" text NOT NULL,
  "sectionGroup" text NOT NULL DEFAULT 'GENERAL',
  "status" text NOT NULL DEFAULT 'NOT_STARTED',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reviewState" text NOT NULL DEFAULT 'NOT_REVIEWED',
  "reviewComment" text,
  "completedAt" timestamptz,
  "completedById" text,
  "reviewedAt" timestamptz,
  "reviewedById" text,
  "updatedById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ClientIntakeSection_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "ClientIntakeSection_case_key" UNIQUE ("intakeCaseId","sectionKey"),
  CONSTRAINT "ClientIntakeSection_status_check"
    CHECK ("status" IN ('NOT_STARTED','IN_PROGRESS','COMPLETE','NOT_APPLICABLE')),
  CONSTRAINT "ClientIntakeSection_review_check"
    CHECK ("reviewState" IN ('NOT_REVIEWED','ACCEPTED','CHANGES_REQUESTED'))
);
CREATE INDEX IF NOT EXISTS "ClientIntakeSection_case_idx"
  ON "ClientIntakeSection"("organizationId","legalEntityId","intakeCaseId","sectionGroup","sectionKey");

CREATE TABLE IF NOT EXISTS "ClientIntakeAttachment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "intakeCaseId" text NOT NULL REFERENCES "ClientIntakeCase"("id") ON DELETE CASCADE,
  "sectionKey" text,
  "documentType" text NOT NULL,
  "title" text,
  "originalFileName" text NOT NULL,
  "mimeType" text NOT NULL,
  "sizeBytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "content" bytea NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "expirationDate" date,
  "notes" text,
  "uploadedById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ClientIntakeAttachment_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "ClientIntakeAttachment_status_check"
    CHECK ("status" IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
  CONSTRAINT "ClientIntakeAttachment_size_check"
    CHECK ("sizeBytes">0 AND "sizeBytes"<=26214400)
);
CREATE INDEX IF NOT EXISTS "ClientIntakeAttachment_case_idx"
  ON "ClientIntakeAttachment"("organizationId","legalEntityId","intakeCaseId","documentType","status");

CREATE TABLE IF NOT EXISTS "ClientIntakeSignature" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "intakeCaseId" text NOT NULL REFERENCES "ClientIntakeCase"("id") ON DELETE CASCADE,
  "signatureType" text NOT NULL,
  "signerName" text NOT NULL,
  "signerRelationship" text,
  "signerEmail" text,
  "signatureMethod" text NOT NULL DEFAULT 'TYPED_ATTESTATION',
  "attestation" text NOT NULL,
  "signedByUserId" text,
  "signedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "revokedAt" timestamptz,
  "revokedById" text,
  "revocationReason" text,
  CONSTRAINT "ClientIntakeSignature_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "ClientIntakeSignature_method_check"
    CHECK ("signatureMethod" IN ('TYPED_ATTESTATION','STAFF_WITNESSED','ELECTRONIC_CONSENT'))
);
CREATE INDEX IF NOT EXISTS "ClientIntakeSignature_case_idx"
  ON "ClientIntakeSignature"("organizationId","legalEntityId","intakeCaseId","signatureType","signedAt" DESC);

CREATE TABLE IF NOT EXISTS "ClientIntakeEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "intakeCaseId" text NOT NULL REFERENCES "ClientIntakeCase"("id") ON DELETE CASCADE,
  "actorUserId" text NOT NULL,
  "eventType" text NOT NULL,
  "sectionKey" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ClientIntakeEvent_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "ClientIntakeEvent_case_idx"
  ON "ClientIntakeEvent"("organizationId","legalEntityId","intakeCaseId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_client_intake_event_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ClientIntakeEvent is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "ClientIntakeEvent_no_update" ON "ClientIntakeEvent";
CREATE TRIGGER "ClientIntakeEvent_no_update"
BEFORE UPDATE ON "ClientIntakeEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_client_intake_event_mutation"();
DROP TRIGGER IF EXISTS "ClientIntakeEvent_no_delete" ON "ClientIntakeEvent";
CREATE TRIGGER "ClientIntakeEvent_no_delete"
BEFORE DELETE ON "ClientIntakeEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_client_intake_event_mutation"();

COMMENT ON TABLE "ClientIntakeCase" IS
  'Company-scoped admission workspace. Approval may create/link one shared SpirePatient and a company ClientEnrollment.';
COMMENT ON TABLE "ClientIntakeSection" IS
  'Long-form section responses for the client admission packet; payload remains editable until submission/review.';
