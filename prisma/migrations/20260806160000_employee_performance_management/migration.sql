CREATE TABLE IF NOT EXISTS "EmployeePerformanceTemplate" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "competencies" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "ratingScale" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "goalWeight" NUMERIC(5,2) NOT NULL DEFAULT 50,
  "competencyWeight" NUMERIC(5,2) NOT NULL DEFAULT 50,
  "employeeSelfAssessment" BOOLEAN NOT NULL DEFAULT TRUE,
  "employeeAcknowledgment" BOOLEAN NOT NULL DEFAULT TRUE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePerformanceTemplate_competencies_array_check" CHECK (jsonb_typeof("competencies")='array'),
  CONSTRAINT "EmployeePerformanceTemplate_rating_scale_array_check" CHECK (jsonb_typeof("ratingScale")='array'),
  CONSTRAINT "EmployeePerformanceTemplate_weights_check" CHECK ("goalWeight">=0 AND "competencyWeight">=0 AND ROUND("goalWeight"+"competencyWeight",2)=100)
);

CREATE INDEX IF NOT EXISTS "EmployeePerformanceTemplate_org_idx"
  ON "EmployeePerformanceTemplate"("organizationId","active","name");

CREATE TABLE IF NOT EXISTS "EmployeePerformanceCycle" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "selfAssessmentDueAt" TIMESTAMPTZ,
  "managerAssessmentDueAt" TIMESTAMPTZ,
  "acknowledgmentDueAt" TIMESTAMPTZ,
  "applicability" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "launchedAt" TIMESTAMPTZ,
  "closedAt" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePerformanceCycle_dates_check" CHECK ("periodEnd">"periodStart"),
  CONSTRAINT "EmployeePerformanceCycle_status_check" CHECK ("status" IN ('DRAFT','OPEN','CLOSED','ARCHIVED')),
  CONSTRAINT "EmployeePerformanceCycle_applicability_object_check" CHECK (jsonb_typeof("applicability")='object')
);

CREATE INDEX IF NOT EXISTS "EmployeePerformanceCycle_org_idx"
  ON "EmployeePerformanceCycle"("organizationId","status","periodEnd");
CREATE INDEX IF NOT EXISTS "EmployeePerformanceCycle_template_idx"
  ON "EmployeePerformanceCycle"("organizationId","templateId","status");

CREATE TABLE IF NOT EXISTS "EmployeePerformanceReview" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "managerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'EMPLOYEE_INPUT',
  "selfAssessmentDueAt" TIMESTAMPTZ,
  "managerAssessmentDueAt" TIMESTAMPTZ,
  "acknowledgmentDueAt" TIMESTAMPTZ,
  "employeeSubmittedAt" TIMESTAMPTZ,
  "managerSubmittedAt" TIMESTAMPTZ,
  "calibratedAt" TIMESTAMPTZ,
  "calibratedById" TEXT,
  "finalizedAt" TIMESTAMPTZ,
  "finalizedById" TEXT,
  "acknowledgedAt" TIMESTAMPTZ,
  "acknowledgmentComments" TEXT NOT NULL DEFAULT '',
  "finalScore" NUMERIC(6,2),
  "finalRating" NUMERIC(4,2),
  "calibrationRating" NUMERIC(4,2),
  "summary" TEXT NOT NULL DEFAULT '',
  "strengths" TEXT NOT NULL DEFAULT '',
  "improvementAreas" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePerformanceReview_status_check" CHECK ("status" IN ('DRAFT','EMPLOYEE_INPUT','MANAGER_REVIEW','CALIBRATION','ACKNOWLEDGMENT','COMPLETED','CANCELLED')),
  CONSTRAINT "EmployeePerformanceReview_score_check" CHECK (("finalRating" IS NULL OR "finalRating" BETWEEN 1 AND 10) AND ("calibrationRating" IS NULL OR "calibrationRating" BETWEEN 1 AND 10))
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePerformanceReview_cycle_employee_unique"
  ON "EmployeePerformanceReview"("organizationId","cycleId","employeeId");
