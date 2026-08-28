import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const poolMarker = 'SULANDRA_PRISMA_RUNTIME_POOL_V2';
const legacyPoolMarker = 'SULANDRA_PRISMA_RUNTIME_POOL_V1';
const timingMarker = 'SULANDRA_API_REQUEST_TIMING_V1';
const prismaAnchor = 'const app = express();\nconst prisma = new PrismaClient();';
const timingAnchor = "app.use(express.urlencoded({ extended: true, limit: '50mb' }));";

let source = await readFile(targetPath, 'utf8');

if (!source.includes(poolMarker)) {
  if (source.includes(legacyPoolMarker)) {
    source = source
      .replace(legacyPoolMarker, poolMarker)
      .replace(
        'const configuredLimit = Number(process.env.SULANDRA_PRISMA_CONNECTION_LIMIT || 2);',
        'const configuredLimit = Number(process.env.SULANDRA_PRISMA_CONNECTION_LIMIT || 5);',
      )
      .replace(
        '// SULANDRA_PRISMA_RUNTIME_POOL_V2: keep each long-running Railway API replica from exhausting Postgres connection slots.',
        '// SULANDRA_PRISMA_RUNTIME_POOL_V2: use a bounded but production-usable pool for each long-running API replica.',
      );
  } else {
    if (!source.includes(prismaAnchor)) {
      throw new Error('Prisma runtime pool anchor changed in onboarding-bootstrap.ts');
    }

    const replacement = `const app = express();
// ${poolMarker}: use a bounded but production-usable pool for each long-running API replica.
const runtimeDatabaseUrl = (() => {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const databaseUrl = new URL(raw);
    if (databaseUrl.protocol === 'postgres:' || databaseUrl.protocol === 'postgresql:') {
      const configuredLimit = Number(process.env.SULANDRA_PRISMA_CONNECTION_LIMIT || 5);
      const connectionLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 && configuredLimit <= 10
        ? configuredLimit
        : 5;
      if (!databaseUrl.searchParams.has('connection_limit')) {
        databaseUrl.searchParams.set('connection_limit', String(connectionLimit));
      }
      if (!databaseUrl.searchParams.has('pool_timeout')) {
        databaseUrl.searchParams.set('pool_timeout', '30');
      }
      console.info(\`[database] Prisma runtime pool configured: connection_limit=\${databaseUrl.searchParams.get('connection_limit')}, pool_timeout=\${databaseUrl.searchParams.get('pool_timeout')}s\`);
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

    source = source.replace(prismaAnchor, replacement);
  }

  console.log('Configured Prisma runtime pool with a default connection limit of 5.');
} else {
  console.log('Bounded Prisma runtime pool is already configured.');
}

if (!source.includes(timingMarker)) {
  if (!source.includes(timingAnchor)) {
    throw new Error('Express timing middleware anchor changed in onboarding-bootstrap.ts');
  }

  const timingMiddleware = `${timingAnchor}

// ${timingMarker}: measure API latency without logging query strings or request bodies.
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    if (!req.path.startsWith('/api/') && req.path !== '/health') return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const message = \`[perf] \${req.method} \${req.path} \${res.statusCode} \${durationMs.toFixed(1)}ms\`;
    if (durationMs >= 2_000) console.warn(message);
    else console.info(message);
  });
  next();
});`;

  source = source.replace(timingAnchor, timingMiddleware);
  console.log('Installed API request timing instrumentation.');
} else {
  console.log('API request timing instrumentation is already configured.');
}

await writeFile(targetPath, source, 'utf8');

// Keep the IT Agent education-status read path compatible with the live User schema
// before dev, typecheck, and production API builds compile the route.
await import('./fix-it-agent-education-status-name.mjs');
