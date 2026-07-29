-- Central company details, globally locked interview slots, and driver applications.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DRIVER';

CREATE TABLE IF NOT EXISTS "CompanySetting" (
  "organizationId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL DEFAULT 'Sulandra Health',
  "addressLine1" TEXT NOT NULL DEFAULT '822 Dalewood Pl',
  "addressLine2" TEXT NOT NULL DEFAULT 'Suite A',
  "city" TEXT NOT NULL DEFAULT 'Dayton',
  "state" TEXT NOT NULL DEFAULT 'Ohio',
  "postalCode" TEXT NOT NULL DEFAULT '45426',
  "emailDisplayName" TEXT NOT NULL DEFAULT 'Human Resources',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "CompanySetting_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompanySetting_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "InterviewSlot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'IN_PERSON',
  "locationOrLink" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "bookedApplicationId" TEXT,
  "bookedAt" TIMESTAMP(3),
  "reminderSentAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterviewSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InterviewSlot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InterviewSlot_bookedApplicationId_fkey"
    FOREIGN KEY ("bookedApplicationId") REFERENCES "EmployeeApplication"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InterviewSlot_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InterviewSlot_status_check"
    CHECK ("status" IN ('AVAILABLE','BOOKED','CANCELLED')),
  CONSTRAINT "InterviewSlot_duration_check"
    CHECK ("endsAt" > "startsAt")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InterviewSlot_organization_starts_key"
  ON "InterviewSlot"("organizationId","startsAt");
CREATE INDEX IF NOT EXISTS "InterviewSlot_available_idx"
  ON "InterviewSlot"("organizationId","status","startsAt");
CREATE INDEX IF NOT EXISTS "InterviewSlot_reminder_idx"
  ON "InterviewSlot"("status","startsAt","reminderSentAt");

CREATE TABLE IF NOT EXISTS "InterviewSlotInvitation" (
  "slotId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterviewSlotInvitation_pkey" PRIMARY KEY ("slotId","applicationId"),
  CONSTRAINT "InterviewSlotInvitation_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "InterviewSlot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InterviewSlotInvitation_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "InterviewSlotInvitation_application_idx"
  ON "InterviewSlotInvitation"("applicationId");

