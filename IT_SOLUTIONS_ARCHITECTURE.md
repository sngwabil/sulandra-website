# Sulandra IT Solutions Architecture

## Mission
Sulandra IT Solutions is the internal IT operations, support, diagnostics, and controlled-remediation center for every Sulandra company and application. It is not limited to timekeeping. It covers meaningful user actions and failures from sign-in through sign-out across the Sulandra Static Website, Employee Portal, Admin, Company Operations, Employee 360, careers/onboarding, scheduling, timekeeping, S.P.I.R.E., SCLS, Home Health, NMT, EVV, billing, education, documents, communications, integrations, and backend services.

The Sulandra IT Specialist is the continuously operating technical specialist inside that center. It maintains a current map of the production repository and the three production services, indexes approved/merged GitHub work and the release history, correlates support evidence with that approved behavior, and owns routine employee IT tickets through resolution.

## Core operating model
Every case follows the same chain:

`User -> Company -> Application -> Page/Module -> Workflow -> Step -> Action -> System response -> Outcome -> Evidence -> SIA diagnosis -> IT Specialist -> Resolution or major-change approval -> Verification -> Archive`

Clock-in/geofence evidence is one evidence source only. The same model applies to login, logout, navigation, form submission, approvals, scheduling, SPIRE workflow operations, EVV, billing, documents, integrations, API failures, permissions, deployment/runtime errors, and all other Sulandra workflows.

## Durable ticket identity and no-dead-conversation contract
Every employee IT case receives a human-readable ticket number in the form `IT-YYYYMMDD-XXXXXX` in addition to its internal record ID.

- SIA displays and reuses the ticket number in the employee conversation.
- An employee may type the ticket number in Ask SIA at any later time; SIA immediately loads the active ticket state, diagnosis, approval state, and recent IT updates instead of starting over.
- Employee replies in the linked SIA conversation are persisted to the IT Specialist ticket.
- IT Specialist status changes and troubleshooting questions are persisted back into the same SIA conversation and employee notification stream.
- A case that needs employee input stays open. It is not abandoned simply because the browser tab closed or the employee did not answer immediately.
- A retryable worker, CI, GitHub, or deployment error keeps the ticket/context durable and schedules another attempt; it never silently drops the conversation.
- A ticket is closed only after the employee confirms a guidance-only resolution, the approved repair is verified in production, the owner declines a major change, or an authorized human explicitly closes the case.

## SIA is first-line IT support
Ask SIA is the front door for employee support and retains its full general, Sulandra, and clinical-safe capabilities.

1. SIA first determines the affected application, page, workflow step, expected behavior, actual behavior, and available non-sensitive evidence.
2. SIA provides navigation help, explains where to click, checks trusted role/access/workflow context, guides safe browser/device steps, interprets non-sensitive screenshots, and uses available live diagnostics.
3. SIA can create a support ticket when the issue needs durable tracking. Once a ticket exists, SIA and the IT Specialist communicate bidirectionally through that ticket until resolution.
4. SIA must not create a coding repair merely because the employee asks for one or because the first troubleshooting step fails.
5. If no engineering change is needed, SIA and the IT Specialist continue troubleshooting and may generate a secure visual click guide with arrows and explicit targets.
6. A confirmed engineering need is handed to the coding worker only after the IT Specialist classifies it against current code, approved GitHub history, risk, and the established-operation policy below.

## System and approved-work knowledge
The IT Specialist maintains two refreshable knowledge snapshots.

### Repository/service map
The specialist inventories the current `release/sulandra-1.0` repository tree and classifies source into areas such as frontend, backend, SIA/IT, workforce, recruiting, SPIRE, Home Health, NMT, revenue, communications, database, build tooling, and CI governance. The service map always includes all three production targets:

- Sulandra Static Website — frontend;
- `sulandra-website` backend in the frontend-service Railway project;
- `sulandra-website` backend in `magnificent-education`.

### Approved-work memory
The specialist indexes merged pull requests and the production release-branch commit history. This approved history is evidence of previously authorized behavior; an open/draft/unmerged branch is not automatically considered approved production behavior.

A routine autonomous repair must be grounded in current contracts/tests or approved/merged work. If the intended behavior cannot be established confidently, the specialist classifies the request as a major/uncertain change and asks the owner rather than guessing.

## 24/7 autonomous IT Specialist handoff
Sulandra IT is designed for continuous operation rather than a human technician waiting for tickets.

- A new employee ticket is queued immediately for the IT Specialist.
- The specialist acknowledges, diagnoses, guides, requests one missing detail when necessary, or begins a safe established-operation repair.
- Ticket state is durable across restarts and uses a lease/retry model so interrupted workers can resume.
- Every meaningful state change creates an employee-facing SIA update and notification.
- Routine established-operation repairs do not wait for owner approval merely because code/configuration is involved.
- Major/material changes pause for the owner only.
- Resolutions, verification evidence, commits/PRs/deployments when applicable, and rollback/failed-validation evidence are retained for later review.

## Established-operation repair vs major/new-system change
The approval boundary is based on whether the specialist is restoring an already-approved operation or introducing materially new behavior.

### Established operation repair — autonomous
Examples: a previously working sign-in route breaks, a save button begins returning 500, a known workflow regresses after deployment, a frontend route points to the wrong backend, a scheduled job stops executing, or an existing permission mapping is not being honored as already designed.

The IT Specialist may repair and promote an established operation without waiting for owner approval only when all of the following are true:

