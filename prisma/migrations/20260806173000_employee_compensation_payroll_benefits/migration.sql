CREATE TABLE IF NOT EXISTS "EmployeeCompensationHistory" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payType" TEXT NOT NULL,
  "baseRate" NUMERIC(14,4) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "annualizedAmount" NUMERIC(14,2),
  "standardHoursPerWeek" NUMERIC(6,2) NOT NULL DEFAULT 40,
  "overtimeEligible" BOOLEAN NOT NULL DEFAULT TRUE,
  "overtimeMultiplier" NUMERIC(5,2) NOT NULL DEFAULT 1.5,
  "effectiveDate" DATE NOT NULL,
  "endDate" DATE,
  "reason" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeCompensationHistory_pay_type_check" CHECK ("payType" IN ('HOURLY','SALARY','STIPEND','CONTRACT')),
  CONSTRAINT "EmployeeCompensationHistory_rate_check" CHECK ("baseRate">=0 AND ("annualizedAmount" IS NULL OR "annualizedAmount">=0)),
  CONSTRAINT "EmployeeCompensationHistory_hours_check" CHECK ("standardHoursPerWeek" BETWEEN 0 AND 168),
  CONSTRAINT "EmployeeCompensationHistory_overtime_check" CHECK ("overtimeMultiplier" BETWEEN 1 AND 5),
  CONSTRAINT "EmployeeCompensationHistory_dates_check" CHECK ("endDate" IS NULL OR "endDate">="effectiveDate")
);
CREATE INDEX IF NOT EXISTS "EmployeeCompensationHistory_employee_idx" ON "EmployeeCompensationHistory"("organizationId","employeeId","effectiveDate" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeCompensationHistory_effective_unique" ON "EmployeeCompensationHistory"("organizationId","employeeId","effectiveDate");

CREATE TABLE IF NOT EXISTS "EmployeePayrollProfile" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payrollStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "payFrequency" TEXT NOT NULL DEFAULT 'BIWEEKLY',
  "workState" TEXT NOT NULL DEFAULT 'OH',
  "taxFilingStatus" TEXT NOT NULL DEFAULT 'SINGLE',
  "additionalFederalWithholding" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "additionalStateWithholding" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "directDepositEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "bankName" TEXT NOT NULL DEFAULT '',
  "accountLast4" TEXT NOT NULL DEFAULT '',
  "routingLast4" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePayrollProfile_status_check" CHECK ("payrollStatus" IN ('ACTIVE','ON_HOLD','EXEMPT','TERMINATED')),
  CONSTRAINT "EmployeePayrollProfile_frequency_check" CHECK ("payFrequency" IN ('WEEKLY','BIWEEKLY','SEMIMONTHLY','MONTHLY')),
  CONSTRAINT "EmployeePayrollProfile_tax_status_check" CHECK ("taxFilingStatus" IN ('SINGLE','MARRIED_FILING_JOINTLY','MARRIED_FILING_SEPARATELY','HEAD_OF_HOUSEHOLD','EXEMPT')),
  CONSTRAINT "EmployeePayrollProfile_last4_check" CHECK (("accountLast4"='' OR "accountLast4"~'^[0-9]{4}$') AND ("routingLast4"='' OR "routingLast4"~'^[0-9]{4}$'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePayrollProfile_employee_unique" ON "EmployeePayrollProfile"("organizationId","employeeId");

CREATE TABLE IF NOT EXISTS "EmployeePayrollDeduction" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "calculationType" TEXT NOT NULL,
  "amount" NUMERIC(12,4) NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "endDate" DATE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePayrollDeduction_category_check" CHECK ("category" IN ('PRE_TAX','POST_TAX','GARNISHMENT','LOAN','OTHER')),
  CONSTRAINT "EmployeePayrollDeduction_calculation_check" CHECK ("calculationType" IN ('FLAT','PERCENT')),
  CONSTRAINT "EmployeePayrollDeduction_amount_check" CHECK ("amount">=0),
  CONSTRAINT "EmployeePayrollDeduction_dates_check" CHECK ("endDate" IS NULL OR "endDate">="effectiveDate")
);
CREATE INDEX IF NOT EXISTS "EmployeePayrollDeduction_employee_idx" ON "EmployeePayrollDeduction"("organizationId","employeeId","active","priority");

CREATE TABLE IF NOT EXISTS "EmployeeBenefitPlan" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "planType" TEXT NOT NULL,
  "carrier" TEXT NOT NULL DEFAULT '',
  "policyNumber" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "employeeCost" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "employerCost" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "costFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  "eligibilityWaitingDays" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeBenefitPlan_type_check" CHECK ("planType" IN ('MEDICAL','DENTAL','VISION','LIFE','DISABILITY','RETIREMENT','HSA','FSA','EAP','OTHER')),
  CONSTRAINT "EmployeeBenefitPlan_frequency_check" CHECK ("costFrequency" IN ('WEEKLY','BIWEEKLY','SEMIMONTHLY','MONTHLY','ANNUAL')),
  CONSTRAINT "EmployeeBenefitPlan_cost_check" CHECK ("employeeCost">=0 AND "employerCost">=0),
  CONSTRAINT "EmployeeBenefitPlan_waiting_check" CHECK ("eligibilityWaitingDays" BETWEEN 0 AND 3650)
);
CREATE INDEX IF NOT EXISTS "EmployeeBenefitPlan_org_idx" ON "EmployeeBenefitPlan"("organizationId","active","planType","name");

CREATE TABLE IF NOT EXISTS "EmployeeBenefitEnrollment" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "benefitPlanId" TEXT NOT NULL,
  "coverageTier" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effectiveDate" DATE NOT NULL,
  "endDate" DATE,
  "employeeContribution" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "employerContribution" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "dependentCount" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeBenefitEnrollment_tier_check" CHECK ("coverageTier" IN ('EMPLOYEE_ONLY','EMPLOYEE_SPOUSE','EMPLOYEE_CHILDREN','FAMILY','WAIVED')),
  CONSTRAINT "EmployeeBenefitEnrollment_status_check" CHECK ("status" IN ('PENDING','ACTIVE','WAIVED','TERMINATED')),
  CONSTRAINT "EmployeeBenefitEnrollment_dates_check" CHECK ("endDate" IS NULL OR "endDate">="effectiveDate"),
  CONSTRAINT "EmployeeBenefitEnrollment_cost_check" CHECK ("employeeContribution">=0 AND "employerContribution">=0),
  CONSTRAINT "EmployeeBenefitEnrollment_dependents_check" CHECK ("dependentCount" BETWEEN 0 AND 50)
);
CREATE INDEX IF NOT EXISTS "EmployeeBenefitEnrollment_employee_idx" ON "EmployeeBenefitEnrollment"("organizationId","employeeId","status","effectiveDate" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeBenefitEnrollment_active_unique" ON "EmployeeBenefitEnrollment"("organizationId","employeeId","benefitPlanId") WHERE "status" IN ('PENDING','ACTIVE');

CREATE TABLE IF NOT EXISTS "EmployeePayRun" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "payDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT NOT NULL DEFAULT '',
  "grossPayroll" NUMERIC(16,2) NOT NULL DEFAULT 0,
  "netPayroll" NUMERIC(16,2) NOT NULL DEFAULT 0,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "paidAt" TIMESTAMPTZ,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePayRun_status_check" CHECK ("status" IN ('DRAFT','PROCESSING','APPROVED','PAID','VOID')),
  CONSTRAINT "EmployeePayRun_dates_check" CHECK ("periodEnd">="periodStart")
);
CREATE INDEX IF NOT EXISTS "EmployeePayRun_org_idx" ON "EmployeePayRun"("organizationId","payDate" DESC,"status");

