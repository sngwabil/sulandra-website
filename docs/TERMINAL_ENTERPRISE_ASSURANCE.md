# Sulandra Engineering Terminal Enterprise Assurance

This document defines the production assurance controls layered on top of the Sulandra Engineering Terminal. These controls supplement, rather than replace, the existing isolated-session, HA, controlled-egress, authenticated IDE/live-preview, and disaster-recovery controls.

## 1. Independent penetration testing

An independent third-party penetration test is required at least annually and after a material change to the authentication, authorization, proxy, WebSocket, container-isolation, execution-token, or network-boundary model.

The assessor must be organizationally independent from Sulandra's implementation team. Internal automated scans, code review, OWASP ZAP, Trivy, CI tests, and AI-assisted review do not qualify as the independent penetration test.

Scope must include:

- Administrator/CEO/COO browser authentication and workspace-ticket issuance.
- Session-owner isolation and horizontal/vertical authorization testing.
- HTTP and WebSocket proxy boundaries.
- SSRF and arbitrary-host/port bypass attempts.
- IDE and live-preview frame/origin controls.
- Executor token handling and secret exposure attempts.
- Container escape and Docker-socket threat analysis.
- Controlled egress bypass attempts.
- Workspace persistence, cross-session access, and cleanup.
- Rate/limit abuse, denial-of-service, and resource-exhaustion behavior.
- Clickjacking, CSP, CSRF/session handling, and common OWASP web risks.

A real assessor report is stored outside the repository. The repository stores only a compact attestation at `security/terminal/evidence/independent-pentest-attestation.json`, including the assessor identity, scope, dates, result, finding status, and SHA-256 of the external report. `scripts/verify-independent-pentest-attestation.mjs` rejects expired attestations, non-independent attestations, failed results, unresolved Critical findings, and unresolved High findings that are not explicitly accepted risk.

## 2. CVE and patch governance

Automated dependency updates are enabled for npm, Docker, and GitHub Actions. The Terminal Enterprise Assurance workflow builds the terminal session, execution-plane, and Railway gateway images and scans them with Trivy.

Patch targets:

| Severity | Required response |
| --- | --- |
| Critical, fix available | block release; remediate within 24 hours |
| High, fix available | remediate within 7 calendar days or document time-bounded accepted risk |
| Medium | remediate within 30 calendar days when applicable |
| Low | normal maintenance cycle |

Unfixed upstream vulnerabilities are tracked but are not represented as locally patchable. A new fixed Critical vulnerability is a release blocker.

Base images and pinned tooling must be refreshed through pull requests and must pass the same terminal regression, HA, CVE, and load gates before release.

## 3. Centralized security and audit retention

The terminal execution plane writes structured audit records to the shared durable state root under `/state/audit`.

Each record includes timestamp, executor identity, event, authenticated owner, request method/path, response status, duration, and related workspace/session identifiers when available. It does **not** include terminal keystrokes, command text, output, authorization headers, executor/session tokens, environment values, container IP addresses, or `.env` contents.

Every record receives an HMAC-SHA-256 integrity tag derived from the server-side execution-plane secret. Audit files are partitioned by UTC date and executor identity. The default retention period is 2,190 days (six years). The shared state directory is available to either HA executor generation, so failover does not split the durable evidence location.

Railway gateway deployment/runtime logs remain complementary platform evidence; the durable executor audit is the authoritative terminal-operation trail.

## 4. Sustained multi-user load testing

The terminal load gate uses k6 and runs sustained concurrent virtual users against the terminal gateway. The CI gate validates that the gateway remains responsive under concurrency and enforces response latency/error thresholds. Terminal Industry Hardening continues to validate real Docker session behavior, executor failover, Git egress, WebSocket survival, and resource profiles.

Release threshold for the gateway synthetic load gate:

- HTTP request failure rate < 1%.
- p95 gateway health latency < 500 ms in CI.
- no process crash or healthcheck failure during the test.

Production capacity tests should be increased as actual employee concurrency grows. Changes to max workspace/session limits or baseline CPU/RAM require rerunning the sustained load gate.

## 5. Service-level objectives and alerting

Production SLOs:

- Engineering terminal gateway monthly availability: **99.9%**.
- Static IT Solutions entry-point monthly availability: **99.9%**.
- Gateway synthetic p95 response latency objective: **< 750 ms**.
- Railway healthcheck recovery objective: healthy deployment must pass `/health` before traffic promotion.
- Terminal execution-plane restore/failover objective: no loss of persisted workspace metadata during single-executor failover.

99.9% monthly availability corresponds to an error budget of approximately 43.8 minutes in a 30-day month.

The production SLO workflow performs hourly external synthetic probes. A material availability or latency breach opens or updates a GitHub incident issue; recovery closes the active synthetic incident issue with evidence. Railway healthchecks and restart policy remain the immediate service-level protection.

## 6. Disaster-recovery exercise

The existing PostgreSQL backup/restore drill is retained and extended into a documented exercise. It validates backup creation, checksum/manifest/metadata evidence, isolated restore, sentinel integrity, required production tables, and an RTO threshold.

The DR workflow runs on release changes, pull requests affecting the control, monthly schedule, and manual dispatch. Each successful exercise emits an auditable Markdown report artifact containing the commit, execution time, RTO target, restore validation, and recovery assertions.

Operational runbook:

1. Declare the incident and freeze destructive writes if data integrity is uncertain.
2. Preserve Railway deployment IDs, executor audit evidence, current release SHA, and database backup metadata.
3. Select the most recent verified backup consistent with the recovery point requirement.
4. Restore into an isolated target first; never overwrite production as the first restore action.
5. Verify checksum, sentinel/business integrity, required tables, and application compatibility.
6. Record measured RTO and estimated RPO.
7. Promote restored infrastructure only after owner/incident-lead approval.
8. Re-run production smoke, terminal gateway health, authorization isolation, and audit-write checks.
9. Record corrective actions and update this runbook when the exercise finds a gap.

## Assurance status terminology

- **Automated security assurance** means CI scanning, DAST, regression, CVE, load, SLO, and DR controls are running.
- **Independent penetration tested** may be stated only while a valid third-party attestation exists and passes the repository evidence gate.
- **Enterprise-hardened** does not mean risk-free or formally certified. External assessment findings and operational evidence remain part of the production-security lifecycle.
