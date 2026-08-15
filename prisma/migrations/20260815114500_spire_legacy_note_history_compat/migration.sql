-- S.P.I.R.E. legacy note history compatibility
--
-- Earlier SPIRE Notes wrote directly to SpireClinicalNote using clientId/body/
-- signedByUserId. The modern provenance-aware composer uses patientId plus
-- SpireClinicalNoteVersion. Preserve the original rows and signatures while
-- making both generations visible through the canonical note history.

-- Map legacy client ids to the canonical SPIRE patient id.
UPDATE "SpireClinicalNote" n
SET "patientId" = p."id"
FROM "SpirePatient" p
WHERE n."organizationId" = p."organizationId"
  AND n."patientId" IS NULL
  AND n."clientId" IS NOT NULL
  AND (
    n."clientId" = p."id"
    OR n."clientId" = p."legacyClientId"
  );

-- Recover entity scope when the patient currently has an enrollment. Legacy
-- organization-level notes remain untouched if there is no defensible mapping.
UPDATE "SpireClinicalNote" n
SET "legalEntityId" = (
  SELECT e."legalEntityId"
  FROM "ClientEnrollment" e
  WHERE e."organizationId" = n."organizationId"
    AND e."clientId" = COALESCE(n."patientId", n."clientId")
    AND e."status" IN ('ACTIVE','PENDING','PAUSED')
  ORDER BY CASE e."status" WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,
           e."legalEntityId"
  LIMIT 1
)
WHERE n."legalEntityId" IS NULL
  AND COALESCE(n."patientId", n."clientId") IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "ClientEnrollment" e
    WHERE e."organizationId" = n."organizationId"
      AND e."clientId" = COALESCE(n."patientId", n."clientId")
      AND e."status" IN ('ACTIVE','PENDING','PAUSED')
  );

-- The legacy route already created a true signature (signedAt +
-- signedByUserId). Do not let the later DRAFT default misclassify those rows.
UPDATE "SpireClinicalNote"
SET "status" = 'SIGNED',
    "signedById" = COALESCE("signedById", "signedByUserId"),
    "authorUserId" = COALESCE("authorUserId", "signedByUserId", "signedById"),
    "updatedAt" = GREATEST(COALESCE("updatedAt", "createdAt", NOW()), COALESCE("signedAt", "createdAt", NOW()))
WHERE "signedAt" IS NOT NULL
   OR "signedByUserId" IS NOT NULL
   OR "signedById" IS NOT NULL;

-- A legacy note kept its body on SpireClinicalNote. Seed immutable version 1 so
-- Note Composer V2 can display that filed text without copying/deleting the
-- source legacy body. Only create a version where entity scope can be resolved.
INSERT INTO "SpireClinicalNoteVersion"(
  "organizationId","legalEntityId","noteId","version","body","changeReason","createdById","createdAt"
)
SELECT n."organizationId",
       n."legalEntityId",
       n."id",
       1,
       n."body",
       'Legacy SPIRE note body preserved during canonical history compatibility backfill',
       COALESCE(n."authorUserId", n."signedByUserId", n."signedById", 'legacy-system'),
       COALESCE(n."createdAt", NOW())
FROM "SpireClinicalNote" n
WHERE n."body" IS NOT NULL
  AND btrim(n."body") <> ''
  AND n."patientId" IS NOT NULL
  AND n."legalEntityId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SpireClinicalNoteVersion" v
    WHERE v."organizationId" = n."organizationId"
      AND v."noteId" = n."id"
  )
ON CONFLICT ("noteId","version") DO NOTHING;

