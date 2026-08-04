(function () {
  "use strict";

  const API_BASE = "";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const SPIRE_CONTEXT_KEY = "sulandra:spire:context";
  const $ = (id) => document.getElementById(id);

  function readStoredSession() {
    try {
      return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function signOut() {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SPIRE_CONTEXT_KEY);
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

  function titleRole(value) {
    return String(value || "Employee")
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  }

  function buildSpireContext(session) {
    const role = String(session.role || "GENERAL").toUpperCase();
    const clinicalRoles = ["RN", "LPN", "DELEGATING_NURSE"];
    const directCareRoles = ["DSP", "CNA", "PCT", "HHA", "HOME_HEALTH_AIDE", "DRIVER"];
    const isAdmin = role === "ADMINISTRATOR" || role === "COO" || role === "DOO";
    return {
      userId: session.id || session.employeeId || null,
      email: String(session.email || session.username || "").toLowerCase(),
      displayName: session.displayName || session.fullName || session.name || session.email || "Employee",
      role,
      isAdmin,
      isNurse: clinicalRoles.includes(role),
      isDirectCare: directCareRoles.includes(role),
      permissions: {
        viewAssignedClients: true,
        chartNotes: true,
        chartVitals: clinicalRoles.includes(role) || directCareRoles.includes(role),
        administerMar: clinicalRoles.includes(role) || ["DSP", "CNA", "HHA", "HOME_HEALTH_AIDE"].includes(role),
        nursingAssessment: clinicalRoles.includes(role),
        manageOrders: isAdmin,
        manageAssignments: isAdmin,
        editImportedClinicalHistory: isAdmin,
        discontinueMedication: isAdmin,
        holdMedication: isAdmin,
        changeMedicationSchedule: isAdmin
      },
      assignedHomeIds: Array.isArray(session.assignedHomeIds) ? session.assignedHomeIds : [],
      assignedClientIds: Array.isArray(session.assignedClientIds) ? session.assignedClientIds : []
    };
  }

  function addSpireLinks(context) {
    const nav = document.querySelector(".nav-links");
    if (nav && !document.getElementById("spireNavLink")) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.id = "spireNavLink";
      link.href = "spire-clinical.html";
      link.textContent = "Spire Clinical";
      link.setAttribute("aria-label", "Open Spire Clinical");
      item.appendChild(link);
      nav.insertBefore(item, nav.children[1] || null);
    }

    const actions = document.querySelector(".quick-actions");
    if (actions && !document.getElementById("spireQuickAction")) {
      const link = document.createElement("a");
      link.id = "spireQuickAction";
      link.className = "qa";
      link.href = "spire-clinical.html";
      link.innerHTML = "<strong>Open Spire</strong><br><span style=\"font-size:11px;font-weight:600\">Assigned homes, clients, MAR & tasks</span>";
      actions.prepend(link);
    }

    if (context.isAdmin) {
      const actions = document.querySelector(".quick-actions");
      if (actions && !document.getElementById("spireAdminQuickAction")) {
        const link = document.createElement("a");
        link.id = "spireAdminQuickAction";
        link.className = "qa";
        link.href = "spire-admin.html";
        link.innerHTML = "<strong>Spire Administration</strong><br><span style=\"font-size:11px;font-weight:600\">Assignments, intake & medication orders</span>";
        actions.appendChild(link);
      }
    }
  }

  async function authenticate() {
    const token = window.sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      signOut();
      return;
    }

    try {
      const response = await fetch(API_BASE + "/api/session", {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        signOut();
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || "The employee session could not be verified.");
      }

      const storedSession = readStoredSession() || {};
      const session = { ...storedSession, ...(payload.data || {}) };
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

      const spireContext = buildSpireContext(session);
      window.sessionStorage.setItem(SPIRE_CONTEXT_KEY, JSON.stringify(spireContext));

      if (session.role === "ADMINISTRATOR" && new URLSearchParams(location.search).get("stay") !== "1") {
        window.location.replace("admin.html");
        return;
      }

      if ($("empName")) {
        $("empName").textContent = spireContext.displayName;
      }
      if ($("empRole")) {
        $("empRole").textContent = titleRole(session.role);
      }
      setStatusBadge("Active");
      addSpireLinks(spireContext);
    } catch (error) {
      console.error("Failed to load employee session:", error);
      if ($("empName")) $("empName").textContent = "Employee portal unavailable";
      if ($("empRole")) $("empRole").textContent = error.message;
      setStatusBadge("Unavailable");
    }
  }

  const signOutButton = $("btnSignOut");
  if (signOutButton) {
    signOutButton.addEventListener("click", (event) => {
      event.preventDefault();
      signOut();
    });
  }

  authenticate();
})();