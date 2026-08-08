ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "sensitivity" text NOT NULL DEFAULT 'CLINICAL';
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'SPIRE_UPLOAD';
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "currentVersion" integer NOT NULL DEFAULT 1;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "sizeBytes" bigint;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "storageBucket" text;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "etag" text;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "encryption" text;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "kmsKeyId" text;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "ivBase64" text;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "authTagBase64" text;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "malwareScanStatus" text NOT NULL DEFAULT 'PENDING';
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "malwareScanDetail" text;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "reviewStatus" text NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "reviewedAt" timestamptz;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "reviewedById" text;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "retentionUntil" date;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "legalHold" boolean NOT NULL DEFAULT false;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "effectiveDate" date;
ALTER TABLE "SpireClinicalDocument" ADD COLUMN IF NOT EXISTS "expirationDate" date;
CREATE INDEX IF NOT EXISTS "SpireClinicalDocument_search_idx" ON "SpireClinicalDocument"("organizationId","patientId","category","status","createdAt");
CREATE INDEX IF NOT EXISTS "SpireClinicalDocument_review_idx" ON "SpireClinicalDocument"("organizationId","reviewStatus","createdAt");

ALTER TABLE "SpireClinicalDocumentVersion" ADD COLUMN IF NOT EXISTS "storageBucket" text;
ALTER TABLE "SpireClinicalDocumentVersion" ADD COLUMN IF NOT EXISTS "etag" text;
ALTER TABLE "SpireClinicalDocumentVersion" ADD COLUMN IF NOT EXISTS "encryption" text;
ALTER TABLE "SpireClinicalDocumentVersion" ADD COLUMN IF NOT EXISTS "kmsKeyId" text;
ALTER TABLE "SpireClinicalDocumentVersion" ADD COLUMN IF NOT EXISTS "ivBase64" text;
ALTER TABLE "SpireClinicalDocumentVersion" ADD COLUMN IF NOT EXISTS "authTagBase64" text;
ALTER TABLE "SpireClinicalDocumentVersion" ADD COLUMN IF NOT EXISTS "malwareScanStatus" text NOT NULL DEFAULT 'PENDING';
ALTER TABLE "SpireClinicalDocumentVersion" ADD COLUMN IF NOT EXISTS "malwareScanDetail" text;
ALTER TABLE "SpireClinicalDocumentVersion" ADD COLUMN IF NOT EXISTS "changeReason" text;

CREATE TABLE IF NOT EXISTS "SpireDocumentAccessEvent" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"organizationId" text NOT NULL,"patientId" text NOT NULL,"documentId" text NOT NULL REFERENCES "SpireClinicalDocument"("id") ON DELETE CASCADE,"versionId" text,"actorUserId" text,"actorEmail" text,"action" text NOT NULL,"ipAddress" text,"userAgent" text,"createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireDocumentAccessEvent_document_idx" ON "SpireDocumentAccessEvent"("organizationId","documentId","createdAt");

CREATE TABLE IF NOT EXISTS "SpireDocumentAcknowledgement" (
 "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,"organizationId" text NOT NULL,"patientId" text NOT NULL,"documentId" text NOT NULL REFERENCES "SpireClinicalDocument"("id") ON DELETE CASCADE,"requiredForUserId" text,"acknowledgedById" text,"status" text NOT NULL DEFAULT 'PENDING',"acknowledgedAt" timestamptz,"attestation" text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "SpireDocumentAcknowledgement_pending_idx" ON "SpireDocumentAcknowledgement"("organizationId","patientId","status");

ALTER TABLE "SpireExternalRecord" ADD COLUMN IF NOT EXISTS "sourceOrganization" text;
ALTER TABLE "SpireExternalRecord" ADD COLUMN IF NOT EXISTS "sourceSystem" text;
ALTER TABLE "SpireExternalRecord" ADD COLUMN IF NOT EXISTS "importStatus" text NOT NULL DEFAULT 'IMPORTED';
ALTER TABLE "SpireExternalRecord" ADD COLUMN IF NOT EXISTS "reviewStatus" text NOT NULL DEFAULT 'UNREVIEWED';
ALTER TABLE "SpireExternalRecord" ADD COLUMN IF NOT EXISTS "reviewedAt" timestamptz;
ALTER TABLE "SpireExternalRecord" ADD COLUMN IF NOT EXISTS "reviewedById" text;
ALTER TABLE "SpireExternalRecord" ADD COLUMN IF NOT EXISTS "createdById" text;
CREATE INDEX IF NOT EXISTS "SpireExternalRecord_patient_date_idx" ON "SpireExternalRecord"("organizationId","patientId","recordDate");

ALTER TABLE "SpireMediaItem" ADD COLUMN IF NOT EXISTS "mediaCategory" text;
ALTER TABLE "SpireMediaItem" ADD COLUMN IF NOT EXISTS "isPatientPhoto" boolean NOT NULL DEFAULT false;
ALTER TABLE "SpireMediaItem" ADD COLUMN IF NOT EXISTS "createdById" text;
CREATE INDEX IF NOT EXISTS "SpireMediaItem_patient_idx" ON "SpireMediaItem"("organizationId","patientId","takenAt");