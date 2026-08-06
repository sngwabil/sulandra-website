# Sulandra Website Development Workflow

> **READ THIS BEFORE EDITING OR DEPLOYING ANY PART OF THIS PROJECT.**

## Primary development branch

`feature/spire-ehr-platform` is the permanent primary development branch for this project.

All development work, fixes, features, routing changes, deployment changes, and build changes must be made on `feature/spire-ehr-platform` unless Sulpitius explicitly names a different branch.

Before any write operation:

1. Confirm the target repository is `sngwabil/sulandra-website`.
2. Confirm the target branch is `feature/spire-ehr-platform`.
3. Inspect the affected files and current build/deployment scripts before changing them.

## Production architecture

This repository serves two separate Railway services with different responsibilities.

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
- email delivery
- server-side validation
- audit logs
- server health endpoints

It is built with:

```bash
npm run build
```

The backend must not be used as the destination for frontend HTML navigation.

## Frontend-to-backend communication

Frontend pages call the Railway API using an explicit API base URL. Do not assume same-origin `/api` requests from the static website unless a verified proxy is intentionally configured.

New frontend code must preserve employee bearer-token authentication and send the token to the API where required.

## Required pre-edit checklist

Before editing:

- Identify whether the request is frontend, backend, or both.
- Inspect `package.json`, `api/package.json`, and the applicable build scripts.
- Inspect the current page, route, and navigation code rather than guessing paths.
- Confirm that a frontend page will be included in `dist-web/`.
- Confirm that an API route is registered in the backend bootstrap.
- Avoid broad click interceptors or global routing changes unless their effects have been reviewed across every portal.

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

For changes affecting both services, account for all three commands and verify the generated `dist-web/` output contains the intended frontend page and assets.

Do not describe work as complete merely because files were committed. A change is complete only after its service ownership, routing, build inclusion, and TypeScript compatibility have been checked.

## Safety rules

- Never expose secrets in frontend files.
- Never put backend-only environment values into the static bundle except intentionally public URLs.
- Never replace large working portal files without first fetching and reviewing the current branch version.
- Never change service ownership based on file names alone.
- Keep employee access available during incremental changes; avoid routing all related controls through an unverified global handler.
- Preserve authentication, role checks, audit logging, and organization isolation.

## Quick ownership decision

Ask these questions before coding:

1. Is this something the employee sees or clicks? It belongs to the Sulandra Static Website frontend.
2. Is this data, authentication, database, email, validation, or permissions? It belongs to the sulandra-website backend API.
3. Does it involve both? Build the page in the static frontend and the API in the backend, then connect them using the explicit API base.

This document is the authoritative workflow for future Sulandra website work.
