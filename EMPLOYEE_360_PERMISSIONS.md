# Employee 360 — Role-Scoped Permissions and Confidential Records

> This document is part of the Sulandra Health development workflow. All Employee 360 changes must remain on `feature/spire-ehr-platform` and preserve the Static Website frontend / Railway API backend separation described in `DEVELOPMENT_WORKFLOW.md`.

## Security objectives

Employee 360 uses server-enforced, organization-isolated access controls. The browser never decides whether a user may access an employee, service location, profile field, document class, account action, or audit record.

The authorization model combines:

1. The authenticated employee's system role.
2. The service locations or homes assigned to that employee.
3. Whether the employee is the designated Home Manager for a location.
4. Explicit Employee 360 access grants created by the Enterprise Owner.
5. The target employee or service-location scope of the request.
6. The confidentiality classification of the requested document.
7. Enterprise Owner protection for `admin@sulandrahealth.com`.

## Enterprise Owner

**Sulpitius Ndeh Gwabil** (`admin@sulandrahealth.com`) is recognized by the backend as the immutable Enterprise Owner.

The Enterprise Owner:

- Has all Employee 360 capabilities across the organization.
- Can create and revoke functional access grants.
- Can assign system roles through the existing owner-protected role workflow.
- Cannot be suspended, terminated, demoted, reset, or otherwise managed by another administrator.
- Is not assigned duplicate access grants because owner access is already unrestricted.

## Default role profiles

| System role | Employee 360 profile | Scope | Intended access |
|---|---|---|---|
| Enterprise Owner | Enterprise Owner — Unrestricted | Global | Every Employee 360 capability and record class |
| HR Manager | Human Resources — Full Personnel Access | Global | Personnel, employment, confidential documents, communications, education, attendance, account support, and audit |
| Administrator | Administrator — Global Operations | Global | General employee operations without automatic access to HR-confidential, medical, background, disciplinary, identity, or compensation documents |
| CEO / DOO | Executive — Global Oversight | Global | Operational oversight, HR notes, background, disciplinary, and compensation visibility; no automatic medical or identity-document access |
| Program Manager | Program Manager — Assigned Locations | Assigned locations | Employees assigned to the same service locations or programs |
| House Manager | House Manager — Managed Homes | Managed homes only | Employees assigned to homes where the user is marked as Home Manager |
| Scheduler | Scheduler — Assigned Locations | Assigned locations | Minimum employee identity plus schedules, timecards, requests, and attendance exceptions |
| Education Manager | Explicit functional grant | Global, location, or employee | Employee identity, general credential documents, education assignments, completions, and training compliance |
| Auditor | Auditor — Read Only | Global | Read-only compliance and audit access; no write actions, medical records, or compensation records by default |
| Administrative Assistant | Administrative Support | Global | Contact details, general documents, communications, and portal-access support |
| Billing Specialist | Billing and Payroll Time Review | Global | Employee identity and read-only time/attendance data |
| Delegating Nurse | Clinical Manager — Assigned Locations | Assigned locations | Clinical credentials, medical-classified documents, education, and schedule visibility |
| Other employee roles | No management access by default | Self only | Approved self-service records through the Employee Portal |

## Explicit functional access grants

Only the Enterprise Owner can create or revoke explicit Employee 360 access grants.

An access grant contains:

- The employee receiving the grant.
- A functional access profile.
- One of three scopes:
  - `GLOBAL`: all employees in the organization.
  - `LOCATION`: employees assigned to one service home/location.
  - `EMPLOYEE`: one specifically named employee.
- A documented business reason.
- An optional expiration date.
- The owner account that created the grant.
- Active/revoked state and timestamps.

The system prevents duplicate active grants for the same employee, profile, and scope.

Functional grants allow Sulandra Health to appoint an Education Manager, temporary auditor, scheduler, clinical manager, or other limited administrator without changing the person's underlying clinical or employment role.

## Capability groups

The backend evaluates individual capabilities rather than trusting a generic administrator flag.

### Directory and profile

- View employee directory.
- View basic employee profile.
- View private contact, residential-address, and emergency-contact information.
- View HR/management notes.
- Edit general profile fields.
- Edit private profile fields.
- Change employment status, hire date, termination date, or supervisor.

Restricted profile fields are preserved during limited edits. For example, a Program Manager changing a job title cannot accidentally erase an employee's private address, emergency contact, termination information, or HR notes.

### Documents

- View general employee documents.
- Upload, edit, or archive documents.
- View HR-confidential records.
- View medical records.
- View background-check records.
- View disciplinary records.
- View identity/work-authorization records.
- View compensation/payroll records.

