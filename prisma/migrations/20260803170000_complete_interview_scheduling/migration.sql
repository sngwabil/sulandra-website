-- Complete the shared interview scheduler with reusable invitations and secure public links.

ALTER TABLE "CompanySetting"
  ALTER COLUMN "emailDisplayName" SET DEFAULT 'Sulandra Health Human Resources Department';

UPDATE "CompanySetting"
   SET "emailDisplayName"='Sulandra Health Human Resources Department',
       "updatedAt"=NOW()
 WHERE "emailDisplayName" <> 'Sulandra Health Human Resources Department';

ALTER TABLE "CompanySetting"
  ADD COLUMN IF NOT EXISTS "timeZone" TEXT NOT NULL DEFAULT 'America/New_York';

CREATE TABLE IF NOT EXISTS "InterviewInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterviewInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InterviewInvitation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InterviewInvitation_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InterviewInvitation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InterviewInvitation_status_check"
    CHECK ("status" IN ('ACTIVE','CLOSED','EXPIRED')),
  CONSTRAINT "InterviewInvitation_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InterviewInvitation_tokenHash_key"
  ON "InterviewInvitation"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "InterviewInvitation_one_active_per_application_key"
  ON "InterviewInvitation"("applicationId") WHERE "status"='ACTIVE';
CREATE INDEX IF NOT EXISTS "InterviewInvitation_application_idx"
  ON "InterviewInvitation"("applicationId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "InterviewInvitationSlot" (
  "invitationId" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterviewInvitationSlot_pkey" PRIMARY KEY ("invitationId","slotId"),
  CONSTRAINT "InterviewInvitationSlot_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "InterviewInvitation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InterviewInvitationSlot_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "InterviewSlot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "InterviewInvitationSlot_slot_idx"
  ON "InterviewInvitationSlot"("slotId");
