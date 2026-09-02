/* SULANDRA_PROTECTED_SESSION_V1
 * Keeps authenticated Sulandra navigation inside one top-level browser document
 * so a user-initiated Fullscreen API session is not destroyed by page changes.
 */
(function () {
  "use strict";

  const VERSION = "20260902-protected-session-1";
  const ACTIVE_KEY = "sulandra:protected-session:active";
  const INTENT_KEY = "sulandra:protected-session:fullscreen-intent";
  const ROUTE_KEY = "sulandra:protected-session:route";
  const PORTAL_KEY = "sulandra:protected-session:portal";
  const SHELL_PATH = "/sulandra-session.html";
  const LOGIN_PATHS = new Set(["/employee-login.html", "/admin-login.html"]);
  let frame = null;
  let resumeButton = null;
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

  function fullscreenSupported() {
    return Boolean(fullscreenRequestMethod(document.documentElement));
  }

  function requestFullscreenFromGesture() {
    try { sessionStorage.setItem(INTENT_KEY, "1"); } catch {}
    if (fullscreenElement()) return Promise.resolve(true);
    const element = document.documentElement;
    const request = fullscreenRequestMethod(element);
    if (!request) return Promise.resolve(false);
    try {
      const result = request === element.requestFullscreen
        ? request.call(element, { navigationUI: "hide" })
        : request.call(element);
      return Promise.resolve(result).then(() => true).catch(() => false);
    } catch {
      try {
        const fallback = request.call(element);
        return Promise.resolve(fallback).then(() => true).catch(() => false);
      } catch {
        return Promise.resolve(false);
      }
    }
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

  function routeUrl(route, portal) {
    const params = new URLSearchParams();
    params.set("route", route);
    if (portal) params.set("portal", portal);
    return SHELL_PATH + "?" + params.toString();
  }

  function setStoredRoute(route, portal) {
    try {
      sessionStorage.setItem(ACTIVE_KEY, "1");
      sessionStorage.setItem(ROUTE_KEY, route);
      if (portal) sessionStorage.setItem(PORTAL_KEY, portal);
    } catch {}
  }

  function isInternalUrl(value) {
    try { return new URL(value, window.location.origin).origin === window.location.origin; }
    catch { return false; }
  }

  function showNotice(text) {
    if (!notice) return;
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => { if (notice) notice.hidden = true; }, 5000);
  }

  function updateFullscreenUi() {
    if (!resumeButton) return;
    const active = Boolean(fullscreenElement());
    resumeButton.hidden = active;
    resumeButton.textContent = fullscreenSupported() ? "Resume Full Screen" : "Browser Full Screen Unavailable";
    resumeButton.disabled = !fullscreenSupported();
  }

  function updateShellHistory(route, portal) {
    try {
      const next = routeUrl(route, portal);
      if (window.location.pathname !== SHELL_PATH || window.location.search !== new URL(next, window.location.origin).search) {
        window.history.replaceState({ sulandraProtectedSession: VERSION, route, portal }, "", next);
      }
    } catch {}
  }

  function navigate(route, options) {
    if (!frame) return false;
    const portal = String(options?.portal || getPortal() || "").toUpperCase();
    const safe = safeInternalRoute(route, getRoute());
    setStoredRoute(safe, portal);
    updateShellHistory(safe, portal);
    frame.src = safe;
    return true;
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
    try {
      childRoute = safeInternalRoute(childWindow.location.href, childRoute);
      setStoredRoute(childRoute, getPortal());
      updateShellHistory(childRoute, getPortal());
    } catch {}

    if (childDocument.documentElement?.dataset.sulandraProtectedSessionBridged === VERSION) return;
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
        showNotice("External browsing is unavailable inside the protected Sulandra session.");
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
          showNotice("External browsing is unavailable inside the protected Sulandra session.");
          return null;
        }
        navigate(resolved.pathname + resolved.search + resolved.hash);
        return childWindow;
      };
      childWindow.SulandraProtectedSession = Object.freeze({
        active: true,
        version: VERSION,
        navigate: (route) => navigate(route),
        requestFullscreenFromGesture
      });
    } catch {}
  }

  function shellMarkup() {
    return `
      <div id="sulandraProtectedSession" data-version="${VERSION}" style="position:fixed;inset:0;z-index:2147483000;background:#061826;overflow:hidden;">
        <iframe id="sulandraProtectedFrame" title="Sulandra protected workspace" style="display:block;width:100%;height:100%;border:0;background:#fff" sandbox="allow-forms allow-scripts allow-same-origin allow-downloads allow-modals allow-pointer-lock allow-presentation" allow="camera; microphone; geolocation; clipboard-read; clipboard-write"></iframe>
        <button id="sulandraResumeFullscreen" type="button" style="position:fixed;right:16px;top:16px;z-index:2147483646;border:1px solid #87b8d5;border-radius:10px;padding:10px 14px;background:#083a67;color:#fff;font:700 13px Inter,Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.24);cursor:pointer" hidden>Resume Full Screen</button>
        <div id="sulandraProtectedNotice" role="status" aria-live="polite" style="position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;max-width:min(620px,calc(100vw - 32px));padding:10px 14px;border-radius:10px;background:#102f43;color:#fff;border:1px solid #35657e;font:700 12px/1.45 Inter,Segoe UI,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)" hidden></div>
      </div>`;
  }

  function mountShell(route, options) {
    const portal = String(options?.portal || getPortal() || "").toUpperCase();
    const safe = safeInternalRoute(route, portal === "ADMIN" ? "/admin.html" : "/employee-portal.html");
    document.documentElement.style.width = "100%";
    document.documentElement.style.height = "100%";
    document.body.style.margin = "0";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    document.body.style.overflow = "hidden";
    document.body.innerHTML = shellMarkup();
    frame = document.getElementById("sulandraProtectedFrame");
    resumeButton = document.getElementById("sulandraResumeFullscreen");
    notice = document.getElementById("sulandraProtectedNotice");
    shellMounted = true;
    setStoredRoute(safe, portal);
    updateShellHistory(safe, portal);
    frame.addEventListener("load", installChildNavigationBridge);
    frame.src = safe;
    resumeButton.addEventListener("click", requestFullscreenFromGesture);
    updateFullscreenUi();
    return true;
  }

  function enter(route, options) {
    return mountShell(route, options || {});
  }

  function restoreFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const portal = String(params.get("portal") || getPortal() || "").toUpperCase();
    const fallback = portal === "ADMIN" ? "/admin.html" : "/employee-portal.html";
    const route = safeInternalRoute(params.get("route") || getRoute(), fallback);
    return mountShell(route, { portal });
  }

  function endSession(loginPath) {
    try {
      sessionStorage.removeItem(ACTIVE_KEY);
      sessionStorage.removeItem(INTENT_KEY);
      sessionStorage.removeItem(ROUTE_KEY);
      sessionStorage.removeItem(PORTAL_KEY);
    } catch {}
    const target = LOGIN_PATHS.has(loginPath) ? loginPath : "/employee-login.html";
    const exit = fullscreenExitMethod();
    if (fullscreenElement() && exit) {
      try { Promise.resolve(exit.call(document)).finally(() => window.location.assign(target)); return; } catch {}
    }
    window.location.assign(target);
  }

  for (const eventName of ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]) {
    document.addEventListener(eventName, updateFullscreenUi, false);
  }

  window.SulandraProtectedSession = {
    version: VERSION,
    armFromGesture: requestFullscreenFromGesture,
    requestFullscreenFromGesture,
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
