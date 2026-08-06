CREATE TABLE IF NOT EXISTS "EmployeeAnnouncement" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "audience" TEXT NOT NULL DEFAULT 'ALL_EMPLOYEES',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "publishAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "requiresAcknowledgment" BOOLEAN NOT NULL DEFAULT FALSE,
  "recipientUserIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdById" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "audience" TEXT DEFAULT 'ALL_EMPLOYEES';
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'NORMAL';
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "publishAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "requiresAcknowledgment" BOOLEAN DEFAULT FALSE;
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "recipientUserIds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "active" BOOLEAN DEFAULT TRUE;
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE "EmployeeAnnouncement" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeAnnouncement_org_idx" ON "EmployeeAnnouncement"("organizationId","active","publishAt","priority");

CREATE TABLE IF NOT EXISTS "EmployeeAnnouncementAcknowledgment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeAnnouncementAcknowledgment" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeAnnouncementAcknowledgment" ADD COLUMN IF NOT EXISTS "announcementId" TEXT;
ALTER TABLE "EmployeeAnnouncementAcknowledgment" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "EmployeeAnnouncementAcknowledgment" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMPTZ DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeAnnouncementAcknowledgment_unique" ON "EmployeeAnnouncementAcknowledgment"("organizationId","announcementId","employeeId");

CREATE TABLE IF NOT EXISTS "EmployeeNotification" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "actionUrl" TEXT NOT NULL DEFAULT '',
  "dueAt" TIMESTAMPTZ,
  "readAt" TIMESTAMPTZ,
  "dismissedAt" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "category" TEXT DEFAULT 'GENERAL';
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "actionUrl" TEXT DEFAULT '';
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "dismissedAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "EmployeeNotification" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeNotification_employee_idx" ON "EmployeeNotification"("organizationId","employeeId","readAt","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeCommunicationEvent" (
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
ALTER TABLE "EmployeeCommunicationEvent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeCommunicationEvent" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "EmployeeCommunicationEvent" ADD COLUMN IF NOT EXISTS "actorUserId" TEXT;
ALTER TABLE "EmployeeCommunicationEvent" ADD COLUMN IF NOT EXISTS "eventType" TEXT;
ALTER TABLE "EmployeeCommunicationEvent" ADD COLUMN IF NOT EXISTS "resourceType" TEXT;
ALTER TABLE "EmployeeCommunicationEvent" ADD COLUMN IF NOT EXISTS "resourceId" TEXT;
ALTER TABLE "EmployeeCommunicationEvent" ADD COLUMN IF NOT EXISTS "details" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE "EmployeeCommunicationEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeCommunicationEvent_org_idx" ON "EmployeeCommunicationEvent"("organizationId","createdAt" DESC);
