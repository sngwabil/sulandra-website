# Employee 360 — Compliance Requirements and Automatic Reminder Engine

## Purpose

Employee 360 maintains a centralized compliance requirement catalog, automatically determines which employees are subject to each requirement, reconciles approved evidence, calculates due and renewal dates, sends reminders, escalates overdue items, and exposes self-service actions to employees.

The backend is authoritative. Browser controls improve usability but do not grant access.

## Requirement types

### Document

Used for licenses, certifications, background checks, medical records, policy acknowledgements, identification, and other expiring or recurring records.

A document requirement can define:

- Required document category.
- Optional title text that must be present.
- Confidentiality classification.
- Initial due date after hire.
- Renewal interval.
- Warning window.
- Employee upload permission.
- Reminder and escalation schedule.

Employee-submitted compliance documents enter `PENDING` review status. Human Resources or an authorized Administrator must approve or reject the document before it becomes accepted compliance evidence. The backend verifies the reviewer’s employee and location scope before changing the document.

### Education

Used for required courses and annual training.

An education requirement can define:

- Course code.
- Course title.
- Initial due date.
- Renewal interval.
- Automatic creation of an `EducationAssignment` when the employee does not already have an open assignment.
- Reminder and escalation schedule.

The engine reconciles completed education and expiration dates from `EducationAssignment`.

### Attestation

Used for handbook acknowledgements, policy attestations, conflict-of-interest disclosures, confidentiality acknowledgements, annual statements, and similar electronic confirmations.

The employee reviews the configured statement, types their full legal name, confirms acceptance, and submits it through the Employee Portal. Employee 360 records the statement, typed name, employee, assignment, IP address, browser/device information, and acceptance timestamp.

### Manual

Used for requirements that cannot be automatically reconciled from a document, education completion, or electronic attestation. An authorized administrator can mark the requirement complete, apply an exemption, reset the item, or adjust the due date.

## Applicability

A requirement may apply to:

- All employees in selected employment statuses.
- One or more system roles.
- One or more departments.
- Job titles containing configured text.
- One or more service homes or locations.
- Any combination of role, department, job-title, and location filters.

Requirements are evaluated only for employees in the configured employment statuses. The default is `ACTIVE`.

Location-scoped managers see only employees within the service-location scope already enforced by Employee 360 permissions.

Creating or updating a requirement immediately runs a reconciliation without sending notifications. Applicable assignments therefore appear without waiting for the next daily scheduled run.

## Compliance statuses

| Status | Meaning |
|---|---|
| `NOT_STARTED` | Applicable requirement exists but no completion activity has started |
| `MISSING` | Required evidence is absent and the item is not yet overdue |
| `IN_PROGRESS` | Education is in progress or an employee-submitted document is awaiting review |
| `DUE_SOON` | Approved evidence is still current but its due or expiration date is within the warning window |
| `OVERDUE` | Due or expiration date has passed |
| `COMPLIANT` | Approved evidence is current and outside the warning window |
| `EXEMPT` | Authorized exemption is active |
| `NOT_APPLICABLE` | Requirement no longer applies to that employee |

`DUE_SOON` remains part of the current compliance percentage while still being surfaced as an action and renewal warning.

## Evidence reconciliation

### Documents

The engine finds the newest active document matching the required category and optional title text.

- `PENDING` documents produce `IN_PROGRESS`.
- `REJECTED` documents are not accepted as evidence.
- `APPROVED` documents are evaluated by their expiration date or configured renewal interval.
- Approved documents without an expiration or renewal interval remain compliant.
- Approval or rejection triggers an immediate organization reconciliation without sending reminder emails.

### Education

The engine checks for:

1. The latest completed assignment matching the course code.
2. Its explicit expiration date or the requirement renewal interval.
3. An open assigned or in-progress course if no current completion exists.
4. Automatic course assignment when configured.

Scheduled education assignments use the actual administrator when a manual reconciliation is started and remain system-created when a scheduled run has no human actor.

### Attestations

The engine uses the latest employee attestation and applies the configured renewal interval when present.

### Manual completion

An authorized manual completion remains compliant until the configured renewal interval expires.

## Due dates and renewals

The initial due date is calculated from:

1. Employee hire date, when available.
2. Otherwise, the compliance assignment creation date.
3. The requirement's `dueDaysAfterHire` value.

Current evidence expiration replaces the initial due date when applicable.

## Reminder schedule

Each requirement has independent arrays for:

- Employee reminder days.
- Supervisor and location-manager escalation days.
- Human Resources escalation days.

Positive numbers mean days before the due date. `0` means due today. Negative numbers mean days overdue.

Default employee reminders:

`60, 30, 14, 7, 1, 0, -1, -7, -14, -30`

Default manager escalation:

`-1, -7, -14, -30`

Default Human Resources escalation:

`-7, -14, -30`

