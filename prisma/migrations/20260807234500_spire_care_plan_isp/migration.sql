CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SpireCarePlanVersion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "carePlanId" text NOT NULL,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "reason" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("carePlanId","version")
);
CREATE INDEX IF NOT EXISTS "SpireCarePlanVersion_plan_idx" ON "SpireCarePlanVersion"("organizationId","carePlanId","version");

CREATE TABLE IF NOT EXISTS "SpireCarePlanGoal" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "carePlanId" text NOT NULL,
  "title" text NOT NULL,
  "baseline" text,
  "desiredOutcome" text,
  "targetValue" numeric,
  "targetUnit" text,
  "frequency" text,
  "responsibleDiscipline" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "progressPercent" numeric NOT NULL DEFAULT 0,
  "startsAt" date,
  "dueDate" date,
  "reviewDate" date,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCarePlanGoal_patient_idx" ON "SpireCarePlanGoal"("organizationId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpireCarePlanIntervention" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "carePlanId" text NOT NULL,
  "goalId" text,
  "title" text NOT NULL,
  "instructions" text NOT NULL,
  "frequency" text,
  "responsibleRole" text,
  "serviceType" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCarePlanIntervention_patient_idx" ON "SpireCarePlanIntervention"("organizationId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpireCarePlanRisk" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "carePlanId" text NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "riskLevel" text NOT NULL DEFAULT 'MODERATE',
  "triggerDescription" text,
  "preventionPlan" text,
  "responsePlan" text,
  "emergencyInstructions" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCarePlanRisk_patient_idx" ON "SpireCarePlanRisk"("organizationId","patientId","active");

CREATE TABLE IF NOT EXISTS "SpireCarePlanSignature" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "carePlanId" text NOT NULL,
  "signerRole" text NOT NULL,
  "signerName" text NOT NULL,
  "signerUserId" text,
  "signatureMethod" text NOT NULL DEFAULT 'ELECTRONIC',
  "status" text NOT NULL DEFAULT 'SIGNED',
  "signedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "attestation" text
);
CREATE INDEX IF NOT EXISTS "SpireCarePlanSignature_plan_idx" ON "SpireCarePlanSignature"("organizationId","carePlanId","signedAt");

CREATE TABLE IF NOT EXISTS "SpireGoalProgressEntry" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "goalId" text NOT NULL,
  "encounterId" text,
  "noteId" text,
  "interventionId" text,
  "assessmentId" text,
  "incidentId" text,
  "appointmentId" text,
  "medicationOrderId" text,
  "value" numeric,
  "unit" text,
  "progressPercent" numeric,
  "status" text NOT NULL DEFAULT 'DOCUMENTED',
  "narrative" text,
  "recordedById" text,
  "recordedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireGoalProgressEntry_goal_idx" ON "SpireGoalProgressEntry"("organizationId","patientId","goalId","recordedAt");

CREATE TABLE IF NOT EXISTS "SpireAssessmentTemplate" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organizationId","code")
);

CREATE TABLE IF NOT EXISTS "SpireAssessmentResponse" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "assessmentId" text NOT NULL,
  "templateId" text,
  "carePlanId" text,
  "responses" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "score" numeric,
  "riskLevel" text,
  "status" text NOT NULL DEFAULT 'COMPLETED',
  "completedById" text,
  "completedAt" timestamptz NOT NULL DEFAULT now(),
  "signedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "SpireAssessmentResponse_patient_idx" ON "SpireAssessmentResponse"("organizationId","patientId","completedAt");

CREATE TABLE IF NOT EXISTS "SpireCarePlanServiceLink" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "carePlanId" text NOT NULL,
  "authorizationId" text,
  "serviceCode" text,
  "serviceName" text,
  "approvedServiceType" text,
  "startsAt" date,
  "endsAt" date,
  "authorizedUnits" numeric,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCarePlanServiceLink_patient_idx" ON "SpireCarePlanServiceLink"("organizationId","patientId","active");

ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "planType" text NOT NULL DEFAULT 'ISP';
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "effectiveDate" date;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "annualReviewDate" date;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "personCenteredSummary" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "importantTo" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "importantFor" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "communicationPlan" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "transportationPlan" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "mealPlan" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "behaviorSupportPlan" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "emergencyPlan" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "rightsModifications" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "restrictiveMeasures" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "nursingDelegationInstructions" text;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "signedAt" timestamptz;
ALTER TABLE "SpireCarePlan" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
