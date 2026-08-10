# Sulandra Website and S.P.I.R.E. API

> **STOP: Read [`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md) before editing this repository.**
>
> The permanent primary development branch is `feature/spire-ehr-platform`.
> The **Sulandra Static Website** is the frontend, while **sulandra-website** is the backend API. Do not mix their routing, deployment, database, or build responsibilities.

This repository contains the public Sulandra website and the production API used by
the unified Sulandra Employee Portal.

The product flow is:

1. Employee Portal
2. Employee or administrator signs in with their own account
3. Sulandra Desktop opens
4. S.P.I.R.E. appears only when the authenticated role has access to individual charts

S.P.I.R.E. is the clinical charting application inside the Sulandra desktop. It is
not a separate employee portal.

## Local validation

```bash
npm ci
npm run db:generate
npm run check
```

Copy `.env.example` to `.env` for local development and provide real values. Never
commit `.env` or production secrets.

## Railway production services

This repository deploys two different Railway services. Read
`DEVELOPMENT_WORKFLOW.md` before changing either deployment.

### Backend API — sulandra-website

The backend service deploys from the repository root using `Dockerfile` and
`railway.json`. It owns Express, Prisma, authentication, email, database access,
and all `/api/*` and `/public/*` API routes.

Required variables include:

- `DATABASE_URL`
- `CLIENT_ORIGIN`
- `JWT_SECRET`
- `CAREERS_ORGANIZATION_ID`
- `PRIMARY_ADMIN_USER_ID`
- `ADMIN_INITIAL_PASSWORD`

`SULANDRA_INTERNAL_API_KEY` is required only for trusted service-to-service calls.
Use a different secret from `JWT_SECRET`.

The backend database predeploy runs through:

```bash
npm run db:predeploy
```

That command uses `scripts/run-db-predeploy.mjs` to serialize database deployment
across competing backend deployments, verify the supported base schema, recover
only recognized unfinished failed Prisma migration attempts, run
`prisma migrate deploy`, and perform post-migration schema verification.

The target database must already contain the supported legacy S.P.I.R.E. base
schema, including the required `Organization`, `User`, `EmployeeApplication`, and
`AuditEvent` prerequisites. Deployment stops if required prerequisites are missing.

### Frontend — Sulandra Static Website

The static frontend service uses `Dockerfile.frontend` and
`railway.frontend.json`. It builds with:

```bash
npm run build:web
```

Only `dist-web/` is served by the static container. The frontend deployment must
not run Prisma migrations, database recovery, or the backend predeploy sequence.

The public Employee Portal link opens the static `employee-login.html` page. That
page authenticates against the Railway backend API and stores the returned Bearer
token only for the current browser tab session.

## CI and migration validation

GitHub CI validates the API and website build and also runs the ordered Prisma SQL
migration history against a disposable PostgreSQL 16 database initialized with the
supported legacy S.P.I.R.E. baseline. Migration changes should not be considered
ready for deployment until that migration-smoke job reaches the end of the chain
and verifies the expected platform tables.

## Employee authentication and routing

`POST /api/auth/login` accepts `email`, `username`, or `identifier` plus
`password`. The API resolves the matching `User`, verifies the employee's scrypt
credential, and issues an eight-hour HS256 bearer token containing the employee's
own user ID, organization ID, and role.

Every successful login returns `landingRoute: "/desktop"`. It also returns an
`access` object, `permissions`, and the enabled `apps` for the employee.

| Employee role | Sulandra Desktop | S.P.I.R.E. charts |
| --- | --- | --- |
| Administrator, CEO, Program Manager | Yes | Read/write |
| DSP, House Manager | Yes | Read/write |
| Delegating Nurse, RN, LPN | Yes | Read/write |
| Auditor | Yes | Read-only |
| HR, Scheduler, Billing, Administrative Assistant | Yes | No chart access |

The API enforces this mapping through `GET /api/spire/access`; the frontend should
hide the S.P.I.R.E. app when `access.spire.enabled` is false.

Administrators provision or reset an existing employee's portal credential with:

```http
POST /api/admin/portal-credentials
Authorization: Bearer <administrator-token>
Content-Type: application/json

{
  "userId": "existing-user-id",
  "username": "employee.username",
  "temporaryPassword": "at-least-12-characters",
  "displayName": "Employee Name"
}
```

The endpoint can receive `email` instead of `userId`. The equivalent
`PUT /api/admin/users/:userId/credentials` route is also supported. Passwords are
salted and hashed; plaintext passwords are never stored or returned. Five failed
attempts lock the account for fifteen minutes.

Employee requests use `Authorization: Bearer <token>`. Trusted internal callers can
instead use `x-sulandra-api-key` and the internal identity headers.

## Health endpoints

- `GET /live` confirms that the Node process is accepting requests.
- `GET /health` confirms that the API can connect to PostgreSQL. Railway uses this
  endpoint before promoting a backend deployment.
