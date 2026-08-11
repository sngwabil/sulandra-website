import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import './app.css';

const API = 'https://sulandra-website-production-5fc4.up.railway.app';
const state = {
  token: null,
  session: null,
  work: null,
  clients: [],
  alerts: [],
  activeTab: 'today',
};

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));
const hasScope = (scope) => state.session?.scopes?.includes(scope) || state.session?.scopes?.includes('admin:field');
const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
const formatDateTime = (value) => value ? new Date(value).toLocaleString() : '—';

function showMessage(message, isError = false) {
  const node = $('statusMessage');
  node.textContent = message;
  node.className = `message${isError ? ' error' : ' success'}`;
  node.hidden = false;
  window.setTimeout(() => { node.hidden = true; }, 4500);
}

async function api(path, options = {}, token = state.token) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
  return payload.data;
}

function nativePlatform() {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return 'IOS';
  if (platform === 'android') return 'ANDROID';
  return /android/i.test(navigator.userAgent) ? 'ANDROID' : 'IOS';
}

async function enablePush() {
  if (!Capacitor.isNativePlatform() || !hasScope('push:register')) return;
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') {
    showMessage('Push notifications are turned off. You can enable them in phone settings.', true);
    return;
  }

  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener('registration', async ({ value }) => {
    try {
      const platform = nativePlatform();
      await api('/api/mobile/push/register', {
        method: 'POST',
        body: JSON.stringify({
          token: value,
          platform,
          provider: platform === 'IOS' ? 'APNS' : 'FCM',
          appBundleId: 'com.sulandrahealth.field',
          environment: 'PRODUCTION',
          deviceLabel: navigator.userAgent.slice(0, 180),
        }),
      });
    } catch (error) {
      showMessage(`Push registration failed: ${error.message}`, true);
    }
  });
  await PushNotifications.addListener('registrationError', (error) => {
    showMessage(`Push registration failed: ${error?.error || 'unknown error'}`, true);
  });
  await PushNotifications.addListener('pushNotificationReceived', () => {
    void loadAlerts();
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const deepLink = notification?.data?.deepLink || '';
    if (deepLink.includes('transport')) activateTab('transport');
    else if (deepLink.includes('inbox')) activateTab('alerts');
    else activateTab('today');
    void refreshCurrent();
  });
  await PushNotifications.register();
}

async function signIn(identifier, password) {
  const employee = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  }, null);
  const broadToken = employee.accessToken || employee.token || employee.session?.accessToken || employee.data?.accessToken;
  if (!broadToken) throw new Error('Sign-in completed but no employee access token was returned');
  try {
    const exchange = await api('/api/mobile/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'sulandra-field-mobile',
        platform: nativePlatform(),
        bundleId: 'com.sulandrahealth.field',
      }),
    }, broadToken);
    state.token = exchange.accessToken;
  } finally {
    // The broad employee token is deliberately not persisted or retained by the field app.
  }
  state.session = await api('/api/mobile/session');
  await enterApp();
}

async function enterApp() {
  $('loginView').hidden = true;
  $('mainView').hidden = false;
  $('roleBadge').textContent = String(state.session.role || '').replaceAll('_', ' ');
  $('companyLabel').textContent = `Company scope: ${state.session.legalEntityId}`;
  $('welcomeTitle').textContent = state.session.role === 'DRIVER' ? 'My transportation work' : 'My field work';
  $('clientsTab').hidden = !hasScope('client:assigned:summary');
  $('transportTab').hidden = !hasScope('transport:trips:read');
  await Promise.all([loadToday(), loadAlerts(), hasScope('client:assigned:summary') ? loadClients() : Promise.resolve()]);
  await enablePush();
}

async function signOut() {
  try { if (state.token) await api('/api/mobile/oauth/revoke', { method: 'POST', body: '{}' }); } catch {}
  state.token = null;
  state.session = null;
  state.work = null;
  state.clients = [];
  state.alerts = [];
  await PushNotifications.removeAllListeners().catch(() => {});
  $('mainView').hidden = true;
  $('loginView').hidden = false;
  $('password').value = '';
}

function appointmentCard(item) {
  const name = [item.preferredName || item.firstName, item.lastName].filter(Boolean).join(' ');
  return `<article class="work-card"><div class="work-time">${escapeHtml(formatTime(item.startsAt))}</div><div class="work-content"><strong>${escapeHtml(name || 'Assigned client')}</strong><span>${escapeHtml(item.appointmentType || 'Visit')} · ${escapeHtml(item.status || '')}</span>${item.reason ? `<small>${escapeHtml(item.reason)}</small>` : ''}</div></article>`;
}

