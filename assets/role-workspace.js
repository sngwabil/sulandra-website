(function () {
  "use strict";

  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const API_BASE = "https://sulandra-website-production-5fc4.up.railway.app";
  const ADMIN_ROLE = "ADMINISTRATOR";

  const ROLE_PAGES = Object.freeze({
    PROGRAM_MANAGER: "/program-manager.html",
    AUDITOR: "/auditor.html",
    DSP: "/dsp.html",
    DELEGATING_NURSE: "/delegating-nurse.html",
    LPN: "/lpn.html",
    RN: "/rn.html",
    HOUSE_MANAGER: "/home-manager.html",
    HR_MANAGER: "/hr-manager.html",
    SCHEDULER: "/scheduler.html",
    BILLING_SPECIALIST: "/billing-specialist.html",
    ADMINISTRATIVE_ASSISTANT: "/administrative-assistant.html",
    CEO: "/ceo.html",
    DOO: "/doo.html",
    DRIVER: "/driver.html",
    GENERAL: "/general-employee.html"
  });

  const employeeBasics = [
    { label: "Employee Portal", href: "/employee-portal.html", detail: "Dashboard, role launchers and employee services." },
    { label: "My Work", href: "/my-work.html", detail: "Assigned work from Sulandra operational systems." },
    { label: "Notifications", href: "/notifications.html", detail: "Urgent, overdue and newly assigned work." },
    { label: "Workforce", href: "/workforce.html", detail: "Time, timesheets and employee documents." },
    { label: "Learning Center", href: "/education-portal.html", detail: "Required training, renewals and certificates." },
    { label: "Intranet", href: "/intranet.html", detail: "Policies, communications and internal resources." }
  ];

  // Every separate administrative HTML surface available to the Director of Operations.
  // admin.html is intentionally absent: the Owner Administrator alone occupies that command center.
  const adminHtml = [
    { label: "Employee 360", href: "/employee360.html", detail: "Employee records, compliance, performance and lifecycle management." },
    { label: "Scheduling", href: "/scheduling.html", detail: "Company and location staffing schedules." },
    { label: "Time & Attendance", href: "/time-attendance.html#admin", detail: "Clock-ins, corrections, geofencing and payroll-period review." },
    { label: "Client Intake", href: "/client-intake.html", detail: "Admission packets, review and SPIRE promotion." },
    { label: "Home Health Referrals", href: "/home-health-referrals.html", detail: "Secure referral intake and review." },
    { label: "Home Health Operations", href: "/home-health.html", detail: "Episodes, plans of care, visits, disciplines and staff." },
    { label: "NMT Orders", href: "/nmt-orders.html", detail: "Facility transportation orders and review." },
    { label: "NMT Dispatch", href: "/nmt-dispatch.html", detail: "Trips, drivers, vehicles and dispatch." },
    { label: "Workforce Administration", href: "/workforce-admin.html", detail: "Administrative workforce controls and review." },
    { label: "Medication Qualifications", href: "/spire-medication-qualifications.html", detail: "Medication-administration authority and qualifications." },
    { label: "Company Documents", href: "/company-documents.html", detail: "Official company records and compliance files." },
    { label: "SPIRE Training", href: "/spire-training.html", detail: "Simulation environment and training charts." },
    { label: "Employee Documents", href: "/employee360.html#files", detail: "Employee document and compliance center." },
    { label: "Reports & Audit", href: "/employee360.html#audit", detail: "Employee and operational audit evidence." },
    { label: "SPIRE Administration", href: "/spire-admin.html", detail: "Clinical administration and SPIRE controls." },
    { label: "Intranet Content Control", href: "/intranet-control.html", detail: "Publish and manage internal content." },
    { label: "Enterprise Analytics", href: "/enterprise-analytics.html", detail: "Company-scoped operational analytics." },
    { label: "Security & Audit", href: "/security-audit.html", detail: "Access review, security evidence and audit activity." },
    { label: "SCLS Residential Operations", href: "/scls-residential.html", detail: "Homes, residents, staffing, handoffs, tasks and house logs." }
  ];

  const CONFIG = Object.freeze({
    DSP: {
      title: "Direct Support Professional", short: "DSP",
      summary: "Direct-care workspace for assigned clients, shift documentation, medications when authorized, tasks and training.",
      primary: [
        { label: "My Shift", href: "/spire-shift.html", detail: "Assigned clients, vitals, due tasks and medication windows." },
        { label: "SPIRE Clinical Record", href: "/spire.html", detail: "Authorized client charts, notes, flowsheets and eMAR." }
      ],
      sections: [{ title: "Employee Services", items: employeeBasics }]
    },
    LPN: {
      title: "Licensed Practical Nurse", short: "LPN",
      summary: "Clinical workspace for assigned nursing care, medication administration, documentation and home-health visits.",
      primary: [
        { label: "My Shift", href: "/spire-shift.html", detail: "Assigned patients, assessments, medications and bedside work." },
        { label: "SPIRE", href: "/spire.html", detail: "Clinical charting, eMAR, flowsheets, notes and orders within scope." },
        { label: "Home Health Visits", href: "/home-health-visits.html", detail: "Assigned home-health visits when working in Home Health." }
      ],
      sections: [{ title: "Employee Services", items: employeeBasics }]
    },
    RN: {
      title: "Registered Nurse", short: "RN",
      summary: "Clinical and care-coordination workspace for nursing documentation, Home Health operations, medication safety and SPIRE.",
      primary: [
        { label: "SPIRE", href: "/spire.html", detail: "Clinical record, notes, eMAR, flowsheets and care coordination." },
        { label: "My Shift", href: "/spire-shift.html", detail: "Assigned clinical work and medication windows." },
        { label: "Home Health Visits", href: "/home-health-visits.html", detail: "Assigned skilled home-health visits." },
        { label: "Home Health Operations", href: "/home-health.html", detail: "Episodes, plans of care and interdisciplinary operations when authorized." }
      ],
      sections: [
        { title: "Clinical Oversight", items: [
          { label: "Medication Qualifications", href: "/spire-medication-qualifications.html", detail: "Review medication qualifications when role authorization permits." },
          { label: "SCLS Residential Operations", href: "/scls-residential.html", detail: "Residential clinical support, tasks, handoffs and house records." }
        ]},
        { title: "Employee Services", items: employeeBasics }
      ]
    },
    DELEGATING_NURSE: {
      title: "Delegating Nurse", short: "Delegating Nurse",
      summary: "Nursing oversight workspace for delegation, medication safety, qualifications, clinical review and residential support.",
      primary: [
        { label: "SPIRE", href: "/spire.html", detail: "Clinical records, nursing notes, eMAR and flowsheets." },
        { label: "Medication Qualifications", href: "/spire-medication-qualifications.html", detail: "Medication delegation and administration-authority oversight." },
        { label: "SCLS Residential Operations", href: "/scls-residential.html", detail: "Residential clinical oversight, staff support, tasks and handoffs." },
        { label: "Home Health Operations", href: "/home-health.html", detail: "Home-health clinical operations when assigned." }
      ],
      sections: [{ title: "Employee Services", items: employeeBasics }]
    },
    HOUSE_MANAGER: {
      title: "Home Manager", short: "Home Manager",
      summary: "Assigned-home leadership workspace for the staff, residents, handoffs, tasks and daily operations of the home you manage.",
      primary: [
        { label: "Manage My Home Team", href: "/scls-residential.html#staff", detail: "Open your assigned home and use Staff to review and manage the employees assigned to that home." },
        { label: "Home Residents & Operations", href: "/scls-residential.html", detail: "Residents, staffing, tasks, appointments, handoffs and house log." },
        { label: "My Shift", href: "/spire-shift.html", detail: "Assigned clients, medications, vitals and shift work." },
        { label: "SPIRE", href: "/spire.html", detail: "Authorized charts and documentation for clients in your scope." }
      ],
      sections: [
        { title: "Home Leadership", items: [
          { label: "Home Tasks & Appointments", href: "/scls-residential.html#tasks", detail: "Open tasks, appointments and transportation for your assigned home." },
          { label: "Shift Handoff", href: "/scls-residential.html#handoff", detail: "Create and review house shift handoffs." },
          { label: "House Log", href: "/scls-residential.html#log", detail: "Document and review home events and follow-up." },
          { label: "Workforce", href: "/workforce.html", detail: "Your own time, timesheets and employee documents." }
        ]},
        { title: "Employee Services", items: employeeBasics }
      ]
    },
    PROGRAM_MANAGER: {
      title: "Program Manager", short: "Program Manager",
      summary: "Program-level operating workspace for homes, staff, clients, schedules, documentation, compliance and service delivery.",
      primary: [
        { label: "SCLS Residential Operations", href: "/scls-residential.html", detail: "Homes, residents, staffing, tasks and handoffs." },
        { label: "Scheduling", href: "/scheduling.html", detail: "Program staffing and service-location schedules." },
        { label: "Employee 360", href: "/employee360.html", detail: "Authorized employee management and compliance." },
        { label: "Client Intake", href: "/client-intake.html", detail: "Admission and service-start workflows." }
      ],
      sections: [
        { title: "Program Oversight", items: [
          { label: "SPIRE", href: "/spire.html", detail: "Program clinical and client records within authorized scope." },
          { label: "Company Documents", href: "/company-documents.html", detail: "Official records and compliance evidence." },
          { label: "Enterprise Analytics", href: "/enterprise-analytics.html", detail: "Program and company operational metrics." },
          { label: "Security & Audit", href: "/security-audit.html", detail: "Audit and access-review evidence." },
          { label: "NMT Dispatch", href: "/nmt-dispatch.html", detail: "Transportation operations when assigned to NMT." },
          { label: "Home Health Operations", href: "/home-health.html", detail: "Home Health operations when assigned to that company." }
        ]},
        { title: "Employee Services", items: employeeBasics }
      ]
    },
    HR_MANAGER: {
      title: "Human Resources Manager", short: "HR Manager",
      summary: "People-operations workspace for Employee 360, workforce administration, compliance, records, learning and employee support.",
      primary: [
        { label: "Employee 360", href: "/employee360.html", detail: "Employee lifecycle, compliance, performance, compensation, leave and records." },
        { label: "Workforce Administration", href: "/workforce-admin.html", detail: "Workforce review and administrative controls." },
        { label: "Company Documents", href: "/company-documents.html", detail: "HR and company records within authorized scope." },
        { label: "Learning Center", href: "/education-portal.html", detail: "Training assignments, certificates and learning records." }
      ],
      sections: [
        { title: "HR Oversight", items: [
          { label: "Employee Documents", href: "/employee360.html#files", detail: "Employee document and compliance center." },
          { label: "Reports & Audit", href: "/employee360.html#audit", detail: "Employee record and HR audit evidence." },
          { label: "Security & Audit", href: "/security-audit.html", detail: "Authorized access review and security evidence." },
          { label: "Intranet", href: "/intranet.html", detail: "Policies and employee communications." }
        ]},
        { title: "Employee Services", items: employeeBasics }
      ]
    },
    SCHEDULER: {
      title: "Scheduler / Dispatcher", short: "Scheduler",
      summary: "Scheduling and dispatch workspace for service locations, workforce assignments, Home Health visits and NMT operations.",
      primary: [
        { label: "Scheduling", href: "/scheduling.html", detail: "Build and manage workforce schedules." },
        { label: "Time & Attendance", href: "/time-attendance.html#admin", detail: "Review time and attendance within scheduler authority." },
        { label: "Home Health Visits", href: "/home-health-visits.html", detail: "Assigned and scheduled Home Health visits." },
        { label: "NMT Dispatch", href: "/nmt-dispatch.html", detail: "Dispatch trips, drivers and vehicles when working in NMT." }
      ],
      sections: [
        { title: "Scheduling Operations", items: [
          { label: "Home Health Operations", href: "/home-health.html", detail: "Home Health staff and visit scheduling." },
          { label: "My Work", href: "/my-work.html", detail: "Open scheduler and dispatch assignments." }
        ]},
        { title: "Employee Services", items: employeeBasics }
      ]
    },
    BILLING_SPECIALIST: {
      title: "Billing Specialist", short: "Billing Specialist",
      summary: "Revenue-support workspace for documentation review, service records, transportation orders and company files within assigned authority.",
      primary: [
        { label: "Company Documents", href: "/company-documents.html", detail: "Billing support documents and official company records within scope." },
        { label: "NMT Orders", href: "/nmt-orders.html", detail: "Transportation orders and supporting service information when assigned to NMT." },
        { label: "Home Health Operations", href: "/home-health.html", detail: "Home Health episode and service information when authorized." },
        { label: "My Work", href: "/my-work.html", detail: "Assigned billing and documentation work." }
      ],
      sections: [{ title: "Employee Services", items: employeeBasics }]
    },
    ADMINISTRATIVE_ASSISTANT: {
      title: "Administrative Assistant", short: "Administrative Assistant",
      summary: "Administrative-support workspace for assigned intake, scheduling, records, communications and office workflows.",
      primary: [
        { label: "Client Intake", href: "/client-intake.html", detail: "Support admission packets and administrative intake tasks within scope." },
        { label: "Company Documents", href: "/company-documents.html", detail: "Authorized company records and office documents." },
        { label: "Scheduling", href: "/scheduling.html", detail: "Assigned scheduling support when permission is granted." },
        { label: "Intranet", href: "/intranet.html", detail: "Internal communications, policies and resources." }
      ],
      sections: [{ title: "Employee Services", items: employeeBasics }]
    },
    AUDITOR: {
      title: "Auditor", short: "Auditor",
      summary: "Read-focused oversight workspace for audit evidence, chart review, compliance, security and official records.",
      primary: [
        { label: "Security & Audit", href: "/security-audit.html", detail: "Security evidence, access review and audit activity." },
        { label: "SPIRE", href: "/spire.html", detail: "Authorized read-only clinical/client chart review." },
        { label: "Company Documents", href: "/company-documents.html", detail: "Official records and compliance evidence." },
        { label: "Reports & Audit", href: "/employee360.html#audit", detail: "Employee and operational audit evidence." }
      ],
      sections: [
        { title: "Oversight", items: [
          { label: "Enterprise Analytics", href: "/enterprise-analytics.html", detail: "Company operational metrics within audit scope." },
          { label: "Employee Documents", href: "/employee360.html#files", detail: "Compliance-document review within authority." }
        ]},
        { title: "Employee Services", items: employeeBasics }
      ]
    },
    DRIVER: {
      title: "NMT Driver", short: "Driver",
      summary: "Transportation workspace for assigned trips, route work, required documentation, training and workforce actions.",
      primary: [
        { label: "My NMT Trips", href: "/nmt-driver.html", detail: "Assigned transportation trips and driver workflow." },
        { label: "My Work", href: "/my-work.html", detail: "Open transportation and operational assignments." },
        { label: "Workforce", href: "/workforce.html", detail: "Time, timesheets and employee documents." }
      ],
      sections: [{ title: "Employee Services", items: employeeBasics }]
    },
    GENERAL: {
      title: "General Employee", short: "Employee",
      summary: "General employee workspace for assigned work, workforce, learning, records, notifications and company resources.",
      primary: [
        { label: "My Work", href: "/my-work.html", detail: "Open assigned Sulandra work." },
        { label: "Workforce", href: "/workforce.html", detail: "Time, timesheets and employee documents." },
        { label: "Learning Center", href: "/education-portal.html", detail: "Required education and certificates." }
      ],
      sections: [{ title: "Employee Services", items: employeeBasics }]
    },
    CEO: {
      title: "Chief Executive Officer", short: "CEO",
      summary: "Executive oversight workspace. The Owner Administrator Command Center remains separate and is not exposed here.",
      primary: [
        { label: "Enterprise Analytics", href: "/enterprise-analytics.html", detail: "Portfolio and company operating metrics." },
        { label: "Employee 360", href: "/employee360.html", detail: "Enterprise people and compliance oversight." },
        { label: "Security & Audit", href: "/security-audit.html", detail: "Security, access review and audit evidence." },
        { label: "Company Documents", href: "/company-documents.html", detail: "Official company records." }
      ],
      sections: [
        { title: "Executive Administrative Workspaces", items: adminHtml },
        { title: "Employee & Company Portals", items: employeeBasics }
      ]
    },
    DOO: {
      title: "Director of Operations", short: "DOO",
      summary: "Enterprise operating workspace with every separate administrative HTML used to run Sulandra companies, except the Owner Administrator main page.",
      primary: [
        { label: "Employee 360", href: "/employee360.html", detail: "Employees, compliance, performance and management." },
        { label: "Scheduling", href: "/scheduling.html", detail: "Staffing and service-location schedules." },
        { label: "Client Intake", href: "/client-intake.html", detail: "Admission and service-start operations." },
        { label: "SPIRE Administration", href: "/spire-admin.html", detail: "Clinical administration and SPIRE controls." }
      ],
      sections: [
        { title: "All Administrative HTML Workspaces — Owner Admin excluded", items: adminHtml },
        { title: "Employee & Company Portals", items: employeeBasics }
      ]
    }
  });

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || "null"); }
    catch { return null; }
  }
  function token() { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || ""; }
  function roleOf(session) { return String(session?.role || session?.user?.role || "").toUpperCase(); }
  function nameOf(session) { return session?.displayName || session?.fullName || session?.name || session?.email || session?.username || "Sulandra Health employee"; }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function ownWorkspace(role) { return ROLE_PAGES[role] || "/employee-portal.html"; }

  function signOut() {
    if (window.SulandraAdminSessionSecurity?.signOut) { window.SulandraAdminSessionSecurity.signOut("signed-out"); return; }
    sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(SESSION_KEY);
    location.replace("/employee-login.html");
  }

  async function companyName() {
    try {
      const response = await fetch(API_BASE + "/api/entity-context", { cache: "no-store", headers: { Accept: "application/json", Authorization: "Bearer " + token() } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return "Sulandra Health";
      const data = payload.data || payload || {};
      const entities = Array.isArray(data.entities) ? data.entities : [];
      const selectedId = sessionStorage.getItem("sulandra:selected-legal-entity-id") || localStorage.getItem("sulandra:selected-legal-entity-id") || data.primaryEntityId || "";
      const selected = entities.find((entity) => String(entity.id) === String(selectedId)) || entities.find((entity) => String(entity.id) === String(data.primaryEntityId || "")) || entities[0];
      return selected?.displayName || selected?.legalName || "Sulandra Health";
    } catch { return "Sulandra Health"; }
  }

  function renderCards(items) {
    return items.map((item) => `<a class="rw-card" href="${escapeHtml(item.href)}"><span class="rw-card-arrow" aria-hidden="true">→</span><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail || "")}</span></a>`).join("");
  }

  function renderRoleWorkspace(expectedRole, session) {
    const config = CONFIG[expectedRole];
    if (!config) { location.replace("/employee-portal.html"); return; }
    document.title = `${config.title} | Sulandra Health`;
    const preview = roleOf(session) === ADMIN_ROLE && expectedRole !== ADMIN_ROLE;
    document.getElementById("roleWorkspaceTitle").textContent = config.title;
    document.getElementById("roleWorkspaceSummary").textContent = config.summary;
    document.getElementById("roleEmployeeName").textContent = nameOf(session);
    document.getElementById("roleEmployeeRole").textContent = preview ? `Administrator previewing ${config.short}` : config.short;
    document.getElementById("rolePrimaryActions").innerHTML = renderCards(config.primary || []);
    document.getElementById("roleWorkspaceSections").innerHTML = (config.sections || []).map((section) => `<section class="rw-section"><div class="rw-section-head"><h2>${escapeHtml(section.title)}</h2></div><div class="rw-card-grid">${renderCards(section.items || [])}</div></section>`).join("");
    const previewBox = document.getElementById("rolePreviewBanner");
    previewBox.hidden = !preview;
    if (preview) previewBox.textContent = `Owner Administrator preview: this is the workspace and navigation presented for ${config.title}. Actions still use your Administrator authority; no employee is impersonated.`;
    document.body.dataset.roleWorkspaceReady = "true";
    document.body.dataset.roleWorkspaceRole = expectedRole;
  }

  function renderDirectory(session) {
    if (roleOf(session) !== ADMIN_ROLE) { location.replace(ownWorkspace(roleOf(session))); return; }
    document.title = "Role Workspaces | Sulandra Health";
    document.getElementById("roleDirectoryNote").textContent = "Owner Administrator view. Open any role workspace to see the role-specific navigation without impersonating an employee.";
    document.getElementById("roleDirectoryGrid").innerHTML = Object.entries(ROLE_PAGES).map(([role, href]) => {
      const config = CONFIG[role];
      return `<a class="rw-card" href="${escapeHtml(href)}"><span class="rw-card-arrow" aria-hidden="true">→</span><strong>${escapeHtml(config?.title || role)}</strong><span>${escapeHtml(config?.summary || "")}</span></a>`;
    }).join("");
    document.getElementById("roleEmployeeName").textContent = nameOf(session);
    document.body.dataset.roleWorkspaceDirectoryReady = "true";
  }

  function authorizeAndRender() {
    const session = readSession();
    if (!session || !token()) { location.replace("/employee-login.html?returnTo=" + encodeURIComponent(location.pathname + location.search + location.hash)); return; }
    if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) { signOut(); return; }
    const actualRole = roleOf(session);
    if (document.body.dataset.roleWorkspaceDirectory === "true") { renderDirectory(session); return; }
    const expectedRole = String(document.body.dataset.roleWorkspace || "").toUpperCase();
    if (!expectedRole || !CONFIG[expectedRole]) { location.replace(ownWorkspace(actualRole)); return; }
    if (actualRole !== expectedRole && actualRole !== ADMIN_ROLE) { location.replace(ownWorkspace(actualRole)); return; }
    renderRoleWorkspace(expectedRole, session);
    companyName().then((name) => { const company = document.getElementById("roleCompanyName"); if (company) company.textContent = name; });
  }

  document.getElementById("roleSignOut")?.addEventListener("click", (event) => { event.preventDefault(); signOut(); });
  window.SulandraRoleWorkspaces = Object.freeze({ pages: ROLE_PAGES, roles: Object.keys(ROLE_PAGES), ownerMain: "/admin.html", adminMainIsRoleWorkspace: false });
  authorizeAndRender();
})();
