-- Production compatibility repair for the remaining SPIRE care-plan tables.
--
-- 20260807234500_spire_care_plan_isp used CREATE TABLE IF NOT EXISTS. If an
-- earlier/legacy generation of one of these tables already existed, PostgreSQL
-- kept that table rather than applying the modern column definition. The
-- historical migration then added only a small subset of columns, so current
-- Client Intake approval can reach a table that exists but is missing modern
-- columns such as SpireCarePlanIntervention.title.
--
-- Do not edit the already-applied historical migration. Preserve legacy rows and
-- legacy columns, add the current columns idempotently, and relax NOT NULL only
-- on obsolete legacy-only columns that current SPIRE no longer writes.

-- ---------------------------------------------------------------------------
-- SpireCarePlanIntervention
-- ---------------------------------------------------------------------------
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "patientId" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "carePlanId" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "goalId" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "instructions" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "frequency" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "responsibleRole" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "serviceType" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ACTIVE';
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "createdById" text;
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
ALTER TABLE "SpireCarePlanIntervention" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

UPDATE "SpireCarePlanIntervention"
SET "title" = 'Care plan intervention'
WHERE "title" IS NULL OR BTRIM("title") = '';
UPDATE "SpireCarePlanIntervention"
SET "instructions" = 'Legacy care plan intervention'
WHERE "instructions" IS NULL OR BTRIM("instructions") = '';
UPDATE "SpireCarePlanIntervention" SET "status"='ACTIVE' WHERE "status" IS NULL OR BTRIM("status")='';
UPDATE "SpireCarePlanIntervention" SET "createdAt"=now() WHERE "createdAt" IS NULL;
UPDATE "SpireCarePlanIntervention" SET "updatedAt"=COALESCE("createdAt",now()) WHERE "updatedAt" IS NULL;

ALTER TABLE "SpireCarePlanIntervention" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "SpireCarePlanIntervention" ALTER COLUMN "instructions" SET NOT NULL;
ALTER TABLE "SpireCarePlanIntervention" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "SpireCarePlanIntervention" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "SpireCarePlanIntervention" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanIntervention" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "SpireCarePlanIntervention" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanIntervention" ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireCarePlanIntervention_patient_idx"
  ON "SpireCarePlanIntervention"("organizationId","patientId","status");
CREATE INDEX IF NOT EXISTS "SpireCarePlanIntervention_entity_idx"
  ON "SpireCarePlanIntervention"("organizationId","legalEntityId","patientId","status");
CREATE INDEX IF NOT EXISTS "SpireCarePlanIntervention_plan_idx"
  ON "SpireCarePlanIntervention"("organizationId","legalEntityId","carePlanId","status");

-- ---------------------------------------------------------------------------
-- SpireCarePlanRisk
-- ---------------------------------------------------------------------------
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "patientId" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "carePlanId" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "riskLevel" text DEFAULT 'MODERATE';
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "triggerDescription" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "preventionPlan" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "responsePlan" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "emergencyInstructions" text;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
ALTER TABLE "SpireCarePlanRisk" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

UPDATE "SpireCarePlanRisk" SET "category"='GENERAL' WHERE "category" IS NULL OR BTRIM("category")='';
UPDATE "SpireCarePlanRisk" SET "title"='Care plan risk' WHERE "title" IS NULL OR BTRIM("title")='';
UPDATE "SpireCarePlanRisk" SET "riskLevel"='MODERATE' WHERE "riskLevel" IS NULL OR BTRIM("riskLevel")='';
UPDATE "SpireCarePlanRisk" SET "active"=true WHERE "active" IS NULL;
UPDATE "SpireCarePlanRisk" SET "createdAt"=now() WHERE "createdAt" IS NULL;
UPDATE "SpireCarePlanRisk" SET "updatedAt"=COALESCE("createdAt",now()) WHERE "updatedAt" IS NULL;

ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "category" SET NOT NULL;
ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "riskLevel" SET DEFAULT 'MODERATE';
ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "riskLevel" SET NOT NULL;
ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "active" SET NOT NULL;
ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanRisk" ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireCarePlanRisk_patient_idx"
  ON "SpireCarePlanRisk"("organizationId","patientId","active");
CREATE INDEX IF NOT EXISTS "SpireCarePlanRisk_entity_idx"
  ON "SpireCarePlanRisk"("organizationId","legalEntityId","patientId","active");
CREATE INDEX IF NOT EXISTS "SpireCarePlanRisk_plan_idx"
  ON "SpireCarePlanRisk"("organizationId","legalEntityId","carePlanId","active");

