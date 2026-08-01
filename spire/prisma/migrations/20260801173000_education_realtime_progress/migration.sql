ALTER TABLE "EducationAssignment"
ADD COLUMN IF NOT EXISTS "progressPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "currentActivity" TEXT;

ALTER TABLE "EducationAssignment"
ADD CONSTRAINT "EducationAssignment_progressPercent_check"
CHECK ("progressPercent" >= 0 AND "progressPercent" <= 100);
