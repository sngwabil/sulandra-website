-- SPIRE clinical services: assignment-scoped chart access, intake review,
-- medication orders/MAR, tasks, notes, vitals, and append-only audit records.

CREATE TABLE IF NOT EXISTS "SpireHome" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "SpireHome_organizationId_active_idx"
  ON "SpireHome" ("organizationId", "active");

CREATE TABLE IF NOT EXISTS "SpireClientProfile" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "homeId" TEXT,
  "displayName" TEXT NOT NULL,
  "dateOfBirth" DATE,
  "allergies" TEXT,
  "diagnoses" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "medicalHistory" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "emergencyContacts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "guardians" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "providers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "risks" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "diet" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "mobility" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "communication" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "behavioralSupports" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "sourceIntakeImportId" TEXT,
  "verifiedAt" TIMESTAMPTZ,
  "verifiedByUserId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireClientProfile_org_client_key" UNIQUE ("organizationId", "clientId")
);
CREATE INDEX IF NOT EXISTS "SpireClientProfile_org_home_idx"
  ON "SpireClientProfile" ("organizationId", "homeId");

CREATE TABLE IF NOT EXISTS "SpireEmployeeHomeAssignment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "homeId" TEXT NOT NULL,
  "assignedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireEmployeeHomeAssignment_unique" UNIQUE ("organizationId", "userId", "homeId")
);
CREATE INDEX IF NOT EXISTS "SpireEmployeeHomeAssignment_lookup_idx"
  ON "SpireEmployeeHomeAssignment" ("organizationId", "userId");

CREATE TABLE IF NOT EXISTS "SpireEmployeeClientAssignment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "assignedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireEmployeeClientAssignment_unique" UNIQUE ("organizationId", "userId", "clientId")
);
CREATE INDEX IF NOT EXISTS "SpireEmployeeClientAssignment_lookup_idx"
  ON "SpireEmployeeClientAssignment" ("organizationId", "userId");

CREATE TABLE IF NOT EXISTS "SpireIntakeImport" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT,
  "fileName" TEXT,
  "mimeType" TEXT,
  "storageKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "extractionProvider" TEXT,
  "extractedData" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "reviewNotes" TEXT,
  "submittedByUserId" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireIntakeImport_status_check" CHECK ("status" IN ('QUEUED','EXTRACTING','REVIEW_REQUIRED','APPROVED','REJECTED','FAILED'))
);
CREATE INDEX IF NOT EXISTS "SpireIntakeImport_org_status_idx"
  ON "SpireIntakeImport" ("organizationId", "status", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireMedicationOrder" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "dose" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "dueTimes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "instructions" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "orderedByUserId" TEXT NOT NULL,
  "lastModifiedByUserId" TEXT NOT NULL,
  "holdReason" TEXT,
  "discontinueReason" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireMedicationOrder_status_check" CHECK ("status" IN ('ACTIVE','HELD','DISCONTINUED','COMPLETED'))
);
CREATE INDEX IF NOT EXISTS "SpireMedicationOrder_client_status_idx"
  ON "SpireMedicationOrder" ("organizationId", "clientId", "status");

CREATE TABLE IF NOT EXISTS "SpireMedicationAdministration" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "medicationOrderId" TEXT NOT NULL REFERENCES "SpireMedicationOrder"("id") ON DELETE CASCADE,
  "scheduledFor" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "administeredAt" TIMESTAMPTZ,
  "administeredByUserId" TEXT,
  "resultNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireMedicationAdministration_status_check" CHECK ("status" IN ('SCHEDULED','DUE','GIVEN','REFUSED','HELD','MISSED','NOT_AVAILABLE','ERROR')),
  CONSTRAINT "SpireMedicationAdministration_unique" UNIQUE ("medicationOrderId", "scheduledFor")
);
CREATE INDEX IF NOT EXISTS "SpireMedicationAdministration_brain_idx"
  ON "SpireMedicationAdministration" ("organizationId", "clientId", "scheduledFor", "status");

CREATE TABLE IF NOT EXISTS "SpireClinicalTask" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "homeId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "instructions" TEXT,
  "dueAt" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "assignedUserId" TEXT,
  "completedAt" TIMESTAMPTZ,
  "completedByUserId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireClinicalTask_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED','MISSED'))
);
CREATE INDEX IF NOT EXISTS "SpireClinicalTask_brain_idx"
  ON "SpireClinicalTask" ("organizationId", "dueAt", "status", "clientId");

CREATE TABLE IF NOT EXISTS "SpireClinicalNote" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "noteType" TEXT NOT NULL DEFAULT 'PROGRESS_NOTE',
  "body" TEXT NOT NULL,
  "signedByUserId" TEXT NOT NULL,
  "signedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "SpireClinicalNote_client_idx"
  ON "SpireClinicalNote" ("organizationId", "clientId", "signedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireVitalSign" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "temperature" NUMERIC,
  "pulse" INTEGER,
  "respirations" INTEGER,
  "systolic" INTEGER,
  "diastolic" INTEGER,
  "spo2" INTEGER,
  "weight" NUMERIC,
  "oxygen" TEXT,
  "recordedByUserId" TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "SpireVitalSign_client_idx"
  ON "SpireVitalSign" ("organizationId", "clientId", "recordedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireClinicalAuditEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorEmail" TEXT,
  "clientId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "beforeValue" JSONB,
  "afterValue" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "SpireClinicalAuditEvent_org_created_idx"
  ON "SpireClinicalAuditEvent" ("organizationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireClinicalAuditEvent_client_created_idx"
  ON "SpireClinicalAuditEvent" ("organizationId", "clientId", "createdAt" DESC);

-- Prevent mutation/deletion of clinical audit history at the database layer.
CREATE OR REPLACE FUNCTION "prevent_spire_clinical_audit_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SpireClinicalAuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireClinicalAuditEvent_no_update" ON "SpireClinicalAuditEvent";
CREATE TRIGGER "SpireClinicalAuditEvent_no_update"
BEFORE UPDATE ON "SpireClinicalAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_clinical_audit_mutation"();

DROP TRIGGER IF EXISTS "SpireClinicalAuditEvent_no_delete" ON "SpireClinicalAuditEvent";
CREATE TRIGGER "SpireClinicalAuditEvent_no_delete"
BEFORE DELETE ON "SpireClinicalAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_spire_clinical_audit_mutation"();
