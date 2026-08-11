(() => {
  'use strict';

  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const selectedHomeId = String(new URL(location.href).searchParams.get('spireHome') || '').trim();
  const previousFetch = window.fetch.bind(window);

  const requestUrl = (input) => typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : String(input?.url || '');
  const requestMethod = (input, init) => String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const pathname = (value) => {
    try { return new URL(value, location.origin).pathname; } catch { return ''; }
  };
  const isSpireApi = (value) => value.startsWith(API + '/api/spire/')
    || value.startsWith('/api/spire/')
    || value.startsWith(`${location.origin}/api/spire/`);
  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

  window.fetch = async (input, init = {}) => {
    const url = requestUrl(input);
    const path = pathname(url);
    const method = requestMethod(input, init);

    if (!selectedHomeId && isSpireApi(url)) {
      // The legacy shell starts loading census/schedule/in-basket immediately. Keep
      // those requests local and empty until the protected home selector is complete.
      if (method === 'GET' && ['/api/spire/patients', '/api/spire/schedule', '/api/spire/inbasket'].includes(path)) {
        return jsonResponse({ data: [] });
      }
      if (path.startsWith('/api/spire/patients/')) {
        return jsonResponse({ error: 'Select a service home before opening client information' }, 409);
      }
    }

    if (selectedHomeId && method === 'GET' && path === '/api/spire/inbasket') {
      return previousFetch(`${API}/api/spire/network/service-homes/${encodeURIComponent(selectedHomeId)}/inbasket`, init);
    }

    return previousFetch(input, init);
  };
})();
