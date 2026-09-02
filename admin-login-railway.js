(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production-5fc4.up.railway.app";
  const ADMIN_EMAIL_DOMAIN = "@sulandrahealth.com";
  const ADMIN_TOKEN_KEY = "sulandra:admin:access-token";
  const ADMIN_SESSION_KEY = "sulandra:admin:session";
  const LEGACY_TOKEN_KEY = "sulandra:employee:access-token";
  const LEGACY_SESSION_KEY = "sulandra:employee:session";
  const ADMIN_ROLES = new Set(["ADMINISTRATOR", "PROGRAM_MANAGER", "HR_MANAGER", "CEO", "DOO"]);
  const OWNER_ROLES = new Set(["ADMINISTRATOR"]);
  const PROTECTED_SESSION_ASSET = "/assets/sulandra-protected-session.js?v=20260902-protected-session-1";
  const message = document.getElementById("adminLoginMessage");
  const form = document.getElementById("adminLoginForm");
  const emailInput = document.getElementById("adminEmail");
  const passwordInput = document.getElementById("adminPassword");
  const signInButton = document.getElementById("adminSignInButton");
  const mfaPanel = document.getElementById("adminMfaPanel");
  const mfaCode = document.getElementById("adminMfaCode");
  const mfaHint = document.getElementById("adminMfaHint");
  const resendButton = document.getElementById("adminResendMfa");
  const unauthorizedWarning = document.getElementById("adminUnauthorizedWarning");
  let mfaChallengeId = "";
  let protectedSessionPromise = null;

  function loadProtectedSessionRuntime() {
    if (window.SulandraProtectedSession) return Promise.resolve(window.SulandraProtectedSession);
    if (protectedSessionPromise) return protectedSessionPromise;
    protectedSessionPromise = new Promise((resolve) => {
      let script = document.querySelector('script[data-sulandra-protected-session-loader]');
      const finish = () => resolve(window.SulandraProtectedSession || null);
      if (!script) {
        script = document.createElement("script");
        script.src = PROTECTED_SESSION_ASSET;
        script.async = true;
        script.dataset.sulandraProtectedSessionLoader = "1";
        document.head.appendChild(script);
      }
      if (window.SulandraProtectedSession) return finish();
      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", () => resolve(null), { once: true });
    });
    return protectedSessionPromise;
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null;
  }

  function armProtectedFullscreenFromGesture() {
    loadProtectedSessionRuntime();
    if (fullscreenElement()) return;
    try { sessionStorage.setItem("sulandra:protected-session:fullscreen-intent", "1"); } catch {}
    const element = document.documentElement;
    const request = element.requestFullscreen || element.webkitRequestFullscreen || element.webkitRequestFullScreen || element.mozRequestFullScreen || element.msRequestFullscreen;
    if (!request) return;
    try {
      const result = request === element.requestFullscreen ? request.call(element, { navigationUI: "hide" }) : request.call(element);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch {
      try {
        const result = request.call(element);
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch {}
    }
  }

  async function enterProtectedSession(target) {
    const runtime = window.SulandraProtectedSession || await loadProtectedSessionRuntime();
    if (runtime?.enter) {
      runtime.enter(target, { portal: "ADMIN" });
      return;
    }
    window.location.assign(target);
  }

  loadProtectedSessionRuntime();

  function showMessage(text, type) {
    message.textContent = text;
    message.className = type === "success" ? "msg success" : "msg show";
  }

  function clearMessage() {
    message.textContent = "";
    message.className = "msg";
  }

  function isManagementEmail(value) {
    const identifier = String(value || "").trim().toLowerCase();
    return identifier.endsWith(ADMIN_EMAIL_DOMAIN) && /^[^\s@]+@[^\s@]+$/.test(identifier);
  }

  function showUnauthorizedWarning() {
    if (unauthorizedWarning) unauthorizedWarning.hidden = false;
  }

  function hideUnauthorizedWarning() {
    if (unauthorizedWarning) unauthorizedWarning.hidden = true;
  }

  function clearAdminSession() {
    for (const key of [ADMIN_TOKEN_KEY, ADMIN_SESSION_KEY, LEGACY_TOKEN_KEY, LEGACY_SESSION_KEY]) window.sessionStorage.removeItem(key);
  }

  function saveAdminSession(token, session) {
    const encoded = JSON.stringify({ ...session, portalContext: "ADMIN" });
    window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    window.sessionStorage.setItem(ADMIN_SESSION_KEY, encoded);
    window.sessionStorage.setItem(LEGACY_TOKEN_KEY, token);
    window.sessionStorage.setItem(LEGACY_SESSION_KEY, encoded);
  }

  function normalizeRole(session) {
    return String(session?.role || session?.user?.role || session?.profile?.role || "").toUpperCase();
  }

  function adminAllowed(session) {
    const role = normalizeRole(session);
    const permissionList = Array.isArray(session?.permissions) ? session.permissions : [];
    const backendAccess = Boolean(session?.access?.administration || session?.user?.access?.administration);
    return ADMIN_ROLES.has(role) && (backendAccess || permissionList.includes("SULANDRA_ADMINISTRATION_ACCESS") || role === "ADMINISTRATOR");
  }

  function safeReturnTarget(session) {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (requested) {
      try {
        const resolved = new URL(requested, window.location.origin);
        if (resolved.origin === window.location.origin && /(^|\/)admin(?:-|\.|\/|$)/i.test(resolved.pathname)) return resolved.pathname + resolved.search + resolved.hash;
      } catch {}
    }
    return OWNER_ROLES.has(normalizeRole(session)) ? "/admin.html" : "/admin-operations.html";
  }

  function resetMfa() {
    mfaChallengeId = "";
    mfaCode.value = "";
    mfaPanel.classList.remove("open");
    mfaHint.textContent = "Enter the 6-digit security code sent to your phone.";
    signInButton.textContent = "Sign In to Admin";
  }

  function showMfa(payload) {
    hideUnauthorizedWarning();
    mfaChallengeId = String(payload.mfaChallengeId || "");
    mfaPanel.classList.add("open");
    mfaCode.value = "";
    const destination = payload.maskedPhone ? ` ${payload.maskedPhone}` : " your phone";
    mfaHint.textContent = `We sent a 6-digit security code to${destination}. The code expires in 5 minutes.`;
    signInButton.textContent = "Verify & Open Admin";
    showMessage("Password accepted. Complete phone verification to enter administration.", "success");
    requestAnimationFrame(() => mfaCode.focus());
  }

  async function performLogin(options = {}) {
    const resend = Boolean(options.resend);
    clearMessage();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    const code = mfaCode.value.replace(/\D/g, "").slice(0, 6);
    if (!email || !password) return showMessage("Enter your Sulandra management work email and password.", "error");
    if (!isManagementEmail(email)) {
      showUnauthorizedWarning();
      return showMessage("Administrator access could not be verified for this identifier.", "error");
    }
    if (mfaChallengeId && !resend && code.length !== 6) return showMessage("Enter the 6-digit security code sent to your phone.", "error");

    signInButton.disabled = true;
    resendButton.disabled = true;
    try {
      const body = { email, password, portal: "ADMIN" };
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
        clearAdminSession();
        showMfa(payload);
        return;
      }
      if (!response.ok) {
        clearAdminSession();
        if (!mfaChallengeId && [400, 401, 403].includes(response.status)) {
          showUnauthorizedWarning();
          throw new Error("Administrator access could not be verified. This management portal is restricted to authorized users.");
        }
        throw new Error(payload.error || "Unable to sign in.");
      }
      const session = payload.session || payload.data || payload;
      const token = session.accessToken || session.bearerToken || session.token;
      if (!token) throw new Error("The server did not return an access token.");
      if (!adminAllowed(session)) {
        clearAdminSession();
        showUnauthorizedWarning();
        throw new Error("This account does not have Sulandra administrator or management access.");
      }
      hideUnauthorizedWarning();
      saveAdminSession(token, session);
      await enterProtectedSession(safeReturnTarget(session));
    } catch (error) {
      showMessage(error.message || "Unable to sign in.", "error");
    } finally {
      signInButton.disabled = false;
      resendButton.disabled = false;
    }
  }

  document.querySelector(".auth-card")?.addEventListener("click", (event) => {
    if (event.isTrusted) armProtectedFullscreenFromGesture();
  }, { capture: true });

  document.getElementById("adminClear").addEventListener("click", () => {
    emailInput.value = "";
    passwordInput.value = "";
    resetMfa();
    hideUnauthorizedWarning();
    clearMessage();
  });

  document.getElementById("adminForgotPassword").addEventListener("click", async () => {
    const email = emailInput.value.trim().toLowerCase();
    if (!email || !isManagementEmail(email)) {
      showUnauthorizedWarning();
      return showMessage("Enter your authorized Sulandra management work email first.", "error");
    }
    hideUnauthorizedWarning();
    clearMessage();
    try {
      const response = await fetch(API_BASE + "/api/auth/forgot-password", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ username: email })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to request a password reset.");
      showMessage(payload.message || "If the email matches an active Sulandra account, secure recovery instructions have been sent.", "success");
    } catch (error) {
      showMessage(error.message || "Unable to request a password reset.", "error");
    }
  });

  emailInput.addEventListener("blur", () => {
    const identifier = emailInput.value.trim();
    if (identifier && !isManagementEmail(identifier)) showUnauthorizedWarning();
  });
  emailInput.addEventListener("input", () => {
    const identifier = emailInput.value.trim();
    clearMessage();
    if (!identifier || isManagementEmail(identifier)) hideUnauthorizedWarning();
  });
  resendButton.addEventListener("click", () => {
    armProtectedFullscreenFromGesture();
    resetMfa();
    performLogin({ resend: true });
  });
  mfaCode.addEventListener("input", () => {
    mfaCode.value = mfaCode.value.replace(/\D/g, "").slice(0, 6);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    armProtectedFullscreenFromGesture();
    await performLogin();
  });
})();