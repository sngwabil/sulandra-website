# Ohio Production Readiness Matrix

## Purpose

This is the authoritative implementation-readiness tracker for Sulandra Health and Spire across Ohio DODD waiver operations and home-health operations.

It is **not** a declaration that Sulandra Health, Spire, or any affiliated company is legally certified, accredited, HIPAA-certified, EVV-certified, or audit-ready. A feature is not VERIFIED because a screen, label, table, or demo workflow exists.

The matrix separates four evidence layers:

1. **UI / workflow** — the user can complete the intended workflow without placeholder or broken controls.
2. **Backend enforcement** — authorization, validation, business rules, and failure handling are enforced server-side where required.
3. **Persistence / auditability** — required data is persisted, attributable, timestamped/versioned as appropriate, and retrievable for review.
4. **Production / external evidence** — production behavior is tested and any required state/vendor credential, enrollment, certification, or policy/process is complete.

## Status definitions

- **VERIFIED** — the applicable UI/workflow, backend enforcement, persistence/auditability, and test/evidence layers have been verified.
- **PARTIAL** — a capability exists but one or more required layers are incomplete or have not yet been verified.
- **MISSING** — the required capability is not implemented sufficiently for production use.
- **EXTERNAL** — completion depends primarily on state/vendor enrollment, certification, credentials, contracts, policy/process, or another non-code prerequisite.
- **UNASSESSED** — temporary audit state only. No readiness conclusion has been made yet. Replace this status as evidence is collected.

## Evidence standard

Every row promoted to VERIFIED must identify, when applicable:

- exact frontend file/workspace/control,
- exact API route/service/function,
- exact database model/table/migration,
- backend authorization/validation rule,
- audit/event logging behavior,
- automated test or repeatable production verification,
- authoritative regulatory or contractual source,
- external credential/certification evidence where required.

## Branch and release governance

| Requirement | Scope | Status | Current evidence | Gap / next action |
|---|---|---:|---|---|
| Canonical production source is `feature/spire-ehr-platform` | Platform | VERIFIED | `SULANDRA_DEPLOYMENT_WORKFLOW.md` declares the branch canonical; old `main` is no longer the source for new work. | Change GitHub repository default-branch setting when ready; then verify all integrations. |
| Preserve historical old-main state before retirement | Platform | VERIFIED | `legacy-main-2026-08` preserves the old `main` tip from before branch retirement work. | Keep until branch transition is complete and independently backed up/tagged if desired. |
| Committed-secret detection in canonical CI | Security / SDLC | VERIFIED | `.github/workflows/ci.yml` runs `gitleaks/gitleaks-action@v2` with full checkout history. | Keep as a required check once branch protection is enabled. |
| Prisma/API/build/dependency validation | Security / SDLC | VERIFIED | Canonical CI runs Prisma generation, `npm run check`, browser JS syntax checks, `npm run build:web`, output validation, and production dependency audit. | Continue expanding application-specific tests. |
| Migration smoke testing | Database | VERIFIED | Canonical CI applies ordered SQL migrations to PostgreSQL 16 after bootstrapping the supported legacy base and checks expected platform tables. | Add migration assertions for future regulated-data tables as they become critical. |
| Canonical branch protection / required checks | Security / SDLC | EXTERNAL | GitHub repository setting, not enforceable by repository source code alone. | Enable protection/ruleset for `feature/spire-ehr-platform`; require CI and prohibit destructive force-push/deletion. |
| GitHub default branch points to canonical production branch | Platform | EXTERNAL | Repository setting currently remains outside source control. | Change default branch from old `main` to `feature/spire-ehr-platform` before retiring `main`. |
| All three Railway production services intentionally source canonical branch | Deployment | UNASSESSED | Deployment workflow documents three services but source-branch settings must be confirmed in Railway. | Verify Sulandra Static Website, `sulandra-website`, and `magnificent-education` source branch and latest successful canonical commit. |

## A. Client intake and master client record

| Requirement | Program | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| Referral/intake creates one durable client/patient identity | Both | UNASSESSED | Audit pending | Verify applicable source | Trace intake submission → API → `SpirePatient`/related records → Spire chart. |
| Demographics, contacts, identifiers, payer/Medicaid data persist | Both | UNASSESSED | Audit pending | Verify applicable source | Validate required fields, edits, history, authorization, and audit trail. |
| Emergency contacts, guardians/authorized representatives, consent relationships | Both | UNASSESSED | Audit pending | Verify applicable source | Verify structured data and access/use throughout Spire. |
| Admission/start-of-care status and program/company assignment | HHA | UNASSESSED | Audit pending | ODM/OAC/CMS source verification pending | Verify admission workflow and program-specific enforcement. |
| DODD individual/provider/service-home linkage | DODD | UNASSESSED | Audit pending | DODD/OAC source verification pending | Verify person, service, provider, home, authorization and ISP relationships. |

