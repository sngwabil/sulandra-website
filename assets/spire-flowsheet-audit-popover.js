(() => {
  'use strict';

  // SPIRE_FLOWSHEET_AUDIT_POPOVER_V1
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const POPOVER_ID = 'spireFlowsheetAuditPopover';
  const STYLE_ID = 'spireFlowsheetAuditPopoverStyle';
  const directory = new Map();
  const workspaceCache = new Map();
  let identityPromise = null;
  let activeCell = null;
  let pinned = false;
  let decorateQueued = false;
  let suppressNextClick = false;

  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
  const asArray = (value) => Array.isArray(value) ? value : [];

  function token() {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of TOKEN_KEYS) {
        const value = storage.getItem(key);
        if (value) return value;
      }
    }
    return '';
  }

  async function api(path) {
    if (typeof window.api === 'function') return window.api(path);
    const headers = new Headers({ Accept:'application/json' });
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, { headers, cache:'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.error || payload?.message || `Request failed (${response.status})`);
    return payload?.data ?? payload;
  }

  function patientId() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return clean(hash.get('patient') || query.get('patientId') || sessionStorage.getItem('spire:patientId'));
  }

  function isoMinute(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    date.setSeconds(0, 0);
    return date.toISOString();
  }

  function formatDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '';
  }

  function label(identity = {}) {
    const explicit = clean(identity.displayLabel);
    if (explicit) return explicit;
    const name = clean(identity.displayName || identity.name || identity.fullName || identity.email || identity.id || identity.userId || 'Unknown user');
    const credential = clean(identity.credentials || identity.credentialLabel);
    return credential && !name.toUpperCase().endsWith(`, ${credential.toUpperCase()}`) ? `${name}, ${credential}` : name;
  }

  async function currentIdentity() {
    if (!identityPromise) {
      identityPromise = api('/api/spire/clinical-identity').then((value) => {
        const id = clean(value?.id || value?.userId);
        if (id) directory.set(id, value);
        if (value?.email) directory.set(clean(value.email), value);
        return value || null;
      }).catch(() => null);
    }
    return identityPromise;
  }

  function looksLikeUserId(value) {
    const input = clean(value);
    return /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(input) || (/^[A-Za-z0-9_-]{24,}$/.test(input) && !input.includes('@'));
  }

  async function resolveAuthor(authorToken) {
    const candidate = clean(authorToken).replace(/^by\s+/i, '').replace(/^Filed by\s+/i, '');
    if (!candidate) return '';
    if (directory.has(candidate)) return label(directory.get(candidate));
    const identity = await currentIdentity();
    if (identity && [identity.id, identity.userId, identity.email].map(clean).includes(candidate)) return label(identity);
    if (looksLikeUserId(candidate)) {
      try {
        const result = await api(`/api/spire/clinical-users?ids=${encodeURIComponent(candidate)}`);
        const items = asArray(result?.items || result);
        if (items[0]) {
          directory.set(candidate, items[0]);
          if (items[0]?.email) directory.set(clean(items[0].email), items[0]);
          return label(items[0]);
        }
      } catch {}
    }
    if (candidate.includes('@')) {
      const current = await currentIdentity();
      if (current && clean(current.email).toLowerCase() === candidate.toLowerCase()) return label(current);
    }
    return candidate;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #flowsheets-view [data-flow-cell].spire-flow-filed-cell{position:relative!important}
      #flowsheets-view [data-flow-cell].spire-flow-filed-cell:hover{box-shadow:inset 0 0 0 1px rgba(38,105,148,.32)}
      #${POPOVER_ID}{position:fixed;z-index:12000;display:none;width:min(360px,calc(100vw - 20px));background:#fff;border:1px solid #426b89;border-radius:5px;box-shadow:0 10px 32px rgba(15,23,42,.32);font-family:"Segoe UI",Arial,sans-serif;color:#173247;overflow:hidden}
      #${POPOVER_ID}.open{display:block}
      #${POPOVER_ID} .sfa-head{display:flex;align-items:center;gap:8px;padding:7px 9px;background:linear-gradient(#dcecf7,#c6ddeb);border-bottom:1px solid #8ca8bc;color:#113f60;font-weight:800;font-size:12px}
      #${POPOVER_ID} .sfa-head .sfa-filed{margin-left:auto;padding:2px 6px;border-radius:10px;background:#dff3e7;color:#17613a;font-size:10px;border:1px solid #98ccb0}
      #${POPOVER_ID} .sfa-grid{display:grid;grid-template-columns:92px 1fr;font-size:11.5px;line-height:1.35}
      #${POPOVER_ID} .sfa-label{padding:6px 8px;background:#f3f7fa;border-right:1px solid #d0dae2;border-bottom:1px solid #e1e8ed;color:#496579;font-weight:700}
      #${POPOVER_ID} .sfa-value{padding:6px 8px;border-bottom:1px solid #e1e8ed;overflow-wrap:anywhere}
      #${POPOVER_ID} .sfa-value.author{font-weight:800;color:#0b4f7d}
      #${POPOVER_ID} .sfa-foot{padding:6px 8px;background:#f8fafc;color:#607383;font-size:10px;border-top:1px solid #dbe3e8}
    `;
    document.head.appendChild(style);
  }

  function ensurePopover() {
    installStyle();
    let node = document.getElementById(POPOVER_ID);
    if (node) return node;
    node = document.createElement('aside');
    node.id = POPOVER_ID;
    node.setAttribute('role', 'tooltip');
    node.setAttribute('aria-live', 'polite');
    document.body.appendChild(node);
    return node;
  }

  function titlePart(title, patterns) {
    const value = clean(title);
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match?.[1]) return clean(match[1]);
    }
    return '';
  }

  async function fetchEntry(cell) {
    const pid = patientId();
    const rowId = clean(cell?.dataset?.rowId);
    const flowTime = clean(cell?.dataset?.flowTime);
    const minute = isoMinute(flowTime);
    if (!pid || !rowId || !minute) return null;

    const key = `${pid}|${minute}`;
    if (!workspaceCache.has(key)) {
      const center = new Date(minute);
      const from = new Date(center.getTime() - 90 * 1000).toISOString();
      const to = new Date(center.getTime() + 90 * 1000).toISOString();
      const request = api(`/api/spire/patients/${encodeURIComponent(pid)}/flowsheet-workspace?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        .then((data) => asArray(data?.entries || data))
        .catch(() => []);
      workspaceCache.set(key, request);
    }

    const entries = await workspaceCache.get(key);
    const matches = entries.filter((entry) => clean(entry?.rowId) === rowId && isoMinute(entry?.recordedAt) === minute);
    matches.sort((a, b) => new Date(a?.createdAt || a?.updatedAt || a?.recordedAt || 0) - new Date(b?.createdAt || b?.updatedAt || b?.recordedAt || 0));
    return matches[matches.length - 1] || null;
  }

  function readAudit(cell, entry = null) {
    const raw = clean(cell?.getAttribute('title'));
    const parts = raw.split(' · ').map(clean).filter(Boolean);
    const createdAt = clean(entry?.documentedAt || entry?.createdAt);
    const updatedAt = clean(entry?.updatedAt);
    const createdMs = createdAt ? new Date(createdAt).getTime() : NaN;
    const updatedMs = updatedAt ? new Date(updatedAt).getTime() : NaN;
    const amended = Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs - createdMs > 2000;
    const status = amended ? 'Filed amendment' : (parts.find((part) => /^(Filed|Filed amendment|Completed|Modified)$/i.test(part)) || (entry || raw ? 'Filed' : ''));
    const domAuthor = clean(cell?.querySelector?.('.flow-entry-author')?.textContent);
    const author = clean(entry?.recordedById || entry?.recordedByDisplayName || domAuthor || titlePart(raw, [/(?:^| · )Filed by\s+([^·]+?)(?=\s+·|$)/i, /(?:^| · )by\s+([^·]+?)(?=\s+·|$)/i]));
    const recordedFor = formatDate(entry?.recordedAt) || titlePart(raw, [/(?:^| · )Recorded for\s+([^·]+?)(?=\s+·|$)/i]) || formatDate(cell?.dataset?.flowTime);
    const filedAt = formatDate(createdAt) || titlePart(raw, [/(?:^| · )Filed at\s+([^·]+?)(?=\s+·|$)/i, /(?:^| · )documented\s+([^·]+?)(?=\s+·|$)/i]);
    const amendedAt = amended ? formatDate(updatedAt) : titlePart(raw, [/(?:^| · )Last amended\s+([^·]+?)(?=\s+·|$)/i]);
    const comment = clean(entry?.comment) || titlePart(raw, [/(?:^| · )Comment:\s*([^·]+?)(?=\s+·|$)/i]);
    return { raw, status, author, recordedFor, filedAt, amendedAt, comment };
  }

  function positionPopover(cell) {
    const popover = ensurePopover();
    const rect = cell.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 20);
    const estimatedHeight = Math.min(300, popover.offsetHeight || 220);
    let left = rect.left + Math.min(rect.width, 24);
    if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10;
    if (left < 10) left = 10;
    let top = rect.bottom + 7;
    if (top + estimatedHeight > window.innerHeight - 10) top = Math.max(10, rect.top - estimatedHeight - 7);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  function renderPopover(cell, audit, authorText = 'Resolving author and credentials…') {
    const popover = ensurePopover();
    popover.innerHTML = `<div class="sfa-head"><span>Flowsheet Audit</span><span class="sfa-filed">${esc(audit.status || 'Filed')}</span></div>
      <div class="sfa-grid">
        <div class="sfa-label">Filed by</div><div class="sfa-value author">${esc(authorText)}</div>
        <div class="sfa-label">Recorded for</div><div class="sfa-value">${esc(audit.recordedFor || 'Not available')}</div>
        <div class="sfa-label">Filed at</div><div class="sfa-value">${esc(audit.filedAt || 'Not available')}</div>
        ${audit.amendedAt ? `<div class="sfa-label">Last amended</div><div class="sfa-value">${esc(audit.amendedAt)}</div>` : ''}
        ${audit.comment ? `<div class="sfa-label">Comment</div><div class="sfa-value">${esc(audit.comment)}</div>` : ''}
      </div>
      <div class="sfa-foot">Hover over a filed value to review its audit trail. On touch devices, press and hold the filed value. A normal tap continues to open charting/editing.</div>`;
    popover.classList.add('open');
    positionPopover(cell);
  }

  async function show(cell, pin = false) {
    if (!cell) return;
    const preliminary = readAudit(cell);
    if (!preliminary.raw || /^(Empty|Unfiled|Click to chart)$/i.test(preliminary.raw)) return;
    activeCell = cell;
    if (pin) pinned = true;
    renderPopover(cell, preliminary);

    const entry = await fetchEntry(cell);
    if (activeCell !== cell) return;
    const audit = readAudit(cell, entry);
    const author = await resolveAuthor(audit.author);
    if (activeCell !== cell) return;
    renderPopover(cell, audit, author || 'Author unavailable');
  }

  function hide(force = false) {
    if (pinned && !force) return;
    pinned = false;
    activeCell = null;
    document.getElementById(POPOVER_ID)?.classList.remove('open');
  }

  function filed(cell) {
    const title = clean(cell.getAttribute('title'));
    if (!title || /^Empty$/i.test(title) || /^Unfiled/i.test(title) || /^Click to chart$/i.test(title)) return false;
    return Boolean(clean(cell.querySelector('.flow-entry-author')?.textContent)) || /Filed|Documented|Completed|Modified|\bby\b/i.test(title);
  }

  function decorateCell(cell) {
    if (!(cell instanceof HTMLElement) || !filed(cell)) return;
    cell.classList.add('spire-flow-filed-cell');
    cell.querySelectorAll(':scope > .spire-flow-audit-trigger').forEach((node) => node.remove());
    if (cell.dataset.spireAuditHoverBound === '2') return;
    cell.dataset.spireAuditHoverBound = '2';
    cell.setAttribute('aria-description', 'Filed flowsheet value. Hover for audit details; on touch press and hold.');

    let holdTimer = null;
    let startX = 0;
    let startY = 0;
    const cancelHold = () => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
    };

    cell.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      void show(cell, false);
    });
    cell.addEventListener('pointerleave', () => { if (!pinned) hide(true); });
    cell.addEventListener('focusin', () => void show(cell, false));
    cell.addEventListener('focusout', (event) => {
      if (!cell.contains(event.relatedTarget) && !pinned) hide(true);
    });

    cell.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      cancelHold();
      startX = event.clientX;
      startY = event.clientY;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        suppressNextClick = true;
        pinned = true;
        void show(cell, true);
      }, 420);
    }, true);
    cell.addEventListener('pointermove', (event) => {
      if (!holdTimer) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) cancelHold();
    }, true);
    cell.addEventListener('pointerup', cancelHold, true);
    cell.addEventListener('pointercancel', cancelHold, true);
    cell.addEventListener('contextmenu', (event) => {
      if (pinned && activeCell === cell) event.preventDefault();
    });
    cell.addEventListener('click', (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    }, true);
  }

  function decorate() {
    decorateQueued = false;
    installStyle();
    document.querySelectorAll('#flowsheets-view [data-flow-cell][title]').forEach(decorateCell);
  }

  function queueDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    setTimeout(decorate, 60);
  }

  document.addEventListener('pointerdown', (event) => {
    const popover = document.getElementById(POPOVER_ID);
    if (!pinned || !popover) return;
    if (popover.contains(event.target) || activeCell?.contains(event.target)) return;
    hide(true);
  }, true);
  window.addEventListener('resize', () => { if (activeCell) positionPopover(activeCell); });
  window.addEventListener('scroll', () => { if (activeCell) positionPopover(activeCell); }, true);

  const observer = new MutationObserver(queueDecorate);
  const start = () => {
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['title'] });
    queueDecorate();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  window.SpireFlowsheetAuditPopover = Object.freeze({ version:'20260815-audit-popover-2', refresh:queueDecorate });
})();
