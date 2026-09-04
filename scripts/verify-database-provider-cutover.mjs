import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const files = {
  cutover: await read('scripts/database-provider-cutover.sh'),
  maintenance: await read('scripts/database-cutover-maintenance-server.mjs'),
  dockerfile: await read('Dockerfile.database-cutover'),
  railway: await read('railway.database-cutover.json'),
  runbook: await read('docs/supabase-to-railway-cutover.md'),
  predeploy: await read('scripts/run-db-predeploy.mjs'),
  runtimeGuard: await read('api/src/database-provider-guard.ts'),
  runtimeEntry: await read('api/src/onboarding-bootstrap.ts'),
  workflow: await read('.github/workflows/database-provider-cutover.yml'),
};

const failures = [];
const requireMarkers = (source, markers, label) => {
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${label} missing: ${marker}`);
  }
};

requireMarkers(files.cutover, [
  'MIGRATE_SUPABASE_TO_RAILWAY',
  'CUTOVER_SOURCE_QUIESCED',
  'target public schema is not empty',
  'source host is not the explicitly approved Supabase project',
  'target host must use Railway private networking',
  'Supabase Auth contains',
  'Supabase Storage is not empty',
  'Supabase Vault contains',
  'Supabase Realtime contains',
  'source_unexpected_schemas',
  'source_nonportable_type_columns',
  '--schema=public',
  '--format=custom',
  '--no-owner',
  '--no-privileges',
  '--exit-on-error',
  '--use-list="$restore_list"',
  'default public schema entry',
  'sha256sum',
  'capture_inventory source',
  'capture_inventory target',
  'diff -u "$source_schema" "$target_schema"',
  'diff -u "$source_inventory" "$target_inventory"',
  'sourceModified": false',
  'trafficSwitched": false',
  'IMPORT_VERIFIED',
], 'cutover script');

requireMarkers(files.maintenance, [
  'database-cutover-maintenance',
  "database: 'quiesced'",
  'DATABASE_CUTOVER_MAINTENANCE',
  "'retry-after': '120'",
  'no database connection or background worker was started',
], 'maintenance server');

requireMarkers(files.dockerfile, [
  'FROM postgres:18-bookworm',
  'database-provider-cutover.sh',
  'ENTRYPOINT',
], 'cutover Dockerfile');

requireMarkers(files.railway, [
  'Dockerfile.database-cutover',
  'restartPolicyType',
  'NEVER',
], 'Railway cutover config');

requireMarkers(files.predeploy, [
  'SULANDRA_DATABASE_PROVIDER',
  "requiredProvider !== 'railway'",
  "databaseUrl.hostname.toLowerCase().endsWith('.railway.internal')",
  "['postgres:', 'postgresql:']",
], 'database provider guard');

requireMarkers(files.runtimeGuard, [
  'SULANDRA_DATABASE_PROVIDER',
  "requiredProvider !== 'railway'",
  "databaseUrl.hostname.toLowerCase().endsWith('.railway.internal')",
  "['postgres:', 'postgresql:']",
], 'runtime database provider guard');

requireMarkers(files.runtimeEntry, [
  "from './database-provider-guard.js'",
  'assertRequiredDatabaseProvider(process.env.DATABASE_URL)',
], 'runtime database provider guard wiring');

requireMarkers(files.runbook, [
  'Supabase rollback',
  '521',
  '12,923,319',
  'managed Railway PostgreSQL',
  'maintenance server',
  'Do not pause or cancel Supabase',
], 'cutover runbook');

requireMarkers(files.workflow, [
  'Database Provider Cutover Verification',
  'postgres:18',
  '-e CUTOVER_TEST_MODE=true',
  'MIGRATE_SUPABASE_TO_RAILWAY',
  'database-provider-cutover.sh',
  'Verify restored binary content',
], 'cutover workflow');

if (files.cutover.includes('set -x')) failures.push('cutover script must never enable shell tracing');
if (files.cutover.includes('DROP DATABASE')) failures.push('cutover script must not drop a database');
if (files.cutover.includes('DROP SCHEMA')) failures.push('cutover script must not drop a schema');
if (files.cutover.includes('DELETE FROM')) failures.push('cutover script must not delete source or target rows');

if (failures.length) {
  console.error(`Database provider cutover verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('Database provider cutover controls verified: fail-closed source/target guards, quiesced maintenance mode, immutable backup, schema/content parity, and Railway-only post-cutover enforcement are present.');
