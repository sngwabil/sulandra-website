-- Employee compliance runs on a startup scheduler before Employee 360 routes are
-- necessarily visited. Bootstrap the shared profile table through the normal
-- migration path so scheduled compliance never depends on route-triggered DDL.
CREATE TABLE IF NOT EXISTS "EmployeeManagementProfile" (
  "userId" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "displayName" TEXT,
  "employeeNumber" TEXT,
  "personalEmail" TEXT,
  "phone" TEXT,
  "alternatePhone" TEXT,
  "department" TEXT,
  "jobTitle" TEXT,
  "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "hireDate" DATE,
  "terminationDate" DATE,
  "supervisorId" TEXT,
  "streetAddress" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zipCode" TEXT,
  "emergencyContactName" TEXT,
  "emergencyContactPhone" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmployeeManagementProfile_org_idx"
  ON "EmployeeManagementProfile"("organizationId");
