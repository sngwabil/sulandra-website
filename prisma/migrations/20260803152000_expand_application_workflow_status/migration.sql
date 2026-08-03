-- Expand the EmployeeApplication workflow status constraint for the two-stage offer workflow.
-- This migration preserves every status used by the existing careers system and adds
-- OFFER_ACCEPTED and HIRED so accepted offers can be reflected in the main applicant list.

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
