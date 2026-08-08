-- Repair the Careers archive/Achieved flow without changing unrelated portal behavior.
-- POSITION_FILLED applications are retained in the applicant archive and must
-- carry archivedAt so the existing archived=true API query can return them.

UPDATE "EmployeeApplication"
SET "archivedAt" = COALESCE("archivedAt", "updatedAt", "submittedAt", "createdAt", NOW()),
    "archiveReason" = COALESCE("archiveReason", 'POSITION_FILLED')
WHERE "workflowStatus" = 'POSITION_FILLED'
  AND "archivedAt" IS NULL;

CREATE OR REPLACE FUNCTION "syncEmployeeApplicationArchiveState"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."workflowStatus" = 'POSITION_FILLED' AND NEW."archivedAt" IS NULL THEN
    NEW."archivedAt" := NOW();
    NEW."archiveReason" := COALESCE(NEW."archiveReason", 'POSITION_FILLED');
  ELSIF TG_OP = 'UPDATE'
    AND OLD."workflowStatus" = 'POSITION_FILLED'
    AND NEW."workflowStatus" <> 'POSITION_FILLED' THEN
    NEW."archivedAt" := NULL;
    NEW."archivedById" := NULL;
    NEW."archiveReason" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "EmployeeApplication_sync_archive_state" ON "EmployeeApplication";
CREATE TRIGGER "EmployeeApplication_sync_archive_state"
BEFORE INSERT OR UPDATE OF "workflowStatus", "archivedAt"
ON "EmployeeApplication"
FOR EACH ROW
EXECUTE FUNCTION "syncEmployeeApplicationArchiveState"();
