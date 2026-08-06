CREATE TABLE IF NOT EXISTS "Employee360AccessGrant" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "profile" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "locationId" TEXT,
  "employeeId" TEXT,
  "reason" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "expiresAt" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Employee360AccessGrant_scope_check" CHECK ("scopeType" IN ('GLOBAL','LOCATION','EMPLOYEE')),
  CONSTRAINT "Employee360AccessGrant_profile_check" CHECK ("profile" IN (
    'HR_FULL','ADMIN_GLOBAL','EXECUTIVE_GLOBAL','PROGRAM_MANAGER','HOUSE_MANAGER','SCHEDULER',
    'EDUCATION_MANAGER','AUDITOR_READ_ONLY','ADMIN_SUPPORT','BILLING','CLINICAL_MANAGER'
  )),
  CONSTRAINT "Employee360AccessGrant_scope_target_check" CHECK (
    ("scopeType"='GLOBAL' AND "locationId" IS NULL AND "employeeId" IS NULL)
    OR ("scopeType"='LOCATION' AND "locationId" IS NOT NULL AND "employeeId" IS NULL)
    OR ("scopeType"='EMPLOYEE' AND "employeeId" IS NOT NULL AND "locationId" IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS "Employee360AccessGrant_actor_idx"
  ON "Employee360AccessGrant"("organizationId","actorUserId","active");
CREATE INDEX IF NOT EXISTS "Employee360AccessGrant_scope_idx"
  ON "Employee360AccessGrant"("organizationId","scopeType","locationId","employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "Employee360AccessGrant_active_unique_idx"
  ON "Employee360AccessGrant"(
    "organizationId","actorUserId","profile","scopeType",
    COALESCE("locationId",''),COALESCE("employeeId",'')
  ) WHERE "active"=TRUE;

CREATE TABLE IF NOT EXISTS "Employee360AccessEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetEmployeeId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "capability" TEXT,
  "sensitivity" TEXT,
  "decision" TEXT NOT NULL,
  "reason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Employee360AccessEvent_decision_check" CHECK ("decision" IN ('ALLOW','DENY')),
  CONSTRAINT "Employee360AccessEvent_sensitivity_check" CHECK (
    "sensitivity" IS NULL OR "sensitivity" IN ('GENERAL','HR_CONFIDENTIAL','MEDICAL','BACKGROUND','DISCIPLINARY','IDENTITY','COMPENSATION')
  )
);

CREATE INDEX IF NOT EXISTS "Employee360AccessEvent_target_idx"
  ON "Employee360AccessEvent"("organizationId","targetEmployeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Employee360AccessEvent_actor_idx"
  ON "Employee360AccessEvent"("organizationId","actorUserId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Employee360AccessEvent_decision_idx"
  ON "Employee360AccessEvent"("organizationId","decision","createdAt" DESC);

ALTER TABLE "EmployeeDocument"
  ADD COLUMN IF NOT EXISTS "sensitivity" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "EmployeeDocument"
  ADD COLUMN IF NOT EXISTS "employeeVisible" BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='EmployeeDocument_sensitivity_check'
  ) THEN
    ALTER TABLE "EmployeeDocument"
      ADD CONSTRAINT "EmployeeDocument_sensitivity_check"
      CHECK ("sensitivity" IN ('GENERAL','HR_CONFIDENTIAL','MEDICAL','BACKGROUND','DISCIPLINARY','IDENTITY','COMPENSATION'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EmployeeDocument_sensitivity_idx"
  ON "EmployeeDocument"("organizationId","employeeId","sensitivity","status");
CREATE INDEX IF NOT EXISTS "EmployeeDocument_employee_visible_idx"
  ON "EmployeeDocument"("organizationId","employeeId","employeeVisible","status");
