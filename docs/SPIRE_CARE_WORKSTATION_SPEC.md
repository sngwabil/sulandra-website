# S.P.I.R.E. Care Workstation

This is the product direction for S.P.I.R.E. going forward: a Sulandra-native home-health and waiver documentation workstation, not an Epic clone.

## Deployment contract

Follow the repository README. Vercel builds the static site to `dist-web`; Railway runs the Node/Express API and PostgreSQL migrations. Browser calls remain same-origin `/api/*` and `/public/*`. Run `npm ci --include=dev`, `npm run db:generate`, `npm run check`, and `npm run build:web` before production deployment. Frontend success states must only appear after the production endpoint confirms persistence.

## Core experience

### Persistent client rail

The left rail remains visible while charting and includes:

- large client photo managed from S.P.I.R.E. Admin
- legal/preferred name, DOB, age, pronouns if collected
- Medicaid ID/MRN-equivalent internal identifier
- service address/home, guardian/POA, emergency contacts
- primary provider, pharmacy, diagnoses, allergies
- code status/advance directives
- mobility, fall risk, communication method, diet, aspiration/choking alerts
- seizure, elopement, behavioral, skin, oxygen, diabetic and other critical alerts
- current service programs and authorization periods

### Intake -> chart mapping

S.P.I.R.E. must never require staff to re-key information that is already collected in the client intake/admission workflow. Intake data maps into canonical chart domains:

1. Demographics
2. Contacts/guardian/legal status
3. Insurance/Medicaid/service authorization
4. Diagnoses and medical history
5. Allergies
6. Medication reconciliation
7. Providers/pharmacy
8. Functional status/ADLs/IADLs
9. Mobility/transfers/equipment
10. Nutrition/diet/swallowing
11. Communication/sensory/cognition
12. Behavioral supports/restrictive measures
13. Safety risks and emergency plans
14. Sleep/wake routine
15. Elimination/toileting
16. Skin/wound risk
17. Respiratory/oxygen
18. Diabetes/endocrine
19. Seizure/neurologic
20. Pain
21. Advance directives
22. ISP outcomes/goals/support instructions
23. Nursing plan of care/physician orders
24. Transportation/NMT needs
25. Personal funds support
26. Remote-support/assistive-technology needs
27. Individual-specific training requirements

Each mapped field retains provenance: source intake submission, original field name, imported timestamp, reviewer, last edit timestamp, and edit history.

## Chart tabs

- Summary
- Demographics
- ISP & Outcomes
- Daily Support / HPC
- Sleep / Wake
- ADLs & IADLs
- Behavior / Restrictive Measures
- Community & Transportation
- Personal Funds
- eMAR / TAR
- Vitals
- Clinical
- Orders
- Care Coordination
- Incidents (UI/MUI)
- Documents
- Training / Delegation
- Audit / Compliance

Every ISP outcome or support instruction is represented as a chartable row/card. Staff document service delivered, response/progress, assistance level, exception, note, and start/end time directly against the ISP item.

## Sleep / Wake flowsheet

The Sleep/Wake tab supports reusable schedules configured per client:

- start time and end time
- recurrence/frequency: 15 min, 30 min, 60 min, 2 hr, custom minutes, or exact scheduled checkpoints
- state: Sleeping, Awake, Out of bed, Restless, Bathroom, Snack/Drink, Repositioned, Safety check completed, Other
- one-click Sleep and Awake controls
- optional free-text note beside every observation
- automatic author and timestamp
- actual observation time, with permitted late-entry/back-chart time as a separate event time
- current-time column insertion
- past-time column insertion requiring reason for late entry
- correction/addendum workflow instead of silent overwrite
- overnight shift spanning midnight
- exceptions automatically highlighted (e.g. unexpected prolonged wakefulness)
- trend card: total sleep, awakenings, longest sleep block, overnight notes

## Universal flowsheet engine

Admin-defined flowsheets support rows, groups, columns, value types and rules. Columns can use current time or an allowed past event time. Every saved cell stores author, created timestamp, event timestamp, late-entry reason when applicable, correction history, and source device/method where available.