## B. OhioISP and DODD person-centered services

| Requirement | Program | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| OhioISP/imported plan storage and version history | DODD | UNASSESSED | Audit pending | Current DODD OhioISP requirements to verify | Trace document/version lifecycle and effective dates. |
| Outcomes/goals/tasks map into staff documentation | DODD | UNASSESSED | Audit pending | Current DODD documentation requirements to verify | Confirm staff charting is driven by authorized plan elements. |
| Individual-specific training evidence before assigned service | DODD | UNASSESSED | Employee 360 foundation exists; exact ISP-training linkage audit pending | DODD source verification pending | Verify assignment lockout/evidence/renewal workflow. |
| Rights, risks, behavior/safety protocols and restrictions are visible to authorized staff | DODD | UNASSESSED | Spire UI evidence exists in current chart; backend/source mapping audit pending | DODD/OAC source verification pending | Verify authoritative source, versioning, acknowledgement and least-privilege access. |

## C. Home-health clinical record

| Requirement | Program | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| Diagnoses, history, allergies, medications, vitals and clinical notes persist | HHA | UNASSESSED | Spire clinical UI exists; end-to-end audit pending | CMS/ODM/OAC requirements to verify | Trace UI → API → database → audit/version behavior. |
| Orders support lifecycle, changes, hold/discontinue and historical visibility | HHA | PARTIAL | Orders and medication-order management are implemented in Spire; recent MAR/order lifecycle defects were actively corrected. | Clinical/legal requirements to verify | Verify backend order authorization, e-signature/source, effective dates, discontinuation semantics and audit history. |
| MAR/eMAR correctly respects active orders and occurrence time | Both | PARTIAL | MAR supports scheduled occurrence grid, Due/Overdue separation, active-order filtering, administration actions and historical occurrence work. | Program-specific medication administration requirements to verify | Complete reliability/UAT, authorization, late/missed/refused/held rules, error handling and audit export verification. |
| Clinical documentation remains responsive and usable under normal workflow | Both | PARTIAL | MAR observer-loop defect was corrected with loop-safe runtime changes; production regression testing must continue. | Operational safeguard/readiness | Add deterministic MAR navigation/performance regression test and browser UAT gate. |

## D. Service documentation and electronic signatures

| Requirement | Program | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| Service note contains every required DODD field | DODD | UNASSESSED | Audit pending | Verify current OAC/DODD service documentation rule | Map each required field to schema, UI validation and export. |
| Start/stop time, service/location, staff, individual and service code are attributable | DODD | UNASSESSED | Audit pending | Verify DODD/ODM requirements | Trace from schedule/visit through completed note. |
| Electronic signature has signer identity, intent, timestamp and record linkage | Both | UNASSESSED | Employee 360 attestations already capture typed name/IP/device/timestamp; clinical/service-note signature implementation must be separately audited. | Verify HHA/DODD signature rules | Standardize signature evidence model and immutable linkage. |
| Required service-plan tasks cannot be silently omitted | DODD | UNASSESSED | Audit pending | Verify current DODD documentation rule | Enforce completion or exception reason server-side. |

## E. EVV and Alternate EVV

| Requirement | Program | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| Required EVV visit data elements are captured | Applicable Medicaid services | UNASSESSED | Audit pending | ODM/CMS/Sandata current requirements to verify | Map required elements to visit schema and validation. |
| GPS/location capture and exception handling | Applicable Medicaid services | UNASSESSED | Audit pending | ODM/Sandata source verification pending | Verify capture, consent/device behavior, edits and audit trail. |
| Alternate EVV outbound transaction format/API is implemented | Applicable Medicaid services | UNASSESSED | Audit pending | Current Ohio Alternate EVV technical specification required | Verify exact current payload schema and transport. |
| Sequence/version rules for client/employee/visit submissions | Applicable Medicaid services | UNASSESSED | Audit pending | Current Sandata/ODM technical specification required | Implement/verify monotonic transaction/version handling exactly as required. |
| EVV edits/corrections preserve reason and history | Applicable Medicaid services | UNASSESSED | Audit pending | Verify current 2026 edit-reason requirements from authoritative ODM/Sandata source | Backend must prevent unaudited replacement of submitted visits. |
| Alternate EVV vendor certification/testing complete | Applicable Medicaid services | EXTERNAL | No code can prove state certification | ODM/Sandata certification evidence required | Register/test/demo/obtain production credentials before representing system as certified Alt EVV. |
| EVV-to-claim matching blocks unvalidated billable events | Applicable Medicaid services | UNASSESSED | Revenue-cycle tables exist; actual enforcement audit pending | Current ODM claims-matching requirements to verify | Trace visit → EVV acknowledgement → billable service event → claim release. |

