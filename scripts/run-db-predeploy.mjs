import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const lockNamespace = 1936749168;
const lockKey = 20260810;
const lockRetryMs = 1500;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function runScript(scriptName) {
  console.log(`[db:predeploy] running npm run ${scriptName}`);
  const result = spawnSync(npm, ['run', scriptName], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`npm run ${scriptName} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

try {
  console.log('[db:predeploy] waiting for Sulandra deployment advisory lock...');
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
