(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const $ = (id) => document.getElementById(id);

  let applications = [];
  let jobOpenings = [];
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
      return applicationStatus(application) !== "POSITION_FILLED"
        && (!query || searchable.includes(query))
        && (status === "all" || applicationStatus(application) === status)
        && (role === "all" || applicationRole(application) === role);
    });
  }

  function renderApplications() {
    const rows = filteredApplications();
    $("countLabel").textContent = `${rows.length} application${rows.length === 1 ? "" : "s"}`;
    $("kpiApplicants").textContent = String(applications.filter((item) => applicationStatus(item) !== "POSITION_FILLED").length);

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

  function renderArchivedApplications() {
    const target = $("archivedApplicantTable");
    if (!target) return;
    const rows = applications.filter((application) => applicationStatus(application) === "POSITION_FILLED");
    if (!rows.length) {
      target.innerHTML = '<tr><td colspan="5" class="muted">No archived applicants yet.</td></tr>';
      return;
    }
    target.innerHTML = rows.map((application) => `<tr>
      <td>${escapeHtml(formatDate(application.submittedAt || application.createdAt))}</td>
      <td><div style="font-weight:900;">${escapeHtml(applicationName(application))}</div><div class="muted" style="font-size:12px;">${escapeHtml(application.email || application.phone || "")}</div></td>
      <td><div style="font-weight:900;">${escapeHtml(application.jobTitle || title(applicationRole(application)))}</div><div class="muted" style="font-size:12px;">${escapeHtml(application.referenceNumber || application.id)}</div></td>
      <td><span class="score">${escapeHtml(scoreLabel(application))}</span></td>
      <td><div class="opening-actions"><button class="btn" data-application-id="${escapeHtml(application.id)}">Open folder</button><button class="btn btn-primary" data-revisit-id="${escapeHtml(application.id)}">Revisit applicant</button></div></td>
    </tr>`).join("");
  }

  async function loadApplications() {
    $("livePill").textContent = "Railway: loading…";
    try {
      const payload = await apiRequest("/api/admin/applications?limit=200");
      applications = Array.isArray(payload.data) ? payload.data : [];
      renderApplications();
      renderArchivedApplications();
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
      onUpdated: loadApplications,
      onArchived: () => $("closeModalBtn").click(),
      onDeleted: () => $("closeModalBtn").click()
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
    activateModule("onboarding");
  }

  function slugify(value) {
    return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
    $("jobOpeningForm").reset();
    $("openingId").value = "";
    $("openingFormTitle").textContent = "Create Job Opening";
    $("cancelOpeningEdit").hidden = true;
  }

  function editOpening(id) {
    const opening = jobOpenings.find((item) => item.id === id);
    if (!opening) return;
    $("openingId").value = opening.id;
    $("openingTitle").value = opening.title || "";
    $("openingSlug").value = opening.slug || "";
    $("openingDepartment").value = opening.department || "";
    $("openingType").value = opening.employmentType || "";
    $("openingLocation").value = opening.locationText || "";
    $("openingPay").value = opening.payRange || "";
    $("openingPath").value = opening.applicationPath || "";
    $("openingSummary").value = opening.summary || "";
    $("openingDescription").value = opening.description || "";
    $("openingRequirements").value = opening.requirements || "";
    $("openingBenefits").value = opening.benefits || "";
    $("openingStatus").value = opening.status || "DRAFT";
    $("openingFormTitle").textContent = "Edit Job Opening";
    $("cancelOpeningEdit").hidden = false;
    $("jobOpeningForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderJobOpenings() {
    const target = $("jobOpeningList");
    if (!target) return;
    if (!jobOpenings.length) {
      target.innerHTML = '<div class="future-card"><h3>No job openings yet</h3><p class="sub">Create the first opening using the form.</p></div>';
      return;
    }
    target.innerHTML = jobOpenings.map((opening) => `<article class="opening-card">
      <div class="opening-card-head"><div><h3>${escapeHtml(opening.title)}</h3><div class="muted">${escapeHtml(opening.department || "General")} · ${escapeHtml(opening.locationText || "Location not specified")}</div></div><span class="status-pill ${escapeHtml(opening.status)}">${escapeHtml(title(opening.status))}</span></div>
      <p class="sub" style="margin-top:9px;">${escapeHtml(opening.summary || "")}</p>
      <div class="muted" style="font-size:12px;">${escapeHtml(String(opening.applicantCount || 0))} applicant(s) · /${escapeHtml(opening.slug)}</div>
      <div class="opening-actions"><button class="btn btn-primary" data-edit-opening="${escapeHtml(opening.id)}">Edit</button>${opening.status !== "PUBLISHED" ? `<button class="btn" data-opening-status="${escapeHtml(opening.id)}" data-status="PUBLISHED">Publish</button>` : `<button class="btn" data-opening-status="${escapeHtml(opening.id)}" data-status="CLOSED">Close</button>`}<button class="btn" data-opening-status="${escapeHtml(opening.id)}" data-status="ARCHIVED">Archive</button></div>
    </article>`).join("");
  }

  async function loadJobOpenings() {
    try {
      const payload = await apiRequest("/api/admin/job-openings");
      jobOpenings = Array.isArray(payload.data) ? payload.data : [];
      renderJobOpenings();
    } catch (error) {
      $("jobOpeningList").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  }

  async function saveJobOpening(event) {
    event.preventDefault();
    const id = $("openingId").value;
    try {
      await apiRequest(id ? `/api/admin/job-openings/${encodeURIComponent(id)}` : "/api/admin/job-openings", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(openingPayload())
      });
      toast("Job opening saved", id ? "The opening was updated." : "The new opening was created.");
      resetOpeningForm();
      await loadJobOpenings();
    } catch (error) {
      toast("Opening not saved", error.message);
    }
  }

  async function changeOpeningStatus(id, status) {
    try {
      await apiRequest(`/api/admin/job-openings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      toast("Job opening updated", `Status changed to ${title(status)}.`);
      await loadJobOpenings();
    } catch (error) {
      toast("Opening not updated", error.message);
    }
  }

  async function revisitApplicant(id) {
    if (!window.confirm("Move this applicant back to active review and email them about the new opportunity?")) return;
    try {
      await apiRequest(`/api/admin/applications/${encodeURIComponent(id)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyApplicant: true })
      });
      toast("Applicant revisited", "The applicant is active again and the opportunity email was sent.");
      await loadApplications();
      activateOnboardingPanel("applicants");
    } catch (error) {
      toast("Applicant not restored", error.message);
    }
  }

  function activateOnboardingPanel(key) {
    document.querySelectorAll("[data-onboarding-panel]").forEach((button) => button.classList.toggle("active", button.dataset.onboardingPanel === key));
    document.querySelectorAll(".onboarding-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `onboarding-${key}`));
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
    document.querySelectorAll("[data-onboarding-panel]").forEach((button) => {
      button.addEventListener("click", () => activateOnboardingPanel(button.dataset.onboardingPanel));
    });

    $("btnAdminSignOut").addEventListener("click", signOut);
    $("refreshBtn").addEventListener("click", () => Promise.all([loadApplications(), loadJobOpenings()]));
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
    $("archivedApplicantTable").addEventListener("click", (event) => {
      const revisit = event.target.closest("[data-revisit-id]");
      const folder = event.target.closest("[data-application-id]");
      if (revisit) revisitApplicant(revisit.dataset.revisitId);
      else if (folder) openApplicationFolder(folder.dataset.applicationId);
    });
    $("jobOpeningForm").addEventListener("submit", saveJobOpening);
    $("cancelOpeningEdit").addEventListener("click", resetOpeningForm);
    $("openingTitle").addEventListener("input", () => {
      if (!$("openingId").value) $("openingSlug").value = slugify($("openingTitle").value);
    });
    $("jobOpeningList").addEventListener("click", (event) => {
      const edit = event.target.closest("[data-edit-opening]");
      const status = event.target.closest("[data-opening-status]");
      if (edit) editOpening(edit.dataset.editOpening);
      else if (status) changeOpeningStatus(status.dataset.openingStatus, status.dataset.status);
    });
    ["search", "statusFilter", "jobFilter"].forEach((id) => {
      $(id).addEventListener("input", renderApplications);
      $(id).addEventListener("change", renderApplications);
    });

    initializeReadOnlyModules();
    try {
      if (await authenticate()) await Promise.all([loadApplications(), loadJobOpenings()]);
    } catch (error) {
      $("livePill").textContent = "Railway: sign-in required";
      toast("Sign-in required", error.message);
    }
  }

  initialize();
})();
