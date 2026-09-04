export function assertRequiredDatabaseProvider(rawDatabaseUrl: string | undefined) {
  const requiredProvider = String(process.env.SULANDRA_DATABASE_PROVIDER || '').trim().toLowerCase();
  if (!requiredProvider) return;
  if (requiredProvider !== 'railway') {
    throw new Error(`Unsupported SULANDRA_DATABASE_PROVIDER value: ${requiredProvider}`);
  }
  if (!rawDatabaseUrl) {
    throw new Error('DATABASE_URL is required when SULANDRA_DATABASE_PROVIDER=railway');
  }

  let databaseUrl: URL;
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
}
