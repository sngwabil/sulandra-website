(() => {
  'use strict';

  // SPIRE_CLINICAL_REGRESSION_RUNTIME_V2
  // This runtime is intentionally FLOWSHEET-ONLY. MAR/eMAR is owned exclusively
  // by the canonical renderer in spire/master.html. Do not observe or rewrite MAR.
  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
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
    const match = clean(title).match(/(?:documented|Filed at)\s+([^·]+?)(?=\s+·|$)/i);
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

  async function repair() {
    repairQueued = false;
    try { await repairFlowsheetAttribution(); } catch {}
  }

  function queueRepair() {
    if (repairQueued) return;
    repairQueued = true;
    setTimeout(repair, 60);
  }

  const observer = new MutationObserver(queueRepair);
  const start = () => {
    const flowsheetView = document.getElementById('flowsheets-view');
    if (flowsheetView) {
      observer.observe(flowsheetView, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['title'],
      });
    }
    queueRepair();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.SpireClinicalRegressionRuntime = Object.freeze({
    version: '20260816-clinical-regression-2',
    scope: 'flowsheets-only',
    repair: queueRepair,
  });
})();