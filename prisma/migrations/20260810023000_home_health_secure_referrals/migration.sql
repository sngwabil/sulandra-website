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
  "fax" text,
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
  CONSTRAINT "HomeHealthReferralSource_type_check" CHECK ("sourceType" IN ('HOSPITAL','SKILLED_NURSING','REHAB','PHYSICIAN_OFFICE','CLINIC','HEALTH_PLAN','COUNTY_BOARD','SELF_FAMILY','OTHER'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferralSource_entity_idx" ON "HomeHealthReferralSource"("organizationId","legalEntityId","active","name");

CREATE TABLE IF NOT EXISTS "HomeHealthReferralInvitation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "sourceId" text NOT NULL REFERENCES "HomeHealthReferralSource"("id") ON DELETE RESTRICT,
  "tokenHash" text NOT NULL UNIQUE,
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
  CONSTRAINT "HomeHealthReferralInvitation_purpose_check" CHECK ("purpose" IN ('OPERATIONAL','TRAINING_ONLY')),
  CONSTRAINT "HomeHealthReferralInvitation_limits_check" CHECK ("maxSubmissions">0 AND "submissionsUsed">=0)
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferralInvitation_source_idx" ON "HomeHealthReferralInvitation"("organizationId","legalEntityId","sourceId","expiresAt" DESC);

CREATE TABLE IF NOT EXISTS "HomeHealthReferral" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "sourceId" text NOT NULL REFERENCES "HomeHealthReferralSource"("id") ON DELETE RESTRICT,
  "invitationId" text NOT NULL REFERENCES "HomeHealthReferralInvitation"("id") ON DELETE RESTRICT,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "intakeCaseId" text REFERENCES "ClientIntakeCase"("id") ON DELETE SET NULL,
  "referralNumber" text NOT NULL UNIQUE,
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
  CONSTRAINT "HomeHealthReferral_mode_check" CHECK ("mode" IN ('OPERATIONAL','TRAINING_ONLY')),
  CONSTRAINT "HomeHealthReferral_status_check" CHECK ("status" IN ('RECEIVED','REVIEW_REQUIRED','INTAKE_CREATED','ACCEPTED','SOC_SCHEDULED','ACTIVE','DECLINED','CANCELLED')),
  CONSTRAINT "HomeHealthReferral_priority_check" CHECK ("priority" IN ('ROUTINE','HIGH','URGENT'))
);
CREATE INDEX IF NOT EXISTS "HomeHealthReferral_entity_status_idx" ON "HomeHealthReferral"("organizationId","legalEntityId","status","requestedStartOfCareDate","submittedAt" DESC);
CREATE INDEX IF NOT EXISTS "HomeHealthReferral_source_idx" ON "HomeHealthReferral"("organizationId","legalEntityId","sourceId","submittedAt" DESC);
CREATE INDEX IF NOT EXISTS "HomeHealthReferral_patient_idx" ON "HomeHealthReferral"("organizationId","patientId","submittedAt" DESC) WHERE "patientId" IS NOT NULL;

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
CREATE INDEX IF NOT EXISTS "HomeHealthReferralOrderLine_referral_idx" ON "HomeHealthReferralOrderLine"("organizationId","legalEntityId","referralId","discipline");

CREATE TABLE IF NOT EXISTS "HomeHealthReferralAttachment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "referralId" text NOT NULL REFERENCES "HomeHealthReferral"("id") ON DELETE CASCADE,
  "documentType" text NOT NULL DEFAULT 'REFERRAL_ORDER',
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
  "referralId" text NOT NULL REFERENCES "HomeHealthReferral"("id") ON DELETE CASCADE,
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

CREATE OR REPLACE FUNCTION "prevent_home_health_referral_event_mutation"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'HomeHealthReferralEvent is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "HomeHealthReferralEvent_no_update" ON "HomeHealthReferralEvent";
CREATE TRIGGER "HomeHealthReferralEvent_no_update" BEFORE UPDATE ON "HomeHealthReferralEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_home_health_referral_event_mutation"();
DROP TRIGGER IF EXISTS "HomeHealthReferralEvent_no_delete" ON "HomeHealthReferralEvent";
CREATE TRIGGER "HomeHealthReferralEvent_no_delete" BEFORE DELETE ON "HomeHealthReferralEvent" FOR EACH ROW EXECUTE FUNCTION "prevent_home_health_referral_event_mutation"();

DROP TRIGGER IF EXISTS "HomeHealthReferralAttachment_guard_type" ON "HomeHealthReferralAttachment";
CREATE TRIGGER "HomeHealthReferralAttachment_guard_type" BEFORE INSERT OR UPDATE OF "mimeType","originalFileName" ON "HomeHealthReferralAttachment" FOR EACH ROW EXECUTE FUNCTION "guard_sulandra_clinical_attachment_type"();
