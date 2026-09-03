/* SULANDRA_CODEBASE_DATABASE_POOLER_V1 */
const raw = String(process.env.DATABASE_URL || '').trim();
const poolerHost = String(process.env.SULANDRA_SUPABASE_POOLER_HOST || '').trim();

if (raw && poolerHost) {
  try {
    const databaseUrl = new URL(raw);
    const direct = databaseUrl.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (direct && /^[a-z0-9-]+\.pooler\.supabase\.com$/i.test(poolerHost)) {
      const projectRef = direct[1];
      const user = decodeURIComponent(databaseUrl.username || 'postgres');
      if (!user.endsWith(`.${projectRef}`)) databaseUrl.username = `${user}.${projectRef}`;
      const previous = databaseUrl.hostname;
      databaseUrl.hostname = poolerHost;
      databaseUrl.port = '5432';
      process.env.DATABASE_URL = databaseUrl.toString();
      console.info(`[codebase-e2e-api] Supabase IPv4 session pooler enabled: ${previous}:5432 -> ${poolerHost}:5432`);
    }
  } catch {
    console.warn('[codebase-e2e-api] DATABASE_URL pooler normalization skipped; configured URL could not be parsed.');
  }
}

await import('./server.mjs');
