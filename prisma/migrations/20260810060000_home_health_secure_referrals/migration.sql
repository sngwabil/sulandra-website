CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "HomeHealthReferralSource" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "name" text NOT NULL,
  "sourceType" text NOT NULL DEFAULT 'HOSPITAL',
  "externalSourceId" text,
  "contactName" text,
  "contactEmail" text,
  "contactPhone" text,
  "streetAddress" text,
  "city" text,
  "state" text,
  "postalCode" text,
  "active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthReferralSource_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "HomeHealthReferralSource_type_check" CHECK ("sourceType" IN ('HOSPITAL','SKILLED_NURSING','PHYSICIAN_OFFICE','CLINIC','HEALTH_PLAN','COUNTY_BOARD','FAMILY','OTHER'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferralSource_entity_idx" ON "HomeHealthReferralSource"("organizationId","legalEntityId","active","name");

CREATE TABLE IF NOT EXISTS "HomeHealthReferralInvitation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "sourceId" text NOT NULL REFERENCES "HomeHealthReferralSource"("id") ON DELETE RESTRICT,
  "tokenHash" text NOT NULL,
  "tokenPrefix" text NOT NULL,
  "purpose" text NOT NULL DEFAULT 'OPERATIONAL',
  "expiresAt" timestamptz NOT NULL,
  "maxSubmissions" integer NOT NULL DEFAULT 25,
  "submissionsUsed" integer NOT NULL DEFAULT 0,
  "revokedAt" timestamptz,
  "revokedById" text,
  "createdById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthReferralInvitation_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "HomeHealthReferralInvitation_hash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "HomeHealthReferralInvitation_purpose_check" CHECK ("purpose" IN ('OPERATIONAL','TRAINING_ONLY')),
  CONSTRAINT "HomeHealthReferralInvitation_limit_check" CHECK ("maxSubmissions">0 AND "submissionsUsed">=0)
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferralInvitation_source_idx" ON "HomeHealthReferralInvitation"("organizationId","legalEntityId","sourceId","expiresAt" DESC);

CREATE TABLE IF NOT EXISTS "HomeHealthReferralSubmission" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "sourceId" text NOT NULL REFERENCES "HomeHealthReferralSource"("id") ON DELETE RESTRICT,
  "invitationId" text NOT NULL REFERENCES "HomeHealthReferralInvitation"("id") ON DELETE RESTRICT,
  "intakeCaseId" text REFERENCES "ClientIntakeCase"("id") ON DELETE SET NULL,
  "mode" text NOT NULL,
  "status" text NOT NULL DEFAULT 'RECEIVED',
  "externalReferralId" text,
  "patientFirstName" text NOT NULL,
  "patientMiddleName" text,
  "patientLastName" text NOT NULL,
  "patientPreferredName" text,
  "patientDateOfBirth" date,
  "patientPhone" text,
  "patientEmail" text,
  "patientStreet" text,
  "patientCity" text,
  "patientState" text,
  "patientPostalCode" text,
  "primaryDiagnosis" text,
  "secondaryDiagnoses" text,
  "skilledNeed" text NOT NULL,
  "requestedDisciplines" text NOT NULL,
  "requestedStartOfCareDate" date,
  "dischargeDate" date,
  "hospitalFacility" text,
  "referringProviderName" text NOT NULL,
  "referringProviderNpi" text,
  "providerPhone" text,
  "providerFax" text,
  "faceToFaceStatus" text,
  "faceToFaceDate" date,
  "homeboundStatus" text,
  "homeboundRationale" text,
  "payerName" text,
  "memberId" text,
  "authorizationNumber" text,
  "medicationSummary" text,
  "allergySummary" text,
  "dmeNeeds" text,
  "woundNeeds" text,
  "oxygenRespiratoryNeeds" text,
  "therapyNeeds" text,
  "caregiverSupport" text,
  "homeSafetyConcerns" text,
  "clinicalNotes" text,
  "orderingContactName" text NOT NULL,
  "orderingContactPhone" text NOT NULL,
  "orderingContactEmail" text,
  "submitterName" text NOT NULL,
  "submitterAttestation" text NOT NULL,
  "submittedAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedAt" timestamptz,
  "reviewedById" text,
  "reviewStatus" text,
  "reviewNotes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthReferralSubmission_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "HomeHealthReferralSubmission_mode_check" CHECK ("mode" IN ('OPERATIONAL','TRAINING_ONLY')),
  CONSTRAINT "HomeHealthReferralSubmission_status_check" CHECK ("status" IN ('RECEIVED','INTAKE_CREATED','REVIEWED','DECLINED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferralSubmission_entity_idx" ON "HomeHealthReferralSubmission"("organizationId","legalEntityId","status","submittedAt" DESC);

CREATE TABLE IF NOT EXISTS "HomeHealthReferralAttachment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "referralId" text NOT NULL REFERENCES "HomeHealthReferralSubmission"("id") ON DELETE CASCADE,
  "documentType" text NOT NULL,
  "title" text,
  "originalFileName" text NOT NULL,
  "mimeType" text NOT NULL,
  "sizeBytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "content" bytea NOT NULL,
  "uploadedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthReferralAttachment_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "HomeHealthReferralAttachment_size_check" CHECK ("sizeBytes">0 AND "sizeBytes"<=26214400)
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferralAttachment_referral_idx" ON "HomeHealthReferralAttachment"("organizationId","legalEntityId","referralId","uploadedAt" DESC);

CREATE TABLE IF NOT EXISTS "HomeHealthReferralEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "referralId" text NOT NULL REFERENCES "HomeHealthReferralSubmission"("id") ON DELETE CASCADE,
  "actorType" text NOT NULL,
  "actorId" text,
  "eventType" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthReferralEvent_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "HomeHealthReferralEvent_actor_check" CHECK ("actorType" IN ('REFERRAL_SOURCE','SULANDRA_USER','SYSTEM'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferralEvent_referral_idx" ON "HomeHealthReferralEvent"("organizationId","legalEntityId","referralId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_home_health_referral_event_mutation"()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'HomeHealthReferralEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "HomeHealthReferralEvent_no_update" ON "HomeHealthReferralEvent";
CREATE TRIGGER "HomeHealthReferralEvent_no_update" BEFORE UPDATE ON "HomeHealthReferralEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_home_health_referral_event_mutation"();
DROP TRIGGER IF EXISTS "HomeHealthReferralEvent_no_delete" ON "HomeHealthReferralEvent";
CREATE TRIGGER "HomeHealthReferralEvent_no_delete" BEFORE DELETE ON "HomeHealthReferralEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_home_health_referral_event_mutation"();