-- Keep future writes from the legacy /api/spire/notes route synchronized at the
-- database boundary. This is intentionally additive: the old columns remain.
CREATE OR REPLACE FUNCTION "sync_spire_legacy_clinical_note"()
RETURNS trigger AS $$
BEGIN
  IF NEW."patientId" IS NULL AND NEW."clientId" IS NOT NULL THEN
    SELECT p."id"
      INTO NEW."patientId"
      FROM "SpirePatient" p
     WHERE p."organizationId" = NEW."organizationId"
       AND (
         p."id" = NEW."clientId"
         OR p."legacyClientId" = NEW."clientId"
       )
     ORDER BY CASE WHEN p."id" = NEW."clientId" THEN 0 ELSE 1 END
     LIMIT 1;
  END IF;

  IF NEW."legalEntityId" IS NULL AND NEW."patientId" IS NOT NULL THEN
    SELECT e."legalEntityId"
      INTO NEW."legalEntityId"
      FROM "ClientEnrollment" e
     WHERE e."organizationId" = NEW."organizationId"
       AND e."clientId" = NEW."patientId"
       AND e."status" IN ('ACTIVE','PENDING','PAUSED')
     ORDER BY CASE e."status" WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,
              e."legalEntityId"
     LIMIT 1;
  END IF;

  IF NEW."signedAt" IS NOT NULL OR NEW."signedByUserId" IS NOT NULL OR NEW."signedById" IS NOT NULL THEN
    NEW."status" := 'SIGNED';
    NEW."signedById" := COALESCE(NEW."signedById", NEW."signedByUserId");
    NEW."authorUserId" := COALESCE(NEW."authorUserId", NEW."signedByUserId", NEW."signedById");
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireClinicalNote_sync_legacy_shape" ON "SpireClinicalNote";
CREATE TRIGGER "SpireClinicalNote_sync_legacy_shape"
BEFORE INSERT OR UPDATE OF
  "organizationId","clientId","patientId","legalEntityId","signedAt","signedByUserId","signedById"
ON "SpireClinicalNote"
FOR EACH ROW EXECUTE FUNCTION "sync_spire_legacy_clinical_note"();

-- Mirror a newly-written legacy body into version 1 after the note row has been
-- normalized. Modern composer writes already have a version and are skipped.
CREATE OR REPLACE FUNCTION "seed_spire_legacy_note_version"()
RETURNS trigger AS $$
BEGIN
  IF NEW."body" IS NOT NULL
     AND btrim(NEW."body") <> ''
     AND NEW."patientId" IS NOT NULL
     AND NEW."legalEntityId" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM "SpireClinicalNoteVersion" v
       WHERE v."organizationId" = NEW."organizationId"
         AND v."noteId" = NEW."id"
     ) THEN
    INSERT INTO "SpireClinicalNoteVersion"(
      "organizationId","legalEntityId","noteId","version","body","changeReason","createdById","createdAt"
    ) VALUES (
      NEW."organizationId",
      NEW."legalEntityId",
      NEW."id",
      1,
      NEW."body",
      'Legacy SPIRE note body synchronized into canonical version history',
      COALESCE(NEW."authorUserId", NEW."signedByUserId", NEW."signedById", 'legacy-system'),
      COALESCE(NEW."createdAt", NOW())
    )
    ON CONFLICT ("noteId","version") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireClinicalNote_seed_legacy_version" ON "SpireClinicalNote";
CREATE TRIGGER "SpireClinicalNote_seed_legacy_version"
AFTER INSERT OR UPDATE OF "body","patientId","legalEntityId"
ON "SpireClinicalNote"
FOR EACH ROW EXECUTE FUNCTION "seed_spire_legacy_note_version"();

CREATE INDEX IF NOT EXISTS "SpireClinicalNote_client_history_idx"
  ON "SpireClinicalNote"("organizationId","clientId","signedAt" DESC);

COMMENT ON FUNCTION "sync_spire_legacy_clinical_note"() IS
  'Keeps legacy SPIRE clinical-note writers compatible with the canonical patient/version/signature model.';
COMMENT ON FUNCTION "seed_spire_legacy_note_version"() IS
  'Preserves legacy note body text as immutable version 1 for the modern SPIRE Notes history.';
