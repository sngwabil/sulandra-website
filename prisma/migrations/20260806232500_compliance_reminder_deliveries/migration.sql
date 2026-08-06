CREATE TABLE IF NOT EXISTS "EmployeeComplianceReminderDelivery" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "daysRemaining" INTEGER NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "sentAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("organizationId","credentialId","daysRemaining","recipientEmail"),
  CONSTRAINT "EmployeeComplianceReminderDelivery_recipient_check" CHECK ("recipientType" IN ('EMPLOYEE','MANAGER','HR')),
  CONSTRAINT "EmployeeComplianceReminderDelivery_status_check" CHECK ("status" IN ('DRY_RUN','DELIVERED','FAILED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeComplianceReminderDelivery_employee_idx" ON "EmployeeComplianceReminderDelivery"("organizationId","employeeId","createdAt" DESC);
