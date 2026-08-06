CREATE TABLE IF NOT EXISTS "EmployeeComplianceSettings" (
  "organizationId" TEXT PRIMARY KEY,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
  "scanHour" INTEGER NOT NULL DEFAULT 8,
  "hrRecipients" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "portalUrl" TEXT NOT NULL DEFAULT 'https://www.sulandrahealth.com/employee-portal.html#myCompliance',
  "senderName" TEXT NOT NULL DEFAULT 'Sulandra Health Human Resources Department',
  "lastScheduledRunDate" DATE,
  "lastRunAt" TIMESTAMPTZ,
  "updatedById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeComplianceSettings_scan_hour_check" CHECK ("scanHour" BETWEEN 0 AND 23)
);

CREATE TABLE IF NOT EXISTS "EmployeeComplianceRequirement" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "requirementType" TEXT NOT NULL,
  "documentCategory" TEXT,
  "documentTitleContains" TEXT,
  "documentSensitivity" TEXT NOT NULL DEFAULT 'GENERAL',
  "courseCode" TEXT,
  "courseTitle" TEXT,
  "attestationText" TEXT,
  "requiredForAll" BOOLEAN NOT NULL DEFAULT FALSE,
  "appliesToRoles" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "appliesToDepartments" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "appliesToJobTitles" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "appliesToLocationIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "employmentStatuses" JSONB NOT NULL DEFAULT '["ACTIVE"]'::jsonb,
  "dueDaysAfterHire" INTEGER NOT NULL DEFAULT 30,
  "renewalDays" INTEGER,
  "warningWindowDays" INTEGER NOT NULL DEFAULT 60,
  "reminderDays" JSONB NOT NULL DEFAULT '[60,30,14,7,1,0,-1,-7,-14,-30]'::jsonb,
  "managerEscalationDays" JSONB NOT NULL DEFAULT '[-1,-7,-14,-30]'::jsonb,
  "hrEscalationDays" JSONB NOT NULL DEFAULT '[-7,-14,-30]'::jsonb,
  "notifyEmployee" BOOLEAN NOT NULL DEFAULT TRUE,
  "notifySupervisor" BOOLEAN NOT NULL DEFAULT TRUE,
  "notifyLocationManager" BOOLEAN NOT NULL DEFAULT TRUE,
  "notifyHR" BOOLEAN NOT NULL DEFAULT TRUE,
  "autoAssignEducation" BOOLEAN NOT NULL DEFAULT TRUE,
  "allowEmployeeUpload" BOOLEAN NOT NULL DEFAULT TRUE,
  "allowEmployeeAttestation" BOOLEAN NOT NULL DEFAULT TRUE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeComplianceRequirement_type_check" CHECK ("requirementType" IN ('DOCUMENT','EDUCATION','ATTESTATION','MANUAL')),
  CONSTRAINT "EmployeeComplianceRequirement_sensitivity_check" CHECK ("documentSensitivity" IN ('GENERAL','HR_CONFIDENTIAL','MEDICAL','BACKGROUND','DISCIPLINARY','IDENTITY','COMPENSATION')),
  CONSTRAINT "EmployeeComplianceRequirement_due_days_check" CHECK ("dueDaysAfterHire" BETWEEN 0 AND 3650),
  CONSTRAINT "EmployeeComplianceRequirement_renewal_days_check" CHECK ("renewalDays" IS NULL OR "renewalDays" BETWEEN 1 AND 3650),
  CONSTRAINT "EmployeeComplianceRequirement_warning_days_check" CHECK ("warningWindowDays" BETWEEN 1 AND 365)
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeComplianceRequirement_code_unique"
  ON "EmployeeComplianceRequirement"("organizationId",LOWER("code"));
CREATE INDEX IF NOT EXISTS "EmployeeComplianceRequirement_active_idx"
  ON "EmployeeComplianceRequirement"("organizationId","active","requirementType");

CREATE TABLE IF NOT EXISTS "EmployeeComplianceAssignment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "source" TEXT NOT NULL DEFAULT 'AUTOMATIC',
  "dueDate" DATE,
  "completedAt" TIMESTAMPTZ,
  "expiresAt" DATE,
  "evidenceType" TEXT,
  "evidenceId" TEXT,
  "evidenceSummary" TEXT,
  "exemptReason" TEXT,
  "exemptUntil" DATE,
  "manuallyCompletedAt" TIMESTAMPTZ,
  "manualNotes" TEXT,
  "lastEvaluatedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeComplianceAssignment_status_check" CHECK ("status" IN ('NOT_STARTED','MISSING','IN_PROGRESS','DUE_SOON','OVERDUE','COMPLIANT','EXEMPT','NOT_APPLICABLE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeComplianceAssignment_unique"
  ON "EmployeeComplianceAssignment"("organizationId","requirementId","employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeComplianceAssignment_status_idx"
  ON "EmployeeComplianceAssignment"("organizationId","status","dueDate");
CREATE INDEX IF NOT EXISTS "EmployeeComplianceAssignment_employee_idx"
  ON "EmployeeComplianceAssignment"("organizationId","employeeId","status");

CREATE TABLE IF NOT EXISTS "EmployeeComplianceAttestation" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "statement" TEXT NOT NULL,
  "typedName" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "acceptedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmployeeComplianceAttestation_assignment_idx"
  ON "EmployeeComplianceAttestation"("organizationId","assignmentId","acceptedAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeComplianceReminder" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "recipientType" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "daysFromDue" INTEGER NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeComplianceReminder_recipient_check" CHECK ("recipientType" IN ('EMPLOYEE','SUPERVISOR','LOCATION_MANAGER','HR')),
  CONSTRAINT "EmployeeComplianceReminder_status_check" CHECK ("status" IN ('QUEUED','SENT','FAILED','SKIPPED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeComplianceReminder_dedupe_unique"
  ON "EmployeeComplianceReminder"("organizationId","dedupeKey");
CREATE INDEX IF NOT EXISTS "EmployeeComplianceReminder_assignment_idx"
  ON "EmployeeComplianceReminder"("organizationId","assignmentId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeComplianceReminder_status_idx"
  ON "EmployeeComplianceReminder"("organizationId","status","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeComplianceRun" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedById" TEXT,
  "metrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  CONSTRAINT "EmployeeComplianceRun_trigger_check" CHECK ("trigger" IN ('MANUAL','SCHEDULED','STARTUP')),
  CONSTRAINT "EmployeeComplianceRun_status_check" CHECK ("status" IN ('RUNNING','COMPLETED','FAILED','SKIPPED'))
);

CREATE INDEX IF NOT EXISTS "EmployeeComplianceRun_org_idx"
  ON "EmployeeComplianceRun"("organizationId","startedAt" DESC);

DO $$
BEGIN
  IF to_regclass('public."EmployeeDocument"') IS NOT NULL THEN
    ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'APPROVED';
    ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
    ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMPTZ;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeDocument_review_status_check') THEN
      ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_review_status_check" CHECK ("reviewStatus" IN ('PENDING','APPROVED','REJECTED'));
    END IF;
    CREATE INDEX IF NOT EXISTS "EmployeeDocument_review_status_idx"
      ON "EmployeeDocument"("organizationId","employeeId","reviewStatus","status");
  END IF;
END $$;

INSERT INTO "EmployeeComplianceSettings" ("organizationId")
SELECT "id" FROM "Organization"
ON CONFLICT ("organizationId") DO NOTHING;
