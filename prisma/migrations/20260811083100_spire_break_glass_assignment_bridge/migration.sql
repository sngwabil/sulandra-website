ALTER TABLE "SpireBreakGlassAccess" ADD COLUMN IF NOT EXISTS "temporaryAssignmentId" text;
CREATE INDEX IF NOT EXISTS "SpireBreakGlassAccess_assignment_idx" ON "SpireBreakGlassAccess"("organizationId","legalEntityId","userId","temporaryAssignmentId") WHERE "temporaryAssignmentId" IS NOT NULL;
