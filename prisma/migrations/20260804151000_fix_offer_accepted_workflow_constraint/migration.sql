-- Keep the EmployeeApplication workflow constraint aligned with the careers lifecycle.
-- This migration is idempotent so Railway can safely retry deployment.

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
      'OFFER_ACCEPTED',
      'OFFER',
      'HIRE',
      'HIRED',
      'NOT_SELECTED',
      'WITHDRAWN',
      'TERMINATED',
      'POSITION_FILLED',
      'ARCHIVED'
    )
  );
