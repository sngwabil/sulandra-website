(() => {
  'use strict';

  const links = [
    ['Intranet Portal', '/intranet.html'],
    ['Employee Portal', '/employee-portal.html?stay=1'],
    ['Employee 360', '/employee360.html'],
    ['Education Portal', '/education-portal.html'],
    ['Time & Attendance', '/time-attendance.html#admin'],
    ['Spire EHR', '/spire.html'],
    ['Transportation', '/transportation.html'],
    ['Home Health Services', '/home-health.html'],
    ['Community Living Services', '/services/community-living.html'],
    ['Careers & Onboarding', '/admin.html#onboarding'],
  ];

  function addNavigation() {
    if (document.getElementById('restoredPlatformNavigation')) return;

    const bar = document.createElement('nav');
    bar.id = 'restoredPlatformNavigation';
    bar.setAttribute('aria-label', 'Sulandra platform navigation');
    bar.style.cssText = [
      'position:sticky',
      'top:0',
      'z-index:2000',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'overflow-x:auto',
      'padding:10px 16px',
      'background:#082f57',
      'border-bottom:3px solid #c99a2e',
      'box-shadow:0 6px 20px rgba(8,47,87,.18)',
      'font-family:Inter,Segoe UI,Arial,sans-serif',
    ].join(';');

    const brand = document.createElement('strong');
    brand.textContent = 'Sulandra Health Platform';
    brand.style.cssText = 'color:white;white-space:nowrap;margin-right:8px;font-size:14px;';
    bar.appendChild(brand);

    for (const [label, href] of links) {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      link.style.cssText = 'display:inline-flex;align-items:center;min-height:36px;padding:8px 12px;border:1px solid rgba(255,255,255,.24);border-radius:999px;color:white;background:rgba(255,255,255,.08);font-size:12px;font-weight:800;text-decoration:none;white-space:nowrap;';
      link.addEventListener('mouseenter', () => { link.style.background = 'rgba(255,255,255,.18)'; });
      link.addEventListener('mouseleave', () => { link.style.background = 'rgba(255,255,255,.08)'; });
      bar.appendChild(link);
    }

    document.body.prepend(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addNavigation, { once: true });
  } else {
    addNavigation();
  }
})();