(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const GUARD_STYLE_ID = 'adminSpire11DashboardGuardStyle';

  const ensureSpire11GuardStyle = () => {
    if (document.getElementById(GUARD_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = GUARD_STYLE_ID;
    style.textContent = '#module-dashboard #adminSpire11Launchpad{display:none!important}';
    (document.head || document.documentElement).appendChild(style);
  };

  const removeLegacySpire11Launchpad = () => {
    document.getElementById('adminSpire11Launchpad')?.remove();

    // Defensive cleanup for a previously cached SPIRE 1.1 dashboard injector.
    // Keep the launch button in the Command Center; only remove the large
    // dashboard card section. SPIRE Administration remains the tool launchpad.
    document.querySelectorAll('#module-dashboard section').forEach((section) => {
      const heading = String(section.querySelector('h1,h2,h3')?.textContent || '').trim();
      const text = String(section.textContent || '');
      if (/^Ohio Regulatory\s*&\s*Revenue Tools$/i.test(heading) && /SPIRE\s*1\.1/i.test(text)) {
        section.remove();
      }
    });
  };

  const clean = () => {
    ensureSpire11GuardStyle();
    removeLegacySpire11Launchpad();
    document.getElementById('sulandraOwnerConsoleButton')?.remove();
    document.getElementById('sulandraOwnerConsole')?.remove();
    document.querySelectorAll('.dashboard-page-dots').forEach((node) => node.remove());
    document.querySelectorAll('.dashboard-slide-head .badge').forEach((node) => {
      const text = String(node.textContent || '').trim();
      if (/^[123]\s*\/\s*3$/.test(text)) node.remove();
    });
    document.querySelectorAll('body *').forEach((node) => {
      if (node.children.length) return;
      const text = String(node.textContent || '').trim();
      if (/^[123]\s*\/\s*3$/.test(text)) node.remove();
      if (/^Enterprise Owner$/i.test(text) && (node.closest('#sulandraOwnerConsoleButton,#sulandraOwnerConsole') || node.style.position === 'fixed')) node.remove();
    });
  };

  clean();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      clean();
    });
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
