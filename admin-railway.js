(function () {
  "use strict";

  const CORE_SCRIPT = "https://cdn.jsdelivr.net/gh/sngwabil/sulandra-website@e198497d5e40d45bca529059560ee3aa71b59a40/admin-railway.js";

  function addAdminPortalLinks() {
    const topNav = document.getElementById("topModuleNav");
    if (topNav && !document.getElementById("adminEmployeePortalTopLink")) {
      const employeeItem = document.createElement("li");
      const employeeLink = document.createElement("a");
      employeeLink.id = "adminEmployeePortalTopLink";
      employeeLink.href = "employee-portal.html?stay=1&source=admin";
      employeeLink.textContent = "Employee Portal";
      employeeLink.title = "Open the employee experience using your current administrator identity";
      employeeItem.appendChild(employeeLink);

      const intranetItem = document.createElement("li");
      const intranetLink = document.createElement("a");
      intranetLink.id = "adminIntranetTopLink";
      intranetLink.href = "intranet.html";
      intranetLink.textContent = "Sulandra Intranet";
      intranetLink.title = "Open the Sulandra Enterprise Intranet Portal";
      intranetItem.appendChild(intranetLink);

      const onboardingItem = Array.from(topNav.children).find((item) =>
        item.querySelector('a[data-module="onboarding"]')
      );
      topNav.insertBefore(employeeItem, onboardingItem || null);
      topNav.insertBefore(intranetItem, onboardingItem || null);
    }

    const sideNav = document.getElementById("sideModuleNav");
    if (sideNav && !document.getElementById("adminEmployeePortalSideLink")) {
      const employeeButton = document.createElement("button");
      employeeButton.id = "adminEmployeePortalSideLink";
      employeeButton.className = "side-btn";
      employeeButton.type = "button";
      employeeButton.innerHTML = "Employee Portal <small>Admin Access</small>";
      employeeButton.addEventListener("click", () => {
        window.location.href = "employee-portal.html?stay=1&source=admin";
      });

      const intranetButton = document.createElement("button");
      intranetButton.id = "adminIntranetSideLink";
      intranetButton.className = "side-btn";
      intranetButton.type = "button";
      intranetButton.innerHTML = "Sulandra Intranet <small>Enterprise Hub</small>";
      intranetButton.addEventListener("click", () => {
        window.location.href = "intranet.html";
      });

      const onboardingButton = sideNav.querySelector('[data-module="onboarding"]');
      sideNav.insertBefore(employeeButton, onboardingButton || null);
      sideNav.insertBefore(intranetButton, onboardingButton || null);
    }
  }

  function loadCoreAdminApplication() {
    const script = document.createElement("script");
    script.src = CORE_SCRIPT;
    script.async = false;
    script.onload = addAdminPortalLinks;
    script.onerror = function () {
      console.error("The core Sulandra admin controller could not be loaded.");
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