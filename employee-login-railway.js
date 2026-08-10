(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production-5fc4.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const ADMIN_LANDING_ROLES = new Set(["ADMINISTRATOR", "CEO", "DOO"]);
  const message = document.getElementById("msg");
  const usernamePanel = document.getElementById("usernameRecoveryPanel");
  const passwordPanel = document.getElementById("passwordRecoveryPanel");

  function showMessage(text, type) {
    message.textContent = text;
    message.className = type === "success" ? "msg success" : "msg show";
  }

  function clearMessage() {
    message.textContent = "";
    message.className = "msg";
  }

  function saveAuthenticatedSession(token, session) {
    const encoded = JSON.stringify(session);
    window.sessionStorage.setItem(TOKEN_KEY, token);
    window.sessionStorage.setItem(SESSION_KEY, encoded);
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(SESSION_KEY, encoded);
  }

  function clearAuthenticatedSession() {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  }

  function safeReturnTarget() {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (!requested) return "";
    try {
      const resolved = new URL(requested, window.location.origin);
      if (resolved.origin !== window.location.origin) return "";
      return resolved.pathname + resolved.search + resolved.hash;
    } catch {
      return "";
    }
  }

  function closeRecoveryPanels() {
    usernamePanel.classList.remove("open");
    passwordPanel.classList.remove("open");
  }

  function openRecoveryPanel(panel) {
    clearMessage();
    closeRecoveryPanels();
    panel.classList.add("open");
    panel.querySelector("input")?.focus();
  }

  async function recoveryRequest(path, body, button) {
    clearMessage();
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Sending…";
    try {
      const response = await fetch(API_BASE + path, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to process the recovery request.");
      closeRecoveryPanels();
      showMessage(payload.message || "If the information matches an active employee account, recovery instructions have been sent.", "success");
    } catch (error) {
      showMessage(error.message || "Unable to process the recovery request.", "error");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  document.getElementById("clear").addEventListener("click", () => {
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
    document.getElementById("recoveryEmail").value = "";
    document.getElementById("recoveryUsername").value = "";
    closeRecoveryPanels(); clearMessage();
  });
  document.getElementById("forgotUsername").addEventListener("click", () => {
    const loginEmail = document.getElementById("email").value.trim();
    if (loginEmail) document.getElementById("recoveryEmail").value = loginEmail;
    openRecoveryPanel(usernamePanel);
  });
  document.getElementById("forgotPassword").addEventListener("click", () => {
    const loginEmail = document.getElementById("email").value.trim();
    if (loginEmail) document.getElementById("recoveryUsername").value = loginEmail;
    openRecoveryPanel(passwordPanel);
  });
  document.querySelectorAll("[data-close-recovery]").forEach((button) => button.addEventListener("click", closeRecoveryPanels));
  document.getElementById("sendUsernameRecovery").addEventListener("click", () => {
    const email = document.getElementById("recoveryEmail").value.trim().toLowerCase();
    if (!email) return showMessage("Enter the email connected to your employee account.", "error");
    recoveryRequest("/api/auth/forgot-username", { email }, document.getElementById("sendUsernameRecovery"));
  });
  document.getElementById("sendPasswordRecovery").addEventListener("click", () => {
    const username = document.getElementById("recoveryUsername").value.trim().toLowerCase();
    if (!username) return showMessage("Enter your Sulandra employee username or email.", "error");
    recoveryRequest("/api/auth/forgot-password", { username }, document.getElementById("sendPasswordRecovery"));
  });

  document.getElementById("form").addEventListener("submit", async (event) => {
    event.preventDefault(); clearMessage(); closeRecoveryPanels();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    if (!email || !password) return showMessage("Enter your employee email and password.", "error");
    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;
    try {
      const response = await fetch(API_BASE + "/api/auth/login", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to sign in.");
      const session = payload.session || payload.data || payload;
      const token = session.accessToken || session.bearerToken || session.token;
      if (!token) throw new Error("The server did not return an access token.");
      saveAuthenticatedSession(token, session);
      const requestedTarget = safeReturnTarget();
      const role = String(session.role || "").toUpperCase();
      window.location.assign(requestedTarget || (ADMIN_LANDING_ROLES.has(role) ? "admin.html" : "employee-portal.html"));
    } catch (error) {
      clearAuthenticatedSession();
      showMessage(error.message || "Unable to sign in.", "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
})();
