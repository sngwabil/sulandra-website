CREATE TABLE IF NOT EXISTS "EmployeeSecureDocument" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'EMPLOYEE',
  "sourceId" TEXT,
  "category" TEXT NOT NULL,
  "sensitivity" TEXT NOT NULL DEFAULT 'GENERAL',
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "bucket" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "etag" TEXT,
  "encryption" TEXT NOT NULL,
  "kmsKeyId" TEXT,
  "ivBase64" TEXT,
  "authTagBase64" TEXT,
  "malwareStatus" TEXT NOT NULL,
  "malwareEngine" TEXT,
  "malwareSignature" TEXT,
  "malwareDetail" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "replacesDocumentId" TEXT,
  "retentionUntil" TIMESTAMPTZ,
  "legalHold" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeSecureDocument_status_check" CHECK ("status" IN ('ACTIVE','SUPERSEDED','QUARANTINED','DESTROYED')),
  CONSTRAINT "EmployeeSecureDocument_malware_check" CHECK ("malwareStatus" IN ('CLEAN','INFECTED','UNAVAILABLE')),
  CONSTRAINT "EmployeeSecureDocument_sensitivity_check" CHECK ("sensitivity" IN ('GENERAL','HR_CONFIDENTIAL','MEDICAL','BACKGROUND','DISCIPLINARY','IDENTITY','COMPENSATION'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeSecureDocument_object_unique" ON "EmployeeSecureDocument"("bucket","objectKey");
CREATE INDEX IF NOT EXISTS "EmployeeSecureDocument_employee_idx" ON "EmployeeSecureDocument"("organizationId","employeeId","category","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeSecureDocument_hash_idx" ON "EmployeeSecureDocument"("organizationId","sha256");

CREATE TABLE IF NOT EXISTS "EmployeeDocumentAccessLog" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeDocumentAccessLog_decision_check" CHECK ("decision" IN ('ALLOW','DENY'))
);
CREATE INDEX IF NOT EXISTS "EmployeeDocumentAccessLog_doc_idx" ON "EmployeeDocumentAccessLog"("organizationId","documentId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeOnboardingLink" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "linkedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "linkedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("organizationId","applicationId"),
  UNIQUE("organizationId","employeeId","applicationId")
);
CREATE INDEX IF NOT EXISTS "EmployeeOnboardingLink_employee_idx" ON "EmployeeOnboardingLink"("organizationId","employeeId","linkedAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeOnboardingSnapshot" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "applicationData" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "assessmentData" JSONB,
  "statusHistory" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "interviews" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "messages" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("organizationId","applicationId")
);

CREATE TABLE IF NOT EXISTS "EmployeeComplianceReminderRun" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "runKey" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "processed" INTEGER NOT NULL DEFAULT 0,
  "sent" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE("organizationId","runKey"),
  CONSTRAINT "EmployeeComplianceReminderRun_status_check" CHECK ("status" IN ('RUNNING','COMPLETED','FAILED'))
);

DO $$ BEGIN
  IF to_regclass('public."Organization"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeSecureDocument_organization_fk') THEN
    ALTER TABLE "EmployeeSecureDocument" ADD CONSTRAINT "EmployeeSecureDocument_organization_fk" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
  IF to_regclass('public."User"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeSecureDocument_employee_fk') THEN
    ALTER TABLE "EmployeeSecureDocument" ADD CONSTRAINT "EmployeeSecureDocument_employee_fk" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF to_regclass('public."EmployeeApplication"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeOnboardingLink_application_fk') THEN
    ALTER TABLE "EmployeeOnboardingLink" ADD CONSTRAINT "EmployeeOnboardingLink_application_fk" FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id") ON DELETE RESTRICT;
  END IF;
  IF to_regclass('public."User"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeOnboardingLink_employee_fk') THEN
    ALTER TABLE "EmployeeOnboardingLink" ADD CONSTRAINT "EmployeeOnboardingLink_employee_fk" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT;
  END IF;
END $$;
