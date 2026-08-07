(() => {
  'use strict';

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const SESSION_KEY = 'sulandra:employee:session';
  const ACTIVE_MODULE_KEY = 'sulandra:admin:active-module';
  const RIGHT_PANEL_KEY = 'sulandra:admin:right-panel-open';
  const $ = (id) => document.getElementById(id);
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  async function api(path) {
    const response = await fetch(API + path, {
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null') || {}; }
    catch { return {}; }
  }

  function installStyles() {
    if ($('adminLiveDashboardStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminLiveDashboardStyles';
    style.textContent = `
      #module-dashboard.admin-live-dashboard{background:transparent;border:0;box-shadow:none;padding:0}
      .admin-command-hero{background:linear-gradient(135deg,#073f73,#087db8 58%,#10a0b8);color:#fff;border-radius:24px;padding:28px;box-shadow:0 18px 45px rgba(0,75,141,.18);overflow:hidden;position:relative}
      .admin-command-hero:after{content:"";position:absolute;width:260px;height:260px;border:40px solid rgba(255,255,255,.08);border-radius:50%;right:-90px;top:-120px}
      .admin-command-hero h1{color:#fff;font-size:clamp(28px,4vw,42px);margin:0}.admin-command-hero p{color:#e7f5ff;max-width:760px;margin-top:7px}
      .admin-live-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px;margin-top:16px}
      .live-card{background:#fff;border:1px solid #dfe7ef;border-radius:20px;box-shadow:0 12px 30px rgba(28,58,91,.09);padding:20px;min-height:150px;position:relative;overflow:hidden}
      .live-card h3{margin:0;color:#123f68;font-size:16px}.live-card .metric{font-size:40px;line-height:1;font-weight:900;color:#073f73;margin-top:14px}.live-card .meta{color:#6d7b8a;font-size:12px;margin-top:9px}.live-card .badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef7ff;color:#075985;font-size:11px;font-weight:900;margin-top:10px}
      .live-card.wide{grid-column:span 6}.live-card.third{grid-column:span 4}.live-card.half{grid-column:span 6}.live-card.full{grid-column:1/-1}
      .weather-card{background:linear-gradient(145deg,#0d6ca4,#14a2c0);color:#fff}.weather-card h3,.weather-card .metric,.weather-card .meta{color:#fff}.weather-icon{position:absolute;right:18px;top:16px;font-size:58px;opacity:.9}
      .pulse-dot{width:10px;height:10px;border-radius:50%;background:#22c55e;display:inline-block;margin-right:7px;box-shadow:0 0 0 6px rgba(34,197,94,.11)}
      .activity-list{display:grid;gap:10px;margin-top:14px}.activity-row{display:flex;justify-content:space-between;gap:14px;border-top:1px solid #edf2f7;padding-top:10px}.activity-row:first-child{border-top:0;padding-top:0}.activity-row strong{color:#183b5c}.activity-row span{color:#718096;font-size:12px;text-align:right}
      .right-ops-panel{position:fixed;right:0;top:0;bottom:0;width:min(340px,88vw);background:#fff;z-index:1840;box-shadow:-14px 0 35px rgba(15,35,55,.18);transform:translateX(100%);transition:transform .28s ease;padding:92px 18px 22px;overflow:auto}.right-ops-panel.open{transform:translateX(0)}
      .right-ops-panel h3{color:#0b4c82;margin:0 0 6px}.right-ops-panel p{color:#6b7b89;font-size:13px}.right-panel-toggle{position:fixed;right:0;top:52%;transform:translateY(-50%);z-index:1850;width:42px;height:58px;border:0;border-radius:14px 0 0 14px;background:#0b5c9b;color:#fff;box-shadow:0 8px 24px rgba(0,75,141,.25);font-size:23px;font-weight:900}.right-panel-toggle span{display:block;transition:transform .28s}.right-panel-toggle.open span{transform:rotate(180deg)}
      .quick-action{display:block;text-decoration:none;border:1px solid #dce8f2;border-radius:14px;padding:12px;margin-top:10px;background:#f8fbfe;font-weight:800;color:#124b75}.quick-action small{display:block;color:#758596;font-weight:600;margin-top:3px}
      body .taskbar-toggle{left:0!important;border-radius:0 14px 14px 0!important}
      @media(max-width:900px){.live-card.wide,.live-card.half,.live-card.third{grid-column:1/-1}.admin-command-hero{padding:22px}.live-card .metric{font-size:34px}.right-panel-toggle{top:58%}}
    `;
    document.head.appendChild(style);
  }

  function iconForWeather(code) {
    if (code === 0) return '☀️';
    if ([1,2].includes(code)) return '🌤️';
    if (code === 3) return '☁️';
    if ([45,48].includes(code)) return '🌫️';
    if ([51,53,55,61,63,65,80,81,82].includes(code)) return '🌧️';
    if ([71,73,75,77,85,86].includes(code)) return '❄️';
    if ([95,96,99].includes(code)) return '⛈️';
    return '🌤️';
  }

  async function loadWeather() {
    const temp = $('liveWeatherTemp');
    const detail = $('liveWeatherDetail');
    const icon = $('liveWeatherIcon');
    try {
      const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=39.7589&longitude=-84.1916&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York', { cache: 'no-store' });
      const data = await response.json();
      const current = data.current || {};
      if (temp) temp.textContent = Number.isFinite(current.temperature_2m) ? `${Math.round(current.temperature_2m)}°F` : '—';
      if (detail) detail.textContent = `Feels like ${Math.round(current.apparent_temperature ?? current.temperature_2m ?? 0)}° · Wind ${Math.round(current.wind_speed_10m ?? 0)} mph · Dayton, Ohio`;
      if (icon) icon.textContent = iconForWeather(current.weather_code);
    } catch {
      if (detail) detail.textContent = 'Dayton weather temporarily unavailable';
    }
  }

  async function loadDashboardData() {
    const set = (id, value) => { if ($(id)) $(id).textContent = value ?? '—'; };
    set('liveSystemState', 'Connecting');
    try {
      const [dashboard, applications, openings] = await Promise.all([
        api('/api/admin/dashboard').catch(() => ({})),
        api('/api/admin/applications?limit=200').catch(() => []),
        api('/api/admin/job-openings').catch(() => []),
      ]);
      const apps = Array.isArray(applications) ? applications : applications?.items || [];
      const jobs = Array.isArray(openings) ? openings : openings?.items || [];
      const activeApps = apps.filter((item) => !['ARCHIVED','REJECTED','WITHDRAWN','TERMINATED'].includes(String(item.workflowStatus || item.status || '').toUpperCase()));
      const published = jobs.filter((job) => String(job.status || '').toUpperCase() === 'PUBLISHED');
      set('liveEmployees', dashboard.staff ?? dashboard.employees ?? '—');
      set('liveApplicants', activeApps.length);
      set('liveOpenJobs', published.length);
      set('liveClockedIn', dashboard.clockedIn ?? '—');
      set('livePendingDocs', dashboard.pendingDocs ?? '—');
      set('liveIncidents', dashboard.openIncidents ?? '—');
      set('liveExpiring', dashboard.expiringCredentials ?? '—');
      set('liveSystemState', 'Live');
      const rows = [];
      if (activeApps[0]) rows.push(`<div class="activity-row"><strong>Newest applicant</strong><span>${esc([activeApps[0].firstName,activeApps[0].lastName].filter(Boolean).join(' ') || 'Applicant')} · ${esc(activeApps[0].jobTitle || activeApps[0].appliedRole || '')}</span></div>`);
      if (published[0]) rows.push(`<div class="activity-row"><strong>Hiring now</strong><span>${esc(published[0].title || 'Open position')}</span></div>`);
      rows.push(`<div class="activity-row"><strong>Platform</strong><span>${dashboard.since ? `Live metrics since ${esc(new Date(dashboard.since).toLocaleDateString())}` : 'Connected to Railway production data'}</span></div>`);
      if ($('liveActivityList')) $('liveActivityList').innerHTML = rows.join('');
    } catch (error) {
      set('liveSystemState', 'Limited');
      if ($('liveActivityList')) $('liveActivityList').innerHTML = `<div class="activity-row"><strong>Dashboard data</strong><span>${esc(error.message)}</span></div>`;
    }
  }

  function renderDashboard() {
    const host = $('module-dashboard');
    if (!host) return;
    host.classList.add('admin-live-dashboard');
    host.innerHTML = `
      <section class="admin-command-hero">
        <div><span class="pulse-dot"></span><strong id="liveSystemState">Connecting</strong></div>
        <h1>Sulandra Health Command Center</h1>
        <p>A live operational snapshot of people, hiring, staffing, compliance, clinical risk, and company activity.</p>
      </section>
      <div class="admin-live-grid">
        <article class="live-card third"><h3>Active Employees</h3><div class="metric" id="liveEmployees">—</div><div class="meta">Current workforce in Employee 360</div><span class="badge">Workforce</span></article>
        <article class="live-card third"><h3>Active Applicants</h3><div class="metric" id="liveApplicants">—</div><div class="meta">Candidates currently in your hiring pipeline</div><span class="badge">Onboarding</span></article>
        <article class="live-card third"><h3>Published Openings</h3><div class="metric" id="liveOpenJobs">—</div><div class="meta">Jobs currently visible on Careers</div><span class="badge">Recruiting</span></article>
        <article class="live-card weather-card wide"><div class="weather-icon" id="liveWeatherIcon">🌤️</div><h3>Dayton Weather</h3><div class="metric" id="liveWeatherTemp">—</div><div class="meta" id="liveWeatherDetail">Loading current conditions…</div><span class="badge" style="background:#ffffff22;color:#fff">Live weather</span></article>
        <article class="live-card half"><h3>Employees Clocked In</h3><div class="metric" id="liveClockedIn">—</div><div class="meta">Current Time & Attendance presence</div><span class="badge">Operations</span></article>
        <article class="live-card third"><h3>Pending Documents</h3><div class="metric" id="livePendingDocs">—</div><div class="meta">Items awaiting completion or review</div></article>
        <article class="live-card third"><h3>Open Incidents</h3><div class="metric" id="liveIncidents">—</div><div class="meta">Health & Safety items currently open</div></article>
        <article class="live-card third"><h3>Expiring Credentials</h3><div class="metric" id="liveExpiring">—</div><div class="meta">Credentials approaching renewal</div></article>
        <article class="live-card full"><h3>Live Company Activity</h3><div class="activity-list" id="liveActivityList"><div class="activity-row"><strong>Loading activity…</strong><span>Connecting to production systems</span></div></div></article>
      </div>`;
  }

  function installRightPanel() {
    if ($('rightOperationsPanel')) return;
    const button = document.createElement('button');
    button.id = 'rightOperationsToggle';
    button.className = 'right-panel-toggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Toggle right operations panel');
    button.innerHTML = '<span>‹</span>';
    const panel = document.createElement('aside');
    panel.id = 'rightOperationsPanel';
    panel.className = 'right-ops-panel';
    const session = readSession();
    panel.innerHTML = `<h3>Quick Operations</h3><p>${esc(session.displayName || session.fullName || session.email || 'Sulandra Health administrator')}</p>
      <a class="quick-action" href="intranet-control.html">Manage Intranet Content<small>Hero slides, news, messages, images and timing</small></a>
      <a class="quick-action" href="time-attendance.html#admin">Time & Attendance<small>Scheduling, corrections, GPS and payroll-period review</small></a>
      <a class="quick-action" href="spire.html">Open Spire<small>Clinical and client record application</small></a>
      <a class="quick-action" href="employee-portal.html">Employee Portal<small>See the employee-facing workspace</small></a>
      <a class="quick-action" href="intranet.html">Intranet Portal<small>View the live company intranet</small></a>`;
    document.body.append(panel, button);
    const apply = (open) => {
      panel.classList.toggle('open', open);
      button.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
      localStorage.setItem(RIGHT_PANEL_KEY, String(open));
    };
    button.addEventListener('click', () => apply(!panel.classList.contains('open')));
    apply(localStorage.getItem(RIGHT_PANEL_KEY) === 'true');
  }

  function installModulePersistence() {
    const valid = new Set([...document.querySelectorAll('#topModuleNav [data-module],#sideModuleNav [data-module]')].map((node) => node.dataset.module).filter(Boolean));
    const activate = (key, writeHash = true) => {
      if (!valid.has(key)) key = 'dashboard';
      document.querySelectorAll('#topModuleNav [data-module],#sideModuleNav [data-module]').forEach((node) => node.classList.toggle('active', node.dataset.module === key));
      document.querySelectorAll('.module').forEach((node) => node.classList.toggle('active', node.id === `module-${key}`));
      localStorage.setItem(ACTIVE_MODULE_KEY, key);
      if (writeHash && location.hash !== `#${key}`) history.replaceState(null, '', `${location.pathname}${location.search}#${key}`);
    };
    document.querySelectorAll('#topModuleNav [data-module],#sideModuleNav [data-module]').forEach((node) => node.addEventListener('click', () => activate(node.dataset.module), true));
    window.addEventListener('hashchange', () => activate(location.hash.slice(1), false));
    const initial = location.hash.slice(1) || localStorage.getItem(ACTIVE_MODULE_KEY) || [...document.querySelectorAll('.module.active')][0]?.id?.replace('module-','') || 'dashboard';
    activate(initial, Boolean(location.hash));
  }

  installStyles();
  renderDashboard();
  installRightPanel();
  installModulePersistence();
  loadWeather();
  loadDashboardData();
  setInterval(loadDashboardData, 60_000);
  setInterval(loadWeather, 10 * 60_000);
})();
