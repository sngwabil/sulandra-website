(() => {
  'use strict';

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra:admin:access-token', 'sulandra:access-token'];
  const token = TOKEN_KEYS.map((key) => sessionStorage.getItem(key)).find(Boolean) || '';
  const $ = (id) => document.getElementById(id);
  const state = { conversationId: '', lastUserMessage: '', status: null, identity: null, attachment: null, busy: false };
  const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
  const ADMIN_ROLES = new Set(['ADMINISTRATOR', 'PROGRAM_MANAGER', 'HR_MANAGER', 'CEO', 'DOO']);

  if (!token) {
    location.replace('/employee-login.html?returnTo=/sia.html');
    return;
  }

  function installFutureTheme() {
    if (document.getElementById('siaFutureTheme')) return;
    const link = document.createElement('link');
    link.id = 'siaFutureTheme';
    link.rel = 'stylesheet';
    link.href = '/assets/sia-futuristic.css?v=20260827-sia-intelligence-router-1';
    document.head.appendChild(link);
  }

  function installRichResponseStyles() {
    if (document.getElementById('siaSafeRichRendererStyles')) return;
    const style = document.createElement('style');
    style.id = 'siaSafeRichRendererStyles';
    style.textContent = `
      .message.assistant .bubble.sia-rich-content{white-space:normal;overflow-wrap:anywhere}
      .sia-rich-content>*:first-child{margin-top:0!important}.sia-rich-content>*:last-child{margin-bottom:0!important}
      .sia-rich-content p{margin:.45rem 0;line-height:1.62}.sia-rich-content h1,.sia-rich-content h2,.sia-rich-content h3,.sia-rich-content h4,.sia-rich-content h5,.sia-rich-content h6{line-height:1.28;margin:1rem 0 .45rem;font-weight:900}
      .sia-rich-content h1{font-size:1.42rem}.sia-rich-content h2{font-size:1.3rem}.sia-rich-content h3{font-size:1.18rem}.sia-rich-content h4{font-size:1.08rem}.sia-rich-content h5,.sia-rich-content h6{font-size:1rem}
      .sia-rich-content ul,.sia-rich-content ol{margin:.45rem 0 .65rem;padding-left:1.45rem}.sia-rich-content li{margin:.22rem 0;line-height:1.55}
      .sia-rich-content code{font-family:"SFMono-Regular",Consolas,"Liberation Mono",monospace;font-size:.9em;border-radius:6px;padding:.12rem .34rem}
      .sia-rich-content pre{position:relative;margin:.75rem 0;background:#030816;color:#edf5ff;border:1px solid rgba(157,132,255,.22);border-radius:12px;padding:14px 15px;overflow:auto;white-space:pre;line-height:1.5;tab-size:2}.sia-rich-content pre code{display:block;background:transparent!important;color:inherit!important;border:0!important;padding:0;font-size:.88rem;white-space:pre}
      .sia-rich-content .sia-code-language{display:block;margin:-3px 0 8px;color:#aabce0;font-size:10px;font-family:Inter,"Segoe UI",Arial,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
      .sia-rich-content a{font-weight:850;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}.sia-rich-content a::after{content:" ↗";font-size:.78em}
      .sia-table-wrap{width:100%;overflow-x:auto;margin:.75rem 0;border:1px solid rgba(157,132,255,.20);border-radius:12px;background:rgba(4,10,25,.7)}.sia-rich-content table{width:100%;min-width:520px;border-collapse:collapse;font-size:.92em}.sia-rich-content th,.sia-rich-content td{padding:9px 11px;border-right:1px solid rgba(157,132,255,.12);border-bottom:1px solid rgba(157,132,255,.12);text-align:left;vertical-align:top;line-height:1.45}.sia-rich-content th{background:rgba(124,60,255,.14);font-weight:900}.sia-rich-content tr:last-child td{border-bottom:0}.sia-rich-content th:last-child,.sia-rich-content td:last-child{border-right:0}
      .sia-rich-content .sia-unsafe-link{color:#8892aa;text-decoration:line-through}
    `;
    document.head.appendChild(style);
  }

  function safeHref(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    try {
      const url = new URL(value, location.origin);
      return SAFE_LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function appendInlineMarkdown(parent, source) {
    const text = String(source ?? '');
    const pattern = /(`[^`\n]+`|\*\*[^*\n](?:.*?[^*\n])?\*\*|\[[^\]\n]+\]\([^\)\n]+\))/g;
    let cursor = 0, match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const tokenValue = match[0];
      if (tokenValue.startsWith('`')) {
        const code = document.createElement('code');
        code.textContent = tokenValue.slice(1, -1);
        parent.appendChild(code);
      } else if (tokenValue.startsWith('**')) {
        const strong = document.createElement('strong');
        appendInlineMarkdown(strong, tokenValue.slice(2, -2));
        parent.appendChild(strong);
      } else {
        const linkMatch = tokenValue.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const href = linkMatch ? safeHref(linkMatch[2]) : null;
        if (linkMatch && href) {
          const anchor = document.createElement('a');
          anchor.href = href;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer nofollow';
          appendInlineMarkdown(anchor, linkMatch[1]);
          parent.appendChild(anchor);
        } else if (linkMatch) {
          const blocked = document.createElement('span');
          blocked.className = 'sia-unsafe-link';
          blocked.textContent = linkMatch[1];
          parent.appendChild(blocked);
        } else parent.appendChild(document.createTextNode(tokenValue));
      }
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function splitTableRow(line) {
    let value = String(line || '').trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    return value.split('|').map((cell) => cell.trim());
  }

  function isTableSeparator(line) {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function isBlockStart(lines, index) {
    const line = lines[index] || '', next = lines[index + 1] || '';
    return /^\s*(```|~~~)/.test(line) || /^\s*#{1,6}\s+/.test(line) || /^\s*[-+*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || (line.includes('|') && isTableSeparator(next));
  }

  function renderMarkdown(source) {
    const fragment = document.createDocumentFragment();
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      const fence = line.match(/^\s*(```|~~~)\s*([A-Za-z0-9_+.#-]*)\s*$/);
      if (fence) {
        const codeLines = [], marker = fence[1], language = fence[2];
        index += 1;
        while (index < lines.length && !new RegExp(`^\\s*${marker}`).test(lines[index])) codeLines.push(lines[index++]);
        if (index < lines.length) index += 1;
        const pre = document.createElement('pre');
        if (language) { const label = document.createElement('span'); label.className = 'sia-code-language'; label.textContent = language; pre.appendChild(label); }
        const code = document.createElement('code'); code.textContent = codeLines.join('\n'); pre.appendChild(code); fragment.appendChild(pre); continue;
      }
      const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) { const node = document.createElement(`h${heading[1].length}`); appendInlineMarkdown(node, heading[2]); fragment.appendChild(node); index += 1; continue; }
      const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
      if (unordered) {
        const list = document.createElement('ul');
        while (index < lines.length) { const itemMatch = lines[index].match(/^\s*[-+*]\s+(.+)$/); if (!itemMatch) break; const item = document.createElement('li'); appendInlineMarkdown(item, itemMatch[1]); list.appendChild(item); index += 1; }
        fragment.appendChild(list); continue;
      }
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (ordered) {
        const list = document.createElement('ol');
        while (index < lines.length) { const itemMatch = lines[index].match(/^\s*\d+[.)]\s+(.+)$/); if (!itemMatch) break; const item = document.createElement('li'); appendInlineMarkdown(item, itemMatch[1]); list.appendChild(item); index += 1; }
        fragment.appendChild(list); continue;
      }
      if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
        const headers = splitTableRow(line); index += 2; const rows = [];
        while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(splitTableRow(lines[index++]));
        const wrap = document.createElement('div'); wrap.className = 'sia-table-wrap';
        const table = document.createElement('table'), thead = document.createElement('thead'), hr = document.createElement('tr');
        headers.forEach((text) => { const th = document.createElement('th'); appendInlineMarkdown(th, text); hr.appendChild(th); }); thead.appendChild(hr); table.appendChild(thead);
        const tbody = document.createElement('tbody'); rows.forEach((row) => { const tr = document.createElement('tr'); headers.forEach((_, i) => { const td = document.createElement('td'); appendInlineMarkdown(td, row[i] ?? ''); tr.appendChild(td); }); tbody.appendChild(tr); }); table.appendChild(tbody); wrap.appendChild(table); fragment.appendChild(wrap); continue;
      }
      const paragraphLines = [line.trim()]; index += 1;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) paragraphLines.push(lines[index++].trim());
      const paragraph = document.createElement('p'); appendInlineMarkdown(paragraph, paragraphLines.join(' ')); fragment.appendChild(paragraph);
    }
    return fragment;
  }

  installFutureTheme();
  installRichResponseStyles();

  const toast = (message) => {
    const node = $('toast'); if (!node) return;
    node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 3500);
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

  function localTimeContext() {
    const now = new Date();
    let clientTimeZone = '';
    try { clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
    return {
      clientLocalDateTime: now.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'long' }),
      clientTimeZone,
      clientUtcOffsetMinutes: now.getTimezoneOffset(),
      clientLocale: navigator.language || '',
    };
  }

  function normalizeRole(session) { return String(session?.role || session?.user?.role || session?.profile?.role || '').toUpperCase(); }
  function adminAllowed(session) {
    const role = normalizeRole(session), permissions = Array.isArray(session?.permissions) ? session.permissions : [];
    const backendAccess = Boolean(session?.access?.administration || session?.user?.access?.administration);
    return ADMIN_ROLES.has(role) && (backendAccess || permissions.includes('SULANDRA_ADMINISTRATION_ACCESS') || role === 'ADMINISTRATOR');
  }

  async function loadIdentity() {
    try {
      const identity = await api('/api/auth/me');
      state.identity = identity;
      return identity;
    } catch { return null; }
  }

  function setPill(dotId, textId, ok, text) {
    const dot = $(dotId), label = $(textId);
    if (dot) dot.className = `dot ${ok ? 'ok' : 'warn'}`;
    if (label) label.textContent = text;
  }

  function updateAdminStatus(data) {
    const tools = document.querySelector('.conversation-tools');
    if (!tools) return;
    let node = $('siaAdminStatus');
    if (!node) { node = document.createElement('span'); node.id = 'siaAdminStatus'; node.className = 'sia-admin-status'; tools.appendChild(node); }
    const roleAccess = Boolean(data?.currentUser?.adminAccess);
    const sessionAccess = state.identity ? adminAllowed(state.identity) : roleAccess;
    node.className = `sia-admin-status${sessionAccess ? ' allowed' : ''}`;
    node.textContent = sessionAccess ? 'Admin access verified' : 'Employee access';
  }

  async function loadStatus() {
    try {
      const data = await api('/api/sia/status'); state.status = data;
      setPill('aiDot', 'aiState', data.configured, data.configured ? 'SIA AI ready' : 'AI setup required');
      setPill('dbDot', 'dbState', data.database === 'available', data.database === 'available' ? 'Sulandra platform online' : 'Platform unavailable');
      $('summaryAi').textContent = data.configured ? 'Ready' : 'Setup'; $('summaryModel').textContent = data.configured ? data.model : 'AI not configured';
      $('summaryPlatform').textContent = data.database === 'available' ? 'Online' : 'Unavailable'; $('summaryLatency').textContent = `${data.databaseLatencyMs ?? '—'} ms database check`; $('summaryTickets').textContent = String(data.myOpenTickets ?? 0);
      const ai = $('healthAi'); if (ai) { ai.querySelector('span').textContent = data.configured ? `Model: ${data.model}` : 'AI service is not configured.'; ai.querySelector('.badge').textContent = data.configured ? 'READY' : 'SETUP'; ai.querySelector('.badge').className = `badge ${data.configured ? 'ok' : 'warn'}`; }
      const platform = $('healthPlatform'); if (platform) { platform.querySelector('span').textContent = `Database reachable in ${data.databaseLatencyMs ?? '—'} ms`; platform.querySelector('.badge').textContent = data.database === 'available' ? 'ONLINE' : 'DOWN'; platform.querySelector('.badge').className = `badge ${data.database === 'available' ? 'ok' : 'bad'}`; }
      updateAdminStatus(data);
    } catch (error) { setPill('aiDot', 'aiState', false, 'SIA unavailable'); setPill('dbDot', 'dbState', false, 'Platform check failed'); toast(error.message); }
  }

  function addMessageActions(wrap, content) {
    const actions = document.createElement('div'); actions.className = 'sia-message-actions';
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'sia-message-action'; copy.textContent = 'Copy';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(content); copy.textContent = 'Copied'; setTimeout(() => copy.textContent = 'Copy', 1200); } catch { toast('Unable to copy this response.'); } });
    actions.appendChild(copy); wrap.querySelector('.bubble')?.appendChild(actions);
  }

  function renderMessage(role, content, options = {}) {
    const log = $('chatLog'); $('welcome')?.remove();
    const wrap = document.createElement('div'); wrap.className = `message ${role}`;
    const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = role === 'assistant' ? 'SIA' : 'YOU';
    const bubble = document.createElement('div'); bubble.className = `bubble${role === 'assistant' ? ' sia-rich-content' : ''}`;
    if (role === 'assistant') {
      if (options.modeLabel) { const mode = document.createElement('span'); mode.className = 'sia-mode-badge'; mode.textContent = options.modeLabel; bubble.appendChild(mode); }
      bubble.appendChild(renderMarkdown(content));
    } else bubble.textContent = content;
    if (options.attachmentName && role === 'user') { const tag = document.createElement('div'); tag.style.cssText = 'margin-top:8px;font-size:11px;opacity:.8'; tag.textContent = `📎 ${options.attachmentName}`; bubble.appendChild(tag); }
    wrap.append(avatar, bubble); log.appendChild(wrap); if (role === 'assistant' && !options.noActions) addMessageActions(wrap, content);
    log.scrollTop = log.scrollHeight; return wrap;
  }

  function showTyping() {
    const wrap = renderMessage('assistant', '', { noActions: true }); wrap.id = 'siaTypingMessage';
    const bubble = wrap.querySelector('.bubble'); bubble.innerHTML = '<span class="sia-typing" aria-label="SIA is thinking"><i></i><i></i><i></i></span>';
  }
  function hideTyping() { $('siaTypingMessage')?.remove(); }

  function welcomeHtml() {
    return `<div id="welcome" class="welcome"><div class="sia-mark">SIA</div><h3>Ask SIA anything</h3><p>SIA automatically chooses General, Sulandra, or Clinical-safe mode from your question. Ask for explanations, writing, current information, Sulandra help, or safe clinical education.</p><div class="quick-prompts"><button class="quick-prompt" type="button">What day and time is it?</button><button class="quick-prompt" type="button">Explain a topic to me</button><button class="quick-prompt" type="button">Where is my schedule?</button><button class="quick-prompt" type="button">Show my open work</button><button class="quick-prompt" type="button">Help me with this page</button></div></div>`;
  }

  function clearChat() {
    state.conversationId = ''; state.lastUserMessage = ''; state.attachment = null; $('conversationSelect').value = ''; $('chatLog').innerHTML = welcomeHtml(); clearAttachmentUi(); bindQuickPrompts(); $('messageInput').focus();
  }

  async function loadConversations() {
    try {
      const data = await api('/api/sia/conversations'), select = $('conversationSelect'), current = state.conversationId;
      select.innerHTML = '<option value="">New conversation</option>';
      for (const item of data.conversations || []) { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.title} (${item.messageCount || 0})`; select.appendChild(option); }
      if (current) select.value = current;
    } catch (error) { toast(error.message); }
  }

  async function openConversation(id) {
    if (!id) return clearChat();
    try {
      const data = await api(`/api/sia/conversations/${encodeURIComponent(id)}`); state.conversationId = id; $('chatLog').innerHTML = '';
      for (const message of data.messages || []) { renderMessage(message.role === 'assistant' ? 'assistant' : 'user', message.content); if (message.role === 'user') state.lastUserMessage = message.content; }
      $('conversationSelect').value = id;
    } catch (error) { toast(error.message); }
  }

  function autoResize() { const input = $('messageInput'); input.style.height = 'auto'; input.style.height = `${Math.min(180, Math.max(48, input.scrollHeight))}px`; }

  async function sendMessage() {
    if (state.busy) return;
    const input = $('messageInput'); let message = input.value.trim();
    if (!message && state.attachment) message = 'Please troubleshoot the error shown in this screenshot.';
    if (!message) return;
    const attachment = state.attachment; state.lastUserMessage = message; input.value = ''; autoResize();
    renderMessage('user', message, { attachmentName: attachment?.name }); clearAttachmentUi(); state.attachment = null;
    state.busy = true; const button = $('sendButton'); button.disabled = true; showTyping();
    try {
      const data = await api('/api/sia/chat', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: state.conversationId || undefined,
          message,
          attachment: attachment ? { name: attachment.name, mimeType: attachment.mimeType, dataUrl: attachment.dataUrl } : undefined,
          context: {
            supportWorkspacePage: location.pathname,
            application: 'SIA support workspace',
            environment: 'production',
            ...localTimeContext(),
          },
        }),
      });
      hideTyping(); state.conversationId = data.conversationId; renderMessage('assistant', data.answer, { modeLabel: data.modeLabel || '' }); await Promise.all([loadConversations(), loadActivity()]);
    } catch (error) { hideTyping(); renderMessage('assistant', `I could not complete that request: **${error.message}**`); }
    finally { state.busy = false; button.disabled = false; input.focus(); }
  }

  async function prepareImage(file) {
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!file || !allowed.has(file.type)) throw new Error('Attach a PNG, JPG, or WEBP screenshot.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Screenshot must be 10 MB or smaller.');
    const raw = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(file); });
    if (file.size <= 2.5 * 1024 * 1024) return { name: file.name || 'screenshot', mimeType: file.type, dataUrl: raw };
    const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = raw; });
    const max = 1800, scale = Math.min(1, max / Math.max(image.width, image.height)), canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return { name: file.name || 'screenshot.webp', mimeType: 'image/webp', dataUrl: canvas.toDataURL('image/webp', .9) };
  }

  function clearAttachmentUi() { const strip = $('siaAttachmentStrip'); if (strip) { strip.classList.remove('show'); strip.innerHTML = ''; } const file = $('siaScreenshotInput'); if (file) file.value = ''; }

  async function attachFile(file) {
    try {
      const image = await prepareImage(file); state.attachment = image;
      const strip = $('siaAttachmentStrip'); strip.innerHTML = '';
      const chip = document.createElement('div'); chip.className = 'sia-attachment-chip';
      const preview = document.createElement('img'); preview.src = image.dataUrl; preview.alt = 'Screenshot preview';
      const label = document.createElement('span'); label.textContent = image.name;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove screenshot'); remove.addEventListener('click', () => { state.attachment = null; clearAttachmentUi(); });
      chip.append(preview, label, remove); strip.appendChild(chip); strip.classList.add('show');
      if (!$('messageInput').value.trim()) $('messageInput').placeholder = 'Tell SIA what is happening in this screenshot…';
    } catch (error) { toast(error.message); }
  }

  function installAttachmentUi() {
    const composer = document.querySelector('.composer'), box = document.querySelector('.composer-box'), input = $('messageInput');
    if (!composer || !box || !input || $('siaScreenshotInput')) return;
    const strip = document.createElement('div'); strip.id = 'siaAttachmentStrip'; strip.className = 'sia-attachment-strip'; composer.insertBefore(strip, box);
    const file = document.createElement('input'); file.id = 'siaScreenshotInput'; file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true; file.addEventListener('change', () => attachFile(file.files?.[0]));
    const attach = document.createElement('button'); attach.type = 'button'; attach.className = 'sia-attach-button'; attach.title = 'Attach error screenshot'; attach.setAttribute('aria-label', 'Attach error screenshot'); attach.textContent = '+'; attach.addEventListener('click', () => file.click());
    box.insertBefore(attach, input); box.appendChild(file);
    input.addEventListener('input', autoResize);
    input.addEventListener('paste', (event) => { const imageItem = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith('image/')); if (imageItem) { event.preventDefault(); attachFile(imageItem.getAsFile()); } });
    for (const type of ['dragenter', 'dragover']) composer.addEventListener(type, (event) => { event.preventDefault(); composer.classList.add('sia-drop-active'); });
    for (const type of ['dragleave', 'drop']) composer.addEventListener(type, (event) => { event.preventDefault(); composer.classList.remove('sia-drop-active'); });
    composer.addEventListener('drop', (event) => { const imageFile = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith('image/')); if (imageFile) attachFile(imageFile); });
  }

  async function loadRequests() {
    try {
      const data = await api('/api/employee/me/support'), list = $('requestsList'), requests = data.requests || [];
      if (!requests.length) { list.innerHTML = '<div class="empty">You do not have any support requests yet.</div>'; return; }
      list.innerHTML = '';
      for (const item of requests) { const row = document.createElement('div'); row.className = 'request-row'; const info = document.createElement('div'), strong = document.createElement('strong'), meta = document.createElement('span'); strong.textContent = item.subject; meta.textContent = `${item.category} · ${item.priority} · ${new Date(item.createdAt).toLocaleString()}`; info.append(strong, meta); const badge = document.createElement('b'); badge.className = `badge ${['RESOLVED', 'CLOSED'].includes(item.status) ? 'ok' : item.priority === 'URGENT' ? 'bad' : 'warn'}`; badge.textContent = item.status; row.append(info, badge); list.appendChild(row); }
    } catch (error) { $('requestsList').innerHTML = `<div class="empty">${error.message}</div>`; }
  }

  async function loadActivity() {
    try {
      const data = await api('/api/sia/activity'), list = $('activityList'), rows = data.activity || [];
      if (!rows.length) { list.innerHTML = '<div class="empty">No SIA activity has been recorded yet.</div>'; return; }
      list.innerHTML = '';
      for (const item of rows) { const row = document.createElement('div'); row.className = 'activity-row'; const info = document.createElement('div'), strong = document.createElement('strong'), meta = document.createElement('span'); strong.textContent = item.action.replace(/_/g, ' '); meta.textContent = new Date(item.createdAt).toLocaleString(); info.append(strong, meta); const badge = document.createElement('b'); badge.className = `badge ${['SUCCESS', 'ACCEPTED'].includes(item.outcome) ? 'ok' : 'warn'}`; badge.textContent = item.outcome; row.append(info, badge); list.appendChild(row); }
    } catch (error) { $('activityList').innerHTML = `<div class="empty">${error.message}</div>`; }
  }

  function openTicketModal() { $('ticketConversation').value = state.conversationId || ''; if (!$('ticketSubject').value) $('ticketSubject').value = state.lastUserMessage.slice(0, 120); if (!$('ticketDescription').value) $('ticketDescription').value = state.lastUserMessage; $('ticketModal').classList.add('open'); $('ticketSubject').focus(); }
  async function submitTicket() {
    const subject = $('ticketSubject').value.trim(), description = $('ticketDescription').value.trim(); if (subject.length < 3 || description.length < 5) return toast('Add a subject and issue description.');
    const button = $('submitTicket'); button.disabled = true;
    try { const data = await api('/api/sia/tickets', { method: 'POST', body: JSON.stringify({ conversationId: state.conversationId || undefined, subject, description, category: $('ticketCategory').value, priority: $('ticketPriority').value }) }); $('ticketModal').classList.remove('open'); $('ticketSubject').value = ''; $('ticketDescription').value = ''; toast(`IT ticket ${data.id} created.`); await Promise.all([loadStatus(), loadRequests(), loadActivity()]); }
    catch (error) { toast(error.message); } finally { button.disabled = false; }
  }

  function bindQuickPrompts() { document.querySelectorAll('.quick-prompt').forEach((button) => button.addEventListener('click', () => { $('messageInput').value = button.textContent.trim(); autoResize(); $('messageInput').focus(); })); }

  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab === button)); document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === button.dataset.panel)); if (button.dataset.panel === 'requestsPanel') loadRequests(); if (button.dataset.panel === 'activityPanel') loadActivity(); if (button.dataset.panel === 'healthPanel') loadStatus(); }));
  $('sendButton').addEventListener('click', sendMessage);
  $('messageInput').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
  $('conversationSelect').addEventListener('change', (event) => openConversation(event.target.value)); $('newConversation').addEventListener('click', clearChat); $('refreshHealth').addEventListener('click', loadStatus); $('openTicket').addEventListener('click', openTicketModal); $('ticketFromConversation').addEventListener('click', openTicketModal); $('cancelTicket').addEventListener('click', () => $('ticketModal').classList.remove('open')); $('submitTicket').addEventListener('click', submitTicket); $('ticketModal').addEventListener('click', (event) => { if (event.target === $('ticketModal')) $('ticketModal').classList.remove('open'); });

  installAttachmentUi(); bindQuickPrompts(); autoResize();
  Promise.all([loadIdentity(), loadStatus(), loadConversations(), loadRequests(), loadActivity()]).then(() => updateAdminStatus(state.status));
})();
