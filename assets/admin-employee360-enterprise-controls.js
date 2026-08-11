(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;
  // Compatibility completion point for the canonical Employee 360 loader.
  // The individual management, compliance, collaboration, performance, pay,
  // leave, assets, analytics, documents, workflow, communication, engagement,
  // learning and safety modules own their respective controls. Keeping this
  // final asset present allows the sequential loader to resolve successfully.
  document.documentElement.dataset.employee360EnterpriseControls = 'ready';
  window.dispatchEvent(new CustomEvent('sulandra:employee360-ready'));
})();
