-- S.P.I.R.E. note composition provenance
-- Additive only. Existing/legacy notes remain valid and simply report unavailable provenance.

ALTER TABLE IF EXISTS "SpireClinicalNoteVersion"
  ADD COLUMN IF NOT EXISTS "templateId" TEXT,
  ADD COLUMN IF NOT EXISTS "templateName" TEXT,
  ADD COLUMN IF NOT EXISTS "templateVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "templateSource" TEXT,
  ADD COLUMN IF NOT EXISTS "templateSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "authoredBody" TEXT,
  ADD COLUMN IF NOT EXISTS "compositionMetadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "pasteDetected" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "pasteEventCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pastedCharacterCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "copiedFromNoteId" TEXT;

ALTER TABLE IF EXISTS "SpireClinicalNoteVersion"
  DROP CONSTRAINT IF EXISTS "SpireClinicalNoteVersion_pasteEventCount_nonnegative";
ALTER TABLE IF EXISTS "SpireClinicalNoteVersion"
  ADD CONSTRAINT "SpireClinicalNoteVersion_pasteEventCount_nonnegative"
  CHECK ("pasteEventCount" >= 0);

ALTER TABLE IF EXISTS "SpireClinicalNoteVersion"
  DROP CONSTRAINT IF EXISTS "SpireClinicalNoteVersion_pastedCharacterCount_nonnegative";
ALTER TABLE IF EXISTS "SpireClinicalNoteVersion"
  ADD CONSTRAINT "SpireClinicalNoteVersion_pastedCharacterCount_nonnegative"
  CHECK ("pastedCharacterCount" >= 0);

CREATE INDEX IF NOT EXISTS "SpireClinicalNoteVersion_note_version_provenance_idx"
  ON "SpireClinicalNoteVersion"("noteId", "version" DESC);

COMMENT ON COLUMN "SpireClinicalNoteVersion"."templateSnapshot" IS
  'Immutable copy of the template text as it existed when this note version was composed.';
COMMENT ON COLUMN "SpireClinicalNoteVersion"."authoredBody" IS
  'Best-effort authored-only rendering calculated against the stored template snapshot.';
COMMENT ON COLUMN "SpireClinicalNoteVersion"."pasteDetected" IS
  'True when the SPIRE editor observed one or more paste events while composing this version.';
COMMENT ON COLUMN "SpireClinicalNoteVersion"."compositionMetadata" IS
  'Structured composition provenance such as editor version, template application, SmartText inserts, and observed paste timestamps.';
