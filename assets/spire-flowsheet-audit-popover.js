(() => {
  'use strict';

  // SPIRE_FLOWSHEET_AUDIT_POPOVER_V1
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const POPOVER_ID = 'spireFlowsheetAuditPopover';
  const STYLE_ID = 'spireFlowsheetAuditPopoverStyle';
  const directory = new Map();
  let identityPromise = null;
  let activeCell = null;
  let pinned = false;
  let decorateQueued = false;

  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));

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
    if (!looksLikeUserId(candidate) && !candidate.includes('@')) return candidate;
    if (directory.has(candidate)) return label(directory.get(candidate));
    const identity = await currentIdentity();
    if (identity && [identity.id, identity.userId, identity.email].map(clean).includes(candidate)) return label(identity);
    if (looksLikeUserId(candidate)) {
      try {
        const result = await api(`/api/spire/clinical-users?ids=${encodeURIComponent(candidate)}`);
        const items = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : [];
        if (items[0]) {
          directory.set(candidate, items[0]);
          return label(items[0]);
        }
      } catch {}
    }
    return candidate;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #flowsheets-view [data-flow-cell].spire-flow-filed-cell{position:relative!important}
      #flowsheets-view .spire-flow-audit-trigger{position:absolute;right:2px;top:2px;z-index:8;width:17px;height:17px;padding:0;border:1px solid #477899;border-radius:50%;background:#edf7ff;color:#0b4f7d;font:bold 11px/15px Arial,sans-serif;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.14);display:flex;align-items:center;justify-content:center}
      #flowsheets-view .spire-flow-audit-trigger:hover,#flowsheets-view .spire-flow-audit-trigger:focus{outline:2px solid rgba(14,116,180,.28);background:#d8efff}
      #${POPOVER_ID}{position:fixed;z-index:12000;display:none;width:min(360px,calc(100vw - 20px));background:#fff;border:1px solid #426b89;border-radius:5px;box-shadow:0 10px 32px rgba(15,23,42,.32);font-family:"Segoe UI",Arial,sans-serif;color:#173247;overflow:hidden}
      #${POPOVER_ID}.open{display:block}
      #${POPOVER_ID} .sfa-head{display:flex;align-items:center;gap:8px;padding:7px 9px;background:linear-gradient(#dcecf7,#c6ddeb);border-bottom:1px solid #8ca8bc;color:#113f60;font-weight:800;font-size:12px}
      #${POPOVER_ID} .sfa-head .sfa-filed{margin-left:auto;padding:2px 6px;border-radius:10px;background:#dff3e7;color:#17613a;font-size:10px;border:1px solid #98ccb0}
      #${POPOVER_ID} .sfa-grid{display:grid;grid-template-columns:92px 1fr;font-size:11.5px;line-height:1.35}
      #${POPOVER_ID} .sfa-label{padding:6px 8px;background:#f3f7fa;border-right:1px solid #d0dae2;border-bottom:1px solid #e1e8ed;color:#496579;font-weight:700}
      #${POPOVER_ID} .sfa-value{padding:6px 8px;border-bottom:1px solid #e1e8ed;overflow-wrap:anywhere}
      #${POPOVER_ID} .sfa-value.author{font-weight:800;color:#0b4f7d}
      #${POPOVER_ID} .sfa-foot{padding:6px 8px;background:#f8fafc;color:#607383;font-size:10px;border-top:1px solid #dbe3e8}
      @media (pointer:coarse){#flowsheets-view .spire-flow-audit-trigger{width:22px;height:22px;font-size:13px;line-height:20px;right:3px;top:3px}}
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
    const text = clean(title);
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return clean(match[1]);
    }
    return '';
  }

  function readAudit(cell) {
    const raw = clean(cell?.getAttribute('title'));
    const parts = raw.split(' · ').map(clean).filter(Boolean);
    const status = parts.find((part) => /^(Filed|Filed amendment|Unfiled|Unfiled amendment|Completed|Modified)$/i.test(part)) || (raw ? 'Filed' : '');
    const author = titlePart(raw, [/(?:^| · )Filed by\s+([^·]+?)(?=\s+·|$)/i, /(?:^| · )by\s+([^·]+?)(?=\s+·|$)/i]);
    const recordedFor = titlePart(raw, [/(?:^| · )Recorded for\s+([^·]+?)(?=\s+·|$)/i]);
    const filedAt = titlePart(raw, [/(?:^| · )Filed at\s+([^·]+?)(?=\s+·|$)/i, /(?:^| · )documented\s+([^·]+?)(?=\s+·|$)/i]);
    const amendedAt = titlePart(raw, [/(?:^| · )Last amended\s+([^·]+?)(?=\s+·|$)/i]);
    const comment = titlePart(raw, [/(?:^| · )Comment:\s*([^·]+?)(?=\s+·|$)/i]);
    const recordedIso = clean(cell?.dataset?.flowTime);
    let recorded = recordedFor;
    if (!recorded && recordedIso && !Number.isNaN(new Date(recordedIso).getTime())) recorded = new Date(recordedIso).toLocaleString();
    return { raw, status, author, recordedFor:recorded, filedAt, amendedAt, comment };
  }

  function positionPopover(cell) {
    const popover = ensurePopover();
    const rect = cell.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 20);
    const estimatedHeight = Math.min(300, popover.offsetHeight || 220);
    let left = rect.left + Math.min(rect.width, 30);
    if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10;
    if (left < 10) left = 10;
    let top = rect.bottom + 7;
    if (top + estimatedHeight > window.innerHeight - 10) top = Math.max(10, rect.top - estimatedHeight - 7);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  async function show(cell, pin = false) {
    if (!cell) return;
    const audit = readAudit(cell);
    if (!audit.raw || /^(Empty|Unfiled)$/i.test(audit.raw)) return;
    activeCell = cell;
    if (pin) pinned = true;
    const popover = ensurePopover();
    popover.innerHTML = `<div class="sfa-head"><span>ⓘ Flowsheet Audit</span><span class="sfa-filed">${esc(audit.status || 'Filed')}</span></div>
      <div class="sfa-grid">
        <div class="sfa-label">Filed by</div><div class="sfa-value author">Resolving clinician…</div>
        <div class="sfa-label">Recorded for</div><div class="sfa-value">${esc(audit.recordedFor || 'Not available')}</div>
        <div class="sfa-label">Filed at</div><div class="sfa-value">${esc(audit.filedAt || 'Not available')}</div>
        ${audit.amendedAt ? `<div class="sfa-label">Last amended</div><div class="sfa-value">${esc(audit.amendedAt)}</div>` : ''}
        ${audit.comment ? `<div class="sfa-label">Comment</div><div class="sfa-value">${esc(audit.comment)}</div>` : ''}
      </div>
      <div class="sfa-foot">Audit attribution is tied to the filed flowsheet entry, not the person currently viewing the chart.${pinned ? ' Tap outside this card to close.' : ''}</div>`;
    popover.classList.add('open');
    positionPopover(cell);
    const author = await resolveAuthor(audit.author);
    if (activeCell !== cell) return;
    const authorNode = popover.querySelector('.sfa-value.author');
    if (authorNode) authorNode.textContent = author || 'Author unavailable';
    positionPopover(cell);
  }

  function hide(force = false) {
    if (pinned && !force) return;
    pinned = false;
    activeCell = null;
    document.getElementById(POPOVER_ID)?.classList.remove('open');
  }

  function filed(cell) {
    const title = clean(cell.getAttribute('title'));
    if (!title || /^Empty$/i.test(title) || /^Unfiled/i.test(title)) return false;
    return /Filed|documented|\bby\b|Completed|Modified/i.test(title);
  }

  function decorateCell(cell) {
    if (!(cell instanceof HTMLElement) || !filed(cell)) return;
    cell.classList.add('spire-flow-filed-cell');
    if (!cell.querySelector(':scope > .spire-flow-audit-trigger')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'spire-flow-audit-trigger';
      button.textContent = 'i';
      button.setAttribute('aria-label', 'View flowsheet filing audit details');
      button.title = 'View filing audit details';
      button.addEventListener('pointerdown', (event) => event.stopPropagation());
      button.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        const same = activeCell === cell && pinned;
        if (same) hide(true); else { pinned = true; void show(cell, true); }
      });
      button.addEventListener('focus', () => void show(cell, false));
      cell.appendChild(button);
    }
    if (cell.dataset.spireAuditHoverBound !== '1') {
      cell.dataset.spireAuditHoverBound = '1';
      cell.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        void show(cell, false);
      });
      cell.addEventListener('pointerleave', () => { if (!pinned) hide(true); });
      cell.addEventListener('focusin', () => void show(cell, false));
      cell.addEventListener('focusout', (event) => {
        if (!cell.contains(event.relatedTarget) && !pinned) hide(true);
      });
    }
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

  window.SpireFlowsheetAuditPopover = Object.freeze({ version:'20260815-audit-popover-1', refresh:queueDecorate });
})();