function evvCard(item) {
  const name = [item.preferredName || item.firstName, item.lastName].filter(Boolean).join(' ');
  const canClock = hasScope('evv:clock');
  const action = !item.clockInAt
    ? `<button class="small primary" data-evv-action="clock-in" data-id="${escapeHtml(item.id)}">Clock in</button>`
    : !item.clockOutAt
      ? `<button class="small primary" data-evv-action="clock-out" data-id="${escapeHtml(item.id)}">Clock out</button>`
      : item.status !== 'VERIFIED'
        ? `<button class="small primary" data-evv-action="complete" data-id="${escapeHtml(item.id)}">Verify visit</button>`
        : '<span class="status-ok">Verified</span>';
  return `<article class="work-card"><div class="work-time">${escapeHtml(formatTime(item.scheduledStart || item.clockInAt))}</div><div class="work-content"><strong>${escapeHtml(name || 'Assigned client')}</strong><span>${escapeHtml(item.serviceCode || 'Service')} · ${escapeHtml(item.status || 'OPEN')}</span><small>In ${escapeHtml(formatTime(item.clockInAt))} · Out ${escapeHtml(formatTime(item.clockOutAt))}</small>${canClock ? `<div class="actions">${action}</div>` : ''}</div></article>`;
}

const tripNext = {
  SCHEDULED: 'DISPATCHED', DISPATCHED: 'EN_ROUTE_TO_PICKUP', EN_ROUTE_TO_PICKUP: 'ARRIVED_PICKUP',
  ARRIVED_PICKUP: 'RIDER_ON_BOARD', RIDER_ON_BOARD: 'EN_ROUTE_TO_DESTINATION',
  EN_ROUTE_TO_DESTINATION: 'ARRIVED_DESTINATION', ARRIVED_DESTINATION: 'COMPLETED',
};
const tripLabel = {
  DISPATCHED: 'Accept trip', EN_ROUTE_TO_PICKUP: 'Start to pickup', ARRIVED_PICKUP: 'Arrived at pickup',
  RIDER_ON_BOARD: 'Rider onboard', EN_ROUTE_TO_DESTINATION: 'Start to destination',
  ARRIVED_DESTINATION: 'Arrived at destination', COMPLETED: 'Complete trip',
};
function tripCard(item) {
  const name = [item.riderFirstName, item.riderLastName].filter(Boolean).join(' ');
  const next = tripNext[item.status];
  const action = hasScope('transport:trips:update') && next
    ? `<button class="small primary" data-trip-id="${escapeHtml(item.id)}" data-trip-status="${next}">${escapeHtml(tripLabel[next] || next)}</button>` : '';
  return `<article class="trip-card"><div class="trip-head"><strong>${escapeHtml(name || 'Assigned rider')}</strong><span class="badge">${escapeHtml(item.status || '')}</span></div><p><b>Pickup:</b> ${escapeHtml([item.pickupName,item.pickupStreet,item.pickupCity].filter(Boolean).join(', '))}</p><p><b>Drop-off:</b> ${escapeHtml([item.dropoffName,item.dropoffStreet,item.dropoffCity].filter(Boolean).join(', '))}</p><small>${escapeHtml(formatTime(item.scheduledPickupAt))} · ${escapeHtml(item.serviceLevel || '')}</small>${action ? `<div class="actions">${action}</div>` : ''}</article>`;
}

async function loadToday() {
  state.work = await api('/api/mobile/work/today');
  const appointments = state.work.appointments || [];
  const evvVisits = state.work.evvVisits || [];
  const pane = $('todayPane');
  pane.innerHTML = `<div class="section-title"><h3>Today</h3><span>${appointments.length + evvVisits.length} item${appointments.length + evvVisits.length === 1 ? '' : 's'}</span></div>${appointments.length ? `<h4>Schedule</h4>${appointments.map(appointmentCard).join('')}` : ''}${evvVisits.length ? `<h4>Visits & EVV</h4>${evvVisits.map(evvCard).join('')}` : ''}${!appointments.length && !evvVisits.length ? '<div class="empty">No assigned visits or appointments today.</div>' : ''}`;
  $('transportPane').innerHTML = `<div class="section-title"><h3>Transportation</h3><span>${(state.work.trips || []).length} trips</span></div>${(state.work.trips || []).length ? state.work.trips.map(tripCard).join('') : '<div class="empty">No assigned transportation trips today.</div>'}`;
}

async function loadClients() {
  const data = await api('/api/mobile/my-shift');
  state.clients = data.patients || [];
  $('clientsPane').innerHTML = `<div class="section-title"><h3>Assigned clients</h3><span>${state.clients.length}</span></div>${state.clients.length ? state.clients.map((client) => `<button class="client-row" data-client-id="${escapeHtml(client.id)}"><span class="avatar">${escapeHtml((client.preferredName || client.firstName || '?').slice(0,1))}</span><span><strong>${escapeHtml([client.preferredName || client.firstName, client.lastName].filter(Boolean).join(' '))}</strong><small>${client.activeMedicationCount || 0} active medication${Number(client.activeMedicationCount) === 1 ? '' : 's'}</small></span><span>›</span></button>`).join('') : '<div class="empty">No clients are assigned to your field scope.</div>'}`;
}

