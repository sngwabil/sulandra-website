-- Complete the COO -> DOO role rename for the application table.
-- The PostgreSQL enum was already renamed, but this independently-created
-- check constraint still contained the old literal COO.

ALTER TABLE "EmployeeApplication"
  DROP CONSTRAINT IF EXISTS "EmployeeApplication_role_check";

ALTER TABLE "EmployeeApplication"
  ADD CONSTRAINT "EmployeeApplication_role_check"
  CHECK (
    "role" IS NULL OR "role"::text IN (
      'ADMINISTRATOR',
      'PROGRAM_MANAGER',
      'AUDITOR',
      'DSP',
      'DELEGATING_NURSE',
      'LPN',
      'RN',
      'HOUSE_MANAGER',
      'HR_MANAGER',
      'SCHEDULER',
      'BILLING_SPECIALIST',
      'ADMINISTRATIVE_ASSISTANT',
      'CEO',
      'DOO',
      'DRIVER',
      'GENERAL'
    )
  );
