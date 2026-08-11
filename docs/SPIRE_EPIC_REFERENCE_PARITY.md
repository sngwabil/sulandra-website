# SPIRE Epic-reference parity program

## Reference parity gate

SPIRE is being brought to **functional and workflow parity with the user-supplied 66-page 2020 “EPIC Guide: Writing Notes and Finding Information” before product work is allowed to move into explicitly beyond-reference features.** The UI must remain SPIRE/Sulandra-branded; Epic trademarks, logos, proprietary artwork and screenshots are reference material only.

The supplied guide is not an exhaustive Epic product inventory. It explicitly focuses on finding scheduled patients, gathering information, writing notes, arranging follow-up, identifying a cosigner and closing an encounter, and it explicitly says that Inbox details and Madison clinic-specific functions are not covered. Therefore, “all functions present in Epic” cannot truthfully be certified from this document alone. This file is the first parity ledger: it makes the guide-covered scope auditable and establishes the gate for the broader Epic module inventory.

## What the reference guide establishes

| Reference workflow | Guide pages | SPIRE implementation target | Status after this parity pass |
| --- | ---: | --- | --- |
| Provider Dashboard | 8 | Clinical dashboard with Schedule Glance, In Basket Glance and clinical shortcuts | Implemented |
| In Basket entry point | 8 | Persistent top-level In Basket plus glance counts and existing In Basket 2.0 | Implemented; deeper Epic Inbox inventory still requires another source |
| Schedule setup and personal schedule | 9–13 | Date-based schedule, patient statuses, provider filter/pin, monthly calendar, open chart / pre-chart | Implemented |
| Encounter → Find Patient | 14–15 | Chart Search and patient opening from Schedule / Census / Dashboard | Implemented |
| SmartPhrase Manager / My SmartPhrases | 16–24 | Create/manage reusable phrases with user ownership and sharing model | Implemented |
| Dot phrase entry and F2 navigation | 25 | `.` suggestions in note editor plus F2 jump to `***`, bracketed and angle-bracket fields | Implemented |
| Note speed buttons | 26–30 | Personal quick actions and SmartPhrase buttons | Implemented |
| Workspace personalization | 31–33 | Reorder/hide chart tabs and apply a reference tab preset | Implemented |
| Reference tab order | 33 | Chart Review → Results Review → Wrap-Up → Plan, with SPIRE equivalents for Rooming/outside records/communications | Implemented |
| Wrap-Up patient instructions / AVS | 34–37 | Patient Instructions, live AVS preview, stored AVS | Implemented |
| Chart Review | 38–39 | Chronological record review with clinical categories | Implemented |
| Results Review | 40–43 | Date range, newest/oldest, abnormal-only, saved views, selectable trending | Implemented |
| ECG chart category | 39, 51 | ECG/EKG results surfaced as a dedicated Chart Review category | Implemented |
| Referrals / Procedures / Episodes / Letters | chart screenshots | Dedicated reference categories backed by orders, program enrollment and clinical documents | Implemented |
| Outside records | 48–49 | External Records plus Documents / Media | Implemented |
| Microbiology | 39, 50 | Dedicated microbiology results | Implemented |
| Imaging | 39, 51 | Imaging study review; external PACS launch remains an integration dependency | Core chart support implemented; PACS integration requires configured imaging endpoint |
| Medications | 52–53 | Medication workspace, medication review, eMAR and reconciliation | Implemented |
| Note-pane recovery | 54–55 | Hide/show note editor without losing the draft | Implemented and safer than the reference behavior |
| Follow-up timeframe | 57 | Structured follow-up during Wrap-Up | Implemented |
| Level of service | 58 | Structured service level at encounter closure | Implemented |
| Attending cosigner | 58 | Encounter participant cosigner plus existing note-level cosignature | Implemented |
| GC / GE / GT modifiers | 58 | Structured closure modifiers stored with the AVS | Implemented |
| Sign visit / close encounter | 58 | Signed encounter closure, status history and clinical audit | Implemented |
| Haiku-style mobile access | 59 | Responsive SPIRE chart/schedule/inbox experience | Web-responsive foundation implemented; native-app parity is a separate platform project |
| Dragon Medical One-style dictation | 60–65 | Browser-supported microphone dictation inside note workflow | Implemented where browser speech recognition is available |

## Reference layout mapping

The guide recommends a chart workspace ordered around Chart Review, Results Review, Wrap-Up, Plan, Rooming, Care Everywhere, Mindscape, communication management and Graphs. SPIRE preserves the clinical purpose without copying proprietary labels or artwork:

- **Rooming** → `Vitals & Flowsheets`, with scheduling states for Check In, Room and Start Visit.
- **Care Everywhere / Mindscape** → `External Records` plus `Documents / Media`.
- **Communication Management** → `Communications` plus `In Basket`.
- **Graphs** → selectable result trending and flowsheet trends.
- Additional SPIRE tabs such as MAR, Care Plan / ISP, Assessments, Incidents & Risk, Authorizations and Timeline remain available after the reference sequence.

## Safety and data-integrity requirements

Reference parity is not visual-only. Every clinical workflow added to SPIRE must preserve:

1. organization and selected-company isolation;
2. patient assignment / authorized-chart checks;
3. role-based write restrictions;
4. chart-access audit events;
5. mutation audit events;
6. immutable signed documentation rules;
7. explicit encounter closure;
8. stored patient instructions and AVS content;
9. no public clinical-document URLs;
10. no silent synthetic clinical data.

## Broader Epic parity gate

Before anyone claims **full Epic parity**, a second inventory must cover the Epic capabilities that this 2020 guide does not document. At minimum, that inventory needs authoritative source material for:

- complete In Basket categories, routing, pools and result management;
- ambulatory and inpatient order workflows and order sets;
- medication prescribing, formulary, pharmacy, interaction and reconciliation workflows;
- inpatient navigator/flowsheet/rounding workflows;
- emergency department workflows;
- operating room / perioperative workflows;
- labor and delivery;
- oncology;
- radiology/PACS and cardiology integrations;
- laboratory and microbiology interfaces;
- referrals, authorizations and payer workflows;
- patient portal / proxy / messaging capabilities;
- health information exchange and external-record reconciliation;
- charge capture, coding, professional/facility billing and revenue-cycle workflows;
- registries, population health, quality, reporting and analytics;
- device integration;
- mobile/native workflows;
- interoperability APIs and standards;
- downtime, break-glass, audit, privacy and release-of-information functions;
- specialty-specific modules not represented in the supplied guide.

Those functions must be compared against current SPIRE one by one, implemented with tests, and marked complete in this ledger before a “full Epic parity” statement is allowed.

## Do not start the beyond-reference phase early

Capabilities intended to make SPIRE “better than Epic” belong after the parity gates above. Improvements that directly make an existing reference workflow safer or more usable—such as preserving a hidden note draft instead of making it appear lost—are allowed because they are parity improvements rather than unrelated feature expansion.
