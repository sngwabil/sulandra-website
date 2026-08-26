(() => {
  'use strict';

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra:admin:access-token', 'sulandra:access-token'];
  const token = TOKEN_KEYS.map((key) => sessionStorage.getItem(key)).find(Boolean) || '';
  const $ = (id) => document.getElementById(id);
  const state = { conversationId: '', lastUserMessage: '', status: null };
  const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

  if (!token) {
    location.replace('/employee-login.html?returnTo=/sia.html');
    return;
  }

  function installRichResponseStyles() {
    if (document.getElementById('siaSafeRichRendererStyles')) return;
    const style = document.createElement('style');
    style.id = 'siaSafeRichRendererStyles';
    style.textContent = `
      .message.assistant .bubble.sia-rich-content{white-space:normal;overflow-wrap:anywhere}
      .sia-rich-content>*:first-child{margin-top:0!important}.sia-rich-content>*:last-child{margin-bottom:0!important}
      .sia-rich-content p{margin:.45rem 0;line-height:1.58}.sia-rich-content h1,.sia-rich-content h2,.sia-rich-content h3,.sia-rich-content h4,.sia-rich-content h5,.sia-rich-content h6{color:#123f61;line-height:1.28;margin:1rem 0 .45rem;font-weight:900}
      .sia-rich-content h1{font-size:1.42rem}.sia-rich-content h2{font-size:1.3rem}.sia-rich-content h3{font-size:1.18rem}.sia-rich-content h4{font-size:1.08rem}.sia-rich-content h5,.sia-rich-content h6{font-size:1rem}
      .sia-rich-content ul,.sia-rich-content ol{margin:.45rem 0 .65rem;padding-left:1.45rem}.sia-rich-content li{margin:.22rem 0;line-height:1.52}.sia-rich-content li::marker{color:#0b6b9f;font-weight:800}
      .sia-rich-content strong{color:#153e5a;font-weight:900}.sia-rich-content code{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;font-size:.9em;background:#edf3f7;color:#173c55;border:1px solid #d8e4eb;border-radius:5px;padding:.12rem .32rem}
      .sia-rich-content pre{position:relative;margin:.75rem 0;background:#102433;color:#e9f4fb;border:1px solid #23475f;border-radius:10px;padding:14px 15px;overflow:auto;white-space:pre;line-height:1.5;tab-size:2}.sia-rich-content pre code{display:block;background:transparent;color:inherit;border:0;padding:0;font-size:.88rem;white-space:pre}
      .sia-rich-content .sia-code-language{display:block;margin:-3px 0 8px;color:#9fc5d9;font-size:10px;font-family:Inter,"Segoe UI",Arial,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
      .sia-rich-content a{color:#075b96;font-weight:800;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}.sia-rich-content a:hover{color:#083a67}.sia-rich-content a::after{content:" ↗";font-size:.78em}
      .sia-table-wrap{width:100%;overflow-x:auto;margin:.75rem 0;border:1px solid #d4e1ea;border-radius:10px;background:#fff}.sia-rich-content table{width:100%;min-width:520px;border-collapse:collapse;font-size:.92em}.sia-rich-content th,.sia-rich-content td{padding:9px 11px;border-right:1px solid #dce7ee;border-bottom:1px solid #dce7ee;text-align:left;vertical-align:top;line-height:1.45}.sia-rich-content th{background:#edf6fb;color:#174b70;font-weight:900}.sia-rich-content tr:last-child td{border-bottom:0}.sia-rich-content th:last-child,.sia-rich-content td:last-child{border-right:0}.sia-rich-content tbody tr:nth-child(even){background:#fbfdfe}
      .sia-rich-content .sia-unsafe-link{color:#6d7882;text-decoration:line-through;text-decoration-thickness:1px}.sia-rich-content .sia-raw-html-note{font-family:"SFMono-Regular",Consolas,monospace}
    `;
    document.head.appendChild(style);
  }

  function safeHref(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    try {
      const url = new URL(value, location.origin);
      return SAFE_LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function appendInlineMarkdown(parent, source) {
    const text = String(source ?? '');
    const pattern = /(`[^`\n]+`|\*\*[^*\n](?:.*?[^*\n])?\*\*|\[[^\]\n]+\]\([^\)\n]+\))/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const token = match[0];

      if (token.startsWith('`')) {
        const code = document.createElement('code');
        code.textContent = token.slice(1, -1);
        parent.appendChild(code);
      } else if (token.startsWith('**')) {
        const strong = document.createElement('strong');
        appendInlineMarkdown(strong, token.slice(2, -2));
        parent.appendChild(strong);
      } else {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const href = safeHref(linkMatch[2]);
          if (href) {
            const anchor = document.createElement('a');
            anchor.href = href;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer nofollow';
            appendInlineMarkdown(anchor, linkMatch[1]);
            parent.appendChild(anchor);
          } else {
            const blocked = document.createElement('span');
            blocked.className = 'sia-unsafe-link';
            blocked.title = 'SIA blocked a link using a disallowed or invalid protocol.';
            blocked.appendChild(document.createTextNode(linkMatch[1]));
            parent.appendChild(blocked);
          }
        } else {
          parent.appendChild(document.createTextNode(token));
        }
      }
      cursor = pattern.lastIndex;
    }

    if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function splitTableRow(line) {
    let value = String(line || '').trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    const cells = [];
    let current = '';
    let escaped = false;
    for (const char of value) {
      if (escaped) {
        current += char;
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '|') {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (escaped) current += '\\';
    cells.push(current.trim());
    return cells;
  }

  function isTableSeparator(line) {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function isBlockStart(lines, index) {
    const line = lines[index] || '';
    const next = lines[index + 1] || '';
    return /^\s*```/.test(line)
      || /^\s*~~~/.test(line)
      || /^\s*#{1,6}\s+/.test(line)
      || /^\s*[-+*]\s+/.test(line)
      || /^\s*\d+[.)]\s+/.test(line)
      || (line.includes('|') && isTableSeparator(next));
  }

  function renderMarkdown(source) {
    const fragment = document.createDocumentFragment();
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fenceMatch = line.match(/^\s*(```|~~~)\s*([A-Za-z0-9_+.#-]*)\s*$/);
      if (fenceMatch) {
        const fence = fenceMatch[1];
        const language = fenceMatch[2];
        index += 1;
        const codeLines = [];
        while (index < lines.length && !new RegExp(`^\\s*${fence}`).test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const pre = document.createElement('pre');
        if (language) {
          const label = document.createElement('span');
          label.className = 'sia-code-language';
          label.textContent = language;
          pre.appendChild(label);
        }
        const code = document.createElement('code');
        code.textContent = codeLines.join('\n');
        pre.appendChild(code);
        fragment.appendChild(pre);
        continue;
      }

      const headingMatch = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (headingMatch) {
        const heading = document.createElement(`h${headingMatch[1].length}`);
        appendInlineMarkdown(heading, headingMatch[2]);
        fragment.appendChild(heading);
        index += 1;
        continue;
      }

      const unorderedMatch = line.match(/^\s*[-+*]\s+(.+)$/);
      if (unorderedMatch) {
        const list = document.createElement('ul');
        while (index < lines.length) {
          const itemMatch = lines[index].match(/^\s*[-+*]\s+(.+)$/);
          if (!itemMatch) break;
          const item = document.createElement('li');
          appendInlineMarkdown(item, itemMatch[1]);
          list.appendChild(item);
          index += 1;
        }
        fragment.appendChild(list);
        continue;
      }

      const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (orderedMatch) {
        const list = document.createElement('ol');
        while (index < lines.length) {
          const itemMatch = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
          if (!itemMatch) break;
          const item = document.createElement('li');
          appendInlineMarkdown(item, itemMatch[1]);
          list.appendChild(item);
          index += 1;
        }
        fragment.appendChild(list);
        continue;
      }

      if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
        const headers = splitTableRow(line);
        index += 2;
        const rows = [];
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
          rows.push(splitTableRow(lines[index]));
          index += 1;
        }

        const wrap = document.createElement('div');
        wrap.className = 'sia-table-wrap';
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', 'SIA troubleshooting table');
        wrap.tabIndex = 0;
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headers.forEach((cellText) => {
          const th = document.createElement('th');
          th.scope = 'col';
          appendInlineMarkdown(th, cellText);
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        rows.forEach((row) => {
          const tr = document.createElement('tr');
          for (let cellIndex = 0; cellIndex < headers.length; cellIndex += 1) {
            const td = document.createElement('td');
            appendInlineMarkdown(td, row[cellIndex] ?? '');
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        fragment.appendChild(wrap);
        continue;
      }

      const paragraphLines = [line.trim()];
      index += 1;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }
      const paragraph = document.createElement('p');
      appendInlineMarkdown(paragraph, paragraphLines.join(' '));
      fragment.appendChild(paragraph);
    }

    return fragment;
  }

  window.SulandraSiaSafeRenderer = Object.freeze({
    version: '20260826-safe-rich-1',
    formats: Object.freeze(['bold', 'headings', 'unordered-lists', 'ordered-lists', 'inline-code', 'code-blocks', 'links', 'tables']),
    rawHtmlExecution: false,
    allowedLinkProtocols: Object.freeze([...SAFE_LINK_PROTOCOLS]),
    render: renderMarkdown,
  });

  installRichResponseStyles();

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
    bubble.className = `bubble${role === 'assistant' ? ' sia-rich-content' : ''}`;
    if (role === 'assistant') bubble.appendChild(renderMarkdown(content));
    else bubble.textContent = content;
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