## Reminder recipients

Employee 360 can notify:

- The employee.
- The employee's configured supervisor.
- Home or service-location managers for the employee's active assigned locations.
- Human Resources recipients configured in Compliance Settings.
- Active HR Manager and Administrator accounts.
- The Enterprise Owner fallback address.

Reminder emails are sent from **Sulandra Health Human Resources Department** and include professional action links to the Employee Portal and Learning Center.

Automatic communications are recorded using the Enterprise Owner, an HR Manager, or an Administrator as the system communication actor rather than attributing the email to the employee receiving it.

## Duplicate prevention and retries

Every reminder has a database-enforced deduplication key containing:

- Assignment.
- Recipient type.
- Recipient email.
- Reminder stage.
- Current due date.

A successfully delivered reminder is never sent twice for the same stage and due date. Failed reminders can retry up to three times.

If the due date changes, a new valid reminder sequence can begin because the due date is part of the deduplication key.

## Automatic scheduler

The backend checks compliance schedules once per hour.

Each organization configures:

- Enabled or disabled state.
- Time zone.
- Local daily scan hour.
- Human Resources escalation recipients.
- Employee Portal action URL.
- Sender display name.

The engine runs once per configured local calendar day. A database-backed `EmployeeComplianceLease` allows only one Railway instance to process an organization at a time. The lease has a six-hour crash-recovery expiration and is released only by the run holding the matching token. This avoids connection-pool problems associated with session-level advisory locks.

A startup reconciliation also runs after the API initializes. Reminder deduplication prevents restart-related duplicate emails.

## Manual engine run

Authorized users can select **Run Compliance Engine** in the Compliance Center.

A manual run:

1. Re-evaluates requirement applicability.
2. Creates missing compliance assignments.
3. Marks removed assignments not applicable.
4. Reconciles documents, education, attestations, exemptions, and manual completions.
5. Creates missing required education assignments.
6. Recalculates statuses and due dates.
7. Sends reminders whose configured stage is due that day.
8. Records metrics and errors in run history.

## Compliance Center

The Admin Employee 360 workspace includes a Compliance Center with:

- Organization compliance rate.
- Overdue, due-soon, missing, incomplete, currently compliant, and exempt counts.
- Assignment search and filters.
- Requirement builder and editor.
- Role, department, job-title, location, and employment-status applicability.
- Document, education, attestation, and manual requirement configuration.
- Reminder schedules and escalation settings.
- Manual reminders.
- Exemptions and manual completions.
- Due-date changes.
- Document approval or rejection.
- Reminder delivery log.
- Engine run history.
- Automatic scheduler settings.

Every employee folder also receives a Compliance tab with that employee's requirement history and actions.

## Employee self-service

The Employee Portal includes **My Compliance**.

Employees can:

- View assigned requirements and current status.
- See due, completion, and expiration dates.
- Open the Learning Center for education requirements.
- Upload permitted documents securely for Human Resources review.
- Complete permitted electronic attestations.
- See when a requirement is overdue, due soon, in progress, compliant, or exempt.

Employees cannot edit requirement rules, approve their own uploads, exempt themselves, change due dates, or access another employee's compliance records.

## Access control

### Requirement management

Limited to:

- Enterprise Owner.
- Human Resources Manager.
- Administrator.

### Location-scoped visibility

Program Managers, House Managers, and Delegating Nurses see only employees in their authorized service locations. House Managers are limited to homes where they are designated as manager.

Document review first retrieves the employee owner of the document, verifies the reviewer’s scope, and only then performs the approval or rejection update.

### Read-only auditing

Auditors can view compliance records and logs but cannot create requirements, change settings, approve documents, apply exemptions, or send reminders.

### Reminder sending

Manual reminders are limited to authorized management and communication roles.

## Audit history

The system records:

- Requirement creation, updates, and archival.
- Compliance engine runs.
- Exemptions and exemption removal.
- Manual completions and resets.
- Due-date changes.
- Employee attestations.
- Employee document uploads.
- Document approval and rejection.
- Manual reminders.
- Automatic reminder delivery status and provider message ID.
- Failed delivery attempts and errors.

## Database objects

- `EmployeeComplianceSettings`
- `EmployeeComplianceRequirement`
- `EmployeeComplianceAssignment`
- `EmployeeComplianceAttestation`
- `EmployeeComplianceReminder`
- `EmployeeComplianceRun`
- `EmployeeComplianceLease`

Employee documents also include:

- `reviewStatus`
- `reviewedById`
- `reviewedAt`

## Validation

Backend typecheck:

```bash
npm run typecheck
```

Backend build:

```bash
npm run build
```

Static frontend build:

```bash
npm run build:web
```

Employee 360 permission and compliance regression checks:

```bash
npm run verify:employee360
```

Complete validation:

```bash
npm run check
```
