(() => {
  'use strict';

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra:admin:access-token', 'sulandra:access-token'];
  const token = TOKEN_KEYS.map((key) => sessionStorage.getItem(key)).find(Boolean) || '';
  const $ = (id) => document.getElementById(id);
  const state = { conversationId: '', lastUserMessage: '', status: null };

  if (!token) {
    location.replace('/employee-login.html?returnTo=/sia.html');
    return;
  }

  const toast = (message) => {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 3200);
  };

  async function api(path, options = {}) {
    const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(API + path, { ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      if (response.status === 401) location.replace('/employee-login.html?returnTo=/sia.html');
      throw new Error(payload.error || 'Your Sulandra account is not authorized for this action.');
    }
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload.data || payload;
  }

  function setPill(dotId, textId, ok, text) {
    const dot = $(dotId), label = $(textId);
    if (dot) dot.className = `dot ${ok ? 'ok' : 'warn'}`;
    if (label) label.textContent = text;
  }

  async function loadStatus() {
    try {
      const data = await api('/api/sia/status');
      state.status = data;
      setPill('aiDot', 'aiState', data.configured, data.configured ? 'SIA AI ready' : 'AI setup required');
      setPill('dbDot', 'dbState', data.database === 'available', data.database === 'available' ? 'Sulandra platform online' : 'Platform unavailable');
      $('summaryAi').textContent = data.configured ? 'Ready' : 'Setup';
      $('summaryModel').textContent = data.configured ? data.model : 'OpenAI key not connected';
      $('summaryPlatform').textContent = data.database === 'available' ? 'Online' : 'Unavailable';
      $('summaryLatency').textContent = `${data.databaseLatencyMs ?? '—'} ms database check`;
      $('summaryTickets').textContent = String(data.myOpenTickets ?? 0);
      const ai = $('healthAi');
      ai.querySelector('span').textContent = data.configured ? `Model: ${data.model}` : 'OPENAI_API_KEY is not configured on the Sulandra API service.';
      ai.querySelector('.badge').textContent = data.configured ? 'READY' : 'SETUP';
      ai.querySelector('.badge').className = `badge ${data.configured ? 'ok' : 'warn'}`;
      const platform = $('healthPlatform');
      platform.querySelector('span').textContent = `Database reachable in ${data.databaseLatencyMs ?? '—'} ms`;
      platform.querySelector('.badge').textContent = data.database === 'available' ? 'ONLINE' : 'DOWN';
      platform.querySelector('.badge').className = `badge ${data.database === 'available' ? 'ok' : 'bad'}`;
    } catch (error) {
      setPill('aiDot', 'aiState', false, 'SIA unavailable');
      setPill('dbDot', 'dbState', false, 'Platform check failed');
      $('summaryAi').textContent = 'Unavailable';
      $('summaryPlatform').textContent = 'Check';
      toast(error.message);
    }
  }

  function renderMessage(role, content) {
    const log = $('chatLog');
    $('welcome')?.remove();
    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'assistant' ? 'SIA' : 'YOU';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = content;
    wrap.append(avatar, bubble);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  }

  function clearChat() {
    state.conversationId = '';
    state.lastUserMessage = '';
    $('conversationSelect').value = '';
    $('chatLog').innerHTML = `<div id="welcome" class="welcome"><div class="sia-mark">SIA</div><h3>Your Sulandra IT specialist</h3><p>Describe what is not working, where it happened, and any error message you saw. SIA will separate confirmed facts from likely causes and give you a safe next step.</p><div class="quick-prompts"><button class="quick-prompt" type="button">I cannot sign in</button><button class="quick-prompt" type="button">A page is stuck loading</button><button class="quick-prompt" type="button">My schedule is not showing</button><button class="quick-prompt" type="button">SPIRE is showing an error</button><button class="quick-prompt" type="button">Help me troubleshoot my device</button></div></div>`;
    bindQuickPrompts();
    $('messageInput').focus();
  }

  async function loadConversations() {
    try {
      const data = await api('/api/sia/conversations');
      const select = $('conversationSelect');
      const current = state.conversationId;
      select.innerHTML = '<option value="">New conversation</option>';
      for (const item of data.conversations || []) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.title} (${item.messageCount || 0})`;
        select.appendChild(option);
      }
      if (current) select.value = current;
    } catch (error) { toast(error.message); }
  }

  async function openConversation(id) {
    if (!id) return clearChat();
    try {
      const data = await api(`/api/sia/conversations/${encodeURIComponent(id)}`);
      state.conversationId = id;
      $('chatLog').innerHTML = '';
      for (const message of data.messages || []) {
        renderMessage(message.role === 'assistant' ? 'assistant' : 'user', message.content);
        if (message.role === 'user') state.lastUserMessage = message.content;
      }
      $('conversationSelect').value = id;
    } catch (error) { toast(error.message); }
  }

  async function sendMessage() {
    const input = $('messageInput');
    const message = input.value.trim();
    if (!message) return;
    state.lastUserMessage = message;
    input.value = '';
    renderMessage('user', message);
    const button = $('sendButton');
    button.disabled = true;
    button.textContent = 'SIA is thinking…';
    try {
      const data = await api('/api/sia/chat', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: state.conversationId || undefined,
          message,
          context: { page: location.pathname, application: 'SIA', environment: 'production' },
        }),
      });
      state.conversationId = data.conversationId;
      renderMessage('assistant', data.answer);
      await Promise.all([loadConversations(), loadActivity()]);
    } catch (error) {
      renderMessage('assistant', `I could not complete that request: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Ask SIA';
      input.focus();
    }
  }

  async function loadRequests() {
    try {
      const data = await api('/api/employee/me/support');
      const list = $('requestsList');
      const requests = data.requests || [];
      if (!requests.length) {
        list.innerHTML = '<div class="empty">You do not have any support requests yet.</div>';
        return;
      }
      list.innerHTML = '';
      for (const item of requests) {
        const row = document.createElement('div');
        row.className = 'request-row';
        const info = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = item.subject;
        const meta = document.createElement('span');
        meta.textContent = `${item.category} · ${item.priority} · ${new Date(item.createdAt).toLocaleString()}`;
        info.append(strong, meta);
        const badge = document.createElement('b');
        badge.className = `badge ${['RESOLVED', 'CLOSED'].includes(item.status) ? 'ok' : item.priority === 'URGENT' ? 'bad' : 'warn'}`;
        badge.textContent = item.status;
        row.append(info, badge);
        list.appendChild(row);
      }
    } catch (error) { $('requestsList').innerHTML = `<div class="empty">${error.message}</div>`; }
  }

  async function loadActivity() {
    try {
      const data = await api('/api/sia/activity');
      const list = $('activityList');
      const rows = data.activity || [];
      if (!rows.length) {
        list.innerHTML = '<div class="empty">No SIA activity has been recorded yet.</div>';
        return;
      }
      list.innerHTML = '';
      for (const item of rows) {
        const row = document.createElement('div');
        row.className = 'activity-row';
        const info = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = item.action.replace(/_/g, ' ');
        const meta = document.createElement('span');
        meta.textContent = new Date(item.createdAt).toLocaleString();
        info.append(strong, meta);
        const badge = document.createElement('b');
        badge.className = `badge ${item.outcome === 'SUCCESS' || item.outcome === 'ACCEPTED' ? 'ok' : 'warn'}`;
        badge.textContent = item.outcome;
        row.append(info, badge);
        list.appendChild(row);
      }
    } catch (error) { $('activityList').innerHTML = `<div class="empty">${error.message}</div>`; }
  }

  function openTicketModal() {
    $('ticketConversation').value = state.conversationId || '';
    if (!$('ticketSubject').value) $('ticketSubject').value = state.lastUserMessage.slice(0, 120);
    if (!$('ticketDescription').value) $('ticketDescription').value = state.lastUserMessage;
    $('ticketModal').classList.add('open');
    $('ticketSubject').focus();
  }

  async function submitTicket() {
    const subject = $('ticketSubject').value.trim();
    const description = $('ticketDescription').value.trim();
    if (subject.length < 3 || description.length < 5) return toast('Add a subject and issue description.');
    const button = $('submitTicket');
    button.disabled = true;
    try {
      const data = await api('/api/sia/tickets', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: state.conversationId || undefined,
          subject,
          description,
          category: $('ticketCategory').value,
          priority: $('ticketPriority').value,
        }),
      });
      $('ticketModal').classList.remove('open');
      $('ticketSubject').value = '';
      $('ticketDescription').value = '';
      toast(`IT ticket ${data.id} created.`);
      await Promise.all([loadStatus(), loadRequests(), loadActivity()]);
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }

  function bindQuickPrompts() {
    document.querySelectorAll('.quick-prompt').forEach((button) => {
      button.addEventListener('click', () => {
        $('messageInput').value = button.textContent.trim();
        $('messageInput').focus();
      });
    });
  }

  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === button.dataset.panel));
    if (button.dataset.panel === 'requestsPanel') loadRequests();
    if (button.dataset.panel === 'activityPanel') loadActivity();
    if (button.dataset.panel === 'healthPanel') loadStatus();
  }));

  $('sendButton').addEventListener('click', sendMessage);
  $('messageInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  $('conversationSelect').addEventListener('change', (event) => openConversation(event.target.value));
  $('newConversation').addEventListener('click', clearChat);
  $('refreshHealth').addEventListener('click', loadStatus);
  $('openTicket').addEventListener('click', openTicketModal);
  $('ticketFromConversation').addEventListener('click', openTicketModal);
  $('cancelTicket').addEventListener('click', () => $('ticketModal').classList.remove('open'));
  $('submitTicket').addEventListener('click', submitTicket);
  $('ticketModal').addEventListener('click', (event) => { if (event.target === $('ticketModal')) $('ticketModal').classList.remove('open'); });

  bindQuickPrompts();
  Promise.all([loadStatus(), loadConversations(), loadRequests(), loadActivity()]);
})();
