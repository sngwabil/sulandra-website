import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const lockKey = 'sulandra-db-predeploy';
const ownerToken = randomUUID();
const lockRetryMs = 1500;
const leaseMs = 20 * 60 * 1000;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function childEnvironment() {
  const env = { ...process.env };
  const rawDatabaseUrl = env.DATABASE_URL;

  if (!rawDatabaseUrl) return env;

  try {
    const databaseUrl = new URL(rawDatabaseUrl);
    if (databaseUrl.protocol === 'postgres:' || databaseUrl.protocol === 'postgresql:') {
      if (!databaseUrl.searchParams.has('connection_limit')) {
        databaseUrl.searchParams.set('connection_limit', '1');
      }
      if (!databaseUrl.searchParams.has('pool_timeout')) {
        databaseUrl.searchParams.set('pool_timeout', '60');
      }
      env.DATABASE_URL = databaseUrl.toString();
    }
  } catch {
    console.warn('[db:predeploy] DATABASE_URL could not be normalized; using the configured value unchanged.');
  }

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
  const prisma = new PrismaClient();
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
  while (true) {
    try {
      if (await tryAcquireLease()) {
        console.log('[db:predeploy] acquired deployment lease without holding an idle database connection.');
        return;
      }
    } catch (error) {
      if (!isConnectionPressure(error)) throw error;
      console.warn('[db:predeploy] database is at connection capacity; retrying lease acquisition.');
    }

    await wait(lockRetryMs);
  }
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
