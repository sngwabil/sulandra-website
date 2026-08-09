CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "NmtReferralFacility" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "name" text NOT NULL,
  "facilityType" text NOT NULL DEFAULT 'HOSPITAL',
  "externalFacilityId" text,
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
  CONSTRAINT "NmtReferralFacility_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtReferralFacility_type_check"
    CHECK ("facilityType" IN ('HOSPITAL','SKILLED_NURSING','DIALYSIS','CLINIC','PHYSICIAN_OFFICE','COUNTY_BOARD','HEALTH_PLAN','OTHER'))
);
CREATE INDEX IF NOT EXISTS "NmtReferralFacility_entity_idx"
  ON "NmtReferralFacility"("organizationId","legalEntityId","active","name");

CREATE TABLE IF NOT EXISTS "NmtReferralInvitation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "facilityId" text NOT NULL REFERENCES "NmtReferralFacility"("id") ON DELETE RESTRICT,
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
  CONSTRAINT "NmtReferralInvitation_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtReferralInvitation_hash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "NmtReferralInvitation_purpose_check"
    CHECK ("purpose" IN ('OPERATIONAL','TRAINING_ONLY')),
  CONSTRAINT "NmtReferralInvitation_limits_check"
    CHECK ("maxSubmissions">0 AND "submissionsUsed">=0)
);
CREATE INDEX IF NOT EXISTS "NmtReferralInvitation_facility_idx"
  ON "NmtReferralInvitation"("organizationId","legalEntityId","facilityId","expiresAt" DESC);
CREATE INDEX IF NOT EXISTS "NmtReferralInvitation_active_idx"
  ON "NmtReferralInvitation"("tokenHash","expiresAt")
  WHERE "revokedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "NmtTransportOrder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "facilityId" text NOT NULL REFERENCES "NmtReferralFacility"("id") ON DELETE RESTRICT,
  "invitationId" text NOT NULL REFERENCES "NmtReferralInvitation"("id") ON DELETE RESTRICT,
  "patientId" text REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "intakeCaseId" text REFERENCES "ClientIntakeCase"("id") ON DELETE SET NULL,
  "externalOrderId" text,
  "orderNumber" text NOT NULL,
  "mode" text NOT NULL,
  "status" text NOT NULL DEFAULT 'RECEIVED',
  "priority" text NOT NULL DEFAULT 'ROUTINE',
  "tripType" text NOT NULL DEFAULT 'ONE_WAY',
  "serviceLevel" text NOT NULL DEFAULT 'AMBULATORY',
  "riderFirstName" text NOT NULL,
  "riderMiddleName" text,
  "riderLastName" text NOT NULL,
  "riderDateOfBirth" date,
  "riderPhone" text,
  "riderMedicaidId" text,
  "riderMemberId" text,
  "payerName" text,
  "authorizationNumber" text,
  "orderingProviderName" text,
  "orderingProviderNpi" text,
  "orderingDepartment" text,
  "orderingContactName" text NOT NULL,
  "orderingContactPhone" text NOT NULL,
  "orderingContactEmail" text,
  "requestedPickupAt" timestamptz NOT NULL,
  "appointmentAt" timestamptz,
  "pickupWindowMinutes" integer NOT NULL DEFAULT 15,
  "pickupName" text,
  "pickupStreet" text NOT NULL,
  "pickupCity" text NOT NULL,
  "pickupState" text NOT NULL,
  "pickupPostalCode" text NOT NULL,
  "pickupUnitRoom" text,
  "pickupInstructions" text,
  "dropoffName" text,
  "dropoffStreet" text NOT NULL,
  "dropoffCity" text NOT NULL,
  "dropoffState" text NOT NULL,
  "dropoffPostalCode" text NOT NULL,
  "dropoffUnitRoom" text,
  "dropoffInstructions" text,
  "returnTripNeeded" boolean NOT NULL DEFAULT false,
  "returnTripMode" text,
  "returnPickupAt" timestamptz,
  "recurrence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "mobility" text,
  "wheelchairType" text,
  "wheelchairWeightLbs" numeric(8,2),
  "bariatric" boolean NOT NULL DEFAULT false,
  "stairAssistance" boolean NOT NULL DEFAULT false,
  "oxygenRequired" boolean NOT NULL DEFAULT false,
  "oxygenFlow" text,
  "escortRequired" boolean NOT NULL DEFAULT false,
  "escortName" text,
  "infectionPrecautions" text,
  "behaviorSafetyNeeds" text,
  "medicalEquipment" text,
  "clinicalNotes" text,
  "specialInstructions" text,
  "medicalNecessity" text,
  "submitterAttestation" text NOT NULL,
  "submitterName" text NOT NULL,
  "submittedAt" timestamptz NOT NULL DEFAULT now(),
  "reviewedAt" timestamptz,
  "reviewedById" text,
  "acceptedAt" timestamptz,
  "acceptedById" text,
  "declinedAt" timestamptz,
  "declinedById" text,
  "decisionReason" text,
  "scheduledTripId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtTransportOrder_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtTransportOrder_number_key" UNIQUE ("orderNumber"),
  CONSTRAINT "NmtTransportOrder_mode_check"
    CHECK ("mode" IN ('OPERATIONAL','TRAINING_ONLY')),
  CONSTRAINT "NmtTransportOrder_status_check"
    CHECK ("status" IN ('RECEIVED','REVIEW_REQUIRED','ACCEPTED','SCHEDULED','IN_PROGRESS','COMPLETED','DECLINED','CANCELLED')),
  CONSTRAINT "NmtTransportOrder_priority_check"
    CHECK ("priority" IN ('ROUTINE','HIGH','URGENT')),
  CONSTRAINT "NmtTransportOrder_trip_type_check"
    CHECK ("tripType" IN ('ONE_WAY','ROUND_TRIP','RECURRING')),
  CONSTRAINT "NmtTransportOrder_service_level_check"
    CHECK ("serviceLevel" IN ('AMBULATORY','WHEELCHAIR','BARIATRIC_WHEELCHAIR','STRETCHER','OTHER')),
  CONSTRAINT "NmtTransportOrder_pickup_window_check"
    CHECK ("pickupWindowMinutes">=0 AND "pickupWindowMinutes"<=240)
);
CREATE INDEX IF NOT EXISTS "NmtTransportOrder_entity_status_idx"
  ON "NmtTransportOrder"("organizationId","legalEntityId","status","requestedPickupAt");
