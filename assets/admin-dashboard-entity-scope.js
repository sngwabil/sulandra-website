(() => {
  'use strict';

  const MARKER = 'SULANDRA_ADMIN_DASHBOARD_ENTITY_SCOPE_V1';
  const API_ORIGIN = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TERMINAL = new Set(['ARCHIVED','REJECTED','NOT_SELECTED','WITHDRAWN','TERMINATED','POSITION_FILLED','HIRED']);
  if (!/\/admin\.html$/i.test(location.pathname)) return;
  if (window.__SULANDRA_ADMIN_DASHBOARD_ENTITY_SCOPE === MARKER) return;
  window.__SULANDRA_ADMIN_DASHBOARD_ENTITY_SCOPE = MARKER;

  const nativeFetch = window.fetch.bind(window);
  const scopedPaths = new Set(['/api/admin/dashboard','/api/admin/applications','/api/admin/job-openings']);
  const token = () => sessionStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra:employee:access-token') || '';

  function selectedEntityId() {
    return String(
      window.SulandraCompanyContext?.current?.()?.id
      || document.body?.dataset?.legalEntityId
      || sessionStorage.getItem('sulandra:selected-legal-entity-id')
      || localStorage.getItem('sulandra:selected-legal-entity-id')
      || localStorage.getItem('sulandra:admin:legal-entity-id')
      || ''
    );
  }

  async function resolveEntityId() {
    let id = selectedEntityId();
    if (id) return id;
    try { await window.SulandraCompanyContext?.initialize?.(); } catch {}
    for (let i = 0; i < 20 && !id; i += 1) {
      id = selectedEntityId();
      if (!id) await new Promise(resolve => setTimeout(resolve, 40));
    }
    return id;
  }

  function shouldScope(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.origin);
      return (url.origin === API_ORIGIN || url.origin === location.origin) && scopedPaths.has(url.pathname);
    } catch { return false; }
  }

  window.fetch = async function adminCompanyScopedFetch(input, init = {}) {
    if (!shouldScope(input)) return nativeFetch(input, init);
    const entityId = await resolveEntityId();
    if (!entityId) return nativeFetch(input, init);
    if (input instanceof Request) {
      const headers = new Headers(input.headers);
      new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
      if (!headers.has('X-Legal-Entity-Id')) headers.set('X-Legal-Entity-Id', entityId);
      return nativeFetch(new Request(input, {...init, headers}));
    }
    const headers = new Headers(init.headers || {});
    if (!headers.has('X-Legal-Entity-Id')) headers.set('X-Legal-Entity-Id', entityId);
    return nativeFetch(input, {...init, headers});
  };

  async function get(path) {
    const response = await window.fetch(`${API_ORIGIN}${path}`, {
      cache:'no-store',
      headers:{Accept:'application/json', ...(token() ? {Authorization:`Bearer ${token()}`} : {})},
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  function activeCount(rows) {
    return (Array.isArray(rows) ? rows : []).filter(row => !TERMINAL.has(String(row.workflowStatus || row.status || '').toUpperCase())).length;
  }

  let busy = false;
  let timer = 0;
  async function refreshPeopleCard() {
    if (busy) return;
    const card = document.querySelector('.live-card[data-widget-id="people"]');
    if (!card) return;
    busy = true;
    try {
      const [applications, openings] = await Promise.all([
        get('/api/admin/applications?limit=200').catch(() => []),
        get('/api/admin/job-openings').catch(() => []),
      ]);
      const appRows = Array.isArray(applications) ? applications : applications?.items || [];
      const jobRows = Array.isArray(openings) ? openings : openings?.items || [];
      const stats = card.querySelectorAll('.people-stat strong');
      if (stats[1]) stats[1].textContent = String(activeCount(appRows));
      if (stats[2]) stats[2].textContent = String(jobRows.filter(job => String(job.status || '').toUpperCase() === 'PUBLISHED').length);
      card.dataset.hiringEntityId = selectedEntityId();
      card.title = `Hiring metrics for ${document.body?.dataset?.legalEntityCode || 'selected company'}`;
    } finally { busy = false; }
  }

  function schedule(delay = 60) {
    clearTimeout(timer);
    timer = setTimeout(refreshPeopleCard, delay);
  }

  window.addEventListener('sulandra:company-change', () => { schedule(60); setTimeout(() => schedule(0), 350); });
  window.addEventListener('sulandra:entity-context-changed', () => schedule(90));
  new MutationObserver(mutations => {
    if (busy) return;
    if (mutations.some(m => [...m.addedNodes].some(node => node instanceof Element && (node.matches?.('.live-card[data-widget-id="people"]') || node.querySelector?.('.live-card[data-widget-id="people"]'))))) schedule(30);
  }).observe(document.documentElement, {childList:true, subtree:true});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { schedule(350); setTimeout(() => schedule(0), 1100); }, {once:true});
  else { schedule(350); setTimeout(() => schedule(0), 1100); }
})();
