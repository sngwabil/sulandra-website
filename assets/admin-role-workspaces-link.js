(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const ROUTE = '/role-workspaces.html';

  function installTopLink() {
    const top = document.getElementById('topModuleNav');
    if (!top || top.querySelector(`[data-sulandra-route="${ROUTE}"], a[href="${ROUTE}"]`)) return;
    const item = document.createElement('li');
    item.id = 'adminRoleWorkspacesTopItem';
    const link = document.createElement('a');
    link.id = 'adminRoleWorkspacesTopLink';
    link.className = 'admin-nav-route sulandra-workspace-link';
    link.href = ROUTE;
    link.dataset.sulandraRoute = ROUTE;
    link.textContent = 'Role Workspaces';
    item.appendChild(link);
    const settings = top.querySelector('[data-module="settings"]')?.closest('li');
    if (settings) top.insertBefore(item, settings);
    else top.appendChild(item);
  }

  function installSideLink() {
    const side = document.getElementById('sideModuleNav');
    if (!side || side.querySelector(`[data-sulandra-route="${ROUTE}"]`)) return;
    const button = document.createElement('button');
    button.id = 'adminRoleWorkspacesLink';
    button.className = 'side-btn admin-nav-route';
    button.type = 'button';
    button.dataset.sulandraRoute = ROUTE;
    button.innerHTML = 'Role Workspaces <small>Preview Role HTML</small>';
    const settings = side.querySelector('[data-module="settings"]');
    if (settings) side.insertBefore(button, settings);
    else side.appendChild(button);
  }

  function installRightLink() {
    const panel = document.getElementById('rightOperationsPanel');
    if (!panel || panel.querySelector(`[data-role-workspaces-link], a[href="${ROUTE}"]`)) return;
    const link = document.createElement('a');
    link.className = 'quick-action';
    link.href = ROUTE;
    link.dataset.roleWorkspacesLink = 'true';
    link.innerHTML = 'Role Workspaces<small>Open every employee and leadership role HTML workspace</small>';
    panel.appendChild(link);
  }

  function install() {
    installTopLink();
    installSideLink();
    installRightLink();
  }

  install();
  const observer = new MutationObserver(() => install());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', install);
  window.setTimeout(install, 100);
  window.setTimeout(install, 600);
  window.SulandraAdminRoleWorkspaces = Object.freeze({ route: ROUTE, ownerOnlyDirectory: true, topMenuTab: true });
})();
