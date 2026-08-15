(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  function installSideLink() {
    const side = document.getElementById('sideModuleNav');
    if (!side || document.getElementById('adminRoleWorkspacesLink')) return;
    const button = document.createElement('button');
    button.id = 'adminRoleWorkspacesLink';
    button.className = 'side-btn admin-nav-route';
    button.type = 'button';
    button.dataset.sulandraRoute = '/role-workspaces.html';
    button.innerHTML = 'Role Workspaces <small>Role Views</small>';
    const settings = side.querySelector('[data-module="settings"]');
    if (settings) side.insertBefore(button, settings);
    else side.appendChild(button);
  }

  function installRightLink() {
    const panel = document.getElementById('rightOperationsPanel');
    if (!panel || panel.querySelector('[data-role-workspaces-link]')) return;
    const link = document.createElement('a');
    link.className = 'quick-action';
    link.href = '/role-workspaces.html';
    link.dataset.roleWorkspacesLink = 'true';
    link.innerHTML = 'Role Workspaces<small>Preview every employee and leadership role workspace</small>';
    panel.appendChild(link);
  }

  function install() {
    installSideLink();
    installRightLink();
  }

  install();
  const observer = new MutationObserver(() => install());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', install);
  window.setTimeout(install, 100);
  window.setTimeout(install, 600);
  window.SulandraAdminRoleWorkspaces = Object.freeze({ route: '/role-workspaces.html', ownerOnlyDirectory: true });
})();
