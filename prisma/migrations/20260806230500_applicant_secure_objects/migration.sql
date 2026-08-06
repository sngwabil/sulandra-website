CREATE TABLE IF NOT EXISTS "ApplicantSecureDocumentObject" (
  "id" TEXT PRIMARY KEY,
  "applicationId" TEXT NOT NULL,
  "applicantDocumentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "etag" TEXT,
  "encryption" TEXT NOT NULL,
  "kmsKeyId" TEXT,
  "ivBase64" TEXT,
  "authTagBase64" TEXT,
  "malwareStatus" TEXT NOT NULL,
  "malwareEngine" TEXT,
  "malwareSignature" TEXT,
  "malwareDetail" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("applicantDocumentId"),
  UNIQUE("bucket","objectKey"),
  CONSTRAINT "ApplicantSecureDocumentObject_malware_check" CHECK ("malwareStatus" IN ('CLEAN','INFECTED','UNAVAILABLE'))
);
CREATE INDEX IF NOT EXISTS "ApplicantSecureDocumentObject_application_idx" ON "ApplicantSecureDocumentObject"("organizationId","applicationId","createdAt" DESC);
DO $$ BEGIN
  IF to_regclass('public."EmployeeApplication"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ApplicantSecureDocumentObject_application_fk') THEN
    ALTER TABLE "ApplicantSecureDocumentObject" ADD CONSTRAINT "ApplicantSecureDocumentObject_application_fk" FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id") ON DELETE CASCADE;
  END IF;
  IF to_regclass('public."ApplicantDocument"') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ApplicantSecureDocumentObject_document_fk') THEN
    ALTER TABLE "ApplicantSecureDocumentObject" ADD CONSTRAINT "ApplicantSecureDocumentObject_document_fk" FOREIGN KEY ("applicantDocumentId") REFERENCES "ApplicantDocument"("id") ON DELETE CASCADE;
  END IF;
END $$;
