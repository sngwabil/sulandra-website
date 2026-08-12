# User-provided SPIRE template integration

This branch is reserved for integrating the user-provided SPIRE HTML into the existing production SPIRE architecture without replacing Railway/API behavior with demo-only code.

## Source roles

- **Master template:** `Spire Enterprise - Master EHR Template - SCLS RESIDENTIAL`. This is the canonical UI/layout source. It uses placeholder client values such as `[Client Name]`, `[MRN Number]`, `[Facility / Home Name]`, `[Payer / Waiver Type]`, and includes the three-column client/chart/context workstation.
- **Example only:** `Spire Enterprise - SCLS RESIDENTIAL - SAMANTHA SPIRE DEMO`. This is sample-filled reference data used to verify appearance and interaction. Samantha/demo values must never become production patient data.

## Production adaptation rules

1. Keep the current `feature/spire-ehr-platform` Railway deployment architecture, authentication, company/service-home scope, PostgreSQL/Prisma persistence, audit trails, and existing SPIRE APIs.
2. Use the master template as the visual/interaction contract: top title/search bar, client rail, scrollable chart tabs, summary, chart review, results, synopsis, flowsheets, MAR, I/O, notes, eMAR/orders, work list, demographics, ISP/goals, EVV/authorization, and right clinical-context rail.
3. Replace every Supabase placeholder/hook in the uploaded template with the existing Sulandra Railway API/storage path. Do not introduce a new Supabase client dependency into the browser.
4. Preserve the uploaded flowsheet behavior: Add Row, Add Column using current time, Insert Column using custom date/time, Last Filed, Go to Date, Refresh, history/graph concepts, sticky row/time headers, task-specific value pickers, comments, and continuous longitudinal columns.
5. Production flowsheet writes must use server timestamps/audit metadata and enforce author ownership for edits; another user may view but may not alter the original author's entry.
6. ISP/home-and-community documentation must replace hospital-only concepts where appropriate: ISP outcomes, important-to/important-for, sleep/wake, ADLs, toileting, meals/hydration, community participation, behavior supports, safety checks, vitals, glucose, seizure/neurologic, skin/wound, respiratory, mobility/transfers, positioning, catheter/tube care, I/O, bowel, treatment/PRN effectiveness, and nursing-specific modules.
7. The Samantha demo remains an example/testing fixture only and is not to be published as a real patient chart.

## Integration strategy

The master template is the design source; the existing production SPIRE backend remains the data/security source. Integration should be done by adapting the current SPIRE shell/assets and APIs, not by blindly replacing `spire.html` with standalone demo JavaScript.
