import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const marker = 'SULANDRA_PRISMA_RUNTIME_POOL_V1';
const anchor = 'const app = express();\nconst prisma = new PrismaClient();';

let source = await readFile(targetPath, 'utf8');

if (!source.includes(marker)) {
  if (!source.includes(anchor)) {
    throw new Error('Prisma runtime pool anchor changed in onboarding-bootstrap.ts');
  }

  const replacement = `const app = express();
// ${marker}: keep each long-running Railway API replica from exhausting Postgres connection slots.
const runtimeDatabaseUrl = (() => {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const databaseUrl = new URL(raw);
    if (databaseUrl.protocol === 'postgres:' || databaseUrl.protocol === 'postgresql:') {
      const configuredLimit = Number(process.env.SULANDRA_PRISMA_CONNECTION_LIMIT || 2);
      const connectionLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 && configuredLimit <= 10
        ? configuredLimit
        : 2;
      if (!databaseUrl.searchParams.has('connection_limit')) {
        databaseUrl.searchParams.set('connection_limit', String(connectionLimit));
      }
      if (!databaseUrl.searchParams.has('pool_timeout')) {
        databaseUrl.searchParams.set('pool_timeout', '30');
      }
      return databaseUrl.toString();
    }
  } catch {
    console.warn('[database] DATABASE_URL could not be normalized for runtime pool limiting; using configured value unchanged.');
  }

  return raw;
})();
const prisma = runtimeDatabaseUrl
  ? new PrismaClient({ datasourceUrl: runtimeDatabaseUrl })
  : new PrismaClient();`;

  source = source.replace(anchor, replacement);
  await writeFile(targetPath, source, 'utf8');
  console.log('Configured bounded Prisma runtime pool for Railway API replicas.');
} else {
  console.log('Bounded Prisma runtime pool is already configured.');
}
