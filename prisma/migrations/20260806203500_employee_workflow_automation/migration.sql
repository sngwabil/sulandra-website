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
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "workflowType" TEXT NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "triggerType" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "triggerEvent" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "steps" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "updatedById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeWorkflowDefinition" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeWorkflowDefinition_type_chk') THEN
    ALTER TABLE "EmployeeWorkflowDefinition" ADD CONSTRAINT "EmployeeWorkflowDefinition_type_chk" CHECK ("workflowType" IN ('ONBOARDING','COMPLIANCE','PERFORMANCE','LEAVE','OFFBOARDING','ASSET_RETURN','DOCUMENT_SIGNATURE','CUSTOM'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeWorkflowDefinition_trigger_chk') THEN
    ALTER TABLE "EmployeeWorkflowDefinition" ADD CONSTRAINT "EmployeeWorkflowDefinition_trigger_chk" CHECK ("triggerType" IN ('MANUAL','EVENT','SCHEDULED'));
  END IF;
END $$;
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
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "definitionId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "referenceType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "referenceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS';
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "startedById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeWorkflowInstance" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeWorkflowInstance_status_chk') THEN
    ALTER TABLE "EmployeeWorkflowInstance" ADD CONSTRAINT "EmployeeWorkflowInstance_status_chk" CHECK ("status" IN ('IN_PROGRESS','COMPLETED','CANCELLED'));
  END IF;
END $$;
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
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "instanceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "stepOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "assignedRole" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "completedById" TEXT;
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeWorkflowStep" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeWorkflowStep_status_chk') THEN
    ALTER TABLE "EmployeeWorkflowStep" ADD CONSTRAINT "EmployeeWorkflowStep_status_chk" CHECK ("status" IN ('PENDING','IN_PROGRESS','COMPLETED','WAIVED','BLOCKED'));
  END IF;
END $$;
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
ALTER TABLE "EmployeeWorkflowEvent" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "EmployeeWorkflowEvent" ADD COLUMN IF NOT EXISTS "actorUserId" TEXT;
ALTER TABLE "EmployeeWorkflowEvent" ADD COLUMN IF NOT EXISTS "eventType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowEvent" ADD COLUMN IF NOT EXISTS "resourceType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWorkflowEvent" ADD COLUMN IF NOT EXISTS "resourceId" TEXT;
ALTER TABLE "EmployeeWorkflowEvent" ADD COLUMN IF NOT EXISTS "details" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "EmployeeWorkflowEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowEvent_org_idx" ON "EmployeeWorkflowEvent"("organizationId","createdAt" DESC);
