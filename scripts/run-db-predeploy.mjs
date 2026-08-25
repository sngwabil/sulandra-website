import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const node = process.execPath;
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
      if (!databaseUrl.searchParams.has('pool_timeout')) databaseUrl.searchParams.set('pool_timeout', '30');
      if (!databaseUrl.searchParams.has('connect_timeout')) databaseUrl.searchParams.set('connect_timeout', '10');
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
  const result = spawnSync(npm, ['run', scriptName], { stdio: 'inherit', env: childEnvironment() });
  if (result.status !== 0) throw new Error(`npm run ${scriptName} failed with exit code ${result.status ?? 'unknown'}`);
}

function runNodeScript(scriptPath) {
  console.log(`[db:predeploy] running node ${scriptPath}`);
  const result = spawnSync(node, [scriptPath], { stdio: 'inherit', env: childEnvironment() });
  if (result.status !== 0) throw new Error(`node ${scriptPath} failed with exit code ${result.status ?? 'unknown'}`);
}

function runPrismaResolve(migrationName) {
  console.log(`[db:predeploy] baselining Prisma migration ${migrationName}`);
  const result = spawnSync(npx, ['prisma', 'migrate', 'resolve', '--applied', migrationName], { stdio: 'inherit', env: childEnvironment() });
  if (result.status !== 0) throw new Error(`prisma migrate resolve --applied ${migrationName} failed with exit code ${result.status ?? 'unknown'}`);
}

async function baselineFreshLegacyDatabase(tx) {
  const migrationHistoryRows = await tx.$queryRawUnsafe(`SELECT to_regclass('public."_prisma_migrations"')::text AS "migrationHistory"`);
  if (migrationHistoryRows[0]?.migrationHistory) return;

  const baselineRows = await tx.$queryRawUnsafe(`
    SELECT
      to_regclass('public."Organization"')::text AS "organization",
      to_regclass('public."User"')::text AS "userTable",
      to_regclass('public."EmployeeApplication"')::text AS "employeeApplication",
      to_regclass('public."AuditEvent"')::text AS "auditEvent",
      to_regclass('public."JobOpening"')::text AS "jobOpening",
      to_regclass('public."ApplicantDocument"')::text AS "applicantDocument",
      to_regclass('public."ApplicantMessage"')::text AS "applicantMessage",
      to_regclass('public."InterviewOption"')::text AS "interviewOption"
  `);
  const baseline = baselineRows[0] ?? {};
  const legacyBasePresent = Boolean(baseline.organization && baseline.userTable && baseline.employeeApplication && baseline.auditEvent);
  if (!legacyBasePresent) return;

  const stagingGuarded = process.env.SULANDRA_STAGING_CANARY_BOOTSTRAP === '1' && process.env.SULANDRA_ENVIRONMENT === 'release-1.1-staging-canary';
  if (!stagingGuarded) throw new Error('[db:predeploy] refusing Prisma baseline outside the guarded release-1.1 staging canary environment.');

  const careersPipelinePresent = Boolean(baseline.jobOpening && baseline.applicantDocument && baseline.applicantMessage && baseline.interviewOption);
  if (!careersPipelinePresent) {
    console.log('[db:predeploy] legacy staging base detected without Prisma history, but the careers-pipeline relations are absent; leaving 20260728152000_careers_pipeline pending so Prisma creates them normally.');
    return;
  }

  console.log('[db:predeploy] complete legacy careers pipeline detected without Prisma history; resolving only the verified legacy baseline migration.');
  runPrismaResolve('20260728152000_careers_pipeline');
}

const datasourceUrl = constrainedDatabaseUrl(process.env.DATABASE_URL);
const prisma = datasourceUrl ? new PrismaClient({ datasourceUrl }) : new PrismaClient();

try {
  console.log('[db:predeploy] waiting for Sulandra PostgreSQL advisory lock...');
  await prisma.$transaction(
    async (tx) => {
      while (true) {
        const rows = await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS "locked"', lockNamespace, lockKey);
        if (rows[0]?.locked === true) break;
        await wait(lockRetryMs);
      }

      console.log('[db:predeploy] acquired deployment advisory lock.');
      runScript('db:check-prerequisites');
      await baselineFreshLegacyDatabase(tx);
      runNodeScript('scripts/reconcile-staging-careers-baseline.mjs');
      runScript('db:recover-failed-doo-migration');
      runScript('db:migrate:deploy');
      runNodeScript('scripts/verify-release-staging-parity.mjs');
      runNodeScript('scripts/check-home-health-regulated-core.mjs');
      runNodeScript('scripts/promote-pinned-oasis-e2-spec.mjs');
      runScript('db:verify-careers-schema');
      runNodeScript('scripts/verify-spire-route-registration.mjs');

      console.log('[db:predeploy] database predeploy completed successfully.');
    },
    { maxWait: 600000, timeout: 900000 },
  );
} finally {
  await prisma.$disconnect();
}
