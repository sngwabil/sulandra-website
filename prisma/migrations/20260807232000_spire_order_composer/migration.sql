CREATE TABLE IF NOT EXISTS "SpireOrderFavorite" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "orderType" text NOT NULL,
  "name" text NOT NULL,
  "defaults" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireOrderFavorite_user_type_name_key" ON "SpireOrderFavorite"("organizationId","userId","orderType","name");

CREATE TABLE IF NOT EXISTS "SpireOrderSet" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SpireOrderSet_org_name_key" ON "SpireOrderSet"("organizationId","name");

CREATE TABLE IF NOT EXISTS "SpireOrderSetItem" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "orderSetId" text NOT NULL REFERENCES "SpireOrderSet"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL DEFAULT 0,
  "orderType" text NOT NULL,
  "name" text NOT NULL,
  "defaults" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "required" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireOrderSetItem_set_idx" ON "SpireOrderSetItem"("organizationId","orderSetId","sequence");

CREATE TABLE IF NOT EXISTS "SpireOrderDiagnosisLink" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "orderId" text NOT NULL REFERENCES "SpireOrder"("id") ON DELETE CASCADE,
  "diagnosisId" text NOT NULL REFERENCES "SpirePatientDiagnosis"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("orderId","diagnosisId")
);

CREATE TABLE IF NOT EXISTS "SpireOrderSafetyOverride" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "orderId" text,
  "alertType" text NOT NULL,
  "alertKey" text NOT NULL,
  "severity" text NOT NULL,
  "reason" text NOT NULL,
  "overriddenById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireOrderSafetyOverride_patient_idx" ON "SpireOrderSafetyOverride"("organizationId","patientId","createdAt" DESC);
