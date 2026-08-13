(() => {
  'use strict';

  // SPIRE_PATIENT_STATION_LISTS_V1
  // Dense patient-list workstation modeled on clinical list workflows while
  // retaining Sulandra branding and the existing audited home/patient boundary.
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_NAME_KEY = 'spire:selected-service-home-name';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const PATIENT_KEY = 'spire:patientId';
  const params = new URLSearchParams(location.search);

  const state = { user: null, companyId: '', homeId: '', home: null, homes: [], patients: [], selected: null };
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

  function patientId(patient) { return clean(patient?.patientId || patient?.id); }
  function patientName(patient) { return clean(patient?.name || patient?.displayName || [patient?.preferredName || patient?.firstName, patient?.lastName].filter(Boolean).join(' ')) || 'Client'; }
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

  function portalUrl(step = 'companies') {
    const query = new URLSearchParams();
    if (state.companyId) query.set('company', state.companyId);
    if (step !== 'companies') query.set('step', step);
    return `/spire/portal.html${query.toString() ? `?${query}` : ''}`;
  }

  function chartUrl(patient, extra = '') {
    const query = new URLSearchParams({ patientId: patientId(patient), spireHome: state.homeId, company: state.companyId });
    return `/spire/master.html?${query}${extra}`;
  }

  function chatUrl(patient) {
    const query = new URLSearchParams({ patientId: patientId(patient), spireHome: state.homeId, company: state.companyId });
    return `/spire/secure-chat.html?${query}`;
  }

  function setIdentity() {
    const user = state.user || {};
    const name = user.displayName || user.name || user.fullName || user.email || 'Sulandra Health User';
    $('#stationUser').textContent = name;
    $('#stationAvatar').textContent = initials(name);
  }

  async function loadHomes() {
    const data = await api('/api/spire/network/service-homes');
    state.homes = (Array.isArray(data?.homes) ? data.homes : []).filter((home) => !state.companyId || String(home.legalEntityId || '') === state.companyId);
    renderHomes();
  }

  async function enterHome(homeId, { replaceUrl = false } = {}) {
    state.homeId = clean(homeId);
    if (!state.homeId) throw new Error('Choose a service home before opening Patient Station.');
    const data = await api(`/api/spire/network/service-homes/${encodeURIComponent(state.homeId)}/access`, {
      method: 'POST', body: JSON.stringify({}), homeId: state.homeId,
    });
    state.home = data?.home || state.homes.find((home) => String(home.id) === state.homeId) || null;
    state.patients = Array.isArray(data?.patients) ? data.patients : [];
    state.selected = null;
    sessionStorage.setItem(HOME_ID_KEY, state.homeId);
    sessionStorage.setItem(HOME_NAME_KEY, String(state.home?.name || 'Service Home'));
    sessionStorage.setItem(HOME_ENTITY_KEY, String(state.home?.legalEntityId || state.companyId));
    sessionStorage.removeItem(PATIENT_KEY);
    if (state.home?.legalEntityId && !state.companyId) state.companyId = String(state.home.legalEntityId);
    if (state.companyId) {
      sessionStorage.setItem(ENTITY_KEY, state.companyId);
      localStorage.setItem(ENTITY_KEY, state.companyId);
    }
    if (replaceUrl) {
      const query = new URLSearchParams({ company: state.companyId, spireHome: state.homeId });
      history.replaceState(null, '', `/spire/patient-station.html?${query}`);
    }
    renderStation();
    renderHomes();
  }

  function renderHomes() {
    const host = $('#availableHomes');
    if (!host) return;
    if (!state.homes.length) {
      host.innerHTML = '<div class="home-meta" style="padding:8px">No other authorized service homes are available.</div>';
      return;
    }
    host.innerHTML = state.homes.map((home) => `<div class="home-item ${String(home.id) === state.homeId ? 'current' : ''}" data-home-id="${esc(home.id)}">
      <span class="home-icon">♟</span><span><div class="home-name">${esc(home.name || 'Service Home')}</div><div class="home-meta">${esc(homeAddress(home) || home.companyName || '')}</div></span>
    </div>`).join('');
    $$('[data-home-id]', host).forEach((node) => node.addEventListener('click', () => {
      if (String(node.dataset.homeId) === state.homeId) return;
      enterHome(node.dataset.homeId, { replaceUrl: true }).catch(showError);
    }));
  }

  function filteredPatients() {
    const term = clean($('#patientSearch')?.value).toLowerCase();
    if (!term) return state.patients;
    return state.patients.filter((patient) => [patientName(patient), patient.medicalRecordNumber, patient.dateOfBirth, patient.homeName, patient.programName, ...(Array.isArray(patient.flags) ? patient.flags.map((flag) => flag?.label) : [])]
      .some((value) => clean(value).toLowerCase().includes(term)));
  }

  function renderStation() {
    const homeName = state.home?.name || 'Selected Service Home';
    $('#topStationTitle').textContent = `Patient Station — ${homeName}`;
    $('#stationScope').textContent = [state.home?.companyName, homeName].filter(Boolean).join(' · ');
    $('#myHomeLabel').textContent = `My ${homeName} Clients`;
    $('#clientCount').textContent = String(state.patients.length);
    renderPatients();
    renderPreview();
  }

  function renderPatients() {
    const body = $('#stationPatientBody');
    const patients = filteredPatients();
    if (!patients.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="7">${state.patients.length ? 'No clients match the current search.' : 'No active clients are assigned to this service home.'}</td></tr>`;
      selectPatient(null);
      return;
    }
    body.innerHTML = patients.map((patient) => {
      const id = patientId(patient);
      const selected = patientId(state.selected) === id;
      const flags = Array.isArray(patient.flags) ? patient.flags : [];
      return `<tr class="patient-row${selected ? ' selected' : ''}" tabindex="0" data-patient-id="${esc(id)}" aria-label="${esc(patientName(patient))}. Double-click to open chart.">
        <td><div class="patient-cell"><span class="patient-photo">👤</span><span><div class="patient-name">${esc(patientName(patient))}</div><div class="patient-sub">${esc([age(patient.dateOfBirth), patient.sexAtBirth || patient.genderIdentity].filter(Boolean).join(' · ') || 'Active client')}</div></span></div></td>
        <td>${esc(patient.medicalRecordNumber || '—')}</td>
        <td>${esc(fmtDate(patient.dateOfBirth))}<div class="patient-sub">${esc(age(patient.dateOfBirth))}</div></td>
        <td>${esc(patient.homeName || state.home?.name || '—')}</td>
        <td>${esc(patient.programName || '—')}</td>
        <td>${flags.length ? flags.map((flag) => `<span class="flag">${esc(flag.label || flag.severity || 'Alert')}</span>`).join('') : '—'}</td>
        <td><span class="status-ok">✓</span> Authorized</td>
      </tr>`;
    }).join('');

    $$('.patient-row', body).forEach((row) => {
      const findPatient = () => state.patients.find((patient) => patientId(patient) === String(row.dataset.patientId));
      row.addEventListener('click', () => selectPatient(findPatient()));
      row.addEventListener('dblclick', () => openChart(findPatient()));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); selectPatient(findPatient()); openChart(findPatient()); }
        if (event.key === ' ') { event.preventDefault(); selectPatient(findPatient()); }
      });
    });
  }

  function selectPatient(patient) {
    state.selected = patient || null;
    if (state.selected) sessionStorage.setItem(PATIENT_KEY, patientId(state.selected));
    else sessionStorage.removeItem(PATIENT_KEY);
    $('#openSelected').disabled = !state.selected;
    $('#openSecureChat').disabled = !state.selected;
    $('#writeHandoff').disabled = !state.selected;
    $('#topSecureChat').disabled = !state.selected;
    $$('.patient-row').forEach((row) => row.classList.toggle('selected', state.selected && String(row.dataset.patientId) === patientId(state.selected)));
    renderPreview();
  }

  function renderPreview() {
    const host = $('#patientPreview');
    const patient = state.selected;
    if (!patient) {
      host.innerHTML = '<div class="preview-placeholder">Select a client row to preview the chart. <b>Double-click the row to open the chart.</b></div>';
      return;
    }
    const flags = Array.isArray(patient.flags) ? patient.flags : [];
    host.innerHTML = `<div class="preview-head">
      <span class="preview-name">${esc(patientName(patient))}</span>
      <span class="preview-meta">DOB ${esc(fmtDate(patient.dateOfBirth))} · MRN ${esc(patient.medicalRecordNumber || '—')} · ${esc(state.home?.name || patient.homeName || '')}</span>
      <span class="preview-spacer"></span>
      <button class="preview-action" data-preview-chat>🔒 Secure Chat</button>
      <button class="preview-action primary" data-preview-open>Open Chart</button>
    </div>
    <div class="preview-body">
      <div class="patient-banner">
        <div><div class="banner-name">${esc(patientName(patient))} ${esc(patient.medicalRecordNumber ? `#${patient.medicalRecordNumber}` : '')}</div><div class="facts"><b>Service Home:</b> ${esc(patient.homeName || state.home?.name || '—')}<br><b>Program / Service:</b> ${esc(patient.programName || '—')}<br><b>Authorized chart scope:</b> Verified through selected service home</div></div>
        <div class="facts"><b>Date of Birth:</b> ${esc(fmtDate(patient.dateOfBirth))}<br><b>Age:</b> ${esc(age(patient.dateOfBirth) || '—')}<br><b>Company:</b> ${esc(state.home?.companyName || 'Sulandra Health')}</div>
        <div class="facts"><span class="secure-chip">🔒 Secure clinical workspace</span><br><b>Alerts:</b> ${flags.length ? esc(flags.map((flag) => flag.label || flag.severity).filter(Boolean).join(', ')) : 'None listed'}<br><b>Chart open rule:</b> Explicit user action required</div>
      </div>
      <div class="preview-section-title">Client Station Snapshot</div>
      <div class="mini-grid">
        <div class="mini-cell"><b>Client</b>${esc(patientName(patient))}</div>
        <div class="mini-cell"><b>MRN</b>${esc(patient.medicalRecordNumber || '—')}</div>
        <div class="mini-cell"><b>Location</b>${esc(state.home?.name || patient.homeName || '—')}</div>
        <div class="mini-cell"><b>Clinical Alerts</b>${flags.length ? esc(`${flags.length} active`) : 'None listed'}</div>
      </div>
    </div>`;
    $('[data-preview-open]', host)?.addEventListener('click', () => openChart(patient));
    $('[data-preview-chat]', host)?.addEventListener('click', () => openChat(patient));
  }

  function openChart(patient = state.selected) {
    if (!patient) return;
    sessionStorage.setItem(PATIENT_KEY, patientId(patient));
    location.assign(chartUrl(patient));
  }
  function openChat(patient = state.selected) {
    if (!patient) return;
    sessionStorage.setItem(PATIENT_KEY, patientId(patient));
    location.assign(chatUrl(patient));
  }

  function showError(error) {
    console.error(error);
    const body = $('#stationPatientBody');
    if (body) body.innerHTML = `<tr class="empty-row"><td colspan="7" style="color:#991b1b">${esc(error?.message || 'Patient Station could not load.')}</td></tr>`;
  }

  async function refresh() {
    await loadHomes();
    await enterHome(state.homeId);
  }

  function wire() {
    $('#patientSearch').addEventListener('input', renderPatients);
    $('#refreshStation').addEventListener('click', () => refresh().catch(showError));
    $('#openSelected').addEventListener('click', () => openChart());
    $('#openSecureChat').addEventListener('click', () => openChat());
    $('#writeHandoff').addEventListener('click', () => openChat());
    $('#topSecureChat').addEventListener('click', () => openChat());
    $('#printList').addEventListener('click', () => window.print());
    $('#topPortal').addEventListener('click', () => location.assign(portalUrl('companies')));
    $('#topHomes').addEventListener('click', () => location.assign(portalUrl('homes')));
    $('#chooseHome').addEventListener('click', () => location.assign(portalUrl('homes')));
    $('#topStation').addEventListener('click', () => refresh().catch(showError));
    $('#stationLogout').addEventListener('click', () => {
      for (const key of TOKEN_KEYS) { sessionStorage.removeItem(key); localStorage.removeItem(key); }
      sessionStorage.removeItem(PATIENT_KEY);
      location.assign('/employee-login.html');
    });
  }

  async function bootstrap() {
    state.companyId = clean(params.get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY));
    state.homeId = clean(params.get('spireHome') || params.get('home') || sessionStorage.getItem(HOME_ID_KEY));
    if (!state.companyId) { location.replace('/spire/portal.html?step=companies'); return; }
    if (!state.homeId) { location.replace(`/spire/portal.html?step=homes&company=${encodeURIComponent(state.companyId)}`); return; }
    try {
      state.user = await loadSession();
      setIdentity();
      wire();
      await loadHomes();
      await enterHome(state.homeId);
    } catch (error) {
      if (error.status === 401) { returnToLogin(); return; }
      showError(error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
