CREATE TABLE IF NOT EXISTS "EmployeeSupportRequest" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT NOT NULL DEFAULT '',
  "assignedToUserId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "EmployeeSupportRequest_employee_idx" ON "EmployeeSupportRequest"("organizationId","employeeId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeSupportRequest_admin_idx" ON "EmployeeSupportRequest"("organizationId","status","priority","createdAt" DESC);
