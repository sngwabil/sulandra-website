# Sulandra Website and SPIRE API

This repository contains the Sulandra website and the production SPIRE careers API.

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

`SULANDRA_INTERNAL_API_KEY` is required only for trusted service-to-service calls.
Use a different secret from `JWT_SECRET`.

The pre-deploy command first verifies the base schema and then runs
`prisma migrate deploy`. The target database must already contain the base SPIRE
`Organization`, `User`, `EmployeeApplication`, and `AuditEvent` tables before the
careers pipeline migration is applied. Deployment stops with a clear error if any
of these prerequisites are missing.

## Vercel deployment

`vercel.json` runs `npm run build:web` and publishes only `dist-web/`. The static
build copies the public website files and excludes API source, Prisma files,
deployment configuration, and environment files.

## Authentication

Employee requests use `Authorization: Bearer <token>`. Tokens must be signed with
HS256 using `JWT_SECRET` and contain:

```json
{
  "sub": "existing-user-id",
  "organizationId": "existing-organization-id",
  "role": "ADMINISTRATOR",
  "exp": 1785272400
}
```

Roles and organization IDs are taken only from verified token claims. Trusted
internal callers can instead use `x-sulandra-api-key` and the internal identity
headers.

## Health endpoints

- `GET /live` confirms that the Node process is accepting requests.
- `GET /health` confirms that the API can connect to PostgreSQL. Railway uses this
  endpoint before promoting a deployment.
