(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production-5fc4.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const ENTITY_KEY = "sulandra:selected-legal-entity-id";
  const $ = (id) => document.getElementById(id);
  const clinicalRoles = new Set([
    "DSP", "LPN", "RN", "DELEGATING_NURSE", "HOUSE_MANAGER",
    "PROGRAM_MANAGER", "AUDITOR", "CEO", "DOO"
  ]);
  const shiftRoles = new Set([
    "DSP", "LPN", "RN", "DELEGATING_NURSE", "HOUSE_MANAGER", "PROGRAM_MANAGER"
  ]);
  const homeHealthManagementRoles = new Set([
    "RN", "DELEGATING_NURSE", "PROGRAM_MANAGER", "SCHEDULER", "CEO", "DOO"
  ]);

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

  function launcher(label, href, title) {
    const a = document.createElement("a");
    a.className = "qa";
    a.href = href;
    a.textContent = label;
    a.title = title;
    return a;
  }

  async function entityContext() {
    const authToken = readToken();
    const response = await fetch(`${API_BASE}/api/entity-context`, {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${authToken}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Company context failed (${response.status})`);
    return payload.data || {};
  }

  async function selectNmtEntityAndOpen(event) {
    event.preventDefault();
    try {
      const context = await entityContext();
      const entities = Array.isArray(context.entities) ? context.entities : [];
      const nmt = entities.find((entity) => entity.code === "NMT" && entity.status === "ACTIVE");
      if (!nmt) throw new Error("Sulandra NMT Services is not available in your company access yet.");
      window.sessionStorage.setItem(ENTITY_KEY, nmt.id);
      window.localStorage.setItem(ENTITY_KEY, nmt.id);
      window.location.href = "/nmt-driver.html";
    } catch (error) {
      window.alert(error.message || "Unable to open NMT trips.");
    }
  }

  function installApplicationLaunchers(session) {
    const quick = document.querySelector(".page-hero .quick-actions");
    if (!quick || document.getElementById("employeeSpireTrainingLauncher")) return;

    const training = launcher("SPIRE Training", "/spire-training.html", "Practice in isolated simulated charts");
    training.id = "employeeSpireTrainingLauncher";
    quick.appendChild(training);

    const role = String(session.role || "").toUpperCase();
    if (shiftRoles.has(role)) {
      const shift = launcher("My Shift", "/spire-shift.html", "Assigned clients, due medications, vitals, weight, temperature and bedside tasks");
      shift.id = "employeeMyShiftLauncher";
      quick.appendChild(shift);
    }
    if (clinicalRoles.has(role)) {
      const spire = launcher("Open SPIRE", "/spire.html", "Open authorized live client/patient charts");
      spire.id = "employeeLiveSpireLauncher";
      quick.appendChild(spire);
    }
    if (role === "DRIVER") {
      const trips = launcher("My NMT Trips", "/nmt-driver.html", "Open assigned NMT transportation trips");
      trips.id = "employeeNmtTripsLauncher";
      trips.addEventListener("click", selectNmtEntityAndOpen);
      quick.appendChild(trips);
    }

    const nav = document.querySelector(".nav-links");
    if (nav && !document.getElementById("employeeSpireNav")) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.id = "employeeSpireNav";
      a.href = shiftRoles.has(role) ? "/spire-shift.html" : (clinicalRoles.has(role) ? "/spire.html" : "/spire-training.html");
      a.textContent = shiftRoles.has(role) ? "My Shift" : (clinicalRoles.has(role) ? "SPIRE" : "SPIRE Training");
      li.appendChild(a);
      nav.appendChild(li);
    }
  }

  async function installCompanyScopedLaunchers(session) {
    if (document.getElementById("employeeHomeHealthVisitsLauncher")) return;
    try {
      const context = await entityContext();
      const entities = Array.isArray(context.entities) ? context.entities : [];
      const savedId = window.sessionStorage.getItem(ENTITY_KEY) || window.localStorage.getItem(ENTITY_KEY) || context.primaryEntityId || "";
      const selected = entities.find((entity) => entity.id === savedId) || entities.find((entity) => entity.id === context.primaryEntityId) || entities[0];
      if (!selected || selected.code !== "HOME_HEALTH" || selected.status !== "ACTIVE") return;
      const quick = document.querySelector(".page-hero .quick-actions");
      if (!quick) return;
      const visits = launcher("My Home Health Visits", "/home-health-visits.html", "Open assigned skilled nursing, therapy, respiratory, aide or social-work visits");
      visits.id = "employeeHomeHealthVisitsLauncher";
      quick.appendChild(visits);
      const role = String(session.role || "").toUpperCase();
      if (homeHealthManagementRoles.has(role)) {
        const operations = launcher("Home Health Operations", "/home-health.html", "Manage Home Health referrals, episodes, Plan of Care, disciplines, staff and scheduling");
        operations.id = "employeeHomeHealthOperationsLauncher";
        quick.appendChild(operations);
      }
      const nav = document.querySelector(".nav-links");
      if (nav && !document.getElementById("employeeHomeHealthNav")) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.id = "employeeHomeHealthNav";
        a.href = "/home-health-visits.html";
        a.textContent = "Home Health";
        li.appendChild(a);
        nav.appendChild(li);
      }
    } catch (error) {
      console.warn("Unable to install company-scoped employee launchers", error);
    }
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
    if (session.role === "ADMINISTRATOR") {
      window.location.replace("admin.html");
      return;
    }
    $("empName").textContent =
      session.displayName
      || session.fullName
      || session.name
      || session.email
      || session.username
      || "Employee";
    $("empRole").textContent = String(session.role || "Employee")
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
    setStatusBadge("Active");
    installApplicationLaunchers(session);
    installCompanyScopedLaunchers(session);
  }

  $("btnSignOut")?.addEventListener("click", (event) => {
    event.preventDefault();
    signOut();
  });

  loadAuthenticatedIdentity();
})();