### Operational systems

- View or manage Time and Attendance.
- View or manage Education assignments.
- View employee communications.
- Send employee communications.
- View or manage portal-account access.
- View Employee 360 audit history.
- Export or print an employee folder.

### High-risk owner capabilities

- Manage Employee 360 access grants.
- Change system roles.

These capabilities are not included in ordinary HR or Administrator access.

## Document confidentiality classifications

Every Employee 360 document has a server-persisted confidentiality classification:

| Classification | Typical records |
|---|---|
| `GENERAL` | Licenses, certifications, training, education, policy acknowledgements |
| `HR_CONFIDENTIAL` | Employment agreements, performance files, management notes |
| `MEDICAL` | Employee health, vaccination, occupational-health, or medical accommodation records |
| `BACKGROUND` | Background checks, criminal-history clearances, exclusion checks |
| `DISCIPLINARY` | Corrective actions, warnings, investigations, performance-improvement plans |
| `IDENTITY` | Government identification, I-9 supporting records, passports, work authorization |
| `COMPENSATION` | Pay, tax, direct-deposit, payroll, and compensation records |

A user must have both general document access and the specific capability for the requested restricted class. Restricted documents are removed from API responses when the user lacks authorization; hiding the browser tab alone is never treated as security.

Document uploads also include an `employeeVisible` approval flag. Only documents explicitly marked employee-visible appear in Employee Portal self-service.

## Employee self-service

Every authenticated employee can access only their own approved self-service records through the Employee Portal.

The self-service view includes:

- The employee's own basic profile.
- Documents explicitly approved with `employeeVisible=true`.
- The employee's own education assignments and completions.
- Authenticated downloads of approved documents.

Employees cannot use self-service to access management notes, other employees, unapproved files, confidential document classes, access grants, or audit records.

## Service-location scope enforcement

Location-scoped access is calculated from `TimeAttendanceLocationAssignment`.

- House Managers are limited to locations where `isManager=true`.
- Program Managers, Schedulers, and Clinical Managers are limited to their active assigned locations.
- A target employee is visible only when the target has an active assignment to an allowed location.
- Explicit location grants can add one additional approved location without granting global access.

Removing a manager's location assignment immediately removes the corresponding base-role Employee 360 scope.

## Owner-account protection

For all write operations, the backend checks the target account before allowing the existing Employee 360 route to execute.

A non-owner request attempting to modify the Enterprise Owner is denied even when the requester has an Administrator, HR Manager, CEO, or DOO role.

The existing database-level owner protections remain in effect as defense in depth.

## Authorization audit trail

`Employee360AccessEvent` records:

- Organization.
- Actor.
- Target employee.
- Action and resource type.
- Resource ID.
- Required capability.
- Document sensitivity when applicable.
- `ALLOW` or `DENY` decision.
- Reason.
- IP address.
- User agent.
- Timestamp.

The system records denied attempts, confidential-record access, document downloads, access-grant changes, and sensitive writes. Owner, HR, and Auditor users can review authorization events according to their access profile.

## Frontend behavior

The Static Website loads `admin-employee-permissions.js` before `admin-employee-management.js`.

The permission-aware interface:

- Hides unauthorized tabs.
- Masks private fields.
- Converts profiles to read-only when the actor lacks write capabilities.
- Hides schedule, education, communication, account, and employment actions individually.
- Adds document confidentiality and employee-visibility controls.
- Displays the actor's effective policies and scope.
- Allows the Enterprise Owner to create and revoke access grants.
- Displays authorization events in Audit History.

The backend remains authoritative if a user manipulates the browser or calls an API directly.

## Deployment and regression protection

The following build steps must remain active:

- `scripts/install-employee-management-platform.mjs`
- `scripts/fix-employee-360-permissions.mjs`
- `scripts/fix-employee-management-types.mjs`
- `scripts/build-static-site.mjs`
- `scripts/install-employee-management-frontend.mjs`
- `scripts/install-employee-self-service-frontend.mjs`
- `scripts/verify-employee-360-permissions.mjs`

The regression verifier checks:

- Permission middleware registration before management routes.
- Owner protection.
- Role and location scopes.
- Confidential document classes.
- Database migration presence.
- Frontend script order.
- Employee self-service inclusion.
- Restricted-field preservation.
- Build-safe repository path resolution.

Backend validation:

```bash
npm run typecheck
npm run build
```

Static frontend validation:

```bash
npm run build:web
```

Complete validation:

```bash
npm run check
```
