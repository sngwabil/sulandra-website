import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const lockKey = 'sulandra-db-predeploy';
const ownerToken = randomUUID();
const lockRetryMs = 1500;
const leaseMs = 20 * 60 * 1000;
const maxLeaseWaitMs = 5 * 60 * 1000;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function constrainedDatabaseUrl(rawDatabaseUrl) {
  if (!rawDatabaseUrl) return rawDatabaseUrl;

  try {
    const databaseUrl = new URL(rawDatabaseUrl);
    if (databaseUrl.protocol === 'postgres:' || databaseUrl.protocol === 'postgresql:') {
      databaseUrl.searchParams.set('connection_limit', '1');
      if (!databaseUrl.searchParams.has('pool_timeout')) {
        databaseUrl.searchParams.set('pool_timeout', '15');
      }
      if (!databaseUrl.searchParams.has('connect_timeout')) {
        databaseUrl.searchParams.set('connect_timeout', '10');
      }
      return databaseUrl.toString();
    }
  } catch {
    console.warn('[db:predeploy] DATABASE_URL could not be normalized; using the configured value unchanged.');
  }

  return rawDatabaseUrl;
}

function childEnvironment() {
  const env = { ...process.env };
  env.DATABASE_URL = constrainedDatabaseUrl(env.DATABASE_URL);
  return env;
}

function runScript(scriptName) {
  console.log(`[db:predeploy] running npm run ${scriptName}`);
  const result = spawnSync(npm, ['run', scriptName], {
    stdio: 'inherit',
    env: childEnvironment(),
  });
  if (result.status !== 0) {
    throw new Error(`npm run ${scriptName} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function isConnectionPressure(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('too many database connections')
    || message.includes('remaining connection slots are reserved')
    || message.includes('remaining connection slots');
}

async function withPrisma(operation) {
  const datasourceUrl = constrainedDatabaseUrl(process.env.DATABASE_URL);
  const prisma = datasourceUrl
    ? new PrismaClient({ datasourceUrl })
    : new PrismaClient();
  try {
    return await operation(prisma);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function tryAcquireLease() {
  return withPrisma(async (prisma) => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DeploymentPredeployLock" (
        "lockKey" TEXT PRIMARY KEY,
        "ownerToken" TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO "DeploymentPredeployLock" ("lockKey", "ownerToken", "expiresAt", "updatedAt")
       VALUES ($1, $2, NOW() + ($3::double precision * INTERVAL '1 millisecond'), NOW())
       ON CONFLICT ("lockKey") DO UPDATE SET
         "ownerToken" = EXCLUDED."ownerToken",
         "expiresAt" = EXCLUDED."expiresAt",
         "updatedAt" = NOW()
       WHERE "DeploymentPredeployLock"."expiresAt" <= NOW()
          OR "DeploymentPredeployLock"."ownerToken" = EXCLUDED."ownerToken"
       RETURNING "ownerToken"`,
      lockKey,
      ownerToken,
      leaseMs,
    );

    return rows[0]?.ownerToken === ownerToken;
  });
}

async function acquireLease() {
  console.log('[db:predeploy] waiting for Sulandra deployment lease...');
  const startedAt = Date.now();
  let attempts = 0;
  let connectionPressureSeen = false;

  while (Date.now() - startedAt < maxLeaseWaitMs) {
    attempts += 1;
    try {
      if (await tryAcquireLease()) {
        console.log('[db:predeploy] acquired deployment lease without holding an idle database connection.');
        return;
      }
    } catch (error) {
      if (!isConnectionPressure(error)) throw error;
      connectionPressureSeen = true;
      if (attempts === 1 || attempts % 10 === 0) {
        console.warn('[db:predeploy] database is at connection capacity; waiting for a slot.');
      }
    }

    await wait(lockRetryMs);
  }

  if (connectionPressureSeen) {
    throw new Error(
      `[db:predeploy] database connection capacity did not recover within ${Math.round(maxLeaseWaitMs / 1000)} seconds. `
      + 'Reduce active Prisma pool usage or use a pooled DATABASE_URL before redeploying.',
    );
  }

  throw new Error(
    `[db:predeploy] another Sulandra deployment held the database lease for more than ${Math.round(maxLeaseWaitMs / 1000)} seconds. `
    + 'Allow that deployment to finish or cancel the stale Railway deployment before retrying.',
  );
}

async function releaseLease() {
  try {
    await withPrisma((prisma) => prisma.$executeRawUnsafe(
      `DELETE FROM "DeploymentPredeployLock" WHERE "lockKey"=$1 AND "ownerToken"=$2`,
      lockKey,
      ownerToken,
    ));
    console.log('[db:predeploy] released deployment lease.');
  } catch (error) {
    console.warn(`[db:predeploy] unable to release deployment lease immediately; it will expire automatically: ${error?.message || error}`);
  }
}

await acquireLease();

try {
  runScript('db:check-prerequisites');
  runScript('db:recover-failed-doo-migration');
  runScript('db:migrate:deploy');
  runScript('db:verify-careers-schema');

  console.log('[db:predeploy] database predeploy completed successfully.');
} finally {
  await releaseLease();
}
