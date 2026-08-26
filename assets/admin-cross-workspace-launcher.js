(() => {
  'use strict';
  if (!/\/admin(?:-operations)?\.html$/i.test(location.pathname)) return;

  function mount() {
    const tools = document.querySelector('.header-tools');
    if (!tools || document.getElementById('adminEmployeePortalLauncher')) return;
    const link = document.createElement('a');
    link.id = 'adminEmployeePortalLauncher';
    link.className = 'btn-cta secondary hide-mobile';
    link.href = '/employee-login.html?returnTo=/employee-portal.html';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Employee Portal ↗';
    link.title = 'Open Employee Portal sign-in in a separate tab';
    const signOut = document.getElementById('btnAdminSignOut') || document.getElementById('signOutBtn');
    if (signOut?.parentElement === tools) tools.insertBefore(link, signOut);
    else tools.appendChild(link);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();

  window.SulandraAdminCrossWorkspace = Object.freeze({
    employeeLogin: '/employee-login.html?returnTo=/employee-portal.html',
    opensNewTab: true,
    contract: '20260825-portal-separation-1',
  });
})();
