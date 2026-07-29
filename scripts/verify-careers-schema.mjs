import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const requiredColumns = {
  EmployeeApplication: [
    'workflowStatus',
    'preferredCommunication',
    'applicantUsername',
    'assessmentScore',
    'assessmentMaxScore',
    'assessmentPercent',
    'assessmentBreakdown',
    'applicationData',
  ],
  ApplicantDocument: [
    'fileData',
    'contentSha256',
    'reviewNotes',
    'reviewedById',
    'reviewedAt',
  ],
  ApplicantMessage: [
    'channel',
    'recipientPhone',
    'replyToEmail',
    'providerMessageId',
    'errorMessage',
    'updatedAt',
  ],
  ApplicantPortalAccount: [
    'applicationId',
    'username',
    'passwordHash',
    'mustChangePassword',
  ],
  ApplicantStatusHistory: [
    'applicationId',
    'fromStatus',
    'toStatus',
    'visibleToApplicant',
  ],
};

try {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name AS "tableName", column_name AS "columnName"
       FROM information_schema.columns
      WHERE table_schema = 'public'`,
  );

  const available = new Set(
    rows.map(({ tableName, columnName }) => `${tableName}.${columnName}`),
  );
  const missing = [];

  for (const [tableName, columns] of Object.entries(requiredColumns)) {
    for (const columnName of columns) {
      if (!available.has(`${tableName}.${columnName}`)) {
        missing.push(`${tableName}.${columnName}`);
      }
    }
  }

  const enumRows = await prisma.$queryRawUnsafe(
    `SELECT enumlabel AS "label"
       FROM pg_enum
       JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'UserRole'`,
  );

  if (!enumRows.some(({ label }) => label === 'GENERAL')) {
    missing.push('UserRole.GENERAL');
  }

  if (missing.length > 0) {
    throw new Error(
      `Careers lifecycle schema is incomplete after migrations. Missing: ${missing.join(', ')}`,
    );
  }

  console.log('Careers lifecycle schema is ready.');
} finally {
  await prisma.$disconnect();
}
