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

console.log('Manage Intranet Content moved to the left Operations menu; Scheduling is hard-routed to /scheduling.html and separated from Time & Attendance.');
