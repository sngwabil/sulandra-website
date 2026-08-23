import { PrismaClient } from '@prisma/client';

const expectedProjectId = '57cf9538-ebbf-4947-b393-c77a33bb2926';
const expectedEnvironmentId = 'f72c66b3-2546-4673-bf3a-a309a26bd85b';
const expectedApiServiceId = '68161318-02a4-43d7-952a-dbef5611e114';

function requireStagingGuard() {
  if (process.env.SULANDRA_STAGING_CANARY_BOOTSTRAP !== '1') {
    throw new Error('Staging legacy bootstrap refused: SULANDRA_STAGING_CANARY_BOOTSTRAP=1 is required.');
  }
  if (process.env.SULANDRA_ENVIRONMENT !== 'release-1.1-staging-canary') {
    throw new Error('Staging legacy bootstrap refused: SULANDRA_ENVIRONMENT must equal release-1.1-staging-canary.');
  }
  if (process.env.RAILWAY_PROJECT_ID && process.env.RAILWAY_PROJECT_ID !== expectedProjectId) {
    throw new Error(`Staging legacy bootstrap refused: unexpected Railway project ${process.env.RAILWAY_PROJECT_ID}.`);
  }
  if (process.env.RAILWAY_ENVIRONMENT_ID && process.env.RAILWAY_ENVIRONMENT_ID !== expectedEnvironmentId) {
    throw new Error(`Staging legacy bootstrap refused: unexpected Railway environment ${process.env.RAILWAY_ENVIRONMENT_ID}.`);
  }
  if (process.env.RAILWAY_SERVICE_ID && process.env.RAILWAY_SERVICE_ID !== expectedApiServiceId) {
    throw new Error(`Staging legacy bootstrap refused: unexpected Railway service ${process.env.RAILWAY_SERVICE_ID}.`);
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
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='AuditEvent') AS "auditEvent";
  `);

  const row = verification[0] || {};
  if (!row.organization || !row.user || !row.employeeApplication || !row.auditEvent) {
    throw new Error(`Staging legacy bootstrap verification failed: ${JSON.stringify(row)}`);
  }

  console.log('[staging-bootstrap] legacy SPIRE baseline verified successfully.');
} finally {
  await prisma.$disconnect();
}
