CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Client requests are owned by exactly one legal entity. The requested entity is
-- retained separately so formation-stage interest can be reviewed by the holding
-- company without implying that an unapproved provider is accepting referrals.
ALTER TABLE "ClientServiceRequest"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text,
  ADD COLUMN IF NOT EXISTS "requestedLegalEntityId" text,
  ADD COLUMN IF NOT EXISTS "intakeMode" text,
  ADD COLUMN IF NOT EXISTS "sourcePath" text;

UPDATE "ClientServiceRequest" request_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE request_row."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND request_row."legalEntityId" IS NULL;

UPDATE "ClientServiceRequest"
SET "requestedLegalEntityId"="legalEntityId"
WHERE "requestedLegalEntityId" IS NULL;

UPDATE "ClientServiceRequest"
SET "intakeMode"='OPERATIONAL'
WHERE "intakeMode" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ClientServiceRequest"
    WHERE "organizationId" IS NULL
       OR "legalEntityId" IS NULL
       OR "requestedLegalEntityId" IS NULL
       OR "intakeMode" IS NULL
  ) THEN
    RAISE EXCEPTION 'ClientServiceRequest contains records without complete company routing';
  END IF;
END $$;

ALTER TABLE "ClientServiceRequest"
  ALTER COLUMN "legalEntityId" SET NOT NULL,
  ALTER COLUMN "requestedLegalEntityId" SET NOT NULL,
  ALTER COLUMN "intakeMode" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ClientServiceRequest_requested_entity_fkey') THEN
    ALTER TABLE "ClientServiceRequest"
      ADD CONSTRAINT "ClientServiceRequest_requested_entity_fkey"
      FOREIGN KEY ("organizationId","requestedLegalEntityId")
      REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "ClientServiceRequest" VALIDATE CONSTRAINT "ClientServiceRequest_requested_entity_fkey";
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ClientServiceRequest_intake_mode_check') THEN
    ALTER TABLE "ClientServiceRequest"
      ADD CONSTRAINT "ClientServiceRequest_intake_mode_check"
      CHECK ("intakeMode" IN ('OPERATIONAL','PRELAUNCH_INTEREST','ENTERPRISE_CONSULTATION'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ClientServiceRequest_routing_shape_check') THEN
    ALTER TABLE "ClientServiceRequest"
      ADD CONSTRAINT "ClientServiceRequest_routing_shape_check" CHECK (
        ("intakeMode"='OPERATIONAL' AND "legalEntityId"="requestedLegalEntityId")
        OR ("intakeMode"='PRELAUNCH_INTEREST' AND "legalEntityId"<>"requestedLegalEntityId")
        OR "intakeMode"='ENTERPRISE_CONSULTATION'
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ClientServiceRequest_entity_status_created_idx"
  ON "ClientServiceRequest"("organizationId","legalEntityId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ClientServiceRequest_requested_entity_mode_idx"
  ON "ClientServiceRequest"("organizationId","requestedLegalEntityId","intakeMode","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ClientServiceRequest_entity_followup_idx"
  ON "ClientServiceRequest"("organizationId","legalEntityId","nextFollowUpAt")
  WHERE "nextFollowUpAt" IS NOT NULL;

-- The holding company can receive enterprise consultations and safely hold
-- pre-launch interest. This does not enable SPIRE, provider operations, or billing.
UPDATE "LegalEntity"
SET "metadata"=jsonb_set(
      COALESCE("metadata",'{}'::jsonb),
      '{enabledModules}',
      CASE
        WHEN COALESCE("metadata"->'enabledModules','[]'::jsonb) @> '["CLIENT_INTAKE"]'::jsonb
          THEN COALESCE("metadata"->'enabledModules','[]'::jsonb)
        ELSE COALESCE("metadata"->'enabledModules','[]'::jsonb) || '["CLIENT_INTAKE"]'::jsonb
      END,
      true
    ) || jsonb_build_object(
      'intakeStatus','CONSULTATION_AND_PRELAUNCH_INTEREST',
      'formalProviderIntakeEnabled',false
    ),
    "updatedAt"=now()
WHERE "code"='SULANDRA_HEALTH';

-- Every formal-intake import carries the same company boundary as its source
-- request. Existing imports were assigned to SCLS by the Stage 4 backfill.
ALTER TABLE "SpireIntakeImport"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text;

UPDATE "SpireIntakeImport" import_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE import_row."organizationId"=entity."organizationId"
  AND entity."code"='SCLS'
  AND import_row."legalEntityId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "SpireIntakeImport"
    WHERE "organizationId" IS NULL OR "legalEntityId" IS NULL
  ) THEN
    RAISE EXCEPTION 'SpireIntakeImport contains records without a legal entity';
  END IF;
END $$;

ALTER TABLE "SpireIntakeImport"
  ALTER COLUMN "legalEntityId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireIntakeImport_entity_status_created_idx"
  ON "SpireIntakeImport"("organizationId","legalEntityId","status","createdAt" DESC);

-- Immutable history for the later, explicit transition from holding-company
-- interest to an approved provider's operational intake queue.
CREATE TABLE IF NOT EXISTS "ClientServiceRequestRoutingEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "requestId" text NOT NULL REFERENCES "ClientServiceRequest"("id") ON DELETE RESTRICT,
  "fromLegalEntityId" text NOT NULL REFERENCES "LegalEntity"("id") ON DELETE RESTRICT,
  "toLegalEntityId" text NOT NULL REFERENCES "LegalEntity"("id") ON DELETE RESTRICT,
  "fromMode" text NOT NULL,
  "toMode" text NOT NULL,
  "reason" text NOT NULL,
  "routedById" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ClientServiceRequestRoutingEvent_mode_check" CHECK (
    "fromMode" IN ('OPERATIONAL','PRELAUNCH_INTEREST','ENTERPRISE_CONSULTATION')
    AND "toMode" IN ('OPERATIONAL','PRELAUNCH_INTEREST','ENTERPRISE_CONSULTATION')
  )
);
CREATE INDEX IF NOT EXISTS "ClientServiceRequestRoutingEvent_request_idx"
  ON "ClientServiceRequestRoutingEvent"("organizationId","requestId","createdAt" DESC);

COMMENT ON COLUMN "ClientServiceRequest"."intakeMode" IS
  'OPERATIONAL permits a capability-gated formal intake. PRELAUNCH_INTEREST and ENTERPRISE_CONSULTATION never establish provider approval, referral acceptance, or service availability.';
COMMENT ON TABLE "ClientServiceRequestRoutingEvent" IS
  'Immutable company-routing history. A prelaunch request may move to operational intake only after provider and module readiness checks pass.';
