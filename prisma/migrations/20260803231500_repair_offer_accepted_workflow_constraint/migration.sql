-- Repair a production schema drift where the existing workflow-status check
-- predates the offer-acceptance workflow and rejects OFFER_ACCEPTED.
ALTER TABLE "EmployeeApplication"
  DROP CONSTRAINT IF EXISTS "EmployeeApplication_workflowStatus_check";

ALTER TABLE "EmployeeApplication"
  ADD CONSTRAINT "EmployeeApplication_workflowStatus_check"
  CHECK (
    "workflowStatus" IN (
      'RECEIVED',
      'REVIEWING',
      'DOCUMENTS_NEEDED',
      'INTERVIEW',
      'OFFER_PENDING',
      'OFFER',
      'OFFER_ACCEPTED',
      'HIRE',
      'HIRED',
      'NOT_SELECTED',
      'WITHDRAWN',
      'TERMINATED',
      'POSITION_FILLED'
    )
  ) NOT VALID;

ALTER TABLE "EmployeeApplication"
  VALIDATE CONSTRAINT "EmployeeApplication_workflowStatus_check";
