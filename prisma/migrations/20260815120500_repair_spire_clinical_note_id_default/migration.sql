-- Repair the remaining legacy SpireClinicalNote shape mismatch.
--
-- The original 20260730203000_spire_clinical_services migration created
-- SpireClinicalNote.id as TEXT PRIMARY KEY with no DEFAULT. The newer
-- patient/versioned Note Composer intentionally reuses the same table name and
-- inserts canonical notes without supplying an id because its modern table
-- definition uses DEFAULT gen_random_uuid()::text. CREATE TABLE IF NOT EXISTS
-- could not retrofit that default onto the already-existing legacy table.
--
-- Preserve every existing note id. Only restore the missing default for future
-- inserts so Save Draft and Sign & File can create canonical notes safely.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'SpireClinicalNote'
       AND column_name = 'id'
  ) THEN
    ALTER TABLE "SpireClinicalNote"
      ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
  END IF;
END $$;

COMMENT ON COLUMN "SpireClinicalNote"."id" IS
  'Stable SPIRE clinical-note identifier. Existing ids are preserved; new notes default to a generated UUID.';
