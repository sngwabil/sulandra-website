(() => {
  'use strict';

  // SPIRE_SCREEN_CONTROLS_LIVE_V2
  const COMPACT_KEY = 'spire:compact-mode';
  const FIT_KEY = 'spire:fit-mode';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const PATIENT_KEY = 'spire:patientId';
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const WORKSPACE_LOOP_GUARD = '20260811-spire-workspace-loop-guard-1';
  let notificationItems = [];
  let notificationTimer = null;

  // Prevent the retired workspace observer loop without changing the functional
  // direct click/custom-event hooks used by the current chart workspaces.
  const NativeMutationObserver = window.MutationObserver;
  if (NativeMutationObserver && !window.__spireWorkspaceLoopGuard) {
    const blockedCreator = /(?:^|\/)spire-workspace-completion\.js(?:\?|:|$)/i;
    function GuardedMutationObserver(callback) {
      const stack = String(new Error().stack || '');
      if (blockedCreator.test(stack)) {
        document.documentElement.dataset.spireWorkspaceLoopGuard = WORKSPACE_LOOP_GUARD;
        return { observe() {}, disconnect() {}, takeRecords() { return []; } };
      }
      return new NativeMutationObserver(callback);
    }
    GuardedMutationObserver.prototype = NativeMutationObserver.prototype;
    window.MutationObserver = GuardedMutationObserver;
    window.__spireWorkspaceLoopGuard = WORKSPACE_LOOP_GUARD;
  }

  const setPressed = (button, value) => button?.setAttribute('aria-pressed', value ? 'true' : 'false');
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
  const patientId = () => {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return clean(query.get('patientId') || hash.get('patient') || sessionStorage.getItem(PATIENT_KEY));
  };
  const homeId = () => clean(new URLSearchParams(location.search).get('spireHome') || sessionStorage.getItem(HOME_ID_KEY) || localStorage.getItem(HOME_ID_KEY));
  const companyId = () => clean(new URLSearchParams(location.search).get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY));

  const applyCompact = (value) => {
    document.body.classList.toggle('spire-compact-mode', value);
    sessionStorage.setItem(COMPACT_KEY, value ? '1' : '0');
    setPressed(document.getElementById('spireCompactControl'), value);
  };
  const applyFit = (value) => {
    document.body.classList.toggle('spire-fit-mode', value);
    sessionStorage.setItem(FIT_KEY, value ? '1' : '0');
    setPressed(document.getElementById('spireFitControl'), value);
  };

  async function toggleFullscreen() {
    if (window.SpireUserPreferences?.toggleFullscreenPreference) {
      await window.SpireUserPreferences.toggleFullscreenPreference();
      return;
    }
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      else await document.exitFullscreen?.();
    } catch {
      document.getElementById('spireFullscreenControl')?.setAttribute('title', 'Full screen is unavailable in this browser window');
    }
  }

  function syncFullscreenButton() {
    if (window.SpireUserPreferences?.syncFullscreenButtons) {
      window.SpireUserPreferences.syncFullscreenButtons();
      return;
    }
    const button = document.getElementById('spireFullscreenControl');
    if (!button) return;
    const active = Boolean(document.fullscreenElement);
    button.textContent = active ? '🗗' : '⛶';
    button.setAttribute('aria-label', active ? 'Exit full screen' : 'Open SPIRE full screen');
    button.setAttribute('title', active ? 'Exit full screen' : 'Full screen');
    setPressed(button, active);
  }

  function fitToScreen() {
    applyCompact(false);
    applyFit(true);
    document.querySelector('.spire-main')?.scrollTo({ left: 0, behavior: 'smooth' });
  }

  function installWindowControls() {
    const host = document.querySelector('.spire-top-actions');
    if (!host) {
      // Client Station/Secure Chat provide their own maximize button but use the
      // same persistent fullscreen controller.
      window.SpireUserPreferences?.apply?.();
      return false;
    }
    if (!document.getElementById('spireWindowControls')) {
      const controls = document.createElement('span');
      controls.id = 'spireWindowControls';
      controls.className = 'spire-window-controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'SPIRE screen controls');
      controls.innerHTML = `
        <button type="button" id="spireCompactControl" class="spire-window-control" aria-label="Minimize side panels" title="Minimize side panels" aria-pressed="false">−</button>
        <button type="button" id="spireFitControl" class="spire-window-control" aria-label="Fit SPIRE to screen" title="Fit / restore to screen" aria-pressed="false">□</button>
        <button type="button" id="spireFullscreenControl" data-spire-fullscreen-control class="spire-window-control" aria-label="Open SPIRE full screen" title="Full screen" aria-pressed="false">⛶</button>`;
      host.prepend(controls);
      document.getElementById('spireCompactControl')?.addEventListener('click', () => {
        applyFit(false);
        applyCompact(!document.body.classList.contains('spire-compact-mode'));
      });
      document.getElementById('spireFitControl')?.addEventListener('click', fitToScreen);
      if (!window.SpireUserPreferences) document.getElementById('spireFullscreenControl')?.addEventListener('click', toggleFullscreen);
    }
    applyCompact(sessionStorage.getItem(COMPACT_KEY) === '1');
    applyFit(sessionStorage.getItem(FIT_KEY) !== '0');
    window.SpireUserPreferences?.apply?.();
    syncFullscreenButton();
    return true;
  }

  function secureChatUrl(targetPatientId = patientId()) {
    if (!targetPatientId) return '/spire/client-station.html';
    const query = new URLSearchParams();
    query.set('patientId', targetPatientId);
    if (homeId()) query.set('spireHome', homeId());
    if (companyId()) query.set('company', companyId());
    return `/spire/secure-chat.html?${query}`;
  }

  async function api(path) {
    const headers = new Headers({ Accept: 'application/json' });
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    if (companyId()) headers.set('x-legal-entity-id', companyId());
    if (homeId()) headers.set('x-spire-home-id', homeId());
    const response = await fetch(API + path, { headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`Notifications unavailable (${response.status})`);
    const payload = await response.json().catch(() => ({}));
    return payload.data ?? payload;
  }

  function ensureNotificationStyles() {
    if (document.getElementById('spireLiveNotificationStyles')) return;
    const style = document.createElement('style');
    style.id = 'spireLiveNotificationStyles';
    style.textContent = `
      #spireLiveNotificationsPanel{position:fixed;right:18px;top:48px;z-index:10050;width:min(390px,calc(100vw - 28px));max-height:70vh;overflow:auto;background:#fff;color:#16364a;border:1px solid #8fb6ca;border-radius:7px;box-shadow:0 14px 42px rgba(3,32,51,.28);font:12px/1.35 Segoe UI,Arial,sans-serif}
      #spireLiveNotificationsPanel[hidden]{display:none!important}#spireLiveNotificationsPanel header{position:sticky;top:0;display:flex;align-items:center;gap:8px;padding:9px 10px;background:#e8f6fb;border-bottom:1px solid #b7d4df;z-index:1}#spireLiveNotificationsPanel header strong{font-size:13px;color:#064f6f}#spireLiveNotificationsPanel header button{margin-left:auto;border:1px solid #8db1c1;background:#fff;border-radius:3px;cursor:pointer;padding:3px 7px}
      .spire-live-note{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #d8e6ec;background:#fff;padding:9px 10px;cursor:pointer;color:#244657}.spire-live-note:hover{background:#f0f9fc}.spire-live-note strong{display:block;color:#0b5270;margin-bottom:2px}.spire-live-note small{display:block;color:#657d88;margin-top:3px}.spire-live-note .urgent{color:#a20d18;font-weight:800}.spire-live-empty{padding:22px 12px;text-align:center;color:#637f8c}.notification-badge[hidden]{display:none!important}`;
    document.head.appendChild(style);
  }

  function openInBasket() {
    document.getElementById('spireLiveNotificationsPanel')?.setAttribute('hidden', '');
    const button = document.querySelector('[data-workspace="inbasket"], [data-nav="inbasket"], [data-spire-workspace="inbasket"]');
    if (button instanceof HTMLElement) { button.click(); return; }
    location.hash = 'workspace=inbasket';
  }

  function renderNotificationPanel() {
    ensureNotificationStyles();
    let panel = document.getElementById('spireLiveNotificationsPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'spireLiveNotificationsPanel';
      panel.hidden = true;
      document.body.appendChild(panel);
    }
    const rows = notificationItems.slice(0, 20);
    panel.innerHTML = `<header><strong>Alerts & Reminders</strong><span>${notificationItems.length} open</span><button type="button" data-open-inbasket>Open In Basket</button></header>${rows.length ? rows.map((item) => `<button type="button" class="spire-live-note" data-note-patient="${esc(item.patientId || '')}"><strong class="${['URGENT','HIGH'].includes(String(item.priority)) ? 'urgent' : ''}">${esc(item.title || item.category || 'Clinical notification')}</strong><span>${esc(item.patientName || item.category || '')}</span><small>${esc([item.priority, item.dueAt ? new Date(item.dueAt).toLocaleString() : ''].filter(Boolean).join(' · '))}</small></button>`).join('') : '<div class="spire-live-empty">Your live SPIRE In Basket is clear.</div>'}`;
    panel.querySelector('[data-open-inbasket]')?.addEventListener('click', openInBasket);
    panel.querySelectorAll('[data-note-patient]').forEach((button) => button.addEventListener('click', () => {
      const id = clean(button.dataset.notePatient);
      if (id && id === patientId()) location.assign(secureChatUrl(id));
      else openInBasket();
    }));
    return panel;
  }

  async function refreshNotifications() {
    const bell = document.getElementById('notificationBellBtn');
    if (!bell) return;
    try {
      const data = await api('/api/spire/inbasket-v2?status=OPEN');
      notificationItems = Array.isArray(data) ? data : [];
      const badge = bell.querySelector('.notification-badge');
      if (badge) {
        badge.textContent = notificationItems.length > 99 ? '99+' : String(notificationItems.length);
        badge.hidden = notificationItems.length === 0;
      }
      bell.setAttribute('title', notificationItems.length ? `Alerts & Reminders — ${notificationItems.length} open` : 'Alerts & Reminders — In Basket clear');
      renderNotificationPanel();
    } catch (error) {
      notificationItems = [];
      const badge = bell.querySelector('.notification-badge');
      if (badge) badge.hidden = true;
      bell.setAttribute('title', 'Alerts & Reminders — live In Basket unavailable');
      console.warn('[SPIRE] live notifications could not refresh', error);
    }
  }

  function installLiveClinicalControls() {
    const message = document.getElementById('messagingIconBtn');
    if (message && message.dataset.spireLiveMessaging !== 'true') {
      message.dataset.spireLiveMessaging = 'true';
      message.removeAttribute('onclick');
      message.onclick = null;
      message.setAttribute('title', 'Secure Chat');
      message.setAttribute('aria-label', 'Secure Chat');
      message.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        location.assign(secureChatUrl());
      }, true);
    }

    const bell = document.getElementById('notificationBellBtn');
    if (bell && bell.dataset.spireLiveNotifications !== 'true') {
      bell.dataset.spireLiveNotifications = 'true';
      bell.removeAttribute('onclick');
      bell.onclick = null;
      bell.setAttribute('aria-label', 'Alerts & Reminders');
      bell.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const panel = renderNotificationPanel();
        panel.hidden = !panel.hidden;
        if (!panel.hidden) refreshNotifications().catch(() => {});
      }, true);
      refreshNotifications().catch(() => {});
      notificationTimer = window.setInterval(() => refreshNotifications().catch(() => {}), 30000);
    }
  }

  function install() {
    installWindowControls();
    installLiveClinicalControls();
    return Boolean(document.getElementById('messagingIconBtn') || document.querySelector('.spire-top-actions'));
  }

  document.addEventListener('fullscreenchange', syncFullscreenButton);
  window.addEventListener('beforeunload', () => { if (notificationTimer) window.clearInterval(notificationTimer); });
  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
