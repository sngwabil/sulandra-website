(function () {
  "use strict";

  const SESSION_KEY = "sulandra:employee:session";
  const SERVICES_KEY = "sulandra:admin:future-services";
  const PROFILE_PREFIX = "sulandra:admin:view-profile:";
  const $ = (id) => document.getElementById(id);

  const DEFAULT_PROFILE = {
    theme: "executive",
    accent: "#075b9c",
    font: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "16",
    density: "comfortable",
    radius: "18",
    cursor: "default",
    focus: true,
    reducedMotion: false,
    compactNavigation: false,
    rememberWorkspace: true
  };

  const GROUPS = [
    {
      title: "Subsidiary & Service Routing Hub",
      eyebrow: "Parent company operations",
      tools: [
        ["community", "Sulandra Community Living Services", "Group homes, waiver services, residential support and person-centered operations.", "subsidiary", "Community Living", "🏠"],
        ["home-health", "Sulandra Home Health Care Services", "Skilled nursing, nursing visits, in-home care, clinical supervision and EVV.", "subsidiary", "Home Health", "✚"],
        ["nemt", "Sulandra Health Non-Medical Transportation", "Client transport logistics, vehicles, drivers, dispatch and trip compliance.", "subsidiary", "NEMT", "🚐"],
        ["add-service", "Add & Route New Service", "Securely name, provision and route a future subsidiary or service line.", "new-service", "Provision", "＋"]
      ]
    },
    {
      title: "Human Resources, Payroll & Workforce",
      eyebrow: "People operations",
      tools: [
        ["employees", "Employees", "Staff profiles, credentials, personnel records and employment status.", "module", "employees", "👥"],
        ["payroll", "Payroll Services", "Compensation, pay rates, payroll review, deductions and processing controls.", "workspace", "Payroll", "💳"],
        ["time", "Time & Attendance", "Clock-ins, worked hours, exceptions, approvals and payroll-ready timesheets.", "module", "time", "⏱"],
        ["scheduling", "Scheduling", "Shift rosters, coverage, open shifts and cross-service staffing coordination.", "module", "scheduling", "🗓"],
        ["onboarding", "Onboarding", "Applicants, interview scheduling, hiring decisions and employee conversion.", "panel", "applicants", "🧭"],
        ["jobs", "Job Openings", "Create, publish, edit, close and archive live career opportunities.", "panel", "openings", "📣"],
        ["learning", "Learning & Development", "Employee education, annual training, competencies and certificates.", "href", "education-portal.html", "🎓"],
        ["benefits", "Benefits Administration", "Eligibility, enrollment, leave coordination and employee benefit records.", "workspace", "Benefits", "🛡"]
      ]
    },
    {
      title: "Daily Residential & Client Operations",
      eyebrow: "Service delivery",
      tools: [
        ["homes", "Service Homes", "Residential locations, client assignments, staffing and home-level oversight.", "module", "homes", "🏘"],
        ["house-ops", "Day-to-Day House Operations", "Food, household inventory, grocery coordination, maintenance and petty cash.", "workspace", "House Operations", "🛒"],
        ["client-docs", "Client Paperwork & Documentation", "Intake forms, ISP support files, client records and home documentation.", "module", "documents", "📁"],
        ["care-plans", "Care Plans & ISP Coordination", "Service outcomes, plan implementation, reviews and interdisciplinary follow-up.", "workspace", "Care Plans", "📝"],
        ["medication", "Medication & MAR Oversight", "Medication records, administration reviews, errors and nursing follow-up.", "workspace", "Medication Oversight", "💊"],
        ["client-calendar", "Client Appointments & Activities", "Medical appointments, community activities and transportation coordination.", "workspace", "Client Calendar", "📅"]
      ]
    },
    {
      title: "Healthcare, Compliance & Financial Controls",
      eyebrow: "Risk, quality and revenue",
      tools: [
        ["incidents", "MUI / UI Management", "Secure incident logging, investigation, prevention plans and regulatory reporting.", "workspace", "MUI / UI", "⚠"],
        ["evv", "EVV Compliance", "Visit verification, missing punches, exceptions, corrections and service reconciliation.", "workspace", "EVV Compliance", "📍"],
        ["fleet", "Fleet & Trip Dispatch", "Vehicle maintenance, driver logs, trip scheduling, routing and dispatch controls.", "workspace", "Fleet & Dispatch", "🚚"],
        ["billing", "Billing & Claims", "Medicaid waiver billing, payer claims, denials, reconciliation and revenue cycle.", "workspace", "Billing & Claims", "💰"],
        ["compliance", "Documents & Compliance", "Licenses, credentials, expirations, audits and regulatory readiness.", "module", "documents", "✅"],
        ["quality", "Quality Assurance", "Internal audits, corrective actions, performance indicators and survey readiness.", "workspace", "Quality Assurance", "📊"],
        ["reports", "Reports", "Operational, clinical, HR, billing and executive reporting.", "module", "reports", "📈"],
        ["spire", "Admin S.P.I.R.E.", "Advanced clinical, administrative and enterprise management tools.", "module", "spire", "✦"],
        ["settings", "Settings", "Addresses, email identity, company parameters, permissions and system configuration.", "module", "settings", "⚙"],
        ["intranet", "Intranet Publishing", "Announcements, leadership messages, media, campaigns and timed content.", "href", "intranet-control.html", "🌐"],
        ["audit", "Audit & Security Center", "Administrative actions, access review, security events and governance controls.", "workspace", "Audit & Security", "🔐"],
        ["vendors", "Vendors & Procurement", "Vendor records, purchasing, contracts, supplies and approval workflows.", "workspace", "Vendors & Procurement", "📦"]
      ]
    },
    {
      title: "Executive Planning & Corporate Administration",
      eyebrow: "Parent-company leadership",
      tools: [
        ["executive", "Executive Dashboard", "Enterprise KPIs, service-line performance, priorities and leadership alerts.", "module", "dashboard", "◈"],
        ["finance", "Finance & Budgeting", "Budgets, forecasts, expenses, cash planning and subsidiary financial controls.", "workspace", "Finance & Budgeting", "🏦"],
        ["legal", "Contracts & Legal", "Contracts, insurance, renewals, legal records and corporate obligations.", "workspace", "Contracts & Legal", "⚖"],
        ["facilities", "Facilities & Maintenance", "Properties, repairs, inspections, utilities and capital improvements.", "workspace", "Facilities", "🛠"],
        ["communications", "Corporate Communications", "Internal announcements, public messaging, templates and brand governance.", "href", "intranet-control.html", "📡"],
        ["projects", "Projects & Expansion", "New homes, service launches, milestones, approvals and implementation tracking.", "workspace", "Projects & Expansion", "🚀"],
        ["permissions", "Roles & Permissions", "Administrative roles, access boundaries and responsibility assignments.", "module", "settings", "🪪"],
        ["continuity", "Emergency & Business Continuity", "Emergency plans, disruptions, escalation trees and continuity readiness.", "workspace", "Business Continuity", "🚨"]
      ]
    }
  ];

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") || {}; }
    catch { return {}; }
  }

  function profileKey() {
    const current = session();
    return PROFILE_PREFIX + String(current.email || current.username || current.userId || "administrator").toLowerCase();
  }

  function loadProfile() {
    try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(profileKey()) || "{}") }; }
    catch { return { ...DEFAULT_PROFILE }; }
  }

  function saveProfile(profile) {
    localStorage.setItem(profileKey(), JSON.stringify(profile));
    applyProfile(profile);
  }

  function applyProfile(profile) {
    const root = document.documentElement;
    root.style.setProperty("--ec-accent", profile.accent);
    root.style.setProperty("--ec-font", profile.font);
    root.style.setProperty("--ec-font-size", `${profile.fontSize}px`);
    root.style.setProperty("--ec-radius", `${profile.radius}px`);
    document.body.dataset.ecTheme = profile.theme;
    document.body.dataset.ecDensity = profile.density;
    document.body.dataset.ecCompactNav = String(Boolean(profile.compactNavigation));
    document.body.dataset.ecReducedMotion = String(Boolean(profile.reducedMotion));
    document.body.dataset.ecFocus = String(Boolean(profile.focus));
    document.body.dataset.ecCursor = profile.cursor;
  }

  function installStyles() {
    if ($("enterpriseCommandStyles")) return;
    const style = document.createElement("style");
    style.id = "enterpriseCommandStyles";
    style.textContent = `
      :root{--ec-accent:#075b9c;--ec-font:Inter,system-ui,sans-serif;--ec-font-size:16px;--ec-radius:18px;--ec-ink:#102448;--ec-muted:#62738b;--ec-line:#d7e4ef;--ec-surface:#fff;--ec-soft:#f4f8fb;--ec-shadow:0 18px 50px rgba(15,36,66,.11)}
      body{font-family:var(--ec-font)!important;font-size:var(--ec-font-size)!important}
      body[data-ec-theme="midnight"]{--ec-ink:#e7f2ff;--ec-muted:#9db3c9;--ec-line:#29445d;--ec-surface:#10283d;--ec-soft:#0b1d2e;--ec-shadow:0 18px 55px rgba(0,0,0,.35);background:#081724!important;color:#e7f2ff!important}
      body[data-ec-theme="warm"]{--ec-accent:#9a4f13;--ec-ink:#382412;--ec-muted:#775f49;--ec-line:#ead8c6;--ec-surface:#fffdf9;--ec-soft:#fbf4ea}
      body[data-ec-theme="clean"]{--ec-accent:#166534;--ec-ink:#13251a;--ec-muted:#607066;--ec-line:#d9e5dc;--ec-surface:#fff;--ec-soft:#f7faf8}
      body[data-ec-density="compact"] .ec-tool{padding:14px}.ec-command-center{margin:0 0 28px;padding:24px;border-radius:calc(var(--ec-radius) + 8px);background:linear-gradient(145deg,var(--ec-soft),var(--ec-surface));border:1px solid var(--ec-line);box-shadow:var(--ec-shadow);color:var(--ec-ink)}
      .ec-hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;padding:8px 4px 22px;border-bottom:1px solid var(--ec-line)}.ec-kicker{font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--ec-accent)}.ec-hero h1{margin:7px 0 6px;font-size:clamp(28px,4vw,46px);line-height:1.06;color:var(--ec-ink)}.ec-hero p{margin:0;color:var(--ec-muted);max-width:760px;line-height:1.65}.ec-hero-actions{display:flex;gap:10px;flex-wrap:wrap}
      .ec-button,.ec-top-button{border:1px solid color-mix(in srgb,var(--ec-accent) 25%,var(--ec-line));border-radius:13px;background:var(--ec-surface);color:var(--ec-ink);font-weight:850;padding:11px 15px;cursor:pointer;box-shadow:0 7px 18px rgba(15,36,66,.07);transition:.18s transform,.18s box-shadow,.18s border-color}.ec-button:hover,.ec-top-button:hover{transform:translateY(-2px);border-color:var(--ec-accent);box-shadow:0 12px 25px rgba(15,36,66,.13)}.ec-button.primary,.ec-top-button.primary{background:linear-gradient(135deg,var(--ec-accent),color-mix(in srgb,var(--ec-accent) 72%,#2aa7df));color:#fff;border-color:transparent}
      .ec-section{margin-top:24px}.ec-section-head{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:12px}.ec-section h2{margin:3px 0 0;color:var(--ec-ink);font-size:22px}.ec-section small{color:var(--ec-accent);font-weight:900;text-transform:uppercase;letter-spacing:.08em}.ec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:14px}.ec-tool{position:relative;display:flex;gap:14px;align-items:flex-start;text-align:left;border:1px solid var(--ec-line);border-radius:var(--ec-radius);padding:18px;background:var(--ec-surface);color:var(--ec-ink);cursor:pointer;min-height:128px;box-shadow:0 8px 24px rgba(15,36,66,.06);transition:.18s transform,.18s box-shadow,.18s border-color}.ec-tool:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--ec-accent) 55%,var(--ec-line));box-shadow:0 16px 34px rgba(15,36,66,.13)}.ec-icon{display:grid;place-items:center;width:44px;height:44px;flex:0 0 44px;border-radius:14px;background:color-mix(in srgb,var(--ec-accent) 12%,var(--ec-surface));font-size:22px}.ec-tool h3{margin:1px 0 6px;font-size:16px;color:var(--ec-ink)}.ec-tool p{margin:0;color:var(--ec-muted);font-size:13px;line-height:1.5}.ec-arrow{position:absolute;right:14px;bottom:12px;color:var(--ec-accent);font-weight:900}
      .ec-modal-backdrop{position:fixed;inset:0;z-index:60000;background:rgba(4,18,31,.7);display:grid;place-items:center;padding:20px;backdrop-filter:blur(8px)}.ec-modal{width:min(880px,100%);max-height:92vh;overflow:auto;background:var(--ec-surface);color:var(--ec-ink);border-radius:24px;padding:26px;box-shadow:0 30px 90px rgba(0,0,0,.35);border:1px solid var(--ec-line)}.ec-modal-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid var(--ec-line);padding-bottom:16px;margin-bottom:18px}.ec-modal h2{margin:4px 0}.ec-close{border:0;background:var(--ec-soft);color:var(--ec-ink);width:40px;height:40px;border-radius:12px;font-size:22px;cursor:pointer}.ec-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.ec-field{display:grid;gap:7px}.ec-field.full{grid-column:1/-1}.ec-field label{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:var(--ec-muted)}.ec-field input,.ec-field select,.ec-field textarea{width:100%;border:1px solid var(--ec-line);border-radius:12px;padding:12px;background:var(--ec-surface);color:var(--ec-ink);font:inherit}.ec-toggle{display:flex;gap:10px;align-items:center;border:1px solid var(--ec-line);border-radius:13px;padding:12px;background:var(--ec-soft)}.ec-toggle input{width:auto}.ec-modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:20px}.ec-workspace-card{border:1px solid var(--ec-line);border-radius:16px;padding:16px;background:var(--ec-soft);margin-top:14px}.ec-service-list{display:grid;gap:10px;margin-top:14px}.ec-service-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--ec-line);border-radius:14px;padding:13px}
      body[data-ec-compact-nav="true"] #topModuleNav{gap:0!important}body[data-ec-compact-nav="true"] #topModuleNav a{padding-left:8px!important;padding-right:8px!important;font-size:13px!important}body[data-ec-compact-nav="true"] #sideModuleNav .side-btn{padding-top:8px!important;padding-bottom:8px!important}
      body[data-ec-reduced-motion="true"] *,body[data-ec-reduced-motion="true"] *::before,body[data-ec-reduced-motion="true"] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}body[data-ec-focus="true"] :focus-visible{outline:4px solid color-mix(in srgb,var(--ec-accent) 65%,#fff)!important;outline-offset:3px!important}body[data-ec-cursor="large"] *{cursor:cell!important}body[data-ec-cursor="crosshair"] *{cursor:crosshair!important}
      @media(max-width:780px){.ec-command-center{padding:16px}.ec-hero{display:block}.ec-hero-actions{margin-top:16px}.ec-form-grid{grid-template-columns:1fr}.ec-field.full{grid-column:auto}.ec-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function moduleClick(target) {
    const candidates = [
      `#topModuleNav [data-module="${target}"]`,
      `#sideModuleNav [data-module="${target}"]`,
      `[data-module="${target}"]`
    ];
    for (const selector of candidates) {
      const element = document.querySelector(selector);
      if (element) { element.click(); return true; }
    }
    const normalized = target.replaceAll("-", " ").toLowerCase();
    const fallback = Array.from(document.querySelectorAll("#topModuleNav a,#sideModuleNav button"))
      .find((node) => node.textContent.toLowerCase().includes(normalized));
    if (fallback) { fallback.click(); return true; }
    return false;
  }

  function openOnboardingPanel(panel) {
    moduleClick("onboarding");
    window.setTimeout(() => {
      const target = document.querySelector(`[data-onboarding-panel="${panel}"]`);
      if (target) target.click();
    }, 120);
  }

  function openWorkspace(name, description) {
    closeModal();
    const modal = document.createElement("div");
    modal.className = "ec-modal-backdrop";
    modal.dataset.ecModal = "true";
    modal.innerHTML = `<section class="ec-modal" role="dialog" aria-modal="true"><header class="ec-modal-head"><div><div class="ec-kicker">Enterprise workspace</div><h2>${esc(name)}</h2><p style="margin:0;color:var(--ec-muted)">${esc(description || "This workspace is ready for secure routing as its operational module is connected.")}</p></div><button class="ec-close" data-close aria-label="Close">×</button></header><div class="ec-workspace-card"><strong>Provisioned safely inside the admin portal</strong><p style="color:var(--ec-muted);line-height:1.6">This button is active and will not lead to a broken page. The workspace is reserved for the ${esc(name)} module. Until its dedicated backend screen is connected, administrators can continue using the related existing portal tools without losing navigation or session state.</p></div><div class="ec-modal-actions"><button class="ec-button" data-close>Close</button><button class="ec-button primary" data-dashboard>Return to Dashboard</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close]").forEach((button) => button.onclick = closeModal);
    modal.querySelector("[data-dashboard]").onclick = () => { closeModal(); moduleClick("dashboard"); };
    modal.onclick = (event) => { if (event.target === modal) closeModal(); };
  }

  function closeModal() { document.querySelectorAll("[data-ec-modal]").forEach((node) => node.remove()); }

  function futureServices() {
    try { return JSON.parse(localStorage.getItem(SERVICES_KEY) || "[]"); }
    catch { return []; }
  }

  function saveFutureServices(items) { localStorage.setItem(SERVICES_KEY, JSON.stringify(items)); }

  function newServiceModal() {
    closeModal();
    const modal = document.createElement("div");
    modal.className = "ec-modal-backdrop";
    modal.dataset.ecModal = "true";
    const rows = futureServices();
    modal.innerHTML = `<section class="ec-modal" role="dialog" aria-modal="true"><header class="ec-modal-head"><div><div class="ec-kicker">Future service provisioning</div><h2>Add & Route New Service</h2><p style="margin:0;color:var(--ec-muted)">Create a persistent service card and route it to an existing safe workspace until its dedicated module is developed.</p></div><button class="ec-close" data-close>×</button></header><div class="ec-form-grid"><div class="ec-field"><label>Service or subsidiary name</label><input data-service-name maxlength="120" placeholder="Sulandra Behavioral Health Services"></div><div class="ec-field"><label>Route to</label><select data-service-route><option value="dashboard">Executive Dashboard</option><option value="homes">Service Homes</option><option value="employees">Employees</option><option value="scheduling">Scheduling</option><option value="documents">Documents & Compliance</option><option value="reports">Reports</option><option value="settings">Settings</option></select></div><div class="ec-field full"><label>Description</label><textarea data-service-description maxlength="500" placeholder="Describe what this service line will manage."></textarea></div></div><div class="ec-modal-actions"><button class="ec-button" data-close>Cancel</button><button class="ec-button primary" data-add>Add Service</button></div><div class="ec-service-list">${rows.map((item, index) => `<div class="ec-service-row"><div><strong>${esc(item.name)}</strong><div style="color:var(--ec-muted);font-size:13px">Routes to ${esc(item.route)}</div></div><button class="ec-button" data-remove-service="${index}">Remove</button></div>`).join("") || '<p style="color:var(--ec-muted)">No future services have been added yet.</p>'}</div></section>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close]").forEach((button) => button.onclick = closeModal);
    modal.querySelector("[data-add]").onclick = () => {
      const name = modal.querySelector("[data-service-name]").value.trim();
      const description = modal.querySelector("[data-service-description]").value.trim();
      const route = modal.querySelector("[data-service-route]").value;
      if (!name) { modal.querySelector("[data-service-name]").focus(); return; }
      const next = [...futureServices(), { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, description, route }];
      saveFutureServices(next); closeModal(); renderFutureServices(); newServiceModal();
    };
    modal.querySelectorAll("[data-remove-service]").forEach((button) => button.onclick = () => {
      const next = futureServices().filter((_, index) => index !== Number(button.dataset.removeService));
      saveFutureServices(next); closeModal(); renderFutureServices(); newServiceModal();
    });
  }

  function profileModal() {
    closeModal();
    const p = loadProfile();
    const current = session();
    const modal = document.createElement("div");
    modal.className = "ec-modal-backdrop";
    modal.dataset.ecModal = "true";
    modal.innerHTML = `<section class="ec-modal" role="dialog" aria-modal="true"><header class="ec-modal-head"><div><div class="ec-kicker">Administrator profile</div><h2>Profile & View Customization</h2><p style="margin:0;color:var(--ec-muted)">${esc(current.email || current.username || "Administrator")} · Preferences are saved for this administrator.</p></div><button class="ec-close" data-close>×</button></header><div class="ec-form-grid"><div class="ec-field"><label>Portal theme</label><select data-profile="theme"><option value="executive">Executive Blue</option><option value="clean">Clinical Green</option><option value="warm">Warm Corporate</option><option value="midnight">Midnight Command</option></select></div><div class="ec-field"><label>Accent color</label><input data-profile="accent" type="color" value="${esc(p.accent)}"></div><div class="ec-field"><label>Text font</label><select data-profile="font"><option value="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">Modern Sans</option><option value="Georgia, 'Times New Roman', serif">Executive Serif</option><option value="Arial, Helvetica, sans-serif">Classic Arial</option><option value="'Trebuchet MS', Arial, sans-serif">Friendly Professional</option></select></div><div class="ec-field"><label>Text size</label><select data-profile="fontSize"><option value="14">Small</option><option value="16">Standard</option><option value="18">Large</option><option value="20">Extra Large</option></select></div><div class="ec-field"><label>Screen density</label><select data-profile="density"><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></div><div class="ec-field"><label>Card shape</label><select data-profile="radius"><option value="8">Structured</option><option value="18">Modern</option><option value="28">Soft</option></select></div><div class="ec-field"><label>Mouse tool</label><select data-profile="cursor"><option value="default">Standard Pointer</option><option value="large">Large Precision Cursor</option><option value="crosshair">Crosshair Precision</option></select></div><div class="ec-field"><label>Navigation layout</label><select data-profile="compactNavigation"><option value="false">Full Navigation</option><option value="true">Compact Navigation</option></select></div><label class="ec-toggle"><input data-profile="focus" type="checkbox"> Enhanced keyboard and focus highlight</label><label class="ec-toggle"><input data-profile="reducedMotion" type="checkbox"> Reduce animations and movement</label><label class="ec-toggle"><input data-profile="rememberWorkspace" type="checkbox"> Reopen my last workspace after sign-in</label></div><div class="ec-modal-actions"><button class="ec-button" data-reset>Restore Defaults</button><button class="ec-button" data-close>Cancel</button><button class="ec-button primary" data-save>Save Profile</button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-profile]").forEach((field) => {
      const key = field.dataset.profile;
      if (field.type === "checkbox") field.checked = Boolean(p[key]);
      else field.value = String(p[key]);
    });
    modal.querySelectorAll("[data-close]").forEach((button) => button.onclick = closeModal);
    modal.querySelector("[data-save]").onclick = () => {
      const next = { ...p };
      modal.querySelectorAll("[data-profile]").forEach((field) => {
        const key = field.dataset.profile;
        next[key] = field.type === "checkbox" ? field.checked : (key === "compactNavigation" ? field.value === "true" : field.value);
      });
      saveProfile(next); closeModal();
    };
    modal.querySelector("[data-reset]").onclick = () => { saveProfile({ ...DEFAULT_PROFILE }); closeModal(); profileModal(); };
  }

  function handleTool(tool) {
    const [, name, description, type, target] = tool;
    if (type === "module") {
      if (!moduleClick(target)) openWorkspace(name, description);
    } else if (type === "panel") openOnboardingPanel(target);
    else if (type === "href") window.location.href = target;
    else if (type === "new-service") newServiceModal();
    else if (type === "subsidiary") openSubsidiary(name, target, description);
    else openWorkspace(name, description);
  }

  function openSubsidiary(name, label, description) {
    closeModal();
    const modal = document.createElement("div");
    modal.className = "ec-modal-backdrop";
    modal.dataset.ecModal = "true";
    modal.innerHTML = `<section class="ec-modal"><header class="ec-modal-head"><div><div class="ec-kicker">${esc(label)} service workspace</div><h2>${esc(name)}</h2><p style="margin:0;color:var(--ec-muted)">${esc(description)}</p></div><button class="ec-close" data-close>×</button></header><div class="ec-grid"><button class="ec-tool" data-route="homes"><span class="ec-icon">🏘</span><span><h3>Service Operations</h3><p>Open service homes and operational records.</p></span></button><button class="ec-tool" data-route="employees"><span class="ec-icon">👥</span><span><h3>Workforce</h3><p>Open staff and credential management.</p></span></button><button class="ec-tool" data-route="scheduling"><span class="ec-icon">🗓</span><span><h3>Scheduling</h3><p>Open shift and service scheduling.</p></span></button><button class="ec-tool" data-route="documents"><span class="ec-icon">✅</span><span><h3>Compliance</h3><p>Open documents and compliance controls.</p></span></button><button class="ec-tool" data-route="reports"><span class="ec-icon">📊</span><span><h3>Reports</h3><p>Open reporting and performance review.</p></span></button><button class="ec-tool" data-route="settings"><span class="ec-icon">⚙</span><span><h3>Service Settings</h3><p>Open enterprise settings and configuration.</p></span></button></div></section>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-close]").onclick = closeModal;
    modal.querySelectorAll("[data-route]").forEach((button) => button.onclick = () => { closeModal(); if (!moduleClick(button.dataset.route)) openWorkspace(name, description); });
  }

  function renderFutureServices() {
    const grid = $("ecFutureServicesGrid");
    if (!grid) return;
    const services = futureServices();
    grid.innerHTML = services.length ? services.map((item) => `<button class="ec-tool" data-future-route="${esc(item.route)}"><span class="ec-icon">◆</span><span><h3>${esc(item.name)}</h3><p>${esc(item.description || "Future Sulandra Health service line")}</p></span><span class="ec-arrow">→</span></button>`).join("") : '<button class="ec-tool" data-add-future><span class="ec-icon">＋</span><span><h3>No future services added</h3><p>Provision the next Sulandra Health subsidiary or service line when it is ready.</p></span><span class="ec-arrow">→</span></button>';
    grid.querySelector("[data-add-future]")?.addEventListener("click", newServiceModal);
    grid.querySelectorAll("[data-future-route]").forEach((button) => button.onclick = () => {
      if (!moduleClick(button.dataset.futureRoute)) openWorkspace("Future Service", "This future service route is reserved and ready for its dedicated module.");
    });
  }

  function commandCenter() {
    const element = document.createElement("section");
    element.id = "enterpriseCommandCenter";
    element.className = "ec-command-center";
    const current = session();
    element.innerHTML = `<header class="ec-hero"><div><div class="ec-kicker">Sulandra Health Parent Company</div><h1>Enterprise Administration Command Center</h1><p>Welcome ${esc(current.firstName || current.name || current.email || "Administrator")}. Manage people, service lines, clinical operations, compliance, transportation, revenue and future expansion from one customizable workspace.</p></div><div class="ec-hero-actions"><button class="ec-button" data-ec-profile>Customize View</button><button class="ec-button primary" data-ec-refresh>Refresh & Sync</button></div></header>${GROUPS.map((group, groupIndex) => `<section class="ec-section"><div class="ec-section-head"><div><small>${esc(group.eyebrow)}</small><h2>${esc(group.title)}</h2></div></div><div class="ec-grid">${group.tools.map((tool, toolIndex) => `<button class="ec-tool" data-tool-group="${groupIndex}" data-tool-index="${toolIndex}"><span class="ec-icon">${tool[5]}</span><span><h3>${esc(tool[1])}</h3><p>${esc(tool[2])}</p></span><span class="ec-arrow">→</span></button>`).join("")}</div></section>`).join("")}<section class="ec-section"><div class="ec-section-head"><div><small>Expansion-ready routing</small><h2>Future Sulandra Health Services</h2></div><button class="ec-button" data-add-service>+ Add Service</button></div><div class="ec-grid" id="ecFutureServicesGrid"></div></section>`;
    element.querySelectorAll("[data-tool-group]").forEach((button) => button.onclick = () => handleTool(GROUPS[Number(button.dataset.toolGroup)].tools[Number(button.dataset.toolIndex)]));
    element.querySelector("[data-ec-profile]").onclick = profileModal;
    element.querySelector("[data-add-service]").onclick = newServiceModal;
    element.querySelector("[data-ec-refresh]").onclick = () => {
      const existing = $("refreshBtn") || Array.from(document.querySelectorAll("button")).find((node) => /refresh/i.test(node.textContent));
      if (existing) existing.click(); else location.reload();
    };
    return element;
  }

  function installTopProfileButton() {
    if ($("adminProfileCustomizationButton")) return;
    const signout = $("btnAdminSignOut") || $("signOutBtn") || Array.from(document.querySelectorAll("button,a")).find((node) => /sign out|lockout/i.test(node.textContent));
    if (!signout || !signout.parentElement) return;
    const button = document.createElement("button");
    button.id = "adminProfileCustomizationButton";
    button.type = "button";
    button.className = "ec-top-button primary";
    button.textContent = "Profile";
    button.title = "Customize your administrator profile, screen, text and mouse tools";
    button.onclick = profileModal;
    signout.parentElement.insertBefore(button, signout);
  }

  function installCommandCenter() {
    if ($("enterpriseCommandCenter")) return;
    const dashboard = $("module-dashboard") || document.querySelector("main") || document.querySelector(".main") || document.body;
    const center = commandCenter();
    if (dashboard === document.body) dashboard.insertBefore(center, dashboard.firstChild);
    else dashboard.insertBefore(center, dashboard.firstChild);
    renderFutureServices();
  }

  function rememberWorkspace() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-module]");
      if (!trigger || !loadProfile().rememberWorkspace) return;
      localStorage.setItem(profileKey() + ":workspace", trigger.dataset.module || "dashboard");
    });
    const last = localStorage.getItem(profileKey() + ":workspace");
    if (last && loadProfile().rememberWorkspace) window.setTimeout(() => moduleClick(last), 600);
  }

  function init() {
    installStyles();
    applyProfile(loadProfile());
    installTopProfileButton();
    installCommandCenter();
    rememberWorkspace();
    window.setTimeout(() => { installTopProfileButton(); installCommandCenter(); }, 500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
