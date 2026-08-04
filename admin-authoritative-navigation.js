(function () {
  "use strict";

  const SERVICE_KEY = "sulandra:admin:active-service";
  const LABELS = { community: "Community Living", homehealth: "Home Health Care", nemt: "Transportation" };

  function router() { return window.SulandraDepartmentRouter || null; }
  function host() { return document.getElementById("adminInternalWorkspace"); }
  function usableWorkspace() {
    const node = host();
    return Boolean(node && node.querySelector(".sos-service-shell,.sos-mounted-module,.sos-record-state,[data-department-code],.os-managed-window,.dx-window"));
  }
  function normalizeTopNavigation() {
    const nav = document.getElementById("topModuleNav");
    if (!nav) return;
    const seen = new Set();
    Array.from(nav.children).forEach(function (item) {
      const control = item.querySelector("a,button");
      const text = (control?.textContent || "").trim().replace(/\s+/g, " ").toLowerCase();
      if (!text) return;
      if (seen.has(text)) item.remove(); else seen.add(text);
    });
  }
  function markActive(key) {
    document.querySelectorAll("[data-service-nav]").forEach(function (button) {
      const active = button.dataset.serviceNav === key;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }
  function fallbackRender(key) {
    const workspace = host();
    if (!workspace) return;
    const label = LABELS[key] || LABELS.community;
    workspace.hidden = false;
    workspace.innerHTML = `<section class="sos-service-shell" data-department-code="${key === "homehealth" ? "HOME_HEALTH" : key === "nemt" ? "NEMT" : "COMMUNITY_LIVING"}"><div class="sos-breadcrumb">Department: ${label}</div><header class="sos-head"><div class="sos-kicker">Department operating environment</div><h1>${label}</h1><p>The department workspace is ready. Select a department tool to continue.</p><button type="button" class="sos-back" onclick="location.reload()">Reload workspace</button></header></section>`;
  }
  function renderDepartment(key) {
    if (!LABELS[key]) key = "community";
    localStorage.setItem(SERVICE_KEY, key);
    markActive(key);
    const activeRouter = router();
    if (activeRouter && typeof activeRouter.renderDepartment === "function") activeRouter.renderDepartment(key);
    else fallbackRender(key);
  }
  function stabilizeDepartment(key) {
    renderDepartment(key);
    [80, 260, 700].forEach(function (delay) {
      setTimeout(function () {
        normalizeTopNavigation();
        markActive(key);
        if (!usableWorkspace()) renderDepartment(key);
      }, delay);
    });
  }
  function init() {
    normalizeTopNavigation();
    document.addEventListener("click", function (event) {
      const service = event.target.closest("[data-service-nav]");
      if (!service) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stabilizeDepartment(service.dataset.serviceNav || "community");
    }, true);
    window.addEventListener("sulandra:department-context-changed", function (event) {
      const key = event.detail?.key || localStorage.getItem(SERVICE_KEY) || "community";
      markActive(key);
      setTimeout(function () { if (!usableWorkspace()) renderDepartment(key); }, 180);
    });
    const key = localStorage.getItem(SERVICE_KEY) || "community";
    markActive(key);
    if (!usableWorkspace()) stabilizeDepartment(key);
    document.documentElement.dataset.authoritativeAdminNavigation = "true";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 0); }, { once: true });
  else setTimeout(init, 0);
})();