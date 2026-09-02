import { PrismaClient } from '@prisma/client';

const enabled = process.env.SULANDRA_RAILWAY_MIGRATION_BOOTSTRAP === '1';
const environment = String(process.env.SULANDRA_ENVIRONMENT || '').trim().toLowerCase();

if (!enabled) {
  console.log('[railway-migration-bootstrap] disabled; no identity rows changed.');
  process.exit(0);
}

if (environment !== 'staging') {
  throw new Error('Railway migration identity bootstrap is staging-only.');
}

const required = [
  'DATABASE_URL',
  'MIGRATION_ORGANIZATION_ID',
  'MIGRATION_ORGANIZATION_NAME',
  'MIGRATION_ADMIN_USER_ID',
  'MIGRATION_ADMIN_EMAIL',
  'MIGRATION_ADMIN_FIRST_NAME',
  'MIGRATION_ADMIN_LAST_NAME',
];
for (const key of required) {
  if (!String(process.env[key] || '').trim()) throw new Error(`Missing required ${key}`);
}

const prisma = new PrismaClient();
const organizationId = process.env.MIGRATION_ORGANIZATION_ID.trim();
const organizationName = process.env.MIGRATION_ORGANIZATION_NAME.trim();
const userId = process.env.MIGRATION_ADMIN_USER_ID.trim();
const email = process.env.MIGRATION_ADMIN_EMAIL.trim().toLowerCase();
const firstName = process.env.MIGRATION_ADMIN_FIRST_NAME.trim();
const lastName = process.env.MIGRATION_ADMIN_LAST_NAME.trim();

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "Organization" ("id", "name", "createdAt", "updatedAt")
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT ("id") DO UPDATE
       SET "name" = EXCLUDED."name", "updatedAt" = NOW()`,
      organizationId,
      organizationName,
    );

    const conflicting = await tx.$queryRawUnsafe(
      `SELECT "id" FROM "User"
       WHERE LOWER("email") = LOWER($1) AND "id" <> $2
       LIMIT 1`,
      email,
      userId,
    );
    if (Array.isArray(conflicting) && conflicting.length) {
      throw new Error('A different Railway user already owns the migration administrator email.');
    }

    await tx.$executeRawUnsafe(
      `INSERT INTO "User" (
         "id", "organizationId", "email", "firstName", "lastName", "role",
         "accountStatus", "active", "mfaEnabled", "createdAt", "updatedAt"
       )
       VALUES ($1, $2, $3, $4, $5, 'ADMINISTRATOR'::"UserRole",
               'ACTIVE'::"UserAccountStatus", TRUE, FALSE, NOW(), NOW())
       ON CONFLICT ("id") DO UPDATE
       SET "organizationId" = EXCLUDED."organizationId",
           "email" = EXCLUDED."email",
           "firstName" = EXCLUDED."firstName",
           "lastName" = EXCLUDED."lastName",
           "role" = EXCLUDED."role",
           "accountStatus" = EXCLUDED."accountStatus",
           "active" = TRUE,
           "updatedAt" = NOW()`,
      userId,
      organizationId,
      email,
      firstName,
      lastName,
    );
  });

  console.log('[railway-migration-bootstrap] Railway staging organization/Admin identity is ready; no password hash was copied.');
} finally {
  await prisma.$disconnect();
}
