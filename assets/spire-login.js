(() => {
  'use strict';

  // SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1
  // SPIRE_DEEP_LINK_HANDOFF_V1
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const SESSION_KEY = 'sulandra:employee:session';
  const HOME_KEYS = ['spire:selected-service-home-id', 'spire:selected-service-home-name', 'spire:selected-service-home-entity'];
  const frame = document.getElementById('spireWorkspaceFrame');
  const status = document.getElementById('spireLoginStatus');
  let mirrorTimer = null;

  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const clean = (value) => String(value ?? '').trim();

  function sessionObject() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
        if (value && typeof value === 'object') return value;
      } catch {}
    }
    return {};
  }

  function userScope() {
    const session = sessionObject();
    const user = session.user || session.session || session;
    return clean(user.id || user.userId || user.sub || user.email || user.username).toLowerCase();
  }

  function scopedHomeKey(base) {
    const scope = userScope();
    return scope ? `${base}:user:${scope}` : base;
  }

  function restoreRememberedHome() {
    if (!userScope()) return;
    for (const base of HOME_KEYS) {
      const value = localStorage.getItem(scopedHomeKey(base));
      if (!value) continue;
      localStorage.setItem(base, value);
      sessionStorage.setItem(base, value);
    }
  }

  function mirrorRememberedHome() {
    if (!userScope()) return;
    for (const base of HOME_KEYS) {
      const value = localStorage.getItem(base) || sessionStorage.getItem(base);
      if (value) localStorage.setItem(scopedHomeKey(base), value);
    }
  }

  function startHomeMirror() {
    if (mirrorTimer) clearInterval(mirrorTimer);
    mirrorRememberedHome();
    mirrorTimer = setInterval(mirrorRememberedHome, 750);
  }

  function stationUrl() {
    const search = new URLSearchParams(location.search);
    const incomingHash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const readIncoming = (...keys) => {
      for (const key of keys) {
        const value = clean(search.get(key) || incomingHash.get(key));
        if (value) return value;
      }
      return '';
    };
    const query = new URLSearchParams();
    const company = readIncoming('company');
    const home = readIncoming('spireHome', 'home');
    const patient = readIncoming('patientId', 'patient');
    const tab = readIncoming('tab');
    if (company) query.set('company', company);
    if (home) query.set('spireHome', home);

    if (patient) {
      query.set('spireShell', '1');
      query.set('patientId', patient);
      const chartHash = new URLSearchParams(incomingHash);
      if (!chartHash.get('patient')) chartHash.set('patient', patient);
      if (tab && !chartHash.get('tab')) chartHash.set('tab', tab);
      return `/spire/master.html?${query}${chartHash.toString() ? `#${chartHash}` : ''}`;
    }

    query.set('spireShell', '1');
    return `/spire/client-station.html?${query}`;
  }

  function loginUrl() {
    return `/employee-login.html?returnTo=${encodeURIComponent(stationUrl())}`;
  }

  function showFrame(url, message) {
    document.getElementById('spireLoginPage').hidden = true;
    document.getElementById('spireWorkspaceShell').hidden = false;
    if (status) status.textContent = message || '';
    frame.src = url;
  }

  async function verifyExistingSession() {
    const accessToken = token();
    if (!accessToken) return false;
    try {
      const response = await fetch(API + '/api/auth/me', {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
      if (!response.ok) return false;
      restoreRememberedHome();
      startHomeMirror();
      return true;
    } catch {
      return false;
    }
  }

  function requestPreferredFullscreenFromGesture() {
    if (!window.SpireUserPreferences?.fullscreenPreferred?.()) return;
    window.SpireUserPreferences.requestFullscreen?.({ persist: false }).catch(() => {});
  }

  function bindFrameForFullscreenAndHome() {
    frame.addEventListener('load', () => {
      let path = '';
      try { path = frame.contentWindow.location.pathname; } catch {}

      if (path.endsWith('/employee-login.html')) {
        try {
          const form = frame.contentDocument?.getElementById('form');
          if (form && form.dataset.spireFullscreenBridge !== 'true') {
            form.dataset.spireFullscreenBridge = 'true';
            form.addEventListener('submit', requestPreferredFullscreenFromGesture, { capture: true });
          }
        } catch {}
      }

      if (path.includes('/spire/')) {
        restoreRememberedHome();
        startHomeMirror();
        window.SpireUserPreferences?.apply?.();
      }
    });
  }

  function refreshWorkspaceInsteadOfShell(event) {
    const refresh = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'r');
    if (!refresh || document.getElementById('spireWorkspaceShell').hidden) return;
    event.preventDefault();
    try { frame.contentWindow.location.reload(); } catch { frame.src = frame.src; }
  }

  bindFrameForFullscreenAndHome();
  document.addEventListener('keydown', refreshWorkspaceInsteadOfShell, true);
  window.addEventListener('beforeunload', () => { if (mirrorTimer) clearInterval(mirrorTimer); });

  verifyExistingSession().then((authenticated) => {
    showFrame(authenticated ? stationUrl() : loginUrl(), authenticated ? 'Opening Client Station…' : 'Sign in with your Sulandra Health system credentials.');
    if (authenticated) window.SpireUserPreferences?.apply?.();
  });
})();
