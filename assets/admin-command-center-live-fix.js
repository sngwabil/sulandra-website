(() => {
  'use strict';

  const MARKER = 'SULANDRA_ADMIN_COMMAND_CENTER_LIVE_FIX_V1';
  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TERMINAL = new Set(['ARCHIVED','REJECTED','NOT_SELECTED','WITHDRAWN','TERMINATED','POSITION_FILLED','HIRED']);
  if (!/\/admin\.html$/i.test(location.pathname)) return;
  if (window.__SULANDRA_ADMIN_COMMAND_CENTER_LIVE_FIX === MARKER) return;
  window.__SULANDRA_ADMIN_COMMAND_CENTER_LIVE_FIX = MARKER;

  function ensureOverflowRuntime() {
    if (document.querySelector('script[data-admin-navigation-overflow-live]') || document.getElementById('adminTopNavigationMore')) return;
    const script = document.createElement('script');
    script.src = '/assets/admin-navigation-overflow.js?v=20260815-admin-nav-overflow-3';
    script.dataset.adminNavigationOverflowLive = 'true';
    script.async = false;
    document.body.appendChild(script);
  }

  function token() {
    return sessionStorage.getItem('sulandra:employee:access-token') || localStorage.getItem('sulandra:employee:access-token') || '';
  }

  async function entityId() {
    let id = window.SulandraCompanyContext?.current?.()?.id || document.body?.dataset?.legalEntityId || '';
    if (!id) {
      try { await window.SulandraCompanyContext?.initialize?.(); } catch {}
      id = window.SulandraCompanyContext?.current?.()?.id || document.body?.dataset?.legalEntityId || '';
    }
    return String(id || '');
  }

  async function get(path) {
    const id = await entityId();
    const response = await fetch(`${API}${path}`, {
      cache:'no-store',
      headers:{
        Accept:'application/json',
        ...(token() ? {Authorization:`Bearer ${token()}`} : {}),
        ...(id ? {'X-Legal-Entity-Id':id} : {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  function activeApplicants(rows) {
    return (Array.isArray(rows) ? rows : []).filter(row => !TERMINAL.has(String(row.workflowStatus || row.status || '').toUpperCase()));
  }

  let busy = false;
  let timer = 0;
  async function refreshPeopleHiring() {
    if (busy) return;
    const card = document.querySelector('.live-card[data-widget-id="people"]');
    if (!card) return;
    busy = true;
    try {
      const [applications, openings] = await Promise.all([
        get('/api/admin/applications?limit=200').catch(() => []),
        get('/api/admin/job-openings').catch(() => []),
      ]);
      const apps = Array.isArray(applications) ? applications : applications?.items || [];
      const jobs = Array.isArray(openings) ? openings : openings?.items || [];
      const stats = card.querySelectorAll('.people-stat strong');
      if (stats[1]) stats[1].textContent = String(activeApplicants(apps).length);
      if (stats[2]) stats[2].textContent = String(jobs.filter(job => String(job.status || '').toUpperCase() === 'PUBLISHED').length);
      const current = window.SulandraCompanyContext?.current?.();
      card.title = `People & Hiring · ${current?.displayName || current?.code || 'selected company'}`;
      card.dataset.hiringEntityId = String(current?.id || '');
    } finally {
      busy = false;
    }
  }

  function schedule(delay = 60) {
    clearTimeout(timer);
    timer = window.setTimeout(refreshPeopleHiring, delay);
  }

  window.addEventListener('sulandra:company-change', () => { ensureOverflowRuntime(); schedule(60); window.setTimeout(() => schedule(0), 350); });
  window.addEventListener('sulandra:entity-context-changed', () => { ensureOverflowRuntime(); schedule(90); });
  window.addEventListener('resize', ensureOverflowRuntime, {passive:true});

  new MutationObserver(mutations => {
    if (busy) return;
    if (mutations.some(mutation => [...mutation.addedNodes].some(node => node instanceof Element && (node.matches?.('.live-card[data-widget-id="people"]') || node.querySelector?.('.live-card[data-widget-id="people"]'))))) schedule(30);
  }).observe(document.documentElement, {childList:true, subtree:true});

  const start = () => {
    ensureOverflowRuntime();
    schedule(250);
    window.setTimeout(() => schedule(0), 900);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
