CREATE TABLE IF NOT EXISTS "EmployeeWorkflowDefinition" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "requestType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "steps" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "employeeCanSubmit" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeWorkflowDefinition_request_type_check" CHECK (
    "requestType" IN ('PROFILE_CHANGE','TIME_OFF','SCHEDULE_CHANGE','DOCUMENT_CORRECTION','TRAINING_SUPPORT','HR_SUPPORT','GENERAL_REQUEST')
  ),
  CONSTRAINT "EmployeeWorkflowDefinition_steps_array_check" CHECK (jsonb_typeof("steps")='array')
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeWorkflowDefinition_type_unique"
  ON "EmployeeWorkflowDefinition"("organizationId","requestType");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowDefinition_enabled_idx"
  ON "EmployeeWorkflowDefinition"("organizationId","enabled","employeeCanSubmit");

CREATE TABLE IF NOT EXISTS "EmployeeWorkflowRequest" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "requestType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "currentSequence" INTEGER,
  "linkedResourceType" TEXT,
  "linkedResourceId" TEXT,
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolvedAt" TIMESTAMPTZ,
  "resolvedById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeWorkflowRequest_type_check" CHECK (
    "requestType" IN ('PROFILE_CHANGE','TIME_OFF','SCHEDULE_CHANGE','DOCUMENT_CORRECTION','TRAINING_SUPPORT','HR_SUPPORT','GENERAL_REQUEST')
  ),
  CONSTRAINT "EmployeeWorkflowRequest_priority_check" CHECK ("priority" IN ('LOW','NORMAL','HIGH','URGENT')),
  CONSTRAINT "EmployeeWorkflowRequest_status_check" CHECK ("status" IN ('SUBMITTED','IN_REVIEW','APPROVED','REJECTED','CANCELLED','COMPLETED')),
  CONSTRAINT "EmployeeWorkflowRequest_payload_object_check" CHECK (jsonb_typeof("payload")='object')
);

CREATE INDEX IF NOT EXISTS "EmployeeWorkflowRequest_employee_idx"
  ON "EmployeeWorkflowRequest"("organizationId","employeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowRequest_status_idx"
  ON "EmployeeWorkflowRequest"("organizationId","status","currentSequence","createdAt");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowRequest_type_idx"
  ON "EmployeeWorkflowRequest"("organizationId","requestType","status");

CREATE TABLE IF NOT EXISTS "EmployeeWorkflowApproval" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "approvalMode" TEXT NOT NULL DEFAULT 'ANY',
  "approverType" TEXT NOT NULL,
  "approverUserId" TEXT,
  "label" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "decisionNotes" TEXT NOT NULL DEFAULT '',
  "decidedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeWorkflowApproval_sequence_check" CHECK ("sequence" BETWEEN 1 AND 20),
  CONSTRAINT "EmployeeWorkflowApproval_mode_check" CHECK ("approvalMode" IN ('ANY','ALL')),
  CONSTRAINT "EmployeeWorkflowApproval_approver_check" CHECK (
    "approverType" IN ('SUPERVISOR','LOCATION_MANAGER','HR','ADMINISTRATOR','OWNER','SPECIFIC_USER')
  ),
  CONSTRAINT "EmployeeWorkflowApproval_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','SKIPPED'))
);

CREATE INDEX IF NOT EXISTS "EmployeeWorkflowApproval_actor_idx"
  ON "EmployeeWorkflowApproval"("organizationId","approverUserId","status","sequence");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowApproval_request_idx"
  ON "EmployeeWorkflowApproval"("organizationId","requestId","sequence","status");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeWorkflowApproval_request_actor_unique"
  ON "EmployeeWorkflowApproval"("organizationId","requestId","sequence","approverUserId")
  WHERE "approverUserId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "EmployeeWorkflowComment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'EMPLOYEE_VISIBLE',
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeWorkflowComment_visibility_check" CHECK ("visibility" IN ('EMPLOYEE_VISIBLE','MANAGEMENT_ONLY','HR_CONFIDENTIAL'))
);

