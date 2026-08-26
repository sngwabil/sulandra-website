(() => {
  'use strict';
  if (!/\/employee-portal\.html$/i.test(location.pathname)) return;

  const protectedRoutes = new Map([
    ['employeeSchedulingLauncher', '/scheduling.html'],
    ['employeeSchedulingNav', '/scheduling.html'],
    ['employeeWorkforceLauncher', '/workforce.html'],
    ['employeeWorkforceNav', '/workforce.html'],
  ]);

  // Cross-workspace navigation is explicit authentication, not an implicit
  // privilege switch. Keep Employee Portal alive in this tab and open Admin
  // sign-in in an independent tab/session.
  const adminControl = document.getElementById('employeeAdminReturn');
  if (adminControl) {
    adminControl.href = '/admin-login.html?returnTo=/admin.html';
    adminControl.target = '_blank';
    adminControl.rel = 'noopener noreferrer';
    adminControl.textContent = 'Admin Sign In ↗';
  }

  window.addEventListener('click', event => {
    const control = event.target?.closest?.('#employeeSchedulingLauncher,#employeeSchedulingNav,#employeeWorkforceLauncher,#employeeWorkforceNav');
    if (!control) return;
    const target = protectedRoutes.get(control.id);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(target);
  }, true);

  window.SulandraEmployeeRoleNavigationGuard = Object.freeze({
    scheduling: '/scheduling.html',
    workforce: '/workforce.html',
    adminLogin: '/admin-login.html',
    crossWorkspaceNewTab: true,
    contract: '20260825-portal-separation-1',
  });
})();
