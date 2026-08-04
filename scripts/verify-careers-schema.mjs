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
    'requestedAt',
    'uploadedAt',
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
    'sessionVersion',
  ],
  ApplicantPasswordReset: [
    'accountId',
    'tokenHash',
    'expiresAt',
    'usedAt',
  ],
  ApplicantStatusHistory: [
    'applicationId',
    'fromStatus',
    'toStatus',
    'visibleToApplicant',
  ],
  CompanySetting: [
    'organizationId',
    'emailDisplayName',
    'timeZone',
  ],
  InterviewSlot: [
    'organizationId',
    'startsAt',
    'status',
    'bookedApplicationId',
  ],
  InterviewInvitation: [
    'applicationId',
    'tokenHash',
    'expiresAt',
    'status',
  ],
  InterviewInvitationSlot: [
    'invitationId',
    'slotId',
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

  if (!enumRows.some(({ label }) => label === 'GENERAL')) missing.push('UserRole.GENERAL');
  if (!enumRows.some(({ label }) => label === 'DRIVER')) missing.push('UserRole.DRIVER');
  if (!enumRows.some(({ label }) => label === 'DOO')) missing.push('UserRole.DOO');

  const roleConstraintRows = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conname = 'EmployeeApplication_role_check'
          AND conrelid = '"EmployeeApplication"'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%DOO%'
     ) AS "isReady"`,
  );
  if (!roleConstraintRows[0]?.isReady) {
    missing.push('EmployeeApplication_role_check.DOO');
  }

  const workflowConstraintRows = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_constraint
        WHERE conname = 'EmployeeApplication_workflowStatus_check'
          AND conrelid = '"EmployeeApplication"'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%OFFER_ACCEPTED%'
     ) AS "isReady"`,
  );
  if (!workflowConstraintRows[0]?.isReady) {
    missing.push('EmployeeApplication_workflowStatus_check.OFFER_ACCEPTED');
  }

  if (missing.length > 0) {
    throw new Error(`Careers lifecycle schema is incomplete after migrations. Missing: ${missing.join(', ')}`);
  }

  console.log('Careers lifecycle schema is ready, including DOO role, offer workflow statuses, and interview scheduling.');
} finally {
  await prisma.$disconnect();
}
