(() => {
  'use strict';
  if (!/\/time-attendance(?:\.html|\/)?$/i.test(location.pathname)) return;

  const valid = new Set(['home','schedule','timecard','requests','profile','admin']);
  const requested = () => {
    const key = String(location.hash || '').replace(/^#/, '').toLowerCase();
    return valid.has(key) ? key : '';
  };

  function openRequestedView() {
    const key = requested();
    if (!key) return;
    const button = document.querySelector(`#tabs [data-view="${CSS.escape(key)}"]`);
    if (!button) return;
    if (key === 'admin' && button.hidden) {
      // The normal authenticated page initialization will reveal this control
      // for permitted roles. Retry briefly instead of bypassing the role gate.
      return;
    }
    button.click();
  }

  let attempts = 0;
  const retry = () => {
    attempts += 1;
    openRequestedView();
    if (attempts < 30 && requested()) setTimeout(retry, 200);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', retry, { once:true });
  else retry();
  window.addEventListener('hashchange', openRequestedView);
})();
