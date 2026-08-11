CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Specialty-care parity foundation. The common episode/observation model keeps specialty
-- workflows longitudinal while the specialty-specific tables preserve clinically meaningful structure.

CREATE TABLE IF NOT EXISTS "SpireSpecialtyEpisode" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "specialty" text NOT NULL,
  "episodeType" text NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "diagnosis" text,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "endedAt" timestamptz,
  "primaryProviderUserId" text,
  "careTeam" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireSpecialtyEpisode_status_check" CHECK ("status" IN ('PLANNED','ACTIVE','ON_HOLD','COMPLETE','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "SpireSpecialtyEpisode_patient_idx" ON "SpireSpecialtyEpisode"("organizationId","legalEntityId","patientId","specialty","startedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireSpecialtyObservation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "episodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "specialty" text NOT NULL,
  "observationType" text NOT NULL,
  "bodySite" text,
  "laterality" text,
  "value" text,
  "numericValue" numeric,
  "unit" text,
  "interpretation" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "observedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireSpecialtyObservation_patient_idx" ON "SpireSpecialtyObservation"("organizationId","legalEntityId","patientId","specialty","observedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireSpecialtyProcedureReport" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "episodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "specialty" text NOT NULL,
  "procedureName" text NOT NULL,
  "bodySite" text,
  "laterality" text,
  "indication" text,
  "findings" text,
  "impression" text,
  "complications" text,
  "performedAt" timestamptz NOT NULL DEFAULT now(),
  "performedById" text,
  "structuredData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'FINAL',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireSpecialtyProcedureReport_patient_idx" ON "SpireSpecialtyProcedureReport"("organizationId","legalEntityId","patientId","specialty","performedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePregnancyEpisode" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "specialtyEpisodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "gravida" integer,
  "para" integer,
  "estimatedDueDate" date,
  "lastMenstrualPeriod" date,
  "gestationalAgeAtStart" text,
  "pregnancyStatus" text NOT NULL DEFAULT 'PREGNANT',
  "riskFactors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "fetusCount" integer NOT NULL DEFAULT 1,
  "prenatalSummary" text,
  "deliveryAt" timestamptz,
  "deliveryType" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePregnancyEpisode_patient_idx" ON "SpirePregnancyEpisode"("organizationId","legalEntityId","patientId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireLaborEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "pregnancyEpisodeId" text NOT NULL REFERENCES "SpirePregnancyEpisode"("id") ON DELETE CASCADE,
  "eventType" text NOT NULL,
  "cervicalDilationCm" numeric,
  "effacementPercent" integer,
  "station" text,
  "fetalHeartRate" integer,
  "contractionPattern" text,
  "membraneStatus" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurredAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireLaborEvent_episode_idx" ON "SpireLaborEvent"("organizationId","legalEntityId","pregnancyEpisodeId","occurredAt");

CREATE TABLE IF NOT EXISTS "SpireOncologyTreatmentPlan" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "specialtyEpisodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "diagnosis" text NOT NULL,
  "stage" text,
  "intent" text,
  "protocolName" text,
  "regimenName" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PLANNED',
  "cycleCount" integer,
  "startDate" date,
  "endDate" date,
  "treatmentParameters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "verification" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdById" text,
  "approvedById" text,
  "approvedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireOncologyTreatmentPlan_status_check" CHECK ("status" IN ('PLANNED','ACTIVE','ON_HOLD','COMPLETE','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "SpireOncologyTreatmentPlan_patient_idx" ON "SpireOncologyTreatmentPlan"("organizationId","legalEntityId","patientId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireOncologyCycle" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "treatmentPlanId" text NOT NULL REFERENCES "SpireOncologyTreatmentPlan"("id") ON DELETE CASCADE,
  "cycleNumber" integer NOT NULL,
  "dayNumber" integer NOT NULL DEFAULT 1,
  "scheduledAt" timestamptz,
  "status" text NOT NULL DEFAULT 'PLANNED',
  "preTreatmentChecklist" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "labsReviewed" boolean NOT NULL DEFAULT false,
  "parametersMet" boolean,
  "holdReason" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireOncologyCycle_plan_idx" ON "SpireOncologyCycle"("organizationId","legalEntityId","treatmentPlanId","cycleNumber","dayNumber");

CREATE TABLE IF NOT EXISTS "SpireOncologyAdministration" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "treatmentPlanId" text NOT NULL REFERENCES "SpireOncologyTreatmentPlan"("id") ON DELETE CASCADE,
  "cycleId" text REFERENCES "SpireOncologyCycle"("id") ON DELETE SET NULL,
  "agentName" text NOT NULL,
  "dose" text NOT NULL,
  "route" text,
  "status" text NOT NULL DEFAULT 'PLANNED',
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "verifiedById" text,
  "administeredById" text,
  "adverseReaction" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireOncologyAdministration_plan_idx" ON "SpireOncologyAdministration"("organizationId","legalEntityId","treatmentPlanId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireDialysisTreatment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "specialtyEpisodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "treatmentType" text NOT NULL,
  "accessType" text,
  "preWeight" numeric,
  "postWeight" numeric,
  "targetWeight" numeric,
  "ultrafiltrationGoalMl" numeric,
  "ultrafiltrationRemovedMl" numeric,
  "dialysate" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "status" text NOT NULL DEFAULT 'IN_PROGRESS',
  "complications" text,
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireDialysisTreatment_patient_idx" ON "SpireDialysisTreatment"("organizationId","legalEntityId","patientId","startedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireTransplantEpisode" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "specialtyEpisodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "organ" text NOT NULL,
  "phase" text NOT NULL DEFAULT 'EVALUATION',
  "listingStatus" text,
  "listingDate" date,
  "transplantDate" date,
  "donorType" text,
  "center" text,
  "compatibility" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "immunosuppression" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireTransplantEpisode_patient_idx" ON "SpireTransplantEpisode"("organizationId","legalEntityId","patientId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireGenomicResult" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "specialtyEpisodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "testName" text NOT NULL,
  "gene" text,
  "variant" text,
  "zygosity" text,
  "classification" text,
  "clinicalSignificance" text,
  "pharmacogenomicImplication" text,
  "tumorBiomarker" boolean NOT NULL DEFAULT false,
  "resultedAt" timestamptz,
  "laboratory" text,
  "structuredData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireGenomicResult_patient_idx" ON "SpireGenomicResult"("organizationId","legalEntityId","patientId","resultedAt" DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS "SpireDentalFinding" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "episodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "toothNumber" text,
  "surface" text,
  "findingType" text NOT NULL,
  "status" text,
  "periodontalData" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "treatmentPlan" text,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireDentalFinding_patient_idx" ON "SpireDentalFinding"("organizationId","legalEntityId","patientId","recordedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireOphthalmologyExam" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "episodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "examType" text NOT NULL,
  "visualAcuityRight" text,
  "visualAcuityLeft" text,
  "iopRight" numeric,
  "iopLeft" numeric,
  "refraction" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "anteriorSegment" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "posteriorSegment" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "impression" text,
  "examinedAt" timestamptz NOT NULL DEFAULT now(),
  "examinedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireOphthalmologyExam_patient_idx" ON "SpireOphthalmologyExam"("organizationId","legalEntityId","patientId","examinedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireDermatologyLesion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "episodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "bodySite" text NOT NULL,
  "laterality" text,
  "lesionType" text,
  "sizeMm" numeric,
  "description" text,
  "assessment" text,
  "plan" text,
  "mediaItemId" text,
  "specimenId" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireDermatologyLesion_patient_idx" ON "SpireDermatologyLesion"("organizationId","legalEntityId","patientId","recordedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireOrthopedicAssessment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "episodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "bodyRegion" text NOT NULL,
  "laterality" text,
  "injuryMechanism" text,
  "rangeOfMotion" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "strength" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "neurovascular" text,
  "specialTests" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "proms" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "assessment" text,
  "plan" text,
  "recordedAt" timestamptz NOT NULL DEFAULT now(),
  "recordedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireOrthopedicAssessment_patient_idx" ON "SpireOrthopedicAssessment"("organizationId","legalEntityId","patientId","recordedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireEndoscopyReport" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "episodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "procedureType" text NOT NULL,
  "indication" text,
  "extent" text,
  "prepQuality" text,
  "findings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "interventions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "specimens" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "impression" text,
  "recommendations" text,
  "performedAt" timestamptz NOT NULL DEFAULT now(),
  "performedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireEndoscopyReport_patient_idx" ON "SpireEndoscopyReport"("organizationId","legalEntityId","patientId","performedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireCardiologyProcedureReport" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE RESTRICT,
  "episodeId" text REFERENCES "SpireSpecialtyEpisode"("id") ON DELETE SET NULL,
  "procedureType" text NOT NULL,
  "indication" text,
  "accessSite" text,
  "hemodynamics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "coronaryFindings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "interventions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "impression" text,
  "performedAt" timestamptz NOT NULL DEFAULT now(),
  "performedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireCardiologyProcedureReport_patient_idx" ON "SpireCardiologyProcedureReport"("organizationId","legalEntityId","patientId","performedAt" DESC);
