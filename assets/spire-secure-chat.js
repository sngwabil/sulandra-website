(() => {
  'use strict';

  // SPIRE_SECURE_CHAT_V2
  // Uses the existing client-scoped SPIRE message-thread, routing-pool and
  // In Basket backend. No local/demo chat data is fabricated.
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_NAME_KEY = 'spire:selected-service-home-name';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const CLIENT_KEY = 'spire:patientId'; // Existing backend/session key; visible terminology is Client.
  const params = new URLSearchParams(location.search);
  const state = { clientId: '', homeId: '', companyId: '', client: null, home: null, user: null, threads: [], pools: [], activeThreadId: '', active: null, detailTab: 'participants', pollTimer: null };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const initials = (value) => clean(value).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'SH';
  const currentUserId = () => clean(state.user?.id || state.user?.userId || state.user?.sub);
  const currentUserName = () => clean(state.user?.displayName || state.user?.name || state.user?.fullName || state.user?.email) || 'Current user';
  const clientName = () => clean(state.client?.name || state.client?.displayName || [state.client?.preferredName || state.client?.firstName, state.client?.lastName].filter(Boolean).join(' ')) || 'Client';

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const accessToken = token();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (state.companyId) headers.set('x-legal-entity-id', state.companyId);
    if (state.homeId && path.startsWith('/api/spire/')) headers.set('x-spire-home-id', state.homeId);
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

  function stationUrl() {
    const query = new URLSearchParams();
    if (state.companyId) query.set('company', state.companyId);
    if (state.homeId) query.set('spireHome', state.homeId);
    return `/spire/client-station.html${query.toString() ? `?${query}` : ''}`;
  }
  function chartUrl() {
    const query = new URLSearchParams({ patientId: state.clientId, spireHome: state.homeId, company: state.companyId });
    return `/spire/master.html?${query}`;
  }
  function loginUrl() {
    const returnTo = location.pathname + location.search + location.hash;
    return `/employee-login.html?return=${encodeURIComponent(returnTo)}`;
  }
  function fmtDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function shortTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    return date.toDateString() === today.toDateString() ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function setStatus(message, kind = '') {
    const node = $('#chatStatus');
    if (!node) return;
    node.textContent = message;
    node.className = `status${kind ? ` ${kind}` : ''}`;
  }

  async function verifyClientScope() {
    const data = await api(`/api/spire/network/service-homes/${encodeURIComponent(state.homeId)}/access`, { method: 'POST', body: JSON.stringify({}) });
    state.home = data?.home || null;
    const clients = Array.isArray(data?.patients) ? data.patients : [];
    state.client = clients.find((client) => clean(client.patientId || client.id) === state.clientId) || null;
    if (!state.client) throw Object.assign(new Error('This client is not available in the selected service home.'), { status: 403 });
    state.companyId = clean(state.home?.legalEntityId || state.companyId);
    $('#chatScope').textContent = `${clientName()} · ${state.home?.name || sessionStorage.getItem(HOME_NAME_KEY) || localStorage.getItem(HOME_NAME_KEY) || 'Service Home'}`;
  }

  async function loadPools() {
    try {
      const data = await api('/api/spire/routing-pools');
      state.pools = Array.isArray(data) ? data : [];
    } catch {
      state.pools = [];
    }
    const select = $('#newPool');
    if (!state.pools.length) {
      select.innerHTML = '<option value="">No clinical routing pools available</option>';
      return;
    }
    select.innerHTML = '<option value="">Choose a clinical routing pool…</option>' + state.pools.map((pool) => `<option value="${esc(pool.id)}">${esc(pool.name || pool.displayName || 'Clinical Team')} (${esc(pool.memberCount ?? '')})</option>`).join('');
  }

  async function loadOverview({ keepSelection = true } = {}) {
    const data = await api(`/api/spire/patients/${encodeURIComponent(state.clientId)}/communications/overview`);
    state.threads = Array.isArray(data?.threads) ? data.threads : [];
    if (!keepSelection || !state.threads.some((thread) => clean(thread.id) === state.activeThreadId)) state.activeThreadId = state.threads[0]?.id ? clean(state.threads[0].id) : '';
    renderConversations();
    if (state.activeThreadId) await loadThread(state.activeThreadId, { quiet: true });
    else { state.active = null; renderMessages(); renderDetails(); }
  }

  function filteredThreads() {
    const term = clean($('#conversationSearch')?.value).toLowerCase();
    if (!term) return state.threads;
    return state.threads.filter((thread) => [thread.subject, thread.threadType, thread.priority].some((value) => clean(value).toLowerCase().includes(term)));
  }

  function renderConversations() {
    const host = $('#conversationList');
    const threads = filteredThreads();
    if (!threads.length) {
      host.innerHTML = `<div class="empty">${state.threads.length ? 'No secure conversations match your search.' : 'No secure conversations for this client yet.<br><br>Use <b>New Conversation</b> to contact a clinical routing pool.'}</div>`;
      return;
    }
    host.innerHTML = threads.map((thread) => `<article class="conversation${clean(thread.id) === state.activeThreadId ? ' selected' : ''}" data-thread-id="${esc(thread.id)}">
      <div class="conv-avatar">${esc(initials(thread.subject || clientName()))}</div>
      <div><div class="conv-subject">${esc(thread.subject || 'Clinical conversation')}</div><div class="conv-preview">${esc([thread.threadType || 'Clinical', thread.priority || 'Normal'].join(' · '))}</div></div>
      <div class="conv-time">${esc(shortTime(thread.updatedAt || thread.createdAt))}</div>
    </article>`).join('');
    $$('.conversation', host).forEach((node) => node.addEventListener('click', () => loadThread(node.dataset.threadId).catch(showError)));
  }

  async function loadThread(threadId, { quiet = false } = {}) {
    state.activeThreadId = clean(threadId);
    if (!quiet) setStatus('Loading secure conversation…');
    const data = await api(`/api/spire/patients/${encodeURIComponent(state.clientId)}/communications/threads/${encodeURIComponent(state.activeThreadId)}`);
    state.active = data || null;
    renderConversations(); renderMessages(); renderDetails();
    $('#replyText').disabled = false;
    $('#sendReply').disabled = !clean($('#replyText').value);
    if (!quiet) setStatus('Secure conversation loaded.', 'success');
  }

  function messages() { return Array.isArray(state.active?.messages) ? state.active.messages : []; }
  function renderMessages() {
    const host = $('#messageList');
    const thread = state.active?.thread || null;
    $('#activeThreadTitle').textContent = thread?.subject || (state.activeThreadId ? 'Clinical conversation' : 'Select a conversation');
    $('#activeThreadMeta').textContent = thread ? `${clientName()} · ${thread.threadType || 'Clinical'} · ${thread.priority || 'Normal'} priority` : 'Client-scoped secure clinical messages';
    if (!thread) {
      host.innerHTML = '<div class="empty">Choose a conversation on the left, or start a new conversation.</div>';
      $('#replyText').disabled = true; $('#sendReply').disabled = true; return;
    }
    const rows = messages();
    if (!rows.length) { host.innerHTML = '<div class="empty">This conversation does not contain any messages yet.</div>'; return; }
    host.innerHTML = rows.map((message) => {
      const mine = currentUserId() && clean(message.senderUserId) === currentUserId();
      return `<div class="message${mine ? ' mine' : ''}"><div class="bubble"><div class="sender">${esc(message.senderDisplayName || (mine ? currentUserName() : 'Clinical Team Member'))}</div><div>${esc(message.body || '').replace(/\n/g, '<br>')}</div><div class="message-time">${esc(fmtDateTime(message.createdAt))}</div></div></div>`;
    }).join('');
    host.scrollTop = host.scrollHeight;
  }

  function poolName(poolId) {
    const pool = state.pools.find((item) => clean(item.id) === clean(poolId));
    return pool?.name || pool?.displayName || (poolId ? 'Clinical routing pool' : '');
  }

  function participantRecords() {
    const map = new Map();
    for (const message of messages()) {
      const senderId = clean(message.senderUserId || message.senderDisplayName);
      if (senderId && !map.has(`sender:${senderId}`)) map.set(`sender:${senderId}`, { name: message.senderDisplayName || (senderId === currentUserId() ? currentUserName() : 'Clinical Team Member'), meta: senderId === currentUserId() ? 'You' : 'Clinical sender' });
      const pool = poolName(message.recipientPoolId);
      if (pool && !map.has(`pool:${message.recipientPoolId}`)) map.set(`pool:${message.recipientPoolId}`, { name: pool, meta: 'Clinical routing pool' });
      const recipients = Array.isArray(message.recipients) ? message.recipients : [];
      for (const recipient of recipients) {
        const id = clean(recipient.userId);
        if (!id || map.has(`recipient:${id}`) || id === currentUserId()) continue;
        map.set(`recipient:${id}`, { name: 'Clinical Team Member', meta: recipient.readAt ? 'Read' : recipient.status || 'Delivered' });
      }
    }
    return [...map.values()];
  }

  function renderDetails() {
    const host = $('#detailPanel');
    const thread = state.active?.thread || null;
    if (!thread) { host.innerHTML = '<div class="empty">Select a conversation to view details.</div>'; return; }
    if (state.detailTab === 'details') {
      host.innerHTML = `<div class="section-title">Conversation Details</div>
        <div class="detail-card"><b>Subject</b><br>${esc(thread.subject || 'Clinical conversation')}</div>
        <div class="detail-card"><b>Client</b><br>${esc(clientName())}</div>
        <div class="detail-card"><b>Priority</b><br>${esc(thread.priority || 'NORMAL')}</div>
        <div class="detail-card"><b>Type</b><br>${esc(thread.threadType || 'CLINICAL')}</div>
        <div class="detail-card"><b>Messages</b><br>${messages().length}</div>
        <div class="detail-card"><b>Clinical scope</b><br>${esc(state.home?.name || 'Selected service home')}</div>`;
      return;
    }
    const participants = participantRecords();
    host.innerHTML = `<div class="section-title">Active Participants</div>${participants.length ? participants.map((participant) => `<div class="participant"><span class="part-avatar">${esc(initials(participant.name))}</span><span><div class="part-name">${esc(participant.name)}</div><div class="part-meta">${esc(participant.meta)}</div></span></div>`).join('') : '<div class="empty">Participant details will appear after messages are exchanged.</div>'}`;
  }

  async function sendReply() {
    const body = clean($('#replyText').value);
    if (!body || !state.activeThreadId) return;
    $('#sendReply').disabled = true;
    setStatus('Sending secure reply…');
    try {
      await api(`/api/spire/patients/${encodeURIComponent(state.clientId)}/communications/threads/${encodeURIComponent(state.activeThreadId)}/reply`, { method: 'POST', body: JSON.stringify({ body }) });
      $('#replyText').value = '';
      await loadOverview();
      setStatus('Secure reply sent and added to the clinical conversation.', 'success');
    } catch (error) { showError(error); $('#sendReply').disabled = false; }
  }

  function openNewConversation() {
    $('#newConversationPanel').classList.add('open');
    $('#newConversationPanel').setAttribute('aria-hidden', 'false');
    $('#newSubject').focus();
  }
  function closeNewConversation() {
    $('#newConversationPanel').classList.remove('open');
    $('#newConversationPanel').setAttribute('aria-hidden', 'true');
  }

  async function createConversation() {
    const recipientPoolId = clean($('#newPool').value);
    const subject = clean($('#newSubject').value);
    const body = clean($('#newBody').value);
    const priority = clean($('#newPriority').value) || 'NORMAL';
    if (!recipientPoolId || !subject || !body) { setStatus('Choose a routing pool and enter both a subject and message.', 'error'); return; }
    $('#createConversation').disabled = true;
    setStatus('Starting secure conversation…');
    try {
      const data = await api(`/api/spire/patients/${encodeURIComponent(state.clientId)}/communications/threads`, {
        method: 'POST',
        body: JSON.stringify({ subject, body, priority, threadType: 'CLINICAL', messageType: 'CLINICAL', recipientPoolId, senderDisplayName: currentUserName() }),
      });
      $('#newSubject').value = ''; $('#newBody').value = ''; $('#newPriority').value = 'NORMAL';
      closeNewConversation();
      state.activeThreadId = clean(data?.threadId);
      await loadOverview();
      setStatus('Secure conversation started and delivered to the selected clinical routing pool.', 'success');
    } catch (error) { showError(error); }
    finally { $('#createConversation').disabled = false; }
  }

  function showError(error) {
    console.error(error);
    setStatus(error?.message || 'Secure Chat could not complete the request.', 'error');
  }

  function wire() {
    $('#backStation').addEventListener('click', () => location.assign(stationUrl()));
    $('#backChart').addEventListener('click', () => location.assign(chartUrl()));
    $('#newConversation').addEventListener('click', openNewConversation);
    $('#newConversationSmall').addEventListener('click', openNewConversation);
    $('#closeNewConversation').addEventListener('click', closeNewConversation);
    $('#cancelNewConversation').addEventListener('click', closeNewConversation);
    $('#createConversation').addEventListener('click', () => createConversation());
    $('#refreshChat').addEventListener('click', () => loadOverview().catch(showError));
    $('#conversationSearch').addEventListener('input', renderConversations);
    $('#replyText').addEventListener('input', () => { $('#sendReply').disabled = !state.activeThreadId || !clean($('#replyText').value); });
    $('#replyText').addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); sendReply(); }
    });
    $('#sendReply').addEventListener('click', () => sendReply());
    $$('[data-detail-tab]').forEach((button) => button.addEventListener('click', () => {
      state.detailTab = button.dataset.detailTab || 'participants';
      $$('[data-detail-tab]').forEach((item) => item.classList.toggle('active', item === button));
      renderDetails();
    }));
    $('#newConversationPanel').addEventListener('pointerdown', (event) => { if (event.target === $('#newConversationPanel')) closeNewConversation(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNewConversation(); });
    window.SpireUserPreferences?.apply?.();
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => { if (!document.hidden) loadOverview().catch(() => {}); }, 15000);
  }

  async function bootstrap() {
    state.clientId = clean(params.get('patientId') || sessionStorage.getItem(CLIENT_KEY));
    state.homeId = clean(params.get('spireHome') || params.get('home') || sessionStorage.getItem(HOME_ID_KEY) || localStorage.getItem(HOME_ID_KEY));
    state.companyId = clean(params.get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || localStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY));
    if (!state.homeId || !state.clientId) { location.replace(stationUrl()); return; }
    try {
      state.user = await loadSession();
      wire();
      await verifyClientScope();
      await loadPools();
      await loadOverview({ keepSelection: false });
      setStatus('Secure Chat is ready. Messages are client-scoped and audited by SPIRE.', 'success');
      startPolling();
    } catch (error) {
      if (error.status === 401) { location.replace(loginUrl()); return; }
      showError(error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
