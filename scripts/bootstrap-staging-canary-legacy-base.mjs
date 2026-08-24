import { PrismaClient } from '@prisma/client';

function requireStagingGuard() {
  if (process.env.SULANDRA_STAGING_CANARY_BOOTSTRAP !== '1') {
    throw new Error('Staging legacy bootstrap refused: SULANDRA_STAGING_CANARY_BOOTSTRAP=1 is required.');
  }
  if (process.env.SULANDRA_ENVIRONMENT !== 'release-1.1-staging-canary') {
    throw new Error('Staging legacy bootstrap refused: SULANDRA_ENVIRONMENT must equal release-1.1-staging-canary.');
  }

  const guardPairs = [
    ['RAILWAY_PROJECT_ID', 'SULANDRA_STAGING_PROJECT_GUARD'],
    ['RAILWAY_ENVIRONMENT_ID', 'SULANDRA_STAGING_ENVIRONMENT_GUARD'],
    ['RAILWAY_SERVICE_ID', 'SULANDRA_STAGING_SERVICE_GUARD'],
  ];

  for (const [actualName, expectedName] of guardPairs) {
    const actual = process.env[actualName];
    const expected = process.env[expectedName];
    if (!actual || !expected || actual !== expected) {
      throw new Error(`Staging legacy bootstrap refused: ${actualName} does not match its staging guard.`);
    }
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('Staging legacy bootstrap refused: DATABASE_URL is not configured.');
  }
}

requireStagingGuard();

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const statements = [
  {
    name: 'UserRole enum',
    sql: `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM (
      'ADMINISTRATOR',
      'PROGRAM_MANAGER',
      'AUDITOR',
      'DSP',
      'DELEGATING_NURSE',
      'LPN',
      'RN',
      'HOUSE_MANAGER',
      'HR_MANAGER',
      'SCHEDULER',
      'BILLING_SPECIALIST',
      'ADMINISTRATIVE_ASSISTANT',
      'CEO'
    );
  END IF;
END $$;`,
  },
  {
    name: 'Organization table',
    sql: `CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL DEFAULT 'Sulandra Health',
  "slug" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);`,
  },
  {
    name: 'User table',
    sql: `CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "email" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'DSP',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);`,
  },
  {
    name: 'EmployeeApplication table',
    sql: `CREATE TABLE IF NOT EXISTS "EmployeeApplication" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "firstName" TEXT,
  "middleName" TEXT,
  "lastName" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "appliedRole" TEXT NOT NULL DEFAULT 'GENERAL',
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "notes" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeApplication_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);`,
  },
  {
    name: 'EmployeeApplication index',
    sql: `CREATE INDEX IF NOT EXISTS "EmployeeApplication_org_status_idx"
  ON "EmployeeApplication"("organizationId","status","submittedAt");`,
  },
  {
    name: 'AuditEvent table',
    sql: `CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "action" TEXT NOT NULL DEFAULT 'LEGACY_BASELINE',
  "resourceType" TEXT,
  "resourceId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);`,
  },
  {
    name: 'Careers baseline enums',
    sql: `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JobOpeningStatus') THEN
    CREATE TYPE "JobOpeningStatus" AS ENUM ('DRAFT','PUBLISHED','CLOSED','ARCHIVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicantDocumentStatus') THEN
    CREATE TYPE "ApplicantDocumentStatus" AS ENUM ('MISSING','REQUESTED','RECEIVED','APPROVED','REJECTED','EXPIRED','RENEWAL_REQUESTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicantDocumentCategory') THEN
    CREATE TYPE "ApplicantDocumentCategory" AS ENUM ('APPLICATION','RESUME','COVER_LETTER','CPR','FIRST_AID','LPN_LICENSE','RN_LICENSE','DRIVER_LICENSE','AUTO_INSURANCE','TB_TEST','PHYSICAL','BACKGROUND_CHECK','SOCIAL_SECURITY_CARD','REFERENCES','OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicantMessageType') THEN
    CREATE TYPE "ApplicantMessageType" AS ENUM ('DOCUMENT_REQUEST','INTERVIEW_INVITATION','GENERAL','STATUS_UPDATE');
  END IF;
END $$;`,
  },
  {
    name: 'JobOpening careers baseline',
    sql: `CREATE TABLE IF NOT EXISTS "JobOpening" (
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
CREATE UNIQUE INDEX IF NOT EXISTS "JobOpening_organizationId_slug_key" ON "JobOpening"("organizationId","slug");
CREATE INDEX IF NOT EXISTS "JobOpening_public_idx" ON "JobOpening"("status","opensAt","closesAt");`,
  },
  {
    name: 'EmployeeApplication careers baseline columns',
    sql: `ALTER TABLE "EmployeeApplication"
  ADD COLUMN IF NOT EXISTS "jobOpeningId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN IF NOT EXISTS "sourceExternalId" TEXT,
  ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "folderCreatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastApplicantContactAt" TIMESTAMP(3);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeApplication_jobOpeningId_fkey') THEN
    ALTER TABLE "EmployeeApplication"
      ADD CONSTRAINT "EmployeeApplication_jobOpeningId_fkey"
      FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeApplication_sourceExternalId_key" ON "EmployeeApplication"("sourceExternalId") WHERE "sourceExternalId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeApplication_referenceNumber_key" ON "EmployeeApplication"("referenceNumber") WHERE "referenceNumber" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EmployeeApplication_jobOpeningId_status_idx" ON "EmployeeApplication"("jobOpeningId","status");`,
  },
  {
    name: 'ApplicantDocument careers baseline',
    sql: `CREATE TABLE IF NOT EXISTS "ApplicantDocument" (
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
CREATE INDEX IF NOT EXISTS "ApplicantDocument_application_category_idx" ON "ApplicantDocument"("applicationId","category","version");
CREATE INDEX IF NOT EXISTS "ApplicantDocument_expiration_idx" ON "ApplicantDocument"("status","expiresAt");`,
  },
  {
    name: 'ApplicantMessage careers baseline',
    sql: `CREATE TABLE IF NOT EXISTS "ApplicantMessage" (
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
CREATE INDEX IF NOT EXISTS "ApplicantMessage_application_created_idx" ON "ApplicantMessage"("applicationId","createdAt");`,
  },
  {
    name: 'InterviewOption careers baseline',
    sql: `CREATE TABLE IF NOT EXISTS "InterviewOption" (
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
CREATE INDEX IF NOT EXISTS "InterviewOption_application_starts_idx" ON "InterviewOption"("applicationId","startsAt");`,
  },
];