async function loadAlerts() {
  if (!state.token) return;
  state.alerts = await api('/api/mobile/notifications');
  $('alertsPane').innerHTML = `<div class="section-title"><h3>Alerts</h3><span>${state.alerts.length}</span></div>${state.alerts.length ? state.alerts.map((alert) => `<article class="alert-card"><div><strong>${escapeHtml(alert.title)}</strong><span class="badge">${escapeHtml(alert.priority)}</span></div><p>${escapeHtml(alert.body)}</p><small>${escapeHtml(formatDateTime(alert.createdAt))} · ${escapeHtml(alert.status)}</small></article>`).join('') : '<div class="empty">No recent mobile alerts.</div>'}`;
}

async function location() {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 },
    );
  });
}

async function evvAction(action, id) {
  try {
    const gps = await location();
    if (action === 'complete') {
      const units = Number(window.prompt('Delivered units for this visit:', '1'));
      if (!Number.isFinite(units) || units <= 0) return;
      await api(`/api/mobile/evv/${encodeURIComponent(id)}/complete`, { method: 'POST', body: JSON.stringify({ units }) });
    } else {
      await api(`/api/mobile/evv/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify(gps) });
    }
    showMessage(action === 'clock-in' ? 'Clock-in recorded.' : action === 'clock-out' ? 'Clock-out recorded.' : 'Visit verified.');
    await loadToday();
  } catch (error) { showMessage(error.message, true); }
}

async function tripAction(id, status) {
  try {
    const gps = await location();
    await api(`/api/mobile/transport/trips/${encodeURIComponent(id)}/status`, {
      method: 'POST', body: JSON.stringify({ status, ...gps }),
    });
    showMessage('Transportation status updated.');
    await loadToday();
  } catch (error) { showMessage(error.message, true); }
}

async function openClient(patientId) {
  try {
    const [summary, logs] = await Promise.all([
      api(`/api/mobile/clients/${encodeURIComponent(patientId)}/summary`),
      hasScope('carelog:read') ? api(`/api/mobile/clients/${encodeURIComponent(patientId)}/care-logs`) : Promise.resolve([]),
    ]);
    const name = [summary.preferredName || summary.firstName, summary.lastName].filter(Boolean).join(' ');
    $('clientsPane').innerHTML = `<button id="backClients" class="ghost back">‹ Assigned clients</button><section class="client-detail"><h3>${escapeHtml(name)}</h3><p class="meta">MRN ${escapeHtml(summary.medicalRecordNumber || '—')}</p><div class="safety"><strong>Safety</strong><p>${(summary.allergies || []).length ? (summary.allergies || []).map((a) => `${escapeHtml(a.substance)}${a.reaction ? ` — ${escapeHtml(a.reaction)}` : ''}`).join('<br>') : 'No active allergies recorded'}</p></div>${hasScope('carelog:write') ? `<form id="careLogForm" class="panel"><h4>New care log</h4><textarea id="careLogBody" rows="6" placeholder="Document care provided, observations, client response, and follow-up needs." required></textarea><button class="primary" type="submit">Sign care log</button></form>` : ''}<h4>Recent care logs</h4>${logs.length ? logs.map((log) => `<article class="note-card"><strong>${escapeHtml(log.title || 'Care log')}</strong><p>${escapeHtml(log.body || '')}</p><small>${escapeHtml(formatDateTime(log.createdAt))} · ${escapeHtml(log.status)}</small></article>`).join('') : '<div class="empty">No recent care logs.</div>'}</section>`;
    $('backClients').onclick = loadClients;
    if ($('careLogForm')) $('careLogForm').onsubmit = async (event) => {
      event.preventDefault();
      try {
        await api(`/api/mobile/clients/${encodeURIComponent(patientId)}/care-logs`, {
          method: 'POST', body: JSON.stringify({ body: $('careLogBody').value, sign: true }),
        });
        showMessage('Care log signed and saved.');
        await openClient(patientId);
      } catch (error) { showMessage(error.message, true); }
    };
  } catch (error) { showMessage(error.message, true); }
}

function activateTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('#tabs button').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  ['today','clients','transport','alerts'].forEach((name) => { $(`${name}Pane`).hidden = name !== tab; });
}

async function refreshCurrent() {
  try {
    if (state.activeTab === 'clients' && hasScope('client:assigned:summary')) await loadClients();
    else if (state.activeTab === 'alerts') await loadAlerts();
    else await loadToday();
  } catch (error) { showMessage(error.message, true); }
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('loginError').hidden = true;
  try {
    await signIn($('identifier').value.trim(), $('password').value);
  } catch (error) {
    $('loginError').textContent = error.message;
    $('loginError').hidden = false;
  }
});
$('logoutButton').onclick = signOut;
$('refreshButton').onclick = refreshCurrent;
$('tabs').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-tab]');
  if (button) activateTab(button.dataset.tab);
});
$('todayPane').addEventListener('click', (event) => {
  const button = event.target.closest('[data-evv-action]');
  if (button) void evvAction(button.dataset.evvAction, button.dataset.id);
});
$('transportPane').addEventListener('click', (event) => {
  const button = event.target.closest('[data-trip-id]');
  if (button) void tripAction(button.dataset.tripId, button.dataset.tripStatus);
});
$('clientsPane').addEventListener('click', (event) => {
  const button = event.target.closest('[data-client-id]');
  if (button) void openClient(button.dataset.clientId);
});
