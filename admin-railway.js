(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const $ = (id) => document.getElementById(id);

  let applications = [];
  let jobOpenings = [];
  let editingOpeningId = "";

  const JOB_PRESETS = {
    DSP: ["DSP / Direct Support Professional", "Waiver Services", "Full-Time", "$16–$20 per hour", "/applydsp.html"],
    LPN: ["LPN / Licensed Practical Nurse", "Clinical Services", "PRN", "$28–$34 per hour", "/applylpn.html?role=LPN"],
    RN: ["RN / Registered Nurse", "Clinical Services", "PRN", "$36–$45 per hour", "/applylpn.html?role=RN"],
    DELEGATING_NURSE: ["Delegating Nurse", "Clinical Services", "PRN", "$40–$52 per hour", "/applylpn.html?role=DELEGATING_NURSE"],
    DRIVER: ["NEMT Driver / Transportation Specialist", "Transportation", "Full-Time", "$16–$21 per hour", "/applydriver.html"],
    DOO: ["Director of Operations (DOO)", "Executive Leadership", "Full-Time", "$85,000–$120,000 annually", "/applydoo.html"],
    GENERAL: ["General Employment Opportunity", "Administration", "Full-Time", "Competitive pay", "/applygeneral.html"]
  };

  const esc = (value) => String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const title = (value) => String(value || "")
    .toLowerCase().replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

  const slugify = (value) => String(value || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
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
    if (!response.ok) throw new Error(payload.error || payload.message || "The request could not be completed.");
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

  function installJobEditor() {
    const panel = $("onboarding-openings");
    if (!panel) return;
    panel.innerHTML = `
      <section class="opening-grid">
        <section class="card">
          <h1 id="openingFormTitle">Create Job Opening</h1>
          <p class="sub">Published openings appear automatically on the live Careers page.</p>
          <form id="jobOpeningForm" class="opening-form">
            <label>Template<select id="openingPreset"><option value="">Choose a template</option>${Object.keys(JOB_PRESETS).map((key) => `<option value="${key}">${esc(JOB_PRESETS[key][0])}</option>`).join("")}</select></label>
            <label>Job title<input id="openingTitle" required minlength="2" maxlength="160"></label>
            <label>URL slug<input id="openingSlug" required pattern="[a-z0-9-]+" maxlength="120"></label>
            <label>Department<input id="openingDepartment" maxlength="120"></label>
            <label>Employment type<select id="openingType"><option>Full-Time</option><option>Part-Time</option><option>PRN</option><option>Contract</option></select></label>
            <label>Location<input id="openingLocation" value="Dayton, OH" maxlength="180"></label>
            <label>Pay range<input id="openingPay" maxlength="120"></label>
            <label>Application form<select id="openingPath"><option value="/applydsp.html">DSP / Caregiver form</option><option value="/applylpn.html?role=LPN">LPN form</option><option value="/applylpn.html?role=RN">RN form</option><option value="/applylpn.html?role=DELEGATING_NURSE">Delegating Nurse form</option><option value="/applydriver.html">Driver form</option><option value="/applydoo.html">DOO form</option><option value="/applygeneral.html">General form</option></select></label>
            <label>Short summary<textarea id="openingSummary" required minlength="10" maxlength="1000"></textarea></label>
            <label>Full description<textarea id="openingDescription" required minlength="20" maxlength="20000"></textarea></label>
            <label>Requirements<textarea id="openingRequirements" maxlength="10000"></textarea></label>
            <label>Benefits<textarea id="openingBenefits" maxlength="10000"></textarea></label>
            <label>Status<select id="openingStatus"><option value="DRAFT">Draft — not visible</option><option value="PUBLISHED">Published — live on Careers</option></select></label>
            <div class="opening-actions"><button class="btn btn-primary" type="submit">Save Job Opening</button><button class="btn" id="cancelOpeningEdit" type="button" hidden>Cancel Edit</button><a class="btn" href="/careers.html" target="_blank" rel="noopener">View Live Careers</a></div>
          </form>
        </section>
        <section class="card"><h1>Active Job Openings</h1><p class="sub">Use Publish to make a draft visible immediately.</p><div id="jobOpeningList" class="opening-cards"></div></section>
      </section>`;

    $("jobOpeningForm").addEventListener("submit", saveOpening);
    $("cancelOpeningEdit").addEventListener("click", resetOpeningForm);
    $("openingTitle").addEventListener("input", () => {
      if (!editingOpeningId) $("openingSlug").value = slugify($("openingTitle").value);
    });
    $("openingPreset").addEventListener("change", applyPreset);
    $("jobOpeningList").addEventListener("click", handleOpeningAction);
  }

  function applyPreset() {
    const preset = JOB_PRESETS[$("openingPreset").value];
    if (!preset) return;
    const [jobTitle, department, type, pay, path] = preset;
    $("openingTitle").value = jobTitle;
    $("openingSlug").value = slugify(jobTitle);
    $("openingDepartment").value = department;
    $("openingType").value = type;
    $("openingPay").value = pay;
    $("openingPath").value = path;
    $("openingSummary").value = `Join Sulandra Health as a ${jobTitle} and help deliver dependable, person-centered services.`;
    $("openingDescription").value = `The ${jobTitle} supports safe, respectful, compliant service delivery while collaborating with clients, families, employees, and leadership.`;
    $("openingRequirements").value = "Relevant education or experience; dependable communication; successful credential and background verification as applicable.";
    $("openingBenefits").value = "Competitive compensation, paid training, professional development, and a supportive team environment.";
  }

  function openingPayload() {
    return {
      title: $("openingTitle").value.trim(),
      slug: $("openingSlug").value.trim(),
      department: $("openingDepartment").value.trim() || undefined,
      employmentType: $("openingType").value,
      locationText: $("openingLocation").value.trim() || undefined,
      payRange: $("openingPay").value.trim() || undefined,
      applicationPath: $("openingPath").value || undefined,
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
    if ($("openingLocation")) $("openingLocation").value = "Dayton, OH";
    if ($("openingType")) $("openingType").value = "Full-Time";
    if ($("openingPath")) $("openingPath").value = "/applydsp.html";
    if ($("openingFormTitle")) $("openingFormTitle").textContent = "Create Job Opening";
    if ($("cancelOpeningEdit")) $("cancelOpeningEdit").hidden = true;
  }

  async function saveOpening(event) {
    event.preventDefault();
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      await api(editingOpeningId ? `/api/admin/job-openings/${encodeURIComponent(editingOpeningId)}` : "/api/admin/job-openings", {
        method: editingOpeningId ? "PATCH" : "POST",
        body: JSON.stringify(openingPayload())
      });
      toast("Job opening saved", $("openingStatus").value === "PUBLISHED" ? "The job is now live on Careers." : "The job was saved as a draft.");
      resetOpeningForm();
      await loadOpenings();
    } catch (error) {
      toast("Job opening not saved", error.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function renderOpenings() {
    const active = jobOpenings.filter((job) => ["DRAFT", "PUBLISHED"].includes(String(job.status).toUpperCase()));
    if ($("jobOpeningList")) {
      $("jobOpeningList").innerHTML = active.length ? active.map((job) => {
        const status = String(job.status || "DRAFT").toUpperCase();
        return `<article class="opening-card"><div class="opening-card-head"><div><h3>${esc(job.title)}</h3><div class="muted">${esc(job.department || "General")} · ${esc(job.locationText || "Location not specified")}</div></div><span class="status-pill">${esc(title(status))}</span></div><p class="sub" style="margin-top:8px">${esc(job.summary || "")}</p><div class="opening-actions"><button class="btn btn-primary" data-edit="${esc(job.id)}">Edit</button>${status === "PUBLISHED" ? `<button class="btn" data-status-id="${esc(job.id)}" data-status="CLOSED">Close</button>` : `<button class="btn" data-status-id="${esc(job.id)}" data-status="PUBLISHED">Publish Live</button>`}<button class="btn" data-status-id="${esc(job.id)}" data-status="ARCHIVED">Archive</button></div></article>`;
      }).join("") : '<div class="future-card"><h3>No active job openings</h3><p class="sub">Create a job using the form.</p></div>';
    }

    const archived = jobOpenings.filter((job) => ["CLOSED", "ARCHIVED"].includes(String(job.status).toUpperCase()));
    if ($("archivedJobOpeningList")) {
      $("archivedJobOpeningList").innerHTML = `<h2 style="margin-top:20px">Jobs Archive</h2>${archived.length ? archived.map((job) => `<article class="opening-card"><h3>${esc(job.title)}</h3><p class="sub">${esc(title(job.status))}</p><button class="btn btn-primary" data-restore-job="${esc(job.id)}">Restore and Publish</button></article>`).join("") : '<p class="sub">No archived jobs.</p>'}`;
      $("archivedJobOpeningList").onclick = async (event) => {
        const button = event.target.closest("[data-restore-job]");
        if (button) await changeStatus(button.dataset.restoreJob, "PUBLISHED");
      };
    }
  }

  async function loadOpenings() {
    try {
      jobOpenings = await api("/api/admin/job-openings");
      if (!Array.isArray(jobOpenings)) jobOpenings = [];
      renderOpenings();
    } catch (error) {
      if ($("jobOpeningList")) $("jobOpeningList").innerHTML = `<p class="muted">${esc(error.message)}</p>`;
      toast("Job openings unavailable", error.message);
    }
  }

  function editOpening(id) {
    const job = jobOpenings.find((item) => item.id === id);
    if (!job) return;
    editingOpeningId = id;
    $("openingTitle").value = job.title || "";
    $("openingSlug").value = job.slug || "";
    $("openingDepartment").value = job.department || "";
    $("openingType").value = job.employmentType || "Full-Time";
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

  async function changeStatus(id, status) {
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
    else if (status) changeStatus(status.dataset.statusId, status.dataset.status);
  }

  function applicationName(application) {
    return [application.firstName, application.middleName, application.lastName].filter(Boolean).join(" ") || "Applicant";
  }

  function renderApplications() {
    const query = ($("search")?.value || "").toLowerCase();
    const rows = applications.filter((app) => !query || `${applicationName(app)} ${app.email || ""} ${app.phone || ""}`.toLowerCase().includes(query));
    if ($("countLabel")) $("countLabel").textContent = `${rows.length} application${rows.length === 1 ? "" : "s"}`;
    if ($("applicantTable")) $("applicantTable").innerHTML = rows.length ? rows.map((app) => `<tr><td>${esc(new Date(app.submittedAt || app.createdAt).toLocaleDateString())}</td><td><strong>${esc(applicationName(app))}</strong><div class="muted">${esc(app.email || app.phone || "")}</div></td><td>${esc(app.jobTitle || title(app.appliedRole))}</td><td>${esc(app.assessmentScore == null ? "—" : app.assessmentScore)}</td><td>${esc(title(app.workflowStatus || app.status || "RECEIVED"))}</td><td><button class="btn btn-primary" data-application-id="${esc(app.id)}">Open folder</button></td></tr>`).join("") : '<tr><td colspan="6" class="muted">No applications found.</td></tr>';
  }

  async function loadApplications() {
    try {
      applications = await api("/api/admin/applications?limit=200");
      if (!Array.isArray(applications)) applications = [];
      renderApplications();
      if ($("livePill")) $("livePill").textContent = "Railway: connected";
    } catch (error) {
      if ($("livePill")) $("livePill").textContent = "Railway: error";
    }
  }

  function openFolder(id) {
    if (!window.SulandraCareersWorkflow || !$("modalBody")) return;
    $("detailsModal").style.display = "block";
    $("modalTitle").textContent = applicationName(applications.find((app) => app.id === id) || {});
    window.SulandraCareersWorkflow.mount({ root: $("modalBody"), applicationId: id, apiBase: API_BASE, getToken: token, onUpdated: loadApplications });
  }

  async function initialize() {
    installJobEditor();
    document.querySelectorAll("#topModuleNav [data-module], #sideModuleNav [data-module]").forEach((node) => node.addEventListener("click", () => activateModule(node.dataset.module)));
    document.querySelectorAll("[data-onboarding-panel]").forEach((node) => node.addEventListener("click", () => activateOnboardingPanel(node.dataset.onboardingPanel)));
    $("signOutBtn")?.addEventListener("click", signOut);
    $("btnAdminSignOut")?.addEventListener("click", signOut);
    $("refreshBtn")?.addEventListener("click", () => Promise.all([loadApplications(), loadOpenings()]));
    $("closeModalBtn")?.addEventListener("click", () => { $("detailsModal").style.display = "none"; $("modalBody").replaceChildren(); });
    $("applicantTable")?.addEventListener("click", (event) => { const button = event.target.closest("[data-application-id]"); if (button) openFolder(button.dataset.applicationId); });
    $("search")?.addEventListener("input", renderApplications);

    try {
      const session = await api("/api/session");
      if (!session || !["ADMINISTRATOR", "DOO"].includes(String(session.role))) {
        location.replace("employee-portal.html");
        return;
      }
      if ($("adminEmailPill")) $("adminEmailPill").textContent = session.email || session.username || title(session.role);
      await Promise.all([loadApplications(), loadOpenings()]);
    } catch (error) {
      toast("Admin portal unavailable", error.message);
    }
  }

  initialize();
})();
