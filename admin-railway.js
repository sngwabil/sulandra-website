(function () {
  "use strict";

  const CORE_SCRIPT = "https://cdn.jsdelivr.net/gh/sngwabil/sulandra-website@27e9241555ed630bf95c892141d5cce50b975755/admin-railway.js";
  const SCRIPTS = [
    ["/interview-admin-scheduler.js?v=20260804-2", "data-interview-admin-scheduler"],
    ["/admin-enterprise-command-center.js?v=20260804-2", "data-enterprise-command-center"],
    ["/admin-three-panel-layout.js?v=20260804-2", "data-admin-three-panel-layout"],
    ["/admin-three-panel-consolidation.js?v=20260804-2", "data-admin-three-panel-consolidation"],
    ["/admin-workspace-router.js?v=20260804-6", "data-admin-workspace-router"],
    ["/admin-new-service-workspace.js?v=20260804-2", "data-admin-new-service-workspace"],
    ["/admin-desktop-cloud-sync.js?v=20260804-5", "data-admin-desktop-cloud-sync"],
    ["/admin-desktop-experience.js?v=20260804-2", "data-admin-desktop-experience"],
    ["/admin-desktop-stability-fix.js?v=20260804-6", "data-admin-desktop-stability"],
    ["/admin-desktop-operating-system.js?v=20260804-3", "data-admin-desktop-operating-system"],
    ["/admin-live-module-window-bridge.js?v=20260804-2", "data-admin-live-module-window-bridge"],
    ["/admin-record-empty-state.js?v=20260804-3", "data-admin-record-empty-state"],
    ["/admin-workspace-watchdog.js?v=20260804-2", "data-admin-workspace-watchdog"],
    ["/admin-authoritative-navigation.js?v=20260804-1", "data-admin-authoritative-navigation"]
  ];

  function installBootScreen() {
    document.documentElement.classList.add("sulandra-admin-booting");
    const style = document.createElement("style");
    style.id = "sulandraAdminFirstPaintStyle";
    style.textContent = `
      html.sulandra-admin-booting body > *:not(#sulandraAdminBootScreen) {
        visibility: hidden !important;
      }
      #sulandraAdminBootScreen {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 50% 34%, rgba(35,151,205,.16), transparent 34%),
          linear-gradient(145deg, #f6fbff 0%, #ffffff 52%, #eef6fb 100%);
        color: #12345a;
        font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      #sulandraAdminBootScreen .sab-card {
        width: min(440px, calc(100vw - 36px));
        padding: 34px;
        border: 1px solid #d7e5ef;
        border-radius: 24px;
        background: rgba(255,255,255,.94);
        box-shadow: 0 24px 80px rgba(15,49,84,.17);
        text-align: center;
      }
      #sulandraAdminBootScreen img { width: min(260px, 75%); height: auto; }
      #sulandraAdminBootScreen h1 { margin: 18px 0 7px; font-size: 24px; color: #12345a; }
      #sulandraAdminBootScreen p { margin: 0; color: #61758a; line-height: 1.55; }
      #sulandraAdminBootScreen .sab-progress {
        height: 6px;
        margin-top: 24px;
        overflow: hidden;
        border-radius: 999px;
        background: #e4eef5;
      }
      #sulandraAdminBootScreen .sab-progress::after {
        content: "";
        display: block;
        width: 42%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #075b9c, #29a8d8);
        animation: sab-load 1.1s ease-in-out infinite alternate;
      }
      #sulandraAdminBootScreen button {
        margin-top: 22px;
        border: 0;
        border-radius: 12px;
        padding: 11px 18px;
        background: #075b9c;
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      }
      @keyframes sab-load { from { transform: translateX(-10%); } to { transform: translateX(150%); } }
    `;
    document.head.appendChild(style);

    const screen = document.createElement("div");
    screen.id = "sulandraAdminBootScreen";
    screen.innerHTML = `
      <section class="sab-card" role="status" aria-live="polite">
        <img src="/assets/mainlogo.png" alt="Sulandra Health">
        <h1>Opening your administration desktop</h1>
        <p id="sulandraAdminBootMessage">Loading your departments, workspace, live activity and saved preferences.</p>
        <div class="sab-progress" aria-hidden="true"></div>
      </section>`;
    document.body.appendChild(screen);
  }

  function setBootMessage(message, failed) {
    const node = document.getElementById("sulandraAdminBootMessage");
    if (node) node.textContent = message;
    const card = document.querySelector("#sulandraAdminBootScreen .sab-card");
    if (failed && card && !card.querySelector("button")) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Retry loading portal";
      button.onclick = function () { location.reload(); };
      card.appendChild(button);
    }
  }

  function revealPortal() {
    document.documentElement.classList.remove("sulandra-admin-booting");
    document.getElementById("sulandraAdminBootScreen")?.remove();
    document.getElementById("sulandraAdminFirstPaintStyle")?.remove();
    document.documentElement.dataset.adminDesktopReady = "true";
  }

  function workspaceReady() {
    const host = document.getElementById("adminInternalWorkspace");
    if (!host) return false;
    const visible = host.querySelector(
      ".sos-service-shell, .sos-mounted-module, .sos-record-state, [data-department-code], .dx-window, .os-managed-window"
    );
    return Boolean(visible && visible.getClientRects().length);
  }

  function waitForDesktop() {
    const started = Date.now();
    const timer = window.setInterval(function () {
      if (workspaceReady()) {
        clearInterval(timer);
        requestAnimationFrame(function () { requestAnimationFrame(revealPortal); });
        return;
      }
      if (Date.now() - started > 16000) {
        clearInterval(timer);
        setBootMessage("The modern administration desktop did not finish loading. No data was changed.", true);
      }
    }, 120);
  }

  function loadScript(src, marker) {
    return new Promise(function (resolve) {
      if (document.querySelector(`script[${marker}]`)) { resolve(); return; }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.setAttribute(marker, "true");
      script.onload = function () { resolve(); };
      script.onerror = function () {
        console.error("Admin enhancement failed to load:", src);
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  async function start() {
    installBootScreen();
    waitForDesktop();
    setBootMessage("Connecting to the Sulandra administration system…");
    await loadScript(CORE_SCRIPT, "data-sulandra-core-admin");

    for (const [src, marker] of SCRIPTS) {
      setBootMessage("Preparing your saved administration workspace…");
      await loadScript(src, marker);
      if (marker === "data-admin-desktop-cloud-sync") {
        try { await Promise.resolve(window.SulandraDesktopCloud?.ready); }
        catch (error) { console.warn("Desktop profile sync unavailable; continuing with cached preferences.", error); }
      }
    }

    window.dispatchEvent(new Event("sulandra:admin-enhancements-loaded"));
  }

  start().catch(function (error) {
    console.error("The Sulandra admin desktop could not initialize.", error);
    setBootMessage("The administration desktop could not be initialized. No data was changed.", true);
  });
})();