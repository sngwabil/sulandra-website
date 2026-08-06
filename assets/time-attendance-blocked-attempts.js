(() => {
  'use strict';
  if (window.__sulandraBlockedPunchFetchInstalled) return;
  window.__sulandraBlockedPunchFetchInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const response = await nativeFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const match = url.match(/\/api\/time-attendance\/clock\/geofenced-(in|out)(?:\?|$)/i);
      if (!match || response.status !== 403) return response;
      const failure = await response.clone().json().catch(() => ({}));
      let gps = {};
      try { gps = typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch {}
      const headers = new Headers(init.headers || {});
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      await nativeFetch('https://sulandra-website-production-5fc4.up.railway.app/api/time-attendance/clock/blocked-attempt', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          punchType: match[1].toLowerCase() === 'in' ? 'CLOCK_IN' : 'CLOCK_OUT',
          reason: failure.error || 'Regular GPS punch was blocked.',
          code: failure.code || 'BLOCKED',
          latitude: Number.isFinite(gps.latitude) ? gps.latitude : undefined,
          longitude: Number.isFinite(gps.longitude) ? gps.longitude : undefined,
          accuracyMeters: Number.isFinite(gps.accuracyMeters) ? gps.accuracyMeters : undefined,
          shiftId: failure.data?.shift?.id || failure.data?.data?.shift?.id || undefined,
        }),
      });
    } catch (error) {
      console.warn('[time-attendance] Unable to record blocked punch exception', error);
    }
    return response;
  };
})();
