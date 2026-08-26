(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production-5fc4.up.railway.app";
  const ADMIN_TOKEN_KEY = "sulandra:admin:access-token";
  const ADMIN_SESSION_KEY = "sulandra:admin:session";
  const LEGACY_TOKEN_KEY = "sulandra:employee:access-token";
  const LEGACY_SESSION_KEY = "sulandra:employee:session";
  const LAST_ACTIVITY_KEY = "sulandra:admin:last-activity";
  const STEP_UP_UNTIL_KEY = "sulandra:admin:step-up-until";
  const PRIVILEGED_ROLES = new Set(["ADMINISTRATOR", "CEO", "DOO"]);
  const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  const WARNING_WINDOW_MS = 2 * 60 * 1000;
  const STEP_UP_WINDOW_MS = 5 * 60 * 1000;
  const originalFetch = window.fetch.bind(window);
  let warningElement = null;
  let signingOut = false;

  function readJson(value) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  }

  function sessionRecord() {
    return readJson(sessionStorage.getItem(ADMIN_SESSION_KEY))
      || readJson(sessionStorage.getItem(LEGACY_SESSION_KEY))
      || readJson(localStorage.getItem(LEGACY_SESSION_KEY));
  }

  function roleOf(session) {
    return String(session?.role || session?.user?.role || session?.profile?.role || "").toUpperCase();
  }

  function token() {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(LEGACY_TOKEN_KEY) || "";
  }

  function clearPersistentAuth() {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  }

  function migratePrivilegedSessionToTabOnlyStorage() {
    const session = sessionRecord();
    if (!PRIVILEGED_ROLES.has(roleOf(session))) return false;

    const legacyToken = sessionStorage.getItem(LEGACY_TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
    const legacySession = sessionStorage.getItem(LEGACY_SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
    if (!sessionStorage.getItem(ADMIN_TOKEN_KEY) && legacyToken) sessionStorage.setItem(ADMIN_TOKEN_KEY, legacyToken);
    if (!sessionStorage.getItem(ADMIN_SESSION_KEY) && legacySession) sessionStorage.setItem(ADMIN_SESSION_KEY, legacySession);
    // Keep the tab-scoped legacy mirror for older Admin modules; never persist it.
    if (!sessionStorage.getItem(LEGACY_TOKEN_KEY) && sessionStorage.getItem(ADMIN_TOKEN_KEY)) sessionStorage.setItem(LEGACY_TOKEN_KEY, sessionStorage.getItem(ADMIN_TOKEN_KEY));
    if (!sessionStorage.getItem(LEGACY_SESSION_KEY) && sessionStorage.getItem(ADMIN_SESSION_KEY)) sessionStorage.setItem(LEGACY_SESSION_KEY, sessionStorage.getItem(ADMIN_SESSION_KEY));
    clearPersistentAuth();
    return true;
  }

  function clearPrivilegedSession() {
    for (const key of [ADMIN_TOKEN_KEY, ADMIN_SESSION_KEY, LEGACY_TOKEN_KEY, LEGACY_SESSION_KEY, LAST_ACTIVITY_KEY, STEP_UP_UNTIL_KEY]) {
      sessionStorage.removeItem(key);
    }
    clearPersistentAuth();
  }

  async function revokeCurrentSession() {
    const accessToken = token();
    if (!accessToken) return;
    try {
      await originalFetch(API_BASE + "/api/auth/logout", {
        method: "POST",
        headers: { Accept: "application/json", Authorization: "Bearer " + accessToken },
        keepalive: true
      });
    } catch {}
  }

  async function secureSignOut(reason) {
    if (signingOut) return;
    signingOut = true;
    await revokeCurrentSession();
    clearPrivilegedSession();
    const suffix = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    window.location.replace("admin-login.html" + suffix);
  }

  function lastActivity() {
    const value = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY) || 0);
    return Number.isFinite(value) && value > 0 ? value : Date.now();
  }

  function noteActivity() {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    hideWarning();
  }

  function hideWarning() {
    if (warningElement) warningElement.hidden = true;
  }

  function ensureWarning() {
    if (warningElement) return warningElement;
    const box = document.createElement("div");
    box.id = "sulandraPrivilegedSessionWarning";
    box.hidden = true;
    box.setAttribute("role", "alert");
    box.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483000;max-width:390px;background:#fff7ed;color:#7c2d12;border:1px solid #fdba74;border-radius:14px;box-shadow:0 18px 48px rgba(15,23,42,.22);padding:14px 16px;font:600 14px/1.45 Segoe UI,Arial,sans-serif";
    box.innerHTML = '<div style="font-size:15px;font-weight:850;margin-bottom:4px">Admin session about to lock</div><div id="sulandraPrivilegedSessionWarningText"></div><button type="button" id="sulandraPrivilegedStaySignedIn" style="margin-top:10px;border:0;border-radius:9px;background:#004b8d;color:white;padding:9px 12px;font-weight:800;cursor:pointer">Continue session</button>';
    document.body.appendChild(box);
    box.querySelector("#sulandraPrivilegedStaySignedIn").addEventListener("click", noteActivity);
    warningElement = box;
    return box;
  }

  function checkIdleState() {
    const elapsed = Date.now() - lastActivity();
    if (elapsed >= IDLE_TIMEOUT_MS) {
      secureSignOut("admin-session-idle");
      return;
    }
    const remaining = IDLE_TIMEOUT_MS - elapsed;
    if (remaining <= WARNING_WINDOW_MS) {
      const box = ensureWarning();
      const minutes = Math.max(1, Math.ceil(remaining / 60000));
      const text = box.querySelector("#sulandraPrivilegedSessionWarningText");
      if (text) text.textContent = `For your protection, this Admin workspace will sign out in about ${minutes} minute${minutes === 1 ? "" : "s"} unless you continue the session.`;
      box.hidden = false;
    } else {
      hideWarning();
    }
  }

  function isSensitiveMutation(input, init) {
    const method = String(init?.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
    if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(method)) return false;
    let rawUrl = "";
    if (typeof input === "string") rawUrl = input;
    else if (input instanceof URL) rawUrl = input.href;
    else if (input instanceof Request) rawUrl = input.url;
    let pathname = rawUrl;
    try { pathname = new URL(rawUrl, window.location.origin).pathname; } catch {}
    const path = String(pathname || "").toLowerCase();
    if (path === "/api/auth/logout" || path === "/api/auth/privileged/reauthenticate") return false;
    if (method === "DELETE") return path.startsWith("/api/");
    if (path.includes("/api/admin/auth/security/")) return true;
    if (path.includes("/api/admin/company-settings")) return true;
    return /(?:password|credential|permission|access-control|\brole\b|mfa|security|revoke|deactivate|terminate|offboard|delete|remove|owner|leadership)/i.test(path);
  }

  function stepUpStillFresh() {
    const until = Number(sessionStorage.getItem(STEP_UP_UNTIL_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  }

  function showStepUpModal() {
    return new Promise((resolve) => {
      const existing = document.getElementById("sulandraAdminStepUpOverlay");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.id = "sulandraAdminStepUpOverlay";
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:20px;font-family:Segoe UI,Arial,sans-serif";
      overlay.innerHTML = `
        <form id="sulandraAdminStepUpForm" style="width:min(430px,100%);background:white;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:24px;color:#17243a" autocomplete="off">
          <div style="font-size:12px;font-weight:850;letter-spacing:.08em;color:#004b8d;text-transform:uppercase">Sulandra Health Security</div>
          <h2 style="margin:6px 0 8px;font-size:24px">Confirm it’s you</h2>
          <p style="margin:0 0 16px;color:#66778a;font-size:14px;line-height:1.5">This action can change sensitive administrative or security information. Re-enter your Admin password to continue.</p>
          <label style="display:grid;gap:7px;font-size:14px;font-weight:750">Admin password
            <input id="sulandraAdminStepUpPassword" type="password" autocomplete="current-password" required style="width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:12px;font-size:16px" />
          </label>
          <div id="sulandraAdminStepUpError" role="alert" style="min-height:20px;margin-top:8px;color:#b91c1c;font-size:13px"></div>
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
            <button type="button" id="sulandraAdminStepUpCancel" style="border:1px solid #cbd5e1;background:white;border-radius:10px;padding:10px 13px;font-weight:800;cursor:pointer">Cancel</button>
            <button type="submit" id="sulandraAdminStepUpConfirm" style="border:0;background:#004b8d;color:white;border-radius:10px;padding:10px 14px;font-weight:850;cursor:pointer">Verify & Continue</button>
          </div>
        </form>`;
      document.body.appendChild(overlay);
      const form = overlay.querySelector("#sulandraAdminStepUpForm");
      const password = overlay.querySelector("#sulandraAdminStepUpPassword");
      const error = overlay.querySelector("#sulandraAdminStepUpError");
      const confirm = overlay.querySelector("#sulandraAdminStepUpConfirm");
      const cleanup = (result) => { overlay.remove(); resolve(result); };
      overlay.querySelector("#sulandraAdminStepUpCancel").addEventListener("click", () => cleanup(false));
      overlay.addEventListener("click", (event) => { if (event.target === overlay) cleanup(false); });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        confirm.disabled = true;
        confirm.textContent = "Verifying…";
        try {
          const response = await originalFetch(API_BASE + "/api/auth/privileged/reauthenticate", {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + token() },
            body: JSON.stringify({ password: password.value })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload?.data?.verified !== true) throw new Error(payload.error || "Password verification failed.");
          sessionStorage.setItem(STEP_UP_UNTIL_KEY, String(Date.now() + STEP_UP_WINDOW_MS));
          noteActivity();
          cleanup(true);
        } catch (err) {
          error.textContent = err?.message || "Password verification failed.";
          password.value = "";
          password.focus();
          confirm.disabled = false;
          confirm.textContent = "Verify & Continue";
        }
      });
      setTimeout(() => password.focus(), 0);
    });
  }

  async function ensureStepUp() {
    if (stepUpStillFresh()) return true;
    return showStepUpModal();
  }

  if (!migratePrivilegedSessionToTabOnlyStorage()) return;

  if (!sessionStorage.getItem(LAST_ACTIVITY_KEY)) noteActivity();
  clearPersistentAuth();

  window.fetch = async function (input, init) {
    if (isSensitiveMutation(input, init)) {
      const verified = await ensureStepUp();
      if (!verified) throw new Error("Administrator verification was cancelled.");
    }
    return originalFetch(input, init);
  };

  for (const eventName of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(eventName, noteActivity, { passive: true, capture: true });
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkIdleState(); });
  window.addEventListener("pageshow", () => { clearPersistentAuth(); checkIdleState(); });
  window.addEventListener("pagehide", clearPersistentAuth);
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("#btnAdminSignOut,[data-admin-signout]") : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    secureSignOut("signed-out");
  }, true);

  setInterval(() => { clearPersistentAuth(); checkIdleState(); }, 15000);
  checkIdleState();
  window.SulandraAdminSessionSecurity = Object.freeze({
    idleTimeoutMinutes: IDLE_TIMEOUT_MS / 60000,
    persistentAuthDisabled: true,
    sessionStorage: 'ADMIN',
    stepUpWindowMinutes: STEP_UP_WINDOW_MS / 60000,
    signOut: secureSignOut
  });
})();