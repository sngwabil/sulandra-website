(() => {
  'use strict';
  const KEY = 'sulandra:home-health:referral-token';
  const token = new URL(location.href).searchParams.get('token') || '';
  if (!token) return;
  sessionStorage.setItem(KEY, token);
  const clean = new URL(location.href);
  clean.searchParams.delete('token');
  history.replaceState({}, document.title, clean.pathname + (clean.search ? clean.search : '') + (clean.hash || ''));
})();
