# Sulandra Website Development Workflow

> **READ THIS BEFORE EDITING OR DEPLOYING ANY PART OF THIS PROJECT.**

## Version freeze and canonical development branch

**Sulandra 1.0 is frozen.** The exact production baseline is preserved on `release/sulandra-1.0` and Railway production services must remain pinned to that branch until an explicitly approved Sulandra 1.1 production promotion occurs.

`sulandra-1.1` is the canonical development/integration branch for all new Sulandra work. This applies to the complete platform from the public `index.html` through the Admin console, workforce/dispatch, financial modules, Client Intake, and S.P.I.R.E.

`feature/spire-ehr-platform` is now a historical predecessor branch. Do not use it for new production-bound development and do not repoint Railway production services back to it unless Sulpitius explicitly orders a rollback.

Before any write operation:

1. Confirm the target repository is `sngwabil/sulandra-website`.
2. Confirm production code is not being changed on `release/sulandra-1.0`.
3. Confirm new work targets `sulandra-1.1` directly or a PR branch created from `sulandra-1.1`.
4. Fetch and inspect the current branch version of every affected file before replacing it.
5. Inspect the applicable build, deployment, validation, database, security, and compliance scripts before changing behavior.
6. Do not merge Sulandra 1.1 work into the frozen production baseline unless Sulpitius explicitly approves the production promotion.

### Release governance

- `release/sulandra-1.0` = immutable Sulandra 1.0 production baseline / rollback target.
- `sulandra-1.1` = canonical Sulandra 1.1 integration branch.
- `pr/*` or task-specific branches = implementation branches created from `sulandra-1.1` and merged back only after required checks pass.
- GitHub branch protection for the frozen release and canonical development branch must require pull requests and required status checks; direct production pushes are not part of the approved workflow.
- Railway production must stay on `release/sulandra-1.0` while Sulandra 1.1 is under development. Sulandra 1.1 deployment must use a separate preview/staging path until formal promotion.

## System scope

The **Sulandra Admin console is the primary business operating control center**. S.P.I.R.E. is the clinical/client operational component of the broader Sulandra platform; it is not the entire website or business system.

Sulandra 1.1 must remain tenant-aware and white-label capable so a future buyer can supply company-specific identity, logos, contact information, legal-entity settings, and regulated configuration without forking the platform.

## Production architecture

This repository participates in **three Railway production services/deployments** with different responsibilities: one frontend and two backends. Do not mix their deployment configuration or ownership.

### Sulandra Static Website — only frontend

This is the employee-facing and public-facing website at:

`https://www.sulandrahealth.com`

It is the **only frontend** and owns:

- HTML pages
- CSS
- browser JavaScript
- employee and administrator portals
- S.P.I.R.E. pages
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

This is a Railway Express, Prisma, PostgreSQL, authentication, email, and business-logic backend service.

Current primary API base used by the static frontend:

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

### magnificent-education — backend deployment

The Railway project named `magnificent-education` also contains a Sulandra backend deployment. It is **backend infrastructure**, not the website frontend.

It follows backend ownership rules:

- Node/Express server code
- Prisma/PostgreSQL access
- authentication/authorization and business logic as configured for that deployment
- backend build and predeploy behavior
- no ownership of normal user-facing HTML navigation

Do not describe `magnificent-education` as a frontend/static website. Do not route browser page navigation to it as though it were the Sulandra Static Website.

When shared backend code or database migrations affect both backend deployments, verify the deployment result for **both** `sulandra-website` and the backend in `magnificent-education` before declaring the change complete.

## Frontend-to-backend communication

Frontend pages call an intentionally configured Railway backend API using an explicit API base URL. Do not assume same-origin `/api` requests from the static website unless a verified proxy is intentionally configured.

New frontend code must preserve employee bearer-token authentication and send the token to the API where required.

## Required pre-edit checklist

Before editing:

- Identify whether the request is frontend, backend, database, deployment, or a combination.
- Inspect `package.json`, `api/package.json`, and the applicable build scripts.
- Inspect the current page, route, and navigation code rather than guessing paths.
- Confirm that a frontend page will be included in `dist-web/`.
- Confirm that an API route is registered in the backend bootstrap.
- For deployment changes, inspect `railway.json` and `railway.frontend.json` and change only the service class that owns the behavior.
- Remember that backend changes may deploy to both `sulandra-website` and the backend in `magnificent-education`; inspect both resulting backend deployments when applicable.
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

For changes affecting both frontend and backend, account for all required commands and verify the generated `dist-web/` output contains the intended frontend page and assets.

For Prisma, migration, or database-predeploy changes, do not stop at TypeScript/build success. The GitHub CI migration-smoke job must also apply the complete ordered migration SQL chain successfully against the supported legacy PostgreSQL baseline and verify the expected platform tables.

For deployment changes, inspect the resulting GitHub checks and the Railway deployment for every affected service. A green Sulandra Static Website deployment does not prove either backend is healthy, and one green backend does not prove the other backend or the static frontend is healthy.

Do not describe work as complete merely because files were committed. A change is complete only after its service ownership, routing, build inclusion, TypeScript compatibility, relevant CI checks, and every affected Railway deployment have been checked.

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

1. Is this something the employee sees or clicks? It belongs to the **Sulandra Static Website frontend**.
2. Is this data, authentication, database, email, validation, permissions, or migration behavior? It belongs to a **backend deployment** (`sulandra-website` and/or the backend in `magnificent-education`, according to the configured service responsibility).
3. Does it involve frontend and backend? Build the page in the static frontend and the API in the backend, then connect them using the explicit API base.
4. Is it a database deployment concern? Keep it in the backend predeploy path and never add it to the static frontend service.

This document is the authoritative workflow for Sulandra 1.1 development and future production promotion.