## F. Scheduling, staffing and authorization controls

| Requirement | Program | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| Staff assignment respects role/credential/location restrictions | Both | UNASSESSED | Employee 360 applicability and location scoping exist; scheduler enforcement audit pending | Program requirements to verify | Prove server-side schedule lockouts for expired/missing credentials and incompatible roles. |
| Service authorization/units are checked before scheduling/delivery | DODD | UNASSESSED | Audit pending | DODD/ODM authorization rules | Prevent service beyond authorized type/date/unit limits. |
| Overtime and overlapping/conflicting service checks | DODD | UNASSESSED | Audit pending | Current DODD/ODM billing rules to verify | Validate exact rule and implement server-side guardrails. |

## G. Billing, PNM/eMBS/EDI and denial prevention

| Requirement | Program | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| Billable event is derived from completed/authorized service evidence | Both | UNASSESSED | `RevenueCycleServiceEvent` table existence verified by CI; business-rule enforcement audit pending | Program-specific billing requirements | Trace documentation → validation → billable event. |
| DODD unit restrictions are programmatically enforced | DODD | UNASSESSED | Audit pending | Current OAC/DODD rules required | Build verified rule table and server-side denial prevention. |
| Claims are held for missing/inconsistent EVV when EVV applies | Both | UNASSESSED | Audit pending | Current ODM matching rules required | Implement reconciliation gate with explicit exception workflow. |
| PNM/eMBS workflow/integration is operational | Both | UNASSESSED | Audit pending | ODM/DODD source verification pending | Distinguish portal-assisted workflow from true system integration. |
| X12 837P/837I export/clearinghouse submission is operational where applicable | HHA/claims | UNASSESSED | Audit pending | Current ODM companion guide/clearinghouse requirements required | Validate transaction type, payer routing, provider IDs, acknowledgements and resubmissions. |
| Denials/remittance corrections are traceable to source visit/documentation | Both | UNASSESSED | Audit pending | Payer/ODM requirements | Build/verify denial workqueue and provenance. |

## H. Workforce, credentials and background screening

| Requirement | Program | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| Central requirement catalog and renewal/reminder engine | Both | PARTIAL | `EMPLOYEE_360_COMPLIANCE.md` documents backend-authoritative applicability, evidence review, renewals, escalations, deduplication and scheduler lease. | Exact program-specific requirement catalog still must be verified | Audit implementation against documentation and populate Ohio-specific requirements. |
| Employee-submitted evidence requires authorized approval | Both | PARTIAL | Employee 360 design specifies PENDING → APPROVED/REJECTED with reviewer scope validation. | Verify applicable requirement | Confirm implementation/API tests and production authorization. |
| Required exclusion/database checks are tracked | Both | UNASSESSED | Audit pending | Verify exact HHA/DODD screening lists and frequency from current authoritative sources | Build requirement catalog and immutable result/date/reviewer evidence. |
| BCI/FBI residency-based background rules are enforced | Both | UNASSESSED | Audit pending | Verify current Ohio rules | Add applicability logic and assignment/work lockout where required. |
| License/certification expiration can prevent incompatible assignment/work | Both | UNASSESSED | Compliance engine exists; operational lockout audit pending | Program requirements to verify | Connect compliance status to scheduling/clinical authorization where required. |

## I. Incident management — UI/MUI and quality review

| Requirement | Program | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| Incident intake distinguishes ordinary/internal incidents from DODD UI/MUI pathways correctly | DODD | UNASSESSED | Incident workspace exists in Spire; classification/enforcement audit pending | Current DODD MUI/UI rule required | Map classifications, immediate actions, notifications and deadlines. |
| Monthly UI log per individual/program | DODD | UNASSESSED | Audit pending | DODD source verification pending | Verify monthly aggregation, supervisor review and retention. |
| MUI reporting/escalation/deadline workflow | DODD | UNASSESSED | Audit pending | DODD source verification pending | Implement deadline-aware escalation and evidence of external submission. |
| Annual incident/MUI analysis | DODD | UNASSESSED | Audit pending | DODD source verification pending | Generate auditable annual analysis with trends/prevention actions. |
| OhioITMS external reporting completion | DODD | EXTERNAL | Internal application cannot prove state portal submission by UI existence alone. | OhioITMS/DODD process evidence | Record submission reference/status and preserve evidence without claiming unsupported direct integration. |

