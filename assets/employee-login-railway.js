(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production-5fc4.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const message = document.getElementById("msg");
  const usernamePanel = document.getElementById("usernameRecoveryPanel");
  const passwordPanel = document.getElementById("passwordRecoveryPanel");
  const mfaPanel = document.getElementById("mfaPanel");
  const mfaCode = document.getElementById("mfaCode");
  const mfaHint = document.getElementById("mfaHint");
  const resendMfaCode = document.getElementById("resendMfaCode");
  const signInButton = document.getElementById("signInButton");
  let mfaChallengeId = "";
  let apiWarmupPromise = null;

  function warmApi() {
    if (!apiWarmupPromise) {
      apiWarmupPromise = fetch(API_BASE + "/live", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        keepalive: true
      }).catch(() => null);
    }
    return apiWarmupPromise;
  }
  warmApi();

  try {
    const current = new URL(window.location.href);
    let changed = false;
    for (const key of ["username", "email", "password", "mfaCode", "mfaChallengeId"]) {
      if (current.searchParams.has(key)) {
        current.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) window.history.replaceState({}, document.title, current.pathname + current.search + current.hash);
  } catch {}

  function showMessage(text, type) {
    message.textContent = text;
    message.className = type === "success" ? "msg success" : "msg show";
  }

  function clearMessage() {
    message.textContent = "";
    message.className = "msg";
  }

  function saveAuthenticatedSession(token, session) {
    const encoded = JSON.stringify({ ...session, portalContext: "EMPLOYEE" });
    window.sessionStorage.setItem(TOKEN_KEY, token);
    window.sessionStorage.setItem(SESSION_KEY, encoded);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  }

  function clearAuthenticatedSession() {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  }

  function safeReturnTarget() {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("returnTo") || params.get("return");
    if (!requested) return "";
    try {
      const resolved = new URL(requested, window.location.origin);
      if (resolved.origin !== window.location.origin) return "";
      if (resolved.pathname.toLowerCase().includes("admin")) return "";
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

  function resetMfaChallenge() {
    mfaChallengeId = "";
    mfaCode.value = "";
    mfaPanel.classList.remove("open");
    mfaHint.textContent = "Enter the 6-digit security code sent to your phone.";
    signInButton.textContent = "Sign In to Employee Portal";
  }

  function showMfaChallenge(payload) {
    mfaChallengeId = String(payload.mfaChallengeId || "");
    mfaCode.value = "";
    mfaPanel.classList.add("open");
    const destination = payload.maskedPhone ? ` ${payload.maskedPhone}` : " your phone";
    mfaHint.textContent = `We sent a 6-digit security code to${destination}. The code expires in 5 minutes.`;
    signInButton.textContent = "Verify & Open Employee Portal";
    showMessage("Password accepted. Enter the security code from your phone to finish signing in.", "success");
    requestAnimationFrame(() => mfaCode.focus());
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

  async function performLogin(options = {}) {
    const resend = Boolean(options.resend);
    clearMessage();
    closeRecoveryPanels();
    const username = document.getElementById("username").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const code = mfaCode.value.replace(/\D/g, "").slice(0, 6);
    if (!username || !password) return showMessage("Enter your employee username and password.", "error");
    if (username.includes("@")) return showMessage("Employee Portal uses your assigned employee username, not your Sulandra email. Use Administrator Sign In for admin access.", "error");
    if (mfaChallengeId && !resend && code.length !== 6) return showMessage("Enter the 6-digit security code sent to your phone.", "error");

    warmApi();
    signInButton.disabled = true;
    resendMfaCode.disabled = true;
    const previousButtonText = signInButton.textContent;
    signInButton.textContent = mfaChallengeId && !resend ? "Verifying…" : "Connecting…";
    try {
      const body = { username, password, portal: "EMPLOYEE" };
      if (mfaChallengeId && !resend) {
        body.mfaChallengeId = mfaChallengeId;
        body.mfaCode = code;
      }
      const response = await fetch(API_BASE + "/api/auth/login", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));

      if (payload.mfaRequired && payload.mfaMethod === "sms" && payload.mfaChallengeId) {
        clearAuthenticatedSession();
        showMfaChallenge(payload);
        return;
      }
      if (!response.ok) {
        clearAuthenticatedSession();
        if (payload.mfaRequired && payload.mfaMethod === "sms") mfaPanel.classList.add("open");
        throw new Error(payload.error || "Unable to sign in.");
      }

      const session = payload.session || payload.data || payload;
      const token = session.accessToken || session.bearerToken || session.token;
      if (!token) throw new Error("The server did not return an access token.");
      saveAuthenticatedSession(token, session);
      window.location.assign(safeReturnTarget() || "/employee-portal.html");
    } catch (error) {
      showMessage(error.message || "Unable to sign in.", "error");
    } finally {
      signInButton.disabled = false;
      resendMfaCode.disabled = false;
      if (!mfaChallengeId) signInButton.textContent = previousButtonText || "Sign In to Employee Portal";
    }
  }

  document.getElementById("clear").addEventListener("click", () => {
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    document.getElementById("recoveryEmail").value = "";
    document.getElementById("recoveryUsername").value = "";
    resetMfaChallenge();
    closeRecoveryPanels(); clearMessage();
  });
  document.getElementById("forgotUsername").addEventListener("click", () => openRecoveryPanel(usernamePanel));
  document.getElementById("forgotPassword").addEventListener("click", () => {
    const loginUsername = document.getElementById("username").value.trim();
    if (loginUsername) document.getElementById("recoveryUsername").value = loginUsername;
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
    if (!username) return showMessage("Enter your Sulandra employee username.", "error");
    recoveryRequest("/api/auth/forgot-password", { username }, document.getElementById("sendPasswordRecovery"));
  });
  resendMfaCode.addEventListener("click", () => {
    resetMfaChallenge();
    performLogin({ resend: true });
  });
  mfaCode.addEventListener("input", () => {
    mfaCode.value = mfaCode.value.replace(/\D/g, "").slice(0, 6);
  });
  document.getElementById("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await performLogin();
  });
})();