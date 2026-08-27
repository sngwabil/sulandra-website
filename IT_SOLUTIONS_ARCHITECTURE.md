# Sulandra IT Solutions Architecture

## Mission
Sulandra IT Solutions is the internal IT operations, support, diagnostics, and controlled-remediation center for every Sulandra company and application. It is not limited to timekeeping. It covers meaningful user actions and failures from sign-in through sign-out across the Sulandra Static Website, Employee Portal, Admin, Company Operations, Employee 360, careers/onboarding, scheduling, timekeeping, S.P.I.R.E., SCLS, Home Health, NMT, EVV, billing, education, documents, communications, integrations, and backend services.

## Core operating model
Every case follows the same chain:

`User -> Company -> Application -> Page/Module -> Workflow -> Step -> Action -> System response -> Outcome -> Evidence -> Triage -> Resolution/Approval -> Verification -> Archive`

Clock-in/geofence evidence is one evidence source only. The same model applies to login, logout, navigation, form submission, approvals, scheduling, SPIRE workflow operations, EVV, billing, documents, integrations, API failures, permissions, deployment/runtime errors, and all other Sulandra workflows.

## IT operations center
The Admin IT Solutions portal is organized as an internal IT-company command center with:

1. **Operations overview** — open incidents, service health, SLA/risk, active remote-assist sessions, pending approvals, recent production failures, and recent resolutions.
2. **Incident queue** — employee, admin, SIA, automated-monitoring, deployment, integration, and security-originated cases.
3. **System diagnostics** — sanitized browser/runtime evidence, API status, workflow state, service/deployment health, integration status, build/CI failures, correlation IDs, and timestamps.
4. **Remote assistance** — employee-initiated, explicitly consented screen sharing and screenshots for guided support.
5. **Remediation center** — proposed fixes, automated low-risk remediation, human approval gates, execution evidence, rollback evidence, and post-fix verification.
6. **Resolved archive** — immutable compliance-facing case history including who requested help, evidence, diagnosis, approval history, resolution, verification, and timestamps.
7. **Knowledge and problem management** — recurring-incident detection, known errors, reusable runbooks, root-cause records, and prevention tasks.

## Ticket sources
Tickets can be created by:

- employees and administrators;
- SIA conversations;
- workflow telemetry when a meaningful action fails;
- backend/API exception detection;
- GitHub CI/build failure ingestion;
- Railway deployment/runtime/health failures;
- integration/vendor failures;
- security/access anomalies;
- recurring-problem detection.

## Evidence model
Evidence is semantic and sanitized. Examples:

- `Scheduling -> Publish Schedule -> attempted -> API 403 -> authorization denied`
- `Employee Portal -> Sign in -> POST /api/auth/login -> 401 -> invalid credential`
- `SPIRE -> MAR -> Save administration -> API 500 -> correlation id abc...`
- `Railway backend -> deployment -> health check failed -> /health 503`

Do not capture passwords, MFA codes, access tokens, private keys, session cookies, raw clinical free text, raw medication notes, patient identifiers, SSNs, payment card data, or unrelated personal content.

## Remote assistance safety contract
Remote assistance is support, not surveillance.

- The employee must request or affirmatively accept the session.
- The browser/device must display a persistent visible indicator while sharing.
- The employee can stop sharing immediately at any time.
- Sessions are scoped to the selected screen/window/tab where the platform allows.
- No unattended or hidden screen viewing.
- No camera or microphone activation by default.
- Screenshots require an explicit visible capture action/consent.
- Screenshot evidence is attached to the ticket with timestamp, actor, session id, and purpose.
- Clinical and other sensitive screens trigger privacy safeguards; support should use non-sensitive workflow context whenever possible.
- Remote control, if added later, requires a separate explicit consent step and a restricted allowlist. It must never silently type passwords, MFA codes, clinical orders, financial approvals, or other consequential data.

## Triage and severity
Triage evaluates:

- affected company and application;
- affected workflow and step;
- number of users affected;
- patient/client safety impact;
- security/privacy impact;
- payroll/financial impact;
- operational impact;
- production/service availability;
- workaround availability;
- recurrence and known-problem match.

Suggested severity:

- **SEV1 Critical** — broad outage, material security event, safety-critical workflow unavailable, or major data-integrity risk.
- **SEV2 High** — major workflow unavailable to a department/company or serious production degradation.
- **SEV3 Medium** — limited-user workflow failure with workaround or non-critical service degradation.
- **SEV4 Low** — guidance, cosmetic defect, isolated non-blocking issue, or routine request.

## Automated remediation boundary
The Sulandra IT agent may automatically execute only pre-approved, reversible, low-risk actions that are explicitly allowlisted and fully audited.

Human Admin approval is required before:

- production deployment/configuration changes;
- repository/code changes promoted to production;
- role, permission, authentication-policy, or security-control changes;
- destructive or bulk data changes;
- database schema/data repair outside approved safe runbooks;
- clinical-record mutation;
- payroll, billing, payment, or consequential financial changes;
- external vendor credential/connection changes;
- actions that materially affect another employee or company.

Every executed remediation records the proposed action, risk classification, approver when required, execution result, verification result, and rollback result when applicable.

## GitHub and Railway integration
GitHub and Railway are first-class IT evidence sources.

### GitHub
Capture and correlate:

- failing workflows/jobs;
- TypeScript/build/test/migration-smoke failures;
- PR and commit associated with the incident;
- changed files when diagnosing regressions;
- approved fix PR and review/merge evidence.

### Railway
Monitor the three production services according to `DEVELOPMENT_WORKFLOW.md`:

- Sulandra Static Website — only frontend;
- `sulandra-website` backend in the frontend-service project;
- `sulandra-website` backend in `magnificent-education`.

Capture deployment status, health checks, runtime/build logs, service metrics, and the deployment/commit relationship. One green service never proves the other two are healthy.

## Compliance and audit
Each incident retains:

- requester and tenant/company context;
- creation source;
- workflow/action metadata;
- sanitized evidence;
- remote-assistance consent events;
- screenshots/evidence metadata;
- triage/severity history;
- assignee and agent actions;
- approvals and denials;
- remediation attempts;
- resolution and verification;
- timestamps and correlation ids;
- linked GitHub/Railway evidence where applicable.

Resolved tickets remain searchable in the Resolved archive for compliance, operational review, employee disputes, corrective-action review, root-cause analysis, and recurring-problem prevention.

## Privacy principle
The goal is enough evidence to reproduce and resolve a Sulandra system problem without building a keylogger, employee-surveillance system, or unnecessary clinical-data repository. Capture system behavior, not secrets or unrelated content.