Value types include checkbox, yes/no, single select, multi-select, numeric, text, time, duration, body site, laterality, quantity/unit, pain scale, image/attachment, signature, and structured note.

## Clinical tab - nursing catalog

Nurses can activate only the modules needed for an individual client. Catalog entries create structured flowsheets, care tasks, orders, note templates, alerts and trending where appropriate.

### Assessment and visits

- RN comprehensive assessment
- LPN skilled visit
- supervisory visit
- recertification / reassessment
- change-in-condition assessment
- post-hospital / transition-of-care visit
- head-to-toe assessment
- focused system assessment
- pain assessment/reassessment
- fall-risk assessment
- skin-risk assessment
- medication reconciliation
- home/environmental safety assessment
- emergency preparedness review
- caregiver competency / teaching evaluation
- nursing task inventory
- nursing delegation assessment / consultation
- face-to-face directing-RN/LPN documentation
- care conference / interdisciplinary communication
- physician/APRN/PA communication
- verbal/telephone order documentation

### Wound / skin

- wound care plan
- wound assessment by wound/site
- wound measurements L x W x D
- undermining/tunneling
- wound bed/tissue type
- drainage type/amount/odor
- periwound condition
- infection indicators
- pressure injury staging
- dressing change record
- negative-pressure wound therapy
- surgical incision care
- ostomy/peristomal skin
- skin tear / lesion / burn tracking
- wound photograph with consent/workflow controls
- wound trend graph

### Urinary / renal

- indwelling Foley catheter care
- suprapubic catheter care
- straight/intermittent catheterization
- catheter insertion/change/removal
- urine characteristics/output
- urinary retention assessment
- UTI symptom monitoring
- nephrostomy care
- dialysis-related observation/coordination when ordered
- intake/output

### GI / nutrition

- G-tube care
- J-tube care
- enteral feeding administration
- tube placement/assessment per order and policy
- tube site assessment
- flush/water administration
- formula/rate/volume tracking
- bowel movement log
- bowel program
- constipation/diarrhea monitoring
- ostomy care/output
- nausea/vomiting monitoring
- aspiration risk / swallowing precautions
- oral intake / hydration
- meal percentage / calorie or fluid goals when ordered
- weight monitoring

### Respiratory

- oxygen therapy
- oxygen saturation monitoring
- respiratory assessment
- nebulizer treatment
- inhaler treatment/teaching
- CPAP/BiPAP observation
- tracheostomy care
- tracheal suctioning
- oral/nasal suctioning
- ventilator observation/documentation if within service scope
- cough/secretions assessment
- incentive spirometry / pulmonary hygiene when ordered

### Diabetes / endocrine

- blood glucose flowsheet
- CGM reading documentation
- insulin administration
- insulin pump observation/support within applicable scope
- hypoglycemia protocol
- hyperglycemia protocol
- diabetic foot/skin checks
- carbohydrate/meal-linked monitoring when ordered

### IV / infusion / vascular access

- peripheral IV assessment
- IV insertion/removal/discontinuation
- IV medication administration
- infusion administration
- PICC/midline/central-line assessment
- central-line dressing change
- line flush
- port access/de-access when ordered and within scope
- pump programming record
- infusion reaction monitoring
- blood product administration record when provided in an eligible home setting

### Neurologic / seizure

- seizure log
- seizure rescue medication record
- post-ictal assessment
- vagus nerve stimulator support/training record
- neurologic checks
- change-in-mental-status observation

### Cardiovascular

- BP/HR trends
- orthostatic vital signs
- edema assessment
- daily weight / CHF monitoring
- chest pain symptom assessment/escalation
- anticoagulation observation/teaching

### Medication and treatments

- medication reconciliation
- eMAR
- PRN effectiveness reassessment
- controlled medication count where required by agency policy
- TAR
- topical treatment record
- eye/ear/nasal drops
- suppository/enema treatment
- injection record
- epinephrine auto-injector use
- OTC topical skin/oral-surface treatment record
- medication variance/omission record

### Musculoskeletal / functional

