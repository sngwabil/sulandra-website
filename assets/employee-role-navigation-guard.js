(() => {
  'use strict';
  if (!/\/employee-portal\.html$/i.test(location.pathname)) return;

  const protectedRoutes = new Map([
    ['employeeSchedulingLauncher', '/scheduling.html'],
    ['employeeSchedulingNav', '/scheduling.html'],
    ['employeeWorkforceLauncher', '/workforce.html'],
    ['employeeWorkforceNav', '/workforce.html'],
  ]);
  const managementAdminRoles = new Set(['ADMINISTRATOR', 'PROGRAM_MANAGER', 'HR_MANAGER', 'CEO', 'DOO']);

  // Cross-workspace navigation is explicit authentication, not an implicit
  // privilege switch. Keep Employee Portal alive in this tab and open Admin
  // sign-in in an independent tab/session.
  const adminControl = document.getElementById('employeeAdminReturn');
  if (adminControl) {
    adminControl.href = '/admin-login.html?returnTo=/admin.html';
    adminControl.target = '_blank';
    adminControl.rel = 'noopener noreferrer';
    adminControl.textContent = 'Admin Sign In ↗';
    try {
      const session = JSON.parse(window.sessionStorage.getItem('sulandra:employee:session') || 'null');
      const role = String(session?.role || '').toUpperCase();
      if (managementAdminRoles.has(role)) {
        adminControl.hidden = false;
        adminControl.setAttribute('aria-hidden', 'false');
      }
    } catch {}
  }

  // Never leave the whole employee desktop looking frozen because one optional
  // directory/work-queue request is slow. Identity/auth remains authoritative;
  // optional live panels degrade to an actionable message after eight seconds.
  const loadingWatchdog = window.setTimeout(() => {
    const replacements = [
      ['employeeWorkCompany', 'Selected company'],
      ['employeeDirectoryStatus', 'Directory is taking longer than expected. You can continue using the portal while it retries.'],
    ];
    for (const [id, fallback] of replacements) {
      const node = document.getElementById(id);
      if (node && /loading/i.test(node.textContent || '')) node.textContent = fallback;
    }
    const workStatus = document.getElementById('employeeWorkStatus');
    if (workStatus && /loading/i.test(workStatus.textContent || '')) {
      workStatus.firstChild.textContent = 'Live work counts are taking longer than expected. My Work and Notifications remain available.';
    }
    for (const id of ['employeeMyWorkCountText','employeeNotificationCountText','employeeUrgentCountText']) {
      const node = document.getElementById(id);
      if (node && /loading|—/.test(node.textContent || '')) node.textContent = '0';
    }
    document.body.dataset.employeePortalWatchdog = 'settled';
  }, 8000);

  window.addEventListener('beforeunload', () => window.clearTimeout(loadingWatchdog), { once: true });

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
    adminRoles: [...managementAdminRoles],
    crossWorkspaceNewTab: true,
    loadingWatchdogMs: 8000,
    contract: '20260825-portal-separation-3',
  });
})();