-- ---------------------------------------------------------------------------
-- SpireCarePlanVersion
-- ---------------------------------------------------------------------------
ALTER TABLE "SpireCarePlanVersion" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireCarePlanVersion" ADD COLUMN IF NOT EXISTS "carePlanId" text;
ALTER TABLE "SpireCarePlanVersion" ADD COLUMN IF NOT EXISTS "version" integer;
ALTER TABLE "SpireCarePlanVersion" ADD COLUMN IF NOT EXISTS "snapshot" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "SpireCarePlanVersion" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE "SpireCarePlanVersion" ADD COLUMN IF NOT EXISTS "createdById" text;
ALTER TABLE "SpireCarePlanVersion" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();

UPDATE "SpireCarePlanVersion" SET "snapshot"='{}'::jsonb WHERE "snapshot" IS NULL;
UPDATE "SpireCarePlanVersion" SET "createdAt"=now() WHERE "createdAt" IS NULL;
ALTER TABLE "SpireCarePlanVersion" ALTER COLUMN "snapshot" SET DEFAULT '{}'::jsonb;
ALTER TABLE "SpireCarePlanVersion" ALTER COLUMN "snapshot" SET NOT NULL;
ALTER TABLE "SpireCarePlanVersion" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanVersion" ALTER COLUMN "createdAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireCarePlanVersion_plan_idx"
  ON "SpireCarePlanVersion"("organizationId","carePlanId","version");

-- ---------------------------------------------------------------------------
-- SpireCarePlanSignature
-- ---------------------------------------------------------------------------
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "patientId" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "carePlanId" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "signerRole" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "signerName" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "signerUserId" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "signatureMethod" text DEFAULT 'ELECTRONIC';
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'SIGNED';
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "signedAt" timestamptz DEFAULT now();
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "ipAddress" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "userAgent" text;
ALTER TABLE "SpireCarePlanSignature" ADD COLUMN IF NOT EXISTS "attestation" text;

UPDATE "SpireCarePlanSignature" SET "signatureMethod"='ELECTRONIC' WHERE "signatureMethod" IS NULL OR BTRIM("signatureMethod")='';
UPDATE "SpireCarePlanSignature" SET "status"='SIGNED' WHERE "status" IS NULL OR BTRIM("status")='';
UPDATE "SpireCarePlanSignature" SET "signedAt"=now() WHERE "signedAt" IS NULL;
ALTER TABLE "SpireCarePlanSignature" ALTER COLUMN "signatureMethod" SET DEFAULT 'ELECTRONIC';
ALTER TABLE "SpireCarePlanSignature" ALTER COLUMN "signatureMethod" SET NOT NULL;
ALTER TABLE "SpireCarePlanSignature" ALTER COLUMN "status" SET DEFAULT 'SIGNED';
ALTER TABLE "SpireCarePlanSignature" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "SpireCarePlanSignature" ALTER COLUMN "signedAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanSignature" ALTER COLUMN "signedAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireCarePlanSignature_plan_idx"
  ON "SpireCarePlanSignature"("organizationId","carePlanId","signedAt");
CREATE INDEX IF NOT EXISTS "SpireCarePlanSignature_entity_plan_idx"
  ON "SpireCarePlanSignature"("organizationId","legalEntityId","carePlanId","signedAt");

-- ---------------------------------------------------------------------------
-- SpireGoalProgressEntry
-- ---------------------------------------------------------------------------
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "patientId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "goalId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "encounterId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "noteId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "interventionId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "assessmentId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "incidentId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "appointmentId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "medicationOrderId" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "value" numeric;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "unit" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "progressPercent" numeric;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'DOCUMENTED';
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "narrative" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "recordedById" text;
ALTER TABLE "SpireGoalProgressEntry" ADD COLUMN IF NOT EXISTS "recordedAt" timestamptz DEFAULT now();

UPDATE "SpireGoalProgressEntry" SET "status"='DOCUMENTED' WHERE "status" IS NULL OR BTRIM("status")='';
UPDATE "SpireGoalProgressEntry" SET "recordedAt"=now() WHERE "recordedAt" IS NULL;
ALTER TABLE "SpireGoalProgressEntry" ALTER COLUMN "status" SET DEFAULT 'DOCUMENTED';
ALTER TABLE "SpireGoalProgressEntry" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "SpireGoalProgressEntry" ALTER COLUMN "recordedAt" SET DEFAULT now();
ALTER TABLE "SpireGoalProgressEntry" ALTER COLUMN "recordedAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireGoalProgressEntry_goal_idx"
  ON "SpireGoalProgressEntry"("organizationId","patientId","goalId","recordedAt");
CREATE INDEX IF NOT EXISTS "SpireGoalProgressEntry_entity_goal_idx"
  ON "SpireGoalProgressEntry"("organizationId","legalEntityId","patientId","goalId","recordedAt");