CREATE TABLE IF NOT EXISTS "EmployeePayrollItem" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "payRunId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "regularHours" NUMERIC(8,2) NOT NULL DEFAULT 0,
  "overtimeHours" NUMERIC(8,2) NOT NULL DEFAULT 0,
  "holidayHours" NUMERIC(8,2) NOT NULL DEFAULT 0,
  "ptoHours" NUMERIC(8,2) NOT NULL DEFAULT 0,
  "regularEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "overtimeEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "holidayEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "ptoEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "otherEarnings" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "bonus" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "reimbursement" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "grossPay" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "taxes" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "deductions" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "netPay" NUMERIC(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeePayrollItem_nonnegative_check" CHECK ("regularHours">=0 AND "overtimeHours">=0 AND "holidayHours">=0 AND "ptoHours">=0 AND "regularEarnings">=0 AND "overtimeEarnings">=0 AND "holidayEarnings">=0 AND "ptoEarnings">=0 AND "otherEarnings">=0 AND "bonus">=0 AND "reimbursement">=0 AND "grossPay">=0 AND "taxes">=0 AND "deductions">=0 AND "netPay">=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePayrollItem_run_employee_unique" ON "EmployeePayrollItem"("organizationId","payRunId","employeeId");
CREATE INDEX IF NOT EXISTS "EmployeePayrollItem_employee_idx" ON "EmployeePayrollItem"("organizationId","employeeId","createdAt" DESC);

CREATE TABLE IF NOT EXISTS "EmployeeCompensationEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "employeeId" TEXT,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EmployeeCompensationEvent_details_object_check" CHECK (jsonb_typeof("details")='object')
);
CREATE INDEX IF NOT EXISTS "EmployeeCompensationEvent_org_idx" ON "EmployeeCompensationEvent"("organizationId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "EmployeeCompensationEvent_employee_idx" ON "EmployeeCompensationEvent"("organizationId","employeeId","createdAt" DESC);
