(() => {
  'use strict';

  // SPIRE_CLINICAL_REGRESSION_RUNTIME_V1
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const STYLE_ID = 'spireClinicalRegressionRuntimeStyle';
  let identityPromise = null;
  const directory = new Map();
  let repairQueued = false;

  const clean = (value) => String(value ?? '').trim();
  const token = () => {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of TOKEN_KEYS) {
        const value = storage.getItem(key);
        if (value) return value;
      }
    }
    return '';
  };

  async function api(path) {
    if (typeof window.api === 'function') return window.api(path);
    const headers = new Headers({ Accept: 'application/json' });
    if (token()) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, { headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.error || payload?.message || `Request failed (${response.status})`);
    return payload?.data ?? payload;
  }

  function clinicianLabel(identity = {}) {
    const explicit = clean(identity.displayLabel);
    if (explicit) return explicit;
    const name = clean(identity.displayName || identity.name || identity.fullName || identity.email || identity.id || identity.userId || 'Current user');
    const credentials = clean(identity.credentials || identity.credentialLabel);
    return credentials && !name.toUpperCase().endsWith(`, ${credentials.toUpperCase()}`) ? `${name}, ${credentials}` : name;
  }

  async function currentIdentity() {
    if (!identityPromise) {
      identityPromise = api('/api/spire/clinical-identity').then((identity) => {
        if (identity?.id || identity?.userId) directory.set(clean(identity.id || identity.userId), identity);
        return identity || null;
      }).catch(() => null);
    }
    return identityPromise;
  }

  function authorTokenFromTitle(title) {
    const match = clean(title).match(/(?:^| · )(?:Filed by|by)\s+([^·]+?)(?=\s+·|$)/i);
    return clean(match?.[1]);
  }

  function looksLikeUserId(value) {
    const text = clean(value);
    return /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(text) || (/^[A-Za-z0-9_-]{24,}$/.test(text) && !text.includes('@'));
  }

  async function hydrateDirectory(ids) {
    const missing = [...new Set(ids.map(clean).filter((id) => id && !directory.has(id)))];
    if (!missing.length) return;
    try {
      const data = await api(`/api/spire/clinical-users?ids=${encodeURIComponent(missing.join(','))}`);
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      for (const identity of items) {
        const id = clean(identity?.id || identity?.userId);
        if (id) directory.set(id, identity);
      }
    } catch {}
  }

  function filedAtFromTitle(title) {
    const text = clean(title);
    const match = text.match(/(?:documented|Filed at)\s+([^·]+?)(?=\s+·|$)/i);
    return clean(match?.[1]);
  }

  function commentFromTitle(title) {
    const match = clean(title).match(/Comment:\s*([^·]+?)(?=\s+·|$)/i);
    return clean(match?.[1]);
  }

  function statusFromTitle(title) {
    const first = clean(title).split(' · ')[0];
    return /^(Filed|Filed amendment|Unfiled|Unfiled amendment|Empty)$/i.test(first) ? first : '';
  }

  async function repairFlowsheetAttribution() {
    const view = document.getElementById('flowsheets-view');
    if (!view) return;
    const identity = await currentIdentity();
    const currentLabel = identity ? clinicianLabel(identity) : '';
    const currentEmail = clean(identity?.email);
    const currentId = clean(identity?.id || identity?.userId);

    if (currentLabel) {
      view.querySelectorAll('.flow-inline-status').forEach((node) => {
        let text = node.textContent || '';
        if (currentEmail && text.includes(currentEmail)) text = text.split(currentEmail).join(currentLabel);
        if (currentId && text.includes(currentId)) text = text.split(currentId).join(currentLabel);
        if (text !== node.textContent) node.textContent = text;
      });
    }

    const cells = [...view.querySelectorAll('[data-flow-cell][title]')];
    const tokens = cells.map((cell) => authorTokenFromTitle(cell.getAttribute('title'))).filter(looksLikeUserId);
    await hydrateDirectory(tokens);

    for (const cell of cells) {
      const oldTitle = clean(cell.getAttribute('title'));
      if (!oldTitle || /^Empty$/i.test(oldTitle)) continue;
      const authorToken = authorTokenFromTitle(oldTitle);
      let authorIdentity = directory.get(authorToken) || null;
      if (!authorIdentity && identity && (authorToken === currentEmail || authorToken === currentId)) authorIdentity = identity;
      const authorLabel = authorIdentity ? clinicianLabel(authorIdentity) : (authorToken && !looksLikeUserId(authorToken) ? authorToken : '');
      const status = statusFromTitle(oldTitle) || (/amend/i.test(oldTitle) ? 'Filed amendment' : 'Filed');
      const recordedAt = clean(cell.dataset.flowTime);
      const recordedFor = recordedAt && !Number.isNaN(new Date(recordedAt).getTime()) ? new Date(recordedAt).toLocaleString() : '';
      const filedAt = filedAtFromTitle(oldTitle);
      const comment = commentFromTitle(oldTitle);
      const parts = [
        status,
        authorLabel ? `Filed by ${authorLabel}` : '',
        recordedFor ? `Recorded for ${recordedFor}` : '',
        filedAt ? `Filed at ${filedAt}` : '',
        comment ? `Comment: ${comment}` : '',
      ].filter(Boolean);
      const nextTitle = parts.join(' · ');
      if (nextTitle && nextTitle !== oldTitle) cell.setAttribute('title', nextTitle);
    }
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #mar-view .spire-mar-restored-section{border-top:1px solid #96aec1;background:#fff}
      #mar-view .spire-mar-restored-section:first-child{border-top:0}
      #mar-view .spire-mar-restored-header{display:flex;align-items:center;gap:8px;min-height:28px;padding:5px 10px;background:linear-gradient(#dceaf5,#c8ddeb);border-bottom:1px solid #89a5bb;color:#123f61;font-size:12px;font-weight:800;position:sticky;left:0;z-index:5}
      #mar-view .spire-mar-restored-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:18px;padding:0 5px;border:1px solid #87a4bb;border-radius:10px;background:#f8fbfd;font-size:10px}
      #mar-view .spire-mar-restored-body{min-width:max-content}
      #mar-view .spire-mar-restored-empty{width:320px;min-height:34px;padding:9px 12px;color:#61788a;font-size:11px;font-style:italic;background:#f8fafc;border-right:1px solid #c7d4df;box-sizing:border-box}
    `;
    document.head.appendChild(style);
  }

  function marSectionKey(row) {
    const tags = clean(row.dataset.filterTags).toLowerCase();
    const text = clean(row.textContent).toLowerCase();
    if (tags.includes('prn')) return 'prn';
    if (tags.includes('continuous')) return 'continuous';
    if (/\bone[- ]?time\b|\bonce\b|\bstat\b/.test(text)) return 'one-time';
    return 'scheduled';
  }

  function makeMarSection(key, label, rows, showEmpty) {
    const section = document.createElement('section');
    section.className = 'spire-mar-restored-section';
    section.dataset.marSection = key;
    const header = document.createElement('div');
    header.className = 'spire-mar-restored-header';
    const title = document.createElement('span');
    title.textContent = label;
    const count = document.createElement('span');
    count.className = 'spire-mar-restored-count';
    count.textContent = String(rows.length);
    header.append(title, count);
    const body = document.createElement('div');
    body.className = 'spire-mar-restored-body';
    if (rows.length) rows.forEach((row) => body.appendChild(row));
    else if (showEmpty) {
      const empty = document.createElement('div');
      empty.className = 'spire-mar-restored-empty';
      empty.textContent = 'No active medications in this section.';
      body.appendChild(empty);
    }
    section.append(header, body);
    return section;
  }

  function repairMarSections() {
    installStyle();
    const list = document.querySelector('#mar-view .spire-mar-medication-list');
    if (!list || list.dataset.spireStructuralSections === '1') return;
    const rows = [...list.children].filter((node) => node.classList?.contains('spire-mar-medication-row'));
    if (!rows.length) return;
    const groups = new Map([
      ['scheduled', []], ['prn', []], ['continuous', []], ['one-time', []],
    ]);
    rows.forEach((row) => groups.get(marSectionKey(row))?.push(row));
    const activeFilter = clean(document.querySelector('#mar-view .spire-mar-filter.active')?.dataset.marFilter || 'all').toLowerCase();
    const showEmpty = activeFilter === 'all';
    const definitions = [
      ['scheduled', 'Scheduled Medications'],
      ['prn', 'PRN Medications'],
      ['continuous', 'Continuous / Infusion Medications'],
      ['one-time', 'One-Time Medications'],
    ];
    const fragment = document.createDocumentFragment();
    for (const [key, label] of definitions) {
      const sectionRows = groups.get(key) || [];
      if (sectionRows.length || showEmpty) fragment.appendChild(makeMarSection(key, label, sectionRows, showEmpty));
    }
    list.replaceChildren(fragment);
    list.dataset.spireStructuralSections = '1';
  }

  async function repair() {
    repairQueued = false;
    try { await repairFlowsheetAttribution(); } catch {}
    try { repairMarSections(); } catch {}
  }

  function queueRepair() {
    if (repairQueued) return;
    repairQueued = true;
    setTimeout(repair, 40);
  }

  const observer = new MutationObserver(queueRepair);
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'class'] });
    queueRepair();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.SpireClinicalRegressionRuntime = Object.freeze({ version: '20260815-clinical-regression-1', repair: queueRepair });
})();