-- ---------------------------------------------------------------------------
-- SpireCarePlanServiceLink
-- ---------------------------------------------------------------------------
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "patientId" text;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "carePlanId" text;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "authorizationId" text;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "serviceCode" text;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "serviceName" text;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "approvedServiceType" text;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "startsAt" date;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "endsAt" date;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "authorizedUnits" numeric;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
ALTER TABLE "SpireCarePlanServiceLink" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();

UPDATE "SpireCarePlanServiceLink" SET "active"=true WHERE "active" IS NULL;
UPDATE "SpireCarePlanServiceLink" SET "createdAt"=now() WHERE "createdAt" IS NULL;
ALTER TABLE "SpireCarePlanServiceLink" ALTER COLUMN "active" SET DEFAULT true;
ALTER TABLE "SpireCarePlanServiceLink" ALTER COLUMN "active" SET NOT NULL;
ALTER TABLE "SpireCarePlanServiceLink" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanServiceLink" ALTER COLUMN "createdAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireCarePlanServiceLink_patient_idx"
  ON "SpireCarePlanServiceLink"("organizationId","patientId","active");
CREATE INDEX IF NOT EXISTS "SpireCarePlanServiceLink_entity_patient_idx"
  ON "SpireCarePlanServiceLink"("organizationId","legalEntityId","patientId","active");
CREATE INDEX IF NOT EXISTS "SpireCarePlanServiceLink_plan_idx"
  ON "SpireCarePlanServiceLink"("organizationId","legalEntityId","carePlanId","active");

-- ---------------------------------------------------------------------------
-- Relax obsolete legacy-only NOT NULL columns across the repaired table family.
-- Canonical current fields are explicitly excluded. This preserves every old
-- column/value while allowing current SPIRE inserts to omit fields that no
-- longer belong to the supported care-plan contract.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  table_spec record;
  legacy_column record;
BEGIN
  FOR table_spec IN
    SELECT * FROM (VALUES
      ('SpireCarePlanIntervention', ARRAY[
        'id','organizationId','legalEntityId','patientId','carePlanId','goalId','title','instructions','frequency',
        'responsibleRole','serviceType','status','createdById','createdAt','updatedAt'
      ]::text[]),
      ('SpireCarePlanRisk', ARRAY[
        'id','organizationId','legalEntityId','patientId','carePlanId','category','title','riskLevel','triggerDescription',
        'preventionPlan','responsePlan','emergencyInstructions','active','createdAt','updatedAt'
      ]::text[]),
      ('SpireCarePlanVersion', ARRAY[
        'id','organizationId','carePlanId','version','snapshot','reason','createdById','createdAt'
      ]::text[]),
      ('SpireCarePlanSignature', ARRAY[
        'id','organizationId','legalEntityId','patientId','carePlanId','signerRole','signerName','signerUserId',
        'signatureMethod','status','signedAt','ipAddress','userAgent','attestation'
      ]::text[]),
      ('SpireGoalProgressEntry', ARRAY[
        'id','organizationId','legalEntityId','patientId','goalId','encounterId','noteId','interventionId','assessmentId',
        'incidentId','appointmentId','medicationOrderId','value','unit','progressPercent','status','narrative','recordedById','recordedAt'
      ]::text[]),
      ('SpireCarePlanServiceLink', ARRAY[
        'id','organizationId','legalEntityId','patientId','carePlanId','authorizationId','serviceCode','serviceName',
        'approvedServiceType','startsAt','endsAt','authorizedUnits','active','createdAt'
      ]::text[])
    ) AS specs(table_name, canonical_columns)
  LOOP
    IF to_regclass(format('public.%I', table_spec.table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    FOR legacy_column IN
      SELECT c.column_name
      FROM information_schema.columns c
      WHERE c.table_schema='public'
        AND c.table_name=table_spec.table_name
        AND c.is_nullable='NO'
        AND NOT (c.column_name = ANY(table_spec.canonical_columns))
    LOOP
      RAISE NOTICE 'Relaxing obsolete %.% legacy NOT NULL constraint', table_spec.table_name, legacy_column.column_name;
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL',
        table_spec.table_name,
        legacy_column.column_name
      );
    END LOOP;
  END LOOP;
END
$$;

COMMENT ON TABLE "SpireCarePlanIntervention" IS
  'SPIRE care-plan interventions. Legacy columns may remain for backward compatibility; current SPIRE uses the canonical intervention fields repaired in 20260811201500.';
COMMENT ON TABLE "SpireCarePlanRisk" IS
  'SPIRE care-plan risks. Legacy columns may remain for backward compatibility; current SPIRE uses the canonical risk fields repaired in 20260811201500.';
