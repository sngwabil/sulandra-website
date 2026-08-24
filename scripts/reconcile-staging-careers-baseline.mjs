import { PrismaClient } from '@prisma/client';

const CAREERS_MIGRATION = '20260728152000_careers_pipeline';

function requireStagingGuard() {
  if (process.env.SULANDRA_STAGING_CANARY_BOOTSTRAP !== '1') {
    throw new Error('Staging careers reconciliation refused: SULANDRA_STAGING_CANARY_BOOTSTRAP=1 is required.');
  }
  if (process.env.SULANDRA_ENVIRONMENT !== 'release-1.1-staging-canary') {
    throw new Error('Staging careers reconciliation refused: SULANDRA_ENVIRONMENT must equal release-1.1-staging-canary.');
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
      throw new Error(`Staging careers reconciliation refused: ${actualName} does not match its staging guard.`);
    }
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('Staging careers reconciliation refused: DATABASE_URL is not configured.');
  }
}

requireStagingGuard();

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function relationState() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      to_regclass('public."JobOpening"')::text AS "jobOpening",
      to_regclass('public."ApplicantDocument"')::text AS "applicantDocument",
      to_regclass('public."ApplicantMessage"')::text AS "applicantMessage",
      to_regclass('public."InterviewOption"')::text AS "interviewOption"
  `);
  return rows[0] || {};
}

async function careersMigrationWasBaselined() {
  const history = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."_prisma_migrations"')::text AS relation`,
  );
  if (!history[0]?.relation) return false;

  const rows = await prisma.$queryRawUnsafe(
    `SELECT "finished_at", "rolled_back_at"
       FROM "_prisma_migrations"
      WHERE "migration_name" = $1
      ORDER BY "started_at" DESC
      LIMIT 1`,
    CAREERS_MIGRATION,
  );
  const latest = rows[0];
  return Boolean(latest?.finished_at && !latest?.rolled_back_at);
}

const statements = [
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JobOpeningStatus') THEN
       CREATE TYPE "JobOpeningStatus" AS ENUM ('DRAFT','PUBLISHED','CLOSED','ARCHIVED');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicantDocumentStatus') THEN
       CREATE TYPE "ApplicantDocumentStatus" AS ENUM ('MISSING','REQUESTED','RECEIVED','APPROVED','REJECTED','EXPIRED','RENEWAL_REQUESTED');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicantDocumentCategory') THEN
       CREATE TYPE "ApplicantDocumentCategory" AS ENUM ('APPLICATION','RESUME','COVER_LETTER','CPR','FIRST_AID','LPN_LICENSE','RN_LICENSE','DRIVER_LICENSE','AUTO_INSURANCE','TB_TEST','PHYSICAL','BACKGROUND_CHECK','SOCIAL_SECURITY_CARD','REFERENCES','OTHER');
     END IF;
   END $$;`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicantMessageType') THEN
       CREATE TYPE "ApplicantMessageType" AS ENUM ('DOCUMENT_REQUEST','INTERVIEW_INVITATION','GENERAL','STATUS_UPDATE');
     END IF;
   END $$;`,
  `CREATE TABLE IF NOT EXISTS "JobOpening" (
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
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "JobOpening_organizationId_slug_key" ON "JobOpening"("organizationId","slug");`,
  `CREATE INDEX IF NOT EXISTS "JobOpening_public_idx" ON "JobOpening"("status","opensAt","closesAt");`,
  `ALTER TABLE "EmployeeApplication"
     ADD COLUMN IF NOT EXISTS "jobOpeningId" TEXT,
     ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'ADMIN',
     ADD COLUMN IF NOT EXISTS "sourceExternalId" TEXT,
     ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT,
     ADD COLUMN IF NOT EXISTS "folderCreatedAt" TIMESTAMP(3),
     ADD COLUMN IF NOT EXISTS "lastApplicantContactAt" TIMESTAMP(3);`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeApplication_jobOpeningId_fkey') THEN
       ALTER TABLE "EmployeeApplication"
         ADD CONSTRAINT "EmployeeApplication_jobOpeningId_fkey"
         FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE SET NULL;
     END IF;
   END $$;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeApplication_sourceExternalId_key" ON "EmployeeApplication"("sourceExternalId") WHERE "sourceExternalId" IS NOT NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeApplication_referenceNumber_key" ON "EmployeeApplication"("referenceNumber") WHERE "referenceNumber" IS NOT NULL;`,
  `CREATE INDEX IF NOT EXISTS "EmployeeApplication_jobOpeningId_status_idx" ON "EmployeeApplication"("jobOpeningId","status");`,
  `CREATE TABLE IF NOT EXISTS "ApplicantDocument" (
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
   );`,
  `CREATE INDEX IF NOT EXISTS "ApplicantDocument_application_category_idx" ON "ApplicantDocument"("applicationId","category","version");`,
  `CREATE INDEX IF NOT EXISTS "ApplicantDocument_expiration_idx" ON "ApplicantDocument"("status","expiresAt");`,
  `CREATE TABLE IF NOT EXISTS "ApplicantMessage" (
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
   );`,
  `CREATE INDEX IF NOT EXISTS "ApplicantMessage_application_created_idx" ON "ApplicantMessage"("applicationId","createdAt");`,
  `CREATE TABLE IF NOT EXISTS "InterviewOption" (
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
   );`,
  `CREATE INDEX IF NOT EXISTS "InterviewOption_application_starts_idx" ON "InterviewOption"("applicationId","startsAt");`,
];

try {
  const applied = await careersMigrationWasBaselined();
  const before = await relationState();
  const missingBefore = Object.entries(before).filter(([, value]) => !value).map(([key]) => key);

  if (missingBefore.length === 0) {
    console.log('[staging-careers-reconcile] careers pipeline relations are already present; no repair is required.');
    process.exitCode = 0;
  } else if (!applied) {
    console.log(`[staging-careers-reconcile] ${CAREERS_MIGRATION} is not recorded as applied; leaving schema creation to prisma migrate deploy.`);
    process.exitCode = 0;
  } else {
    console.log(`[staging-careers-reconcile] ${CAREERS_MIGRATION} is recorded as applied but baseline relations are missing: ${missingBefore.join(', ')}.`);
    console.log('[staging-careers-reconcile] restoring only missing careers-pipeline schema objects; no rows are dropped or rewritten.');

    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }

    const after = await relationState();
    const missingAfter = Object.entries(after).filter(([, value]) => !value).map(([key]) => key);
    if (missingAfter.length > 0) {
      throw new Error(`Staging careers reconciliation incomplete. Missing relations: ${missingAfter.join(', ')}`);
    }

    console.log('[staging-careers-reconcile] careers pipeline baseline schema reconciled successfully without destructive changes.');
  }
} finally {
  await prisma.$disconnect();
}
