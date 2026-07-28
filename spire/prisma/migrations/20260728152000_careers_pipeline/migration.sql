CREATE TYPE "JobOpeningStatus" AS ENUM ('DRAFT','PUBLISHED','CLOSED','ARCHIVED');
CREATE TYPE "ApplicantDocumentStatus" AS ENUM ('MISSING','REQUESTED','RECEIVED','APPROVED','REJECTED','EXPIRED','RENEWAL_REQUESTED');
CREATE TYPE "ApplicantDocumentCategory" AS ENUM ('APPLICATION','RESUME','COVER_LETTER','CPR','FIRST_AID','LPN_LICENSE','RN_LICENSE','DRIVER_LICENSE','AUTO_INSURANCE','TB_TEST','PHYSICAL','BACKGROUND_CHECK','SOCIAL_SECURITY_CARD','REFERENCES','OTHER');
CREATE TYPE "ApplicantMessageType" AS ENUM ('DOCUMENT_REQUEST','INTERVIEW_INVITATION','GENERAL','STATUS_UPDATE');

CREATE TABLE "JobOpening" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "department" TEXT,
  "employmentType" TEXT,
  "locationText" TEXT,
  "payRange" TEXT,
  "summary" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "requirements" TEXT,
  "benefits" TEXT,
  "applicationPath" TEXT,
  "status" "JobOpeningStatus" NOT NULL DEFAULT 'DRAFT',
  "opensAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JobOpening_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "JobOpening_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "JobOpening_organizationId_slug_key" ON "JobOpening"("organizationId","slug");
CREATE INDEX "JobOpening_public_idx" ON "JobOpening"("status","opensAt","closesAt");

ALTER TABLE "EmployeeApplication"
  ADD COLUMN IF NOT EXISTS "jobOpeningId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS "sourceExternalId" TEXT,
  ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "folderCreatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastApplicantContactAt" TIMESTAMP(3);
ALTER TABLE "EmployeeApplication" ADD CONSTRAINT "EmployeeApplication_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE SET NULL;
CREATE UNIQUE INDEX "EmployeeApplication_sourceExternalId_key" ON "EmployeeApplication"("sourceExternalId") WHERE "sourceExternalId" IS NOT NULL;
CREATE UNIQUE INDEX "EmployeeApplication_referenceNumber_key" ON "EmployeeApplication"("referenceNumber") WHERE "referenceNumber" IS NOT NULL;
CREATE INDEX "EmployeeApplication_jobOpeningId_status_idx" ON "EmployeeApplication"("jobOpeningId","status");

CREATE TABLE "ApplicantDocument" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "category" "ApplicantDocumentCategory" NOT NULL,
  "label" TEXT NOT NULL,
  "status" "ApplicantDocumentStatus" NOT NULL DEFAULT 'MISSING',
  "fileName" TEXT,
  "storagePath" TEXT,
  "downloadUrl" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "issueDate" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "replacesDocumentId" TEXT,
  "uploadedByType" TEXT,
  "verifiedById" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicantDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApplicantDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id") ON DELETE CASCADE,
  CONSTRAINT "ApplicantDocument_replacesDocumentId_fkey" FOREIGN KEY ("replacesDocumentId") REFERENCES "ApplicantDocument"("id") ON DELETE SET NULL,
  CONSTRAINT "ApplicantDocument_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX "ApplicantDocument_application_category_idx" ON "ApplicantDocument"("applicationId","category","version");
CREATE INDEX "ApplicantDocument_expiration_idx" ON "ApplicantDocument"("status","expiresAt");

CREATE TABLE "ApplicantMessage" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "type" "ApplicantMessageType" NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "deliveryStatus" TEXT NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" TEXT,
  "secureTokenHash" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicantMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApplicantMessage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id") ON DELETE CASCADE,
  CONSTRAINT "ApplicantMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX "ApplicantMessage_application_created_idx" ON "ApplicantMessage"("applicationId","createdAt");

CREATE TABLE "InterviewOption" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "mode" TEXT NOT NULL,
  "locationOrLink" TEXT,
  "selectedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterviewOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InterviewOption_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "EmployeeApplication"("id") ON DELETE CASCADE,
  CONSTRAINT "InterviewOption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE INDEX "InterviewOption_application_starts_idx" ON "InterviewOption"("applicationId","startsAt");
