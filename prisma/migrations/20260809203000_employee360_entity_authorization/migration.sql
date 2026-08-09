-- Employee 360 authorization belongs to the selected employer company.
-- Historical organization-wide grants and access events predate multi-company
-- routing, so they are preserved as SCLS records before the discriminator is
-- made mandatory. This migration does not activate any provider capability.

ALTER TABLE "Employee360AccessGrant"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "Employee360AccessEvent"
  ADD COLUMN IF NOT EXISTS "legalEntityId" text;
ALTER TABLE "Employment"
  ADD COLUMN IF NOT EXISTS "supervisorId" text;

UPDATE "Employee360AccessGrant" grant_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=grant_row."organizationId"
  AND entity."code"='SCLS'
  AND grant_row."legalEntityId" IS NULL;

UPDATE "Employee360AccessEvent" event_row
SET "legalEntityId"=entity."id"
FROM "LegalEntity" entity
WHERE entity."organizationId"=event_row."organizationId"
  AND entity."code"='SCLS'
  AND event_row."legalEntityId" IS NULL;

-- The legacy EmployeeManagementProfile supervisor relationship was global.
-- Preserve it only on the matching SCLS employment and only when that
-- supervisor also belongs to SCLS; future writes use Employment.supervisorId.
DO $$
BEGIN
  IF to_regclass('public."EmployeeManagementProfile"') IS NOT NULL THEN
    EXECUTE $backfill$
      UPDATE "Employment" employment
      SET "supervisorId"=profile."supervisorId","updatedAt"=now()
      FROM "EmployeeManagementProfile" profile
      WHERE employment."organizationId"=profile."organizationId"
        AND employment."userId"=profile."userId"
        AND profile."supervisorId" IS NOT NULL
        AND employment."legalEntityId"=(
          SELECT entity."id" FROM "LegalEntity" entity
          WHERE entity."organizationId"=employment."organizationId" AND entity."code"='SCLS'
          LIMIT 1
        )
        AND EXISTS (
          SELECT 1 FROM "Employment" supervisor_employment
          WHERE supervisor_employment."organizationId"=employment."organizationId"
            AND supervisor_employment."legalEntityId"=employment."legalEntityId"
            AND supervisor_employment."userId"=profile."supervisorId"
        )
        AND employment."supervisorId" IS NULL
    $backfill$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Employee360AccessGrant" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'Employee360AccessGrant contains records without an SCLS legal entity';
  END IF;
  IF EXISTS (SELECT 1 FROM "Employee360AccessEvent" WHERE "legalEntityId" IS NULL) THEN
    RAISE EXCEPTION 'Employee360AccessEvent contains records without an SCLS legal entity';
  END IF;
END $$;

ALTER TABLE "Employee360AccessGrant"
  ALTER COLUMN "legalEntityId" SET NOT NULL;
ALTER TABLE "Employee360AccessEvent"
  ALTER COLUMN "legalEntityId" SET NOT NULL;

DROP INDEX IF EXISTS "Employee360AccessGrant_active_unique_idx";
CREATE UNIQUE INDEX "Employee360AccessGrant_active_unique_idx"
  ON "Employee360AccessGrant"(
    "organizationId","legalEntityId","actorUserId","profile","scopeType",
    COALESCE("locationId",''),COALESCE("employeeId",'')
  ) WHERE "active"=true;

CREATE INDEX IF NOT EXISTS "Employee360AccessGrant_entity_actor_idx"
  ON "Employee360AccessGrant"("organizationId","legalEntityId","actorUserId","active");
CREATE INDEX IF NOT EXISTS "Employee360AccessGrant_entity_scope_idx"
  ON "Employee360AccessGrant"("organizationId","legalEntityId","scopeType","locationId","employeeId");
CREATE INDEX IF NOT EXISTS "Employee360AccessEvent_entity_target_idx"
  ON "Employee360AccessEvent"("organizationId","legalEntityId","targetEmployeeId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Employee360AccessEvent_entity_actor_idx"
  ON "Employee360AccessEvent"("organizationId","legalEntityId","actorUserId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Employee360AccessEvent_entity_decision_idx"
  ON "Employee360AccessEvent"("organizationId","legalEntityId","decision","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Employment_entity_supervisor_idx"
  ON "Employment"("organizationId","legalEntityId","supervisorId","status")
  WHERE "supervisorId" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Employee360AccessGrant_entity_fkey') THEN
    ALTER TABLE "Employee360AccessGrant"
      ADD CONSTRAINT "Employee360AccessGrant_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId")
      REFERENCES "LegalEntity"("organizationId","id")
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "Employee360AccessGrant" VALIDATE CONSTRAINT "Employee360AccessGrant_entity_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='Employee360AccessEvent_entity_fkey') THEN
    ALTER TABLE "Employee360AccessEvent"
      ADD CONSTRAINT "Employee360AccessEvent_entity_fkey"
      FOREIGN KEY ("organizationId","legalEntityId")
      REFERENCES "LegalEntity"("organizationId","id")
      ON DELETE RESTRICT NOT VALID;
    ALTER TABLE "Employee360AccessEvent" VALIDATE CONSTRAINT "Employee360AccessEvent_entity_fkey";
  END IF;
END $$;

COMMENT ON COLUMN "Employee360AccessGrant"."legalEntityId" IS
  'Employer company in which this Employee 360 access policy applies.';
COMMENT ON COLUMN "Employee360AccessEvent"."legalEntityId" IS
  'Employer company selected when this authorization decision occurred.';
COMMENT ON COLUMN "Employment"."supervisorId" IS
  'Supervisor relationship for this specific employer company.';
