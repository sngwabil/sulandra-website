(() => {
  'use strict';
  if (!/\/employee-portal\.html$/i.test(location.pathname)) return;

  const protectedRoutes = new Map([
    ['employeeSchedulingLauncher', '/scheduling.html'],
    ['employeeSchedulingNav', '/scheduling.html'],
    ['employeeWorkforceLauncher', '/workforce.html'],
    ['employeeWorkforceNav', '/workforce.html'],
  ]);

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
    contract: '20260810-role-uat-1',
  });
})();
