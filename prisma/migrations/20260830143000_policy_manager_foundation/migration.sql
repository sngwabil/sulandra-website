CREATE TABLE IF NOT EXISTS "PolicyDocument" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "legalEntityId" TEXT,
  "scopeType" TEXT NOT NULL DEFAULT 'COMPANY',
  "policyCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "responsibleDepartment" TEXT,
  "summary" TEXT NOT NULL DEFAULT '',
  "objective" TEXT NOT NULL DEFAULT '',
  "scopeText" TEXT NOT NULL DEFAULT '',
  "definitionsText" TEXT NOT NULL DEFAULT '',
  "policyText" TEXT NOT NULL DEFAULT '',
  "proceduresText" TEXT NOT NULL DEFAULT '',
  "responsibilitiesText" TEXT NOT NULL DEFAULT '',
  "documentationText" TEXT NOT NULL DEFAULT '',
  "complianceText" TEXT NOT NULL DEFAULT '',
  "referencesText" TEXT NOT NULL DEFAULT '',
  "relatedDocumentsText" TEXT NOT NULL DEFAULT '',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "versionNumber" INTEGER NOT NULL DEFAULT 1,
  "effectiveDate" DATE,
  "reviewDate" DATE,
  "approvalAuthority" TEXT,
  "changeNote" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMPTZ,
  "retiredAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PolicyDocument_scopeType_check" CHECK ("scopeType" IN ('ENTERPRISE','COMPANY')),
  CONSTRAINT "PolicyDocument_status_check" CHECK ("status" IN ('DRAFT','IN_REVIEW','PUBLISHED','RETIRED')),
  CONSTRAINT "PolicyDocument_company_scope_check" CHECK (
    ("scopeType"='ENTERPRISE' AND "legalEntityId" IS NULL)
    OR ("scopeType"='COMPANY' AND "legalEntityId" IS NOT NULL)
  ),
  CONSTRAINT "PolicyDocument_version_check" CHECK ("versionNumber" >= 1)
);

CREATE TABLE IF NOT EXISTS "PolicyDocumentRevision" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL REFERENCES "PolicyDocument"("id") ON DELETE CASCADE,
  "versionNumber" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changeNote" TEXT,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "PolicyDocumentRevision_version_check" CHECK ("versionNumber" >= 1),
  CONSTRAINT "PolicyDocumentRevision_policy_version_key" UNIQUE ("policyId","versionNumber")
);

CREATE INDEX IF NOT EXISTS "PolicyDocument_org_status_idx"
  ON "PolicyDocument" ("organizationId","status");
CREATE INDEX IF NOT EXISTS "PolicyDocument_entity_status_idx"
  ON "PolicyDocument" ("organizationId","legalEntityId","status");
CREATE INDEX IF NOT EXISTS "PolicyDocument_category_idx"
  ON "PolicyDocument" ("organizationId","category");
CREATE INDEX IF NOT EXISTS "PolicyDocument_code_idx"
  ON "PolicyDocument" ("organizationId","policyCode");
CREATE INDEX IF NOT EXISTS "PolicyDocument_updated_idx"
  ON "PolicyDocument" ("organizationId","updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "PolicyDocument_search_idx" ON "PolicyDocument" USING GIN (
  to_tsvector(
    'english',
    COALESCE("policyCode",'') || ' ' ||
    COALESCE("title",'') || ' ' ||
    COALESCE("category",'') || ' ' ||
    COALESCE("responsibleDepartment",'') || ' ' ||
    COALESCE("summary",'') || ' ' ||
    COALESCE("objective",'') || ' ' ||
    COALESCE("scopeText",'') || ' ' ||
    COALESCE("definitionsText",'') || ' ' ||
    COALESCE("policyText",'') || ' ' ||
    COALESCE("proceduresText",'') || ' ' ||
    COALESCE("responsibilitiesText",'') || ' ' ||
    COALESCE("documentationText",'') || ' ' ||
    COALESCE("complianceText",'') || ' ' ||
    COALESCE("referencesText",'') || ' ' ||
    COALESCE("relatedDocumentsText",'')
  )
);

COMMENT ON TABLE "PolicyDocument" IS 'Governed Sulandra policy master records. Enterprise policies have no legalEntityId; company policies are company-scoped.';
COMMENT ON TABLE "PolicyDocumentRevision" IS 'Immutable snapshots captured when a policy version is published.';
