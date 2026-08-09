CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "CompanyDocumentFolder" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "parentFolderId" text REFERENCES "CompanyDocumentFolder"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'GENERAL',
  "description" text,
  "sensitivity" text NOT NULL DEFAULT 'CONFIDENTIAL',
  "active" boolean NOT NULL DEFAULT true,
  "systemFolder" boolean NOT NULL DEFAULT false,
  "createdById" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CompanyDocumentFolder_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "CompanyDocumentFolder_sensitivity_check"
    CHECK ("sensitivity" IN ('GENERAL','CONFIDENTIAL','RESTRICTED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyDocumentFolder_entity_parent_name_key"
  ON "CompanyDocumentFolder"("organizationId","legalEntityId",COALESCE("parentFolderId",''),lower("name"))
  WHERE "active"=true;
CREATE INDEX IF NOT EXISTS "CompanyDocumentFolder_entity_idx"
  ON "CompanyDocumentFolder"("organizationId","legalEntityId","active","category","name");

CREATE TABLE IF NOT EXISTS "CompanyDocument" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "folderId" text NOT NULL REFERENCES "CompanyDocumentFolder"("id") ON DELETE RESTRICT,
  "title" text NOT NULL,
  "documentType" text NOT NULL DEFAULT 'GENERAL',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "sensitivity" text NOT NULL DEFAULT 'CONFIDENTIAL',
  "currentVersion" integer NOT NULL DEFAULT 1,
  "effectiveDate" date,
  "expirationDate" date,
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdById" text NOT NULL,
  "updatedById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CompanyDocument_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "CompanyDocument_status_check"
    CHECK ("status" IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
  CONSTRAINT "CompanyDocument_sensitivity_check"
    CHECK ("sensitivity" IN ('GENERAL','CONFIDENTIAL','RESTRICTED')),
  CONSTRAINT "CompanyDocument_dates_check"
    CHECK ("expirationDate" IS NULL OR "effectiveDate" IS NULL OR "expirationDate">="effectiveDate")
);
CREATE INDEX IF NOT EXISTS "CompanyDocument_entity_folder_idx"
  ON "CompanyDocument"("organizationId","legalEntityId","folderId","status","title");
CREATE INDEX IF NOT EXISTS "CompanyDocument_entity_expiration_idx"
  ON "CompanyDocument"("organizationId","legalEntityId","expirationDate")
  WHERE "expirationDate" IS NOT NULL AND "status"='ACTIVE';

CREATE TABLE IF NOT EXISTS "CompanyDocumentVersion" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "documentId" text NOT NULL REFERENCES "CompanyDocument"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL,
  "originalFileName" text NOT NULL,
  "mimeType" text NOT NULL,
  "sizeBytes" integer NOT NULL,
  "sha256" text NOT NULL,
  "content" bytea NOT NULL,
  "changeNote" text,
  "uploadedById" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CompanyDocumentVersion_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT,
  CONSTRAINT "CompanyDocumentVersion_document_version_key" UNIQUE ("documentId","version"),
  CONSTRAINT "CompanyDocumentVersion_size_check" CHECK ("sizeBytes">=0 AND "sizeBytes"<=26214400)
);
CREATE INDEX IF NOT EXISTS "CompanyDocumentVersion_entity_document_idx"
  ON "CompanyDocumentVersion"("organizationId","legalEntityId","documentId","version" DESC);

CREATE TABLE IF NOT EXISTS "CompanyDocumentEvent" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" text NOT NULL,
  "legalEntityId" text NOT NULL,
  "folderId" text,
  "documentId" text,
  "versionId" text,
  "actorUserId" text NOT NULL,
  "eventType" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CompanyDocumentEvent_entity_fkey"
    FOREIGN KEY ("organizationId","legalEntityId")
    REFERENCES "LegalEntity"("organizationId","id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "CompanyDocumentEvent_entity_created_idx"
  ON "CompanyDocumentEvent"("organizationId","legalEntityId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CompanyDocumentEvent_document_idx"
  ON "CompanyDocumentEvent"("organizationId","legalEntityId","documentId","createdAt" DESC);

CREATE OR REPLACE FUNCTION "prevent_company_document_event_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CompanyDocumentEvent is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "CompanyDocumentEvent_no_update" ON "CompanyDocumentEvent";
CREATE TRIGGER "CompanyDocumentEvent_no_update"
BEFORE UPDATE ON "CompanyDocumentEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_company_document_event_mutation"();

DROP TRIGGER IF EXISTS "CompanyDocumentEvent_no_delete" ON "CompanyDocumentEvent";
CREATE TRIGGER "CompanyDocumentEvent_no_delete"
BEFORE DELETE ON "CompanyDocumentEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_company_document_event_mutation"();
