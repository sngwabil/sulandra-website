(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const NEWS_REFRESH_MS = 10 * 60 * 1000;
  const NEWS_RSS = 'https://news.google.com/rss/search?q=Dayton%20Ohio%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen';
  const NEWS_JSON = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(NEWS_RSS);
  const fallback = [
    {title:'Live local headlines for Dayton and the Miami Valley are loading…',link:'/news.html',source:'Sulandra News'},
    {title:'News ticker refreshes automatically as local headlines update.',link:'/news.html',source:'Live News'},
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sourceName = item => item.author || item.source || String(item.title || '').split(' - ').slice(-1)[0] || 'Local News';
  const headline = item => {
    const raw = String(item.title || 'Local news update').trim();
    const parts = raw.split(' - ');
    return parts.length > 1 ? parts.slice(0, -1).join(' - ') : raw;
  };

  function ensureCanonicalSso() {
    if (window.SulandraSSO || document.querySelector('script[data-canonical-admin-sso]')) return;
    const script = document.createElement('script');
    script.src = '/assets/sulandra-sso-session.js?v=20260806-sso-1';
    script.dataset.canonicalAdminSso = 'true';
    script.async = false;
    document.head.appendChild(script);
  }

  function ensureModuleHosts() {
    if (document.getElementById('module-employees')) return;
    const onboarding = document.getElementById('module-onboarding');
    if (!onboarding?.parentElement) return;
    const employee = document.createElement('section');
    employee.id = 'module-employees';
    employee.className = 'card module';
    employee.setAttribute('aria-label', 'Employee management workspace');
    employee.innerHTML = '<h1>Employees</h1><p class="sub">Loading Employee 360 directory, permissions, compliance, workforce, documents, learning, payroll, benefits, leave, safety, analytics and audit tools…</p>';
    onboarding.parentElement.insertBefore(employee, onboarding);
  }

  function tickerMarkup(items) {
    const clean = (items?.length ? items : fallback).slice(0, 12).map(item => ({title:headline(item),link:item.link || '/news.html',source:sourceName(item)}));
    const once = clean.map(item => `<a class="sulandra-news-item" href="${esc(item.link)}" target="_blank" rel="noopener"><span>${esc(item.title)}</span><span class="sulandra-news-source">${esc(item.source)}</span></a>`).join('');
    return once + once;
  }

  async function loadNews() {
    const track = document.getElementById('sulandraNewsTrack');
    if (!track) return;
    try {
      const response = await fetch(NEWS_JSON, {cache:'no-store'});
      if (!response.ok) throw new Error('news unavailable');
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      track.innerHTML = tickerMarkup(items);
      track.style.animationDuration = `${Math.max(55, Math.min(125, items.length * 9))}s`;
    } catch {
      track.innerHTML = tickerMarkup(fallback);
    }
  }

  function ensurePlatformBar() {
    let bar = document.querySelector('.sulandra-platform-bar');
    if (!bar) {
      bar = document.createElement('nav');
      bar.className = 'sulandra-platform-bar';
      bar.setAttribute('aria-label', 'Sulandra Health local news');
      document.body.insertBefore(bar, document.body.firstChild);
    }
    bar.innerHTML = `<span class="sulandra-platform-title">Sulandra Health Platform</span><span class="sulandra-news-label">Local News</span><div class="sulandra-news-window" aria-live="polite"><div class="sulandra-news-track" id="sulandraNewsTrack">${tickerMarkup(fallback)}</div></div>`;
    loadNews();
    window.setInterval(loadNews, NEWS_REFRESH_MS);
  }

  function updateWeatherClock() {
    const weather = document.querySelector('.live-card[data-widget-id="weather"]');
    if (!weather) return;
    let clock = weather.querySelector('.weather-mini-clock');
    if (!clock) {
      clock = document.createElement('div');
      clock.className = 'weather-mini-clock';
      clock.innerHTML = '<strong>--:--</strong><span>Local time</span>';
      weather.appendChild(clock);
    }
    const value = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date());
    const node = clock.querySelector('strong');
    if (node) node.textContent = value;
  }

  function mount() {
    ensureCanonicalSso();
    ensureModuleHosts();
    ensurePlatformBar();
    updateWeatherClock();
    window.setTimeout(updateWeatherClock, 250);
    window.setTimeout(updateWeatherClock, 900);
    window.setInterval(updateWeatherClock, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
