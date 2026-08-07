# Spire Clinical Record Architecture

Spire is Sulandra Health's clinical record application. It is a distinct application inside the Sulandra Health platform and is modeled after the workflow concepts visible in the supplied EPIC training guide: provider dashboard, schedule, in-basket/inbox, patient chart context, chart review, results review, notes, smart phrases/speed buttons, medication review, outside records, wrap-up, follow-up and encounter closure. Spire must not present itself as the employee portal, HR platform, payroll system, or company intranet.

## Product boundaries

- Sulandra Health platform: authentication, employee/admin portal, Employee 360, scheduling/workforce, education, HR, payroll, benefits, intranet, support.
- Spire: patient/client charts, encounters, clinical documentation, orders, medications/MAR, results, assessments, care plans/ISP, incidents/risk, authorizations, outside records, communications related to care, chart-level tasks and clinical reporting.
- Single Sulandra employee login; Spire enforces clinical role, organization, program, home and client assignment scopes on every protected API route.

## Spire application shell

Primary navigation:

1. Home / Clinical Dashboard
2. Schedule
3. In Basket
4. Patient Lists / Census
5. Chart Search
6. My Tasks
7. Orders
8. Reports
9. Tools

Patient chart workspace:

- Patient Header / Storyboard
- Chart Review
- Results Review
- Notes
- Plan
- Medications
- MAR
- Orders
- Care Plan / ISP
- Assessments
- Vitals & Flowsheets
- Incidents & Risk
- Authorizations
- Documents / Media
- Care Everywhere / External Records
- Communications
- Wrap-Up / AVS / Follow-Up
- Timeline

Personalization:

- Favorite/pinned tools
- Reorderable chart tabs
- SmartPhrase manager
- SmartText/templates
- Speed buttons
- Saved patient lists
- Saved result filters
- Saved workspaces

## Foundational data domains

### Patient identity and chart context
- SpirePatient
- SpirePatientIdentifier
- SpirePatientContact
- SpireEmergencyContact
- SpirePatientProgramEnrollment
- SpirePatientHomeAssignment
- SpirePatientCareTeam
- SpirePatientFlag
- SpirePatientAllergy
- SpirePatientDiagnosis
- SpirePatientProblem

### Scheduling and encounters
- SpireAppointment
- SpireEncounter
- SpireEncounterParticipant
- SpireEncounterStatusHistory
- SpireVisitFollowUp
- SpireEncounterChargeReadiness

### Clinical documentation
- SpireClinicalNote
- SpireClinicalNoteVersion
- SpireNoteCosigner
- SpireSmartPhrase
- SpireSmartPhraseShare
- SpireSmartText
- SpireSpeedButton
- SpirePatientInstruction
- SpireAfterVisitSummary

### Results, diagnostics and flowsheets
- SpireResult
- SpireResultComponent
- SpireResultFlag
- SpireResultTrendDefinition
- SpireVitalSign
- SpireFlowsheetRow
- SpireFlowsheetEntry
- SpireImagingStudy
- SpireMicrobiologyResult
- SpirePathologyResult

### Medications and MAR
- SpireMedicationOrder
- SpireMedicationOrderVersion
- SpireMedicationAdministration
- SpireMedicationReconciliation
- SpireMedicationAllergyInteractionReview

### Orders and authorizations
- SpireOrder
- SpireOrderStatusHistory
- SpireProviderOrderDocument
- SpireServiceAuthorization
- SpireAuthorizationUnitLedger

### Care plans and assessments
- SpireCarePlan
- SpireCarePlanGoal
- SpireCarePlanIntervention
- SpireCarePlanRisk
- SpireAssessment
- SpireAssessmentResponse
- SpireClientSpecificTrainingRequirement

### Incidents and safety
- SpireIncident
- SpireIncidentParticipant
- SpireIncidentFollowUp
- SpireRiskAlert

### Documents and external records
- SpireClinicalDocument
- SpireClinicalDocumentVersion
- SpireExternalRecordSource
- SpireExternalRecord
- SpireMediaItem

### Communications and tasks
- SpireClinicalMessage
- SpireClinicalMessageRecipient
- SpireInBasketItem
- SpireClinicalTask
- SpireClinicalReminder

### Security, audit and configuration
- SpireClinicalAuditEvent
- SpireChartAccessEvent
- SpireEmployeeHomeAssignment
- SpireEmployeeClientAssignment
- SpireWorkspacePreference
- SpirePinnedTool
- SpireTabPreference

## Required workflow behavior

### Schedule -> chart -> encounter
Users can open a patient/client from Schedule or Patient Lists, enter chart context, review prior information, write documentation, place/review orders, perform medication workflows, set follow-up, and close/sign the encounter.

### Chart Review
Chronological chart history with tabs for encounters, notes, labs, microbiology, pathology, imaging, ECG, medications, referrals, procedures, orders, episodes, letters/documents and media.

### Results Review
Dense results table with configurable date range, newest/oldest ordering, result grouping, abnormal flags and trend selection.

### Notes
Draft/autosave, templates, SmartPhrases using dot triggers, SmartText, speed buttons, version history, cosignature, signature and amendment workflow.

### In Basket
Clinical messages, result routing, document review, cosign requests, refill/task requests, patient/guardian messages and care-team tasks.

### Wrap-Up
Follow-up timeframe, patient instructions, AVS, communications, required checklist, level/service readiness, cosigner and encounter sign/close.

## Security requirements

- Organization isolation on every query.
- Client assignment/home/program scopes before chart access.
- Role-based write permissions.
- Auditor/read-only behavior where applicable.
- Chart access logging for view/download actions.
- Before/after audit on clinical mutations.
- Signed note versions are immutable; amendments create new versions.
- No clinical document access through public URLs.
- Clinical exports require explicit authorized action and audit event.

## Frontend layout target

Spire should use a dense desktop-first EHR layout inspired by the supplied reference without copying Epic branding or proprietary artwork:

- Thin blue global toolbar.
- Persistent patient storyboard/identity rail when a chart is open.
- Horizontal workspace tabs.
- Dense table-based clinical views.
- Right-side note/task pane where useful.
- Reorderable/pinnable workspace tools.
- Full viewport usage with responsive tablet/mobile adaptation.
- Spire branding and Sulandra colors only.

## Implementation order

1. Database migration and shared clinical authorization layer.
2. Spire application shell and authenticated routing.
3. Clinical dashboard, Schedule, In Basket, Census and Chart Search.
4. Patient Storyboard + Chart Review + Timeline.
5. Results Review + Vitals/Flowsheets.
6. Notes + SmartPhrases + SmartText + Speed Buttons + signing/cosign.
7. Medications + MAR + reconciliation.
8. Orders + authorizations + provider documents.
9. Care Plan/ISP + assessments + client-specific training.
10. Incidents/risk + clinical documents/media/external records.
11. Communications + tasks + reminders.
12. Wrap-Up/AVS/follow-up/encounter close.
13. Reporting, exports, mobile layout, accessibility, API/integration/E2E tests.
