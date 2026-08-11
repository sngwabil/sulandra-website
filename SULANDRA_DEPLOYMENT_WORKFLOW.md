# Sulandra Website Deployment Workflow

This repository uses **three Railway production services/deployments** with different responsibilities: one static frontend and two backend deployments. Keep this separation intact for every future change.

## Branch rule

- Do all development on `feature/spire-ehr-platform` unless the owner explicitly requests another branch.
- Do not commit directly to `main`.
- Do not merge to `main` without explicit approval.

## Service architecture

### Sulandra Static Website — only frontend

This service publishes the user-facing website at `https://www.sulandrahealth.com`.

It is the **only frontend**.

Frontend files belong at the repository root or in public frontend directories, including:

- HTML pages
- Browser JavaScript
- CSS
- Images and other public assets
- Employee and admin portal pages
- S.P.I.R.E. pages
- Time and Attendance frontend

Examples:

- `spire.html`
- `time-attendance.html`
- `employee-portal.html`
- `admin.html`
- `desktop.html`
- `employee-desktop.html`

The static build is produced by:

- `npm run build:web`
- `scripts/build-static-site.mjs`
- Output directory: `dist-web`

Any new frontend page or asset must be copied into `dist-web` by the static build and must be tested using its final public URL.

The frontend Railway service must use the frontend/static deployment configuration, including `railway.frontend.json` and `Dockerfile.frontend`. It must not run Prisma migrations, database recovery, or the backend database predeploy sequence.

### sulandra-website — backend API

This is a Railway Express/Prisma backend API. The primary API base currently used by the static frontend is:

`https://sulandra-website-production-5fc4.up.railway.app`

Backend code belongs in:

- `api/src/`
- `prisma/`
- backend build/install scripts

The backend must not be used to serve normal frontend HTML pages.

### magnificent-education — backend deployment

The Railway project named `magnificent-education` also hosts a Sulandra backend deployment. It is a backend, not a frontend/static website.

It follows the backend deployment path and backend-only ownership rules. When a shared backend code or database change applies to both backend deployments, both Railway backend deployments must be checked before the work is considered complete.

### Backend rules

- Backend deployments use the Node/Express/Prisma build path.
- Backend deployments own API routes, authentication, authorization, database access, email/business logic, migrations, audit logs, and health endpoints as configured.
- Backend deployments must not be destinations for normal HTML navigation.
- Database migration/predeploy work is backend-only.
- Do not identify `magnificent-education` as the website frontend.

Frontend pages should call an intentionally configured backend explicitly rather than relying on same-origin `/api` calls unless a verified proxy is intentionally configured.

## Routing rules

- User-facing links must route to the Sulandra Static Website frontend domain.
- Example: `https://www.sulandrahealth.com/time-attendance.html`
- Admin functionality may use a hash or query on that same frontend page, such as `#admin`.
- API calls from frontend pages must target the intentionally configured Railway backend URL.
- Never route a frontend button directly to either backend service unless it is intentionally calling an API endpoint.

## Build-script path rule

Workspace scripts may execute with `process.cwd()` set to `/app/api` instead of the repository root.

Therefore:

- Do not assume `process.cwd()` is the repository root inside scripts called from workspace builds.
- Resolve repository paths from `import.meta.url` and the script file location.
- A script under `/scripts` should normally derive the repository root with `fileURLToPath(import.meta.url)` and `path.resolve(..., '..')`.
- Verify the resulting path before committing.

Correct target example:

`/app/api/src/time-attendance-routes.ts`

Incorrect doubled path:

`/app/api/api/src/time-attendance-routes.ts`

## Required verification before considering work complete

1. Confirm the active branch is `feature/spire-ehr-platform`.
2. Identify whether the change is frontend, backend, database, or a combination.
3. Put frontend files in the Sulandra Static Website build.
4. Put API routes in backend services only.
5. Confirm frontend API base points to the intended Railway backend URL.
6. Run or inspect both build paths:
   - `npm run build`
   - `npm run build:web`
7. Check for TypeScript errors.
8. Check for missing files and incorrect script paths.
9. Confirm the public frontend URL resolves instead of downloading `.txt` or returning 404.
10. For backend/shared changes, verify both `sulandra-website` and the backend deployment in `magnificent-education` when affected.
11. Confirm no change was made to `main`.

## Time and Attendance-specific rule

- Frontend: `time-attendance.html` on Sulandra Static Website.
- Backend: `/api/time-attendance/*` and `/api/admin/time-attendance/*` on the intentionally configured Railway backend.
- All portal Time and Attendance, Clock In/Out, Time Card, Timesheet, Scheduling, and Scheduler buttons should open the static frontend page.
- The static page must call the backend API URL explicitly.

## S.P.I.R.E.-specific rule

- Frontend: `spire.html` and all browser SPIRE assets are published by Sulandra Static Website.
- Backend: `/api/spire/*` and SPIRE database/audit behavior run on backend infrastructure.
- SPIRE must fit inside the browser viewport and must not allow top navigation or action controls to force the clinical workspace wider than the screen.
- Service-home selection remains the protected entry boundary before patient-bearing data is loaded.

This file is the canonical deployment workflow note for future Sulandra website work.
