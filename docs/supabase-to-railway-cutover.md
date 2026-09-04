# Supabase to Railway PostgreSQL Cutover

## Scope and live inventory

This runbook migrates the Sulandra application database from Supabase PostgreSQL to managed Railway PostgreSQL without deleting or mutating the Supabase source.

The read-only inventory captured on 2026-09-04 found:

- 521 application tables in `public`.
- 85,314,707 bytes in the Supabase database at inventory time.
- 0 Supabase Storage buckets and 0 Supabase Storage objects.
- 0 Supabase Auth users.
- 0 Supabase Auth identities, sessions, and audit-log entries.
- 0 Supabase Edge Functions.
- 0 Supabase Vault secrets and 0 retained Realtime messages.
- 0 PostgreSQL large objects.
- 12,923,319 embedded file bytes in application `bytea` columns. These document and image bytes move with the PostgreSQL dump.
- 0 rows in the external secure-object reference tables checked during inventory.

The API's S3-compatible secure object storage is already configured independently through `EMPLOYEE_OBJECT_STORAGE_*`. This cutover must not replace or expose those credentials.

## Non-negotiable safety rules

1. Use a new managed Railway PostgreSQL database with an attached persistent volume. Do not use an unmounted image service as the target.
2. Keep the Supabase project active and unchanged as the Supabase rollback source through the observation window.
3. Put the production API into the repository's maintenance server before taking the final snapshot. The maintenance server does not connect to PostgreSQL and does not start background workers. Confirm no other database writer exists; the current Codebase E2E API uses its connection only for health and schema reads.
4. Never pass database URLs as command-line text in a ticket, commit, log message, or PR.
5. The target must be empty. The migration job refuses a non-empty target and never drops a schema or database.
6. Do not route production to Railway unless both normalized schema dumps and every exact table/content fingerprint match.
7. Do not pause or cancel Supabase until production verification and the rollback observation window are complete.

## Railway target prerequisite

In the production Railway project, provision PostgreSQL through **New → Database → PostgreSQL** and name it `sulandra-production-postgres`. The managed template creates its persistent volume and database credentials. Confirm its service configuration shows a volume mounted at `/var/lib/postgresql/data` and that its logs do not report a missing mount.

Enable Railway native volume backups before traffic is switched. Record the backup/PITR capability and retention in the release evidence.

## One-shot migration service

Deploy a temporary service from this repository and the approved cutover branch with:

- config file: `railway.database-cutover.json`
- restart policy: `NEVER`
- no public domain
- source URL: a secret Railway variable reference to the current API `DATABASE_URL`
- target URL: a secret Railway variable reference to `sulandra-production-postgres.DATABASE_URL`
- an optional Supabase IPv4 session-pooler host and username override

Required variables:

```text
SOURCE_DATABASE_URL=<secret reference to current API DATABASE_URL>
TARGET_DATABASE_URL=<secret reference to managed Railway PostgreSQL DATABASE_URL>
SOURCE_SUPABASE_PROJECT_REF=<approved 20-character project ref>
CUTOVER_EXPECTED_SOURCE_PUBLIC_TABLES=521
CUTOVER_CONFIRMATION=MIGRATE_SUPABASE_TO_RAILWAY
CUTOVER_SOURCE_QUIESCED=true
```

Set `CUTOVER_SOURCE_QUIESCED=true` only after the maintenance deployment is healthy and the previous API deployment is fully drained.

The job performs these actions in order:

1. Validates the exact Supabase source and a Railway-private target.
2. Refuses a non-empty target.
3. Reconfirms that Supabase Auth, Storage, Vault, retained Realtime messages, unexpected schemas, and PostgreSQL large objects are empty, and that public table column types are portable.
4. Captures a normalized source schema dump and exact per-table content hashes, including embedded binary data.
5. Creates an immutable custom-format PostgreSQL backup with SHA-256 evidence.
6. Restores into the empty Railway database with `pg_restore --exit-on-error`.
7. Captures the target schema and content hashes and requires byte-for-byte parity of both evidence sets.
8. Prints `IMPORT_VERIFIED` without changing production traffic.

## Write quiescence and routing

Temporarily change only the live API service:

```text
start command: node scripts/database-cutover-maintenance-server.mjs
pre-deploy command: none
healthcheck: /health
```

After Railway reports the maintenance deployment healthy, confirm normal API paths return `503` with `DATABASE_CUTOVER_MAINTENANCE`. Then run the one-shot migration service.

Only after `IMPORT_VERIFIED`:

1. Set the live API `DATABASE_URL` to the managed Railway PostgreSQL service reference.
2. Set `SULANDRA_DATABASE_PROVIDER=railway` so predeploy rejects a Supabase host.
3. Restore the API start command to `npm run start`.
4. Restore the pre-deploy command to `node scripts/run-db-predeploy.mjs`.
5. Set any obsolete `SULANDRA_SUPABASE_POOLER_HOST` variable to an empty value on every database-consuming service.
6. Point the Codebase E2E API at Railway PostgreSQL only if it is intended to share the production database; otherwise give it a separate Railway database.

The application also enforces the Railway-private hostname at runtime whenever `SULANDRA_DATABASE_PROVIDER=railway`; a mismatched provider fails startup rather than silently reconnecting to Supabase.

## Production verification

Required evidence before ending maintenance:

- Railway API deployment is successful and its Prisma log identifies `*.railway.internal`, never `supabase.co`.
- `/live` and `/health` return success.
- Employee and administrator authentication routes respond from the correct flows.
- Admin company context loads.
- Client Intake and SPIRE chart reads pass.
- A controlled create/update/delete smoke record succeeds on Railway and is removed through the application workflow.
- Embedded applicant documents, company documents, intake attachments, and chart profile images can be read and their stored hashes/sizes match.
- No production service variable name or log shows an active Supabase database/pooler dependency.
- Railway volume backup configuration is recorded.

## Rollback and retirement

If verification fails, return the API to maintenance, restore the original secret `DATABASE_URL` reference, remove `SULANDRA_DATABASE_PROVIDER=railway`, restore the normal start/predeploy commands, and redeploy. Do not write independently to both providers.

Keep Supabase unchanged for a minimum seven-day observation window. At the end of the window, take a final portable backup, verify Railway backups, re-run dependency and log searches, then pause the Supabase project. Cancellation or plan downgrade remains a separate owner billing action after the paused-project check succeeds.
