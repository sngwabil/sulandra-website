CREATE TABLE IF NOT EXISTS "EmployeeSafetyIncident" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "incidentType" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL,
  "location" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'MODERATE',
  "medicalAttention" BOOLEAN NOT NULL DEFAULT FALSE,
  "lostTime" BOOLEAN NOT NULL DEFAULT FALSE,
  "reportable" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reportedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "incidentType" TEXT;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "location" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'MODERATE';
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "medicalAttention" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "lostTime" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "reportable" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "reportedById" TEXT;
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeSafetyIncident" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeSafetyIncident_org_idx" ON "EmployeeSafetyIncident"("organizationId","status","severity","occurredAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeSafetyAction" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "assignedToUserId" TEXT,
  "dueAt" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "completedAt" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "incidentId" TEXT;
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeSafetyAction" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeSafetyAction_org_idx" ON "EmployeeSafetyAction"("organizationId","status","dueAt");

CREATE TABLE IF NOT EXISTS "EmployeeWellnessProgram" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "programType" TEXT NOT NULL DEFAULT 'WELLNESS',
  "startsAt" TIMESTAMPTZ,
  "endsAt" TIMESTAMPTZ,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "resourceUrl" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "programType" TEXT NOT NULL DEFAULT 'WELLNESS';
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "resourceUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeWellnessProgram" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeWellnessProgram_org_idx" ON "EmployeeWellnessProgram"("organizationId","active","programType","startsAt");

CREATE TABLE IF NOT EXISTS "EmployeeHealthSafetyEvent" (
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
ALTER TABLE "EmployeeHealthSafetyEvent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeHealthSafetyEvent" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "EmployeeHealthSafetyEvent" ADD COLUMN IF NOT EXISTS "actorUserId" TEXT;
ALTER TABLE "EmployeeHealthSafetyEvent" ADD COLUMN IF NOT EXISTS "eventType" TEXT;
ALTER TABLE "EmployeeHealthSafetyEvent" ADD COLUMN IF NOT EXISTS "resourceType" TEXT;
ALTER TABLE "EmployeeHealthSafetyEvent" ADD COLUMN IF NOT EXISTS "resourceId" TEXT;
ALTER TABLE "EmployeeHealthSafetyEvent" ADD COLUMN IF NOT EXISTS "details" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "EmployeeHealthSafetyEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeHealthSafetyEvent_org_idx" ON "EmployeeHealthSafetyEvent"("organizationId","createdAt" DESC);
