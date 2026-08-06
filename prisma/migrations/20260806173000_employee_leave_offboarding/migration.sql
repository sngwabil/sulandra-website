CREATE TABLE IF NOT EXISTS "EmployeeLeavePolicy" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "leaveType" TEXT NOT NULL,
  "accrualMethod" TEXT NOT NULL,
  "accrualRate" NUMERIC(10,4) NOT NULL DEFAULT 0,
  "annualGrant" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "maxBalance" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "carryoverLimit" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "waitingDays" INTEGER NOT NULL DEFAULT 0,
  "minimumIncrement" NUMERIC(6,2) NOT NULL DEFAULT 1,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT TRUE,
  "requiresDocumentation" BOOLEAN NOT NULL DEFAULT FALSE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "description" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeLeavePolicy_type_check" CHECK ("leaveType" IN ('PTO','VACATION','SICK','UNPAID','BEREAVEMENT','JURY_DUTY','MILITARY','PARENTAL','FMLA','MEDICAL','OTHER')),
  CONSTRAINT "EmployeeLeavePolicy_accrual_check" CHECK ("accrualMethod" IN ('NONE','PER_PAY_PERIOD','MONTHLY','ANNUAL','HOURS_WORKED')),
  CONSTRAINT "EmployeeLeavePolicy_numbers_check" CHECK ("accrualRate">=0 AND "annualGrant">=0 AND "maxBalance">=0 AND "carryoverLimit">=0 AND "waitingDays">=0 AND "minimumIncrement">0)
);
CREATE INDEX IF NOT EXISTS "EmployeeLeavePolicy_org_idx" ON "EmployeeLeavePolicy"("organizationId","active","leaveType","name");

CREATE TABLE IF NOT EXISTS "EmployeeLeaveBalance" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "leavePolicyId" TEXT NOT NULL,
  "balanceHours" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "pendingHours" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "usedHours" NUMERIC(10,2) NOT NULL DEFAULT 0,
  "effectiveDate" DATE NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeLeaveBalance_pending_used_check" CHECK ("pendingHours">=0 AND "usedHours">=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeLeaveBalance_employee_policy_unique" ON "EmployeeLeaveBalance"("organizationId","employeeId","leavePolicyId");
