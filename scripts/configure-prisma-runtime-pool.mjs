import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const poolMarker = 'SULANDRA_PRISMA_RUNTIME_POOL_V3';
const legacyPoolMarkerV2 = 'SULANDRA_PRISMA_RUNTIME_POOL_V2';
const legacyPoolMarkerV1 = 'SULANDRA_PRISMA_RUNTIME_POOL_V1';
const timingMarker = 'SULANDRA_API_REQUEST_TIMING_V1';
const prismaAnchor = 'const app = express();\nconst prisma = new PrismaClient();';
const timingAnchor = "app.use(express.urlencoded({ extended: true, limit: '50mb' }));";

let source = await readFile(targetPath, 'utf8');

const runtimePoolBlock = `const app = express();
// ${poolMarker}: use a bounded production pool and optionally bridge IPv4-only Railway services to Supabase Session Pooler.
const runtimeDatabaseUrl = (() => {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const databaseUrl = new URL(raw);
    if (databaseUrl.protocol === 'postgres:' || databaseUrl.protocol === 'postgresql:') {
      const poolerHost = process.env.SULANDRA_SUPABASE_POOLER_HOST?.trim();
      const directSupabase = databaseUrl.hostname.match(/^db\\.([a-z0-9]+)\\.supabase\\.co$/i);

      if (poolerHost && directSupabase) {
        if (!/^[a-z0-9-]+\\.pooler\\.supabase\\.com$/i.test(poolerHost)) {
          console.warn('[database] SULANDRA_SUPABASE_POOLER_HOST is not a recognized Supabase pooler hostname; direct DATABASE_URL left unchanged.');
        } else {
          const projectRef = directSupabase[1];
          const databaseUser = decodeURIComponent(databaseUrl.username || 'postgres');
          if (!databaseUser.endsWith(\`.\${projectRef}\`)) {
            databaseUrl.username = \`\${databaseUser}.\${projectRef}\`;
          }
          const directHost = databaseUrl.hostname;
          databaseUrl.hostname = poolerHost;
          databaseUrl.port = '5432';
          console.info(\`[database] Supabase IPv4 session pooler enabled: \${directHost}:5432 -> \${poolerHost}:5432\`);
        }
      }

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

if (!source.includes(poolMarker)) {
  if (source.includes(legacyPoolMarkerV2) || source.includes(legacyPoolMarkerV1)) {
    const blockPattern = /const app = express\(\);\n\/\/ SULANDRA_PRISMA_RUNTIME_POOL_V[12]:[\s\S]*?const prisma = runtimeDatabaseUrl\n  \? new PrismaClient\(\{ datasourceUrl: runtimeDatabaseUrl \}\)\n  : new PrismaClient\(\);/;
    if (!blockPattern.test(source)) {
      throw new Error('Legacy Prisma runtime pool block changed in onboarding-bootstrap.ts');
    }
    source = source.replace(blockPattern, runtimePoolBlock);
  } else {
    if (!source.includes(prismaAnchor)) {
      throw new Error('Prisma runtime pool anchor changed in onboarding-bootstrap.ts');
    }
    source = source.replace(prismaAnchor, runtimePoolBlock);
  }

  console.log('Configured Prisma runtime pool with optional Supabase IPv4 Session Pooler bridge and a default connection limit of 5.');
} else {
  console.log('Bounded Prisma runtime pool and optional Supabase IPv4 Session Pooler bridge are already configured.');
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