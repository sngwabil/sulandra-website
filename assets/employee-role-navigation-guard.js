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

  function installSchedulingStyleTaskbar() {
    const header = document.querySelector('.workspace-header');
    const brandRow = header?.querySelector('.workspace-brand-row');
    if (!header || !brandRow) return;

    if (!document.getElementById('employeePortalSchedulingHeaderStyle')) {
      const style = document.createElement('style');
      style.id = 'employeePortalSchedulingHeaderStyle';
      style.textContent = `
        .employee-platform-bar{background:#083a67;color:#fff;border-bottom:4px solid #d4a72c;display:flex;gap:10px;align-items:center;padding:10px 24px;overflow:auto;box-shadow:0 5px 14px rgba(8,58,103,.10)}
        .employee-platform-bar strong{font-size:18px;margin-right:auto;white-space:nowrap}
        .employee-platform-bar a{color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.32);padding:8px 13px;border-radius:999px;font-weight:850;font-size:12px;white-space:nowrap;transition:.16s ease}
        .employee-platform-bar a:hover,.employee-platform-bar a[aria-current="page"]{background:#fff;color:#083a67;border-color:#fff}
        .workspace-header .workspace-brand-row{min-height:78px!important;padding:8px 24px!important;gap:18px!important}
        .workspace-header .workspace-logo{width:194px!important;flex:0 0 194px!important;height:58px!important;overflow:hidden!important;display:flex!important;align-items:center!important}
        .workspace-header .workspace-logo img{width:180px!important;height:58px!important;max-width:none!important;object-fit:contain!important;object-position:left center!important;transform:scale(3.25)!important;transform-origin:left center!important}
        .workspace-header .workspace-title h1{font-size:28px!important;letter-spacing:-.02em!important;color:#0b4f86!important}
        .workspace-header .workspace-title p{display:none!important}
        .workspace-header .header-tools{gap:8px!important}
        .workspace-header .header-action{border-radius:999px!important;padding:9px 13px!important}
        @media(max-width:900px){.employee-platform-bar{padding-left:14px;padding-right:14px}.workspace-header .workspace-brand-row{padding-left:14px!important;padding-right:14px!important}.workspace-header .workspace-logo{width:155px!important;flex-basis:155px!important;height:50px!important}.workspace-header .workspace-logo img{width:150px!important;height:50px!important;transform:scale(3.05)!important}.workspace-header .workspace-title h1{font-size:23px!important}}
        @media(max-width:680px){.workspace-header .workspace-brand-row{flex-wrap:wrap!important;min-height:70px!important}.workspace-header .workspace-title{min-width:160px!important}.workspace-header .header-tools{width:100%!important;margin-left:0!important;justify-content:flex-start!important;padding-bottom:5px}.employee-platform-bar strong{font-size:16px}}
      `;
      document.head.appendChild(style);
    }

    const subtitle = brandRow.querySelector('.workspace-title p');
    if (subtitle) subtitle.remove();

    if (!document.getElementById('employeePlatformBar')) {
      const platform = document.createElement('nav');
      platform.id = 'employeePlatformBar';
      platform.className = 'employee-platform-bar';
      platform.setAttribute('aria-label', 'Sulandra Health platform');
      platform.innerHTML = `
        <strong>Sulandra Health Platform</strong>
        <a href="/intranet.html">Intranet Portal</a>
        <a href="/employee-portal.html" aria-current="page">Employee Portal</a>
        <a href="/my-work.html">My Work</a>
        <a href="/education-portal.html">Education Portal</a>
        <a href="/spire.html">Spire Clinical</a>
        <a href="/support.html">Support</a>
      `;
      header.insertBefore(platform, brandRow);
    }
  }

  installSchedulingStyleTaskbar();

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
    schedulingStyleTaskbar: true,
    schedulingStyleContract: '20260826-scheduling-header-1',
    loadingWatchdogMs: 8000,
    contract: '20260825-portal-separation-3',
  });
})();