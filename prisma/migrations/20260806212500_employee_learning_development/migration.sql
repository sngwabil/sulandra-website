CREATE TABLE IF NOT EXISTS "EmployeeLearningCourse" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT 'CUSTOM',
  "deliveryType" TEXT NOT NULL DEFAULT 'ONLINE',
  "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  "renewalMonths" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeLearningCourse" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeLearningCourse" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "EmployeeLearningCourse" ADD COLUMN IF NOT EXISTS "deliveryType" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "EmployeeLearningCourse" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "EmployeeLearningCourse" ADD COLUMN IF NOT EXISTS "renewalMonths" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmployeeLearningCourse" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "EmployeeLearningCourse" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeLearningCourse" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeLearningCourse" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeLearningCourse_org_idx" ON "EmployeeLearningCourse"("organizationId","active","category","title");

CREATE TABLE IF NOT EXISTS "EmployeeLearningAssignment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT TRUE,
  "dueAt" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "score" DOUBLE PRECISION,
  "notes" TEXT NOT NULL DEFAULT '',
  "assignedById" TEXT NOT NULL,
  "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION;
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "assignedById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeLearningAssignment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeLearningAssignment_unique" ON "EmployeeLearningAssignment"("organizationId","employeeId","courseId");
CREATE INDEX IF NOT EXISTS "EmployeeLearningAssignment_employee_idx" ON "EmployeeLearningAssignment"("organizationId","employeeId","status","dueAt");
DO $$ BEGIN
  ALTER TABLE "EmployeeLearningAssignment" ADD CONSTRAINT "EmployeeLearningAssignment_status_chk" CHECK ("status" IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','FAILED','EXEMPT'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EmployeeDevelopmentGoal" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "targetDate" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeDevelopmentGoal" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeDevelopmentGoal" ADD COLUMN IF NOT EXISTS "targetDate" TIMESTAMPTZ;
ALTER TABLE "EmployeeDevelopmentGoal" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PLANNED';
ALTER TABLE "EmployeeDevelopmentGoal" ADD COLUMN IF NOT EXISTS "createdById" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeDevelopmentGoal" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeDevelopmentGoal" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeDevelopmentGoal_employee_idx" ON "EmployeeDevelopmentGoal"("organizationId","employeeId","status","targetDate");
DO $$ BEGIN
  ALTER TABLE "EmployeeDevelopmentGoal" ADD CONSTRAINT "EmployeeDevelopmentGoal_status_chk" CHECK ("status" IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EmployeeLearningEvent" (
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
CREATE INDEX IF NOT EXISTS "EmployeeLearningEvent_org_idx" ON "EmployeeLearningEvent"("organizationId","createdAt" DESC);
