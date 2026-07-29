(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
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
    window.location.replace("employee-login.html");
  }

  function setStatusBadge(text) {
    const element = $("empStatus");
    element.textContent = text || "Unknown";
    element.classList.remove("green", "orange", "blue");
    const status = String(text || "").toLowerCase();
    if (status === "active") element.classList.add("green");
    else if (status === "pending" || status === "inactive") element.classList.add("orange");
    else element.classList.add("blue");
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
      if (session.role === "ADMINISTRATOR") {
        window.location.replace("admin.html");
        return;
      }

      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
    } catch (error) {
      console.error("Failed to load employee session:", error);
      $("empName").textContent = "Employee portal unavailable";
      $("empRole").textContent = error.message;
      setStatusBadge("Unavailable");
    }
  }

  $("btnSignOut").addEventListener("click", (event) => {
    event.preventDefault();
    signOut();
  });

  authenticate();
})();
