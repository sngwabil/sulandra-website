(function () {
  "use strict";

  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const $ = (id) => document.getElementById(id);

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
    element.textContent = text || "Unknown";
    element.classList.remove("green", "orange", "blue");
    const status = String(text || "").toLowerCase();
    if (status === "active") element.classList.add("green");
    else if (status === "pending" || status === "inactive") element.classList.add("orange");
    else element.classList.add("blue");
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
    // No extra /api/session round trip here. Login established the session once.
    // Protected business API calls still carry the bearer token and the backend
    // enforces the user's role, scope and revocation status invisibly.
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
  }

  $("btnSignOut").addEventListener("click", (event) => {
    event.preventDefault();
    signOut();
  });

  loadAuthenticatedIdentity();
})();
