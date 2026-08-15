-- SPIRE LDA / Wound workspace
-- Additive persistence for lines, drains, airways, tubes, catheters, ostomies and wounds.
-- Existing clinical tables are not modified.

CREATE TABLE IF NOT EXISTS "SpireLda" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "legalEntityId" TEXT,
  "clientId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "typeCode" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "bodySide" TEXT NOT NULL DEFAULT 'FRONT',
  "bodyRegion" TEXT NOT NULL,
  "laterality" TEXT,
  "positionX" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "positionY" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "placementAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "removalAt" TIMESTAMPTZ,
  "presentOnAdmission" BOOLEAN NOT NULL DEFAULT FALSE,
  "insertionProvider" TEXT,
  "indication" TEXT,
  "size" TEXT,
  "assessmentIntervalMinutes" INTEGER,
  "linkedOrderId" TEXT,
  "linkedOrderText" TEXT,
  "linkedLdaId" TEXT,
  "properties" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "comment" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "removedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireLda_status_check" CHECK ("status" IN ('ACTIVE','REMOVED','COMPLETED','ENTERED_IN_ERROR')),
  CONSTRAINT "SpireLda_body_side_check" CHECK ("bodySide" IN ('FRONT','BACK')),
  CONSTRAINT "SpireLda_position_x_check" CHECK ("positionX" >= 0 AND "positionX" <= 100),
  CONSTRAINT "SpireLda_position_y_check" CHECK ("positionY" >= 0 AND "positionY" <= 100),
  CONSTRAINT "SpireLda_interval_check" CHECK ("assessmentIntervalMinutes" IS NULL OR "assessmentIntervalMinutes" >= 15)
);

CREATE INDEX IF NOT EXISTS "SpireLda_org_client_status_idx"
  ON "SpireLda" ("organizationId","clientId","status");
CREATE INDEX IF NOT EXISTS "SpireLda_org_client_type_idx"
  ON "SpireLda" ("organizationId","clientId","typeCode");
CREATE INDEX IF NOT EXISTS "SpireLda_placement_idx"
  ON "SpireLda" ("organizationId","clientId","placementAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireLdaAssessment" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "ldaId" TEXT NOT NULL REFERENCES "SpireLda"("id") ON DELETE CASCADE,
  "assessmentType" TEXT NOT NULL DEFAULT 'ROUTINE',
  "status" TEXT NOT NULL DEFAULT 'FINAL',
  "assessedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "comment" TEXT,
  "linkedNoteId" TEXT,
  "performedByUserId" TEXT NOT NULL,
  "amendsAssessmentId" TEXT REFERENCES "SpireLdaAssessment"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireLdaAssessment_status_check" CHECK ("status" IN ('FINAL','AMENDED','ENTERED_IN_ERROR'))
);

CREATE INDEX IF NOT EXISTS "SpireLdaAssessment_lda_time_idx"
  ON "SpireLdaAssessment" ("ldaId","assessedAt" DESC);
CREATE INDEX IF NOT EXISTS "SpireLdaAssessment_org_client_idx"
  ON "SpireLdaAssessment" ("organizationId","clientId","assessedAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireLdaImage" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "ldaId" TEXT NOT NULL REFERENCES "SpireLda"("id") ON DELETE CASCADE,
  "assessmentId" TEXT REFERENCES "SpireLdaAssessment"("id") ON DELETE SET NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "dataUrl" TEXT NOT NULL,
  "caption" TEXT,
  "takenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "uploadedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "SpireLdaImage_lda_time_idx"
  ON "SpireLdaImage" ("ldaId","takenAt" DESC);

CREATE TABLE IF NOT EXISTS "SpireLdaLink" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "ldaId" TEXT NOT NULL REFERENCES "SpireLda"("id") ON DELETE CASCADE,
  "linkType" TEXT NOT NULL,
  "targetId" TEXT,
  "label" TEXT NOT NULL,
  "relation" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SpireLdaLink_type_check" CHECK ("linkType" IN ('ORDER','LDA','FLOWSHEET','NOTE','THERAPY','OTHER'))
);

CREATE INDEX IF NOT EXISTS "SpireLdaLink_lda_idx" ON "SpireLdaLink" ("ldaId","createdAt" DESC);

-- Preserve one source of truth for updated timestamps without modifying historical rows.
CREATE OR REPLACE FUNCTION "spire_lda_touch_updated_at"() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SpireLda_touch_updated_at" ON "SpireLda";
CREATE TRIGGER "SpireLda_touch_updated_at"
  BEFORE UPDATE ON "SpireLda"
  FOR EACH ROW EXECUTE FUNCTION "spire_lda_touch_updated_at"();

DROP TRIGGER IF EXISTS "SpireLdaAssessment_touch_updated_at" ON "SpireLdaAssessment";
CREATE TRIGGER "SpireLdaAssessment_touch_updated_at"
  BEFORE UPDATE ON "SpireLdaAssessment"
  FOR EACH ROW EXECUTE FUNCTION "spire_lda_touch_updated_at"();
