(() => {
  'use strict';

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const SESSION_KEY = 'sulandra:employee:session';
  const ACTIVE_MODULE_KEY = 'sulandra:admin:active-module';
  const RIGHT_PANEL_KEY = 'sulandra:admin:right-panel-open';
  const LEFT_PANEL_KEY = 'sulandra:admin:taskbar-open';
  const WIDGETS_KEY = 'sulandra:admin:dashboard-widgets-v2';
  const REMINDERS_KEY = 'sulandra:admin:dashboard-reminders';
  const ALARMS_KEY = 'sulandra:admin:dashboard-alarms';
  const APPOINTMENTS_KEY = 'sulandra:admin:dashboard-appointments';
  const $ = (id) => document.getElementById(id);
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  const state = {
    dashboard: {}, applications: [], openings: [], weather: {},
    appointments: readJson(APPOINTMENTS_KEY, []),
    reminders: readJson(REMINDERS_KEY, []),
    alarms: readJson(ALARMS_KEY, []),
    widgets: readJson(WIDGETS_KEY, null),
  };

  const defaultWidgets = [
    { id:'weather', type:'weather', title:'Dayton Weather', theme:'sky', size:'wide' },
    { id:'people', type:'people', title:'People & Hiring', theme:'navy', size:'wide' },
    { id:'clock', type:'clock', title:'Live Clock', theme:'indigo', size:'half' },
    { id:'appointments', type:'appointments', title:'Upcoming Appointments', theme:'violet', size:'half' },
    { id:'clocked', type:'clocked', title:'Employees Clocked In', theme:'teal', size:'third' },
    { id:'documents', type:'documents', title:'Pending Documents', theme:'amber', size:'third' },
    { id:'incidents', type:'incidents', title:'Open Incidents', theme:'rose', size:'third' },
    { id:'credentials', type:'credentials', title:'Expiring Credentials', theme:'orange', size:'third' },
    { id:'reminders', type:'reminders', title:'Reminders', theme:'green', size:'half' },
    { id:'alarms', type:'alarms', title:'Alarms', theme:'red', size:'half' },
    { id:'activity', type:'activity', title:'Live Company Activity', theme:'slate', size:'full' },
  ];

  if (!Array.isArray(state.widgets) || !state.widgets.length) state.widgets = defaultWidgets.map((item) => ({...item}));
  else {
    const byId = new Map(state.widgets.map((item) => [item.id, item]));
    defaultWidgets.forEach((item) => { if (!byId.has(item.id)) state.widgets.push({...item}); });
  }

  function readJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
    catch { return fallback; }
  }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null') || {}; }
    catch { return {}; }
  }
  async function api(path) {
    const response = await fetch(API + path, { cache:'no-store', headers:{ Accept:'application/json', ...(token() ? { Authorization:`Bearer ${token()}` } : {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  function installStyles() {
    if ($('adminLiveDashboardStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminLiveDashboardStyles';
    style.textContent = `
      #module-dashboard.admin-live-dashboard{background:transparent;border:0;box-shadow:none;padding:0;overflow:visible}
      .admin-command-hero{background:linear-gradient(135deg,#073f73,#087db8 58%,#10a0b8);color:#fff;border-radius:24px;padding:28px;box-shadow:0 18px 45px rgba(0,75,141,.18);overflow:hidden;position:relative}
      .admin-command-hero:after{content:"";position:absolute;width:260px;height:260px;border:40px solid rgba(255,255,255,.08);border-radius:50%;right:-90px;top:-120px}
      .admin-command-hero h1{color:#fff;font-size:clamp(28px,4vw,42px);margin:0}.admin-command-hero p{color:#e7f5ff;max-width:780px;margin-top:7px}
      .pulse-dot{width:10px;height:10px;border-radius:50%;background:#22c55e;display:inline-block;margin-right:7px;box-shadow:0 0 0 6px rgba(34,197,94,.11)}
      .dashboard-slide{margin-top:18px;padding:18px 0 2px;scroll-margin-top:150px}.dashboard-slide-head{display:flex;justify-content:space-between;align-items:end;gap:14px;margin:0 4px 10px}.dashboard-slide-head h2{margin:0;color:#153e62;font-size:20px}.dashboard-slide-head p{margin:0;color:#718096;font-size:12px}
      .admin-live-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}.admin-live-grid[data-slide="overview"]{margin-top:16px}
      .live-card{--cardA:#fff;--cardB:#f8fbff;--cardText:#123f68;--cardMeta:#64748b;grid-column:span 4;background:linear-gradient(145deg,var(--cardA),var(--cardB));border:1px solid rgba(255,255,255,.75);border-radius:20px;box-shadow:0 12px 30px rgba(28,58,91,.11);padding:18px;min-height:156px;position:relative;overflow:hidden;color:var(--cardText);transition:transform .18s ease,box-shadow .18s ease;user-select:none}
      .live-card:hover{transform:translateY(-2px);box-shadow:0 16px 38px rgba(28,58,91,.15)}.live-card.dragging{opacity:.58;transform:scale(.985)}.live-card.drag-target{outline:3px solid #0ea5e9;outline-offset:2px}
      .live-card[data-theme="sky"]{--cardA:#0d6ca4;--cardB:#14a2c0;--cardText:#fff;--cardMeta:#e8fbff}.live-card[data-theme="navy"]{--cardA:#063f72;--cardB:#0b5f9b;--cardText:#fff;--cardMeta:#dceeff}.live-card[data-theme="indigo"]{--cardA:#3730a3;--cardB:#6366f1;--cardText:#fff;--cardMeta:#eef2ff}.live-card[data-theme="violet"]{--cardA:#6d28d9;--cardB:#8b5cf6;--cardText:#fff;--cardMeta:#f3e8ff}.live-card[data-theme="teal"]{--cardA:#0f766e;--cardB:#14b8a6;--cardText:#fff;--cardMeta:#ecfeff}.live-card[data-theme="amber"]{--cardA:#b45309;--cardB:#f59e0b;--cardText:#fff;--cardMeta:#fffbeb}.live-card[data-theme="rose"]{--cardA:#9f1239;--cardB:#e11d48;--cardText:#fff;--cardMeta:#fff1f2}.live-card[data-theme="orange"]{--cardA:#c2410c;--cardB:#f97316;--cardText:#fff;--cardMeta:#fff7ed}.live-card[data-theme="green"]{--cardA:#166534;--cardB:#22c55e;--cardText:#fff;--cardMeta:#f0fdf4}.live-card[data-theme="red"]{--cardA:#991b1b;--cardB:#dc2626;--cardText:#fff;--cardMeta:#fef2f2}.live-card[data-theme="slate"]{--cardA:#334155;--cardB:#64748b;--cardText:#fff;--cardMeta:#f1f5f9}.live-card[data-theme="white"]{--cardA:#fff;--cardB:#f8fafc;--cardText:#123f68;--cardMeta:#64748b}
      .live-card h3{margin:0;color:var(--cardText);font-size:15px;padding-right:48px}.live-card .metric{font-size:38px;line-height:1;font-weight:900;color:var(--cardText);margin-top:13px}.live-card .meta{color:var(--cardMeta);font-size:12px;margin-top:9px}.live-card .badge{display:inline-flex;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.2);color:var(--cardText);font-size:10px;font-weight:900;margin-top:9px;border:1px solid rgba(255,255,255,.18)}
      .live-card[data-size="wide"],.live-card[data-size="half"]{grid-column:span 6}.live-card[data-size="third"]{grid-column:span 4}.live-card[data-size="full"]{grid-column:1/-1}
      .card-drag-handle{position:absolute;right:10px;top:9px;border:0;background:rgba(255,255,255,.18);color:var(--cardText);border-radius:9px;width:30px;height:30px;display:grid;place-items:center;font-weight:900;cursor:grab;touch-action:none}.card-drag-handle:active{cursor:grabbing}.card-edit-hint{position:absolute;right:10px;bottom:8px;color:var(--cardMeta);font-size:9px;opacity:.72}
      .weather-icon{position:absolute;right:52px;top:14px;font-size:54px}.people-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.people-stat{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:11px}.people-stat strong{display:block;font-size:28px;line-height:1}.people-stat span{font-size:10px;color:var(--cardMeta)}
      .digital-clock{font-size:clamp(34px,6vw,58px);font-weight:900;letter-spacing:-2px;margin-top:10px}.clock-date{font-size:13px;color:var(--cardMeta);margin-top:4px}.clock-seconds{font-size:.48em;opacity:.72;margin-left:4px}
      .widget-list{display:grid;gap:8px;margin-top:12px}.widget-list-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 0;border-top:1px solid rgba(255,255,255,.18)}.widget-list-row:first-child{border-top:0}.widget-list-row small{color:var(--cardMeta)}
      .widget-btn{border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.16);color:var(--cardText);border-radius:10px;padding:7px 10px;font-weight:800;font-size:11px;cursor:pointer}.widget-btn:hover{background:rgba(255,255,255,.26)}
      .activity-list{display:grid;gap:10px;margin-top:12px}.activity-row{display:flex;justify-content:space-between;gap:14px;border-top:1px solid rgba(255,255,255,.18);padding-top:9px}.activity-row:first-child{border-top:0;padding-top:0}.activity-row strong{color:var(--cardText)}.activity-row span{color:var(--cardMeta);font-size:12px;text-align:right}
      .edge-drawer{position:fixed;top:118px;bottom:18px;width:min(292px,82vw);background:#fff;z-index:1840;box-shadow:0 14px 40px rgba(15,35,55,.22);transition:transform .26s ease;border-radius:16px;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;padding:18px}.edge-drawer.left{left:6px;transform:translateX(calc(-100% - 10px))}.edge-drawer.right{right:6px;transform:translateX(calc(100% + 10px))}.edge-drawer.open{transform:translateX(0)}.edge-drawer h3{color:#0b4c82;margin:0 0 6px}.edge-drawer p{color:#6b7b89;font-size:12px}
      .edge-toggle{position:fixed;z-index:1855;width:28px;height:40px;border:0;background:#0b5c9b;color:#fff;box-shadow:0 5px 16px rgba(0,75,141,.22);font-size:18px;font-weight:900;display:grid;place-items:center;top:52%;transform:translateY(-50%);padding:0}.edge-toggle.left{left:0;border-radius:0 9px 9px 0}.edge-toggle.right{right:0;border-radius:9px 0 0 9px}.edge-toggle.open.left{left:298px}.edge-toggle.open.right{right:298px}.edge-toggle span{transition:transform .25s}.edge-toggle.open span{transform:rotate(180deg)}
      body .taskbar-toggle{display:none!important}.grid{grid-template-columns:minmax(0,1fr)!important;gap:0!important}.sidebar{display:none!important}
      .quick-action{display:block;text-decoration:none;border:1px solid #dce8f2;border-radius:12px;padding:10px;margin-top:9px;background:#f8fbfe;font-weight:800;color:#124b75;font-size:12px}.quick-action small{display:block;color:#758596;font-weight:600;margin-top:2px}
      .dashboard-context-menu{position:fixed;z-index:25000;background:#fff;border:1px solid #d8e2ec;border-radius:12px;box-shadow:0 18px 50px rgba(15,35,55,.24);padding:7px;min-width:180px}.dashboard-context-menu button{width:100%;text-align:left;border:0;background:#fff;padding:9px 10px;border-radius:8px;font-weight:750;color:#163b5e}.dashboard-context-menu button:hover{background:#eef6ff}
      .dashboard-editor-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:26000;display:grid;place-items:center;padding:16px}.dashboard-editor{width:min(520px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.3)}.dashboard-editor h2{color:#0b4c82;margin:0 0 12px}.dashboard-editor label{display:block;font-weight:800;font-size:12px;color:#45617a;margin-top:12px}.dashboard-editor input,.dashboard-editor select{width:100%;padding:10px;border:1px solid #cfdbe7;border-radius:10px;margin-top:5px}.editor-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:18px}.editor-actions button{border:0;border-radius:10px;padding:9px 13px;font-weight:800}.editor-actions .primary{background:#0b5c9b;color:#fff}
      .quick-form{display:grid;gap:8px;margin-top:10px}.quick-form input{width:100%;padding:8px;border:1px solid rgba(255,255,255,.3);border-radius:9px;background:rgba(255,255,255,.14);color:var(--cardText)}.quick-form input::placeholder{color:var(--cardMeta)}
      .dashboard-page-dots{position:sticky;bottom:12px;display:flex;justify-content:center;gap:6px;pointer-events:none;z-index:20;margin:14px 0}.dashboard-page-dots span{width:8px;height:8px;border-radius:50%;background:#94a3b8;opacity:.45}.dashboard-page-dots span.active{background:#0b5c9b;opacity:1}
      @media(max-width:900px){.live-card[data-size="wide"],.live-card[data-size="half"],.live-card[data-size="third"]{grid-column:1/-1}.admin-command-hero{padding:21px}.live-card .metric{font-size:33px}.people-strip{grid-template-columns:1fr 1fr 1fr}.edge-drawer{top:104px;bottom:10px;width:min(278px,80vw)}.edge-toggle.open.left{left:min(278px,80vw)}.edge-toggle.open.right{right:min(278px,80vw)}.dashboard-slide{min-height:auto}.card-edit-hint{display:none}}
    `;
    document.head.appendChild(style);
  }

  function weatherIcon(code) {
    if (code === 0) return '☀️'; if ([1,2].includes(code)) return '🌤️'; if (code === 3) return '☁️';
    if ([45,48].includes(code)) return '🌫️'; if ([51,53,55,61,63,65,80,81,82].includes(code)) return '🌧️';
    if ([71,73,75,77,85,86].includes(code)) return '❄️'; if ([95,96,99].includes(code)) return '⛈️'; return '🌤️';
  }

  async function loadWeather() {
    try {
      const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=39.7589&longitude=-84.1916&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York', { cache:'no-store' });
      const data = await response.json(); state.weather = data.current || {};
    } catch { state.weather = { unavailable:true }; }
    renderWidgets();
  }

  async function loadDashboardData() {
    setSystemState('Connecting');
    try {
      const [dashboard, applications, openings] = await Promise.all([
        api('/api/admin/dashboard').catch(() => ({})), api('/api/admin/applications?limit=200').catch(() => []), api('/api/admin/job-openings').catch(() => []),
      ]);
      state.dashboard = dashboard || {};
      state.applications = Array.isArray(applications) ? applications : applications?.items || [];
      state.openings = Array.isArray(openings) ? openings : openings?.items || [];
      setSystemState('Live');
    } catch (error) { state.dashboard.error = error.message; setSystemState('Limited'); }
    renderWidgets();
  }

  function setSystemState(value) { if ($('liveSystemState')) $('liveSystemState').textContent = value; }
  function activeApps() { return state.applications.filter((item) => !['ARCHIVED','REJECTED','WITHDRAWN','TERMINATED'].includes(String(item.workflowStatus || item.status || '').toUpperCase())); }
  function publishedJobs() { return state.openings.filter((job) => String(job.status || '').toUpperCase() === 'PUBLISHED'); }
  function maybeDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }

  function derivedAppointments() {
    const candidates = [];
    state.applications.forEach((app) => {
      const raw = app.interviewStartAt || app.interviewAt || app.interviewDate || app.scheduledInterviewAt || app.interviewScheduledAt;
      const date = maybeDate(raw);
      if (date && date.getTime() > Date.now() - 3600000) candidates.push({ id:`app-${app.id}`, title:`Interview · ${[app.firstName,app.lastName].filter(Boolean).join(' ') || 'Applicant'}`, at:date.toISOString(), source:'Hiring' });
    });
    return [...state.appointments, ...candidates].sort((a,b) => new Date(a.at) - new Date(b.at)).slice(0,6);
  }

  function widgetContent(widget) {
    const d = state.dashboard || {};
    if (widget.type === 'weather') {
      const w = state.weather || {}; const temp = Number.isFinite(w.temperature_2m) ? `${Math.round(w.temperature_2m)}°F` : '—';
      const detail = w.unavailable ? 'Dayton weather temporarily unavailable' : `Feels like ${Math.round(w.apparent_temperature ?? w.temperature_2m ?? 0)}° · Wind ${Math.round(w.wind_speed_10m ?? 0)} mph · Dayton, Ohio`;
      return `<div class="weather-icon">${weatherIcon(w.weather_code)}</div><div class="metric">${temp}</div><div class="meta">${esc(detail)}</div><span class="badge">Live weather</span>`;
    }
    if (widget.type === 'people') {
      return `<div class="people-strip"><div class="people-stat"><strong>${esc(d.staff ?? d.employees ?? '—')}</strong><span>ACTIVE EMPLOYEES</span></div><div class="people-stat"><strong>${activeApps().length}</strong><span>ACTIVE APPLICANTS</span></div><div class="people-stat"><strong>${publishedJobs().length}</strong><span>JOB OPENINGS</span></div></div><div class="meta">A combined live view of workforce and recruiting.</div>`;
    }
    if (widget.type === 'clock') return `<div class="digital-clock" id="liveClockValue">--:--<span class="clock-seconds">--</span></div><div class="clock-date" id="liveClockDate"></div><span class="badge">America/New_York</span>`;
    if (widget.type === 'clocked') return `<div class="metric">${esc(d.clockedIn ?? '—')}</div><div class="meta">Current Time & Attendance presence</div><span class="badge">Operations</span>`;
    if (widget.type === 'documents') return `<div class="metric">${esc(d.pendingDocs ?? '—')}</div><div class="meta">Items awaiting completion or review</div><span class="badge">Compliance</span>`;
    if (widget.type === 'incidents') return `<div class="metric">${esc(d.openIncidents ?? '—')}</div><div class="meta">Health & Safety items currently open</div><span class="badge">Safety</span>`;
    if (widget.type === 'credentials') return `<div class="metric">${esc(d.expiringCredentials ?? '—')}</div><div class="meta">Credentials approaching renewal</div><span class="badge">Credentials</span>`;
    if (widget.type === 'appointments') {
      const items = derivedAppointments();
      const rows = items.length ? items.slice(0,3).map((item) => `<div class="widget-list-row"><div><strong>${esc(item.title)}</strong><br><small>${esc(new Date(item.at).toLocaleString())}</small></div>${item.source==='Local'?`<button class="widget-btn" data-delete-appointment="${esc(item.id)}">×</button>`:''}</div>`).join('') : '<div class="meta">No upcoming appointments.</div>';
      return `${rows}<form class="quick-form" data-appointment-form><input name="title" required placeholder="New appointment"><input name="at" required type="datetime-local"><button class="widget-btn" type="submit">Add appointment</button></form>`;
    }
    if (widget.type === 'reminders') {
      const rows = state.reminders.length ? state.reminders.slice(0,4).map((item) => `<div class="widget-list-row"><div><strong>${esc(item.text)}</strong>${item.due?`<br><small>${esc(new Date(item.due).toLocaleString())}</small>`:''}</div><button class="widget-btn" data-delete-reminder="${esc(item.id)}">Done</button></div>`).join('') : '<div class="meta">No reminders yet.</div>';
      return `${rows}<form class="quick-form" data-reminder-form><input name="text" required placeholder="Add reminder"><input name="due" type="datetime-local"><button class="widget-btn" type="submit">Add reminder</button></form>`;
    }
    if (widget.type === 'alarms') {
      const active = state.alarms.filter((item) => !item.dismissed).sort((a,b) => new Date(a.at)-new Date(b.at));
      const rows = active.length ? active.slice(0,4).map((item) => `<div class="widget-list-row"><div><strong>${esc(item.label || 'Alarm')}</strong><br><small>${esc(new Date(item.at).toLocaleString())}</small></div><button class="widget-btn" data-delete-alarm="${esc(item.id)}">×</button></div>`).join('') : '<div class="meta">No alarms set.</div>';
      return `${rows}<form class="quick-form" data-alarm-form><input name="label" placeholder="Alarm label"><input name="at" required type="datetime-local"><button class="widget-btn" type="submit">Set alarm</button></form>`;
    }
    if (widget.type === 'activity') {
      const apps = activeApps(), jobs = publishedJobs(); const rows = [];
      if (apps[0]) rows.push(`<div class="activity-row"><strong>Newest applicant</strong><span>${esc([apps[0].firstName,apps[0].lastName].filter(Boolean).join(' ') || 'Applicant')} · ${esc(apps[0].jobTitle || apps[0].appliedRole || '')}</span></div>`);
      if (jobs[0]) rows.push(`<div class="activity-row"><strong>Hiring now</strong><span>${esc(jobs[0].title || 'Open position')}</span></div>`);
      rows.push(`<div class="activity-row"><strong>Platform</strong><span>${d.since ? `Metrics since ${esc(new Date(d.since).toLocaleDateString())}` : 'Connected to Railway production data'}</span></div>`);
      return `<div class="activity-list">${rows.join('')}</div>`;
    }
    return '<div class="meta">Widget source unavailable.</div>';
  }

  function renderDashboard() {
    const host = $('module-dashboard'); if (!host) return;
    host.classList.add('admin-live-dashboard');
    host.innerHTML = `<section class="admin-command-hero"><div><span class="pulse-dot"></span><strong id="liveSystemState">Connecting</strong></div><h1>Sulandra Health Command Center</h1><p>Your customizable live company workspace. Hold the ⋮⋮ handle to move widgets. Right-click a card (or use Edit on mobile) to change what it displays.</p></section><div id="dashboardWidgetHost"></div><div class="dashboard-page-dots" id="dashboardPageDots"><span class="active"></span><span></span><span></span></div>`;
    renderWidgets();
  }

  function renderWidgets() {
    const host = $('dashboardWidgetHost'); if (!host) return;
    const groups = [
      { title:'Overview', note:'Live conditions, workforce and time', ids:['weather','people','clock','appointments'] },
      { title:'Operations & Compliance', note:'Current items that may need attention', ids:['clocked','documents','incidents','credentials'] },
      { title:'My Command Desk', note:'Personal reminders, alarms and company activity', ids:['reminders','alarms','activity'] },
    ];
    const order = new Map(state.widgets.map((w,i)=>[w.id,i]));
    host.innerHTML = groups.map((group, index) => {
      const widgets = state.widgets.filter((w) => group.ids.includes(w.id) && !w.hidden).sort((a,b)=>(order.get(a.id)??0)-(order.get(b.id)??0));
      return `<section class="dashboard-slide" data-dashboard-slide="${index}"><div class="dashboard-slide-head"><div><h2>${group.title}</h2><p>${group.note}</p></div><span class="badge">${index+1} / ${groups.length}</span></div><div class="admin-live-grid" data-slide="${index===0?'overview':index}" data-widget-grid>${widgets.map(renderCard).join('')}</div></section>`;
    }).join('');
    bindWidgetInteractions(); updateClock();
  }

  function renderCard(widget) {
    return `<article class="live-card" data-widget-id="${esc(widget.id)}" data-theme="${esc(widget.theme||'white')}" data-size="${esc(widget.size||'third')}" tabindex="0"><button class="card-drag-handle" type="button" aria-label="Hold and drag ${esc(widget.title)}">⋮⋮</button><h3>${esc(widget.title)}</h3>${widgetContent(widget)}<span class="card-edit-hint">Right-click to edit</span></article>`;
  }

  function bindWidgetInteractions() {
    document.querySelectorAll('.live-card').forEach((card) => {
      card.addEventListener('contextmenu', (event) => { event.preventDefault(); showContextMenu(card.dataset.widgetId, event.clientX, event.clientY); });
    });
    document.querySelectorAll('[data-reminder-form]').forEach((form) => form.addEventListener('submit', addReminder));
    document.querySelectorAll('[data-alarm-form]').forEach((form) => form.addEventListener('submit', addAlarm));
    document.querySelectorAll('[data-appointment-form]').forEach((form) => form.addEventListener('submit', addAppointment));
    document.querySelectorAll('[data-delete-reminder]').forEach((button) => button.addEventListener('click', () => { state.reminders = state.reminders.filter((x)=>x.id!==button.dataset.deleteReminder); saveJson(REMINDERS_KEY,state.reminders); renderWidgets(); }));
    document.querySelectorAll('[data-delete-alarm]').forEach((button) => button.addEventListener('click', () => { state.alarms = state.alarms.filter((x)=>x.id!==button.dataset.deleteAlarm); saveJson(ALARMS_KEY,state.alarms); renderWidgets(); }));
    document.querySelectorAll('[data-delete-appointment]').forEach((button) => button.addEventListener('click', () => { state.appointments = state.appointments.filter((x)=>x.id!==button.dataset.deleteAppointment); saveJson(APPOINTMENTS_KEY,state.appointments); renderWidgets(); }));
    installHoldDrag();
  }

  function addReminder(event) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const text=String(data.get('text')||'').trim(); if(!text)return;
    state.reminders.unshift({id:crypto.randomUUID(),text,due:String(data.get('due')||'')}); saveJson(REMINDERS_KEY,state.reminders); renderWidgets();
  }
  function addAlarm(event) {
    event.preventDefault(); const data=new FormData(event.currentTarget); const at=String(data.get('at')||''); if(!at)return;
    state.alarms.push({id:crypto.randomUUID(),label:String(data.get('label')||'Alarm').trim()||'Alarm',at:new Date(at).toISOString(),dismissed:false,fired:false}); saveJson(ALARMS_KEY,state.alarms); renderWidgets();
  }
  function addAppointment(event) {
    event.preventDefault(); const data=new FormData(event.currentTarget); const title=String(data.get('title')||'').trim(); const at=String(data.get('at')||''); if(!title||!at)return;
    state.appointments.push({id:crypto.randomUUID(),title,at:new Date(at).toISOString(),source:'Local'}); saveJson(APPOINTMENTS_KEY,state.appointments); renderWidgets();
  }

  function installHoldDrag() {
    document.querySelectorAll('.card-drag-handle').forEach((handle) => {
      let timer=null, active=false, card=null;
      const start=(event)=>{ card=handle.closest('.live-card'); timer=setTimeout(()=>{ active=true; card.classList.add('dragging'); try{handle.setPointerCapture(event.pointerId)}catch{} },280); };
      const move=(event)=>{ if(!active)return; event.preventDefault(); const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.live-card'); if(!target||target===card)return; document.querySelectorAll('.drag-target').forEach((n)=>n.classList.remove('drag-target')); target.classList.add('drag-target'); const grid=target.parentElement; if(grid===card.parentElement){ const rect=target.getBoundingClientRect(); grid.insertBefore(card,event.clientY<rect.top+rect.height/2?target:target.nextSibling); } };
      const end=()=>{ clearTimeout(timer); if(!active)return; active=false; card?.classList.remove('dragging'); document.querySelectorAll('.drag-target').forEach((n)=>n.classList.remove('drag-target')); persistVisibleOrder(); };
      handle.addEventListener('pointerdown',start); handle.addEventListener('pointermove',move,{passive:false}); handle.addEventListener('pointerup',end); handle.addEventListener('pointercancel',end);
    });
  }
  function persistVisibleOrder() {
    const visible=[...document.querySelectorAll('.live-card[data-widget-id]')].map((card)=>card.dataset.widgetId); const lookup=new Map(state.widgets.map((w)=>[w.id,w]));
    state.widgets=[...visible.map((id)=>lookup.get(id)).filter(Boolean),...state.widgets.filter((w)=>!visible.includes(w.id))]; saveJson(WIDGETS_KEY,state.widgets);
  }

  function showContextMenu(widgetId,x,y) {
    document.querySelector('.dashboard-context-menu')?.remove(); const menu=document.createElement('div'); menu.className='dashboard-context-menu'; menu.style.left=`${Math.min(x,innerWidth-205)}px`; menu.style.top=`${Math.min(y,innerHeight-160)}px`;
    menu.innerHTML='<button data-edit-widget>Edit widget…</button><button data-move-first>Move to top</button><button data-hide-widget>Hide widget</button>';
    document.body.appendChild(menu); const close=()=>menu.remove(); setTimeout(()=>document.addEventListener('click',close,{once:true}),0);
    menu.querySelector('[data-edit-widget]').onclick=(e)=>{e.stopPropagation();close();openWidgetEditor(widgetId)};
    menu.querySelector('[data-move-first]').onclick=(e)=>{e.stopPropagation();close();const i=state.widgets.findIndex(w=>w.id===widgetId);if(i>0){const[w]=state.widgets.splice(i,1);state.widgets.unshift(w);saveJson(WIDGETS_KEY,state.widgets);renderWidgets()}};
    menu.querySelector('[data-hide-widget]').onclick=(e)=>{e.stopPropagation();close();const w=state.widgets.find(w=>w.id===widgetId);if(w){w.hidden=true;saveJson(WIDGETS_KEY,state.widgets);renderWidgets()}};
  }

  function openWidgetEditor(widgetId) {
    const widget=state.widgets.find((w)=>w.id===widgetId); if(!widget)return;
    const backdrop=document.createElement('div'); backdrop.className='dashboard-editor-backdrop';
    backdrop.innerHTML=`<form class="dashboard-editor"><h2>Edit Dashboard Widget</h2><label>Widget title<input name="title" value="${esc(widget.title)}" maxlength="60"></label><label>Display source<select name="type">${['weather','people','clock','appointments','clocked','documents','incidents','credentials','reminders','alarms','activity'].map((type)=>`<option value="${type}" ${type===widget.type?'selected':''}>${type.replaceAll('_',' ')}</option>`).join('')}</select></label><label>Card color<select name="theme">${['sky','navy','indigo','violet','teal','amber','rose','orange','green','red','slate','white'].map((theme)=>`<option value="${theme}" ${theme===widget.theme?'selected':''}>${theme}</option>`).join('')}</select></label><label>Card width<select name="size"><option value="third" ${widget.size==='third'?'selected':''}>One third</option><option value="half" ${widget.size==='half'?'selected':''}>Half</option><option value="wide" ${widget.size==='wide'?'selected':''}>Wide</option><option value="full" ${widget.size==='full'?'selected':''}>Full row</option></select></label><div class="editor-actions"><button type="button" data-reset>Reset layout</button><button type="button" data-cancel>Cancel</button><button class="primary" type="submit">Save widget</button></div></form>`;
    document.body.appendChild(backdrop); const form=backdrop.querySelector('form'); backdrop.querySelector('[data-cancel]').onclick=()=>backdrop.remove(); backdrop.addEventListener('click',(e)=>{if(e.target===backdrop)backdrop.remove()});
    backdrop.querySelector('[data-reset]').onclick=()=>{state.widgets=defaultWidgets.map((x)=>({...x}));saveJson(WIDGETS_KEY,state.widgets);backdrop.remove();renderWidgets()};
    form.onsubmit=(e)=>{e.preventDefault();const data=new FormData(form);widget.title=String(data.get('title')||widget.title);widget.type=String(data.get('type')||widget.type);widget.theme=String(data.get('theme')||widget.theme);widget.size=String(data.get('size')||widget.size);widget.hidden=false;saveJson(WIDGETS_KEY,state.widgets);backdrop.remove();renderWidgets()};
  }

  function updateClock() {
    const now=new Date(); const time=$('liveClockValue'), date=$('liveClockDate');
    if(time){const parts=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit'}).formatToParts(now);const hh=parts.find(p=>p.type==='hour')?.value||'';const mm=parts.find(p=>p.type==='minute')?.value||'';const ss=parts.find(p=>p.type==='second')?.value||'';const dp=parts.find(p=>p.type==='dayPeriod')?.value||'';time.innerHTML=`${hh}:${mm}<span class="clock-seconds">:${ss} ${dp}</span>`} if(date)date.textContent=now.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  }

  function checkAlarms() {
    const now=Date.now(); let changed=false;
    state.alarms.forEach((alarm)=>{ if(!alarm.fired&&!alarm.dismissed&&new Date(alarm.at).getTime()<=now){alarm.fired=true;changed=true;fireAlarm(alarm)} });
    if(changed){saveJson(ALARMS_KEY,state.alarms);renderWidgets()}
  }
  function fireAlarm(alarm) {
    try { const Ctx=window.AudioContext||window.webkitAudioContext; const ctx=new Ctx(); const osc=ctx.createOscillator(), gain=ctx.createGain(); osc.connect(gain);gain.connect(ctx.destination);osc.frequency.value=880;gain.gain.value=.08;osc.start();osc.stop(ctx.currentTime+.7); } catch {}
    alert(`⏰ ${alarm.label}\n${new Date(alarm.at).toLocaleString()}`);
  }

  function installEdgeDrawers() {
    document.querySelector('#leftOperationsPanel')?.remove();document.querySelector('#leftOperationsToggle')?.remove();document.querySelector('#rightOperationsPanel')?.remove();document.querySelector('#rightOperationsToggle')?.remove();
    const left=document.createElement('aside');left.id='leftOperationsPanel';left.className='edge-drawer left';
    const originalSidebar=document.querySelector('.sidebar');left.innerHTML=originalSidebar?originalSidebar.innerHTML:`<h3>Operations</h3><a class="quick-action" href="#dashboard">Dashboard</a>`;
    const right=document.createElement('aside');right.id='rightOperationsPanel';right.className='edge-drawer right';const session=readSession();right.innerHTML=`<h3>Quick Operations</h3><p>${esc(session.displayName||session.fullName||session.email||'Sulandra Health administrator')}</p><a class="quick-action" href="intranet-control.html">Manage Intranet Content<small>Hero slides, news, messages, images and timing</small></a><a class="quick-action" href="time-attendance.html#admin">Time & Attendance<small>Scheduling, corrections, GPS and payroll-period review</small></a><a class="quick-action" href="spire.html">Open Spire<small>Clinical and client record application</small></a><a class="quick-action" href="employee-portal.html">Employee Portal<small>Employee-facing workspace</small></a><a class="quick-action" href="intranet.html">Intranet Portal<small>Live company intranet</small></a>`;
    const makeToggle=(side)=>{const b=document.createElement('button');b.className=`edge-toggle ${side}`;b.id=side==='left'?'leftOperationsToggle':'rightOperationsToggle';b.innerHTML=`<span>${side==='left'?'›':'‹'}</span>`;b.setAttribute('aria-label',`Toggle ${side} operations drawer`);return b};
    const lt=makeToggle('left'),rt=makeToggle('right');document.body.append(left,right,lt,rt);
    const wire=(panel,button,key)=>{const apply=(open)=>{panel.classList.toggle('open',open);button.classList.toggle('open',open);button.setAttribute('aria-expanded',String(open));localStorage.setItem(key,String(open))};button.onclick=()=>apply(!panel.classList.contains('open'));apply(localStorage.getItem(key)==='true')};wire(left,lt,LEFT_PANEL_KEY);wire(right,rt,RIGHT_PANEL_KEY);
    left.querySelectorAll('[data-module]').forEach((node)=>node.addEventListener('click',()=>{const key=node.dataset.module;if(key){localStorage.setItem(ACTIVE_MODULE_KEY,key);location.hash=key;setTimeout(()=>{left.classList.remove('open');lt.classList.remove('open');localStorage.setItem(LEFT_PANEL_KEY,'false')},80)}}));
  }

  function installModulePersistence() {
    const valid=new Set([...document.querySelectorAll('#topModuleNav [data-module],#sideModuleNav [data-module]')].map((n)=>n.dataset.module).filter(Boolean));
    const activate=(key,writeHash=true)=>{if(!valid.has(key))key='dashboard';document.querySelectorAll('#topModuleNav [data-module],#sideModuleNav [data-module]').forEach((n)=>n.classList.toggle('active',n.dataset.module===key));document.querySelectorAll('.module').forEach((n)=>n.classList.toggle('active',n.id===`module-${key}`));localStorage.setItem(ACTIVE_MODULE_KEY,key);if(writeHash&&location.hash!==`#${key}`)history.replaceState(null,'',`${location.pathname}${location.search}#${key}`)};
    document.querySelectorAll('#topModuleNav [data-module],#sideModuleNav [data-module]').forEach((node)=>node.addEventListener('click',()=>activate(node.dataset.module)));
    window.addEventListener('hashchange',()=>activate(location.hash.slice(1),false));
    const initial=location.hash.slice(1)||localStorage.getItem(ACTIVE_MODULE_KEY)||'dashboard';requestAnimationFrame(()=>activate(initial,false));
  }

  function installSlideObserver() {
    const dots=[...document.querySelectorAll('#dashboardPageDots span')]; const slides=[...document.querySelectorAll('[data-dashboard-slide]')]; if(!('IntersectionObserver'in window)||!dots.length)return;
    const obs=new IntersectionObserver((entries)=>{entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio).slice(0,1).forEach((entry)=>{const i=Number(entry.target.dataset.dashboardSlide||0);dots.forEach((d,n)=>d.classList.toggle('active',n===i))})},{threshold:[.35,.55]});slides.forEach((s)=>obs.observe(s));
  }

  function initialize() {
    installStyles(); renderDashboard(); installEdgeDrawers(); installModulePersistence(); installSlideObserver();
    loadWeather(); loadDashboardData();
    setInterval(updateClock,1000); setInterval(checkAlarms,1000); setInterval(loadDashboardData,60000); setInterval(loadWeather,10*60*1000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
