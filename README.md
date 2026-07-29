# Sulandra Website and S.P.I.R.E. API

This repository contains the public Sulandra website and the production API used by
the unified Sulandra Employee Portal.

The product flow is:

1. Employee Portal
2. Employee or administrator signs in with their own account
3. Sulandra Desktop opens
4. S.P.I.R.E. appears only when the authenticated role has access to individual charts

S.P.I.R.E. is the clinical charting application inside the Sulandra desktop. It is
not a separate employee portal.

## Local API validation

```bash
npm ci
npm run db:generate
npm run check
```

Copy `.env.example` to `.env` for local development and provide real values. Never
commit `.env` or production secrets.

## Railway deployment

Railway must deploy from the repository root so it can use `Dockerfile`,
`railway.json`, the root npm workspace, and `prisma/`.

Required variables:

- `DATABASE_URL`
- `CLIENT_ORIGIN`
- `JWT_SECRET`
- `CAREERS_ORGANIZATION_ID`
- `PRIMARY_ADMIN_USER_ID`
- `ADMIN_INITIAL_PASSWORD`

`SULANDRA_INTERNAL_API_KEY` is required only for trusted service-to-service calls.
Use a different secret from `JWT_SECRET`.

The pre-deploy command first verifies the base schema and then runs
`prisma migrate deploy`. The target database must already contain the base S.P.I.R.E.
`Organization`, `User`, `EmployeeApplication`, and `AuditEvent` tables before the
careers and employee-credential migrations are applied. Deployment stops with a
clear error if any prerequisite is missing.

## Vercel deployment

`vercel.json` runs `npm run build:web` and publishes only `dist-web/`. The static
build copies the public website files and excludes API source, Prisma files,
deployment configuration, and environment files.

The public Employee Portal link opens the static `employee-login.html` page. That
page authenticates against the Railway API and stores the returned Bearer token
only for the current browser tab session.

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
  endpoint before promoting a deployment.
