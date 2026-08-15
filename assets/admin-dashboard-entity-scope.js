(() => {
  'use strict';

  const MARKER = 'SULANDRA_ADMIN_DASHBOARD_ENTITY_SCOPE_V1';
  const API_ORIGIN = 'https://sulandra-website-production-5fc4.up.railway.app';
  const ENTITY_KEYS = ['sulandra:admin:legal-entity-id', 'sulandra:selected-legal-entity-id'];
  const TERMINAL_APPLICANT_STATUSES = new Set([
    'ARCHIVED', 'REJECTED', 'NOT_SELECTED', 'WITHDRAWN', 'TERMINATED', 'POSITION_FILLED', 'HIRED',
  ]);
  if (!/\/admin\.html$/i.test(location.pathname)) return;
  if (window.__SULANDRA_ADMIN_DASHBOARD_ENTITY_SCOPE === MARKER) return;
  window.__SULANDRA_ADMIN_DASHBOARD_ENTITY_SCOPE = MARKER;

  const originalFetch = window.fetch.bind(window);
  const scopedPaths = new Set(['/api/admin/dashboard', '/api/admin/applications', '/api/admin/job-openings']);

  function selectedEntityId() {
    const live = window.SulandraCompanyContext?.current?.()?.id || document.body?.dataset?.legalEntityId || '';
    if (live) return String(live);
    for (const key of ENTITY_KEYS) {
      const value = sessionStorage.getItem(key) || localStorage.getItem(key) || '';
      if (value) return value;
    }
    return '';
  }

  async function waitForSelectedEntity() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const id = selectedEntityId();
      if (id) return id;
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    }
    return '';
  }

  function scopedPathFor(input) {
    try {
      const raw = input instanceof Request ? input.url : String(input || '');
      const url = new URL(raw, location.origin);
      if (url.origin !== API_ORIGIN && url.origin !== location.origin) return '';
      return scopedPaths.has(url.pathname) ? url.pathname : '';
    } catch {
      return '';
    }
  }

  window.fetch = async function sulandraEntityScopedFetch(input, init = {}) {
    const path = scopedPathFor(input);
    if (!path) return originalFetch(input, init);
    const entityId = await waitForSelectedEntity();
    if (!entityId) return originalFetch(input, init);

    if (input instanceof Request) {
      const headers = new Headers(input.headers);
      new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
      if (!headers.has('X-Legal-Entity-Id')) headers.set('X-Legal-Entity-Id', entityId);
      return originalFetch(new Request(input, {...init, headers}));
    }

    const headers = new Headers(init.headers || {});
    if (!headers.has('X-Legal-Entity-Id')) headers.set('X-Legal-Entity-Id', entityId);
    return originalFetch(input, {...init, headers});
  };

  async function api(path) {
    const token = sessionStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra:employee:access-token') || '';
    const response = await window.fetch(`${API_ORIGIN}${path}`, {
      cache: 'no-store',
      headers: {Accept:'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})},
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  function activeApplicants(items) {
    return (Array.isArray(items) ? items : []).filter((item) => {
      const status = String(item.workflowStatus || item.status || '').trim().toUpperCase();
      return !TERMINAL_APPLICANT_STATUSES.has(status);
    });
  }

  let refreshing = false;
  let refreshTimer = 0;
  async function refreshHiringMetrics() {
    if (refreshing) return;
    const card = document.querySelector('.live-card[data-widget-id="people"]');
    if (!card) return;
    refreshing = true;
    try {
      const [applications, openings] = await Promise.all([
        api('/api/admin/applications?limit=200').catch(() => []),
        api('/api/admin/job-openings').catch(() => []),
      ]);
      const applicantRows = Array.isArray(applications) ? applications : applications?.items || [];
      const openingRows = Array.isArray(openings) ? openings : openings?.items || [];
      const stats = card.querySelectorAll('.people-stat strong');
      if (stats[1]) stats[1].textContent = String(activeApplicants(applicantRows).length);
      if (stats[2]) stats[2].textContent = String(openingRows.filter((job) => String(job.status || '').toUpperCase() === 'PUBLISHED').length);
      card.dataset.hiringEntityId = selectedEntityId();
      card.title = `Hiring metrics for ${document.body?.dataset?.legalEntityCode || 'selected company'}`;
    } finally {
      refreshing = false;
    }
  }

  function scheduleRefresh(delay = 80) {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshHiringMetrics, delay);
  }

  window.addEventListener('sulandra:company-change', () => {
    scheduleRefresh(80);
    window.setTimeout(() => scheduleRefresh(0), 450);
  });
  window.addEventListener('sulandra:entity-context-changed', () => scheduleRefresh(120));

  const observer = new MutationObserver((mutations) => {
    if (refreshing) return;
    if (mutations.some((mutation) => [...mutation.addedNodes].some((node) => node instanceof Element && (node.matches?.('.live-card[data-widget-id="people"]') || node.querySelector?.('.live-card[data-widget-id="people"]'))))) scheduleRefresh(50);
  });
  observer.observe(document.documentElement, {childList:true, subtree:true});

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { scheduleRefresh(500); window.setTimeout(() => scheduleRefresh(0), 1300); }, {once:true});
  } else {
    scheduleRefresh(500);
    window.setTimeout(() => scheduleRefresh(0), 1300);
  }
})();
