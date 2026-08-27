(() => {
  'use strict';
  if (!/\/employee-portal\.html$/i.test(location.pathname)) return;
  if (window.__SULANDRA_PAY_BENEFITS_ROUTE_FIX_V1__) return;
  window.__SULANDRA_PAY_BENEFITS_ROUTE_FIX_V1__ = true;

  const HASH = '#myPayBenefits';
  const TARGET_ID = 'employeeCompensation';

  function visibleNavigationOffset() {
    const nav = document.querySelector('.nav-links');
    if (!nav) return 24;
    const rect = nav.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight) return 24;
    return Math.min(Math.max(rect.bottom + 18, 24), 330);
  }

  function showPayBenefits(smooth = true) {
    if (location.hash !== HASH) return false;
    const target = document.getElementById(TARGET_ID);
    if (!target) return false;
    const top = Math.max(0, target.getBoundingClientRect().top + scrollY - visibleNavigationOffset());
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    document.querySelectorAll('.nav-links a').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === HASH);
    });
    return true;
  }

  function reconcile(smooth = false) {
    [0, 80, 240, 600].forEach((delay, index) => {
      window.setTimeout(() => showPayBenefits(smooth && index === 0), delay);
    });
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.(`a[href="${HASH}"]`);
    if (!link) return;
    event.preventDefault();
    if (location.hash !== HASH) history.pushState(null, '', `${location.pathname}${location.search}${HASH}`);
    reconcile(true);
  });

  window.addEventListener('hashchange', () => reconcile(true));
  if (document.readyState === 'complete') reconcile(false);
  else window.addEventListener('load', () => reconcile(false), { once: true });
})();
