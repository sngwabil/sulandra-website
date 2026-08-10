(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production-5fc4.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const ENTITY_KEY = "sulandra:selected-legal-entity-id";
  const UAT_CONTRACT = "20260810-role-uat-1";
  const $ = (id) => document.getElementById(id);

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
  const nmtDispatchRoles = new Set([
    "SCHEDULER", "PROGRAM_MANAGER", "CEO", "DOO"
  ]);
  const enterpriseAnalyticsRoles = new Set([
    "PROGRAM_MANAGER", "AUDITOR", "HR_MANAGER", "RN", "DELEGATING_NURSE", "CEO", "DOO"
  ]);
  const securityAuditRoles = new Set([
    "PROGRAM_MANAGER", "AUDITOR", "HR_MANAGER", "CEO", "DOO"
  ]);
  const employee360Roles = new Set(["HR_MANAGER"]);
  const schedulingRoles = new Set(["SCHEDULER", "PROGRAM_MANAGER"]);

  let workRefreshTimer = null;
  let workRefreshInFlight = false;

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
      || "";
  }

  function signOut() {
    if (workRefreshTimer) window.clearInterval(workRefreshTimer);
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(SESSION_KEY);
    window.location.replace("employee-login.html");
  }

  function setStatusBadge(text) {
    const element = $("empStatus");
    if (!element) return;
    element.textContent = text || "Unknown";
    element.classList.remove("green", "orange", "blue");
    const status = String(text || "").toLowerCase();
    if (status === "active") element.classList.add("green");
    else if (status === "pending" || status === "inactive") element.classList.add("orange");
    else element.classList.add("blue");
  }

  function launcher(label, href, title, id) {
    const a = document.createElement("a");
    a.className = "qa";
    a.href = href;
    a.textContent = label;
    a.title = title;
    if (id) a.id = id;
    return a;
  }

  function addCountBadge(element, id, label) {
    if (!element || document.getElementById(id)) return null;
    const badge = document.createElement("span");
    badge.id = id;
    badge.className = "work-count-badge";
    badge.textContent = "—";
    badge.setAttribute("aria-label", label);
    element.appendChild(badge);
    return badge;
  }

  function setVisible(id, visible) {
    const node = $(id);
    if (!node) return;
    node.hidden = !visible;
    node.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  async function entityContext() {
    const authToken = readToken();
    const response = await fetch(`${API_BASE}/api/entity-context`, {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${authToken}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Company context failed (${response.status})`);
    return payload.data || payload || {};
  }

  function selectedEntity(context) {
    const entities = Array.isArray(context?.entities) ? context.entities : [];
    const savedId = window.sessionStorage.getItem(ENTITY_KEY)
      || window.localStorage.getItem(ENTITY_KEY)
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

    const notificationLink = $("employeeNotificationsHeader");
    if (notificationLink) {
      notificationLink.title = urgent > 0
        ? `${notifications} open notifications, including ${urgent} urgent or critical`
        : `${notifications} open work notifications`;
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
        status.textContent = urgent > 0
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
        status.textContent = "Live work counts are temporarily unavailable. Open My Work or Notifications to refresh the source queue.";
        status.classList.remove("urgent");
      }
    } finally {
      workRefreshInFlight = false;
    }
  }

  async function selectCompanyAndOpen(code, href, event) {
    event?.preventDefault?.();
    try {
      const context = await entityContext();
      const entities = Array.isArray(context.entities) ? context.entities : [];
      const target = entities.find((entity) => entity.code === code && entity.status === "ACTIVE");
      if (!target) throw new Error(`${code === "NMT" ? "Sulandra NMT Services" : "The requested Sulandra company"} is not available in your company access yet.`);
      window.sessionStorage.setItem(ENTITY_KEY, target.id);
      window.localStorage.setItem(ENTITY_KEY, target.id);
      window.location.href = href;
    } catch (error) {
      window.alert(error.message || "Unable to open the requested application.");
    }
  }

  function applyStaticRoleVisibility(session) {
    const role = String(session.role || "").toUpperCase();
    setVisible("employeeStaticMyShift", shiftRoles.has(role));
    setVisible("employeeStaticSpire", clinicalRoles.has(role));
    setVisible("employeeStaticNmtDriver", role === "DRIVER");
    setVisible("employeeStaticCompanyDocuments", companyDocumentRoles.has(role));
    if (role === "DRIVER") {
      $("employeeStaticNmtDriver")?.addEventListener("click", (event) => selectCompanyAndOpen("NMT", "/nmt-driver.html", event), { once: true });
    }
  }

  function installPrimaryWorkLaunchers() {
    const quick = document.querySelector(".page-hero .quick-actions");
    if (quick && !document.getElementById("employeeMyWorkLauncher")) {
      const myWork = launcher("My Work", "/my-work.html", "Open all assigned work across SPIRE, SCLS, Home Health, NMT, Workforce and Learning", "employeeMyWorkLauncher");
      myWork.classList.add("work-primary");
      addCountBadge(myWork, "employeeMyWorkQuickCount", "Open assigned work count");
      const notifications = launcher("Notifications", "/notifications.html", "Open operational work notifications, urgent items and source actions", "employeeNotificationsLauncher");
      notifications.classList.add("work-primary");
      addCountBadge(notifications, "employeeNotificationQuickCount", "Open work notification count");
      quick.prepend(notifications);
      quick.prepend(myWork);
    }

    const nav = document.querySelector(".nav-links");
    if (nav && !document.getElementById("employeeMyWorkNav")) {
      const dashboardLi = [...nav.children].find((li) => /Dashboard/i.test(li.textContent || ""));
      const myWorkLi = document.createElement("li");
      const myWorkA = document.createElement("a");
      myWorkA.id = "employeeMyWorkNav";
      myWorkA.href = "/my-work.html";
      myWorkA.textContent = "My Work";
      addCountBadge(myWorkA, "employeeMyWorkNavCount", "Open assigned work count");
      myWorkLi.appendChild(myWorkA);

      const notificationsLi = document.createElement("li");
      const notificationsA = document.createElement("a");
      notificationsA.id = "employeeNotificationsNav";
      notificationsA.href = "/notifications.html";
      notificationsA.textContent = "Notifications";
      addCountBadge(notificationsA, "employeeNotificationNavCount", "Open work notification count");
      notificationsLi.appendChild(notificationsA);

      if (dashboardLi) {
        dashboardLi.after(notificationsLi);
        dashboardLi.after(myWorkLi);
      } else {
        nav.prepend(notificationsLi);
        nav.prepend(myWorkLi);
      }
    }

    const headerTools = document.querySelector(".header-tools");
    if (headerTools && !document.getElementById("employeeNotificationsHeader")) {
      const a = document.createElement("a");
      a.id = "employeeNotificationsHeader";
      a.className = "employee-notification-header";
      a.href = "/notifications.html";
      a.innerHTML = '<span aria-hidden="true">Notifications</span>';
      addCountBadge(a, "employeeNotificationHeaderCount", "Open work notification count");
      const signOut = document.getElementById("btnSignOut");
      if (signOut) headerTools.insertBefore(a, signOut);
      else headerTools.appendChild(a);
    }
  }

  function appendNavLink(id, label, href) {
    const nav = document.querySelector(".nav-links");
    if (!nav || document.getElementById(id)) return;
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.id = id;
    a.href = href;
    a.textContent = label;
    li.appendChild(a);
    nav.appendChild(li);
  }

  function installApplicationLaunchers(session) {
    const quick = document.querySelector(".page-hero .quick-actions");
    if (!quick || document.getElementById("employeeSpireTrainingLauncher")) return;

    installPrimaryWorkLaunchers();
    const role = String(session.role || "").toUpperCase();

    quick.appendChild(launcher("Workforce", "/workforce.html", "Clock in or out, complete weekly timesheets, and submit employee documents", "employeeWorkforceLauncher"));
    quick.appendChild(launcher("Learning Center", "/education-portal.html", "Open assigned education, annual renewals, course catalog and certificates", "employeeLearningLauncher"));
    quick.appendChild(launcher("SPIRE Training", "/spire-training.html", "Practice in isolated simulated charts", "employeeSpireTrainingLauncher"));

    if (shiftRoles.has(role)) {
      quick.appendChild(launcher("My Shift", "/spire-shift.html", "Assigned clients, due medications, vitals, weight, temperature and bedside tasks", "employeeMyShiftLauncher"));
    }
    if (clinicalRoles.has(role)) {
      quick.appendChild(launcher("Open SPIRE", "/spire.html", "Open authorized live client/patient charts", "employeeLiveSpireLauncher"));
    }
    if (role === "DRIVER") {
      const trips = launcher("My NMT Trips", "/nmt-driver.html", "Open assigned NMT transportation trips", "employeeNmtTripsLauncher");
      trips.addEventListener("click", (event) => selectCompanyAndOpen("NMT", "/nmt-driver.html", event));
      quick.appendChild(trips);
    }
    if (employee360Roles.has(role)) {
      quick.appendChild(launcher("Employee 360", "/employee360.html", "Open HR employee records, compliance and workforce management", "employeeHr360Launcher"));
    }
    if (schedulingRoles.has(role)) {
      quick.appendChild(launcher("Scheduling", "/scheduling.html", "Open workforce scheduling and staffing operations", "employeeSchedulingLauncher"));
    }
    if (enterpriseAnalyticsRoles.has(role)) {
      quick.appendChild(launcher("Enterprise Analytics", "/enterprise-analytics.html", "Open company-scoped operational analytics", "employeeAnalyticsLauncher"));
    }
    if (securityAuditRoles.has(role)) {
      quick.appendChild(launcher("Security & Audit", "/security-audit.html", "Open company-scoped audit and access-review evidence", "employeeSecurityAuditLauncher"));
    }
    if (companyDocumentRoles.has(role)) {
      quick.appendChild(launcher("Company Documents", "/company-documents.html", "Open authorized official company records", "employeeCompanyDocumentsLauncher"));
    }

    appendNavLink("employeeWorkforceNav", "Workforce", "/workforce.html");
    appendNavLink("employeeLearningNav", "Learning", "/education-portal.html");
    if (shiftRoles.has(role)) appendNavLink("employeeSpireNav", "My Shift", "/spire-shift.html");
    else if (clinicalRoles.has(role)) appendNavLink("employeeSpireNav", "SPIRE", "/spire.html");
    else appendNavLink("employeeSpireNav", "SPIRE Training", "/spire-training.html");
  }

  async function installCompanyScopedLaunchers(session) {
    try {
      const context = await entityContext();
      const entities = Array.isArray(context.entities) ? context.entities : [];
      const savedId = window.sessionStorage.getItem(ENTITY_KEY) || window.localStorage.getItem(ENTITY_KEY) || context.primaryEntityId || "";
      const selected = entities.find((entity) => String(entity.id) === String(savedId)) || entities.find((entity) => String(entity.id) === String(context.primaryEntityId)) || entities[0];
      if (!selected || selected.status !== "ACTIVE") return;
      const quick = document.querySelector(".page-hero .quick-actions");
      if (!quick) return;
      const role = String(session.role || "").toUpperCase();

      if (selected.code === "SCLS" && sclsOperationsRoles.has(role)) {
        setVisible("employeeStaticSclsOperations", true);
        if (!document.getElementById("employeeSclsOperationsLauncher")) {
          quick.appendChild(launcher("SCLS Home Operations", "/scls-residential.html", "Open residential homes, residents, assignments, handoffs and house operations", "employeeSclsOperationsLauncher"));
        }
        appendNavLink("employeeSclsOperationsNav", "SCLS Operations", "/scls-residential.html");
      }

      if (selected.code === "HOME_HEALTH" && homeHealthVisitRoles.has(role)) {
        if (!document.getElementById("employeeHomeHealthVisitsLauncher")) {
          quick.appendChild(launcher("My Home Health Visits", "/home-health-visits.html", "Open assigned skilled nursing, therapy, respiratory, aide or social-work visits", "employeeHomeHealthVisitsLauncher"));
        }
        if (homeHealthManagementRoles.has(role) && !document.getElementById("employeeHomeHealthOperationsLauncher")) {
          quick.appendChild(launcher("Home Health Operations", "/home-health.html", "Manage Home Health referrals, episodes, Plan of Care, disciplines, staff and scheduling", "employeeHomeHealthOperationsLauncher"));
        }
        appendNavLink("employeeHomeHealthNav", "Home Health", "/home-health-visits.html");
      }

      if (selected.code === "NMT" && nmtDispatchRoles.has(role)) {
        if (!document.getElementById("employeeNmtDispatchLauncher")) {
          quick.appendChild(launcher("NMT Dispatch", "/nmt-dispatch.html", "Dispatch trips, assign drivers and vehicles, and manage transportation operations", "employeeNmtDispatchLauncher"));
        }
        appendNavLink("employeeNmtDispatchNav", "NMT Dispatch", "/nmt-dispatch.html");
      }
    } catch (error) {
      console.warn("Unable to install company-scoped employee launchers", error);
    }
  }

  function wireLegacyPortalButtons() {
    const route = (id, href) => { const button = $(id); if (button) button.onclick = () => { window.location.href = href; }; };
    route("btnLaunchTraining", "/education-portal.html");
    route("btnViewCertificates", "/education-portal.html#history");
    route("btnSubmitTimesheet", "/workforce.html#timesheets");
    route("btnSaveDraftTimesheet", "/workforce.html#timesheets");
    route("btnSubmitDocs", "/workforce.html#documents");
    route("btnViewDocStatus", "/workforce.html#documents");
    route("btnClockIn", "/workforce.html#time");
    route("btnClockOut", "/workforce.html#time");
    route("btnBreak", "/workforce.html#time");
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
    window.addEventListener("sulandra:entity-context-changed", () => refreshWorkCenter());
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
    const role = String(session.role || "").toUpperCase();
    if (executiveAdminRoles.has(role)) {
      window.location.replace("admin.html");
      return;
    }
    $("empName").textContent = session.displayName || session.fullName || session.name || session.email || session.username || "Employee";
    $("empRole").textContent = role.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
    setStatusBadge("Active");
    applyStaticRoleVisibility(session);
    installPrimaryWorkLaunchers();
    installApplicationLaunchers(session);
    installCompanyScopedLaunchers(session);
    wireLegacyPortalButtons();
    startWorkCenterRefresh();
    document.body.dataset.authenticatedRole = role;
    document.body.dataset.roleUatReady = "true";
  }

  $("btnSignOut")?.addEventListener("click", (event) => {
    event.preventDefault();
    signOut();
  });

  window.SulandraRoleUat = Object.freeze({
    contract: UAT_CONTRACT,
    clinicalRoles: [...clinicalRoles],
    shiftRoles: [...shiftRoles],
    companyDocumentRoles: [...companyDocumentRoles],
    nmtDispatchRoles: [...nmtDispatchRoles],
    executiveAdminRoles: [...executiveAdminRoles],
  });

  loadAuthenticatedIdentity();
})();
