CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "incidentNumber" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "incidentType" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "severity" text NOT NULL DEFAULT 'ROUTINE';
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "occurredAt" timestamptz;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "immediateActions" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "injuryDetails" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "medicalAttentionRequired" boolean NOT NULL DEFAULT false;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "hospitalTransfer" boolean NOT NULL DEFAULT false;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "lawEnforcementNotified" boolean NOT NULL DEFAULT false;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "guardianNotifiedAt" timestamptz;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "ssaNotifiedAt" timestamptz;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "doddReportable" boolean NOT NULL DEFAULT false;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "doddCategory" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "doddReportedAt" timestamptz;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "doddReference" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'OPEN';
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "assignedInvestigatorId" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "rootCause" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "contributingFactors" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "investigationSummary" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "correctiveActionSummary" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "closedAt" timestamptz;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "closedById" text;
ALTER TABLE "SpireIncident" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS "SpireIncident_org_incident_number_key" ON "SpireIncident"("organizationId","incidentNumber") WHERE "incidentNumber" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "SpireIncident_patient_status_idx" ON "SpireIncident"("organizationId","patientId","status","occurredAt");

CREATE TABLE IF NOT EXISTS "SpireIncidentWitness" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE CASCADE,
  "witnessName" text NOT NULL,
  "witnessRole" text,
  "contactInfo" text,
  "statement" text,
  "statementTakenAt" timestamptz,
  "statementTakenById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireIncidentWitness_incident_idx" ON "SpireIncidentWitness"("organizationId","incidentId");

CREATE TABLE IF NOT EXISTS "SpireIncidentNotification" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE CASCADE,
  "recipientType" text NOT NULL,
  "recipientName" text,
  "recipientContact" text,
  "method" text,
  "status" text NOT NULL DEFAULT 'PENDING',
  "notifiedAt" timestamptz,
  "notifiedById" text,
  "notes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireIncidentNotification_incident_idx" ON "SpireIncidentNotification"("organizationId","incidentId","status");

CREATE TABLE IF NOT EXISTS "SpireIncidentInvestigation" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE CASCADE,
  "investigatorUserId" text,
  "status" text NOT NULL DEFAULT 'OPEN',
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "summary" text,
  "findings" text,
  "rootCause" text,
  "contributingFactors" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireIncidentInvestigation_incident_idx" ON "SpireIncidentInvestigation"("organizationId","incidentId","status");

CREATE TABLE IF NOT EXISTS "SpireIncidentCorrectiveAction" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "ownerUserId" text,
  "dueDate" date,
  "status" text NOT NULL DEFAULT 'OPEN',
  "completedAt" timestamptz,
  "verifiedById" text,
  "verifiedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireIncidentCorrectiveAction_incident_idx" ON "SpireIncidentCorrectiveAction"("organizationId","incidentId","status");

CREATE TABLE IF NOT EXISTS "SpireIncidentFollowUp" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE CASCADE,
  "followUpType" text NOT NULL,
  "dueAt" timestamptz,
  "status" text NOT NULL DEFAULT 'OPEN',
  "details" text,
  "completedAt" timestamptz,
  "completedById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireIncidentFollowUp_incident_idx" ON "SpireIncidentFollowUp"("organizationId","incidentId","status","dueAt");

CREATE TABLE IF NOT EXISTS "SpireIncidentAttachment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "patientId" text NOT NULL,
  "incidentId" text NOT NULL REFERENCES "SpireIncident"("id") ON DELETE CASCADE,
  "documentId" text,
  "title" text NOT NULL,
  "category" text,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireIncidentAttachment_incident_idx" ON "SpireIncidentAttachment"("organizationId","incidentId");
