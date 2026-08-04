(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const SETTINGS_KEY = "sulandra:admin:company-settings";
  const $ = (id) => document.getElementById(id);

  let applications = [];
  let jobOpenings = [];
  let editingOpeningId = "";

  const esc = (value) => String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const title = (value) => String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

  const slugify = (value) => String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
  }

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
    window.setTimeout(() => $("toast")?.classList.remove("show"), 3500);
  }

  async function api(path, init = {}) {
    if (!token()) {
      signOut();
      throw new Error("Administrator sign-in is required.");
    }

    const response = await fetch(API_BASE + path, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token(),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {})
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) signOut();
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `Request failed (${response.status}).`);
    }
    return payload.data !== undefined ? payload.data : payload;
  }

  function activateModule(key) {
    document.querySelectorAll("#topModuleNav [data-module], #sideModuleNav [data-module]")
      .forEach((node) => node.classList.toggle("active", node.dataset.module === key));
    document.querySelectorAll(".module").forEach((node) => node.classList.remove("active"));
    $(`module-${key}`)?.classList.add("active");
  }

  function activateOnboardingPanel(key) {
    document.querySelectorAll("[data-onboarding-panel]")
      .forEach((node) => node.classList.toggle("active", node.dataset.onboardingPanel === key));
    document.querySelectorAll(".onboarding-panel")
      .forEach((node) => node.classList.toggle("active", node.id === `onboarding-${key}`));
  }

  function applicationName(application) {
    return [application.firstName, application.middleName, application.lastName]
      .filter(Boolean)
      .join(" ") || "Applicant";
  }

  function applicationStatus(application) {
    return String(application.workflowStatus || application.status || "RECEIVED").toUpperCase();
  }

  function applicationRole(application) {
    return String(application.appliedRole || application.role || "GENERAL").toUpperCase();
  }

  function isArchivedApplication(application) {
    return ["ARCHIVED", "REJECTED", "WITHDRAWN", "TERMINATED"].includes(applicationStatus(application));
  }

  function filteredApplications(includeArchived) {
    const query = ($("search")?.value || "").trim().toLowerCase();
    const status = $("statusFilter")?.value || "all";
    const role = $("jobFilter")?.value || "all";

    return applications.filter((app) => {
      if (isArchivedApplication(app) !== includeArchived) return false;
      const haystack = `${applicationName(app)} ${app.email || ""} ${app.phone || ""} ${app.jobTitle || ""} ${applicationRole(app)}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (status !== "all" && applicationStatus(app) !== status) return false;
      if (role !== "all" && applicationRole(app) !== role) return false;
      return true;
    });
  }

  function applicationRow(app, archived) {
    const submitted = app.submittedAt || app.createdAt;
    const date = submitted ? new Date(submitted).toLocaleDateString() : "—";
    const score = app.assessmentScore == null ? "—" : app.assessmentScore;
    const role = app.jobTitle || title(applicationRole(app));

    if (archived) {
      return `<tr>
        <td>${esc(date)}</td>
        <td><strong>${esc(applicationName(app))}</strong><div class="muted">${esc(app.email || app.phone || "")}</div></td>
        <td>${esc(role)}</td>
        <td>${esc(score)}</td>
        <td><button class="btn btn-primary" data-application-id="${esc(app.id)}">Open folder</button></td>
      </tr>`;
    }

    return `<tr>
      <td>${esc(date)}</td>
      <td><strong>${esc(applicationName(app))}</strong><div class="muted">${esc(app.email || app.phone || "")}</div></td>
      <td>${esc(role)}</td>
      <td><span class="score">${esc(score)}</span></td>
      <td><span class="status-pill ${esc(title(applicationStatus(app)))}">${esc(title(applicationStatus(app)))}</span></td>
      <td><button class="btn btn-primary" data-application-id="${esc(app.id)}">Open folder</button></td>
    </tr>`;
  }

  function renderApplications() {
    const active = filteredApplications(false);
    const archived = filteredApplications(true);

    if ($("countLabel")) {
      $("countLabel").textContent = `${active.length} active application${active.length === 1 ? "" : "s"}`;
    }
    if ($("applicantTable")) {
      $("applicantTable").innerHTML = active.length
        ? active.map((app) => applicationRow(app, false)).join("")
        : '<tr><td colspan="6" class="muted">No active applications match the selected filters.</td></tr>';
    }
    if ($("archivedApplicantTable")) {
      $("archivedApplicantTable").innerHTML = archived.length
        ? archived.map((app) => applicationRow(app, true)).join("")
        : '<tr><td colspan="5" class="muted">No archived applicants found.</td></tr>';
    }
    if ($("kpiApplicants")) $("kpiApplicants").textContent = active.length;
  }

  async function loadApplications() {
    try {
      const result = await api("/api/admin/applications?limit=200");
      applications = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
      renderApplications();
      if ($("livePill")) $("livePill").textContent = "Railway: connected";
    } catch (error) {
      if ($("livePill")) $("livePill").textContent = "Railway: error";
      if ($("applicantTable")) {
        $("applicantTable").innerHTML = `<tr><td colspan="6" class="muted">${esc(error.message)}</td></tr>`;
      }
      throw error;
    }
  }

  function openingPayload() {
    return {
      title: $("openingTitle").value.trim(),
      slug: $("openingSlug").value.trim(),
      department: $("openingDepartment").value.trim() || undefined,
      employmentType: $("openingType").value.trim() || undefined,
      locationText: $("openingLocation").value.trim() || undefined,
      payRange: $("openingPay").value.trim() || undefined,
      applicationPath: $("openingPath").value.trim() || undefined,
      summary: $("openingSummary").value.trim(),
      description: $("openingDescription").value.trim(),
      requirements: $("openingRequirements").value.trim() || undefined,
      benefits: $("openingBenefits").value.trim() || undefined,
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
      const path = editingOpeningId
        ? `/api/admin/job-openings/${encodeURIComponent(editingOpeningId)}`
        : "/api/admin/job-openings";
      await api(path, {
        method: editingOpeningId ? "PATCH" : "POST",
        body: JSON.stringify(openingPayload())
      });
      toast("Job opening saved", $("openingStatus").value === "PUBLISHED" ? "The job is live on Careers." : "The opening was saved.");
      resetOpeningForm();
      await loadOpenings();
    } catch (error) {
      toast("Job opening not saved", error.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function openingCard(job, archived) {
    const status = String(job.status || "DRAFT").toUpperCase();
    const actions = archived
      ? `<button class="btn btn-primary" data-status-id="${esc(job.id)}" data-status="PUBLISHED">Restore to Live</button>`
      : `<button class="btn btn-primary" data-edit="${esc(job.id)}">Edit</button>
         ${status === "PUBLISHED"
           ? `<button class="btn btn-ghost" data-status-id="${esc(job.id)}" data-status="CLOSED">Close</button>`
           : `<button class="btn btn-secondary" data-status-id="${esc(job.id)}" data-status="PUBLISHED">Publish Live</button>`}
         <button class="btn btn-danger" data-status-id="${esc(job.id)}" data-status="ARCHIVED">Archive</button>`;

    return `<article class="opening-card">
      <div class="opening-card-head">
        <div><h3>${esc(job.title)}</h3><div class="muted">${esc(job.department || "General")} · ${esc(job.locationText || "Location not specified")}</div></div>
        <span class="status-pill">${esc(title(status))}</span>
      </div>
      <p class="sub" style="margin-top:8px">${esc(job.summary || "")}</p>
      <div class="opening-actions">${actions}</div>
    </article>`;
  }

  function renderOpenings() {
    const active = jobOpenings.filter((job) => ["DRAFT", "PUBLISHED"].includes(String(job.status).toUpperCase()));
    const archived = jobOpenings.filter((job) => ["CLOSED", "ARCHIVED"].includes(String(job.status).toUpperCase()));

    if ($("jobOpeningList")) {
      $("jobOpeningList").innerHTML = active.length
        ? active.map((job) => openingCard(job, false)).join("")
        : '<p class="muted" style="padding:12px;text-align:center">No active job openings.</p>';
    }
    if ($("archivedJobsList")) {
      $("archivedJobsList").innerHTML = archived.length
        ? archived.map((job) => openingCard(job, true)).join("")
        : '<p class="muted" style="padding:12px;text-align:center">No archived or closed job openings.</p>';
    }
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
    const job = jobOpenings.find((item) => String(item.id) === String(id));
    if (!job) return;
    editingOpeningId = String(id);
    if ($("openingId")) $("openingId").value = editingOpeningId;
    $("openingTitle").value = job.title || "";
    $("openingSlug").value = job.slug || "";
    $("openingDepartment").value = job.department || "";
    $("openingType").value = job.employmentType || "";
    $("openingLocation").value = job.locationText || "Dayton, OH";
    $("openingPay").value = job.payRange || "";
    $("openingPath").value = job.applicationPath || "/applygeneral.html";
    $("openingSummary").value = job.summary || "";
    $("openingDescription").value = job.description || "";
    $("openingRequirements").value = job.requirements || "";
    $("openingBenefits").value = job.benefits || "";
    $("openingStatus").value = String(job.status || "DRAFT").toUpperCase();
    $("openingFormTitle").textContent = "Edit Job Opening";
    $("cancelOpeningEdit").hidden = false;
    $("jobOpeningForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function changeOpeningStatus(id, status) {
    try {
      await api(`/api/admin/job-openings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      toast("Job opening updated", status === "PUBLISHED" ? "The job is now live on Careers." : `Status changed to ${title(status)}.`);
      await loadOpenings();
    } catch (error) {
      toast("Job opening not updated", error.message);
    }
  }

  function handleOpeningAction(event) {
    const edit = event.target.closest("[data-edit]");
    const status = event.target.closest("[data-status-id]");
    if (edit) editOpening(edit.dataset.edit);
    else if (status) changeOpeningStatus(status.dataset.statusId, status.dataset.status);
  }

  function openFolder(id) {
    const app = applications.find((item) => String(item.id) === String(id));
    if (!window.SulandraCareersWorkflow || !$("modalBody")) {
      toast("Applicant workflow unavailable", "The applicant workflow script did not load.");
      return;
    }
    $("detailsModal").style.display = "block";
    $("modalTitle").textContent = applicationName(app || {});
    $("modalBody").replaceChildren();
    window.SulandraCareersWorkflow.mount({
      root: $("modalBody"),
      applicationId: id,
      apiBase: API_BASE,
      getToken: token,
      onUpdated: loadApplications
    });
  }

  function exportApplications() {
    const rows = filteredApplications(false);
    const columns = ["Submitted", "Applicant", "Email", "Phone", "Role", "Score", "Status"];
    const csv = [columns, ...rows.map((app) => [
      app.submittedAt || app.createdAt || "",
      applicationName(app),
      app.email || "",
      app.phone || "",
      app.jobTitle || title(applicationRole(app)),
      app.assessmentScore == null ? "" : app.assessmentScore,
      title(applicationStatus(app))
    ])].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sulandra-applicants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (_) { saved = {}; }
    const map = {
      settingCompanyName: "companyName",
      settingCompanyAddress: "companyAddress",
      settingCompanyPhone: "companyPhone",
      settingCompanyEmail: "companyEmail",
      settingSenderName: "senderName",
      settingUnmonitoredNotice: "unmonitoredNotice"
    };
    Object.entries(map).forEach(([id, key]) => {
      if ($(id) && saved[key]) $(id).value = saved[key];
    });
  }

  window.saveCompanySettings = function saveCompanySettings() {
    const settings = {
      companyName: $("settingCompanyName")?.value.trim(),
      companyAddress: $("settingCompanyAddress")?.value.trim(),
      companyPhone: $("settingCompanyPhone")?.value.trim(),
      companyEmail: $("settingCompanyEmail")?.value.trim(),
      senderName: $("settingSenderName")?.value.trim(),
      unmonitoredNotice: $("settingUnmonitoredNotice")?.value.trim()
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.querySelectorAll(".hr-tag-preview").forEach((node) => { node.textContent = settings.senderName || "Human Resources"; });
    toast("Settings saved", "Company and HR display settings were saved in this browser.");
  };

  window.syncArchivedJobsContainer = renderOpenings;

  function bindEvents() {
    document.querySelectorAll("#topModuleNav [data-module], #sideModuleNav [data-module]").forEach((node) => {
      node.addEventListener("click", () => activateModule(node.dataset.module));
    });
    document.querySelectorAll("[data-onboarding-panel]").forEach((node) => {
      node.addEventListener("click", () => activateOnboardingPanel(node.dataset.onboardingPanel));
    });

    $("signOutBtn")?.addEventListener("click", signOut);
    $("btnAdminSignOut")?.addEventListener("click", signOut);
    $("refreshBtn")?.addEventListener("click", async () => {
      try {
        await Promise.all([loadApplications(), loadOpenings(), loadDashboard()]);
        toast("Admin portal refreshed", "The latest Railway data is displayed.");
      } catch (error) {
        toast("Refresh incomplete", error.message);
      }
    });
    $("exportBtn")?.addEventListener("click", exportApplications);
    $("closeModalBtn")?.addEventListener("click", () => {
      $("detailsModal").style.display = "none";
      $("modalBody")?.replaceChildren();
    });
    $("detailsModal")?.addEventListener("click", (event) => {
      if (event.target === $("detailsModal")) $("closeModalBtn")?.click();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("detailsModal")?.style.display === "block") $("closeModalBtn")?.click();
    });

    $("applicantTable")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-application-id]");
      if (button) openFolder(button.dataset.applicationId);
    });
    $("archivedApplicantTable")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-application-id]");
      if (button) openFolder(button.dataset.applicationId);
    });
    $("search")?.addEventListener("input", renderApplications);
    $("statusFilter")?.addEventListener("change", renderApplications);
    $("jobFilter")?.addEventListener("change", renderApplications);

    $("jobOpeningForm")?.addEventListener("submit", saveOpening);
    $("cancelOpeningEdit")?.addEventListener("click", resetOpeningForm);
    $("openingTitle")?.addEventListener("input", () => {
      if (!editingOpeningId && $("openingSlug")) $("openingSlug").value = slugify($("openingTitle").value);
    });
    $("jobOpeningList")?.addEventListener("click", handleOpeningAction);
    $("archivedJobsList")?.addEventListener("click", handleOpeningAction);
  }

  async function initialize() {
    bindEvents();
    loadSettings();

    try {
      const session = await api("/api/session");
      const role = String(session?.role || "").toUpperCase();
      if (!session || !["ADMINISTRATOR", "DOO", "COO"].includes(role)) {
        location.replace("employee-portal.html");
        return;
      }
      if ($("adminEmailPill")) {
        $("adminEmailPill").textContent = session.email || session.username || title(role);
      }
      await Promise.all([loadApplications(), loadOpenings(), loadDashboard()]);
    } catch (error) {
      toast("Admin portal unavailable", error.message);
    }
  }

  initialize();
})();