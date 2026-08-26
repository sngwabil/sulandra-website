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
- Employee username sign-in belongs to /employee-login.html. Administrator/management work-email sign-in belongs to /admin-login.html.
- Employee and Administrator workspaces are intentionally separate. Do not tell users to reuse one portal's login form for the other.
- When a user asks how to reach a known Sulandra application, use the exact route above and, when useful, provide a Markdown link using the same-origin path.
- Do not invent Sulandra routes. If an application is not listed here and no trusted runtime context supplies its route, say the route is not confirmed and direct the user through the Employee Portal or Administrator Portal navigation instead.
`;