- range-of-motion program
- positioning/repositioning schedule
- splint/brace monitoring
- transfer status
- gait/ambulation
- lift equipment / Hoyer support
- fall follow-up
- therapy carryover instructions

### Psychosocial / behavior

- mental/psychosocial assessment
- mood/behavior observations
- restrictive-measure tracking
- antecedent/duration/outcome
- guardian/team notification
- behavior-plan implementation
- sleep-behavior correlation

### Hospice/palliative and other ordered care

- comfort symptom monitoring
- end-of-life care documentation
- advance-directive review
- DNR status visibility
- bereavement/caregiver coordination notes
- any custom ordered treatment configured by an authorized nurse/admin

## DODD compliance center

The attached DODD Form 015 (November 2023) states that documents may be reviewed during compliance review and additional documents may be requested. The system therefore uses a live audit readiness checklist, not a claim that one static list guarantees compliance.

Client/service readiness includes:

- current ISP plus revisions/addenda
- assessments used to develop plan
- Plan of Care/485 when waiver nursing applies
- delegated nursing ongoing assessments, statement of delegation, individual-specific training, evidence of nurse availability/supervision, step-by-step instructions, satisfactory return demonstration, nurse name/credentials
- restrictive-measure date/time/duration/antecedents, required guardian/team notifications, sharing during behavior-plan review, staff training
- personal-funds access, three months of ledgers/receipts/bill payments, reconciliation by someone not handling funds, applicable policy/training, licensed-setting personal allowance evidence
- three months of service delivery documentation tied to ISP outcomes for every service delivered
- MAR/TAR for requested months
- medical care coordination evidence for 12 months when applicable
- current physician orders
- waiver nursing plan of care, clinical/progress notes, and face-to-face documentation
- MUI/UI policy, 12 months of reports/notifications/follow-up/investigation, UI logs and monthly reviews, annual MUI analysis and County Board evidence, patterns/trends/corrective actions
- transportation inspections where applicable
- residency/lease, fire/tornado drills, emergency/fire plan, room and board, resident fire/emergency training where applicable
- remote support training, real-time awake monitoring evidence, emergency notification system, response protocols/backup contact
- assistive technology maintenance/repair/replacement and instruction/coordination evidence

Agency/personnel readiness includes staff roster, DOO/administrator status, provider demographics in PSM, compliance program, database checks, BCII/FBI/Rapback, employee attestations, diploma/GED where required, licenses, CPR/First Aid, medication/health-related activity certifications, transport credentials/insurance, initial/annual training plans and individual-specific training.

## Rich UI

S.P.I.R.E. should look like Sulandra Health, with informative visual hierarchy rather than decorative clutter:

- color-coded risk/attention cards
- vitals sparklines/trends
- sleep timeline
- wound measurement trends
- weight and glucose trends
- MAR adherence card
- ISP outcome progress cards
- overdue documentation / missing signature panel
- compliance readiness score by domain with drilldown to the actual missing record
- no chart or graph may substitute for the underlying signed clinical record

## Admin live-edit mode

S.P.I.R.E. Admin opens the same clinical shell in an explicit Admin Edit Mode. Authorized admins/nurses see pencil controls beside configurable labels, sections, catalogs, flowsheet definitions, ordering, visibility, role permissions and chart templates.

Clinical records already signed by staff are never silently editable. Corrections create amendments/addenda with before/after audit history. Admin edits to templates do not rewrite historical charting.

Admin controls include:

- client photo upload/change
- intake mapping
- activate/deactivate clinical catalog modules per client
- flowsheet builder
- row/group/column editor
- frequency and scheduled-time rules
- required/optional fields
- alerts/ranges
- ISP charting templates
- note templates
- role permissions
- document requirements
- compliance checklist rules
- archive/version history

## Non-negotiable record behavior

- server-confirmed persistence before success message
- role- and assignment-based chart access
- organization isolation
- signed records are immutable except via correction/addendum
- current-time and event-time are separate when back-charting
- automatic created/signed timestamps
- explicit author/credentials
- full audit trail
- no destructive delete of finalized clinical records
- attachments and photos retain provenance
- PHI-safe error handling
- exportable audit/compliance packet by client and date range
