# SPIRE Epic-reference parity program

## Reference parity gate

SPIRE is being brought to **functional and workflow parity with the user-supplied 66-page 2020 “EPIC Guide: Writing Notes and Finding Information” before product work is allowed to move into explicitly beyond-reference features.** The UI must remain SPIRE/Sulandra-branded; Epic trademarks, logos, proprietary artwork and screenshots are reference material only.

The supplied guide is not an exhaustive Epic product inventory. It explicitly focuses on finding scheduled patients, gathering information, writing notes, arranging follow-up, identifying a cosigner and closing an encounter, and it explicitly says that Inbox details and Madison clinic-specific functions are not covered. Therefore, “all functions present in Epic” cannot truthfully be certified from this document alone. This file is the parity ledger: it makes the guide-covered scope auditable and establishes the gate for the broader current Epic product inventory.

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
| ECG chart category | 39, 51 | ECG/EKG results surfaced as a dedicated Chart Review category | Implemented in Chart Review v2 adapter |
| Referrals / Procedures / Episodes / Letters | chart screenshots | Dedicated reference categories backed by orders, program enrollment and clinical documents | Implemented in Chart Review v2 adapter |
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

## Current official Epic product-scope inventory

This section is the broader parity gate requested by the owner. It was refreshed on **2026-08-11** from Epic's public product pages and open.epic.com. It is intentionally capability-based rather than trademark-copying. Sources include:

- https://www.epic.com/software/health-systems-and-clinics/
- https://www.epic.com/software/acute-and-inpatient-care/
- https://www.epic.com/software/specialties/
- https://www.epic.com/software/patient-experience/
- https://www.epic.com/software/access-and-revenue-cycle/
- https://www.epic.com/software/interoperability/
- https://www.epic.com/software/population-health/
- https://www.epic.com/software/post-acute/
- https://www.epic.com/software/payers/
- https://www.epic.com/software/convenient-care/
- https://www.epic.com/software/ai/
- https://open.epic.com/

Epic's public catalog states that its platform spans acute/inpatient care, primary care, more than 60 specialties, post-acute care, healthcare intelligence, population health, patient experience, capacity optimization, access/revenue cycle, payer workflows and interoperability. The specialties catalog specifically includes cardiology, dental, dermatology, emergency/urgent care, endoscopy, genetics/genomics, lab, nephrology/dialysis, obstetrics/L&D/fertility, oncology, ophthalmology, orthopaedics, radiology, surgery/anesthesia and transplant. The public acute-care catalog includes hospital medicine, nursing/allied health, critical care, inpatient pharmacy, infection control, case management, patient experience and unified communications.

### Enterprise parity ledger

`DONE` means a production-capable SPIRE implementation exists now. `PARTIAL` means the foundation exists but does not yet cover the complete published Epic capability family. `MISSING` is a parity blocker.

