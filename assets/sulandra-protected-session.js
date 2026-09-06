/* SULANDRA_PROTECTED_SESSION_V2
 * Dedicated browser-fullscreen shell for Sulandra Codebase only.
 * S.P.I.R.E. keeps its independent fullscreen shell/preferences; ordinary
 * Sulandra pages leave this wrapper and behave like normal websites.
 */
(function () {
  "use strict";

  const VERSION = "20260906-dedicated-fullscreen-1";
  const ACTIVE_KEY = "sulandra:protected-session:active";
  const INTENT_KEY = "sulandra:protected-session:fullscreen-intent";
  const ROUTE_KEY = "sulandra:protected-session:route";
  const PORTAL_KEY = "sulandra:protected-session:portal";
  const SHELL_PATH = "/sulandra-session.html";
  const LOGIN_PATHS = new Set(["/employee-login.html", "/admin-login.html"]);
  let frame = null;
  let notice = null;
  let shellMounted = false;

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null;
  }

  function fullscreenRequestMethod(element) {
    return element.requestFullscreen || element.webkitRequestFullscreen || element.webkitRequestFullScreen || element.mozRequestFullScreen || element.msRequestFullscreen || null;
  }

  function fullscreenExitMethod() {
    return document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.mozCancelFullScreen || document.msExitFullscreen || null;
  }

  function requestFullscreenFromGesture() {
    if (fullscreenElement()) {
      syncFullscreenToCodebase();
      return Promise.resolve(true);
    }
    const element = document.documentElement;
    const request = fullscreenRequestMethod(element);
    if (!request) {
      syncFullscreenToCodebase();
      return Promise.resolve(false);
    }
    try {
      const result = request === element.requestFullscreen
        ? request.call(element, { navigationUI: "hide" })
        : request.call(element);
      return Promise.resolve(result)
        .then(() => { syncFullscreenToCodebase(); return true; })
        .catch(() => { syncFullscreenToCodebase(); return false; });
    } catch {
      try {
        const fallback = request.call(element);
        return Promise.resolve(fallback)
          .then(() => { syncFullscreenToCodebase(); return true; })
          .catch(() => { syncFullscreenToCodebase(); return false; });
      } catch {
        syncFullscreenToCodebase();
        return Promise.resolve(false);
      }
    }
  }

  function exitFullscreen() {
    const exit = fullscreenExitMethod();
    if (!fullscreenElement() || !exit) {
      syncFullscreenToCodebase();
      return Promise.resolve(true);
    }
    try {
      return Promise.resolve(exit.call(document))
        .then(() => { syncFullscreenToCodebase(); return true; })
        .catch(() => { syncFullscreenToCodebase(); return false; });
    } catch {
      syncFullscreenToCodebase();
      return Promise.resolve(false);
    }
  }

  function toggleFullscreenFromGesture() {
    return fullscreenElement() ? exitFullscreen() : requestFullscreenFromGesture();
  }

  function safeInternalRoute(value, fallback) {
    try {
      const resolved = new URL(String(value || fallback || "/employee-portal.html"), window.location.origin);
      if (resolved.origin !== window.location.origin) return fallback || "/employee-portal.html";
      if (!/^https?:$/.test(resolved.protocol)) return fallback || "/employee-portal.html";
      if (resolved.pathname === SHELL_PATH) return fallback || "/employee-portal.html";
      return resolved.pathname + resolved.search + resolved.hash;
    } catch {
      return fallback || "/employee-portal.html";
    }
  }

  function routePath(value) {
    try { return new URL(String(value || "/"), window.location.origin).pathname.toLowerCase(); }
    catch { return "/"; }
  }

  function isCodebaseRoute(value) {
    return routePath(value) === "/codebase.html";
  }

  function routeUrl(route, portal) {
    const params = new URLSearchParams();
    params.set("route", route);
    if (portal) params.set("portal", portal);
    return SHELL_PATH + "?" + params.toString();
  }

  function setStoredRoute(route, portal) {
    try {
      sessionStorage.setItem(ACTIVE_KEY, "1");
      sessionStorage.setItem(INTENT_KEY, "1");
      sessionStorage.setItem(ROUTE_KEY, route);
      if (portal) sessionStorage.setItem(PORTAL_KEY, portal);
    } catch {}
  }

  function clearStoredSession() {
    try {
      sessionStorage.removeItem(ACTIVE_KEY);
      sessionStorage.removeItem(INTENT_KEY);
      sessionStorage.removeItem(ROUTE_KEY);
      sessionStorage.removeItem(PORTAL_KEY);
    } catch {}
  }

  function showNotice(text) {
    if (!notice) return;
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => { if (notice) notice.hidden = true; }, 5000);
  }

  function updateShellHistory(route, portal) {
    try {
      const next = routeUrl(route, portal);
      if (window.location.pathname !== SHELL_PATH || window.location.search !== new URL(next, window.location.origin).search) {
        window.history.replaceState({ sulandraProtectedSession: VERSION, route, portal }, "", next);
      }
    } catch {}
  }

  function getPortal() {
    try { return sessionStorage.getItem(PORTAL_KEY) || new URLSearchParams(window.location.search).get("portal") || ""; }
    catch { return ""; }
  }

  function getRoute() {
    try {
      const fromQuery = new URLSearchParams(window.location.search).get("route");
      return safeInternalRoute(fromQuery || sessionStorage.getItem(ROUTE_KEY) || "/employee-portal.html", "/employee-portal.html");
    } catch {
      return "/employee-portal.html";
    }
  }

  function leaveFullscreenShell(target) {
    const safe = safeInternalRoute(target, getPortal() === "ADMIN" ? "/admin.html" : "/employee-portal.html");
    clearStoredSession();
    const go = () => window.location.assign(safe);
    if (fullscreenElement()) {
      exitFullscreen().finally(go);
      return true;
    }
    go();
    return true;
  }

  function navigate(route, options) {
    const portal = String(options?.portal || getPortal() || "").toUpperCase();
    const safe = safeInternalRoute(route, getRoute());

    // Codebase is the only application that uses this protected fullscreen shell.
    // Any ordinary Sulandra route leaves the shell and resumes normal website navigation.
    if (!isCodebaseRoute(safe)) return leaveFullscreenShell(safe);
    if (!frame) return false;

    setStoredRoute(safe, portal);
    updateShellHistory(safe, portal);
    frame.src = safe;
    return true;
  }

  function decorateCodebase(childDocument) {
    if (!childDocument || childDocument.getElementById("sulandraCodebaseHeaderDefinition")) return;
    const style = childDocument.createElement("style");
    style.id = "sulandraCodebaseHeaderDefinition";
    style.textContent = `
      .codebase-app > header {
        position: relative !important;
        border-bottom: 0 !important;
      }
      .codebase-app > header::before,
      .codebase-app > header::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        height: 2px;
        z-index: 1001;
        pointer-events: none;
      }
      .codebase-app > header::before {
        top: 0;
        background: linear-gradient(to bottom,
          #ff1744 0, #ff1744 1px,
          #00e676 1px, #00e676 2px);
        box-shadow: 0 0 4px rgba(255,23,68,.65), 0 1px 4px rgba(0,230,118,.55);
      }
      .codebase-app > header::after {
        bottom: 0;
        background: linear-gradient(to bottom,
          #00b0ff 0, #00b0ff 1px,
          #d500f9 1px, #d500f9 2px);
        box-shadow: 0 0 4px rgba(0,176,255,.65), 0 -1px 4px rgba(213,0,249,.55);
      }
    `;
    childDocument.head.appendChild(style);
  }

  function armCodebaseFullscreen(childDocument) {
    if (!childDocument || fullscreenElement()) return;
    const root = childDocument.documentElement;
    if (!root || root.dataset.sulandraCodebaseFullscreenArmed === VERSION) return;
    root.dataset.sulandraCodebaseFullscreenArmed = VERSION;

    const cleanup = () => {
      childDocument.removeEventListener("pointerdown", attempt, true);
      childDocument.removeEventListener("touchend", attempt, true);
      childDocument.removeEventListener("keydown", attempt, true);
      delete root.dataset.sulandraCodebaseFullscreenArmed;
    };

    const attempt = (event) => {
      // The actual Full Screen control owns its own toggle. Do not auto-enter on
      // pointer-down and then immediately toggle back out on the following click.
      const target = event.target?.closest?.('[onclick*="toggleFullScreen"], [data-codebase-fullscreen-control]');
      if (target) return;
      cleanup();
      requestFullscreenFromGesture().catch(() => {});
    };

    childDocument.addEventListener("pointerdown", attempt, true);
    childDocument.addEventListener("touchend", attempt, true);
    childDocument.addEventListener("keydown", attempt, true);
  }

  function syncFullscreenToCodebase() {
    if (!frame || !frame.contentWindow || !isCodebaseRoute(getRoute())) return;
    try {
      frame.contentWindow.postMessage({
        type: "SULANDRA_SESSION_FULLSCREEN_STATE",
        active: Boolean(fullscreenElement())
      }, window.location.origin);
    } catch {}
  }

  function installChildNavigationBridge() {
    if (!frame) return;
    let childWindow;
    let childDocument;
    try {
      childWindow = frame.contentWindow;
      childDocument = frame.contentDocument;
      if (!childWindow || !childDocument || childWindow.location.origin !== window.location.origin) return;
    } catch {
      return;
    }

    let childRoute = getRoute();
    try { childRoute = safeInternalRoute(childWindow.location.href, childRoute); } catch {}

    if (!isCodebaseRoute(childRoute)) {
      leaveFullscreenShell(childRoute);
      return;
    }

    setStoredRoute(childRoute, getPortal());
    updateShellHistory(childRoute, getPortal());
    decorateCodebase(childDocument);

    // Replace Codebase's iframe-local fullscreen function with a top-level toggle.
    // This makes the existing ⛶ Full Screen control enter AND leave browser fullscreen.
    try { childWindow.toggleFullScreen = toggleFullscreenFromGesture; } catch {}

    if (childDocument.documentElement?.dataset.sulandraProtectedSessionBridged !== VERSION) {
      if (childDocument.documentElement) childDocument.documentElement.dataset.sulandraProtectedSessionBridged = VERSION;

      childDocument.addEventListener("click", function (event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = event.target?.closest?.("a[href]");
        if (!anchor || anchor.hasAttribute("download")) return;
        const raw = anchor.getAttribute("href") || "";
        if (!raw || raw.startsWith("#") || /^(mailto:|tel:|sms:)/i.test(raw)) return;
        let resolved;
        try { resolved = new URL(anchor.href, childWindow.location.href); } catch { return; }
        if (resolved.origin !== window.location.origin) {
          event.preventDefault();
          event.stopPropagation();
          showNotice("External browsing is unavailable inside Sulandra Codebase.");
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        navigate(resolved.pathname + resolved.search + resolved.hash);
      }, true);

      try {
        childWindow.open = function (url) {
          const value = String(url || "");
          if (!value) return null;
          let resolved;
          try { resolved = new URL(value, childWindow.location.href); } catch { return null; }
          if (resolved.origin !== window.location.origin) {
            showNotice("External browsing is unavailable inside Sulandra Codebase.");
            return null;
          }
          navigate(resolved.pathname + resolved.search + resolved.hash);
          return childWindow;
        };
        childWindow.SulandraProtectedSession = Object.freeze({
          active: true,
          version: VERSION,
          navigate: (route) => navigate(route),
          requestFullscreenFromGesture,
          toggleFullscreenFromGesture,
          isFullscreen: () => Boolean(fullscreenElement())
        });
      } catch {}
    }

    armCodebaseFullscreen(childDocument);
    syncFullscreenToCodebase();
  }

  function shellMarkup() {
    return `
      <div id="sulandraProtectedSession" data-version="${VERSION}" style="position:fixed;inset:0;z-index:2147483000;background:#061826;overflow:hidden;">
        <iframe id="sulandraProtectedFrame" title="Sulandra Codebase" style="display:block;width:100%;height:100%;border:0;background:#fff" sandbox="allow-forms allow-scripts allow-same-origin allow-downloads allow-modals allow-pointer-lock allow-presentation" allow="camera; microphone; geolocation; clipboard-read; clipboard-write; fullscreen" allowfullscreen></iframe>
        <div id="sulandraProtectedNotice" role="status" aria-live="polite" style="position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;max-width:min(620px,calc(100vw - 32px));padding:10px 14px;border-radius:10px;background:#102f43;color:#fff;border:1px solid #35657e;font:700 12px/1.45 Inter,Segoe UI,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)" hidden></div>
      </div>`;
  }

  function mountShell(route, options) {
    const portal = String(options?.portal || getPortal() || "").toUpperCase();
    const fallback = portal === "ADMIN" ? "/admin.html" : "/employee-portal.html";
    const safe = safeInternalRoute(route, fallback);
    if (!isCodebaseRoute(safe)) return leaveFullscreenShell(safe);

    document.documentElement.style.width = "100%";
    document.documentElement.style.height = "100%";
    document.body.style.margin = "0";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    document.body.style.overflow = "hidden";
    document.body.innerHTML = shellMarkup();
    frame = document.getElementById("sulandraProtectedFrame");
    notice = document.getElementById("sulandraProtectedNotice");
    shellMounted = true;
    setStoredRoute(safe, portal);
    updateShellHistory(safe, portal);
    frame.addEventListener("load", installChildNavigationBridge);
    frame.src = safe;
    return true;
  }

  function enter(route, options) {
    const portal = String(options?.portal || getPortal() || "").toUpperCase();
    const fallback = portal === "ADMIN" ? "/admin.html" : "/employee-portal.html";
    const safe = safeInternalRoute(route, fallback);
    return isCodebaseRoute(safe) ? mountShell(safe, { portal }) : leaveFullscreenShell(safe);
  }

  function restoreFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const portal = String(params.get("portal") || getPortal() || "").toUpperCase();
    const fallback = portal === "ADMIN" ? "/admin.html" : "/employee-portal.html";
    const route = safeInternalRoute(params.get("route") || getRoute(), fallback);

    // No generic/full-site fullscreen wrapper. S.P.I.R.E. has its own dedicated
    // fullscreen shell; all other Sulandra pages are opened directly.
    if (!isCodebaseRoute(route)) {
      clearStoredSession();
      window.location.replace(route);
      return true;
    }
    return mountShell(route, { portal });
  }

  function endSession(loginPath) {
    clearStoredSession();
    const target = LOGIN_PATHS.has(loginPath) ? loginPath : "/employee-login.html";
    const go = () => window.location.assign(target);
    if (fullscreenElement()) {
      exitFullscreen().finally(go);
      return;
    }
    go();
  }

  window.addEventListener("message", function (event) {
    if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
    if (!isCodebaseRoute(getRoute()) || !event.data) return;
    if (event.data.type === "SULANDRA_SESSION_FULLSCREEN_REQUEST") {
      requestFullscreenFromGesture().catch(() => {});
    } else if (event.data.type === "SULANDRA_SESSION_FULLSCREEN_TOGGLE") {
      toggleFullscreenFromGesture().catch(() => {});
    }
  });

  for (const eventName of ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]) {
    document.addEventListener(eventName, syncFullscreenToCodebase, false);
  }

  window.SulandraProtectedSession = {
    version: VERSION,
    armFromGesture: requestFullscreenFromGesture,
    requestFullscreenFromGesture,
    toggleFullscreenFromGesture,
    enter,
    navigate,
    restoreFromLocation,
    endSession,
    isActive: () => shellMounted || (() => { try { return sessionStorage.getItem(ACTIVE_KEY) === "1"; } catch { return false; } })(),
    isFullscreen: () => Boolean(fullscreenElement())
  };

  if (document.documentElement.hasAttribute("data-sulandra-session-shell")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", restoreFromLocation, { once: true });
    else restoreFromLocation();
  }
})();
