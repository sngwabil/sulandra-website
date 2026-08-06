# Read Before Editing Build or Routing Scripts

The authoritative project workflow is [`../DEVELOPMENT_WORKFLOW.md`](../DEVELOPMENT_WORKFLOW.md).

## Non-negotiable rules

- Work on `feature/spire-ehr-platform`.
- Sulandra Static Website is the frontend and publishes `dist-web/`.
- sulandra-website is the backend API.
- Frontend HTML navigation stays on `https://www.sulandrahealth.com`.
- Browser code calls the backend through its explicit Railway API base.
- Resolve repository paths from `import.meta.url`; do not assume `process.cwd()` points to the repository root.
- A backend workspace script may run with `/app/api` as its current directory.
- Validate backend TypeScript/build and static output before completion.

Any script that copies, patches, injects, registers, or reroutes files must preserve the separation between the static frontend service and backend API service.
