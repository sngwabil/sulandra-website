(function () {
  "use strict";

  const CORE_SCRIPT = "https://cdn.jsdelivr.net/gh/sngwabil/sulandra-website@27e9241555ed630bf95c892141d5cce50b975755/admin-railway.js";
  const INTERVIEW_SCRIPT = "/interview-admin-scheduler.js?v=20260804-1";
  const ENTERPRISE_SCRIPT = "/admin-enterprise-command-center.js?v=20260804-1";
  const THREE_PANEL_SCRIPT = "/admin-three-panel-layout.js?v=20260804-1";
  const PANEL_CONSOLIDATION_SCRIPT = "/admin-three-panel-consolidation.js?v=20260804-1";
  const WORKSPACE_ROUTER_SCRIPT = "/admin-workspace-router.js?v=20260804-1";

  function makeTopLink(id, href, text, title) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.id = id;
    link.href = href;
    link.textContent = text;
    link.title = title;
    item.appendChild(link);
    return item;
  }

  function makeSideButton(id, label, detail, href) {
    const button = document.createElement("button");
    button.id = id;
    button.className = "side-btn";
    button.type = "button";
    button.innerHTML = `${label} <small>${detail}</small>`;
    button.addEventListener("click", () => {
      window.location.href = href;
    });
    return button;
  }

  function addSettingsControlCards() {
    const settingsModule = document.getElementById("module-settings");
    if (!settingsModule || document.getElementById("intranetSettingsControlCard")) return;

    const wrap = document.createElement("div");
    wrap.id = "intranetSettingsControlCard";
    wrap.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:20px;";

    wrap.innerHTML = `
      <a href="intranet-control.html" style="display:block;text-decoration:none;background:linear-gradient(135deg,#0f172a,#075985);color:#fff;border-radius:14px;padding:20px;box-shadow:0 8px 24px rgba(15,23,42,.16);">
        <div style="font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd;">Intranet Publishing</div>
        <h2 style="margin:7px 0 5px;color:#fff;font-size:20px;">Content Control Center</h2>
        <p style="margin:0;color:#dbeafe;font-size:13px;line-height:1.5;">Create, schedule, upload and manage intranet announcements, images, videos, animations, cards, banners and timed slideshows.</p>
        <div style="margin-top:14px;font-weight:900;font-size:13px;">Open Control Center →</div>
      </a>
      <a href="education-portal.html" target="_blank" rel="noopener" style="display:block;text-decoration:none;background:linear-gradient(135deg,#064e3b,#0f766e);color:#fff;border-radius:14px;padding:20px;box-shadow:0 8px 24px rgba(15,118,110,.16);">
        <div style="font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#99f6e4;">Education</div>
        <h2 style="margin:7px 0 5px;color:#fff;font-size:20px;">Sulandra Learning Center</h2>
        <p style="margin:0;color:#ccfbf1;font-size:13px;line-height:1.5;">Open the production education portal using the current administrator profile and view approved curriculum and live employee records.</p>
        <div style="margin-top:14px;font-weight:900;font-size:13px;">Open Education Portal →</div>
      </a>`;

    settingsModule.appendChild(wrap);
  }

  function addAdminPortalLinks() {
    const topNav = document.getElementById("topModuleNav");
    if (topNav && !document.getElementById("adminEmployeePortalTopLink")) {
      const onboardingItem = Array.from(topNav.children).find((item) =>
        item.querySelector('a[data-module="onboarding"]')
      );
      const employee = makeTopLink("adminEmployeePortalTopLink", "employee-portal.html?stay=1&source=admin", "Employee Portal", "Open the employee experience using your current administrator identity");
      const intranet = makeTopLink("adminIntranetTopLink", "intranet.html", "Sulandra Intranet", "Open the Sulandra Enterprise Intranet Portal");
      employee.querySelector('a').target = "_blank";
      employee.querySelector('a').rel = "noopener";
      intranet.querySelector('a').target = "_blank";
      intranet.querySelector('a').rel = "noopener";
      topNav.insertBefore(employee, onboardingItem || null);
      topNav.insertBefore(intranet, onboardingItem || null);
    }

    const sideNav = document.getElementById("sideModuleNav");
    if (sideNav && !document.getElementById("adminEmployeePortalSideLink")) {
      const onboardingButton = sideNav.querySelector('[data-module="onboarding"]');
      sideNav.insertBefore(makeSideButton("adminEmployeePortalSideLink", "Employee Portal", "Admin Access", "employee-portal.html?stay=1&source=admin"), onboardingButton || null);
      sideNav.insertBefore(makeSideButton("adminIntranetSideLink", "Sulandra Intranet", "Enterprise Hub", "intranet.html"), onboardingButton || null);
    }

    if (sideNav && !document.getElementById("adminIntranetControlSideLink")) {
      const settingsButton = sideNav.querySelector('[data-module="settings"]');
      const controlButton = makeSideButton("adminIntranetControlSideLink", "Intranet Control", "Publishing", "intranet-control.html");
      sideNav.insertBefore(controlButton, settingsButton || null);
    }

    addSettingsControlCards();
  }

  function loadScriptOnce(src, marker, errorMessage, onload) {
    if (document.querySelector(`script[${marker}]`)) {
      if (onload) onload();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.setAttribute(marker, "true");
    if (onload) script.onload = onload;
    script.onerror = function () { console.error(errorMessage); };
    document.head.appendChild(script);
  }

  function loadEnhancements() {
    loadScriptOnce(INTERVIEW_SCRIPT, "data-interview-admin-scheduler", "The Sulandra interview scheduler could not be loaded.");
    loadScriptOnce(ENTERPRISE_SCRIPT, "data-enterprise-command-center", "The Sulandra enterprise command center could not be loaded.", function () {
      loadScriptOnce(THREE_PANEL_SCRIPT, "data-admin-three-panel-layout", "The Sulandra three-panel administration layout could not be loaded.", function () {
        loadScriptOnce(PANEL_CONSOLIDATION_SCRIPT, "data-admin-three-panel-consolidation", "The Sulandra panel consolidation repair could not be loaded.", function () {
          loadScriptOnce(WORKSPACE_ROUTER_SCRIPT, "data-admin-workspace-router", "The Sulandra unified workspace router could not be loaded.");
        });
      });
    });
  }

  function loadCoreAdminApplication() {
    const script = document.createElement("script");
    script.src = CORE_SCRIPT;
    script.async = false;
    script.onload = function () {
      loadEnhancements();
      addAdminPortalLinks();
      window.setTimeout(addAdminPortalLinks, 250);
    };
    script.onerror = function () {
      console.error("The core Sulandra admin controller could not be loaded.");
      loadEnhancements();
      addAdminPortalLinks();
    };
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addAdminPortalLinks, { once: true });
  } else {
    addAdminPortalLinks();
  }

  loadCoreAdminApplication();
})();