CREATE INDEX IF NOT EXISTS "EmployeeWorkflowComment_request_idx"
  ON "EmployeeWorkflowComment"("organizationId","requestId","createdAt");

CREATE TABLE IF NOT EXISTS "EmployeeWorkflowEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeWorkflowEvent_details_object_check" CHECK (jsonb_typeof("details")='object')
);

CREATE INDEX IF NOT EXISTS "EmployeeWorkflowEvent_request_idx"
  ON "EmployeeWorkflowEvent"("organizationId","requestId","createdAt");
CREATE INDEX IF NOT EXISTS "EmployeeWorkflowEvent_actor_idx"
  ON "EmployeeWorkflowEvent"("organizationId","actorUserId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeTeamFeedback" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'EMPLOYEE_VISIBLE',
  "requiresAcknowledgment" BOOLEAN NOT NULL DEFAULT FALSE,
  "acknowledgedAt" TIMESTAMPTZ,
  "acknowledgedById" TEXT,
  "followUpDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeTeamFeedback_kind_check" CHECK (
    "kind" IN ('CHECK_IN','FEEDBACK','COACHING','GOAL','DEVELOPMENT_NOTE','PERFORMANCE_NOTE')
  ),
  CONSTRAINT "EmployeeTeamFeedback_visibility_check" CHECK ("visibility" IN ('EMPLOYEE_VISIBLE','MANAGEMENT_ONLY','HR_CONFIDENTIAL')),
  CONSTRAINT "EmployeeTeamFeedback_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS "EmployeeTeamFeedback_employee_idx"
  ON "EmployeeTeamFeedback"("organizationId","employeeId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeTeamFeedback_followup_idx"
  ON "EmployeeTeamFeedback"("organizationId","followUpDate","status");
CREATE INDEX IF NOT EXISTS "EmployeeTeamFeedback_ack_idx"
  ON "EmployeeTeamFeedback"("organizationId","employeeId","requiresAcknowledgment","acknowledgedAt")
  WHERE "status"='ACTIVE';

CREATE TABLE IF NOT EXISTS "EmployeeRecognition" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "nominatorUserId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'EMPLOYEE_ONLY',
  "points" INTEGER NOT NULL DEFAULT 0,
  "awardDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeRecognition_category_check" CHECK (
    "category" IN ('VALUES','TEAMWORK','EXCELLENCE','SAFETY','COMPASSION','LEADERSHIP','RELIABILITY','MILESTONE','OTHER')
  ),
  CONSTRAINT "EmployeeRecognition_visibility_check" CHECK (
    "visibility" IN ('EMPLOYEE_ONLY','TEAM_VISIBLE','ORGANIZATION_VISIBLE','MANAGEMENT_ONLY')
  ),
  CONSTRAINT "EmployeeRecognition_points_check" CHECK ("points" BETWEEN 0 AND 10000),
  CONSTRAINT "EmployeeRecognition_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS "EmployeeRecognition_employee_idx"
  ON "EmployeeRecognition"("organizationId","employeeId","status","awardDate" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeRecognition_visibility_idx"
  ON "EmployeeRecognition"("organizationId","visibility","status","awardDate" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeNotification" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "notificationType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "actionUrl" TEXT,
  "relatedType" TEXT,
  "relatedId" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'UNREAD',
  "emailStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
  "emailError" TEXT,
  "providerMessageId" TEXT,
  "readAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeNotification_status_check" CHECK ("status" IN ('UNREAD','READ','ARCHIVED')),
  CONSTRAINT "EmployeeNotification_email_status_check" CHECK ("emailStatus" IN ('NOT_REQUESTED','QUEUED','SENT','FAILED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeNotification_dedupe_unique"
  ON "EmployeeNotification"("organizationId","userId","dedupeKey");
CREATE INDEX IF NOT EXISTS "EmployeeNotification_user_idx"
  ON "EmployeeNotification"("organizationId","userId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeNotification_related_idx"
  ON "EmployeeNotification"("organizationId","relatedType","relatedId");
