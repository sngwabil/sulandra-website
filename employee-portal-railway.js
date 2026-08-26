(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production-5fc4.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const ENTITY_KEY = "sulandra:selected-legal-entity-id";
  const UAT_CONTRACT = "20260810-role-uat-1";
  const $ = (id) => document.getElementById(id);

  // Privileged roles are employees too. They retain their management permissions
  // but are never forced out of the Employee Portal.
  const executiveAdminRoles = new Set(["ADMINISTRATOR", "CEO", "DOO"]);
  const clinicalRoles = new Set([
    "DSP", "LPN", "RN", "DELEGATING_NURSE", "HOUSE_MANAGER",
    "PROGRAM_MANAGER", "AUDITOR", "CEO", "DOO"
  ]);
  const shiftRoles = new Set([
    "DSP", "LPN", "RN", "DELEGATING_NURSE", "HOUSE_MANAGER", "PROGRAM_MANAGER"
  ]);
  const companyDocumentRoles = new Set([
    "ADMINISTRATOR", "HR_MANAGER", "PROGRAM_MANAGER", "AUDITOR", "CEO", "DOO"
  ]);
  const sclsOperationsRoles = new Set([
    "HOUSE_MANAGER", "PROGRAM_MANAGER", "DELEGATING_NURSE", "RN", "CEO", "DOO"
  ]);
  const homeHealthVisitRoles = new Set([
    "DSP", "LPN", "RN", "DELEGATING_NURSE", "PROGRAM_MANAGER", "SCHEDULER", "CEO", "DOO"
  ]);
  const homeHealthManagementRoles = new Set([
    "RN", "DELEGATING_NURSE", "PROGRAM_MANAGER", "SCHEDULER", "CEO", "DOO"
  ]);
  const nmtDispatchRoles = new Set(["SCHEDULER", "PROGRAM_MANAGER", "CEO", "DOO"]);
  const employee360Roles = new Set(["ADMINISTRATOR", "HR_MANAGER", "CEO", "DOO"]);
  const schedulingRoles = new Set(["SCHEDULER", "PROGRAM_MANAGER"]);

  let workRefreshTimer = null;
  let workRefreshInFlight = false;
  let currentSession = null;
  const directoryState = { all: [], leaders: [], mode: "all", department: "", company: "" };

  function readStoredSession() {
    try {
      return JSON.parse(
        window.sessionStorage.getItem(SESSION_KEY)
        || window.localStorage.getItem(SESSION_KEY)
        || "null"
      );
    } catch {
      return null;
    }
  }

  function readToken() {
    return window.sessionStorage.getItem(TOKEN_KEY)
      || window.localStorage.getItem(TOKEN_KEY)
      || window.localStorage.getItem("sulandra_token")
      || window.localStorage.getItem("token")
      || window.localStorage.getItem("accessToken")
      || "";
  }

  function signOut() {
    if (workRefreshTimer) window.clearInterval(workRefreshTimer);
    for (const key of [TOKEN_KEY, SESSION_KEY, "sulandra_token", "token", "accessToken"]) {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }
    window.location.replace("employee-login.html");
  }

  function roleLabel(value) {
    return String(value || "Employee").toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function initials(value) {
    const parts = String(value || "Employee").trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map((part) => part[0]).join("") || "E").toUpperCase();
  }

  function setVisible(id, visible) {
    const node = $(id);
    if (!node) return;
    node.hidden = !visible;
    node.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setStatusBadge(text) {
    const element = $("empStatus");
    if (element) element.textContent = text || "Active";
  }

  async function entityContext() {
    if (window.SulandraEntityContext?.ready) {
      await window.SulandraEntityContext.ready;
      const snapshot = window.SulandraEntityContext.get?.();
      if (snapshot?.entities?.length) return snapshot;
    }
    const response = await fetch(`${API_BASE}/api/entity-context`, {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${readToken()}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Company context failed (${response.status})`);
    return payload.data || payload || {};
  }

  function selectedEntity(context) {
    if (context?.selectedEntity) return context.selectedEntity;
    const entities = Array.isArray(context?.entities) ? context.entities : [];
    const savedId = window.sessionStorage.getItem(ENTITY_KEY)
      || window.localStorage.getItem(ENTITY_KEY)
      || context?.selectedEntityId
      || context?.primaryEntityId
      || "";
    return entities.find((entity) => String(entity.id) === String(savedId))
      || entities.find((entity) => String(entity.id) === String(context?.primaryEntityId || ""))
      || entities[0]
      || null;
  }

  async function apiForEntity(path, entityId) {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${readToken()}`,
        ...(entityId ? { "x-legal-entity-id": entityId } : {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || payload.message || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload.data ?? payload;
  }

  async function optionalEntityData(path, entityId) {
    try {
      return await apiForEntity(path, entityId);
    } catch (error) {
      if ([403, 404, 409].includes(Number(error?.status))) return null;
      throw error;
    }
  }

  function rowsFrom(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.trips)) return value.trips;
    return [];
  }

  function activeCount(rows, closedStatuses) {
    return rows.filter((row) => !closedStatuses.has(String(row?.status || "").toUpperCase())).length;
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = String(value);
  }

  function setCount(id, value, urgent) {
    const node = $(id);
    if (!node) return;
    const n = Number(value || 0);
    node.textContent = n > 99 ? "99+" : String(n);
    node.classList.toggle("has-items", n > 0);
    node.classList.toggle("urgent", urgent === true && n > 0);
  }

  function renderWorkCenterStatus({ companyName, workCount, notifications, urgent, breakdown }) {
    setText("employeeWorkCompany", companyName || "Selected company");
    setText("employeeMyWorkCountText", workCount);
    setText("employeeNotificationCountText", notifications);
    setText("employeeUrgentCountText", urgent);
    setCount("employeeMyWorkQuickCount", workCount, false);
    setCount("employeeNotificationQuickCount", notifications, urgent > 0);
    setCount("employeeMyWorkNavCount", workCount, false);
    setCount("employeeNotificationNavCount", notifications, urgent > 0);
    setCount("employeeNotificationHeaderCount", notifications, urgent > 0);
    const detail = $("employeeWorkBreakdown");
    if (detail) {
      detail.textContent = [
        `${breakdown.inbasket} In Basket`,
        `${breakdown.tasks} SCLS task${breakdown.tasks === 1 ? "" : "s"}`,
        `${breakdown.visits} Home Health visit${breakdown.visits === 1 ? "" : "s"}`,
        `${breakdown.trips} NMT trip${breakdown.trips === 1 ? "" : "s"}`,
        `${breakdown.corrections} time correction${breakdown.corrections === 1 ? "" : "s"}`,
      ].join(" · ");
    }
    document.body.dataset.employeeOpenWork = String(workCount);
    document.body.dataset.employeeOpenNotifications = String(notifications);
  }

  async function refreshWorkCenter() {
    if (workRefreshInFlight || !readToken()) return;
    workRefreshInFlight = true;
    try {
      const context = await entityContext();
      const entity = selectedEntity(context);
      if (!entity?.id) throw new Error("No Sulandra company is available to this employee account.");
      const entityId = String(entity.id);
      const [summary, inbasketRaw, tasksRaw, visitsRaw, tripsRaw, correctionsRaw] = await Promise.all([
        optionalEntityData("/api/work/notifications/summary", entityId),
        optionalEntityData("/api/spire/inbasket", entityId),
        optionalEntityData("/api/scls/tasks?mine=true", entityId),
        optionalEntityData("/api/home-health/my-visits", entityId),
        optionalEntityData("/api/nmt/driver/my-trips", entityId),
        optionalEntityData("/api/workforce/time/corrections", entityId),
      ]);
      const inbasket = rowsFrom(inbasketRaw).length;
      const tasks = activeCount(rowsFrom(tasksRaw), new Set(["COMPLETED", "CANCELLED"]));
      const visits = activeCount(rowsFrom(visitsRaw), new Set(["COMPLETED", "MISSED", "CANCELLED"]));
      const trips = activeCount(rowsFrom(tripsRaw), new Set(["COMPLETED", "CANCELLED", "NO_SHOW"]));
      const corrections = rowsFrom(correctionsRaw).filter((row) => String(row?.status || "").toUpperCase() === "PENDING").length;
      const workCount = inbasket + tasks + visits + trips + corrections;
      const notifications = Number(summary?.open || 0);
      const urgent = Number(summary?.urgent || 0);
      renderWorkCenterStatus({
        companyName: entity.displayName || entity.legalName || entity.code || "Selected company",
        workCount,
        notifications,
        urgent,
        breakdown: { inbasket, tasks, visits, trips, corrections },
      });
      const status = $("employeeWorkStatus");
      if (status) {
        status.firstChild.textContent = urgent > 0
          ? `${urgent} urgent/critical notification${urgent === 1 ? "" : "s"} need attention.`
          : workCount || notifications
            ? "Your live work queues are up to date."
            : "No open assigned work is currently waiting for you.";
        status.classList.toggle("urgent", urgent > 0);
      }
    } catch (error) {
      console.warn("Unable to refresh employee work center", error);
      const status = $("employeeWorkStatus");
      if (status) {
        status.firstChild.textContent = "Live work counts are temporarily unavailable. Open My Work or Notifications to refresh the source queue.";
        status.classList.remove("urgent");
      }
    } finally {
      workRefreshInFlight = false;
    }
  }

  function installPrimaryWorkLaunchers() {
    // The universal portal publishes these first-class controls directly in HTML.
    // Keep this function as the single idempotent contract used by Work Center verification.
    setCount("employeeMyWorkQuickCount", 0, false);
    setCount("employeeNotificationQuickCount", 0, false);
  }

  function directoryRowsForMode() {
    const mode = directoryState.mode;
    if (mode === "leadership") return directoryState.leaders;
    if (mode === "department") {
      if (!directoryState.department) return [];
      return directoryState.all.filter((row) => String(row.department || "") === directoryState.department);
    }
    return directoryState.all;
  }

  function renderDirectory() {
    const grid = $("employeeDirectoryGrid");
    const status = $("employeeDirectoryStatus");
    if (!grid || !status) return;
    const query = String($("employeeDirectorySearch")?.value || "").trim().toLowerCase();
    let rows = directoryRowsForMode();
    if (query) {
      rows = rows.filter((row) => [row.displayName, row.workEmail, row.jobTitle, row.department, row.role]
        .some((value) => String(value || "").toLowerCase().includes(query)));
    }
    const modeLabel = directoryState.mode === "leadership"
      ? "leadership"
      : directoryState.mode === "department"
        ? directoryState.department || "your department"
        : "employee";
    status.textContent = `${rows.length} ${modeLabel} result${rows.length === 1 ? "" : "s"}${directoryState.company ? ` · ${directoryState.company}` : ""}`;
    if (!rows.length) {
      grid.innerHTML = '<div class="empty-directory"><strong>No matching employees</strong><div>Try a different name, title, department or role.</div></div>';
      return;
    }
    grid.innerHTML = rows.map((row) => {
      const name = row.displayName || row.workEmail || "Employee";
      const title = row.jobTitle || roleLabel(row.role);
      const department = row.department || "Department not assigned";
      const email = row.workEmail || "";
      return `<article class="person-card"><div class="person-top"><div class="avatar" aria-hidden="true">${escapeHtml(initials(name))}</div><div class="person-main"><div class="person-name">${escapeHtml(name)}</div><div class="person-title">${escapeHtml(title)}</div></div></div><div class="person-meta"><span class="person-chip">${escapeHtml(department)}</span><span class="person-chip">${escapeHtml(roleLabel(row.role))}</span></div>${email ? `<a class="person-email" href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : ""}</article>`;
    }).join("");
  }

  function setDirectoryMode(mode) {
    directoryState.mode = mode;
    document.querySelectorAll("[data-directory-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.directoryMode === mode);
    });
    renderDirectory();
  }

  async function loadEmployeeDirectories() {
    try {
      const context = await entityContext();
      const entity = selectedEntity(context);
      if (!entity?.id) throw new Error("No selected company is available for the directory.");
      const entityId = String(entity.id);
      const [directoryRaw, leadershipRaw] = await Promise.all([
        apiForEntity("/api/employee/directory", entityId),
        apiForEntity("/api/employee/leadership", entityId),
      ]);
      directoryState.all = Array.isArray(directoryRaw?.employees) ? directoryRaw.employees : [];
      directoryState.leaders = Array.isArray(leadershipRaw?.leaders) ? leadershipRaw.leaders : [];
      directoryState.company = entity.displayName || entity.legalName || entity.code || "";
      const sessionEmail = String(currentSession?.email || "").trim().toLowerCase();
      const self = directoryState.all.find((row) => String(row.workEmail || "").trim().toLowerCase() === sessionEmail);
      directoryState.department = String(self?.department || "");
      setText("directoryEmployeeCount", directoryState.all.length);
      setText("directoryLeadershipCount", directoryState.leaders.length);
      setText("directoryDepartmentCount", directoryState.department
        ? directoryState.all.filter((row) => String(row.department || "") === directoryState.department).length
        : 0);
      const departmentButton = $("directoryTabDepartment");
      if (departmentButton) {
        departmentButton.disabled = !directoryState.department;
        departmentButton.title = directoryState.department ? `Show ${directoryState.department}` : "Your department is not assigned yet";
      }
      renderDirectory();
    } catch (error) {
      console.warn("Unable to load employee directory", error);
      setText("employeeDirectoryStatus", "Employee directory is temporarily unavailable.");
      const grid = $("employeeDirectoryGrid");
      if (grid) grid.innerHTML = '<div class="empty-directory"><strong>Directory unavailable</strong><div>Use the Full Employee Directory link or try again after refreshing.</div></div>';
    }
  }

  function wireDirectory() {
    $("employeeDirectorySearch")?.addEventListener("input", renderDirectory);
    document.querySelectorAll("[data-directory-mode]").forEach((button) => button.addEventListener("click", () => setDirectoryMode(button.dataset.directoryMode || "all")));
  }

  async function selectCompanyAndOpen(code, href, event) {
    event?.preventDefault?.();
    try {
      const context = await entityContext();
      const entities = Array.isArray(context.entities) ? context.entities : [];
      const target = entities.find((entity) => entity.code === code && entity.status === "ACTIVE");
      if (!target) throw new Error("The requested Sulandra company is not available in your company access yet.");
      window.sessionStorage.setItem(ENTITY_KEY, target.id);
      window.localStorage.setItem(ENTITY_KEY, target.id);
      window.location.href = href;
    } catch (error) {
      window.alert(error.message || "Unable to open the requested application.");
    }
  }

  function applyStaticRoleVisibility(session) {
    const role = String(session.role || "").toUpperCase();
    setVisible("employeeAdminReturn", executiveAdminRoles.has(role));
    setVisible("employeeStaticMyShift", shiftRoles.has(role));
    setVisible("employeeStaticSpire", clinicalRoles.has(role));
    setVisible("employeeStaticNmtDriver", role === "DRIVER");
    setVisible("employeeStaticCompanyDocuments", companyDocumentRoles.has(role));
    setVisible("employeeStaticEmployee360", employee360Roles.has(role));
    setVisible("employeeStaticScheduling", schedulingRoles.has(role));
    if (role === "DRIVER") {
      $("employeeStaticNmtDriver")?.addEventListener("click", (event) => selectCompanyAndOpen("NMT", "/nmt-driver.html", event));
    }
  }

  async function installCompanyScopedLaunchers(session) {
    try {
      const context = await entityContext();
      const selected = selectedEntity(context);
      if (!selected || selected.status !== "ACTIVE") return;
      const role = String(session.role || "").toUpperCase();
      setVisible("employeeStaticSclsOperations", selected.code === "SCLS" && sclsOperationsRoles.has(role));
      setVisible("employeeStaticHomeHealthVisits", selected.code === "HOME_HEALTH" && homeHealthVisitRoles.has(role));
      setVisible("employeeStaticHomeHealthOperations", selected.code === "HOME_HEALTH" && homeHealthManagementRoles.has(role));
      setVisible("employeeStaticNmtDispatch", selected.code === "NMT" && nmtDispatchRoles.has(role));
    } catch (error) {
      console.warn("Unable to install company-scoped employee launchers", error);
    }
  }

  function installApplicationLaunchers(session) {
    applyStaticRoleVisibility(session);
    installCompanyScopedLaunchers(session);
  }

  function startWorkCenterRefresh() {
    refreshWorkCenter();
    if (workRefreshTimer) window.clearInterval(workRefreshTimer);
    workRefreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshWorkCenter();
    }, 60000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshWorkCenter();
    });
  }

  function loadAuthenticatedIdentity() {
    const token = readToken();
    const session = readStoredSession();
    if (!token || !session) {
      signOut();
      return;
    }
    if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
      signOut();
      return;
    }
    currentSession = session;
    const role = String(session.role || "").toUpperCase();

    // Deliberately no ADMINISTRATOR/CEO/DOO redirect here. Employee Portal is a
    // universal employee workspace, not a lower-privilege substitute for Admin.
    setText("empName", session.displayName || session.fullName || session.name || session.email || session.username || "Employee");
    setText("empRole", roleLabel(role));
    setStatusBadge("Active");
    installPrimaryWorkLaunchers();
    installApplicationLaunchers(session);
    wireDirectory();
    loadEmployeeDirectories();
    startWorkCenterRefresh();
    document.body.dataset.authenticatedRole = role;
    document.body.dataset.roleUatReady = "true";
  }

  $("btnSignOut")?.addEventListener("click", (event) => {
    event.preventDefault();
    signOut();
  });

  window.addEventListener("sulandra:entity-context-changed", () => {
    refreshWorkCenter();
    loadEmployeeDirectories();
    if (currentSession) installCompanyScopedLaunchers(currentSession);
  });

  window.SulandraRoleUat = Object.freeze({
    contract: UAT_CONTRACT,
    clinicalRoles: [...clinicalRoles],
    shiftRoles: [...shiftRoles],
    companyDocumentRoles: [...companyDocumentRoles],
    nmtDispatchRoles: [...nmtDispatchRoles],
    executiveAdminRoles: [...executiveAdminRoles],
    employeePortalUniversalAccess: true,
  });

  loadAuthenticatedIdentity();
})();