CREATE INDEX IF NOT EXISTS "NmtTransportOrder_facility_idx"
  ON "NmtTransportOrder"("organizationId","legalEntityId","facilityId","submittedAt" DESC);
CREATE INDEX IF NOT EXISTS "NmtTransportOrder_patient_idx"
  ON "NmtTransportOrder"("organizationId","patientId","submittedAt" DESC)
  WHERE "patientId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "NmtTransportOrderAttachment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "orderId" text NOT NULL REFERENCES "NmtTransportOrder"("id") ON DELETE CASCADE,
  "documentType" text NOT NULL DEFAULT 'TRANSPORT_ORDER',
  "title" text,
  "originalFileName" text NOT NULL,
  "mimeType" text NOT NULL,
  "sizeBytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "content" bytea NOT NULL,
  "uploadedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtTransportOrderAttachment_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtTransportOrderAttachment_size_check"
    CHECK ("sizeBytes">0 AND "sizeBytes"<=26214400)
);
CREATE INDEX IF NOT EXISTS "NmtTransportOrderAttachment_order_idx"
  ON "NmtTransportOrderAttachment"("organizationId","legalEntityId","orderId","uploadedAt" DESC);

CREATE TABLE IF NOT EXISTS "NmtTransportOrderEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "orderId" text NOT NULL REFERENCES "NmtTransportOrder"("id") ON DELETE CASCADE,
  "actorType" text NOT NULL,
  "actorId" text,
  "eventType" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "NmtTransportOrderEvent_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "NmtTransportOrderEvent_actor_check"
    CHECK ("actorType" IN ('FACILITY','SULANDRA_USER','SYSTEM'))
);
CREATE INDEX IF NOT EXISTS "NmtTransportOrderEvent_order_idx"
  ON "NmtTransportOrderEvent"("organizationId","legalEntityId","orderId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_nmt_transport_order_event_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'NmtTransportOrderEvent is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "NmtTransportOrderEvent_no_update" ON "NmtTransportOrderEvent";
CREATE TRIGGER "NmtTransportOrderEvent_no_update"
BEFORE UPDATE ON "NmtTransportOrderEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_nmt_transport_order_event_mutation"();
DROP TRIGGER IF EXISTS "NmtTransportOrderEvent_no_delete" ON "NmtTransportOrderEvent";
CREATE TRIGGER "NmtTransportOrderEvent_no_delete"
BEFORE DELETE ON "NmtTransportOrderEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_nmt_transport_order_event_mutation"();
