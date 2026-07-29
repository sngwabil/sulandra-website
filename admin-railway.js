(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const $ = (id) => document.getElementById(id);

  let applications = [];
  let jobOpenings = [];
  let session = null;
  let interviewApplicationId = "";
  let pendingInterviewNote = "";

  const JOB_PRESETS = {
    DSP: {
      title: "DSP / Direct Support Professional", department: "Waiver Services", employmentType: "Full-Time",
      payRange: "$16–$20 per hour", applicationPath: "/applydsp.html",
      summary: "Provide person-centered support that helps individuals with developmental disabilities live safely, independently, and with dignity.",
      description: "Support daily living, personal care, medication routines as authorized, transportation, community participation, household activities, and accurate service documentation. Follow each person’s plan, protect rights and privacy, communicate changes promptly, and maintain a safe, respectful home environment.",
      requirements: "High school diploma or equivalent; dependable transportation; valid driver’s license where driving is required; ability to complete required background checks and training; respectful, reliable, person-centered approach.",
      benefits: "Competitive pay; paid training; flexible scheduling; professional development; supportive team environment."
    },
    CNA: {
      title: "CNA / Home Health Aide (HHA)", department: "Home Health", employmentType: "Full-Time",
      payRange: "$17–$22 per hour", applicationPath: "/applydsp.html",
      summary: "Deliver compassionate in-home personal care and daily-living assistance under the direction of the care team.",
      description: "Assist with bathing, grooming, dressing, mobility, nutrition, light housekeeping, safety monitoring, and timely documentation. Observe and report changes in condition while preserving each client’s dignity, preferences, privacy, and independence.",
      requirements: "Active Ohio CNA credential when required for the assignment, or qualifying home-health aide experience; CPR/First Aid preferred; reliable transportation; background check; strong communication and documentation skills.",
      benefits: "Competitive pay; flexible schedules; paid orientation and training; mileage support when applicable; career-growth opportunities."
    },
    HHA_PCA: {
      title: "Home Health Aide (HHA) / Personal Care Aide (PCA) / Caregiver", department: "Home Health", employmentType: "Full-Time",
      payRange: "$16–$21 per hour", applicationPath: "/applydsp.html",
      summary: "Provide dependable, compassionate personal care and household support that helps clients remain safe and independent at home.",
      description: "Assist with bathing, grooming, dressing, mobility, meal preparation, light housekeeping, companionship, errands, and safety monitoring. Follow the plan of care, document services accurately, protect privacy, and report changes in condition promptly.",
      requirements: "Home-care or caregiving experience preferred; CPR/First Aid preferred; reliable transportation; ability to complete required background checks and training; respectful and dependable communication.",
      benefits: "Competitive pay; flexible schedules; paid orientation and training; supportive supervision; career-growth opportunities."
    },
    LPN: {
      title: "LPN / Licensed Practical Nurse", department: "Clinical Services", employmentType: "PRN",
      payRange: "$28–$34 per hour", applicationPath: "/applylpn.html",
      summary: "Provide safe, person-centered nursing services in home and community settings in accordance with Ohio standards and the plan of care.",
      description: "Complete focused assessments, administer medications and treatments, monitor clinical status, maintain accurate records, coordinate with the RN and care team, educate clients and caregivers, and escalate changes in condition promptly.",
      requirements: "Active unrestricted Ohio LPN license; current CPR/BLS; relevant clinical or home-care experience; reliable transportation; successful background and credential verification.",
      benefits: "Competitive clinical pay; flexible PRN scheduling; continuing-education support; collaborative care team."
    },
    RN: {
      title: "RN / Registered Nurse", department: "Clinical Services", employmentType: "PRN",
      payRange: "$36–$45 per hour", applicationPath: "/applylpn.html?role=RN",
      summary: "Lead high-quality home-health and waiver nursing through assessment, care planning, clinical oversight, and team collaboration.",
      description: "Perform comprehensive assessments, develop and update care plans, provide skilled nursing, supervise delegated services, coordinate with providers and families, monitor outcomes, and maintain compliant clinical documentation.",
      requirements: "Active unrestricted Ohio RN license; current CPR/BLS; strong assessment and care-planning experience; valid driver’s license and reliable transportation; successful credential verification.",
      benefits: "Competitive nursing pay; flexible scheduling; professional autonomy; leadership and development opportunities."
    },
    DELEGATING_NURSE: {
      title: "Delegating Nurse", department: "Clinical Services", employmentType: "PRN",
      payRange: "$40–$52 per hour", applicationPath: "/applylpn.html?role=RN",
      summary: "Provide nursing delegation, training, assessment, and clinical oversight for safe waiver and community-based services.",
      description: "Assess individuals and environments, develop delegation plans, train and validate direct-care staff, monitor medication administration and health-related activities, complete required reviews, and coordinate changes with providers and the interdisciplinary team.",
      requirements: "Active unrestricted Ohio RN license; current CPR/BLS; experience with nursing delegation, developmental-disability services, home care, or community nursing; reliable transportation; strong teaching and documentation skills.",
      benefits: "Competitive clinical pay; flexible scheduling; professional autonomy; mission-focused leadership opportunity."
    },
    DRIVER: {
      title: "NEMT Driver / Transportation Specialist / Van Driver", department: "Transportation", employmentType: "Full-Time",
      payRange: "$16–$21 per hour", applicationPath: "/applydriver.html",
      summary: "Provide safe, courteous, and dependable non-emergency transportation for clients traveling to appointments and community activities.",
      description: "Complete pre-trip inspections, follow assigned routes and schedules, assist passengers respectfully, secure mobility equipment, maintain trip documentation, report incidents, and keep vehicles clean and safe.",
      requirements: "Valid driver’s license with acceptable three-year driving history; current auto insurance when applicable; ability to submit an MVR; safe-driving record; passenger-assistance skills; background and drug screening as required.",
      benefits: "Competitive pay; paid safety training; predictable routes; supportive transportation team."
    },
    SUPERVISOR: {
      title: "Site Supervisor / House Manager", department: "Community Living", employmentType: "Full-Time",
      payRange: "$20–$27 per hour", applicationPath: "/applygeneral.html",
      summary: "Lead daily operations, staff coordination, safety, documentation, and person-centered services within a supported living home.",
      description: "Coordinate schedules and coverage, coach direct-support staff, monitor service-plan implementation, review documentation, manage household operations, communicate with families and clinical partners, and promptly address safety or compliance concerns.",
      requirements: "Two or more years of direct-care experience; leadership or supervisory experience; strong documentation and conflict-resolution skills; valid driver’s license; ability to complete required training and background checks.",
      benefits: "Leadership pay; paid training; advancement opportunities; benefits eligibility based on employment status."
    },
    PROGRAM_MANAGER: {
      title: "Program Manager", department: "Operations", employmentType: "Full-Time",
      payRange: "$65,000–$85,000 annually", applicationPath: "/applygeneral.html",
      summary: "Lead person-centered programs, staff performance, service quality, and regulatory compliance across assigned homes and community services.",
      description: "Oversee program operations, staffing and coverage, individual service-plan implementation, incident follow-up, documentation quality, budgets, stakeholder communication, and continuous improvement. Coach supervisors and ensure services remain safe, compliant, and outcome focused.",
      requirements: "Bachelor’s degree or equivalent relevant experience; three or more years in developmental-disability, home-care, or human-services operations; supervisory experience; strong compliance, communication, and problem-solving skills.",
      benefits: "Competitive salary; leadership development; benefits eligibility; meaningful operational ownership."
    },
    SCHEDULER: {
      title: "Scheduler / Staffing Coordinator", department: "Operations", employmentType: "Full-Time",
      payRange: "$19–$26 per hour", applicationPath: "/applygeneral.html",
      summary: "Coordinate reliable staffing coverage and responsive scheduling across Sulandra Health programs.",
      description: "Build and maintain schedules, fill open shifts, track availability and credentials, communicate schedule changes, support attendance follow-up, and partner with operations leaders to maintain safe coverage while controlling overtime.",
      requirements: "Scheduling or workforce-coordination experience preferred; strong organization and customer service; comfort with scheduling software and spreadsheets; ability to manage urgent changes professionally.",
      benefits: "Competitive pay; predictable office schedule with on-call rotation as assigned; paid training; advancement opportunities."
    },
    HR_MANAGER: {
      title: "Human Resources Manager", department: "Human Resources", employmentType: "Full-Time",
      payRange: "$70,000–$95,000 annually", applicationPath: "/applygeneral.html",
      summary: "Build a reliable, compliant, employee-centered workforce system across Sulandra Health departments.",
      description: "Lead recruiting, onboarding, employee relations, performance management, policy administration, benefits coordination, training compliance, records, and workforce analytics. Partner with leaders to strengthen retention, accountability, and workplace culture.",
      requirements: "Bachelor’s degree in human resources, business, or a related field; progressive HR experience; knowledge of employment law and healthcare workforce practices; SHRM or HRCI certification preferred.",
      benefits: "Competitive salary; comprehensive benefits eligibility; professional-development support; strategic leadership opportunity."
    },
    COMPLIANCE: {
      title: "Compliance & Quality Manager", department: "Quality & Compliance", employmentType: "Full-Time",
      payRange: "$70,000–$95,000 annually", applicationPath: "/applygeneral.html",
      summary: "Lead regulatory compliance, quality assurance, incident oversight, and continuous improvement across clinical and waiver services.",
      description: "Maintain compliance programs, conduct audits, monitor corrective actions, investigate trends, manage policy updates, support survey readiness, educate teams, and report quality and risk indicators to leadership.",
      requirements: "Bachelor’s degree or equivalent experience; healthcare or human-services compliance background; strong knowledge of audits, incident management, corrective action, and documentation standards; excellent analytical communication.",
      benefits: "Competitive salary; benefits eligibility; professional-development support; organization-wide quality leadership."
    },
    BILLING: {
      title: "Billing / Revenue Cycle Specialist", department: "Revenue Cycle", employmentType: "Full-Time",
      payRange: "$22–$32 per hour", applicationPath: "/applygeneral.html",
      summary: "Support accurate, timely billing and payment follow-up for home-health, waiver, and transportation services.",
      description: "Review service documentation, prepare and submit claims, resolve edits and denials, post payments, reconcile accounts, follow payer requirements, and communicate documentation needs to operations and clinical teams.",
      requirements: "Healthcare billing or revenue-cycle experience; strong attention to detail; familiarity with Medicaid, managed care, or home-health billing preferred; proficiency with spreadsheets and billing systems.",
      benefits: "Competitive pay; benefits eligibility; paid training; growth in a mission-driven healthcare organization."
    },
    ADMIN_ASSISTANT: {
      title: "Administrative Assistant", department: "Administration", employmentType: "Full-Time",
      payRange: "$18–$25 per hour", applicationPath: "/applygeneral.html",
      summary: "Provide organized, professional administrative support to Sulandra Health’s clients, employees, and leadership team.",
      description: "Manage calls and correspondence, coordinate records and meetings, prepare documents, assist with data entry and supply tracking, support visitors, and protect confidential information while keeping office workflows moving.",
      requirements: "Administrative or customer-service experience; strong written and verbal communication; proficiency with common office software; excellent organization, discretion, and follow-through.",
      benefits: "Competitive pay; benefits eligibility; paid training; collaborative office environment."
    },
    COO: {
      title: "Chief Operating Officer", department: "Executive Leadership", employmentType: "Full-Time",
      payRange: "$95,000–$135,000 annually", applicationPath: "/applygeneral.html",
      summary: "Provide strategic and operational leadership across Sulandra Health’s home-health, waiver, transportation, and workforce operations.",
      description: "Translate organizational strategy into accountable operating plans; lead quality, compliance, workforce, financial, and service-delivery performance; develop leaders; strengthen systems and partnerships; and ensure sustainable, person-centered growth.",
      requirements: "Bachelor’s degree required; advanced degree preferred; senior healthcare or human-services operations leadership; demonstrated regulatory, financial, workforce, and change-management expertise.",
      benefits: "Executive compensation; comprehensive benefits; strategic leadership scope; mission-driven growth opportunity."
    },
    CEO: {
      title: "Chief Executive Officer", department: "Executive Leadership", employmentType: "Full-Time",
      payRange: "$130,000–$190,000 annually", applicationPath: "/applygeneral.html",
      summary: "Lead Sulandra Health’s mission, strategy, growth, governance, and long-term organizational performance.",
      description: "Set strategic direction, build an accountable executive team, ensure clinical and regulatory excellence, steward financial performance, develop community and payer partnerships, strengthen culture, and report transparently to ownership or the governing body.",
      requirements: "Bachelor’s degree required; advanced degree preferred; substantial executive leadership in healthcare, home and community-based services, or human services; demonstrated growth, compliance, financial, and organizational leadership.",
      benefits: "Executive compensation; comprehensive benefits; mission-driven leadership; opportunity to shape sustainable regional growth."
    }
  };

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
    if (job.includes("driver") || job.includes("transportation") || job.includes("nemt")) return "DRIVER";
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
      onDeleted: () => $("closeModalBtn").click(),
      onInterviewRequested: ({ applicationId: id, note }) => openInterviewScheduler(id, note)
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

  function normalizedOpeningStatus(opening) {
    return String(opening?.status || "DRAFT").toUpperCase();
  }

  function setSelectIfAvailable(id, value) {
    const select = $(id);
    const match = [...select.options].some((option) => option.value === value);
    select.value = match ? value : "";
  }

  function setOpeningLocation(value) {
    const location = String(value || "Dayton, OH");
    const select = $("openingLocation");
    const match = [...select.options].some((option) => option.value === location);
    select.value = match ? location : "Other Ohio location";
    $("openingLocationCustom").value = match ? "" : location;
    $("openingLocationCustomWrap").hidden = select.value !== "Other Ohio location";
  }

  function selectedOpeningLocation() {
    return $("openingLocation").value === "Other Ohio location"
      ? $("openingLocationCustom").value.trim()
      : $("openingLocation").value.trim();
  }

  function filterOpeningLocations(query) {
    const search = String(query || "").trim().toLowerCase();
    [...$("openingLocation").options].forEach((option) => {
      option.hidden = Boolean(search)
        && option.value !== "Other Ohio location"
        && !option.textContent.toLowerCase().includes(search);
    });
  }

  function populateJobPresetOptions() {
    const select = $("openingPreset");
    select.querySelectorAll("[data-existing-opening]").forEach((option) => option.remove());
    const presetTitles = new Set(Object.values(JOB_PRESETS).map((preset) => preset.title.toLowerCase()));
    const uniqueTitles = new Set();
    jobOpenings
      .filter((opening) => opening?.id && opening?.title)
      .sort((left, right) => String(left.title).localeCompare(String(right.title)))
      .forEach((opening) => {
        const normalizedTitle = String(opening.title).trim().toLowerCase();
        if (!normalizedTitle || presetTitles.has(normalizedTitle) || uniqueTitles.has(normalizedTitle)) return;
        uniqueTitles.add(normalizedTitle);
        const option = document.createElement("option");
        option.value = `EXISTING:${opening.id}`;
        option.textContent = `${opening.title} (existing job template)`;
        option.dataset.existingOpening = "true";
        select.appendChild(option);
      });
  }

  function openingPayload() {
    return {
      title: $("openingTitle").value.trim(),
      slug: $("openingSlug").value.trim(),
      department: $("openingDepartment").value.trim() || undefined,
      employmentType: $("openingType").value.trim() || undefined,
      locationText: selectedOpeningLocation() || undefined,
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
    $("openingPreset").value = "";
    $("openingDepartmentPreset").value = "";
    $("openingPathPreset").value = "";
    setOpeningLocation("Dayton, OH");
    $("openingLocationSearch").value = "";
    filterOpeningLocations("");
    $("openingType").value = "Full-Time";
    $("openingFormTitle").textContent = "Create Job Opening";
    $("cancelOpeningEdit").hidden = true;
  }

  function applyJobPreset(key) {
    const existingId = String(key || "").startsWith("EXISTING:") ? String(key).slice(9) : "";
    const existing = existingId ? jobOpenings.find((opening) => opening.id === existingId) : null;
    const preset = existing || JOB_PRESETS[key];
    if (!preset || $("openingId").value) return;
    Object.entries({
      openingTitle: preset.title,
      openingSlug: slugify(preset.title),
      openingDepartment: preset.department,
      openingType: preset.employmentType,
      openingPay: preset.payRange,
      openingPath: preset.applicationPath,
      openingSummary: preset.summary,
      openingDescription: preset.description,
      openingRequirements: preset.requirements,
      openingBenefits: preset.benefits
    }).forEach(([id, value]) => { $(id).value = value; });
    setSelectIfAvailable("openingDepartmentPreset", preset.department || "");
    setSelectIfAvailable("openingPathPreset", preset.applicationPath || "");
    setOpeningLocation(preset.locationText || "Dayton, OH");
    $("openingStatus").value = existing && ["DRAFT", "PUBLISHED"].includes(normalizedOpeningStatus(existing))
      ? normalizedOpeningStatus(existing)
      : "DRAFT";
  }

  function editOpening(id) {
    const opening = jobOpenings.find((item) => item.id === id);
    if (!opening) return;
    $("openingId").value = opening.id;
    $("openingPreset").value = "";
    $("openingTitle").value = opening.title || "";
    $("openingSlug").value = opening.slug || "";
    $("openingDepartment").value = opening.department || "";
    setSelectIfAvailable("openingDepartmentPreset", opening.department || "");
    const employmentType = String(opening.employmentType || "");
    $("openingType").value = /contract/i.test(employmentType)
      ? "Contract"
      : /\bprn\b/i.test(employmentType)
        ? "PRN"
        : /part/i.test(employmentType) && !/full/i.test(employmentType)
          ? "Part-Time"
          : "Full-Time";
    setOpeningLocation(opening.locationText || "Dayton, OH");
    $("openingPay").value = opening.payRange || "";
    $("openingPath").value = opening.applicationPath || "";
    setSelectIfAvailable("openingPathPreset", opening.applicationPath || "");
    $("openingSummary").value = opening.summary || "";
    $("openingDescription").value = opening.description || "";
    $("openingRequirements").value = opening.requirements || "";
    $("openingBenefits").value = opening.benefits || "";
    $("openingStatus").value = normalizedOpeningStatus(opening);
    $("openingFormTitle").textContent = "Edit Job Opening";
    $("cancelOpeningEdit").hidden = false;
    $("jobOpeningForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderJobOpenings() {
    const target = $("jobOpeningList");
    if (!target) return;
    const activeOpenings = jobOpenings.filter((opening) => ["DRAFT", "PUBLISHED"].includes(normalizedOpeningStatus(opening)));
    if (!activeOpenings.length) {
      target.innerHTML = '<div class="future-card"><h3>No job openings yet</h3><p class="sub">Create the first opening using the form.</p></div>';
    } else {
      target.innerHTML = activeOpenings.map((opening) => openingCard(opening, false)).join("");
    }
    const archivedTarget = $("archivedJobOpeningList");
    const archived = jobOpenings.filter((opening) => ["CLOSED", "ARCHIVED"].includes(normalizedOpeningStatus(opening)));
    if (archivedTarget) {
      archivedTarget.innerHTML = archived.length
        ? archived.map((opening) => openingCard(opening, true)).join("")
        : '<div class="future-card"><h3>No archived jobs</h3><p class="sub">Archived job listings will appear here.</p></div>';
    }
  }

  function openingCard(opening, archived) {
    const status = normalizedOpeningStatus(opening);
    return `<article class="opening-card">
      <div class="opening-card-head"><div><h3>${escapeHtml(opening.title)}</h3><div class="muted">${escapeHtml(opening.department || "General")} · ${escapeHtml(opening.locationText || "Location not specified")}</div></div><span class="status-pill ${escapeHtml(status)}">${escapeHtml(title(status))}</span></div>
      <p class="sub" style="margin-top:9px;">${escapeHtml(opening.summary || "")}</p>
      <div class="muted" style="font-size:12px;">${escapeHtml(String(opening.applicantCount || 0))} applicant(s) · /${escapeHtml(opening.slug)}</div>
      <div class="opening-actions">${archived
        ? `<button class="btn btn-primary" data-opening-status="${escapeHtml(opening.id)}" data-status="PUBLISHED">Restore to Published / Live</button>`
        : `<button class="btn btn-primary" data-edit-opening="${escapeHtml(opening.id)}">Edit</button>${status !== "PUBLISHED" ? `<button class="btn" data-opening-status="${escapeHtml(opening.id)}" data-status="PUBLISHED">Publish</button>` : `<button class="btn" data-opening-status="${escapeHtml(opening.id)}" data-status="CLOSED">Close</button>`}<button class="btn" data-opening-status="${escapeHtml(opening.id)}" data-status="ARCHIVED">Archive</button>`}</div>
    </article>`;
  }

  async function loadJobOpenings() {
    try {
      const payload = await apiRequest("/api/admin/job-openings");
      jobOpenings = Array.isArray(payload.data) ? payload.data : [];
      populateJobPresetOptions();
      renderJobOpenings();
    } catch (error) {
      $("jobOpeningList").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
      if ($("archivedJobOpeningList")) $("archivedJobOpeningList").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
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
    const nextStatus = String(status || "").toUpperCase();
    if (nextStatus === "ARCHIVED" && !window.confirm(
      "Archive this job opening? It will be removed from Active Job Openings and moved to Onboarding → Archived → Jobs Archive."
    )) return;
    try {
      await apiRequest(`/api/admin/job-openings/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      jobOpenings = jobOpenings.map((opening) => opening.id === id
        ? { ...opening, status: nextStatus }
        : opening);
      populateJobPresetOptions();
      renderJobOpenings();
      if (nextStatus === "ARCHIVED" || nextStatus === "CLOSED") {
        activateOnboardingPanel("archived");
      } else if (nextStatus === "PUBLISHED") {
        activateOnboardingPanel("openings");
      }
      if ($("openingId").value === id && ["CLOSED", "ARCHIVED"].includes(nextStatus)) resetOpeningForm();
      toast(
        "Job opening updated",
        nextStatus === "ARCHIVED"
          ? "The opening is now in Onboarding → Archived → Jobs Archive."
          : `Status changed to ${title(nextStatus)}.`
      );
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

  function addInterviewSlot(value = "") {
    const row = document.createElement("div");
    row.className = "slot-row";
    row.innerHTML = `<input type="datetime-local" data-interview-start required value="${escapeHtml(value)}"><button class="btn btn-danger" type="button" data-remove-slot>Remove</button>`;
    row.querySelector("[data-remove-slot]").addEventListener("click", () => {
      row.remove();
      if (!$("interviewSlotList").children.length) addInterviewSlot();
    });
    $("interviewSlotList").appendChild(row);
  }

  function defaultInterviewTime() {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setMinutes(date.getMinutes() < 30 ? 30 : 0, 0, 0);
    if (date.getMinutes() === 0) date.setHours(date.getHours() + 1);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function openInterviewScheduler(applicationId, note = "") {
    const application = applications.find((item) => item.id === applicationId);
    interviewApplicationId = applicationId;
    pendingInterviewNote = note;
    $("interviewApplicantName").textContent = application ? applicationName(application) : "Applicant";
    $("interviewSlotList").replaceChildren();
    addInterviewSlot(defaultInterviewTime());
    $("interviewModal").style.display = "block";
  }

  function closeInterviewScheduler() {
    $("interviewModal").style.display = "none";
    interviewApplicationId = "";
    pendingInterviewNote = "";
    $("interviewSlotList").replaceChildren();
  }

  async function saveInterviewSlots() {
    const startsAt = [...document.querySelectorAll("[data-interview-start]")]
      .map((input) => new Date(input.value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .map((date) => date.toISOString());
    if (!startsAt.length) {
      toast("Interview times required", "Add at least one valid future date and time.");
      return;
    }
    const button = $("saveInterviewSlots");
    button.disabled = true;
    try {
      await apiRequest(`/api/admin/applications/${encodeURIComponent(interviewApplicationId)}/interview-slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt, note: pendingInterviewNote })
      });
      closeInterviewScheduler();
      $("closeModalBtn").click();
      toast("Interview invitation sent", "The applicant can now choose one of the available 30-minute slots.");
      await loadApplications();
    } catch (error) {
      toast("Interview not scheduled", error.message);
    } finally {
      button.disabled = false;
    }
  }

  function renderCompanyPreview() {
    const address = [
      $("companyAddress1").value.trim(),
      $("companyAddress2").value.trim(),
      $("companyCity").value.trim(),
      [$("companyState").value.trim(), $("companyPostalCode").value.trim()].filter(Boolean).join(" ")
    ].filter(Boolean).join(", ");
    $("companyPreviewName").textContent = $("companyName").value.trim() || "Sulandra Health";
    $("companyPreviewAddress").textContent = address || "Company address";
    const signature = document.querySelector(".hr-signature-preview strong");
    if (signature) signature.textContent = $("companyEmailDisplayName").value.trim() || "Human Resources";
  }

  async function loadCompanySettings() {
    try {
      const payload = await apiRequest("/api/admin/company-settings");
      const details = payload.data || {};
      $("companyName").value = details.companyName || "Sulandra Health";
      $("companyAddress1").value = details.addressLine1 || "";
      $("companyAddress2").value = details.addressLine2 || "";
      $("companyCity").value = details.city || "";
      $("companyState").value = details.state || "";
      $("companyPostalCode").value = details.postalCode || "";
      $("companyEmailDisplayName").value = details.emailDisplayName || "Human Resources";
      renderCompanyPreview();
    } catch (error) {
      toast("Company details unavailable", error.message);
    }
  }

  async function saveCompanySettings(event) {
    event.preventDefault();
    try {
      await apiRequest("/api/admin/company-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: $("companyName").value.trim(),
          addressLine1: $("companyAddress1").value.trim(),
          addressLine2: $("companyAddress2").value.trim(),
          city: $("companyCity").value.trim(),
          state: $("companyState").value.trim(),
          postalCode: $("companyPostalCode").value.trim(),
          emailDisplayName: $("companyEmailDisplayName").value.trim()
        })
      });
      renderCompanyPreview();
      toast("Company details saved", "Email templates and interview views will use the updated information.");
    } catch (error) {
      toast("Company details not saved", error.message);
    }
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
    $("refreshBtn").addEventListener("click", () => Promise.all([loadApplications(), loadJobOpenings(), loadCompanySettings()]));
    $("exportBtn").addEventListener("click", exportApplications);
    $("closeModalBtn").addEventListener("click", () => {
      $("detailsModal").style.display = "none";
      $("modalBody").replaceChildren();
    });
    $("detailsModal").addEventListener("click", (event) => {
      if (event.target === $("detailsModal")) $("closeModalBtn").click();
    });
    $("closeInterviewModal").addEventListener("click", closeInterviewScheduler);
    $("interviewModal").addEventListener("click", (event) => {
      if (event.target === $("interviewModal")) closeInterviewScheduler();
    });
    $("addInterviewSlot").addEventListener("click", () => addInterviewSlot());
    $("saveInterviewSlots").addEventListener("click", saveInterviewSlots);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("interviewModal").style.display === "block") {
        closeInterviewScheduler();
      } else if (event.key === "Escape" && $("detailsModal").style.display === "block") {
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
    $("openingPreset").addEventListener("change", () => applyJobPreset($("openingPreset").value));
    $("openingDepartmentPreset").addEventListener("change", () => {
      if ($("openingDepartmentPreset").value) {
        $("openingDepartment").value = $("openingDepartmentPreset").value;
      }
    });
    $("openingPathPreset").addEventListener("change", () => {
      if ($("openingPathPreset").value) {
        $("openingPath").value = $("openingPathPreset").value;
      }
    });
    $("openingLocationSearch").addEventListener("input", () => {
      filterOpeningLocations($("openingLocationSearch").value);
    });
    $("openingLocation").addEventListener("change", () => {
      $("openingLocationCustomWrap").hidden = $("openingLocation").value !== "Other Ohio location";
      if (!$("openingLocationCustomWrap").hidden) $("openingLocationCustom").focus();
    });
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
    $("archivedJobOpeningList").addEventListener("click", (event) => {
      const status = event.target.closest("[data-opening-status]");
      if (status) changeOpeningStatus(status.dataset.openingStatus, status.dataset.status);
    });
    $("companySettingsForm").addEventListener("submit", saveCompanySettings);
    ["companyName", "companyAddress1", "companyAddress2", "companyCity", "companyState", "companyPostalCode", "companyEmailDisplayName"]
      .forEach((id) => $(id).addEventListener("input", renderCompanyPreview));
    ["search", "statusFilter", "jobFilter"].forEach((id) => {
      $(id).addEventListener("input", renderApplications);
      $(id).addEventListener("change", renderApplications);
    });

    initializeReadOnlyModules();
    try {
      if (await authenticate()) await Promise.all([loadApplications(), loadJobOpenings(), loadCompanySettings()]);
    } catch (error) {
      $("livePill").textContent = "Railway: sign-in required";
      toast("Sign-in required", error.message);
    }
  }

  initialize();
})();
