import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const requiredTables = ['Organization', 'User', 'EmployeeApplication', 'AuditEvent'];

try {
  const [tables] = await prisma.$queryRawUnsafe(`
    SELECT
      to_regclass('"Organization"')::text AS "Organization",
      to_regclass('"User"')::text AS "User",
      to_regclass('"EmployeeApplication"')::text AS "EmployeeApplication",
      to_regclass('"AuditEvent"')::text AS "AuditEvent"
  `);

  const missingTables = requiredTables.filter((table) => !tables?.[table]);
  if (missingTables.length > 0) {
    throw new Error(
      `Database is missing required base SPIRE tables: ${missingTables.join(', ')}. `
      + 'Apply or baseline the base SPIRE database schema before deploying the careers migration.',
    );
  }

  console.log('SPIRE database prerequisites are present.');
} finally {
  await prisma.$disconnect();
}
