(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  function ensureCanonicalSso() {
    if (window.SulandraSSO || document.querySelector('script[data-canonical-admin-sso]')) return;
    const script = document.createElement('script');
    script.src = '/assets/sulandra-sso-session.js?v=20260806-sso-1';
    script.dataset.canonicalAdminSso = 'true';
    script.async = false;
    document.head.appendChild(script);
  }

  function ensureModuleHosts() {
    if (document.getElementById('module-employees')) return;
    const onboarding = document.getElementById('module-onboarding');
    if (!onboarding?.parentElement) return;
    const employee = document.createElement('section');
    employee.id = 'module-employees';
    employee.className = 'card module';
    employee.setAttribute('aria-label', 'Employee management workspace');
    employee.innerHTML = '<h1>Employee 360</h1><p class="sub">Loading employee directory, permissions, compliance, workforce, documents, learning, payroll, benefits, leave, safety, analytics and audit tools…</p>';
    onboarding.parentElement.insertBefore(employee, onboarding);
  }

  function updateWeatherClock() {
    const weather = document.querySelector('.live-card[data-widget-id="weather"]');
    if (!weather) return;
    let clock = weather.querySelector('.weather-mini-clock');
    if (!clock) {
      clock = document.createElement('div');
      clock.className = 'weather-mini-clock';
      clock.innerHTML = '<strong>--:--</strong><span>Local time</span>';
      weather.appendChild(clock);
    }
    const value = new Intl.DateTimeFormat('en-US', {
      timeZone:'America/New_York',
      hour:'numeric',
      minute:'2-digit',
      second:'2-digit',
    }).format(new Date());
    const node = clock.querySelector('strong');
    if (node) node.textContent = value;
  }

  function removeLegacyNavigationArtifacts() {
    document.getElementById('restoredPlatformNavigation')?.remove();
    document.querySelector('.sulandra-platform-bar')?.remove();
    document.getElementById('adminTopNavigationMore')?.remove();
    document.getElementById('adminTopNavigationOverflowMenu')?.remove();
    document.querySelectorAll('.taskbar-toggle,.taskbar-scrim,.edge-toggle,.edge-drawer').forEach(node => node.remove());
  }

  function installDelegatedModuleNavigation() {
    if (document.documentElement.dataset.adminModuleDelegation === 'true') return;
    document.documentElement.dataset.adminModuleDelegation = 'true';
    document.addEventListener('click', event => {
      const control = event.target?.closest?.('#topModuleNav [data-module], #sideModuleNav [data-module]');
      if (!control) return;
      const key = control.dataset.module;
      if (!key) return;
      event.preventDefault();
      if (location.hash.slice(1) === key) window.dispatchEvent(new Event('hashchange'));
      else location.hash = key;
    });
  }

  function mount() {
    ensureCanonicalSso();
    ensureModuleHosts();
    removeLegacyNavigationArtifacts();
    installDelegatedModuleNavigation();
    updateWeatherClock();
    window.setTimeout(updateWeatherClock, 250);
    window.setTimeout(updateWeatherClock, 900);
    window.setInterval(updateWeatherClock, 1000);
    document.documentElement.dataset.adminInformationArchitecture = 'canonical-folders-v1';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
