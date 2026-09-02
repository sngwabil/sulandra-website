(() => {
  'use strict';

  // SPIRE_NATIVE_LOGIN_V2
  // SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V2
  // SPIRE_DEEP_LINK_HANDOFF_V1
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const SESSION_KEY = 'sulandra:employee:session';
  const PROTECTED_SESSION_ASSET = '/assets/sulandra-protected-session.js?v=20260902-protected-session-2';
  const HOME_KEYS = ['spire:selected-service-home-id', 'spire:selected-service-home-name', 'spire:selected-service-home-entity'];
  const frame = document.getElementById('spireWorkspaceFrame');
  const status = document.getElementById('spireLoginStatus');
  const form = document.getElementById('spireLoginForm');
  const identifierInput = document.getElementById('spireIdentifier');
  const passwordInput = document.getElementById('spirePassword');
  const loginButton = document.getElementById('spireLoginButton');
  const ssoState = document.getElementById('spireSsoState');
  let mirrorTimer = null;
  let mfaChallengeId = '';
  let protectedSessionPromise = null;

  const clean = (value) => String(value ?? '').trim();
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';

  function sessionObject() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
        if (value && typeof value === 'object') return value;
      } catch {}
    }
    return {};
  }

  function saveSession(accessToken, session) {
    const encoded = JSON.stringify({ ...session, portalContext: 'SPIRE' });
    sessionStorage.setItem(TOKEN_KEY, accessToken);
    sessionStorage.setItem(SESSION_KEY, encoded);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  function roleOf(session) {
    return clean(session?.role || session?.user?.role || session?.profile?.role).toUpperCase();
  }

  function spireAllowed(session) {
    const permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    if (session?.access?.spire?.enabled === true || session?.user?.access?.spire?.enabled === true) return true;
    if (permissions.includes('SPIRE_CHART_READ')) return true;
    return new Set(['ADMINISTRATOR','PROGRAM_MANAGER','DSP','DELEGATING_NURSE','LPN','RN','HOUSE_MANAGER','AUDITOR','CEO','DOO','COO']).has(roleOf(session));
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

  function parentProtectedRuntime() {
    try {
      if (window.parent && window.parent !== window && window.parent.SulandraProtectedSession) return window.parent.SulandraProtectedSession;
      if (window.top && window.top !== window && window.top.SulandraProtectedSession) return window.top.SulandraProtectedSession;
    } catch {}
    return null;
  }

  function loadProtectedSessionRuntime() {
    const inherited = parentProtectedRuntime();
    if (inherited) return Promise.resolve(inherited);
    if (window.SulandraProtectedSession) return Promise.resolve(window.SulandraProtectedSession);
    if (protectedSessionPromise) return protectedSessionPromise;
    protectedSessionPromise = new Promise((resolve) => {
      let script = document.querySelector('script[data-sulandra-protected-session-loader]');
      const finish = () => resolve(window.SulandraProtectedSession || null);
      if (!script) {
        script = document.createElement('script');
        script.src = PROTECTED_SESSION_ASSET;
        script.async = true;
        script.dataset.sulandraProtectedSessionLoader = '1';
        document.head.appendChild(script);
      }
      if (window.SulandraProtectedSession) return finish();
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => resolve(null), { once: true });
    });
    return protectedSessionPromise;
  }

  function armProtectedFullscreenFromGesture() {
    const runtime = parentProtectedRuntime() || window.SulandraProtectedSession;
    if (runtime?.requestFullscreenFromGesture) {
      runtime.requestFullscreenFromGesture();
      return;
    }
    loadProtectedSessionRuntime().then((loaded) => loaded?.requestFullscreenFromGesture?.()).catch(() => {});
  }

  async function enterWorkspace() {
    restoreRememberedHome();
    startHomeMirror();
    const destination = stationUrl();
    let runtime = parentProtectedRuntime() || window.SulandraProtectedSession;
    runtime = runtime || await loadProtectedSessionRuntime();
    if (runtime?.enter) {
      runtime.enter(destination, { portal: 'SPIRE' });
      return;
    }
    if (runtime?.navigate) {
      runtime.navigate(destination, { portal: 'SPIRE' });
      return;
    }
    document.getElementById('spireLoginPage').hidden = true;
    document.getElementById('spireWorkspaceShell').hidden = false;
    frame.src = destination;
  }

  function showLogin(message) {
    document.getElementById('spireWorkspaceShell').hidden = true;
    document.getElementById('spireLoginPage').hidden = false;
    if (ssoState) ssoState.textContent = 'S.P.I.R.E. authentication required';
    if (status) {
      status.className = 'status';
      status.textContent = message || 'Enter your Sulandra Health system credentials to open S.P.I.R.E.';
    }
  }

  function showError(message) {
    if (!status) return;
    status.className = 'status error';
    status.textContent = message;
  }

  function showSuccess(message) {
    if (!status) return;
    status.className = 'status success';
    status.textContent = message;
  }

  function ensureMfaUi() {
    let panel = document.getElementById('spireMfaPanel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'spireMfaPanel';
    panel.className = 'field';
    panel.hidden = true;
    panel.innerHTML = '<label for="spireMfaCode">6-digit security code</label><input id="spireMfaCode" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000"><div id="spireMfaHint" style="margin-top:6px;font-size:10px;color:#68808a"></div>';
    const actions = form?.querySelector('.actions');
    actions?.parentNode?.insertBefore(panel, actions);
    return panel;
  }

  function showMfa(payload) {
    mfaChallengeId = clean(payload.mfaChallengeId);
    const panel = ensureMfaUi();
    panel.hidden = false;
    const input = document.getElementById('spireMfaCode');
    const hint = document.getElementById('spireMfaHint');
    if (input) input.value = '';
    if (hint) hint.textContent = `Security code sent to${payload.maskedPhone ? ` ${payload.maskedPhone}` : ' your phone'}.`;
    loginButton.textContent = 'Verify & Open S.P.I.R.E.';
    showSuccess('Password accepted. Enter the security code to finish S.P.I.R.E. sign in.');
    requestAnimationFrame(() => input?.focus());
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
      const payload = await response.json().catch(() => ({}));
      const current = payload.session || payload.data || payload || sessionObject();
      return spireAllowed(current) || spireAllowed(sessionObject());
    } catch {
      return false;
    }
  }

  async function performLogin() {
    const identifier = clean(identifierInput?.value).toLowerCase();
    const password = String(passwordInput?.value || '');
    const mfaCode = clean(document.getElementById('spireMfaCode')?.value).replace(/\D/g, '').slice(0, 6);
    if (!identifier || !password) return showError('Enter your Sulandra username or email and password.');
    if (mfaChallengeId && mfaCode.length !== 6) return showError('Enter the 6-digit security code sent to your phone.');

    loginButton.disabled = true;
    loginButton.textContent = mfaChallengeId ? 'Verifying…' : 'Signing In…';
    try {
      // S.P.I.R.E. owns a distinct sign-in surface while reusing the canonical
      // Sulandra credential endpoint. The backend keeps its two explicit human
      // portal modes (EMPLOYEE/ADMIN); SPIRE entitlement is verified from the
      // returned session and again by role/permission-gated chart APIs.
      const body = { identifier, password };
      if (mfaChallengeId) {
        body.mfaChallengeId = mfaChallengeId;
        body.mfaCode = mfaCode;
      }
      const response = await fetch(API + '/api/auth/login', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.mfaRequired && payload.mfaMethod === 'sms' && payload.mfaChallengeId) {
        clearSession();
        showMfa(payload);
        return;
      }
      if (!response.ok) {
        clearSession();
        throw new Error(payload.error || 'Unable to sign in to S.P.I.R.E.');
      }
      const session = payload.session || payload.data || payload;
      const accessToken = session.accessToken || session.bearerToken || session.token;
      if (!accessToken) throw new Error('The server did not return an access token.');
      if (!spireAllowed(session)) {
        clearSession();
        throw new Error('This account does not have S.P.I.R.E. chart access.');
      }
      saveSession(accessToken, session);
      mfaChallengeId = '';
      showSuccess('S.P.I.R.E. sign in verified. Opening Client Station…');
      await enterWorkspace();
    } catch (error) {
      showError(error?.message || 'Unable to sign in to S.P.I.R.E.');
    } finally {
      loginButton.disabled = false;
      if (!mfaChallengeId) loginButton.textContent = 'Sign In & Open Client Station';
    }
  }

  function refreshWorkspaceInsteadOfShell(event) {
    const refresh = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'r');
    if (!refresh || document.getElementById('spireWorkspaceShell').hidden) return;
    event.preventDefault();
    try { frame.contentWindow.location.reload(); } catch { frame.src = frame.src; }
  }

  loadProtectedSessionRuntime();
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    armProtectedFullscreenFromGesture();
    await performLogin();
  });
  form?.addEventListener('click', (event) => {
    if (event.isTrusted) armProtectedFullscreenFromGesture();
  }, { capture: true });
  document.addEventListener('keydown', refreshWorkspaceInsteadOfShell, true);
  window.addEventListener('beforeunload', () => { if (mirrorTimer) clearInterval(mirrorTimer); });

  showLogin('Checking existing Sulandra session…');
  verifyExistingSession().then(async (authenticated) => {
    if (authenticated) {
      if (ssoState) ssoState.textContent = 'Existing S.P.I.R.E. access verified';
      showSuccess('Opening S.P.I.R.E. Client Station…');
      await enterWorkspace();
      return;
    }
    showLogin('Enter your Sulandra Health system credentials to sign in to S.P.I.R.E.');
  });
})();