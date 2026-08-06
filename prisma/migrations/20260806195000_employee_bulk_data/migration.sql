CREATE TABLE IF NOT EXISTS "EmployeeBulkDataJob" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0,
  "errorRows" INTEGER NOT NULL DEFAULT 0,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "resultSummary" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "EmployeeBulkDataJob_org_idx" ON "EmployeeBulkDataJob"("organizationId","createdAt" DESC,"entityType");

CREATE TABLE IF NOT EXISTS "EmployeeBulkDataError" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "fieldName" TEXT NOT NULL DEFAULT '',
  "errorCode" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "rowData" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmployeeBulkDataError_job_idx" ON "EmployeeBulkDataError"("organizationId","jobId","rowNumber");

CREATE TABLE IF NOT EXISTS "EmployeeDataQualityIssue" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "severity" TEXT NOT NULL,
  "issueType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmployeeDataQualityIssue_org_idx" ON "EmployeeDataQualityIssue"("organizationId","status","severity","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeBulkDataEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmployeeBulkDataEvent_org_idx" ON "EmployeeBulkDataEvent"("organizationId","createdAt" DESC);

ALTER TABLE "EmployeeBulkDataJob" DROP CONSTRAINT IF EXISTS "EmployeeBulkDataJob_job_type_check";
ALTER TABLE "EmployeeBulkDataJob" ADD CONSTRAINT "EmployeeBulkDataJob_job_type_check" CHECK ("jobType" IN ('IMPORT','EXPORT'));
ALTER TABLE "EmployeeBulkDataJob" DROP CONSTRAINT IF EXISTS "EmployeeBulkDataJob_mode_check";
ALTER TABLE "EmployeeBulkDataJob" ADD CONSTRAINT "EmployeeBulkDataJob_mode_check" CHECK ("mode" IN ('VALIDATE_ONLY','UPSERT','INSERT_ONLY','CSV','JSON'));
ALTER TABLE "EmployeeDataQualityIssue" DROP CONSTRAINT IF EXISTS "EmployeeDataQualityIssue_status_check";
ALTER TABLE "EmployeeDataQualityIssue" ADD CONSTRAINT "EmployeeDataQualityIssue_status_check" CHECK ("status" IN ('OPEN','IGNORED','RESOLVED'));
