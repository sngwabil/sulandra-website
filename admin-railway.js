(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const SETTINGS_KEY = "sulandra:admin:company-settings";
  const TASKBAR_KEY = "sulandra:admin:taskbar-open";
  const $ = (id) => document.getElementById(id);
  let applications = [];
  let jobOpenings = [];
  let editingOpeningId = "";

  const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const title = (v) => String(v || "").toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const slugify = (v) => String(v || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    location.replace("employee-login.html");
  }

  function toast(heading, message) {
    if (!$("toast")) return;
    $("toastTitle").textContent = heading;
    $("toastBody").textContent = message;
    $("toast").classList.add("show");
    setTimeout(() => $("toast")?.classList.remove("show"), 3500);
  }

  async function api(path, init = {}) {
    if (!token()) { signOut(); throw new Error("Administrator sign-in is required."); }
    const response = await fetch(API_BASE + path, {
      ...init,
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: "Bearer " + token(), ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) signOut();
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status}).`);
    return payload.data !== undefined ? payload.data : payload;
  }

  function activateModule(key) {
    document.querySelectorAll("#topModuleNav [data-module], #sideModuleNav [data-module]").forEach((n) => n.classList.toggle("active", n.dataset.module === key));
    document.querySelectorAll(".module").forEach((n) => n.classList.remove("active"));
    $(`module-${key}`)?.classList.add("active");
    if (window.innerWidth <= 980) setTaskbarOpen(false);
  }

  function activatePanel(key) {
    document.querySelectorAll("[data-onboarding-panel]").forEach((n) => n.classList.toggle("active", n.dataset.onboardingPanel === key));
    document.querySelectorAll(".onboarding-panel").forEach((n) => n.classList.toggle("active", n.id === `onboarding-${key}`));
  }

  function installSlidingTaskbar() {
    const sidebar = document.querySelector(".sidebar");
    const grid = document.querySelector(".grid");
    if (!sidebar || !grid || $("operationsTaskbarToggle")) return;

    sidebar.id = "operationsTaskbar";
    sidebar.setAttribute("aria-label", "Operations taskbar");

    const style = document.createElement("style");
    style.id = "operationsTaskbarStyles";
    style.textContent = `
      .grid { transition: grid-template-columns .28s ease, gap .28s ease; }
      .sidebar { position:relative; transition:transform .28s ease, opacity .22s ease; }
      .taskbar-toggle {
        position:fixed; left:14px; top:50%; transform:translateY(-50%);
        z-index:1850; width:46px; height:52px; border:0; border-radius:0 14px 14px 0;
        background:var(--primary); color:#fff; box-shadow:0 8px 24px rgba(0,75,141,.28);
        cursor:pointer; font-size:22px; font-weight:900; display:grid; place-items:center;
        transition:left .28s ease, background .2s ease;
      }
      .taskbar-toggle:hover { background:var(--secondary); }
      .taskbar-toggle span { transition:transform .28s ease; }
      body.taskbar-open .taskbar-toggle { left:max(14px, calc((100vw - 1200px)/2 + 280px)); }
      body.taskbar-open .taskbar-toggle span { transform:rotate(180deg); }
      body.taskbar-closed .grid { grid-template-columns:0 minmax(0,1fr); gap:0; }
      body.taskbar-closed .sidebar { transform:translateX(-115%); opacity:0; pointer-events:none; overflow:hidden; }
      .taskbar-scrim { display:none; }
      @media (max-width:980px) {
        .grid { display:block; }
        .sidebar {
          position:fixed; top:0; left:0; bottom:0; z-index:1800; width:min(320px,86vw);
          overflow-y:auto; border-radius:0 16px 16px 0; padding-top:28px;
          transform:translateX(-110%); opacity:1;
        }
        body.taskbar-open .sidebar { transform:translateX(0); }
        body.taskbar-closed .sidebar { transform:translateX(-110%); opacity:1; }
        body.taskbar-open .taskbar-toggle { left:min(320px,86vw); }
        .taskbar-scrim {
          position:fixed; inset:0; z-index:1750; background:rgba(15,23,42,.48);
        }
        body.taskbar-open .taskbar-scrim { display:block; }
      }
    `;
    document.head.appendChild(style);

    const toggle = document.createElement("button");
    toggle.id = "operationsTaskbarToggle";
    toggle.className = "taskbar-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", "operationsTaskbar");
    toggle.innerHTML = '<span aria-hidden="true">›</span><span class="sr-only">Toggle operations taskbar</span>';

    const scrim = document.createElement("div");
    scrim.id = "operationsTaskbarScrim";
    scrim.className = "taskbar-scrim";
    scrim.setAttribute("aria-hidden", "true");

    document.body.append(toggle, scrim);
    toggle.addEventListener("click", () => setTaskbarOpen(!document.body.classList.contains("taskbar-open")));
    scrim.addEventListener("click", () => setTaskbarOpen(false));

    const saved = localStorage.getItem(TASKBAR_KEY);
    setTaskbarOpen(saved === null ? window.innerWidth > 980 : saved === "true", false);
  }

  function setTaskbarOpen(open, persist = true) {
    document.body.classList.toggle("taskbar-open", open);
    document.body.classList.toggle("taskbar-closed", !open);
    const toggle = $("operationsTaskbarToggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.title = open ? "Hide operations taskbar" : "Show operations taskbar";
    }
    if (persist) localStorage.setItem(TASKBAR_KEY, String(open));
  }

  function openInterviewScheduler(candidateName = "Selected Candidate") {
    const modal = $("interviewModal");
    const name = $("interviewApplicantName");
    if (!modal) {
      toast("Scheduler unavailable", "The interview scheduler could not be found on this page.");
      return;
    }
    if (name) name.textContent = candidateName || "Selected Candidate";
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const dateInput = $("interviewDateInput");
    if (dateInput) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const minDate = tomorrow.toISOString().slice(0, 10);
      dateInput.min = minDate;
      if (!dateInput.value) dateInput.value = minDate;
      setTimeout(() => dateInput.focus(), 0);
    }
  }

  function closeInterviewScheduler() {
    const modal = $("interviewModal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  window.openInterviewModal = openInterviewScheduler;
  window.closeInterviewModal = closeInterviewScheduler;
  window.handleStatusChange = function (statusValue) {
    renderApplications();
    if (String(statusValue).toUpperCase() === "INTERVIEW") openInterviewScheduler("Selected Candidate");
  };

  const appName = (app) => [app.firstName, app.middleName, app.lastName].filter(Boolean).join(" ") || "Applicant";
  const appStatus = (app) => String(app.workflowStatus || app.status || "RECEIVED").toUpperCase();
  const appRole = (app) => String(app.appliedRole || app.role || "GENERAL").toUpperCase();
  const isArchived = (app) => ["ARCHIVED", "REJECTED", "WITHDRAWN", "TERMINATED"].includes(appStatus(app));

  function filteredApps(archived) {
    const q = ($("search")?.value || "").trim().toLowerCase();
    const status = $("statusFilter")?.value || "all";
    const role = $("jobFilter")?.value || "all";
    return applications.filter((app) => {
      if (isArchived(app) !== archived) return false;
      const text = `${appName(app)} ${app.email || ""} ${app.phone || ""} ${app.jobTitle || ""} ${appRole(app)}`.toLowerCase();
      return (!q || text.includes(q)) && (status === "all" || appStatus(app) === status) && (role === "all" || appRole(app) === role);
    });
  }

  function appRow(app, archived) {
    const rawDate = app.submittedAt || app.createdAt;
    const date = rawDate ? new Date(rawDate).toLocaleDateString() : "—";
    const score = app.assessmentScore == null ? "—" : app.assessmentScore;
    const role = app.jobTitle || title(appRole(app));
    if (archived) return `<tr><td>${esc(date)}</td><td><strong>${esc(appName(app))}</strong><div class="muted">${esc(app.email || app.phone || "")}</div></td><td>${esc(role)}</td><td>${esc(score)}</td><td><button class="btn btn-primary" data-application-id="${esc(app.id)}">Open folder</button></td></tr>`;
    return `<tr><td>${esc(date)}</td><td><strong>${esc(appName(app))}</strong><div class="muted">${esc(app.email || app.phone || "")}</div></td><td>${esc(role)}</td><td><span class="score">${esc(score)}</span></td><td><span class="status-pill">${esc(title(appStatus(app)))}</span></td><td><button class="btn btn-primary" data-application-id="${esc(app.id)}">Open folder</button>${appStatus(app) === "INTERVIEW" ? ` <button class="btn btn-secondary" data-interview-id="${esc(app.id)}">Schedule interview</button>` : ""}</td></tr>`;
  }

  function renderApplications() {
    const active = filteredApps(false);
    const archived = filteredApps(true);
    if ($("countLabel")) $("countLabel").textContent = `${active.length} active application${active.length === 1 ? "" : "s"}`;
    if ($("kpiApplicants")) $("kpiApplicants").textContent = active.length;
    if ($("applicantTable")) $("applicantTable").innerHTML = active.length ? active.map((a) => appRow(a, false)).join("") : '<tr><td colspan="6" class="muted">No active applications match the selected filters.</td></tr>';
    if ($("archivedApplicantTable")) $("archivedApplicantTable").innerHTML = archived.length ? archived.map((a) => appRow(a, true)).join("") : '<tr><td colspan="5" class="muted">No archived applicants found.</td></tr>';
  }

  async function loadApplications() {
    const result = await api("/api/admin/applications?limit=200");
    applications = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
    renderApplications();
    if ($("livePill")) $("livePill").textContent = "Railway: connected";
  }

  function openingPayload() {
    return {
      title: $("openingTitle").value.trim(), slug: $("openingSlug").value.trim(), department: $("openingDepartment").value.trim() || undefined,
      employmentType: $("openingType").value.trim() || undefined, locationText: $("openingLocation").value.trim() || undefined,
      payRange: $("openingPay").value.trim() || undefined, applicationPath: $("openingPath").value.trim() || undefined,
      summary: $("openingSummary").value.trim(), description: $("openingDescription").value.trim(),
      requirements: $("openingRequirements").value.trim() || undefined, benefits: $("openingBenefits").value.trim() || undefined,
      status: $("openingStatus").value
    };
  }

  function resetOpeningForm() {
    editingOpeningId = "";
    $("jobOpeningForm")?.reset();
    if ($("openingId")) $("openingId").value = "";
    if ($("openingLocation")) $("openingLocation").value = "Dayton, OH";
    if ($("openingPath")) $("openingPath").value = "/applycoo.html";
    if ($("openingStatus")) $("openingStatus").value = "PUBLISHED";
    if ($("openingFormTitle")) $("openingFormTitle").textContent = "Create Job Opening";
    if ($("cancelOpeningEdit")) $("cancelOpeningEdit").hidden = true;
  }

  async function saveOpening(event) {
    event.preventDefault();
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      await api(editingOpeningId ? `/api/admin/job-openings/${encodeURIComponent(editingOpeningId)}` : "/api/admin/job-openings", { method: editingOpeningId ? "PATCH" : "POST", body: JSON.stringify(openingPayload()) });
      toast("Job opening saved", $("openingStatus").value === "PUBLISHED" ? "The job is live on Careers." : "The opening was saved.");
      resetOpeningForm();
      await loadOpenings();
    } catch (error) { toast("Job opening not saved", error.message); }
    finally { if (submit) submit.disabled = false; }
  }

  function openingCard(job, archived) {
    const status = String(job.status || "DRAFT").toUpperCase();
    const actions = archived
      ? `<button class="btn btn-primary" data-status-id="${esc(job.id)}" data-status="PUBLISHED">Restore to Live</button>`
      : `<button class="btn btn-primary" data-edit="${esc(job.id)}">Edit</button>${status === "PUBLISHED" ? `<button class="btn btn-ghost" data-status-id="${esc(job.id)}" data-status="CLOSED">Close</button>` : `<button class="btn btn-secondary" data-status-id="${esc(job.id)}" data-status="PUBLISHED">Publish Live</button>`}<button class="btn btn-danger" data-status-id="${esc(job.id)}" data-status="ARCHIVED">Archive</button>`;
    return `<article class="opening-card"><div class="opening-card-head"><div><h3>${esc(job.title)}</h3><div class="muted">${esc(job.department || "General")} · ${esc(job.locationText || "Location not specified")}</div></div><span class="status-pill">${esc(title(status))}</span></div><p class="sub" style="margin-top:8px">${esc(job.summary || "")}</p><div class="opening-actions">${actions}</div></article>`;
  }

  function renderOpenings() {
    const active = jobOpenings.filter((j) => ["DRAFT", "PUBLISHED"].includes(String(j.status).toUpperCase()));
    const archived = jobOpenings.filter((j) => ["CLOSED", "ARCHIVED"].includes(String(j.status).toUpperCase()));
    if ($("jobOpeningList")) $("jobOpeningList").innerHTML = active.length ? active.map((j) => openingCard(j, false)).join("") : '<p class="muted" style="padding:12px;text-align:center">No active job openings.</p>';
    if ($("archivedJobsList")) $("archivedJobsList").innerHTML = archived.length ? archived.map((j) => openingCard(j, true)).join("") : '<p class="muted" style="padding:12px;text-align:center">No archived or closed job openings.</p>';
  }

  async function loadOpenings() {
    try {
      const result = await api("/api/admin/job-openings");
      jobOpenings = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
      renderOpenings();
    } catch (error) {
      if ($("jobOpeningList")) $("jobOpeningList").innerHTML = `<p class="muted">${esc(error.message)}</p>`;
      toast("Job openings unavailable", error.message);
    }
  }

  function editOpening(id) {
    const job = jobOpenings.find((j) => String(j.id) === String(id));
    if (!job) return;
    editingOpeningId = String(id);
    if ($("openingId")) $("openingId").value = editingOpeningId;
    const values = { openingTitle: job.title, openingSlug: job.slug, openingDepartment: job.department, openingType: job.employmentType, openingLocation: job.locationText || "Dayton, OH", openingPay: job.payRange, openingPath: job.applicationPath || "/applygeneral.html", openingSummary: job.summary, openingDescription: job.description, openingRequirements: job.requirements, openingBenefits: job.benefits };
    Object.entries(values).forEach(([id2, value]) => { if ($(id2)) $(id2).value = value || ""; });
    $("openingStatus").value = String(job.status || "DRAFT").toUpperCase();
    $("openingFormTitle").textContent = "Edit Job Opening";
    $("cancelOpeningEdit").hidden = false;
    $("jobOpeningForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function changeOpeningStatus(id, status) {
    try {
      await api(`/api/admin/job-openings/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      toast("Job opening updated", status === "PUBLISHED" ? "The job is now live on Careers." : `Status changed to ${title(status)}.`);
      await loadOpenings();
    } catch (error) { toast("Job opening not updated", error.message); }
  }

  function handleOpeningAction(event) {
    const edit = event.target.closest("[data-edit]");
    const status = event.target.closest("[data-status-id]");
    if (edit) editOpening(edit.dataset.edit);
    else if (status) changeOpeningStatus(status.dataset.statusId, status.dataset.status);
  }

  function openFolder(id) {
    const app = applications.find((a) => String(a.id) === String(id));
    if (!window.SulandraCareersWorkflow || !$("modalBody")) { toast("Applicant workflow unavailable", "The applicant workflow script did not load."); return; }
    $("detailsModal").style.display = "block";
    $("modalTitle").textContent = appName(app || {});
    $("modalBody").replaceChildren();
    window.SulandraCareersWorkflow.mount({ root: $("modalBody"), applicationId: id, apiBase: API_BASE, getToken: token, onUpdated: loadApplications });
  }

  function exportApplications() {
    const rows = filteredApps(false);
    const data = [["Submitted", "Applicant", "Email", "Phone", "Role", "Score", "Status"], ...rows.map((a) => [a.submittedAt || a.createdAt || "", appName(a), a.email || "", a.phone || "", a.jobTitle || title(appRole(a)), a.assessmentScore ?? "", title(appStatus(a))])];
    const csv = data.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `sulandra-applicants-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  async function loadDashboard() {
    try {
      const data = await api("/api/admin/dashboard");
      if ($("kpiEmployees")) $("kpiEmployees").textContent = data.staff ?? data.employees ?? "—";
      if ($("kpiTimesheets")) $("kpiTimesheets").textContent = data.pendingTimesheets ?? data.pendingDocs ?? "—";
    } catch (_) {
      if ($("kpiEmployees")) $("kpiEmployees").textContent = "—";
      if ($("kpiTimesheets")) $("kpiTimesheets").textContent = "—";
    }
  }

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (_) {}
    const map = { settingCompanyName: "companyName", settingCompanyAddress: "companyAddress", settingCompanyPhone: "companyPhone", settingCompanyEmail: "companyEmail", settingSenderName: "senderName", settingUnmonitoredNotice: "unmonitoredNotice" };
    Object.entries(map).forEach(([id, key]) => { if ($(id) && saved[key]) $(id).value = saved[key]; });
  }

  window.saveCompanySettings = function () {
    const settings = { companyName: $("settingCompanyName")?.value.trim(), companyAddress: $("settingCompanyAddress")?.value.trim(), companyPhone: $("settingCompanyPhone")?.value.trim(), companyEmail: $("settingCompanyEmail")?.value.trim(), senderName: $("settingSenderName")?.value.trim(), unmonitoredNotice: $("settingUnmonitoredNotice")?.value.trim() };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.querySelectorAll(".hr-tag-preview").forEach((n) => { n.textContent = settings.senderName || "Human Resources"; });
    toast("Settings saved", "Company and HR display settings were saved in this browser.");
  };

  window.syncArchivedJobsContainer = function () {};

  function bindEvents() {
    document.querySelectorAll("#topModuleNav [data-module], #sideModuleNav [data-module]").forEach((n) => n.addEventListener("click", () => activateModule(n.dataset.module)));
    document.querySelectorAll("[data-onboarding-panel]").forEach((n) => n.addEventListener("click", () => activatePanel(n.dataset.onboardingPanel)));
    $("btnAdminSignOut")?.addEventListener("click", signOut);
    $("signOutBtn")?.addEventListener("click", signOut);
    $("refreshBtn")?.addEventListener("click", async () => { try { await Promise.all([loadApplications(), loadOpenings(), loadDashboard()]); toast("Admin portal refreshed", "The latest Railway data is displayed."); } catch (e) { toast("Refresh incomplete", e.message); } });
    $("exportBtn")?.addEventListener("click", exportApplications);
    $("closeModalBtn")?.addEventListener("click", () => { $("detailsModal").style.display = "none"; $("modalBody")?.replaceChildren(); });
    $("detailsModal")?.addEventListener("click", (e) => { if (e.target === $("detailsModal")) $("closeModalBtn")?.click(); });
    $("interviewModal")?.addEventListener("click", (e) => { if (e.target === $("interviewModal")) closeInterviewScheduler(); });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if ($("interviewModal")?.style.display === "block") closeInterviewScheduler();
      else if ($("detailsModal")?.style.display === "block") $("closeModalBtn")?.click();
      else if (document.body.classList.contains("taskbar-open") && window.innerWidth <= 980) setTaskbarOpen(false);
    });
    const folderClick = (e) => {
      const interview = e.target.closest("[data-interview-id]");
      if (interview) {
        const app = applications.find((a) => String(a.id) === String(interview.dataset.interviewId));
        openInterviewScheduler(appName(app || {}));
        return;
      }
      const b = e.target.closest("[data-application-id]");
      if (b) openFolder(b.dataset.applicationId);
    };
    $("applicantTable")?.addEventListener("click", folderClick);
    $("archivedApplicantTable")?.addEventListener("click", folderClick);
    $("search")?.addEventListener("input", renderApplications);
    $("statusFilter")?.addEventListener("change", (event) => window.handleStatusChange(event.target.value));
    $("jobFilter")?.addEventListener("change", renderApplications);
    $("jobOpeningForm")?.addEventListener("submit", saveOpening);
    $("cancelOpeningEdit")?.addEventListener("click", resetOpeningForm);
    $("openingTitle")?.addEventListener("input", () => { if (!editingOpeningId && $("openingSlug")) $("openingSlug").value = slugify($("openingTitle").value); });
    $("jobOpeningList")?.addEventListener("click", handleOpeningAction);
    $("archivedJobsList")?.addEventListener("click", handleOpeningAction);
  }

  async function initialize() {
    installSlidingTaskbar();
    bindEvents();
    loadSettings();
    try {
      const session = await api("/api/session");
      const role = String(session?.role || "").toUpperCase();
      if (!session || !["ADMINISTRATOR", "DOO", "COO"].includes(role)) { location.replace("employee-portal.html"); return; }
      if ($("adminEmailPill")) $("adminEmailPill").textContent = session.email || session.username || title(role);
      await Promise.all([loadApplications(), loadOpenings(), loadDashboard()]);
    } catch (error) { if ($("livePill")) $("livePill").textContent = "Railway: error"; toast("Admin portal unavailable", error.message); }
  }

  initialize();
})();