try {
  console.log('[staging-bootstrap] guarded Sulandra 1.1 canary bootstrap starting.');
  for (const statement of statements) {
    console.log(`[staging-bootstrap] applying ${statement.name}...`);
    await prisma.$executeRawUnsafe(statement.sql);
    console.log(`[staging-bootstrap] ${statement.name} ready.`);
  }

  const verification = await prisma.$queryRawUnsafe(`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='Organization') AS "organization",
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='User') AS "user",
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='EmployeeApplication') AS "employeeApplication",
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='AuditEvent') AS "auditEvent",
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='JobOpening') AS "jobOpening",
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ApplicantDocument') AS "applicantDocument",
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ApplicantMessage') AS "applicantMessage",
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='InterviewOption') AS "interviewOption",
      EXISTS (SELECT 1 FROM pg_type WHERE typname='JobOpeningStatus') AS "jobOpeningStatusType",
      EXISTS (SELECT 1 FROM pg_type WHERE typname='ApplicantDocumentStatus') AS "applicantDocumentStatusType",
      EXISTS (SELECT 1 FROM pg_type WHERE typname='ApplicantDocumentCategory') AS "applicantDocumentCategoryType",
      EXISTS (SELECT 1 FROM pg_type WHERE typname='ApplicantMessageType') AS "applicantMessageType";
  `);

  const row = verification[0] || {};
  const verified = Object.values(row).every(Boolean);
  if (!verified) {
    throw new Error(`Staging legacy bootstrap verification failed: ${JSON.stringify(row)}`);
  }

  console.log('[staging-bootstrap] legacy SPIRE and careers baseline verified successfully.');
} finally {
  await prisma.$disconnect();
}
