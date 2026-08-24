import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const migrationRoot = path.join(repositoryRoot, 'prisma', 'migrations');
const suspectedLegacyMigration = '20260820115500_applicant_lifecycle_core';

const migrationEntries = await readdir(migrationRoot, { withFileTypes: true });
const releaseMigrations = migrationEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const releaseSet = new Set(releaseMigrations);

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

try {
  const tableProbe = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."_prisma_migrations"')::text AS relation`,
  );
  if (!tableProbe[0]?.relation) {
    throw new Error('Release staging parity failed: _prisma_migrations does not exist.');
  }

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      "migration_name" AS "migrationName",
      "started_at" AS "startedAt",
      "finished_at" AS "finishedAt",
      "rolled_back_at" AS "rolledBackAt",
      "logs" AS "logs"
    FROM "_prisma_migrations"
    ORDER BY "started_at" ASC
  `);

  const successful = new Set(
    rows
      .filter((row) => row.finishedAt && !row.rolledBackAt)
      .map((row) => row.migrationName),
  );

  const missingReleaseMigrations = releaseMigrations.filter((name) => !successful.has(name));
  const unresolvedFailedReleaseRows = rows.filter(
    (row) => releaseSet.has(row.migrationName) && !row.finishedAt && !row.rolledBackAt,
  );
  const databaseOnlyNames = [...new Set(rows.map((row) => row.migrationName))]
    .filter((name) => !releaseSet.has(name))
    .sort();
  const suspectedRows = rows.filter((row) => row.migrationName === suspectedLegacyMigration);

  console.log(`[release-db-parity] release migrations on disk: ${releaseMigrations.length}`);
  console.log(`[release-db-parity] release migrations successfully applied: ${releaseMigrations.length - missingReleaseMigrations.length}`);
  console.log(`[release-db-parity] release migrations missing/unapplied: ${missingReleaseMigrations.length}`);
  console.log(`[release-db-parity] unresolved failed release migration rows: ${unresolvedFailedReleaseRows.length}`);
  console.log(`[release-db-parity] database-only migration names: ${databaseOnlyNames.length}`);

  if (databaseOnlyNames.length > 0) {
    console.warn(`[release-db-parity] database-only history (not in release tree): ${databaseOnlyNames.join(', ')}`);
  }

  if (suspectedRows.length === 0) {
    console.log(`[release-db-parity] ${suspectedLegacyMigration}: absent from staging migration history.`);
  } else {
    const states = suspectedRows.map((row) => ({
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      rolledBackAt: row.rolledBackAt,
      failed: !row.finishedAt && !row.rolledBackAt,
      hasLogs: Boolean(row.logs),
    }));
    console.warn(`[release-db-parity] ${suspectedLegacyMigration}: database-only history present: ${JSON.stringify(states)}`);
  }

  if (unresolvedFailedReleaseRows.length > 0) {
    console.error(
      `[release-db-parity] unresolved failed release rows: ${unresolvedFailedReleaseRows.map((row) => row.migrationName).join(', ')}`,
    );
  }

  if (missingReleaseMigrations.length > 0) {
    throw new Error(
      `Release staging parity failed. Release migrations not successfully applied: ${missingReleaseMigrations.join(', ')}`,
    );
  }

  console.log('[release-db-parity] PASS: every migration in prisma/migrations is successfully applied in staging.');
} finally {
  await prisma.$disconnect();
}