## J. Security, privacy, access and auditability

| Requirement | Scope | Status | Application evidence | Regulatory/source evidence | Gap / remediation |
|---|---|---:|---|---|---|
| Backend role authorization exists | Platform | PARTIAL | Prisma defines operational roles including Administrator, Program Manager, Auditor, DSP, Delegating Nurse, LPN, RN, House Manager, HR Manager, Scheduler and Billing Specialist. | HIPAA/program minimum-necessary requirements to assess | Audit each route for server-side role + organization + location + client scope. |
| Authentication/session security | Platform | UNASSESSED | Audit pending | HIPAA Security Rule risk analysis required | Verify token/session lifetime, storage, revocation, reset flow, brute-force protection and MFA strategy. |
| Organization/location/client isolation | Platform | UNASSESSED | Employee 360 documentation states location-scoped authorization; whole-platform audit pending | Minimum necessary / operational requirements | Perform horizontal and vertical authorization tests across APIs. |
| Audit logging for regulated record changes | Platform | UNASSESSED | Backend owns audit behavior per deployment architecture; exact coverage audit pending | Program/HIPAA requirements | Inventory create/update/delete/sign/admin events and prove actor/time/source/change history. |
| Encryption in transit and at rest | Platform | UNASSESSED | Infrastructure/code/configuration audit pending | HIPAA risk analysis + vendor infrastructure evidence | Verify TLS, database/storage encryption and backup handling. |
| Backup/restore and continuity testing | Platform | UNASSESSED | Audit pending | HIPAA contingency planning + business continuity requirements | Document RPO/RTO, backup retention and perform restore test. |
| Record retention and legal hold | Both | UNASSESSED | Audit pending | Exact HHA/DODD/ODM retention periods must be verified by record type | Implement retention schedule without relying on one blanket period until sources are verified. |

## K. Reliability and clinical-workflow safety

| Requirement | Scope | Status | Application evidence | Gap / remediation |
|---|---|---:|---|---|
| Production clinical workspace does not freeze during ordinary navigation | Spire | PARTIAL | MAR feedback-loop defects were fixed with root-only observer guards and new runtime versions. | Add automated navigation soak/regression checks; continue live UAT across All/Scheduled/PRN/Due/Overdue/date navigation. |
| Failed network/API writes cannot appear successfully charted | Spire | UNASSESSED | Audit pending | Test save failure, timeout, retry, duplicate submission and refresh reconciliation. |
| Concurrent edits do not silently overwrite regulated records | Platform | UNASSESSED | Audit pending | Verify optimistic locking/versioning or equivalent conflict controls for applicable records. |
| Browser/UI state cannot override backend truth | Platform | PARTIAL | Employee 360 explicitly defines backend as authoritative; platform-wide audit pending. | Test every regulated workflow for server-side validation independent of UI controls. |

## External prerequisites register

The following must be tracked independently from code because completion requires external evidence:

- GitHub canonical-branch default setting and branch protection/ruleset.
- Railway source-branch configuration for all three production services.
- Ohio Medicaid/DODD provider enrollment and organizational credentials as applicable.
- Alternate EVV registration, testing, certification and production credentials if Sulandra uses Spire as an Alternate EVV vendor/system.
- PNM/eMBS/OH|ID access and any required EDI/clearinghouse enrollment.
- OhioITMS access/reporting process.
- BAAs/vendor agreements and infrastructure security evidence where PHI is handled by vendors.
- Agency policies, workforce training, sanctioning, incident response, contingency plan, HIPAA risk analysis and other administrative safeguards that software alone cannot satisfy.

## Audit order

Perform the implementation audit in this order so downstream billing is never marked ready before its source documentation is ready:

1. Client identity/intake and organization/program assignment.
2. OhioISP/service plan and home-health clinical source records.
3. Workforce/credential authorization.
4. Scheduling and service authorization.
5. Visit/service documentation and signatures.
6. Medication/MAR/clinical workflows.
7. EVV capture and external transmission.
8. Incident/UI/MUI workflows.
9. Billing-unit validation and EVV reconciliation.
10. Claims/EDI/PNM/eMBS and denial correction.
11. Retention, audit export, security, backup/restore and disaster recovery.
12. End-to-end production UAT for each employee role and each company/program.

## Promotion rule

No row may be promoted to VERIFIED without evidence recorded in this file or a linked repository test/evidence artifact. External certification must never be inferred from code.