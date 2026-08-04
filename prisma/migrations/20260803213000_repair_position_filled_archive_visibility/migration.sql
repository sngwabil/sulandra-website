-- The current admin portal separates active and archived applicants by workflowStatus.
-- Keep POSITION_FILLED applications visible to that archive view while preserving audit metadata.
UPDATE "EmployeeApplication"
   SET "archivedAt" = NULL,
       "updatedAt" = NOW()
 WHERE "workflowStatus" = 'POSITION_FILLED'
   AND "archivedAt" IS NOT NULL;
