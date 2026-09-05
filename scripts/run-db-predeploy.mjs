import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const lockNamespace = 1936749168;
const lockKey = 20260810;
const lockRetryMs = 1500;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function constrainedDatabaseUrl(rawDatabaseUrl) {
  if (!rawDatabaseUrl) return rawDatabaseUrl;

  try {
    const databaseUrl = new URL(rawDatabaseUrl);
    if (databaseUrl.protocol === 'postgres:' || databaseUrl.protocol === 'postgresql:') {
      databaseUrl.searchParams.set('connection_limit', '1');
      if (!databaseUrl.searchParams.has('pool_timeout')) {
        databaseUrl.searchParams.set('pool_timeout', '30');
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

function assertRequiredDatabaseProvider(rawDatabaseUrl) {
  const requiredProvider = String(process.env.SULANDRA_DATABASE_PROVIDER || '').trim().toLowerCase();
  if (!requiredProvider) return;
  if (requiredProvider !== 'railway') {
    throw new Error(`Unsupported SULANDRA_DATABASE_PROVIDER value: ${requiredProvider}`);
  }
  if (!rawDatabaseUrl) {
    throw new Error('DATABASE_URL is required when SULANDRA_DATABASE_PROVIDER=railway');
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol');
  }
  if (!databaseUrl.hostname.toLowerCase().endsWith('.railway.internal')) {
    throw new Error('SULANDRA_DATABASE_PROVIDER=railway requires a Railway private-network DATABASE_URL');
  }
  console.log('[db:predeploy] Railway PostgreSQL provider guard passed.');
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

assertRequiredDatabaseProvider(process.env.DATABASE_URL);
const datasourceUrl = constrainedDatabaseUrl(process.env.DATABASE_URL);
const prisma = datasourceUrl
  ? new PrismaClient({ datasourceUrl })
  : new PrismaClient();

try {
  console.log('[db:predeploy] waiting for Sulandra PostgreSQL advisory lock...');
  await prisma.$transaction(
    async (tx) => {
      while (true) {
        const rows = await tx.$queryRawUnsafe(
          'SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS "locked"',
          lockNamespace,
          lockKey,
        );

        if (rows[0]?.locked === true) {
          break;
        }

        await wait(lockRetryMs);
      }

      console.log('[db:predeploy] acquired deployment advisory lock.');

      runScript('db:check-prerequisites');
      runScript('db:recover-failed-doo-migration');
      runScript('db:migrate:deploy');
      runScript('db:verify-careers-schema');

      console.log('[db:predeploy] database predeploy completed successfully.');
    },
    {
      maxWait: 600000,
      timeout: 900000,
    },
  );
} finally {
  await prisma.$disconnect();
}
