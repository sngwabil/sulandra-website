# Sulandra Health website and S.P.I.R.E. API

This repository deploys two coordinated services:

- Vercel builds the static public, applicant, employee, education, and administration pages into `dist-web`.
- Railway builds the Node 22/Express API and applies PostgreSQL migrations before startup.

The browser uses same-origin `/api/*` and `/public/*` URLs. Vercel proxies those requests to the Railway API configured in `vercel.json`.

## Local validation

Use Node 22 and a non-production PostgreSQL connection string:

```sh
npm ci --include=dev
npm run db:generate
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/spire npm run check
npm run build:web
```

`npm run check` validates the Prisma schema, type-checks and builds the API, runs regression tests, and checks links in production pages. `npm run build:web` creates the deployable `dist-web` directory without modifying source files.

## Deployment safeguards

- Never commit `.env` files or production credentials.
- Railway must provide the variables documented in `.env.example`.
- Database migrations run through `npm run db:predeploy` before API startup.
- Frontend actions must not report success until a production endpoint confirms persistence.
