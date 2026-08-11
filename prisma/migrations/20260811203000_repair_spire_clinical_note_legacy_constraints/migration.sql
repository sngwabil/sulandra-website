-- Production compatibility repair for the legacy SpireClinicalNote shape.
--
-- 20260730203000_spire_clinical_services created SpireClinicalNote with the
-- legacy clientId/body/signedByUserId columns as NOT NULL and signedAt as
-- NOT NULL DEFAULT now(). The later SPIRE clinical foundation intentionally
-- reused the table name with the modern patientId/versioned-note model, but
-- CREATE TABLE IF NOT EXISTS preserves the earlier table and its constraints.
--
-- Modern notes link to SpirePatient through patientId, keep note content in
-- SpireClinicalNoteVersion, and may remain DRAFT/unsigned. Preserve all legacy
-- columns and rows, but remove only the obsolete constraints/default that block
-- the canonical model.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='SpireClinicalNote'
      AND column_name='clientId'
  ) THEN
    ALTER TABLE "SpireClinicalNote" ALTER COLUMN "clientId" DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='SpireClinicalNote'
      AND column_name='body'
  ) THEN
    ALTER TABLE "SpireClinicalNote" ALTER COLUMN "body" DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='SpireClinicalNote'
      AND column_name='signedByUserId'
  ) THEN
    ALTER TABLE "SpireClinicalNote" ALTER COLUMN "signedByUserId" DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='SpireClinicalNote'
      AND column_name='signedAt'
  ) THEN
    ALTER TABLE "SpireClinicalNote" ALTER COLUMN "signedAt" DROP NOT NULL;
    ALTER TABLE "SpireClinicalNote" ALTER COLUMN "signedAt" DROP DEFAULT;
  END IF;
END $$;

COMMENT ON COLUMN "SpireClinicalNote"."signedAt" IS
  'Canonical SPIRE note signature time. NULL while a note is DRAFT or otherwise unsigned.';
