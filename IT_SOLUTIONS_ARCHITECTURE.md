# Sulandra IT Solutions Architecture

## Mission
Sulandra IT Solutions is the internal IT operations, support, diagnostics, and controlled-remediation center for every Sulandra company and application. It is not limited to timekeeping. It covers meaningful user actions and failures from sign-in through sign-out across the Sulandra Static Website, Employee Portal, Admin, Company Operations, Employee 360, careers/onboarding, scheduling, timekeeping, S.P.I.R.E., SCLS, Home Health, NMT, EVV, billing, education, documents, communications, integrations, and backend services.

## Core operating model
Every case follows the same chain:

`User -> Company -> Application -> Page/Module -> Workflow -> Step -> Action -> System response -> Outcome -> Evidence -> SIA diagnosis -> Resolution or Engineering handoff -> Verification -> Archive`

Clock-in/geofence evidence is one evidence source only. The same model applies to login, logout, navigation, form submission, approvals, scheduling, SPIRE workflow operations, EVV, billing, documents, integrations, API failures, permissions, deployment/runtime errors, and all other Sulandra workflows.

## SIA is first-line IT support
Ask SIA is the front door for employee support and should resolve as much as possible before creating an engineering ticket.

1. SIA first determines the affected application, page, workflow step, expected behavior, actual behavior, and available non-sensitive evidence.
2. SIA provides navigation help, explains where to click, checks trusted role/access/workflow context, guides safe browser/device steps, interprets non-sensitive screenshots, and uses available live diagnostics.
3. SIA must not create a coding-agent ticket merely because the employee asks for one or because the first troubleshooting step fails.
4. A coding-agent ticket is created only after SIA has evidence that a code patch, configuration repair, deployment repair, or data repair is required.
5. If no engineering change is needed, SIA continues troubleshooting and closes the interaction without creating an engineering ticket.
6. When an engineering ticket is created, SIA tells the employee in the same conversation that the issue has been handed to Sulandra IT, and the employee receives push/status updates from the coding agent through the SIA conversation.

## 24/7 autonomous coding-agent handoff
Sulandra IT is designed for continuous autonomous operation rather than a human technician waiting for tickets.

- A confirmed engineering ticket immediately creates an `ITAgentHandoff` record.
- The coding agent acknowledges the handoff immediately and begins diagnosis/work using the attached SIA conversation, sanitized evidence, GitHub context, Railway context, and related incident history.
- Agent state flows through `ACKNOWLEDGED -> IN_PROGRESS -> WAITING_APPROVAL | RESOLVED | FAILED`.
- Every meaningful state change creates an employee-facing SIA update and push-notification payload.
- Routine established-operation repairs do not wait for a supervisor merely because code/configuration is involved; they follow the safe remediation policy below.
- Resolutions, verification evidence, commits/PRs/deployments when applicable, and rollback evidence are retained in the resolved archive for later human review.

## Established-operation repair vs new-system change
The approval boundary is based on whether the agent is restoring an already-approved operation or introducing materially new behavior.

### Established operation repair
Examples: a previously working sign-in route breaks, a save button begins returning 500, a known workflow regresses after deployment, a frontend route points to the wrong backend, a scheduled job stops executing, or an existing permission mapping is not being honored as designed.

The coding agent may repair an established operation without waiting for supervisor approval when all of the following are true:

- the intended existing behavior is documented or can be established from current production contracts, tests, prior working code, or approved configuration;
- the repair is scoped to restoring that behavior, not expanding authority or inventing new functionality;
- the action is reversible and passes required validation;
- no secret, credential, destructive data operation, clinical-record mutation, payroll/payment decision, or cross-tenant access change is involved;
- the change passes the repository validation and Railway health requirements before completion.

These cases are automatically archived for later human review.

### New system change
A new capability, changed business rule, materially changed permissions, new production workflow, new data behavior, new external integration behavior, or other functionality not already approved as part of the established system requires administrator approval before production promotion.

When this approval is required:

- the coding agent pauses at `WAITING_APPROVAL`;
- the employee receives a SIA/push status update;
- the employee's supervisor receives an approval email or the request is routed to the authorized administrator approval queue according to company policy;
- work can continue in a non-production branch/sandbox when safe, but production-changing execution waits for approval.

Supervisor email is not used for ordinary established-operation failures.

## IT operations center
The Admin IT Solutions portal is organized as an internal IT-company command center with:

1. **Operations overview** — open incidents, service health, SLA/risk, active remote-assist sessions, pending approvals, coding-agent handoffs, recent production failures, and recent resolutions.
2. **Incident queue** — employee, admin, SIA, automated-monitoring, deployment, integration, and security-originated cases.
3. **System diagnostics** — sanitized browser/runtime evidence, API status, workflow state, service/deployment health, integration status, build/CI failures, correlation IDs, and timestamps.
4. **Remote assistance** — employee-initiated, explicitly consented screen sharing and screenshots for guided support.
5. **Remediation center** — proposed fixes, autonomous established-operation repair, human approval gates for new-system changes, execution evidence, rollback evidence, and post-fix verification.
6. **Resolved archive** — immutable compliance-facing case history including who requested help, evidence, diagnosis, approval history, resolution, verification, and timestamps.
7. **Knowledge and problem management** — recurring-incident detection, known errors, reusable runbooks, root-cause records, and prevention tasks.

## Ticket sources
Engineering tickets may originate from employees/admins through SIA, workflow telemetry, backend/API exception detection, GitHub CI/build failure ingestion, Railway deployment/runtime/health failures, integration/vendor failures, security/access anomalies, and recurring-problem detection. For employee-originated requests, the SIA diagnosis gate applies before coding-agent handoff.

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

## GitHub and Railway integration
GitHub and Railway are first-class IT evidence sources. The coding agent should correlate failing workflows/jobs, TypeScript/build/test/migration-smoke failures, PR/commit history, Railway deployment status, health checks, runtime/build logs, metrics, and the deployment/commit relationship.

Monitor the three production services according to `DEVELOPMENT_WORKFLOW.md`:

- Sulandra Static Website — only frontend;
- `sulandra-website` backend in the frontend-service project;
- `sulandra-website` backend in `magnificent-education`.

One green service never proves the other two are healthy.

## Compliance and audit
Each incident retains requester/company context, creation source, workflow/action metadata, sanitized evidence, remote-assistance consent events, screenshots/evidence metadata, triage history, coding-agent actions, approvals/denials, remediation attempts, resolution and verification, timestamps/correlation ids, and linked GitHub/Railway evidence.

Resolved tickets remain searchable in the Resolved archive for compliance, operational review, employee disputes, corrective-action review, root-cause analysis, and recurring-problem prevention.

## Privacy principle
The goal is enough evidence to reproduce and resolve a Sulandra system problem without building a keylogger, employee-surveillance system, or unnecessary clinical-data repository. Capture system behavior, not secrets or unrelated content.