CREATE INDEX IF NOT EXISTS "EmployeeLeaveBalance_employee_idx" ON "EmployeeLeaveBalance"("organizationId","employeeId","effectiveDate" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeLeaveRequest" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "leavePolicyId" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "hoursRequested" NUMERIC(10,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "documentationProvided" BOOLEAN NOT NULL DEFAULT FALSE,
  "emergency" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "decidedById" TEXT,
  "decidedAt" TIMESTAMPTZ,
  "decisionNotes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeLeaveRequest_dates_check" CHECK ("endDate">="startDate"),
  CONSTRAINT "EmployeeLeaveRequest_hours_check" CHECK ("hoursRequested">0),
  CONSTRAINT "EmployeeLeaveRequest_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeLeaveRequest_employee_idx" ON "EmployeeLeaveRequest"("organizationId","employeeId","status","startDate");
CREATE INDEX IF NOT EXISTS "EmployeeLeaveRequest_pending_idx" ON "EmployeeLeaveRequest"("organizationId","status","submittedAt") WHERE "status"='PENDING';

CREATE TABLE IF NOT EXISTS "EmployeeAccommodation" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "accommodationType" TEXT NOT NULL,
  "requestDate" DATE NOT NULL,
  "effectiveDate" DATE,
  "reviewDate" DATE,
  "status" TEXT NOT NULL,
  "restrictions" TEXT NOT NULL DEFAULT '',
  "accommodationDetails" TEXT NOT NULL DEFAULT '',
  "confidentialNotes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeAccommodation_type_check" CHECK ("accommodationType" IN ('SCHEDULE','DUTY_MODIFICATION','EQUIPMENT','REMOTE_WORK','TRANSFER','LEAVE','OTHER')),
  CONSTRAINT "EmployeeAccommodation_status_check" CHECK ("status" IN ('REQUESTED','UNDER_REVIEW','APPROVED','DENIED','IMPLEMENTED','CLOSED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeAccommodation_employee_idx" ON "EmployeeAccommodation"("organizationId","employeeId","status","reviewDate");
CREATE INDEX IF NOT EXISTS "EmployeeAccommodation_review_idx" ON "EmployeeAccommodation"("organizationId","status","reviewDate");

CREATE TABLE IF NOT EXISTS "EmployeeOffboardingCase" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "separationType" TEXT NOT NULL,
  "noticeDate" DATE,
  "lastWorkingDate" DATE NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "eligibleForRehire" BOOLEAN NOT NULL DEFAULT TRUE,
  "rehireNotes" TEXT NOT NULL DEFAULT '',
  "finalPayRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "benefitsEndDate" DATE,
  "accessEndAt" TIMESTAMPTZ,
  "exitInterviewRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "createdById" TEXT NOT NULL,
  "completedById" TEXT,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeOffboardingCase_type_check" CHECK ("separationType" IN ('RESIGNATION','TERMINATION','LAYOFF','RETIREMENT','END_OF_CONTRACT','JOB_ABANDONMENT','DEATH')),
  CONSTRAINT "EmployeeOffboardingCase_status_check" CHECK ("status" IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeOffboardingCase_active_employee_unique" ON "EmployeeOffboardingCase"("organizationId","employeeId") WHERE "status" IN ('PLANNED','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS "EmployeeOffboardingCase_org_idx" ON "EmployeeOffboardingCase"("organizationId","status","effectiveDate");

CREATE TABLE IF NOT EXISTS "EmployeeOffboardingTask" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "offboardingCaseId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "assignedToUserId" TEXT,
  "dueDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "required" BOOLEAN NOT NULL DEFAULT TRUE,
  "completedAt" TIMESTAMPTZ,
  "completedById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeOffboardingTask_category_check" CHECK ("category" IN ('HR','PAYROLL','BENEFITS','IT','SECURITY','EQUIPMENT','TRAINING','MANAGER','FACILITIES','OTHER')),
  CONSTRAINT "EmployeeOffboardingTask_status_check" CHECK ("status" IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','BLOCKED','WAIVED'))
);
CREATE INDEX IF NOT EXISTS "EmployeeOffboardingTask_case_idx" ON "EmployeeOffboardingTask"("organizationId","offboardingCaseId","status","dueDate");
CREATE INDEX IF NOT EXISTS "EmployeeOffboardingTask_due_idx" ON "EmployeeOffboardingTask"("organizationId","status","dueDate");

CREATE TABLE IF NOT EXISTS "EmployeeExitInterview" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "offboardingCaseId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "conductedAt" TIMESTAMPTZ NOT NULL,
  "conductedByUserId" TEXT,
  "reasonForLeaving" TEXT NOT NULL DEFAULT '',
  "whatWorkedWell" TEXT NOT NULL DEFAULT '',
  "whatCouldImprove" TEXT NOT NULL DEFAULT '',
  "managerFeedback" TEXT NOT NULL DEFAULT '',
  "wouldRecommend" BOOLEAN,
  "wouldReturn" BOOLEAN,
  "confidentialNotes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeExitInterview_case_unique" ON "EmployeeExitInterview"("organizationId","offboardingCaseId");
CREATE INDEX IF NOT EXISTS "EmployeeExitInterview_employee_idx" ON "EmployeeExitInterview"("organizationId","employeeId","conductedAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeLeaveOffboardingEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeLeaveOffboardingEvent_details_object_check" CHECK (jsonb_typeof("details")='object')
);
CREATE INDEX IF NOT EXISTS "EmployeeLeaveOffboardingEvent_org_idx" ON "EmployeeLeaveOffboardingEvent"("organizationId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeLeaveOffboardingEvent_employee_idx" ON "EmployeeLeaveOffboardingEvent"("organizationId","employeeId","createdAt" DESC);
