CREATE TABLE IF NOT EXISTS "EducationAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "courseCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "packageCode" TEXT NOT NULL DEFAULT 'CUSTOM',
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  "dueDate" TIMESTAMP(3),
  "reason" TEXT,
  "assignedById" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "scorePercent" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EducationAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EducationAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "EducationAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "EducationAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "EducationAssignment_employee_status_idx"
  ON "EducationAssignment"("organizationId","employeeId","status");

CREATE INDEX IF NOT EXISTS "EducationAssignment_due_idx"
  ON "EducationAssignment"("organizationId","status","dueDate");

CREATE INDEX IF NOT EXISTS "EducationAssignment_course_idx"
  ON "EducationAssignment"("organizationId","courseCode");

CREATE UNIQUE INDEX IF NOT EXISTS "EducationAssignment_open_unique"
  ON "EducationAssignment"("organizationId","employeeId","courseCode")
  WHERE "status" IN ('ASSIGNED','IN_PROGRESS');
