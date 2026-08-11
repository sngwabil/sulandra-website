-- Additive compatibility repair for Employee 360 tables that may already exist
-- from an earlier runtime-created schema. CREATE TABLE IF NOT EXISTS does not add
-- columns to existing tables, so dashboard queries that order by createdAt must
-- have these columns present before the backend starts serving traffic.

ALTER TABLE IF EXISTS "EmployeeWorkAssignment"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE IF EXISTS "EmployeeWorkAssignment"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS "EmployeeTimeCorrection"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS "EmployeeUnifiedCommunication"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS "EmployeeAccountSecurityEvent"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS "EmployeeAccountProfileChange"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS "EmployeeAuditLedger"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
