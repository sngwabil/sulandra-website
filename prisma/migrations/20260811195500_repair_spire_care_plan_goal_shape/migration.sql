-- Production repair for legacy/partial SpireCarePlanGoal tables.
--
-- 20260807234500_spire_care_plan_isp used CREATE TABLE IF NOT EXISTS. On a
-- database where an earlier generation of SpireCarePlanGoal already existed,
-- PostgreSQL correctly kept that table as-is. The original migration's repair
-- block only guaranteed organizationId, patientId and status, leaving current
-- SPIRE routes able to reference columns such as title that were absent.
--
-- Do not edit the already-applied historical migration. Repair the live shape
-- additively and idempotently here.

ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "organizationId" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "patientId" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "carePlanId" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "baseline" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "desiredOutcome" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "targetValue" numeric;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "targetUnit" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "frequency" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "responsibleDiscipline" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ACTIVE';
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "progressPercent" numeric DEFAULT 0;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "startsAt" date;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "dueDate" date;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "reviewDate" date;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "createdById" text;
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz DEFAULT now();
ALTER TABLE "SpireCarePlanGoal" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now();

-- Preserve legacy rows instead of deleting/recreating them. Give rows from an
-- older schema a neutral display title only when they have no current title.
UPDATE "SpireCarePlanGoal"
SET "title" = COALESCE(NULLIF(BTRIM("desiredOutcome"), ''), 'Care plan goal')
WHERE "title" IS NULL OR BTRIM("title") = '';

UPDATE "SpireCarePlanGoal" SET "status"='ACTIVE' WHERE "status" IS NULL OR BTRIM("status")='';
UPDATE "SpireCarePlanGoal" SET "progressPercent"=0 WHERE "progressPercent" IS NULL;
UPDATE "SpireCarePlanGoal" SET "createdAt"=now() WHERE "createdAt" IS NULL;
UPDATE "SpireCarePlanGoal" SET "updatedAt"=COALESCE("createdAt",now()) WHERE "updatedAt" IS NULL;

ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "progressPercent" SET DEFAULT 0;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "progressPercent" SET NOT NULL;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "createdAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "updatedAt" SET DEFAULT now();
ALTER TABLE "SpireCarePlanGoal" ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "SpireCarePlanGoal_patient_idx"
  ON "SpireCarePlanGoal"("organizationId","patientId","status");
CREATE INDEX IF NOT EXISTS "SpireCarePlanGoal_entity_patient_idx"
  ON "SpireCarePlanGoal"("organizationId","legalEntityId","patientId","status");
CREATE INDEX IF NOT EXISTS "SpireCarePlanGoal_plan_idx"
  ON "SpireCarePlanGoal"("organizationId","legalEntityId","carePlanId","status");
