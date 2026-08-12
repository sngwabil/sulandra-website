(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const ensureNewSpirePreview = () => {
    const dashboard = document.getElementById('module-dashboard');
    if (!dashboard || document.getElementById('newSpirePreviewButton')) return;
    const host = document.createElement('section');
    host.id = 'newSpirePreviewCard';
    host.setAttribute('aria-label', 'New S.P.I.R.E. development preview');
    host.style.cssText = 'margin:16px 0;padding:18px;border:1px solid #b9d6e6;border-radius:16px;background:linear-gradient(135deg,#f7fbfe,#eef8f5);box-shadow:0 10px 28px rgba(14,75,112,.09);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap';
    host.innerHTML = '<div><div style="font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#0a789f">Development Preview</div><strong style="display:block;color:#064d79;font-size:20px;margin:3px 0">New S.P.I.R.E.</strong><span style="color:#61788a;font-size:13px">Open the replacement care workstation and monitor the build without changing the current live S.P.I.R.E.</span></div><a id="newSpirePreviewButton" href="/new-spire.html" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:11px 18px;border-radius:10px;background:#075f91;color:#fff;text-decoration:none;font-weight:900;box-shadow:0 7px 18px rgba(7,95,145,.18)">Open New Spire</a>';
    const firstDashboardContent = dashboard.querySelector('.admin-command-hero') || dashboard.firstElementChild;
    if (firstDashboardContent?.nextSibling) dashboard.insertBefore(host, firstDashboardContent.nextSibling);
    else dashboard.appendChild(host);
  };

  const clean = () => {
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
    ensureNewSpirePreview();
  };
  clean();
  let queued=false;
  new MutationObserver(()=>{
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;clean()});
  }).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