- the intended existing behavior is documented or established from current production contracts/tests, prior approved merged work, or approved configuration;
- the repair is scoped to restoring that behavior, not expanding authority or inventing functionality;
- classification confidence is sufficient and risk is LOW or MEDIUM;
- the action is reversible and uses the existing release/rollback model;
- no secret/credential manipulation, destructive data operation, clinical-record mutation/clinical decision, payroll/payment decision, database-meaning change, new external-integration behavior, authentication/security-policy change, or cross-tenant access change is involved;
- the coding worker creates a dedicated `it-agent/...` branch and pull request rather than writing directly to the release branch;
- required GitHub validation is green before merge;
- production is not declared repaired until the exact merged SHA is verified on the Static Website and both backend deployments.

For these cases the specialist may: diagnose -> create repair PR -> wait for CI/DR/Role UAT and triggered section gates -> merge -> allow the canonical Railway branch deployments -> verify all three exact production commits -> resolve/archive the ticket.

A failing validation is not bypassed. The specialist stops promotion, preserves the failure evidence, and revises or escalates the plan.

### Major or materially new change — owner approval required
A new capability, materially changed business rule, changed permissions/authentication/security policy, schema/data-meaning change, destructive operation, new production workflow, new external-integration behavior, major architecture change, clinical-record/data mutation, payroll/payment decision, or any change whose established behavior cannot be confidently proven requires owner approval before implementation/promotion.

When owner approval is required:

- the ticket pauses at the owner-decision boundary;
- the employee receives a SIA/status update that the case remains active;
- Sulandra IT emails the owner with the ticket number, diagnosis, proposed change, target, risk, and why approval is required;
- the email links to IT Solutions rather than accepting an email reply as an execution command;
- the owner opens IT Solutions, enters the ticket number, and selects **Approve & Continue**, **Request Modification**, or **Decline**;
- **Approve** authorizes only the described ticket/change and sends it through the same coding, validation, merge, three-service deployment, and exact-SHA verification path;
- **Request Modification** returns the ticket to IT Specialist planning with the owner note while preserving all prior evidence;
- **Decline** makes no production change and records the decision in the case history.

## Employee visual support
For ordinary navigation/browser/account/device/workflow problems, the specialist can create a secure employee-scoped visual guide. The guide uses numbered steps, arrows, and explicit “click/open” targets. It contains no password, MFA, token, patient, clinical, payment, or unrelated private content. The employee returns to Ask SIA after trying the steps, gives the ticket number, and the existing case continues.

## IT operations center
The Admin IT Solutions portal is organized as an internal IT-company command center with:

1. **IT Specialist** — autonomous runtime status, repository/approved-work map status, active ticket phases, knowledge refresh, and owner decision controls.
2. **IT Agent workbench** — privileged operational actions such as intranet content, announcements, notifications, email, and deliberate engineering requests.
3. **Operations overview** — open incidents, service health, SLA/risk, active remote-assist sessions, pending approvals, coding-agent handoffs, recent production failures, and recent resolutions.
4. **Incident queue** — employee, admin, SIA, automated-monitoring, deployment, integration, and security-originated cases.
5. **System diagnostics** — sanitized browser/runtime evidence, API status, workflow state, service/deployment health, integration status, build/CI failures, correlation IDs, and timestamps.
6. **Remote assistance** — employee-initiated, explicitly consented screen sharing and screenshots for guided support.
7. **Approvals / remediation** — owner-only major-change decisions, proposed fixes, execution evidence, rollback evidence, and post-fix verification.
8. **Resolved archive** — immutable compliance-facing case history including who requested help, evidence, diagnosis, approval history, resolution, verification, and timestamps.
9. **Knowledge and problem management** — recurring-incident detection, known errors, reusable runbooks, root-cause records, approved-work history, and prevention tasks.

## Ticket sources
Tickets may originate from employees/admins through SIA or Employee Support, workflow telemetry, backend/API exception detection, GitHub CI/build failure ingestion, Railway deployment/runtime/health failures, integration/vendor failures, security/access anomalies, and recurring-problem detection. For employee-originated requests, SIA remains the conversational front door while the IT Specialist owns durable case progression.

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
GitHub and Railway are first-class IT evidence sources. The specialist correlates failing workflows/jobs, TypeScript/build/test/migration-smoke failures, PR/commit history, Railway deployment status, health checks, runtime/build logs, metrics, and the deployment/commit relationship.

The coding worker's GitHub credential is repository-scoped. Routine autonomous promotion merges only a worker PR whose exact head passed the required gates; it never force-pushes the production release branch.

Railway production deploys continue from the canonical `release/sulandra-1.0` branch. The specialist does not treat one green service as proof of production health. API `/health` and the Static Website deployment metadata expose the Railway-provided branch and commit identity so post-merge verification can require the exact expected SHA on all three services.

## Compliance and audit
Each incident retains requester/company context, ticket number, creation source, workflow/action metadata, sanitized evidence, remote-assistance consent events, screenshots/evidence metadata, triage history, SIA/IT messages, coding-agent actions, approvals/modifications/denials, remediation attempts, CI/gate evidence, merge evidence, three-service production verification, resolution, and timestamps/correlation ids.

Resolved tickets remain searchable for compliance, operational review, employee disputes, corrective-action review, root-cause analysis, and recurring-problem prevention.

## Privacy principle
The goal is enough evidence to reproduce and resolve a Sulandra system problem without building a keylogger, employee-surveillance system, or unnecessary clinical-data repository. Capture system behavior, not secrets or unrelated content.
