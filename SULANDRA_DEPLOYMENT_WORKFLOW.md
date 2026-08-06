# Sulandra Website Deployment Workflow

This repository uses two separate Railway services with different responsibilities. Keep this separation intact for every future change.

## Branch rule

- Do all development on `feature/spire-ehr-platform` unless the owner explicitly requests another branch.
- Do not commit directly to `main`.
- Do not merge to `main` without explicit approval.

## Service architecture

### Sulandra Static Website — frontend

This service publishes the user-facing website at `https://www.sulandrahealth.com`.

Frontend files belong at the repository root or in public frontend directories, including:

- HTML pages
- Browser JavaScript
- CSS
- Images and other public assets
- Employee and admin portal pages
- Time and Attendance frontend

Examples:

- `time-attendance.html`
- `employee-portal.html`
- `admin.html`
- `desktop.html`
- `employee-desktop.html`

The static build is produced by:

- `npm run build:web`
- `scripts/build-static-site.mjs`
- Output directory: `dist-web`

Any new frontend page must be copied into `dist-web` by the static build and must be tested using its final public URL.

### sulandra-website — backend API

This service is the Express/Prisma API at:

`https://sulandra-website-production-5fc4.up.railway.app`

Backend code belongs in:

- `api/src/`
- `prisma/`
- backend build/install scripts

The backend must not be used to serve normal frontend HTML pages.

Frontend pages should call this backend explicitly rather than relying on same-origin `/api` calls.

## Routing rules

- User-facing links must route to the static frontend domain.
- Example: `https://www.sulandrahealth.com/time-attendance.html`
- Admin functionality may use a hash or query on that same frontend page, such as `#admin`.
- API calls from frontend pages must target the Railway backend URL.
- Never route a frontend button directly to the backend service unless it is intentionally calling an API endpoint.

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
2. Identify whether the change is frontend, backend, or both.
3. Put frontend files in the static website build.
4. Put API routes in the backend service only.
5. Confirm frontend API base points to the backend Railway URL.
6. Run or inspect both build paths:
   - `npm run build`
   - `npm run build:web`
7. Check for TypeScript errors.
8. Check for missing files and incorrect script paths.
9. Confirm the public frontend URL resolves instead of downloading `.txt` or returning 404.
10. Confirm no change was made to `main`.

## Time and Attendance-specific rule

- Frontend: `time-attendance.html` on Sulandra Static Website.
- Backend: `/api/time-attendance/*` and `/api/admin/time-attendance/*` on sulandra-website.
- All portal Time and Attendance, Clock In/Out, Time Card, Timesheet, Scheduling, and Scheduler buttons should open the static frontend page.
- The static page must call the backend API URL explicitly.

This file is the canonical workflow note for future Sulandra website work.
