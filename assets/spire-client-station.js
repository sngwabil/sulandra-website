(() => {
  'use strict';

  // SPIRE_CLIENT_STATION_LISTS_V3
  // Canonical SPIRE landing surface. It validates the authenticated user's last
  // authorized service home, restores it, and loads that home's clients without
  // an extra company/home gateway. Fullscreen chart/chat navigation is kept
  // inside the active document so browser fullscreen does not collapse on route changes.
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_NAME_KEY = 'spire:selected-service-home-name';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const CLIENT_KEY = 'spire:patientId';
  const params = new URLSearchParams(location.search);

  const state = { user: null, companyId: '', homeId: '', home: null, homes: [], clients: [], selected: null, notifications: [] };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const initials = (value) => clean(value).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'SH';

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const accessToken = token();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (state.companyId) headers.set('x-legal-entity-id', state.companyId);
    if (options.homeId || state.homeId) headers.set('x-spire-home-id', options.homeId || state.homeId);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API + path, { ...options, headers, cache: 'no-store' });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || payload.message || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload.data ?? payload;
  }

  async function loadSession() {
    for (const endpoint of ['/api/auth/me', '/api/session', '/api/auth/session']) {
      try {
        const data = await api(endpoint);
        const user = data?.user || data?.session || data;
        if (user && (user.id || user.userId || user.email)) return user;
      } catch (error) {
        if (error.status === 401) break;
      }
    }
    throw Object.assign(new Error('Your Sulandra Health session could not be verified.'), { status: 401 });
  }

  function returnToLogin() {
    const returnTo = location.pathname + location.search + location.hash;
    location.replace(`/employee-login.html?return=${encodeURIComponent(returnTo)}`);
  }

  function clientId(client) { return clean(client?.patientId || client?.id); }
  function clientName(client) { return clean(client?.name || client?.displayName || [client?.preferredName || client?.firstName, client?.lastName].filter(Boolean).join(' ')) || 'Client'; }
  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }
  function age(value) {
    const dob = new Date(value);
    if (Number.isNaN(dob.getTime())) return '';
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    const beforeBirthday = now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
    if (beforeBirthday) years -= 1;
    return years >= 0 ? `${years} y.o.` : '';
  }
  function homeAddress(home) { return [home?.streetAddress || home?.address, home?.city, home?.state, home?.zipCode].filter(Boolean).join(', '); }

  function chartUrl(client) {
    const query = new URLSearchParams({ patientId: clientId(client), spireHome: state.homeId, company: state.companyId });
    return `/spire/master.html?${query}`;
  }
  function chatUrl(client = state.selected) {
    if (!client) return '';
    const query = new URLSearchParams({ patientId: clientId(client), spireHome: state.homeId, company: state.companyId });
    return `/spire/secure-chat.html?${query}`;
  }

  function setIdentity() {
    const user = state.user || {};
    const name = user.displayName || user.name || user.fullName || user.email || 'Sulandra Health User';
    $('#stationUser').textContent = name;
    $('#stationAvatar').textContent = initials(name);
    window.SpireUserPreferences?.apply?.();
  }

  async function loadHomes() {
    const data = await api('/api/spire/network/service-homes');
    state.homes = Array.isArray(data?.homes) ? data.homes : [];
    renderHomes();
    return state.homes;
  }

  function preferredHomeId() {
    return clean(
      params.get('spireHome') || params.get('home') ||
      sessionStorage.getItem(HOME_ID_KEY) || localStorage.getItem(HOME_ID_KEY)
    );
  }

  function chooseInitialHome() {
    if (!state.homes.length) return null;
    const wanted = preferredHomeId();
    return state.homes.find((home) => clean(home.id) === wanted) || state.homes[0];
  }

  async function enterHome(homeId, { replaceUrl = true } = {}) {
    const requested = clean(homeId);
    if (!requested) throw new Error('No authorized service home is available for Client Station.');
    const listedHome = state.homes.find((home) => clean(home.id) === requested) || null;
    state.homeId = requested;
    state.companyId = clean(listedHome?.legalEntityId || state.companyId);
    const data = await api(`/api/spire/network/service-homes/${encodeURIComponent(state.homeId)}/access`, {
      method: 'POST', body: JSON.stringify({}), homeId: state.homeId,
    });
    state.home = data?.home || listedHome;
    state.clients = Array.isArray(data?.patients) ? data.patients : [];
    state.selected = null;
    state.companyId = clean(state.home?.legalEntityId || state.companyId);
    sessionStorage.setItem(HOME_ID_KEY, state.homeId);
    localStorage.setItem(HOME_ID_KEY, state.homeId);
    sessionStorage.setItem(HOME_NAME_KEY, String(state.home?.name || 'Service Home'));
    localStorage.setItem(HOME_NAME_KEY, String(state.home?.name || 'Service Home'));
    sessionStorage.setItem(HOME_ENTITY_KEY, state.companyId);
    localStorage.setItem(HOME_ENTITY_KEY, state.companyId);
    sessionStorage.removeItem(CLIENT_KEY);
    if (state.companyId) {
      sessionStorage.setItem(ENTITY_KEY, state.companyId);
      localStorage.setItem(ENTITY_KEY, state.companyId);
    }
    if (replaceUrl) {
      const query = new URLSearchParams({ company: state.companyId, spireHome: state.homeId });
      history.replaceState(null, '', `/spire/client-station.html?${query}`);
    }
    renderStation();
    renderHomes();
    refreshNotifications().catch(() => {});
  }

  function renderHomes() {
    const host = $('#availableHomes');
    if (!host) return;
    if (!state.homes.length) {
      host.innerHTML = '<div class="home-meta" style="padding:8px">No authorized service homes are assigned to this account.</div>';
      return;
    }
    host.innerHTML = state.homes.map((home) => `<div class="home-item ${clean(home.id) === state.homeId ? 'current' : ''}" data-home-id="${esc(home.id)}">
      <span class="home-icon">♟</span><span><div class="home-name">${esc(home.name || 'Service Home')}${home.favorite ? ' ★' : ''}</div><div class="home-meta">${esc(homeAddress(home) || home.companyName || '')}</div></span>
    </div>`).join('');
    $$('[data-home-id]', host).forEach((node) => node.addEventListener('click', () => {
      if (clean(node.dataset.homeId) === state.homeId) return;
      enterHome(node.dataset.homeId, { replaceUrl: true }).catch(showError);
    }));
  }

  function filteredClients() {
    const term = clean($('#clientSearch')?.value).toLowerCase();
    if (!term) return state.clients;
    return state.clients.filter((client) => [clientName(client), client.medicalRecordNumber, client.dateOfBirth, client.homeName, client.programName, ...(Array.isArray(client.flags) ? client.flags.map((flag) => flag?.label) : [])]
      .some((value) => clean(value).toLowerCase().includes(term)));
  }

  function renderStation() {
    const homeName = state.home?.name || 'Selected Service Home';
    $('#topStationTitle').textContent = `Client Station — ${homeName}`;
    $('#stationScope').textContent = [state.home?.companyName, homeName].filter(Boolean).join(' · ');
    $('#myHomeLabel').textContent = `My ${homeName} Clients`;
    $('#clientCount').textContent = String(state.clients.length);
    renderClients();
    renderPreview();
  }

  function renderClients() {
    const body = $('#stationClientBody');
    const clients = filteredClients();
    if (!clients.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="7">${state.clients.length ? 'No clients match the current search.' : 'No active clients are assigned to this service home.'}</td></tr>`;
      selectClient(null);
      return;
    }
    body.innerHTML = clients.map((client) => {
      const id = clientId(client);
      const selected = clientId(state.selected) === id;
      const flags = Array.isArray(client.flags) ? client.flags : [];
      return `<tr class="client-row${selected ? ' selected' : ''}" tabindex="0" data-client-id="${esc(id)}" aria-label="${esc(clientName(client))}. Double-click to open chart.">
        <td><div class="client-cell"><span class="client-photo">👤</span><span><div class="client-name">${esc(clientName(client))}</div><div class="client-sub">${esc([age(client.dateOfBirth), client.sexAtBirth || client.genderIdentity].filter(Boolean).join(' · ') || 'Active client')}</div></span></div></td>
        <td>${esc(client.medicalRecordNumber || '—')}</td>
        <td>${esc(fmtDate(client.dateOfBirth))}<div class="client-sub">${esc(age(client.dateOfBirth))}</div></td>
        <td>${esc(client.homeName || state.home?.name || '—')}</td>
        <td>${esc(client.programName || '—')}</td>
        <td>${flags.length ? flags.map((flag) => `<span class="flag">${esc(flag.label || flag.severity || 'Alert')}</span>`).join('') : '—'}</td>
        <td><span class="status-ok">✓</span> Authorized</td>
      </tr>`;
    }).join('');
    $$('.client-row', body).forEach((row) => {
      const findClient = () => state.clients.find((client) => clientId(client) === clean(row.dataset.clientId));
      row.addEventListener('click', () => selectClient(findClient()));
      row.addEventListener('dblclick', () => openChart(findClient()));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); selectClient(findClient()); openChart(findClient()); }
        if (event.key === ' ') { event.preventDefault(); selectClient(findClient()); }
      });
    });
  }

  function selectClient(client) {
    state.selected = client || null;
    if (state.selected) sessionStorage.setItem(CLIENT_KEY, clientId(state.selected));
    else sessionStorage.removeItem(CLIENT_KEY);
    $('#openSelected').disabled = !state.selected;
    $('#openSecureChat').disabled = !state.selected;
    $('#writeHandoff').disabled = !state.selected;
    $('#topSecureChat').disabled = !state.selected;
    $$('.client-row').forEach((row) => row.classList.toggle('selected', state.selected && clean(row.dataset.clientId) === clientId(state.selected)));
    renderPreview();
  }

  function renderPreview() {
    const host = $('#clientPreview');
    const client = state.selected;
    if (!client) {
      host.innerHTML = '<div class="preview-placeholder">Select a client row to preview the chart. <b>Double-click the row to open the chart.</b></div>';
      return;
    }
    const flags = Array.isArray(client.flags) ? client.flags : [];
    host.innerHTML = `<div class="preview-head">
      <span class="preview-name">${esc(clientName(client))}</span>
      <span class="preview-meta">DOB ${esc(fmtDate(client.dateOfBirth))} · MRN ${esc(client.medicalRecordNumber || '—')} · ${esc(state.home?.name || client.homeName || '')}</span>
      <span class="preview-spacer"></span>
      <button class="preview-action" data-preview-chat>🔒 Secure Chat</button>
      <button class="preview-action primary" data-preview-open>Open Chart</button>
    </div>
    <div class="preview-body">
      <div class="client-banner">
        <div><div class="banner-name">${esc(clientName(client))} ${esc(client.medicalRecordNumber ? `#${client.medicalRecordNumber}` : '')}</div><div class="facts"><b>Service Home:</b> ${esc(client.homeName || state.home?.name || '—')}<br><b>Program / Service:</b> ${esc(client.programName || '—')}<br><b>Authorized chart scope:</b> Verified through selected service home</div></div>
        <div class="facts"><b>Date of Birth:</b> ${esc(fmtDate(client.dateOfBirth))}<br><b>Age:</b> ${esc(age(client.dateOfBirth) || '—')}<br><b>Company:</b> ${esc(state.home?.companyName || 'Sulandra Health')}</div>
        <div class="facts"><span class="secure-chip">🔒 Secure clinical workspace</span><br><b>Alerts:</b> ${flags.length ? esc(flags.map((flag) => flag.label || flag.severity).filter(Boolean).join(', ')) : 'None listed'}<br><b>Chart open rule:</b> Explicit user action required</div>
      </div>
      <div class="preview-section-title">Client Station Snapshot</div>
      <div class="mini-grid">
        <div class="mini-cell"><b>Client</b>${esc(clientName(client))}</div>
        <div class="mini-cell"><b>MRN</b>${esc(client.medicalRecordNumber || '—')}</div>
        <div class="mini-cell"><b>Location</b>${esc(state.home?.name || client.homeName || '—')}</div>
        <div class="mini-cell"><b>Clinical Alerts</b>${flags.length ? esc(`${flags.length} active`) : 'None listed'}</div>
      </div>
    </div>`;
    $('[data-preview-open]', host)?.addEventListener('click', () => openChart(client));
    $('[data-preview-chat]', host)?.addEventListener('click', () => openChat(client));
  }

  function navigateSpire(url) {
    if (!document.fullscreenElement) {
      location.assign(url);
      return;
    }
    let frame = document.getElementById('spireFullscreenRouteFrame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'spireFullscreenRouteFrame';
      frame.title = 'S.P.I.R.E. workspace';
      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff;z-index:2147483000';
      document.body.appendChild(frame);
    }
    frame.src = url;
  }

  function openChart(client = state.selected) {
    if (!client) return;
    sessionStorage.setItem(CLIENT_KEY, clientId(client));
    navigateSpire(chartUrl(client));
  }
  function openChat(client = state.selected) {
    if (!client) return;
    sessionStorage.setItem(CLIENT_KEY, clientId(client));
    navigateSpire(chatUrl(client));
  }

  function renderNotifications() {
    const badge = $('#clientStationNotificationBadge');
    if (badge) {
      badge.textContent = state.notifications.length > 99 ? '99+' : String(state.notifications.length);
      badge.hidden = state.notifications.length === 0;
    }
    const panel = $('#clientStationNoticePanel');
    if (!panel) return;
    panel.innerHTML = `<div class="notice-head">Live Alerts & Reminders · ${state.notifications.length} open</div>${state.notifications.length ? state.notifications.slice(0, 20).map((item) => `<button class="notice-item" type="button" data-notice-client="${esc(item.patientId || '')}"><strong>${esc(item.title || item.category || 'Clinical notification')}</strong><span>${esc(item.patientName || item.category || '')}</span><small>${esc([item.priority, item.dueAt ? new Date(item.dueAt).toLocaleString() : ''].filter(Boolean).join(' · '))}</small></button>`).join('') : '<div class="notice-empty">Your live SPIRE In Basket is clear.</div>'}`;
    $$('[data-notice-client]', panel).forEach((button) => button.addEventListener('click', () => {
      const id = clean(button.dataset.noticeClient);
      const client = state.clients.find((item) => clientId(item) === id);
      if (client) { selectClient(client); panel.hidden = true; }
    }));
  }

  async function refreshNotifications() {
    try {
      const data = await api('/api/spire/inbasket-v2?status=OPEN');
      state.notifications = Array.isArray(data) ? data : [];
    } catch {
      state.notifications = [];
    }
    renderNotifications();
  }

  function showError(error) {
    console.error(error);
    const body = $('#stationClientBody');
    if (body) body.innerHTML = `<tr class="empty-row"><td colspan="7" style="color:#991b1b">${esc(error?.message || 'Client Station could not load.')}</td></tr>`;
  }

  async function refresh() {
    await loadHomes();
    const home = state.homes.find((item) => clean(item.id) === state.homeId) || chooseInitialHome();
    if (!home) throw new Error('No authorized service home is assigned to this account.');
    await enterHome(home.id);
  }

  function wire() {
    $('#clientSearch').addEventListener('input', renderClients);
    $('#refreshStation').addEventListener('click', () => refresh().catch(showError));
    $('#topRefresh').addEventListener('click', () => refresh().catch(showError));
    $('#openSelected').addEventListener('click', () => openChart());
    $('#openSecureChat').addEventListener('click', () => openChat());
    $('#writeHandoff').addEventListener('click', () => openChat());
    $('#topSecureChat').addEventListener('click', () => openChat());
    $('#printList').addEventListener('click', () => window.print());
    $('#topStation').addEventListener('click', () => refresh().catch(showError));
    $('#clientStationNotifications').addEventListener('click', () => {
      const panel = $('#clientStationNoticePanel');
      panel.hidden = !panel.hidden;
      if (!panel.hidden) refreshNotifications().catch(() => {});
    });
    $('#stationLogout').addEventListener('click', () => {
      for (const key of TOKEN_KEYS) { sessionStorage.removeItem(key); localStorage.removeItem(key); }
      sessionStorage.removeItem(CLIENT_KEY);
      location.assign('/employee-login.html');
    });
  }

  async function bootstrap() {
    try {
      state.user = await loadSession();
      setIdentity();
      wire();
      await loadHomes();
      const initialHome = chooseInitialHome();
      if (!initialHome) throw new Error('No authorized service home is assigned to this account.');
      await enterHome(initialHome.id, { replaceUrl: true });
      await refreshNotifications();
      window.setInterval(() => refreshNotifications().catch(() => {}), 30000);
    } catch (error) {
      if (error.status === 401) { returnToLogin(); return; }
      showError(error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();