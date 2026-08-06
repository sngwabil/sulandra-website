# Contributing to Sulandra Website

Before making any change, read [`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md).

## Mandatory branch

The permanent primary development branch is:

```text
feature/spire-ehr-platform
```

All work must target that branch unless Sulpitius explicitly directs otherwise.

## Mandatory architecture check

Every request must be classified before coding:

- **Sulandra Static Website:** frontend pages, HTML, CSS, browser JavaScript, portals, and navigation.
- **sulandra-website:** backend API, Express, Prisma, PostgreSQL, authentication, email, permissions, and audit logging.

Frontend pages must route to `https://www.sulandrahealth.com` and call the backend through its explicit API base. Backend service URLs must not be used as HTML-page destinations.

## Mandatory validation

Run or account for the applicable commands before completion:

```bash
npm run typecheck
npm run build
npm run build:web
```

Build scripts must resolve paths from their own file location and must not assume `process.cwd()` is the repository root.

Do not mark a change complete until service ownership, routing, generated static output, backend registration, and TypeScript compatibility are verified.
