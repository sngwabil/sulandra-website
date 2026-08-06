CREATE TABLE IF NOT EXISTS "EmployeeEngagementSurvey" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "audience" TEXT NOT NULL DEFAULT 'ALL_EMPLOYEES',
  "anonymous" BOOLEAN NOT NULL DEFAULT TRUE,
  "opensAt" TIMESTAMPTZ,
  "closesAt" TIMESTAMPTZ,
  "recipientUserIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "questions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "audience" TEXT NOT NULL DEFAULT 'ALL_EMPLOYEES';
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "anonymous" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "opensAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "closesAt" TIMESTAMPTZ;
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "recipientUserIds" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "questions" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE "EmployeeEngagementSurvey" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeEngagementSurvey_org_idx" ON "EmployeeEngagementSurvey"("organizationId","active","opensAt","closesAt");

CREATE TABLE IF NOT EXISTS "EmployeeEngagementResponse" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "employeeId" TEXT,
  "answers" JSONB NOT NULL,
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeEngagementResponse" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeEngagementResponse" ADD COLUMN IF NOT EXISTS "surveyId" TEXT;
ALTER TABLE "EmployeeEngagementResponse" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "EmployeeEngagementResponse" ADD COLUMN IF NOT EXISTS "answers" JSONB;
ALTER TABLE "EmployeeEngagementResponse" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeEngagementResponse_unique" ON "EmployeeEngagementResponse"("organizationId","surveyId","employeeId") WHERE "employeeId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EmployeeEngagementResponse_survey_idx" ON "EmployeeEngagementResponse"("organizationId","surveyId","submittedAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeRecognition" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "recipientEmployeeId" TEXT NOT NULL,
  "senderEmployeeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'TEAM',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "EmployeeRecognition" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeRecognition" ADD COLUMN IF NOT EXISTS "recipientEmployeeId" TEXT;
ALTER TABLE "EmployeeRecognition" ADD COLUMN IF NOT EXISTS "senderEmployeeId" TEXT;
ALTER TABLE "EmployeeRecognition" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "EmployeeRecognition" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "EmployeeRecognition" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "EmployeeRecognition" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'TEAM';
ALTER TABLE "EmployeeRecognition" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeRecognition_recipient_idx" ON "EmployeeRecognition"("organizationId","recipientEmployeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeRecognition_visibility_idx" ON "EmployeeRecognition"("organizationId","visibility","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeEngagementEvent" (
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
ALTER TABLE "EmployeeEngagementEvent" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "EmployeeEngagementEvent" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "EmployeeEngagementEvent" ADD COLUMN IF NOT EXISTS "actorUserId" TEXT;
ALTER TABLE "EmployeeEngagementEvent" ADD COLUMN IF NOT EXISTS "eventType" TEXT;
ALTER TABLE "EmployeeEngagementEvent" ADD COLUMN IF NOT EXISTS "resourceType" TEXT;
ALTER TABLE "EmployeeEngagementEvent" ADD COLUMN IF NOT EXISTS "resourceId" TEXT;
ALTER TABLE "EmployeeEngagementEvent" ADD COLUMN IF NOT EXISTS "details" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "EmployeeEngagementEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS "EmployeeEngagementEvent_org_idx" ON "EmployeeEngagementEvent"("organizationId","createdAt" DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeEngagementSurvey_audience_chk') THEN
    ALTER TABLE "EmployeeEngagementSurvey" ADD CONSTRAINT "EmployeeEngagementSurvey_audience_chk" CHECK ("audience" IN ('ALL_EMPLOYEES','MANAGERS','CUSTOM'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeRecognition_category_chk') THEN
    ALTER TABLE "EmployeeRecognition" ADD CONSTRAINT "EmployeeRecognition_category_chk" CHECK ("category" IN ('TEAMWORK','LEADERSHIP','CLIENT_CARE','RELIABILITY','INNOVATION','SAFETY','OTHER'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='EmployeeRecognition_visibility_chk') THEN
    ALTER TABLE "EmployeeRecognition" ADD CONSTRAINT "EmployeeRecognition_visibility_chk" CHECK ("visibility" IN ('PRIVATE','TEAM','COMPANY'));
  END IF;
END $$;
