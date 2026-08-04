-- Add COO as a first-class executive role and update the application-role
-- constraint retained by older production databases.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COO';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DRIVER';

ALTER TABLE "EmployeeApplication"
  DROP CONSTRAINT IF EXISTS "EmployeeApplication_role_check";

ALTER TABLE "EmployeeApplication"
  ADD CONSTRAINT "EmployeeApplication_role_check"
  CHECK (
    "appliedRole"::text IN (
      'DSP',
      'LPN',
      'RN',
      'DELEGATING_NURSE',
      'DRIVER',
      'GENERAL',
      'COO'
    )
  ) NOT VALID;

ALTER TABLE "EmployeeApplication"
  VALIDATE CONSTRAINT "EmployeeApplication_role_check";
