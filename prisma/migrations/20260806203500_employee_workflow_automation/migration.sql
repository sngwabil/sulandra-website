CREATE TABLE IF NOT EXISTS "EmployeeWorkflowDefinition" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "workflowType" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL DEFAULT 'MANUAL',
  "triggerEvent" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "steps" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeWorkflowDefinition_type_chk" CHECK ("workflowType" IN ('ONBOARDING','COMPLIANCE','PERFORMANCE','LEAVE','OFFBOARDING','ASSET_RETURN','DOCUMENT_SIGNATURE','CUSTOM')),
  CONSTRAINT "EmployeeWorkflowDefinition_trigger_chk" CHECK ("triggerType" IN ('MANUAL','EVENT','SCHEDULED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowDefinition_org_idx" ON "EmployeeWorkflowDefinition"("organizationId","active","workflowType","name");

CREATE TABLE IF NOT EXISTS "EmployeeWorkflowInstance" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "employeeId" TEXT,
  "referenceType" TEXT NOT NULL DEFAULT '',
  "referenceId" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "notes" TEXT NOT NULL DEFAULT '',
  "startedById" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeWorkflowInstance_status_chk" CHECK ("status" IN ('IN_PROGRESS','COMPLETED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowInstance_org_idx" ON "EmployeeWorkflowInstance"("organizationId","status","startedAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeWorkflowStep" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "stepOrder" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "assignedRole" TEXT NOT NULL DEFAULT '',
  "assignedToUserId" TEXT,
  "dueAt" TIMESTAMPTZ,
  "required" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "notes" TEXT NOT NULL DEFAULT '',
  "completedById" TEXT,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeWorkflowStep_status_chk" CHECK ("status" IN ('PENDING','IN_PROGRESS','COMPLETED','WAIVED','BLOCKED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeWorkflowStep_order_unique" ON "EmployeeWorkflowStep"("organizationId","instanceId","stepOrder");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowStep_assignee_idx" ON "EmployeeWorkflowStep"("organizationId","assignedToUserId","status","dueAt");

CREATE TABLE IF NOT EXISTS "EmployeeWorkflowEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowEvent_org_idx" ON "EmployeeWorkflowEvent"("organizationId","createdAt" DESC);
