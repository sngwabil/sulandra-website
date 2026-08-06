CREATE TABLE IF NOT EXISTS "EmployeeWorkAssignment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "clientId" TEXT,
  "assignmentType" TEXT NOT NULL,
  "serviceTypes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "startsAt" TIMESTAMPTZ,
  "endsAt" TIMESTAMPTZ,
  "isHouseManager" BOOLEAN NOT NULL DEFAULT FALSE,
  "eligibilityStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "eligibilityReasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "EmployeeWorkAssignment"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "employeeId" TEXT,
  ADD COLUMN IF NOT EXISTS "locationId" TEXT,
  ADD COLUMN IF NOT EXISTS "clientId" TEXT,
  ADD COLUMN IF NOT EXISTS "assignmentType" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceTypes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "isHouseManager" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "eligibilityStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "eligibilityReasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "createdById" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "EmployeeWorkAssignment_org_idx" ON "EmployeeWorkAssignment"("organizationId","employeeId","locationId","assignmentType");

CREATE TABLE IF NOT EXISTS "EmployeeTimeCorrection" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "timeEntryId" TEXT NOT NULL,
  "clockIn" TIMESTAMPTZ,
  "clockOut" TIMESTAMPTZ,
  "gpsExceptionStatus" TEXT NOT NULL DEFAULT 'NONE',
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'APPROVED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmployeeTimeCorrection_org_idx" ON "EmployeeTimeCorrection"("organizationId","employeeId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeePayrollPeriodSignoff" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "periodStart" TIMESTAMPTZ NOT NULL,
  "periodEnd" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "decidedById" TEXT NOT NULL,
  "decidedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePayrollPeriodSignoff_unique" ON "EmployeePayrollPeriodSignoff"("organizationId","employeeId","periodStart","periodEnd");

CREATE TABLE IF NOT EXISTS "EmployeeUnifiedCommunication" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "externalMessageId" TEXT,
  "attachmentRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "acknowledgedAt" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmployeeUnifiedCommunication_timeline_idx" ON "EmployeeUnifiedCommunication"("organizationId","employeeId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeAccountSecurityEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "sessionId" TEXT,
  "action" TEXT NOT NULL,
  "portal" TEXT,
  "reason" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmployeeAccountSecurityEvent_org_idx" ON "EmployeeAccountSecurityEvent"("organizationId","employeeId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeAccountProfileChange" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "username" TEXT,
  "alternateEmail" TEXT,
  "mergeSourceUserId" TEXT,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmployeeAccountProfileChange_org_idx" ON "EmployeeAccountProfileChange"("organizationId","employeeId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeAuditLedger" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "actorEmail" TEXT,
  "actorRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "reason" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "decision" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "previousHash" TEXT,
  "entryHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmployeeAuditLedger_org_idx" ON "EmployeeAuditLedger"("organizationId","employeeId","createdAt" DESC);
