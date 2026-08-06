(() => {
  'use strict';
  if (!/\/time-attendance(?:\.html|\/)?$/i.test(location.pathname)) return;
  const preferred = localStorage.getItem('sulandra:selected-service-home');
  if (!preferred) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const select = document.getElementById('scheduleLocation');
    const button = document.getElementById('continueLocation');
    if (select && [...select.options].some(option => option.value === preferred)) {
      select.value = preferred;
      select.dispatchEvent(new Event('change', { bubbles:true }));
      button?.click();
      localStorage.removeItem('sulandra:selected-service-home');
      clearInterval(timer);
    } else if (attempts >= 40) {
      clearInterval(timer);
    }
  }, 250);
})();
