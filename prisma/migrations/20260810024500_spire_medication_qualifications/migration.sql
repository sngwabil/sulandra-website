CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SpireMedicationAdministrationQualification" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "userId" text NOT NULL,
  "qualificationType" text NOT NULL,
  "qualificationLevel" text,
  "certificateNumber" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "effectiveAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz,
  "verifiedAt" timestamptz NOT NULL DEFAULT now(),
  "verifiedById" text NOT NULL,
  "revokedAt" timestamptz,
  "revokedById" text,
  "revocationReason" text,
  "scope" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireMedicationAdministrationQualification_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "SpireMedicationAdministrationQualification_status_check"
    CHECK ("status" IN ('ACTIVE','EXPIRED','SUSPENDED','REVOKED')),
  CONSTRAINT "SpireMedicationAdministrationQualification_type_check"
    CHECK ("qualificationType" IN ('DODD_MED_ADMIN','NURSING_DELEGATION','COMPANY_MED_ADMIN_COMPETENCY','OTHER_VERIFIED_AUTHORIZATION'))
);
CREATE INDEX IF NOT EXISTS "SpireMedicationQualification_user_idx"
  ON "SpireMedicationAdministrationQualification"("organizationId","legalEntityId","userId","status","expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "SpireMedicationQualification_active_type_key"
  ON "SpireMedicationAdministrationQualification"("organizationId","legalEntityId","userId","qualificationType")
  WHERE "status"='ACTIVE' AND "revokedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "SpireMedicationQualificationEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "qualificationId" text NOT NULL REFERENCES "SpireMedicationAdministrationQualification"("id") ON DELETE CASCADE,
  "userId" text NOT NULL,
  "actorUserId" text NOT NULL,
  "eventType" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireMedicationQualificationEvent_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "SpireMedicationQualificationEvent_idx"
  ON "SpireMedicationQualificationEvent"("organizationId","legalEntityId","userId","createdAt" DESC);

COMMENT ON TABLE "SpireMedicationAdministrationQualification" IS
  'Verified company-scoped authorization for non-licensed staff to administer medications. Job title or SPIRE chart access alone never establishes medication administration authority.';
