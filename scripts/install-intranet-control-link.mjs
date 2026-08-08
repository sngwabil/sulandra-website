import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const adminPath = path.join(dist, 'admin.html');
let html = await readFile(adminPath, 'utf8');

// Remove the old floating bottom-right control completely.
html = html.replace(/\s*<a id="intranet-content-control-link"[\s\S]*?<\/a>\s*/g, '\n');

// Put the same Intranet Content Control inside the existing left Operations menu.
const control = '<a id="intranet-content-control-link" href="/intranet-control.html" class="side-btn"><span>Manage Intranet Content</span><small>Publishing</small></a>';
if (!html.includes('id="sideModuleNav"')) {
  throw new Error('Unable to locate Admin left navigation for Intranet Content Control.');
}
html = html.replace(/(<[^>]+id="sideModuleNav"[^>]*>)/i, `$1\n${control}`);
if (!html.includes('href="/intranet-control.html"')) {
  throw new Error('Unable to expose Intranet Content Control in the left Operations menu.');
}

// Scheduling is a separate application. Convert both Admin controls into explicit
// links/actions so admin-railway.js never treats Scheduling as a local module.
html = html
  .replace(
    /<a\s+data-module=["']scheduling["']\s*>\s*Scheduling\s*<\/a>/gi,
    '<a href="/scheduling.html" data-sulandra-scheduling-link="true">Scheduling</a>',
  )
  .replace(
    /<button([^>]*?)data-module=["']scheduling["']([^>]*)>\s*Scheduling([\s\S]*?)<\/button>/gi,
    "<button$1data-sulandra-scheduling-link=\"true\"$2 onclick=\"window.location.assign('/scheduling.html')\">Scheduling$3</button>",
  );

// Highest-priority navigation guard. Window capture runs before document-level
// Admin and Time & Attendance listeners.
const schedulingGuardId = 'sulandra-dedicated-scheduling-route';
html = html.replace(new RegExp(`\\s*<script id="${schedulingGuardId}">[\\s\\S]*?<\\/script>\\s*`, 'g'), '\n');
const schedulingGuard = `\n<script id="${schedulingGuardId}">\n(() => {\n  const target = '/scheduling.html';\n  window.addEventListener('click', (event) => {\n    const control = event.target?.closest?.('[data-sulandra-scheduling-link="true"], [data-module="scheduling"]');\n    if (!control) return;\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    window.location.assign(target);\n  }, true);\n})();\n</script>\n`;
if (!html.includes('</body>')) throw new Error('Unable to install dedicated Scheduling route guard.');
html = html.replace('</body>', `${schedulingGuard}</body>`);
if (!html.includes('data-sulandra-scheduling-link="true"')) {
  throw new Error('Admin Scheduling controls were not converted to the dedicated Scheduling route.');
}
await writeFile(adminPath, html, 'utf8');

// Move the portal buttons removed from the top news ticker into the existing
// right-side slide-out drawer. Manage Intranet Content stays in the LEFT drawer.
const liveDashboardPath = path.join(dist, 'assets', 'admin-live-dashboard.js');
let liveDashboard = await readFile(liveDashboardPath, 'utf8');
const oldRightDrawer = "const right=document.createElement('aside');right.id='rightOperationsPanel';right.className='edge-drawer right';const session=readSession();right.innerHTML=`<h3>Quick Operations</h3><p>${esc(session.displayName||session.fullName||session.email||'Sulandra Health administrator')}</p><a class=\"quick-action\" href=\"intranet-control.html\">Manage Intranet Content<small>Hero slides, news, messages, images and timing</small></a><a class=\"quick-action\" href=\"time-attendance.html#admin\">Time & Attendance<small>Scheduling, corrections, GPS and payroll-period review</small></a><a class=\"quick-action\" href=\"spire.html\">Open Spire<small>Clinical and client record application</small></a><a class=\"quick-action\" href=\"employee-portal.html\">Employee Portal<small>Employee-facing workspace</small></a><a class=\"quick-action\" href=\"intranet.html\">Intranet Portal<small>Live company intranet</small></a>`;";
const newRightDrawer = "const right=document.createElement('aside');right.id='rightOperationsPanel';right.className='edge-drawer right';const session=readSession();right.innerHTML=`<h3>Platform Portals</h3><p>${esc(session.displayName||session.fullName||session.email||'Sulandra Health administrator')}</p><a class=\"quick-action\" href=\"/intranet.html\">Intranet Portal<small>Live company intranet</small></a><a class=\"quick-action\" href=\"/employee-portal.html\">Employee Portal<small>Employee-facing workspace</small></a><a class=\"quick-action\" href=\"/employee360.html\">Employee 360<small>Employee records, documents and management</small></a><a class=\"quick-action\" href=\"/education-portal.html\">Education Portal<small>Training, courses and learning assignments</small></a><a class=\"quick-action\" href=\"/spire.html\">Spire Clinical<small>Clinical and client record application</small></a><h3 style=\"margin-top:18px\">Quick Operations</h3><a class=\"quick-action\" href=\"/scheduling.html\">Scheduling<small>Workforce schedules by service location</small></a><a class=\"quick-action\" href=\"/time-attendance.html#admin\">Time & Attendance<small>Clock-ins, corrections, GPS and payroll-period review</small></a>`;";
if (!liveDashboard.includes(oldRightDrawer)) {
  throw new Error('Unable to locate the existing right Operations drawer for portal-button migration.');
}
liveDashboard = liveDashboard.replace(oldRightDrawer, newRightDrawer);
for (const portal of ['/intranet.html','/employee-portal.html','/employee360.html','/education-portal.html','/spire.html']) {
  if (!liveDashboard.includes(`href="${portal}"`)) throw new Error(`Right drawer is missing portal ${portal}`);
}

// Replace the large digital Live Clock widget with a real analog wall clock.
// The weather-card clock remains digital as requested.
const analogClockCss = `.wall-clock-layout{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:8px;min-height:145px}.wall-clock-face{width:146px;height:146px;border-radius:50%;position:relative;flex:0 0 146px;background:repeating-conic-gradient(from -1deg,rgba(255,255,255,.92) 0deg 1.8deg,transparent 1.8deg 30deg),radial-gradient(circle at 50% 45%,#fff 0 61%,#e8edf7 62% 66%,#cdd6e7 67% 70%,#f8fafc 71%);box-shadow:inset 0 0 0 5px rgba(255,255,255,.32),0 8px 20px rgba(15,23,42,.28);color:#172554}.wall-clock-number{position:absolute;font-size:12px;font-weight:950;line-height:1;transform:translate(-50%,-50%)}.wall-clock-number.n12{left:50%;top:11%}.wall-clock-number.n3{left:89%;top:50%}.wall-clock-number.n6{left:50%;top:89%}.wall-clock-number.n9{left:11%;top:50%}.wall-clock-hand{position:absolute;left:50%;bottom:50%;transform-origin:50% 100%;border-radius:999px;will-change:transform}.wall-clock-hour{width:5px;height:36px;margin-left:-2.5px;background:#172554}.wall-clock-minute{width:4px;height:50px;margin-left:-2px;background:#1e3a8a}.wall-clock-second{width:2px;height:57px;margin-left:-1px;background:#dc2626}.wall-clock-second:after{content:'';position:absolute;width:2px;height:15px;left:0;top:52px;background:#dc2626;border-radius:999px}.wall-clock-pin{position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.35)}.wall-clock-info{text-align:left;min-width:128px}.wall-clock-info .clock-date{font-size:13px;font-weight:800;color:var(--cardMeta);line-height:1.35;margin:0}.wall-clock-info .badge{margin-top:10px}@media(max-width:700px){.wall-clock-layout{gap:12px}.wall-clock-face{width:126px;height:126px;flex-basis:126px}.wall-clock-hour{height:31px}.wall-clock-minute{height:43px}.wall-clock-second{height:49px}.wall-clock-second:after{top:45px}}`;
liveDashboard = liveDashboard.replace(
  '.digital-clock{font-size:clamp(34px,6vw,58px);font-weight:900;letter-spacing:-2px;margin-top:10px}.clock-date{font-size:13px;color:var(--cardMeta);margin-top:4px}.clock-seconds{font-size:.48em;opacity:.72;margin-left:4px}',
  analogClockCss,
);

const oldClockMarkup = 'if (widget.type === \'clock\') return `<div class="digital-clock" id="liveClockValue">--:--<span class="clock-seconds">--</span></div><div class="clock-date" id="liveClockDate"></div><span class="badge">America/New_York</span>`;';
const newClockMarkup = 'if (widget.type === \'clock\') return `<div class="wall-clock-layout"><div class="wall-clock-face" role="img" aria-label="Live analog wall clock"><span class="wall-clock-number n12">12</span><span class="wall-clock-number n3">3</span><span class="wall-clock-number n6">6</span><span class="wall-clock-number n9">9</span><span class="wall-clock-hand wall-clock-hour" id="clockHourHand"></span><span class="wall-clock-hand wall-clock-minute" id="clockMinuteHand"></span><span class="wall-clock-hand wall-clock-second" id="clockSecondHand"></span><span class="wall-clock-pin"></span></div><div class="wall-clock-info"><div class="clock-date" id="liveClockDate"></div><span class="badge">America/New_York</span></div></div>`;';
if (!liveDashboard.includes(oldClockMarkup)) throw new Error('Unable to locate the current digital Live Clock widget.');
liveDashboard = liveDashboard.replace(oldClockMarkup, newClockMarkup);

liveDashboard = liveDashboard.replace(
  /  function updateClock\(\) \{[\s\S]*?\n  \}\n\n  function checkAlarms\(\) \{/,
  `  function updateClock() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone:'America/New_York', hour:'numeric', minute:'2-digit', second:'2-digit', hour12:false,
      weekday:'long', month:'long', day:'numeric', year:'numeric'
    }).formatToParts(now);
    const number = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    const hour = number('hour') % 12;
    const minute = number('minute');
    const second = number('second');
    const hourHand = $('clockHourHand');
    const minuteHand = $('clockMinuteHand');
    const secondHand = $('clockSecondHand');
    if (hourHand) hourHand.style.transform = \`rotate(\${hour * 30 + minute * .5}deg)\`;
    if (minuteHand) minuteHand.style.transform = \`rotate(\${minute * 6 + second * .1}deg)\`;
    if (secondHand) secondHand.style.transform = \`rotate(\${second * 6}deg)\`;
    const date = $('liveClockDate');
    if (date) date.textContent = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'long', month:'long', day:'numeric', year:'numeric' }).format(now);
  }

  function checkAlarms() {`,
);

for (const marker of ['wall-clock-face','clockHourHand','clockMinuteHand','clockSecondHand',"timeZone:'America/New_York'"]) {
  if (!liveDashboard.includes(marker)) throw new Error(`Analog Live Clock is missing ${marker}`);
}
if (liveDashboard.includes('id="liveClockValue"')) throw new Error('Digital Live Clock markup is still present.');
await writeFile(liveDashboardPath, liveDashboard, 'utf8');

// Move the existing full workforce scheduler from Time & Attendance to Scheduling.
const schedulerAssetPath = path.join(dist, 'assets', 'time-attendance-location-scheduler.js');
let scheduler = await readFile(schedulerAssetPath, 'utf8');
scheduler = scheduler
  .replace(
    "if (!/\\/time-attendance(?:\\.html|\\/)?$/i.test(location.pathname)) return;",
    "if (!/\\/scheduling(?:\\.html|\\/)?$/i.test(location.pathname)) return;",
  )
  .replace(
    "const admin = document.getElementById('admin');",
    "const admin = document.getElementById('schedulerHost') || document.getElementById('admin');",
  )
  .replace(
    'Time and Attendance · Staffing and Scheduling',
    'Sulandra Health · Workforce Scheduling',
  );
if (!scheduler.includes("document.getElementById('schedulerHost')")) {
  throw new Error('Unable to mount the workforce scheduler on scheduling.html.');
}
await writeFile(schedulerAssetPath, scheduler, 'utf8');

// Time & Attendance must not load or own the workforce scheduler module.
const attendancePath = path.join(dist, 'time-attendance.html');
let attendance = await readFile(attendancePath, 'utf8');
attendance = attendance.replace(/\s*<script src="\/assets\/time-attendance-location-scheduler\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
await writeFile(attendancePath, attendance, 'utf8');

console.log('Manage Intranet Content is in the left drawer; platform portal buttons are in the right drawer; Live Clock is an analog ticking wall clock; Scheduling remains separate from Time & Attendance.');
