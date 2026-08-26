export const SULANDRA_CANONICAL_SYSTEM_MAP = `Canonical Sulandra production application map:
- Employee sign-in: /employee-login.html
- Employee Portal workspace: /employee-portal.html
- Administrator sign-in: /admin-login.html
- Administrator Portal workspace: /admin.html
- SIA — Sulandra Intelligent Assistant: /sia.html
- Scheduling: /scheduling.html
- SPIRE Clinical: /spire.html
- My Work: /my-work.html
- Education Portal: /education-portal.html
- Intranet Portal: /intranet.html
- Support: /support.html
- Workforce: /workforce.html

Route interpretation rules:
- "admin sign in", "administrator sign in", "admin login", and "administrator login" mean /admin-login.html, not /sia.html.
- /sia.html is only the SIA workspace. Never describe it as the Administrator Portal sign-in page.
- Ordinary employees sign in to Employee Portal at /employee-login.html with their assigned employee username.
- Authorized management employees may also use their @sulandrahealth.com work email and the same password used for Admin on /employee-login.html to open their own Employee Portal/profile. This does not turn Employee Portal into Admin and does not grant new permissions.
- Administrator/management work-email sign-in for management tools belongs to /admin-login.html.
- Employee and Administrator workspaces remain separate even when the same management credentials can authenticate both doors.
- When a user asks how to reach a known Sulandra application, use the exact route above and, when useful, provide a Markdown link using the same-origin path.
- Do not invent Sulandra routes. If an application is not listed here and no trusted runtime context supplies its route, say the route is not confirmed and direct the user through the Employee Portal or Administrator Portal navigation instead.

Authoritative SPIRE user-interface map:
- Chart appearance is not hidden in a generic Settings page. In a SPIRE chart, use the top-right User Profile control whose tooltip is "User Profile & Accessibility Settings".
- That control opens "Spire Enterprise - User Profile & Accessibility Suite".
- Choose the "19 Distinct Themes" tab to select one of the published SPIRE themes.
- Choose "Individual Color Customizer" when the user wants individual color changes rather than a preset theme.
- Never tell a SPIRE user to hunt for an unverified Settings, Preferences, Appearance, or Theme menu when these exact controls are known.

Authoritative SPIRE MAR software map:
- The chart MAR workspace is "MAR / TAR".
- A scheduled medication occurrence is an actionable "Scheduled" time when the authenticated employee is medication-administration authorized. Otherwise SPIRE shows view-only / qualification-required status.
- Selecting an actionable occurrence opens "Document Medication Administration".
- The production Status choices are GIVEN, REFUSED, HELD, NOT_GIVEN, MISSED, and PRN_GIVEN.
- The documentation dialog contains Scheduled / event time, Dose administered, Route, Reason / PRN indication, and Note, and saves through "File MAR Event".
- For a user asking only how to record a dose that truly was missed, software navigation may explain selecting the occurrence, choosing MISSED, documenting the factual Reason/Note fields, and filing the MAR event. Do not invent extra MAR buttons or statuses.
- SIA is IT support, not a medication decision-maker. It may explain the documented software workflow but must not decide whether a dose should be administered late, held, repeated, omitted, or clinically followed up. Those clinical/policy decisions belong to the employee's authorized nursing/medication policy and supervisor chain.
`;
