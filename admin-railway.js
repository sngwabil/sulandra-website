(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const $ = (id) => document.getElementById(id);

  let applications = [];
  let session = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function title(value) {
    return String(value || "")
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }

  function toast(heading, message) {
    const element = $("toast");
    if (!element) return;
    $("toastTitle").textContent = heading;
    $("toastBody").textContent = message;
    element.classList.add("show");
    window.setTimeout(() => element.classList.remove("show"), 3200);
  }

  function readStoredSession() {
    try {
      return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function getToken() {
    return window.sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function signOut() {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    window.location.replace("employee-login.html");
  }

  async function apiRequest(path, init = {}) {
    const token = getToken();
    if (!token) {
      signOut();
      throw new Error("Administrator sign-in is required.");
    }

    const response = await fetch(API_BASE + path, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token,
        ...init.headers
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401) {
      signOut();
      throw new Error("Your administrator session has expired.");
    }
    if (!response.ok) {
      throw new Error(payload.error || "The request could not be completed.");
    }
    return payload;
  }

  function activateModule(key) {
    document.querySelectorAll("#topModuleNav a[data-module]").forEach((link) => {
      link.classList.toggle("active", link.dataset.module === key);
    });
    document.querySelectorAll("#sideModuleNav button[data-module]").forEach((button) => {
      button.classList.toggle("active", button.dataset.module === key);
    });
    document.querySelectorAll(".module").forEach((module) => module.classList.remove("active"));
    document.getElementById(`module-${key}`)?.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applicationStatus(application) {
    return String(application.workflowStatus || application.status || "RECEIVED").toUpperCase();
  }

  function applicationRole(application) {
    const role = String(application.appliedRole || "").toUpperCase();
    if (role) return role;
    const job = String(application.jobTitle || "").toLowerCase();
    if (job.includes("lpn") || job.includes("practical nurse")) return "LPN";
    if (job.includes("rn") || job.includes("registered nurse")) return "RN";
    if (job.includes("dsp") || job.includes("direct support")) return "DSP";
    return "GENERAL";
  }

  function applicationName(application) {
    return [application.firstName, application.middleName, application.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || "Unknown applicant";
  }

  function formatDate(value) {
    if (!value) return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
  }

  function scoreLabel(application) {
    const score = application.assessmentScore ?? application.scoreTotal;
    const maximum = application.assessmentMaxScore ?? application.scoreMaximum;
    if (score == null) return "—";
    return maximum == null ? String(score) : `${score}/${maximum}`;
  }

  function filteredApplications() {
    const query = ($("search")?.value || "").trim().toLowerCase();
    const status = $("statusFilter")?.value || "all";
    const role = $("jobFilter")?.value || "all";

    return applications.filter((application) => {
      const searchable = [
        applicationName(application),
        application.email,
        application.phone,
        application.referenceNumber,
        application.jobTitle
      ].join(" ").toLowerCase();
      return (!query || searchable.includes(query))
        && (status === "all" || applicationStatus(application) === status)
        && (role === "all" || applicationRole(application) === role);
    });
  }

  function renderApplications() {
    const rows = filteredApplications();
    $("countLabel").textContent = `${rows.length} application${rows.length === 1 ? "" : "s"}`;
    $("kpiApplicants").textContent = String(applications.length);

    if (!rows.length) {
      $("applicantTable").innerHTML =
        '<tr><td colspan="6" class="muted">No applications match your filters.</td></tr>';
      return;
    }

    $("applicantTable").innerHTML = rows.map((application) => {
      const status = applicationStatus(application);
      const role = applicationRole(application);
      return `<tr>
        <td>${escapeHtml(formatDate(application.submittedAt || application.createdAt))}</td>
        <td>
          <div style="font-weight:900;">${escapeHtml(applicationName(application))}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(application.email || application.phone || "No contact supplied")}</div>
        </td>
        <td>
          <div style="font-weight:900;">${escapeHtml(application.jobTitle || title(role))}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(application.referenceNumber || application.id)}</div>
        </td>
        <td><span class="score">${escapeHtml(scoreLabel(application))}</span></td>
        <td><span class="status-pill ${escapeHtml(status)}">${escapeHtml(title(status))}</span></td>
        <td>
          <button class="btn btn-primary" data-application-id="${escapeHtml(application.id)}">Open folder</button>
        </td>
      </tr>`;
    }).join("");
  }

  async function loadApplications() {
    $("livePill").textContent = "Railway: loading…";
    try {
      const payload = await apiRequest("/api/admin/applications?limit=200");
      applications = Array.isArray(payload.data) ? payload.data : [];
      renderApplications();
      $("livePill").textContent = "Railway: connected";
    } catch (error) {
      $("livePill").textContent = "Railway: error";
      $("applicantTable").innerHTML =
        `<tr><td colspan="6" class="muted">${escapeHtml(error.message)}</td></tr>`;
      toast("Applications unavailable", error.message);
    }
  }

  function openApplicationFolder(applicationId) {
    const application = applications.find((item) => item.id === applicationId);
    $("modalTitle").textContent = application ? applicationName(application) : "Applicant folder";
    $("detailsModal").style.display = "block";

    if (!window.SulandraCareersWorkflow) {
      $("modalBody").innerHTML =
        '<div class="muted">The applicant workflow could not be loaded. Refresh this page and try again.</div>';
      return;
    }

    window.SulandraCareersWorkflow.mount({
      root: $("modalBody"),
      applicationId,
      apiBase: API_BASE,
      getToken,
      onUpdated: loadApplications
    });
  }

  function exportApplications() {
    const rows = filteredApplications();
    const columns = [
      "submittedAt", "referenceNumber", "name", "email", "phone",
      "role", "jobTitle", "status", "score"
    ];
    const quote = (value) => `"${String(value == null ? "" : value).replaceAll('"', '""')}"`;
    const csv = [
      columns.join(","),
      ...rows.map((application) => [
        application.submittedAt || application.createdAt || "",
        application.referenceNumber || application.id,
        applicationName(application),
        application.email || "",
        application.phone || "",
        applicationRole(application),
        application.jobTitle || "",
        applicationStatus(application),
        scoreLabel(application)
      ].map(quote).join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `applications-export-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    activateModule("applicants");
  }

  async function authenticate() {
    session = readStoredSession();
    const payload = await apiRequest("/api/session");
    const verifiedSession = payload.data || {};
    if (verifiedSession.role !== "ADMINISTRATOR") {
      window.location.replace("employee-portal.html");
      return false;
    }
    session = { ...session, ...verifiedSession };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    $("adminEmailPill").textContent = session.email || session.username || "Administrator";
    return true;
  }

  function initializeReadOnlyModules() {
    $("kpiEmployees").textContent = "—";
    $("kpiTimesheets").textContent = "—";
    $("employeeSelect").innerHTML = '<option value="">Managed in S.P.I.R.E.</option>';
    $("timesheetTable").innerHTML =
      '<tr><td colspan="6" class="muted">Timesheets are managed through the authenticated S.P.I.R.E. API.</td></tr>';
    $("assignBtn")?.addEventListener("click", () => {
      toast("S.P.I.R.E. required", "Education assignments are managed in the employee administration workspace.");
    });
  }

  async function initialize() {
    document.querySelectorAll("#topModuleNav a[data-module]").forEach((link) => {
      link.addEventListener("click", () => activateModule(link.dataset.module));
    });
    document.querySelectorAll("#sideModuleNav button[data-module]").forEach((button) => {
      button.addEventListener("click", () => activateModule(button.dataset.module));
    });

    $("btnAdminSignOut").addEventListener("click", signOut);
    $("refreshBtn").addEventListener("click", loadApplications);
    $("exportBtn").addEventListener("click", exportApplications);
    $("closeModalBtn").addEventListener("click", () => {
      $("detailsModal").style.display = "none";
      $("modalBody").replaceChildren();
    });
    $("detailsModal").addEventListener("click", (event) => {
      if (event.target === $("detailsModal")) $("closeModalBtn").click();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("detailsModal").style.display === "block") {
        $("closeModalBtn").click();
      }
    });
    $("applicantTable").addEventListener("click", (event) => {
      const button = event.target.closest("[data-application-id]");
      if (button) openApplicationFolder(button.dataset.applicationId);
    });
    ["search", "statusFilter", "jobFilter"].forEach((id) => {
      $(id).addEventListener("input", renderApplications);
      $(id).addEventListener("change", renderApplications);
    });

    initializeReadOnlyModules();
    try {
      if (await authenticate()) await loadApplications();
    } catch (error) {
      $("livePill").textContent = "Railway: sign-in required";
      toast("Sign-in required", error.message);
    }
  }

  initialize();
})();
