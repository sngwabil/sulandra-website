import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL;
const organizationId = process.env.MULTI_COMPANY_TEST_ORGANIZATION_ID;
const databaseTest = databaseUrl ? test : test.skip.bind(test);

databaseTest('all current operational rows are assigned to the matching SCLS entity', async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const auditRows = await prisma.$queryRawUnsafe(
      `SELECT "tableName","rowsBackfilled","remainingUnassignedRows"
       FROM "OperationalEntityBackfillAudit"
       WHERE "migrationKey"='20260808230000_scls_operational_data_backfill'
       ORDER BY "tableName"`,
    );
    assert.ok(auditRows.length > 0);
    assert.ok(auditRows.every((row) => Number(row.remainingUnassignedRows) === 0));

    const missingColumns = await prisma.$queryRawUnsafe(
      `SELECT audit."tableName"
       FROM "OperationalEntityBackfillAudit" audit
       WHERE audit."migrationKey"='20260808230000_scls_operational_data_backfill'
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns column_row
           WHERE column_row.table_schema='public' AND column_row.table_name=audit."tableName" AND column_row.column_name='legalEntityId'
         )`,
    );
    assert.deepEqual(missingColumns, []);

    if (organizationId) {
      const entities = await prisma.$queryRawUnsafe(
        `SELECT "id","code" FROM "LegalEntity" WHERE "organizationId"=$1`,
        organizationId,
      );
      assert.equal(entities.find((row) => row.code === 'SCLS')?.id !== undefined, true);
    }
  } finally {
    await prisma.$disconnect();
  }
});