| Capability family | SPIRE status | Existing SPIRE foundation / required next gate |
| --- | --- | --- |
| Ambulatory longitudinal chart | DONE | Chart Review, Results Review, notes, problems, diagnoses, allergies, meds, orders, timeline |
| Scheduling / access | PARTIAL | Appointment lifecycle, provider/resource calendar, waitlist and transport exist; expand self-scheduling, specialty scheduling, slot optimization, referral-driven scheduling |
| In Basket / clinical messaging | PARTIAL | In Basket 2.0, threads, pools and communications exist; expand complete result routing, pools, delegated coverage, escalation and message-type inventory |
| Orders / CPOE | PARTIAL | Order composer and medication orders exist; expand order sets, preference lists, duplicate-test checks, diagnosis association, protocols and specialty orders |
| Medication management | PARTIAL | Medication workspace, qualification guard and eMAR exist; expand formulary, real-time benefit, pharmacy verification, dispensing, inventory, e-prescribing and full med reconciliation |
| Nursing / allied-health inpatient workspace | PARTIAL | Vitals/flowsheets, assessments, eMAR, shift workspace and care plan exist; add unified nursing Brain, I&O, LDA/device flows, handoff, education and discharge workflow |
| Hospital medicine / inpatient | PARTIAL | Encounter, notes, orders, results and care plans exist; add admission-transfer-discharge, rounding lists, inpatient navigator, discharge milestones and hospital course workflow |
| Critical care | MISSING | Add ICU-specific device data, drips, ventilator workflows, goals, rounding and deterioration surveillance |
| Infection prevention | PARTIAL | Risk/incident foundations and microbiology exist; add infection surveillance, isolation registry, device days, HAI analytics and regulatory reporting |
| Case management / utilization review | PARTIAL | Tasks, authorizations and care-plan foundations exist; add status review, medical necessity, payer communication, placement and discharge barriers |
| Emergency / urgent care | MISSING | Add triage, tracking board, acuity, ED navigator, disposition, trauma/rapid workflows and urgent-care rapid documentation |
| Perioperative / surgery / anesthesia | MISSING | Add pre-op, intra-op, PACU, surgical scheduling, implants, counts, anesthesia record, procedure documentation and charge capture |
| Obstetrics / L&D / fertility | MISSING | Add prenatal episode, fetal monitoring integration, labor flowsheets, delivery/newborn linkage and fertility-cycle workflows |
| Oncology / hematology | MISSING | Add protocols, treatment plans, chemo verification/admin, cycles, staging, radiation tracking and registry reporting |
| Cardiology | PARTIAL | ECG chart category and result storage exist; add structured cardiovascular procedure reporting, hemodynamics and PACS/ECG integration |
| Radiology / imaging | PARTIAL | Imaging results and document/media support exist; add modality worklists, protocoling, technologist workflow, PACS launch, actionable-finding tracking |
| Laboratory / pathology | PARTIAL | Lab, microbiology and pathology results exist; add specimen lifecycle, collection, accessioning, bench workflow, verification and regulatory controls |
| Endoscopy | MISSING | Add procedure scheduling, findings/image linkage, procedure report and quality measures |
| Dental | MISSING | Add odontogram, periodontal charting, treatment planning and dental imaging workflows |
| Ophthalmology / optometry | MISSING | Add eye exam structured data, diagnostic testing, imaging and procedure workflows |
| Orthopaedics | MISSING | Add body-location documentation, procedure workflows, injections, PROMs and registry export |
| Nephrology / dialysis | MISSING | Add dialysis treatment plans, sessions, interdisciplinary care plans and quality reporting |
| Transplant | MISSING | Add evaluation, listing, organ episode, transplant surgery, follow-up and registry workflow |
| Genetics / genomics | MISSING | Add genetic-test results, variants, pedigrees, pharmacogenomics and tumor biomarkers |
| Dermatology | MISSING | Add lesion/body-map tracking, specimen workflow, image comparison and dermatology documentation |
| Post-acute / SNF / LTC / rehab | PARTIAL | SCLS residential care foundation is strong; add MDS/regulatory workflows, rehab discipline plans, therapy thresholds and post-acute transitions |
| Patient portal / digital front door | MISSING | Build patient/proxy portal for scheduling, check-in, results, messages, refills, bills, education, consent and records |
| Bedside patient experience | MISSING | Add inpatient patient/family view of plan, team, education, schedule and results |
| Remote patient monitoring / wearables | MISSING | Add device enrollment, readings, alert thresholds, care-plan tasks and longitudinal monitoring |
| Telehealth / virtual care | PARTIAL | Scheduling and communications foundations exist; add secure visit room, device testing, consent, virtual rooming and documentation workflow |
| Interoperability / HIE | PARTIAL | External Records and document exchange foundation exists; add standards-based FHIR/USCDI, C-CDA, Direct, referral exchange, HIE reconciliation and patient-directed sharing |
| Community-provider portal | MISSING | Add limited chart, orders/referrals, status notifications and secure collaboration for external partners |
| Access / registration | PARTIAL | Client intake and demographics exist; add enterprise registration, identity matching, coverage, guarantor, estimates, check-in and arrival management |
| Referral / authorization | PARTIAL | Authorizations/EVV exist; add closed-loop referral lifecycle, specialty routing, payer authorization evidence and denial prevention |
| Professional/facility revenue cycle | PARTIAL | Revenue-cycle foundation exists; add charge router, coding workqueues, claims, remittance, denials, payment plans, estimates and financial assistance |
| Population health / care management | PARTIAL | Care-plan and analytics foundations exist; add registries, risk stratification, care gaps, claims aggregation, outreach and quality submission |
| Health plan / payer administration | MISSING | Add enrollment, benefits, claims, capitation, utilization management, provider network and member/provider portals |
| Capacity / patient flow | PARTIAL | Scheduling, service homes and workforce data exist; add bed management, transfer center, predicted discharge, staffing/census optimization and command center |
| Analytics / enterprise intelligence | PARTIAL | Enterprise analytics and reports exist; add governed semantic metrics, cohort exploration, self-service dashboards, data marts and quality registries |
| Research | MISSING | Add study registry, recruitment, consent, cohort matching, research orders, protocol billing and data extracts |
| Supply / inventory | MISSING | Add item master, supply usage, par levels, implants, lot/serial tracking and purchasing integration |
| Mobile clinician workflows | PARTIAL | Responsive web works; add native-equivalent secure chart review, schedule, inbox, orders, image capture, barcode scanning and push alerts |
| Unified communications | PARTIAL | Secure communications exist; add real-time secure chat, roles/presence, critical push alerts, voice/video and nurse-call integration |
| AI-assisted clinical work | MISSING | Do not add until the parity gates for the underlying workflows are complete and governed; later include safe drafting/summarization/insight workflows with human review |
| Security / privacy / audit | PARTIAL | Company boundaries, role controls and chart audits exist; expand break-glass, consent segmentation, privacy restrictions, release-of-information, downtime and security analytics |
| Interoperability APIs / interfaces | PARTIAL | REST backend exists; add standards-focused public API/interface layer, app registration, OAuth scopes, interface monitoring and event delivery |

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
10. no silent synthetic clinical data;
11. protected-health-information minimum-necessary access;
12. reliable recovery from network failure and duplicate submissions;
13. explicit provenance for imported/external data;
14. human confirmation for high-impact clinical or financial actions.

## Broader Epic parity gate

The enterprise ledger above is the governing backlog. A capability family cannot move to `DONE` merely because a navigation tile or static mockup exists. It must have persisted data, company/patient scope enforcement, role permissions, audit logging, validation, meaningful empty/error states, and production verification.

Full Epic parity is not allowed to be claimed until every `PARTIAL` and `MISSING` family relevant to the Sulandra operating model has been implemented or explicitly documented as out-of-scope by the owner. Product names and proprietary artwork are not parity requirements; the clinical/operational capabilities are.

## Do not start the beyond-reference phase early

Capabilities intended to make SPIRE “better than Epic” belong after the parity gates above. Improvements that directly make an existing reference workflow safer or more usable—such as preserving a hidden note draft instead of making it appear lost—are allowed because they are parity improvements rather than unrelated feature expansion.
