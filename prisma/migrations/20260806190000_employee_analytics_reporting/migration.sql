CREATE TABLE IF NOT EXISTS "EmployeeReportDefinition" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "reportType" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "columns" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "schedule" TEXT NOT NULL DEFAULT 'NONE',
  "recipientEmails" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "visibility" TEXT NOT NULL DEFAULT 'HR_ADMIN',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "lastRunAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeReportDefinition_report_type_check" CHECK ("reportType" IN ('WORKFORCE','COMPLIANCE','TIME_ATTENDANCE','PERFORMANCE','COMPENSATION','LEAVE','ASSETS_ACCESS','OFFBOARDING','CUSTOM')),
  CONSTRAINT "EmployeeReportDefinition_schedule_check" CHECK ("schedule" IN ('NONE','DAILY','WEEKLY','MONTHLY','QUARTERLY')),
  CONSTRAINT "EmployeeReportDefinition_visibility_check" CHECK ("visibility" IN ('OWNER_ONLY','HR_ADMIN','MANAGEMENT','AUDITOR')),
  CONSTRAINT "EmployeeReportDefinition_filters_object_check" CHECK (jsonb_typeof("filters")='object'),
  CONSTRAINT "EmployeeReportDefinition_columns_array_check" CHECK (jsonb_typeof("columns")='array'),
  CONSTRAINT "EmployeeReportDefinition_recipients_array_check" CHECK (jsonb_typeof("recipientEmails")='array')
);
CREATE INDEX IF NOT EXISTS "EmployeeReportDefinition_org_idx" ON "EmployeeReportDefinition"("organizationId","active","reportType","name");

CREATE TABLE IF NOT EXISTS "EmployeeReportRun" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "reportDefinitionId" TEXT,
  "reportType" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "filters" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "errorMessage" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeReportRun_format_check" CHECK ("format" IN ('CSV','JSON')),
  CONSTRAINT "EmployeeReportRun_status_check" CHECK ("status" IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  CONSTRAINT "EmployeeReportRun_row_count_check" CHECK ("rowCount">=0),
  CONSTRAINT "EmployeeReportRun_filters_object_check" CHECK (jsonb_typeof("filters")='object')
);
CREATE INDEX IF NOT EXISTS "EmployeeReportRun_org_idx" ON "EmployeeReportRun"("organizationId","createdAt" DESC,"reportType");

CREATE TABLE IF NOT EXISTS "EmployeeAnalyticsEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeAnalyticsEvent_details_object_check" CHECK (jsonb_typeof("details")='object')
);
CREATE INDEX IF NOT EXISTS "EmployeeAnalyticsEvent_org_idx" ON "EmployeeAnalyticsEvent"("organizationId","createdAt" DESC);
