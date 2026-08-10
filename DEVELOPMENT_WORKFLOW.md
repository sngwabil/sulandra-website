# Sulandra Website Development Workflow

> **READ THIS BEFORE EDITING OR DEPLOYING ANY PART OF THIS PROJECT.**

## Primary development branch

`feature/spire-ehr-platform` is the permanent primary development branch for this project.

All development work, fixes, features, routing changes, deployment changes, database changes, migration changes, and build changes must be made on `feature/spire-ehr-platform` unless Sulpitius explicitly names a different branch.

Before any write operation:

1. Confirm the target repository is `sngwabil/sulandra-website`.
2. Confirm the target branch is `feature/spire-ehr-platform`.
3. Fetch and inspect the current branch version of every affected file before replacing it.
4. Inspect the applicable build, deployment, validation, and database scripts before changing behavior.
5. Do not merge to `main` unless Sulpitius explicitly requests that merge.

## Production architecture

This repository serves two separate Railway services with different responsibilities. Do not mix their deployment configuration or ownership.

### Sulandra Static Website — frontend

This is the employee-facing and public-facing website at:

`https://www.sulandrahealth.com`

It owns:

- HTML pages
- CSS
- browser JavaScript
- employee and administrator portals
- navigation
- Time and Attendance screens
- education screens
- public careers pages
- all other user-facing pages

The static service is built with:

```bash
npm run build:web
```

Only files copied into `dist-web/` by `scripts/build-static-site.mjs` are published by this service.

The frontend Railway service must use the frontend/static deployment configuration, including `railway.frontend.json` and `Dockerfile.frontend`. It must not run Prisma migrations, database recovery, or the backend database predeploy sequence.

Frontend links must remain on the static website. For example:

```text
https://www.sulandrahealth.com/time-attendance.html
```

Do not route users to a backend Railway service URL for an HTML page.

### sulandra-website — backend API

This is the Express, Prisma, PostgreSQL, authentication, email, and business-logic service.

Current API base:

`https://sulandra-website-production-5fc4.up.railway.app`

It owns:

- `/api/*` endpoints
- `/public/*` API endpoints
- authentication and authorization
- Prisma/database access
- database migrations and migration recovery
- email delivery
- server-side validation
- audit logs
- server health endpoints

It is built with:

```bash
npm run build
```

The backend Railway service uses `railway.json` and `Dockerfile`. Its database predeploy entrypoint is:

```bash
npm run db:predeploy
```

which must route through `scripts/run-db-predeploy.mjs`.

The backend must not be used as the destination for frontend HTML navigation.

## Frontend-to-backend communication

Frontend pages call the Railway API using an explicit API base URL. Do not assume same-origin `/api` requests from the static website unless a verified proxy is intentionally configured.

New frontend code must preserve employee bearer-token authentication and send the token to the API where required.

## Required pre-edit checklist

Before editing:

- Identify whether the request is frontend, backend, database, deployment, or a combination.
- Inspect `package.json`, `api/package.json`, and the applicable build scripts.
- Inspect the current page, route, and navigation code rather than guessing paths.
- Confirm that a frontend page will be included in `dist-web/`.
- Confirm that an API route is registered in the backend bootstrap.
- For deployment changes, inspect both `railway.json` and `railway.frontend.json` and change only the service that owns the behavior.
- For Prisma or database changes, inspect `prisma/schema.prisma`, the affected migration history, `scripts/run-db-predeploy.mjs`, `scripts/recover-failed-doo-migration.mjs`, and database verification scripts before writing.
- Avoid broad click interceptors or global routing changes unless their effects have been reviewed across every portal.

## Database and migration workflow

Database deployment is backend-only. The complete backend predeploy sequence must remain serialized so multiple Railway backend deployments cannot recover or migrate the same PostgreSQL database concurrently.

The required sequence is:

1. Acquire the Sulandra PostgreSQL advisory lock.
2. Verify database prerequisites.
3. Recover only specifically recognized failed Prisma migration states.
4. Run `prisma migrate deploy`.
5. Run the post-migration schema verification.
6. Release the advisory lock automatically when the predeploy transaction ends.

Rules for database work:

- Prefer additive, backward-compatible migrations when existing production tables or data are already in use.
- Once any shared, staging, or production database has recorded a migration as applied, never edit that migration to repair drift or add omitted SQL. Create a new, later additive repair migration so Prisma history and checksums remain trustworthy.
- Make retry-sensitive migrations safe against a partially completed prior attempt when practical.
- Never drop, truncate, overwrite, or recreate existing production data merely to make a migration pass unless the data impact has been explicitly reviewed and approved.
- Do not mark a migration rolled back unless the recovery script has positively identified an unfinished failed migration record.
- Do not bypass Prisma migration history in production with manual SQL as a normal deployment method.
- Preserve organization and legal-entity isolation, foreign-key integrity, audit history, and existing API compatibility.
- If two generations of a schema already exist, reconcile them additively instead of silently breaking the older live route family.

## Build-script path rule

Scripts must resolve repository paths from the script file's own location using `import.meta.url` and `fileURLToPath`.

Do not assume `process.cwd()` is the repository root. Workspace scripts may execute with `/app/api` as the current directory, which can accidentally produce paths such as:

```text
/app/api/api/src/...
```

## Required validation before declaring completion

For backend or shared changes, validate:

```bash
npm run typecheck
npm run build
```

For frontend changes, validate:

```bash
npm run build:web
```

For broad or release-ready changes, run:

```bash
npm run check
```

For changes affecting both services, account for all required commands and verify the generated `dist-web/` output contains the intended frontend page and assets.

For Prisma, migration, or database-predeploy changes, do not stop at TypeScript/build success. The GitHub CI migration-smoke job must also apply the complete ordered migration SQL chain successfully against the supported legacy PostgreSQL baseline and verify the expected platform tables.

For deployment changes, inspect the resulting GitHub checks and the Railway deployment for the affected service. A green static frontend deployment does not prove the backend is healthy, and a healthy backend does not prove the static frontend bundle is correct.

Do not describe work as complete merely because files were committed. A change is complete only after its service ownership, routing, build inclusion, TypeScript compatibility, relevant CI checks, and affected Railway deployment have been checked.

## Safety rules

- Never expose secrets in frontend files, logs, commits, or documentation.
- Never put backend-only environment values into the static bundle except intentionally public URLs.
- Never replace large working portal files without first fetching and reviewing the current branch version.
- Never change service ownership based on file names alone.
- Keep employee access available during incremental changes; avoid routing all related controls through an unverified global handler.
- Preserve authentication, role checks, audit logging, organization isolation, and legal-entity boundaries.
- Do not treat an old green Railway deployment as proof that the newest commit deployed successfully; verify the deployment attached to the current commit.
- Do not declare a database problem fixed when the predeploy process has not yet reached and completed the migration sequence.

## Quick ownership decision

Ask these questions before coding:

1. Is this something the employee sees or clicks? It belongs to the Sulandra Static Website frontend.
2. Is this data, authentication, database, email, validation, permissions, or migration behavior? It belongs to the sulandra-website backend API.
3. Does it involve both? Build the page in the static frontend and the API in the backend, then connect them using the explicit API base.
4. Is it a database deployment concern? Keep it in the backend predeploy path and never add it to the static frontend service.

This document is the authoritative workflow for future Sulandra website work.