CREATE INDEX IF NOT EXISTS "EmployeePerformanceReview_employee_idx"
  ON "EmployeePerformanceReview"("organizationId","employeeId","status","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeePerformanceReview_manager_idx"
  ON "EmployeePerformanceReview"("organizationId","managerId","status","managerAssessmentDueAt");
CREATE INDEX IF NOT EXISTS "EmployeePerformanceReview_due_idx"
  ON "EmployeePerformanceReview"("organizationId","status","selfAssessmentDueAt","managerAssessmentDueAt","acknowledgmentDueAt");

CREATE TABLE IF NOT EXISTS "EmployeePerformanceAssessment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "assessorUserId" TEXT NOT NULL,
  "assessorType" TEXT NOT NULL,
  "responses" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "competencyScore" NUMERIC(6,2),
  "goalScore" NUMERIC(6,2),
  "overallRating" NUMERIC(4,2),
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePerformanceAssessment_type_check" CHECK ("assessorType" IN ('EMPLOYEE','MANAGER','CALIBRATOR')),
  CONSTRAINT "EmployeePerformanceAssessment_responses_object_check" CHECK (jsonb_typeof("responses")='object'),
  CONSTRAINT "EmployeePerformanceAssessment_rating_check" CHECK ("overallRating" IS NULL OR "overallRating" BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePerformanceAssessment_review_type_unique"
  ON "EmployeePerformanceAssessment"("organizationId","reviewId","assessorType");
CREATE INDEX IF NOT EXISTS "EmployeePerformanceAssessment_assessor_idx"
  ON "EmployeePerformanceAssessment"("organizationId","assessorUserId","submittedAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeePerformanceGoal" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "cycleId" TEXT,
  "reviewId" TEXT,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'PERFORMANCE',
  "metricType" TEXT NOT NULL DEFAULT 'PERCENT',
  "targetValue" NUMERIC,
  "currentValue" NUMERIC,
  "progressPercent" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL DEFAULT '',
  "startDate" DATE,
  "dueDate" DATE,
  "weight" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "employeeCanUpdate" BOOLEAN NOT NULL DEFAULT TRUE,
  "visibility" TEXT NOT NULL DEFAULT 'EMPLOYEE_VISIBLE',
  "approvedById" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePerformanceGoal_category_check" CHECK ("category" IN ('PERFORMANCE','DEVELOPMENT','COMPLIANCE','EDUCATION','LEADERSHIP','QUALITY','SAFETY','ATTENDANCE','OTHER')),
  CONSTRAINT "EmployeePerformanceGoal_metric_check" CHECK ("metricType" IN ('PERCENT','NUMBER','CURRENCY','MILESTONE','BOOLEAN')),
  CONSTRAINT "EmployeePerformanceGoal_status_check" CHECK ("status" IN ('DRAFT','PENDING_APPROVAL','ACTIVE','AT_RISK','COMPLETED','CANCELLED')),
  CONSTRAINT "EmployeePerformanceGoal_visibility_check" CHECK ("visibility" IN ('EMPLOYEE_VISIBLE','MANAGEMENT_ONLY','HR_CONFIDENTIAL')),
  CONSTRAINT "EmployeePerformanceGoal_progress_check" CHECK ("progressPercent" BETWEEN 0 AND 100),
  CONSTRAINT "EmployeePerformanceGoal_weight_check" CHECK ("weight" BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS "EmployeePerformanceGoal_employee_idx"
  ON "EmployeePerformanceGoal"("organizationId","employeeId","status","dueDate");
CREATE INDEX IF NOT EXISTS "EmployeePerformanceGoal_cycle_idx"
  ON "EmployeePerformanceGoal"("organizationId","cycleId","status");
CREATE INDEX IF NOT EXISTS "EmployeePerformanceGoal_approval_idx"
  ON "EmployeePerformanceGoal"("organizationId","status","createdAt") WHERE "status"='PENDING_APPROVAL';

CREATE TABLE IF NOT EXISTS "EmployeePerformanceGoalUpdate" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "previousProgress" NUMERIC(5,2),
  "newProgress" NUMERIC(5,2),
  "previousValue" NUMERIC,
  "newValue" NUMERIC,
  "status" TEXT,
  "updateNote" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "EmployeePerformanceGoalUpdate_goal_idx"
  ON "EmployeePerformanceGoalUpdate"("organizationId","goalId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeDevelopmentPlan" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "reviewId" TEXT,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "actions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "startDate" DATE,
  "targetDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "employeeVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  "acknowledgmentRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "acknowledgedAt" TIMESTAMPTZ,
  "acknowledgmentComments" TEXT NOT NULL DEFAULT '',
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeDevelopmentPlan_actions_array_check" CHECK (jsonb_typeof("actions")='array'),
  CONSTRAINT "EmployeeDevelopmentPlan_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','COMPLETED','CANCELLED'))
);

CREATE INDEX IF NOT EXISTS "EmployeeDevelopmentPlan_employee_idx"
  ON "EmployeeDevelopmentPlan"("organizationId","employeeId","status","targetDate");
CREATE INDEX IF NOT EXISTS "EmployeeDevelopmentPlan_ack_idx"
  ON "EmployeeDevelopmentPlan"("organizationId","employeeId","acknowledgmentRequired","acknowledgedAt") WHERE "employeeVisible"=TRUE;

CREATE TABLE IF NOT EXISTS "EmployeePerformanceActionPlan" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "reviewId" TEXT,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expectations" TEXT NOT NULL,
  "supportProvided" TEXT NOT NULL DEFAULT '',
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'PERFORMANCE_IMPROVEMENT_PLAN',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "employeeVisible" BOOLEAN NOT NULL DEFAULT TRUE,
  "acknowledgmentRequired" BOOLEAN NOT NULL DEFAULT TRUE,
  "confidentiality" TEXT NOT NULL DEFAULT 'EMPLOYEE_VISIBLE',
  "acknowledgedAt" TIMESTAMPTZ,
  "acknowledgmentComments" TEXT NOT NULL DEFAULT '',
  "resolutionNotes" TEXT NOT NULL DEFAULT '',
  "resolvedAt" TIMESTAMPTZ,
  "resolvedById" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePerformanceActionPlan_dates_check" CHECK ("endDate">"startDate"),
  CONSTRAINT "EmployeePerformanceActionPlan_severity_check" CHECK ("severity" IN ('COACHING','FORMAL_WARNING','PERFORMANCE_IMPROVEMENT_PLAN','FINAL_WARNING')),
  CONSTRAINT "EmployeePerformanceActionPlan_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','SUCCESSFULLY_COMPLETED','EXTENDED','UNSUCCESSFUL','CANCELLED')),
  CONSTRAINT "EmployeePerformanceActionPlan_confidentiality_check" CHECK ("confidentiality" IN ('MANAGEMENT_ONLY','HR_CONFIDENTIAL','EMPLOYEE_VISIBLE'))
);

CREATE INDEX IF NOT EXISTS "EmployeePerformanceActionPlan_employee_idx"
  ON "EmployeePerformanceActionPlan"("organizationId","employeeId","status","endDate");
CREATE INDEX IF NOT EXISTS "EmployeePerformanceActionPlan_active_idx"
  ON "EmployeePerformanceActionPlan"("organizationId","status","endDate") WHERE "status" IN ('ACTIVE','EXTENDED');

CREATE TABLE IF NOT EXISTS "EmployeePerformanceCheckpoint" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "actionPlanId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "scheduledDate" DATE NOT NULL,
  "completedDate" DATE,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "employeeProgress" TEXT NOT NULL DEFAULT '',
  "managerAssessment" TEXT NOT NULL DEFAULT '',
  "outcome" TEXT NOT NULL DEFAULT 'PENDING',
  "nextSteps" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePerformanceCheckpoint_status_check" CHECK ("status" IN ('SCHEDULED','COMPLETED','MISSED','RESCHEDULED')),
  CONSTRAINT "EmployeePerformanceCheckpoint_outcome_check" CHECK ("outcome" IN ('ON_TRACK','NEEDS_IMPROVEMENT','MET','NOT_MET','PENDING'))
);

CREATE INDEX IF NOT EXISTS "EmployeePerformanceCheckpoint_plan_idx"
  ON "EmployeePerformanceCheckpoint"("organizationId","actionPlanId","scheduledDate");
CREATE INDEX IF NOT EXISTS "EmployeePerformanceCheckpoint_due_idx"
  ON "EmployeePerformanceCheckpoint"("organizationId","status","scheduledDate");

CREATE TABLE IF NOT EXISTS "EmployeePerformanceEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePerformanceEvent_details_object_check" CHECK (jsonb_typeof("details")='object')
);

CREATE INDEX IF NOT EXISTS "EmployeePerformanceEvent_employee_idx"
  ON "EmployeePerformanceEvent"("organizationId","employeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeePerformanceEvent_resource_idx"
  ON "EmployeePerformanceEvent"("organizationId","resourceType","resourceId","createdAt");
