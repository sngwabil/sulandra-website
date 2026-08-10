CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Align the secure Home Health referral source created by the prior migration
-- with the richer referral API already present on the SPIRE feature branch.
ALTER TABLE IF EXISTS "HomeHealthReferralSource" ADD COLUMN IF NOT EXISTS "fax" text;
ALTER TABLE IF EXISTS "HomeHealthReferralSource" DROP CONSTRAINT IF EXISTS "HomeHealthReferralSource_type_check";
ALTER TABLE IF EXISTS "HomeHealthReferralSource" ADD CONSTRAINT "HomeHealthReferralSource_type_check"
  CHECK ("sourceType" IN ('HOSPITAL','SKILLED_NURSING','REHAB','PHYSICIAN_OFFICE','CLINIC','HEALTH_PLAN','COUNTY_BOARD','SELF_FAMILY','OTHER'));

CREATE TABLE IF NOT EXISTS "HomeHealthReferral" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "sourceId" text NOT NULL REFERENCES "HomeHealthReferralSource"("id") ON DELETE RESTRICT,
  "invitationId" text NOT NULL REFERENCES "HomeHealthReferralInvitation"("id") ON DELETE RESTRICT,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "intakeCaseId" text REFERENCES "ClientIntakeCase"("id") ON DELETE SET NULL,
  "referralNumber" text NOT NULL,
  "externalReferralId" text,
  "mode" text NOT NULL,
  "status" text NOT NULL DEFAULT 'RECEIVED',
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "patientFirstName" text NOT NULL,
  "patientMiddleName" text,
  "patientLastName" text NOT NULL,
  "patientDateOfBirth" date,
  "patientSexAtBirth" text,
  "patientPhone" text,
  "patientEmail" text,
  "streetAddress" text NOT NULL,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "postalCode" text NOT NULL,
  "caregiverName" text,
  "caregiverPhone" text,
  "caregiverRelationship" text,
  "primaryLanguage" text,
  "interpreterNeeded" boolean NOT NULL DEFAULT false,
  "medicaidId" text,
  "medicareId" text,
  "memberId" text,
  "payerName" text,
  "authorizationNumber" text,
  "referringProviderName" text NOT NULL,
  "referringProviderNpi" text,
  "referringProviderPhone" text,
  "referringProviderFax" text,
  "referringProviderEmail" text,
  "referringDepartment" text,
  "hospitalFacility" text,
  "hospitalUnit" text,
  "dischargeDate" date,
  "requestedStartOfCareDate" date,
  "faceToFaceDate" date,
  "faceToFaceStatus" text,
  "homeboundStatus" text,
  "homeboundRationale" text,
  "skilledNeed" text NOT NULL,
  "primaryDiagnosis" text,
  "diagnoses" text,
  "allergies" text,
  "medicationsSummary" text,
  "recentHospitalization" text,
  "woundCareNeeds" text,
  "infusionNeeds" text,
  "respiratoryNeeds" text,
  "dmeEquipment" text,
  "fallRisk" text,
  "cognitiveBehavioralNeeds" text,
  "infectionPrecautions" text,
  "homeSafetyConcerns" text,
  "socialDeterminants" text,
  "requestedDisciplines" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "orderSummary" text NOT NULL,
  "specialInstructions" text,
  "submitterName" text NOT NULL,
  "submitterTitle" text,
  "submitterPhone" text NOT NULL,
  "submitterEmail" text,
  "submitterAttestation" text NOT NULL,
  "submittedAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedAt" timestamptz,
  "reviewedById" text,
  "acceptedAt" timestamptz,
  "acceptedById" text,
  "declinedAt" timestamptz,
  "declinedById" text,
  "decisionReason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthReferral_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "HomeHealthReferral_number_key" UNIQUE ("referralNumber"),
  CONSTRAINT "HomeHealthReferral_mode_check" CHECK ("mode" IN ('OPERATIONAL','TRAINING_ONLY')),
  CONSTRAINT "HomeHealthReferral_status_check" CHECK ("status" IN ('RECEIVED','REVIEW_REQUIRED','INTAKE_CREATED','ACCEPTED','DECLINED','CANCELLED')),
  CONSTRAINT "HomeHealthReferral_priority_check" CHECK ("priority" IN ('ROUTINE','HIGH','URGENT'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferral_entity_status_idx" ON "HomeHealthReferral"("organizationId","legalEntityId","status","submittedAt" DESC);
CREATE INDEX IF NOT EXISTS "HomeHealthReferral_patient_idx" ON "HomeHealthReferral"("organizationId","patientId","submittedAt" DESC) WHERE "patientId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "HomeHealthReferral_intake_idx" ON "HomeHealthReferral"("organizationId","intakeCaseId") WHERE "intakeCaseId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "HomeHealthReferralOrderLine" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "referralId" text NOT NULL REFERENCES "HomeHealthReferral"("id") ON DELETE CASCADE,
  "discipline" text NOT NULL,
  "service" text NOT NULL,
  "frequency" text,
  "duration" text,
  "startDate" date,
  "instructions" text,
  "orderingProviderName" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "HomeHealthReferralOrderLine_entity_fkey" FOREIGN KEY ("organizationId","legalEntityId") REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "HomeHealthReferralOrderLine_discipline_check" CHECK ("discipline" IN ('SN','PT','OT','ST','HHA','MSW','RT','DIETITIAN','OTHER'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferralOrderLine_referral_idx" ON "HomeHealthReferralOrderLine"("organizationId","legalEntityId","referralId","createdAt");

-- Ensure prior supporting tables expose every field required by the API.
ALTER TABLE IF EXISTS "HomeHealthReferralInvitation" ADD COLUMN IF NOT EXISTS "maxSubmissions" integer NOT NULL DEFAULT 25;
ALTER TABLE IF EXISTS "HomeHealthReferralInvitation" ADD COLUMN IF NOT EXISTS "submissionsUsed" integer NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment" ADD COLUMN IF NOT EXISTS "documentType" text NOT NULL DEFAULT 'REFERRAL_ORDER';
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment" ADD COLUMN IF NOT EXISTS "originalFileName" text;
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment" ADD COLUMN IF NOT EXISTS "mimeType" text;
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment" ADD COLUMN IF NOT EXISTS "sizeBytes" integer;
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment" ADD COLUMN IF NOT EXISTS "sha256" text;
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment" ADD COLUMN IF NOT EXISTS "content" bytea;
ALTER TABLE IF EXISTS "HomeHealthReferralAttachment" ADD COLUMN IF NOT EXISTS "uploadedAt" timestamptz NOT NULL DEFAULT now();
