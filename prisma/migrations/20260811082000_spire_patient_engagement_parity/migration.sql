CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "SpirePatientPortalInvite" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "email" text,
  "phone" text,
  "proxyName" text,
  "proxyRelationship" text,
  "accessType" text NOT NULL DEFAULT 'PATIENT',
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz,
  "revokedAt" timestamptz,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpirePatientPortalInvite_access_check" CHECK ("accessType" IN ('PATIENT','PROXY'))
);
CREATE INDEX IF NOT EXISTS "SpirePatientPortalInvite_patient_idx" ON "SpirePatientPortalInvite"("organizationId","legalEntityId","patientId","expiresAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePatientPortalSession" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "accessType" text NOT NULL,
  "displayName" text,
  "relationship" text,
  "tokenHash" text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePatientPortalSession_patient_idx" ON "SpirePatientPortalSession"("organizationId","legalEntityId","patientId","expiresAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePatientProxyRelationship" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "proxyName" text NOT NULL,
  "relationship" text NOT NULL,
  "email" text,
  "phone" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "startsAt" timestamptz NOT NULL DEFAULT now(),
  "endsAt" timestamptz,
  "verifiedById" text,
  "verificationMethod" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePatientProxyRelationship_patient_idx" ON "SpirePatientProxyRelationship"("organizationId","legalEntityId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpirePatientRequest" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "requestType" text NOT NULL,
  "subject" text NOT NULL,
  "body" text,
  "status" text NOT NULL DEFAULT 'NEW',
  "priority" text NOT NULL DEFAULT 'NORMAL',
  "requestedFor" timestamptz,
  "assignedToUserId" text,
  "response" text,
  "respondedAt" timestamptz,
  "respondedById" text,
  "source" text NOT NULL DEFAULT 'PORTAL',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpirePatientRequest_status_check" CHECK ("status" IN ('NEW','IN_PROGRESS','WAITING','COMPLETE','DECLINED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "SpirePatientRequest_patient_idx" ON "SpirePatientRequest"("organizationId","legalEntityId","patientId","status","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePatientPortalMessage" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "direction" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "category" text,
  "status" text NOT NULL DEFAULT 'SENT',
  "senderUserId" text,
  "portalDisplayName" text,
  "inReplyToId" text REFERENCES "SpirePatientPortalMessage"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "readAt" timestamptz,
  CONSTRAINT "SpirePatientPortalMessage_direction_check" CHECK ("direction" IN ('TO_PATIENT','FROM_PATIENT'))
);
CREATE INDEX IF NOT EXISTS "SpirePatientPortalMessage_patient_idx" ON "SpirePatientPortalMessage"("organizationId","legalEntityId","patientId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireDigitalCheckIn" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "appointmentId" text REFERENCES "SpireAppointment"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'STARTED',
  "demographicsConfirmed" boolean NOT NULL DEFAULT false,
  "medicationsConfirmed" boolean NOT NULL DEFAULT false,
  "allergiesConfirmed" boolean NOT NULL DEFAULT false,
  "consentsConfirmed" boolean NOT NULL DEFAULT false,
  "questionnaire" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireDigitalCheckIn_patient_idx" ON "SpireDigitalCheckIn"("organizationId","legalEntityId","patientId","startedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireTelehealthSession" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "appointmentId" text REFERENCES "SpireAppointment"("id") ON DELETE SET NULL,
  "encounterId" text REFERENCES "SpireEncounter"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'SCHEDULED',
  "joinCodeHash" text,
  "scheduledAt" timestamptz,
  "patientJoinedAt" timestamptz,
  "providerJoinedAt" timestamptz,
  "startedAt" timestamptz,
  "endedAt" timestamptz,
  "consentAt" timestamptz,
  "deviceCheck" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "qualityMetrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "SpireTelehealthSession_status_check" CHECK ("status" IN ('SCHEDULED','WAITING','IN_PROGRESS','COMPLETE','CANCELLED','NO_SHOW'))
);
CREATE INDEX IF NOT EXISTS "SpireTelehealthSession_patient_idx" ON "SpireTelehealthSession"("organizationId","legalEntityId","patientId","scheduledAt" DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS "SpireRemoteMonitoringEnrollment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "programName" text NOT NULL,
  "condition" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "endedAt" timestamptz,
  "thresholds" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "careTeam" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireRemoteMonitoringEnrollment_patient_idx" ON "SpireRemoteMonitoringEnrollment"("organizationId","legalEntityId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpireRemoteMonitoringDevice" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "enrollmentId" text REFERENCES "SpireRemoteMonitoringEnrollment"("id") ON DELETE SET NULL,
  "deviceType" text NOT NULL,
  "manufacturer" text,
  "model" text,
  "serialNumber" text,
  "sourceSystem" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "pairedAt" timestamptz NOT NULL DEFAULT now(),
  "lastSyncAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireRemoteMonitoringDevice_patient_idx" ON "SpireRemoteMonitoringDevice"("organizationId","legalEntityId","patientId","status");

CREATE TABLE IF NOT EXISTS "SpireRemoteMonitoringReading" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "enrollmentId" text REFERENCES "SpireRemoteMonitoringEnrollment"("id") ON DELETE SET NULL,
  "deviceId" text REFERENCES "SpireRemoteMonitoringDevice"("id") ON DELETE SET NULL,
  "readingType" text NOT NULL,
  "value" text,
  "numericValue" numeric,
  "unit" text,
  "recordedAt" timestamptz NOT NULL,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "source" text NOT NULL DEFAULT 'PATIENT_PORTAL',
  "quality" text,
  "rawData" jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS "SpireRemoteMonitoringReading_patient_idx" ON "SpireRemoteMonitoringReading"("organizationId","legalEntityId","patientId","readingType","recordedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireRemoteMonitoringAlert" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "enrollmentId" text REFERENCES "SpireRemoteMonitoringEnrollment"("id") ON DELETE SET NULL,
  "readingId" text REFERENCES "SpireRemoteMonitoringReading"("id") ON DELETE SET NULL,
  "alertType" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'HIGH',
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "triggeredAt" timestamptz NOT NULL DEFAULT now(),
  "acknowledgedAt" timestamptz,
  "acknowledgedById" text,
  "resolvedAt" timestamptz,
  "resolvedById" text,
  "resolution" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireRemoteMonitoringAlert_patient_idx" ON "SpireRemoteMonitoringAlert"("organizationId","legalEntityId","patientId","status","triggeredAt" DESC);

CREATE TABLE IF NOT EXISTS "SpirePatientEducationAssignment" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "patientId" text NOT NULL REFERENCES "SpirePatient"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "content" text,
  "contentUrl" text,
  "status" text NOT NULL DEFAULT 'ASSIGNED',
  "assignedById" text,
  "assignedAt" timestamptz NOT NULL DEFAULT now(),
  "viewedAt" timestamptz,
  "acknowledgedAt" timestamptz,
  "response" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpirePatientEducationAssignment_patient_idx" ON "SpirePatientEducationAssignment"("organizationId","legalEntityId","patientId","status","assignedAt" DESC);
